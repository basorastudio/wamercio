import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const globals = read('app/globals.css');
const page = read('app/page.tsx');

assert.doesNotMatch(
  globals,
  /body\s*>\s*div\s*\{[^}]*height\s*:/s,
  'No se debe asignar altura de viewport a todos los div directos del body: Next.js puede insertar contenedores auxiliares y crear un viewport vacío.',
);

assert.match(
  page,
  /id=["']wamercio-app-root["']/,
  'La aplicación debe tener un contenedor raíz explícito y estable.',
);

assert.match(
  globals,
  /#wamercio-app-root\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
  'El contenedor raíz explícito debe controlar el viewport y evitar scroll del documento.',
);

console.log('Viewport raíz de WAMERCIO verificado correctamente.');
