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

assert.match(rootEnv, /^DOKPLOY_PANEL_DOMAIN=proyecto\.ltd\.do$/m,
  'El dominio del panel Dokploy debe declararse como host reservado');
assert.match(rootEnv, /^NEXT_PUBLIC_PLATFORM_HOST_ALIASES=$/m,
  'El dominio de Dokploy no debe publicarse como alias de WAMERCIO');
assert.match(frontendEnv, /^NEXT_PUBLIC_PLATFORM_HOST_ALIASES=$/m,
  'El ENV del frontend no debe incluir el panel Dokploy como alias');
assert.match(dockerfile, /ARG NEXT_PUBLIC_PLATFORM_HOST_ALIASES=/,
  'El alias de plataforma debe incorporarse al build estático de Next.js');
assert.match(dockerfile, /NEXT_PUBLIC_PLATFORM_HOST_ALIASES=\$NEXT_PUBLIC_PLATFORM_HOST_ALIASES/,
  'El build debe exponer NEXT_PUBLIC_PLATFORM_HOST_ALIASES');

assert.match(compose, /NEXT_PUBLIC_PLATFORM_HOST_ALIASES:\s*\$\{NEXT_PUBLIC_PLATFORM_HOST_ALIASES:-\}/,
  'Compose debe permitir aliases opcionales sin apropiarse del dominio Dokploy');
assert.match(compose, /wamercio-platform-web\.rule=Host\(`\$\{APP_DOMAIN:-wamercio\.com\}`\) \|\| Host\(`www\.\$\{APP_DOMAIN:-wamercio\.com\}`\)/,
  'Traefik debe reservar el router HTTP exacto únicamente para WAMERCIO');
assert.doesNotMatch(compose, /wamercio-platform-web\.rule=.*DOKPLOY/,
  'El router de plataforma no debe reclamar el dominio del panel Dokploy');
assert.match(compose, /wamercio-platform-websecure\.rule=Host\(`\$\{APP_DOMAIN:-wamercio\.com\}`\) \|\| Host\(`www\.\$\{APP_DOMAIN:-wamercio\.com\}`\)/,
  'Traefik debe reservar el router HTTPS exacto únicamente para WAMERCIO');
assert.doesNotMatch(compose, /wamercio-platform-websecure\.rule=.*DOKPLOY/,
  'El router HTTPS de plataforma no debe reclamar el dominio del panel Dokploy');
assert.match(compose, /wamercio-platform-web\.priority=1000/,
  'El router exacto de plataforma debe ganar al wildcard de tenants');
assert.match(compose, /wamercio-platform-websecure\.priority=1000/,
  'El router HTTPS exacto de plataforma debe ganar al wildcard de tenants');
assert.match(compose, /wamercio-tenants-web\.priority=10(?:\"|\n)/,
  'El wildcard HTTP debe mantener prioridad baja para no secuestrar dominios exactos de otras apps Dokploy');
assert.match(compose, /wamercio-tenants-websecure\.priority=10(?:\"|\n)/,
  'El wildcard HTTPS debe mantener prioridad baja para no secuestrar dominios exactos de otras apps Dokploy');
assert.match(compose, /wamercio-tenants-web\.rule=.*!Host\(`\$\{DOKPLOY_PANEL_DOMAIN:-proyecto\.ltd\.do\}`\)/,
  'El wildcard HTTP debe excluir expresamente el panel de Dokploy');
assert.match(compose, /wamercio-tenants-websecure\.rule=.*!Host\(`\$\{DOKPLOY_PANEL_DOMAIN:-proyecto\.ltd\.do\}`\)/,
  'El wildcard HTTPS debe excluir expresamente el panel de Dokploy');
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
