#!/usr/bin/env python3
"""macOS local launcher. PID + creation time + command token protect process ownership."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime'
PHP = Path('/opt/homebrew/bin/php')
PG = Path('/opt/homebrew/opt/postgresql@18/bin')
REDIS = Path('/opt/homebrew/opt/redis@8.2/bin')
APPS = ['backend', 'queue', 'scheduler', 'frontend']
STOP_ORDER = ['frontend', 'backend', 'queue', 'scheduler']
SCRIPT = Path(__file__).resolve()
URLS = 'Frontend: http://localhost:3000\nBackend:  http://127.0.0.1:8000'

class LaunchError(Exception):
    pass

def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], capture_output=True, text=True, timeout=30, **kwargs)

def ensure_runtime():
    for path in [RUNTIME, RUNTIME / 'logs']:
        if path.is_symlink():
            raise LaunchError('Refusing a symlink runtime/log directory.')
        path.mkdir(mode=0o700, exist_ok=True)
        if path.stat().st_uid != os.getuid():
            raise LaunchError('Runtime directory must belong to the current user.')
        path.chmod(0o700)

def safe_open(path, flags):
    return os.open(path, flags | os.O_NOFOLLOW, 0o600)

def save(path, text):
    fd = safe_open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(text)

def paths(name):
    return RUNTIME / (name + '.pid'), RUNTIME / (name + '.json')

def identity(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return None
    except PermissionError:
        raise LaunchError('Cannot inspect process identity; PID files were not changed.')
    result = run(['/bin/ps', '-p', str(pid), '-o', 'lstart=', '-o', 'command='])
    if result.returncode and result.stderr.strip():
        raise LaunchError('Cannot inspect process identity; PID files were not changed. Run from a normal macOS terminal with process access.')
    line = result.stdout.strip()
    # ps lstart occupies five whitespace-separated fields; all command args follow.
    fields = line.split(None, 5)
    if result.returncode or len(fields) != 6:
        return None
    return {'born': ' '.join(fields[:5]), 'command': fields[5]}

def read_record(name):
    pidpath, meta = paths(name)
    if not pidpath.exists() and not meta.exists():
        return None, 'not managed'
    if pidpath.is_symlink() or meta.is_symlink():
        raise LaunchError('Refusing symlink PID/metadata files for ' + name)
    try:
        record = json.loads(meta.read_text())
        pid = int(pidpath.read_text().strip())
        if pid <= 1 or record['pid'] != pid:
            return None, 'stale PID files'
        current = identity(pid)
        if current is None or current['born'] != record['identity']['born']:
            return None, 'stale PID files (process missing or identity changed)'
        if name in APPS:
            if str(SCRIPT) not in current['command'] or record['token'] not in current['command'] or os.getpgid(pid) != pid:
                return None, 'stale PID files (ownership mismatch)'
        elif current['command'] != record['identity']['command'] or str(REDIS / 'redis-server') not in record['binary']:
            return None, 'stale Redis ownership record'
        return record, 'running'
    except (OSError, ValueError, KeyError, TypeError):
        return None, 'stale or invalid PID files'

def record_process(name, pid, token='', binary=''):
    current = identity(pid)
    deadline = time.monotonic() + 3
    while token and (current is None or token not in current['command']) and time.monotonic() < deadline:
        time.sleep(0.05)
        current = identity(pid)
    if current is None or (token and token not in current['command']):
        raise LaunchError(name + ' exited before its identity could be recorded.')
    record = {'pid': pid, 'identity': current, 'token': token, 'binary': binary}
    pidpath, meta = paths(name)
    save(meta, json.dumps(record))
    save(pidpath, str(pid) + '\n')
    return record

def clear_record(name):
    for path in paths(name):
        if path.is_symlink():
            raise LaunchError('Refusing symlink PID file for ' + name)
        path.unlink(missing_ok=True)

def log(name, message):
    # Only launcher-generated messages reach disk: no child stdout, stderr or environment.
    fd = safe_open(RUNTIME / 'logs' / (name + '.log'), os.O_WRONLY | os.O_CREAT | os.O_APPEND)
    with os.fdopen(fd, 'a') as stream:
        stream.write(time.strftime('%Y-%m-%d %H:%M:%S') + ' ' + message + '\n')

def listeners(port):
    result = run(['/usr/sbin/lsof', '-nP', '-iTCP:' + str(port), '-sTCP:LISTEN', '-t'])
    if result.returncode not in [0, 1]:
        raise LaunchError('Cannot inspect port ' + str(port))
    return {int(line) for line in result.stdout.splitlines() if line.isdigit()}

def service_loaded(name):
    return run(['launchctl', 'print', 'gui/' + str(os.getuid()) + '/local.iranti.redis.' + name]).returncode == 0

def service_pid(name):
    result = run(['launchctl', 'print', 'gui/' + str(os.getuid()) + '/local.iranti.redis.' + name])
    match = re.search(r'^\s*pid = (\d+)\s*$', result.stdout, re.M)
    return int(match.group(1)) if result.returncode == 0 and match else None

def helper(action, name):
    result = run([sys.executable, ROOT / 'scripts/native-redis.py', action, '--instance', name])
    if result.returncode:
        # Helper output contains only known service names/paths, never application input.
        raise LaunchError('Redis ' + name + ' ' + action + ' failed: ' + (result.stderr.strip() or result.stdout.strip()))
    print(result.stdout.strip())

def wait_for(check, description, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.25)
    raise LaunchError(description + ' unavailable after ' + str(seconds) + ' seconds.')

def redis_ready(port):
    return (REDIS / 'redis-cli').exists() and run([REDIS / 'redis-cli', '-h', '127.0.0.1', '-p', port, 'ping']).stdout.strip() == 'PONG'

def pg_ready():
    return (PG / 'pg_isready').exists() and run([PG / 'pg_isready', '-h', '127.0.0.1', '-p', '5432']).returncode == 0

def http_ready(port):
    try:
        with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/v1/health', timeout=2) as response:
            return response.status == 200
    except Exception:
        return False

def owned_http_ready(name, port, strict=True):
    record, _ = read_record(name)
    if record is None:
        return False
    pids = listeners(port)
    try:
        foreign = any(os.getpgid(pid) != record['pid'] for pid in pids)
    except ProcessLookupError:
        return False
    if foreign:
        if strict:
            raise LaunchError('Port ' + str(port) + ' was occupied by another process during startup.')
        return False
    return bool(pids) and http_ready(port)

def preflight():
    for path in ['backend/artisan', 'frontend/package.json', 'scripts/serve-backend.sh', 'scripts/native-redis.py']:
        if not (ROOT / path).is_file():
            raise LaunchError('Invalid project root: missing ' + path)
    if sys.platform != 'darwin':
        raise LaunchError('This launcher requires macOS.')
    for binary in [PHP, PG / 'postgres', PG / 'pg_isready', REDIS / 'redis-server', REDIS / 'redis-cli']:
        if not os.access(binary, os.X_OK):
            raise LaunchError('Missing dependency: ' + str(binary) + '. Nothing will be installed automatically.')
    for binary in ['node', 'npm', 'brew', 'launchctl']:
        if not shutil.which(binary):
            raise LaunchError('Missing dependency: ' + binary + '. Load Homebrew/nvm in your shell first.')
    if run([PHP, '-r', 'exit(PHP_MAJOR_VERSION === 8 && PHP_MINOR_VERSION === 5 ? 0 : 1);']).returncode:
        raise LaunchError('PHP 8.5 is required at /opt/homebrew/bin/php.')
    if not run(['node', '--version']).stdout.startswith('v24.'):
        raise LaunchError('Node 24 is required; run nvm use from the project root.')
    if 'v=8.2.' not in run([REDIS / 'redis-server', '--version']).stdout:
        raise LaunchError('Homebrew Redis 8.2 is required.')
    for path in ['backend/vendor/autoload.php', 'frontend/node_modules/.bin/next', 'backend/.env', 'frontend/.env.local']:
        if not (ROOT / path).exists():
            raise LaunchError('Missing dependency/configuration: ' + path + '. See docs/development/local-setup.md.')
    # Fail before starting anything if the selected profile would target another environment.
    values = {}
    for line in (ROOT / 'backend/.env').read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep:
            values[key] = value.strip().strip('\"\'')
    for key, expected in {'APP_ENV': 'local', 'DB_CONNECTION': 'pgsql', 'DB_HOST': '127.0.0.1', 'DB_PORT': '5432', 'DB_DATABASE': 'iranti_local', 'REDIS_PORT': '63790', 'REDIS_CACHE_PORT': '63791'}.items():
        if os.environ.get(key, values.get(key)) != expected:
            raise LaunchError('Native local configuration required for ' + key + '; select the native profile first.')
    if (ROOT / 'backend/bootstrap/cache/config.php').exists():
        raise LaunchError('Cached Laravel configuration may override the native profile; run php artisan config:clear first.')
    if os.environ.get('DB_URL', values.get('DB_URL', '')):
        raise LaunchError('DB_URL override is not supported by the native launcher.')

def app_command(name):
    return {
        'backend': (['bash', str(ROOT / 'scripts/serve-backend.sh')], ROOT),
        'queue': ([str(PHP), 'artisan', 'queue:work', 'redis', '--queue=identity,default,transactional,media', '--timeout=60', '--tries=3'], ROOT / 'backend'),
        'scheduler': ([str(PHP), 'artisan', 'schedule:work'], ROOT / 'backend'),
        'frontend': (['npm', 'run', 'dev'], ROOT / 'frontend'),
    }[name]

def supervise(name):
    # One tracked session leader owns the app and its descendants, including dev-server workers.
    ensure_runtime()
    stopping = False
    def request_stop(_signum, _frame):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    command, cwd = app_command(name)
    env = dict(os.environ, IRANTI_PHP_BINARY=str(PHP))
    log(name, 'Starting; raw application output is not persisted (secret-safe lifecycle log).')
    child = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    while child.poll() is None and not stopping:
        time.sleep(0.2)
    log(name, 'Stop requested.' if stopping else 'Application exited with code ' + str(child.returncode) + '.')
    # Retain the leader's identity until its group is empty; stop can safely escalate if needed.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    os.killpg(os.getpid(), signal.SIGTERM)
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        child.poll()
        group = run(['/bin/ps', '-axo', 'pid=,pgid=,stat=']).stdout.splitlines()
        members = [line.split() for line in group]
        alive = [row for row in members if len(row) == 3 and row[1] == str(os.getpid()) and row[0] != str(os.getpid()) and not row[2].startswith('Z')]
        # The snapshot can include the already-reaped ps helper itself.
        remaining = []
        for row in alive:
            try:
                os.kill(int(row[0]), 0)
                remaining.append(row)
            except ProcessLookupError:
                pass
        if not remaining:
            log(name, 'Stopped; no app processes remain in owned group.')
            return
        time.sleep(0.2)
    log(name, 'Graceful timeout; terminating remaining owned process group.')
    os.killpg(os.getpid(), signal.SIGKILL)

def stop_app(name):
    record, status = read_record(name)
    if record is None:
        if status != 'not managed':
            print('WARNING: ' + name + ': ' + status + '; no process signalled.')
            clear_record(name)
        return
    os.killpg(record['pid'], signal.SIGTERM)
    wait_for(lambda: read_record(name)[0] is None, name + ' shutdown', 15)
    clear_record(name)
    print(name + ': stopped')

def stop_redis(name):
    record, status = read_record('redis-' + name)
    if record is None:
        if status != 'not managed':
            print('WARNING: Redis ' + name + ': ' + status + '; service left untouched.')
            clear_record('redis-' + name)
        else:
            print('Redis ' + name + ': not launcher-owned; left unchanged')
        return
    if service_pid(name) != record['pid']:
        raise LaunchError('Redis ' + name + ' service PID changed; refusing to stop an unverified service.')
    helper('stop', name)
    clear_record('redis-' + name)

def start():
    preflight()
    # Check both HTTP ports and every PID record before starting any service.
    for name in APPS:
        record, status = read_record(name)
        if record is None and status != 'not managed':
            print('WARNING: ' + name + ': ' + status + '; removing stale files, unrelated processes untouched.')
            clear_record(name)
        if name in ['backend', 'frontend']:
            port = 8000 if name == 'backend' else 3000
            pids = listeners(port)
            if pids and (record is None or any(os.getpgid(pid) != record['pid'] for pid in pids)):
                raise LaunchError('Port ' + str(port) + ' is already occupied by an unmanaged process; stop it explicitly.')
    for name, port in [('queue', 63790), ('cache', 63791)]:
        if listeners(port) and service_pid(name) not in listeners(port):
            raise LaunchError('Redis port ' + str(port) + ' is occupied by an unmanaged process.')
    new_apps, new_redis = [], []
    try:
        if not pg_ready():
            result = run(['brew', 'services', 'start', 'postgresql@18'], env=dict(os.environ, HOMEBREW_NO_AUTO_UPDATE='1'))
            if result.returncode:
                raise LaunchError('PostgreSQL Homebrew service could not start; inspect brew services list.')
        wait_for(pg_ready, 'PostgreSQL')
        # Verify Laravel credentials without printing exception messages or configuration.
        probe = "require 'vendor/autoload.php'; $app=require 'bootstrap/app.php'; $app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); try { $r=Illuminate\\Support\\Facades\\DB::selectOne(\"SELECT current_database() AS name, current_setting('server_version_num') AS version\"); if ($r->name !== 'iranti_local' || (int) $r->version < 180000 || (int) $r->version >= 190000) exit(1); } catch (Throwable $e) { exit(1); }"
        if run([PHP, '-r', probe], cwd=ROOT / 'backend').returncode:
            raise LaunchError('Laravel PostgreSQL connection failed; verify native credentials and database provisioning.')
        for name, port in [('queue', 63790), ('cache', 63791)]:
            previously_loaded = service_loaded(name)
            if not previously_loaded:
                helper('start', name)
                new_redis.append(name)
                wait_for(lambda: service_pid(name) is not None, 'Redis ' + name + ' service')
                record_process('redis-' + name, service_pid(name), binary=str(REDIS / 'redis-server'))
            else:
                print('Redis ' + name + ': using existing project service')
            wait_for(lambda: redis_ready(port), 'Redis ' + name)
        for name in APPS:
            existing, _ = read_record(name)
            if existing is not None:
                print(name + ': already running (PID ' + str(existing['pid']) + ')')
                continue
            token = uuid.uuid4().hex
            process = subprocess.Popen([sys.executable, str(SCRIPT), 'supervise', name, token], cwd=ROOT, start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
            # The parent records the exact session leader, not an npm/PHP child guessed by name.
            try:
                record_process(name, process.pid, token)
            except BaseException:
                # Popen still owns this freshly created group even if no PID file could be saved.
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=12)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                raise
            new_apps.append(name)
            if name in ['backend', 'frontend']:
                port = 8000 if name == 'backend' else 3000
                def ready():
                    if read_record(name)[0] is None:
                        raise LaunchError(name + ' exited during startup; see .runtime/logs/' + name + '.log or run it in the foreground.')
                    return owned_http_ready(name, port)
                wait_for(ready, name + ' HTTP', 45)
            else:
                time.sleep(1)
                if read_record(name)[0] is None:
                    raise LaunchError(name + ' exited during startup; check native services and the lifecycle log.')
            log(name, 'Startup verified.')
            print(name + ': started (PID ' + str(process.pid) + ')')
        # Duplicate starts must verify health too, rather than trusting a live wrapper alone.
        for name, port in [('backend', 8000), ('frontend', 3000)]:
            if not owned_http_ready(name, port):
                raise LaunchError('HTTP health failed on port ' + str(port))
        print(URLS)
        print('Logs: ' + str(RUNTIME / 'logs'))
    except BaseException:
        print('Startup failed; rolling back only resources started by this attempt.', file=sys.stderr)
        for name in reversed(new_apps):
            try:
                stop_app(name)
            except Exception as cleanup_error:
                print('Cleanup error for ' + name + ': ' + str(cleanup_error), file=sys.stderr)
        for name in reversed(new_redis):
            try:
                stop_redis(name)
            except Exception as cleanup_error:
                print('Cleanup error for Redis ' + name + ': ' + str(cleanup_error), file=sys.stderr)
        raise

def status():
    print('PostgreSQL: ' + ('ready at 127.0.0.1:5432' if pg_ready() else 'NOT READY'))
    for name, port in [('queue', 63790), ('cache', 63791)]:
        record, state = read_record('redis-' + name)
        print('Redis ' + name + ': ' + ('ready' if redis_ready(port) else 'NOT READY') + ' on ' + str(port) + '; ' + ('launcher-owned' if record else state))
    for name in APPS:
        record, state = read_record(name)
        extra = ''
        if name in ['backend', 'frontend']:
            port = 8000 if name == 'backend' else 3000
            if record:
                extra = '; HTTP ' + ('ready' if owned_http_ready(name, port, strict=False) else 'NOT READY / port not owned')
            elif listeners(port):
                extra = '; port occupied by an unmanaged process'
        print(name + ': ' + state + (' (PID ' + str(record['pid']) + ')' if record else '') + extra)
    print(URLS)

def main():
    if len(sys.argv) > 2 and sys.argv[1] == 'supervise':
        supervise(sys.argv[2])
        return
    ensure_runtime()
    lock = safe_open(RUNTIME / 'launcher.lock', os.O_CREAT | os.O_RDWR)
    try:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise LaunchError('Another launcher command is running; retry when it finishes.')
        action = sys.argv[1] if len(sys.argv) > 1 else ''
        if action == 'start':
            start()
        elif action == 'stop':
            failures = []
            for name in STOP_ORDER:
                try:
                    stop_app(name)
                except Exception as error:
                    failures.append(name + ': ' + str(error))
            for name in ['queue', 'cache']:
                try:
                    stop_redis(name)
                except Exception as error:
                    failures.append('Redis ' + name + ': ' + str(error))
            print('PostgreSQL left running.\n' + URLS)
            if failures:
                raise LaunchError('; '.join(failures))
        elif action == 'status':
            status()
        else:
            raise LaunchError('Expected start, stop or status.')
    finally:
        os.close(lock)

if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (LaunchError, OSError, subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        print('ERROR: ' + (str(error) if not isinstance(error, KeyboardInterrupt) else 'Interrupted.'), file=sys.stderr)
        sys.exit(1)
