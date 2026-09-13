#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {'.git', '.next', 'node_modules'}
SKIP_FILES = {'verify-wamercio-identity.py'}
BINARY_SUFFIXES = {
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.pdf', '.zip', '.gz',
    '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mov', '.webm', '.bin', '.exe',
}
LEGACY_BRAND = 'colma' + 'pro'
LEGACY_BUSINESS_WORD = 'col' + 'mado'


def iter_text_files():
    for path in ROOT.rglob('*'):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        if path.name == 'api' and path.parent.name == 'backend':
            continue
        if path.suffix.lower() in BINARY_SUFFIXES:
            continue
        try:
            yield path, path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue


errors = []
for path, text in iter_text_files():
    low = text.lower()
    if LEGACY_BRAND in low:
        errors.append(f'{path.relative_to(ROOT)} contiene la marca heredada')
    if LEGACY_BUSINESS_WORD in low:
        errors.append(f'{path.relative_to(ROOT)} contiene terminología heredada de tipo de negocio')

for path in ROOT.rglob('*'):
    if any(part in SKIP_DIRS for part in path.parts):
        continue
    name = path.name.lower()
    if LEGACY_BRAND in name:
        errors.append(f'Nombre heredado en archivo/directorio: {path.relative_to(ROOT)}')
    if LEGACY_BUSINESS_WORD in name:
        errors.append(f'Nombre heredado de tipo de negocio en archivo/directorio: {path.relative_to(ROOT)}')

required_assets = (
    ROOT / 'frontend/public/brand/wamercio-app-icon.png',
    ROOT / 'frontend/public/brand/wamercio-brand-logo.png',
)
for asset in required_assets:
    if not asset.exists():
        errors.append(f'Falta asset WAMERCIO: {asset.relative_to(ROOT)}')

if errors:
    print('WAMERCIO identity verification FAILED:')
    for error in errors[:160]:
        print(f'- {error}')
    if len(errors) > 160:
        print(f'- ... y {len(errors)-160} errores adicionales')
    sys.exit(1)

print('WAMERCIO identity verification passed: no legacy brand/business terminology remains.')
