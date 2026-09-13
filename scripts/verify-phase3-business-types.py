#!/usr/bin/env python3
from pathlib import Path
import re, sys

ROOT = Path(__file__).resolve().parents[1]
errors=[]

def need(path, needle, label=None):
    text=(ROOT/path).read_text(encoding='utf-8')
    if needle not in text:
        errors.append(label or f'{path}: falta {needle!r}')
    return text

up=ROOT/'backend/db/core_migrations/000028_business_types_conversational_commerce.up.sql'
down=ROOT/'backend/db/core_migrations/000028_business_types_conversational_commerce.down.sql'
if not up.exists(): errors.append('falta migración 000028 up')
if not down.exists(): errors.append('falta migración 000028 down')

required_slugs = [
    'ferreteria','farmacia','restaurante','boutique','salon-belleza','barberia',
    'tecnologia-celulares','repuestos','taller-automotriz','distribuidora-mayorista',
    'servicios-profesionales','inmobiliaria','hotel-alojamiento','courier-mensajeria','otro'
]
if up.exists():
    migration=up.read_text(encoding='utf-8')
    for slug in required_slugs:
        if f"'{slug}'" not in migration:
            errors.append(f'000028 no incluye slug requerido: {slug}')
    if 'ON CONFLICT (slug)' not in migration:
        errors.append('000028 debe ser idempotente por slug')

superadmin=(ROOT/'frontend/src/screens/SuperAdmin.tsx').read_text(encoding='utf-8')
branches=(ROOT/'frontend/src/screens/Branches.tsx').read_text(encoding='utf-8')
landing=(ROOT/'frontend/src/screens/SaasLanding.tsx').read_text(encoding='utf-8')
server=(ROOT/'backend/internal/httpapi/server.go').read_text(encoding='utf-8')

for label, text in [('SuperAdmin',superadmin),('Branches',branches)]:
    if 'Buscar tipo de negocio' not in text:
        errors.append(f'{label}: falta búsqueda simple de tipo de negocio')

for label, text in [('SuperAdmin',superadmin),('Branches',branches)]:
    if 'if (type.toLowerCase() === "otro tipo de negocio") return name;' not in text and "if (type.toLowerCase() === 'otro tipo de negocio') return name;" not in text:
        errors.append(f'{label}: Otro tipo de negocio no debe convertirse en prefijo del nombre comercial')

for text,label in [(landing,'SaasLanding'),(server,'server.go')]:
    for bad in ['Negocios con entrega local','Negocios con ventas fiadas','Comercios con cajeros','Comercios con repartidores','Propietarios con varios negocios']:
        if bad in text:
            errors.append(f'{label}: business_types todavía mezcla capacidad/rol: {bad}')
    if 'comercio conversacional' not in text.lower():
        errors.append(f'{label}: falta enfoque explícito de comercio conversacional')

# No regresión del routing ya corregido.
compose=(ROOT/'docker-compose.yml').read_text(encoding='utf-8')
if '!Host(`${DOKPLOY_PANEL_DOMAIN:-proyecto.ltd.do}`)' not in compose:
    errors.append('docker-compose: se perdió exclusión del dominio Dokploy en wildcard')
if 'Host(`${APP_DOMAIN:-wamercio.com}`)' not in compose:
    errors.append('docker-compose: se perdió router exacto de wamercio.com')

if errors:
    print('FASE 3: FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)
print('FASE 3: OK')
