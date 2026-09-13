#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {'.git', '.next', 'node_modules'}
SKIP_FILES = {
    'git_log_output.txt', 'git_diff_names.txt', 'git_head.txt',
    'git_status_temp.txt', 'git_status_output.txt',
}
TEXT_SUFFIXES = {
    '.go', '.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml',
    '.env', '.example', '.sh', '.conf', '.html', '.css', '.md', '.txt', '.sql',
}
# Build legacy public strings from fragments so this guard does not match itself.
LEGACY_PUBLIC = (
    'Colma' + 'Pro',
    'colmapro' + '.com',
    'col' + '.do',
)


def iter_text_files():
    for path in ROOT.rglob('*'):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name in SKIP_FILES or path.name == 'verify-wamercio-rebrand.py':
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in {'.env.example', 'Dockerfile', 'Makefile'}:
            continue
        try:
            yield path, path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue


errors = []
for path, text in iter_text_files():
    for forbidden in LEGACY_PUBLIC:
        if forbidden in text:
            errors.append(f'{path.relative_to(ROOT)} still contains legacy public value {forbidden!r}')
            break

compose = ROOT / 'docker-compose.yml'
if not compose.exists():
    errors.append('docker-compose.yml is missing')
else:
    text = compose.read_text(encoding='utf-8')
    required = (
        'container_name: wamercio_postgres',
        'container_name: wamercio_pgbouncer',
        'container_name: wamercio_redis',
        'container_name: wamercio_frontend',
        '[.]ltd[.]do',
    )
    for item in required:
        if item not in text:
            errors.append(f'docker-compose.yml missing {item!r}')

if (ROOT / 'docker-stack.yml').exists():
    errors.append('docker-stack.yml must not remain in the WAMERCIO Compose distribution')

if (ROOT / '.github/workflows/publish-colmapro-images.yml').exists():
    errors.append('legacy Swarm/GHCR publishing workflow still exists')

pkg = ROOT / 'frontend/package.json'
if pkg.exists() and '"name": "wamercio-app"' not in pkg.read_text(encoding='utf-8'):
    errors.append('frontend/package.json package name is not wamercio-app')

if errors:
    print('WAMERCIO rebrand verification FAILED:')
    for error in errors[:100]:
        print(f'- {error}')
    if len(errors) > 100:
        print(f'- ... and {len(errors)-100} more')
    sys.exit(1)

print('WAMERCIO rebrand verification passed.')
