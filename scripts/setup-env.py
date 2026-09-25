#!/usr/bin/env python3
"""Select a local profile; preserve keys/passwords, never print credentials."""
import argparse
from pathlib import Path
import re
import secrets

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--profile', choices=['native', 'compose'], default='native')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]

def values(text):
    return dict(line.split('=', 1) for line in text.splitlines() if '=' in line and not line.startswith('#'))

def set_value(text, key, value):
    line = key + '=' + value
    return re.sub(r'^' + re.escape(key) + r'=.*$', lambda _: line, text, flags=re.M) if re.search(r'^' + re.escape(key) + '=', text, re.M) else text.rstrip() + '\n' + line + '\n'

def save(path, text):
    # Set restrictive permissions at creation, before writing any secret.
    import os
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(text)

infra = root / 'infrastructure/.env'
if not infra.exists():
    save(infra, '\n'.join(key + '=' + secrets.token_hex(24) for key in ['POSTGRES_ADMIN_PASSWORD', 'POSTGRES_APP_PASSWORD', 'POSTGRES_TEST_PASSWORD']) + '\n')
credentials = values(infra.read_text())
template = (root / 'backend/.env.example').read_text()
backend = root / 'backend/.env'
text = backend.read_text() if backend.exists() else template
existing = values(text)
if existing.get('APP_ENV', 'local') != 'local':
    raise SystemExit('Refusing to modify a non-local backend environment.')
if existing.get('DB_URL', '').strip().strip('\"\''):
    raise SystemExit('Remove the local DB_URL override before selecting a profile; no backend settings changed.')
# Keep a native password when switching to Compose and back, without overwriting .env.testing.
native_secret = root / 'backend/.env.native-password'
if args.profile == 'native':
    if existing.get('DB_USERNAME') == 'iranti' and existing.get('DB_PASSWORD', '').strip().strip('\"\''):
        password = existing['DB_PASSWORD']
    elif native_secret.exists():
        password = native_secret.read_text().strip()
    else:
        password = secrets.token_hex(24)
    save(native_secret, password + '\n')
else:
    if existing.get('DB_USERNAME') == 'iranti' and existing.get('DB_PASSWORD', '').strip().strip('\"\''):
        save(native_secret, existing['DB_PASSWORD'] + '\n')
    password = credentials['POSTGRES_APP_PASSWORD']
for key, value in {
    'DB_CONNECTION': 'pgsql', 'DB_HOST': '127.0.0.1',
    'DB_PORT': '5432' if args.profile == 'native' else '54320',
    'DB_DATABASE': 'iranti_local', 'DB_USERNAME': 'iranti' if args.profile == 'native' else 'iranti_app',
    'DB_PASSWORD': password,
    'REDIS_HOST': '127.0.0.1', 'REDIS_PORT': '63790',
    'REDIS_CACHE_HOST': '127.0.0.1', 'REDIS_CACHE_PORT': '63791',
    'REDIS_DB': '0', 'REDIS_CACHE_DB': '0', 'REDIS_PREFIX': 'iranti_local_',
    'SESSION_DRIVER': 'database', 'CACHE_STORE': 'redis', 'QUEUE_CONNECTION': 'redis',
}.items():
    text = set_value(text, key, value)
front = root / 'frontend/.env.local'
front_text = front.read_text() if front.exists() else (root / 'frontend/.env.example').read_text()
read_key = values(text).get('CATALOG_INTERNAL_READ_KEY') or values(front_text).get('CATALOG_INTERNAL_READ_KEY') or secrets.token_hex(32)
save(backend, set_value(text, 'CATALOG_INTERNAL_READ_KEY', read_key))
save(front, set_value(front_text, 'CATALOG_INTERNAL_READ_KEY', read_key))
testing = root / 'backend/.env.testing'
if not testing.exists():
    # Destructive infrastructure tests stay on the independent Compose/test endpoint.
    test_text = template
    for key, value in {'APP_ENV': 'testing', 'DB_PORT': '54320', 'DB_DATABASE': 'iranti_test', 'DB_USERNAME': 'iranti_test', 'DB_PASSWORD': credentials['POSTGRES_TEST_PASSWORD'], 'REDIS_PREFIX': 'iranti_test_', 'CATALOG_INTERNAL_READ_KEY': read_key}.items():
        test_text = set_value(test_text, key, value)
    save(testing, test_text)
print('Local profile selected: ' + args.profile + '. Secrets preserved privately; existing test configuration unchanged.')
