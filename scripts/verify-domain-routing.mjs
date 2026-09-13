import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const compose = read('docker-compose.yml');
const rootEnv = read('.env.example');
const frontendEnv = read('frontend/.env.example');
const dockerfile = read('frontend/Dockerfile');
const api = read('frontend/src/lib/api.ts');
const nginx = read('frontend/deploy/nginx/default.conf');

assert.match(rootEnv, /^DOKPLOY_PREVIEW_DOMAIN=proyecto\.ltd\.do$/m,
  'El dominio de vista previa de Dokploy debe ser configurable por ENV');
assert.match(rootEnv, /^NEXT_PUBLIC_PLATFORM_HOST_ALIASES=proyecto\.ltd\.do$/m,
  'El frontend debe conocer los aliases de plataforma que no son tenants');
assert.match(frontendEnv, /^NEXT_PUBLIC_PLATFORM_HOST_ALIASES=proyecto\.ltd\.do$/m,
  'El ENV de frontend debe documentar los aliases de plataforma');
assert.match(dockerfile, /ARG NEXT_PUBLIC_PLATFORM_HOST_ALIASES=/,
  'El alias de plataforma debe incorporarse al build estático de Next.js');
assert.match(dockerfile, /NEXT_PUBLIC_PLATFORM_HOST_ALIASES=\$NEXT_PUBLIC_PLATFORM_HOST_ALIASES/,
  'El build debe exponer NEXT_PUBLIC_PLATFORM_HOST_ALIASES');

assert.match(compose, /NEXT_PUBLIC_PLATFORM_HOST_ALIASES:\s*\$\{NEXT_PUBLIC_PLATFORM_HOST_ALIASES:-proyecto\.ltd\.do\}/,
  'Compose debe pasar el alias de plataforma al build del frontend');
assert.match(compose, /wamercio-platform-web\.rule=Host\(`\$\{APP_DOMAIN:-wamercio\.com\}`\) \|\| Host\(`www\.\$\{APP_DOMAIN:-wamercio\.com\}`\) \|\| Host\(`\$\{DOKPLOY_PREVIEW_DOMAIN:-proyecto\.ltd\.do\}`\)/,
  'Traefik debe tener un router HTTP exacto para el dominio principal y el dominio de Dokploy');
assert.match(compose, /wamercio-platform-websecure\.rule=Host\(`\$\{APP_DOMAIN:-wamercio\.com\}`\) \|\| Host\(`www\.\$\{APP_DOMAIN:-wamercio\.com\}`\) \|\| Host\(`\$\{DOKPLOY_PREVIEW_DOMAIN:-proyecto\.ltd\.do\}`\)/,
  'Traefik debe tener un router HTTPS exacto para el dominio principal y el dominio de Dokploy');
assert.match(compose, /wamercio-platform-web\.priority=1000/,
  'El router exacto de plataforma debe ganar al wildcard de tenants');
assert.match(compose, /wamercio-platform-websecure\.priority=1000/,
  'El router HTTPS exacto de plataforma debe ganar al wildcard de tenants');
assert.match(compose, /wamercio-tenants-web\.priority=10(?:\"|\n)/,
  'El wildcard HTTP debe mantener prioridad baja para no secuestrar dominios exactos de otras apps Dokploy');
assert.match(compose, /wamercio-tenants-websecure\.priority=10(?:\"|\n)/,
  'El wildcard HTTPS debe mantener prioridad baja para no secuestrar dominios exactos de otras apps Dokploy');
assert.match(compose, /wamercio-root-web\.rule=Host\(`\$\{ROOT_DOMAIN:-ltd\.do\}`\)/,
  'El dominio raíz ltd.do debe llegar al frontend para ejecutar la redirección canónica');
assert.match(compose, /wamercio-root-websecure\.rule=Host\(`\$\{ROOT_DOMAIN:-ltd\.do\}`\)/,
  'El dominio raíz ltd.do debe tener ruta HTTPS');

assert.match(api, /const PLATFORM_HOST_ALIASES =/,
  'La detección del frontend debe modelar aliases de plataforma explícitos');
assert.match(api, /PLATFORM_HOSTS\.has\(host\)/,
  'isPlatformRootHost debe reconocer dominio canónico, www y alias Dokploy');
assert.match(api, /`www\.\$\{PLATFORM_DOMAIN\}`/,
  'www.wamercio.com debe tratarse como plataforma y no como tenant');

assert.match(nginx, /server_name wamercio\.com www\.wamercio\.com ltd\.do \*\.ltd\.do;/,
  'Nginx debe aceptar explícitamente plataforma, raíz y wildcard tenant');

console.log('Enrutamiento de dominios WAMERCIO verificado correctamente.');
