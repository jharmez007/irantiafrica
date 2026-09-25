#!/usr/bin/env python3
"""Manage two persistent macOS user services using Homebrew Redis 8.2; never installs packages."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('action', choices=['start', 'stop', 'status'])
parser.add_argument('--instance', choices=['all', 'queue', 'cache'], default='all')
args = parser.parse_args()
if sys.platform != 'darwin':
    raise SystemExit('This service helper is for macOS only.')
brew = shutil.which('brew')
if not brew:
    raise SystemExit('Homebrew is not available. Nothing installed or started.')
prefix = Path(subprocess.check_output([brew, '--prefix'], text=True).strip())
server = prefix / 'opt/redis@8.2/bin/redis-server'
if args.action == 'start' and not server.is_file():
    raise SystemExit('NOT VERIFIED: Homebrew redis@8.2 is absent. Install only when authorized: brew install redis@8.2')
if args.action == 'start' and 'v=8.2.' not in subprocess.check_output([str(server), '--version'], text=True):
    raise SystemExit('Expected Redis 8.2; review architecture before selecting another release line.')
root = Path.home() / 'Library/Application Support/Iranti/redis'
agents = Path.home() / 'Library/LaunchAgents'
domain = 'gui/' + str(os.getuid())
for name, port, limit, policy in [('queue', 63790, '128mb', 'noeviction'), ('cache', 63791, '64mb', 'allkeys-lru')]:
    if args.instance not in ['all', name]:
        continue
    label = 'local.iranti.redis.' + name
    target = domain + '/' + label
    loaded = subprocess.run(['launchctl', 'print', target], capture_output=True).returncode == 0
    if args.action == 'status':
        print(label + ': ' + ('loaded' if loaded else 'not loaded'))
        continue
    if args.action == 'stop':
        if loaded:
            subprocess.run(['launchctl', 'bootout', target], check=True)
        print(label + ': stopped (data retained)')
        continue
    if loaded:
        print(label + ': already loaded')
        continue
    # Do not take over a port owned by another process (for example Compose).
    import socket
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise SystemExit(str(port) + ' is occupied; stop the other Redis environment first.')
    data = root / name
    data.mkdir(parents=True, exist_ok=True, mode=0o700)
    agents.mkdir(parents=True, exist_ok=True)
    config = data / 'redis.conf'
    config.write_text('\n'.join([
        'bind 127.0.0.1', 'protected-mode yes', 'port ' + str(port),
        'daemonize no', 'databases 16', 'dir "' + str(data).replace('\\', '\\\\').replace('"', '\\"') + '"',
        'save ""', 'appendonly ' + ('yes' if name == 'queue' else 'no'),
        'appendfsync everysec', 'maxmemory ' + limit, 'maxmemory-policy ' + policy,
    ]) + '\n')
    config.chmod(0o600)
    plist = agents / (label + '.plist')
    with plist.open('wb') as stream:
        plistlib.dump({'Label': label, 'ProgramArguments': [str(server), str(config)],
                      'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 10,
                      'WorkingDirectory': str(data),
                      'StandardOutPath': str(data / 'service.log'),
                      'StandardErrorPath': str(data / 'service.log')}, stream)
    plist.chmod(0o600)
    subprocess.run(['launchctl', 'bootstrap', domain, str(plist)], check=True)
    print(label + ': registered at login and started; data in ' + str(data))
