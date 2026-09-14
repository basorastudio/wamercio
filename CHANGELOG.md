# WAMERCIO 2.5.5 — Storefront progresivo y carrito estructural

## Experiencia del cliente

- El número de WhatsApp se resuelve automáticamente al quedar válido; ya no existe un botón **Continuar** en el primer paso.
- Si la cuenta existe, WAMERCIO muestra inmediatamente el PIN. Si no existe, valida WhatsApp y abre el formulario de registro.
- La búsqueda se mueve a la barra superior y funciona como menú contextual predictivo: no filtra ni altera el catálogo visible.
- Al seleccionar un resultado de búsqueda se abre directamente la ficha del producto.
- La barra superior deja de mostrar la dirección del negocio y conserva una jerarquía más limpia.
- Las tarjetas de producto se refinan con alturas consistentes, mejor jerarquía, estados de foco y precio inicial calculado desde variantes cuando corresponde.
- En escritorio el carrito deja de usar un overlay: se integra como panel lateral y el catálogo se reajusta para seguir agregando productos.
- En móvil y tablet el carrito conserva la interacción modal adecuada al espacio disponible.

## Despliegue

No requiere migraciones ni variables nuevas. Conserva el ENV de WAMERCIO 2.5.4 y realiza Rebuild + Redeploy.

---

# WAMERCIO 2.5.4 — Routing exacto de tiendas `*.ltd.do`

## Corrección

- Las tiendas activas ya no dependen de un router Traefik `HostRegexp` genérico.
- `domain-router` consulta `stores.slug` y publica un router `Host(...)` exacto para cada `https://{slug}.ltd.do`.
- Cada router HTTPS usa `certResolver: letsencrypt`, permitiendo certificado TLS individual por tienda sin depender de un certificado wildcard del origen.
- Los dominios personalizados activos continúan publicándose por el mismo mecanismo exacto.
- Se elimina el router wildcard HTTP/HTTPS de la configuración base de Traefik; el wildcard se mantiene donde corresponde: DNS `*.ltd.do`.
- `domain-router` respeta los subdominios reservados configurados en Centro SaaS y nunca publica una tienda sobre `cliente.ltd.do`, `proyecto.ltd.do`, `geo.ltd.do`, etc.
- Se elimina automáticamente el archivo dinámico heredado `wamercio-custom-domains.yml` al publicar la nueva configuración `wamercio-store-hosts.yml`.

## Despliegue

No requiere migraciones ni variables nuevas. Conserva `TENANT_ROOT_DOMAIN=ltd.do`, el DNS wildcard `*.ltd.do` y realiza Rebuild + Redeploy.
