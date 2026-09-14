# WAMERCIO 2.5.1

WAMERCIO es una plataforma SaaS de comercio conversacional mobile-first para República Dominicana, construida con Next.js, Go, PostgreSQL, Redis y un bridge WhatsApp multisesión.

## Arquitectura 2.5.1 — Negocios por subdominio y dominio propio

La plataforma central vive exclusivamente en `wamercio.com`. Cada negocio se publica en su propio host:

```text
https://pizzeria-juan.ltd.do
https://ferreteria-central.ltd.do
```

Un negocio también puede conectar un dominio propio, por ejemplo `https://pizzeriajuan.com`. El panel del comerciante permanece centralizado en `wamercio.com`, mientras la tienda pública, PWA y panel del cliente se sirven desde el host del negocio.

La experiencia por negocio es mobile-first: tienda y panel del cliente usan navegación inferior en móvil, safe areas de iOS, SPA y un manifest PWA generado dinámicamente con la identidad del negocio.

Los clientes conservan una identidad global por WhatsApp + Cédula + PIN. La sesión se comparte entre subdominios `*.ltd.do`; para dominios personalizados WAMERCIO utiliza un intercambio SSO de un solo uso mediante `cliente.ltd.do`.

## Identidad global de clientes

Una persona se registra una sola vez con **WhatsApp + Cédula + PIN**, puede comprar en distintos negocios y conserva pedidos, perfil y direcciones. Cada negocio mantiene su relación comercial local con ese cliente.

```text
WhatsApp → validar con whatsmeow → Cédula / Identidad Dominicana
         → datos personales → dirección GEO RD MAP → PIN → cuenta global
```

## Dominios personalizados

En `Configuración → Dominios` del negocio se puede:

- ver el subdominio automático `{slug}.ltd.do`;
- registrar un dominio propio;
- recibir instrucciones CNAME/TXT;
- verificar DNS;
- marcar un dominio activo como principal;
- eliminar dominios vinculados.

El servicio `domain-router` sincroniza negocios activos y dominios verificados con la configuración dinámica de Traefik.

## Infraestructura de dominios

Variables principales:

```env
PLATFORM_DOMAIN=wamercio.com
TENANT_ROOT_DOMAIN=ltd.do
CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do
```

`ltd.do` y `www.ltd.do` redirigen a `wamercio.com`. Los hosts de infraestructura (`proyecto`, `geo`, `id`, `waxum`, `domains`) están reservados y no pueden convertirse en tiendas.
