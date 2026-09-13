# WAMERCIO 2.2.1

WAMERCIO es una plataforma SaaS de comercio conversacional para República Dominicana, construida con Next.js, Go, PostgreSQL, Redis y un bridge WhatsApp multisesión.


## WAMERCIO 2.1.3 — Flujo de tienda y checkout lateral

- Cada comercio se comparte en una URL corta `wamercio.com/{slug}`; `/store/{slug}` queda únicamente como redirección de compatibilidad.
- Las plantillas incluyen imágenes demo locales para productos y categorías.
- **Diseño y marca** ofrece diseños base, paletas listas, colores, tipografías, portada, categorías, tarjetas, formato de fotos, botones, fondo y CSS avanzado con vista previa.
- Los nombres visibles de los diseños y controles están en español y usan vocabulario comercial familiar en República Dominicana.
- Si el comerciante tiene una sola tienda, el menú **Mis tiendas** se oculta para simplificar el panel; vuelve a aparecer automáticamente con dos o más tiendas.

## WAMERCIO 2.0 — Negocios preconstruidos

El onboarding deja de comenzar con una tienda vacía. El comerciante indica qué tipo de negocio tiene y WAMERCIO clona una base preparada con categorías, ejemplos, campos del sector y respuestas rápidas de WhatsApp.

Flujo:

```text
WhatsApp → ¿Ya existe? → PIN
                  └─ No → elegir tipo de negocio
                           → nombre + PIN
                           → comercio preconstruido
```

Incluye 15 plantillas sectoriales iniciales más `Otro tipo de negocio`:

- Comida rápida
- Pizzería
- Repostería
- Boutique
- Cosméticos
- Celulares y tecnología
- Ferretería
- Repuestos
- Salón de belleza
- Barbería
- Pet Shop
- Floristería
- Regalos personalizados
- Productos naturales y suplementos
- Mayorista / distribuidor
- Otro tipo de negocio

Quedan fuera de este sistema los verticales cubiertos por otros proyectos: colmados, taxis, motoconchos, acarreos y transporte bajo demanda.

## Motores reutilizables

Las plantillas utilizan motores compartidos: `retail`, `fashion`, `food`, `catalog`, `quotation`, `services` y `wholesale`. No se crean aplicaciones separadas por sector.

Cada plantilla puede definir:

- categorías iniciales;
- productos/servicios de ejemplo;
- variantes y extras;
- campos propios del sector;
- configuración comercial inicial;
- respuestas rápidas de WhatsApp;
- vocabulario contextual, por ejemplo `producto`, `plato` o `servicio`.

La plantilla se clona a la tienda. Después el comerciante puede modificar todo sin afectar la plantilla maestra.

## SuperAdmin

`/admin/templates` permite crear, editar, duplicar, publicar/ocultar y modificar el contenido maestro de las plantillas.

## Conserva WAMERCIO 1.9

2.0 está construido sobre el flujo comercial 1.9 y conserva:

- pedido desde una conversación de WhatsApp;
- seguimiento público del pedido;
- comprobantes de transferencia;
- pausa/horarios de pedidos;
- Redis + SSE;
- outbox de WhatsApp con reintentos;
- rate limiting de acceso;
- tiendas archivadas;
- CI de compilación y pruebas.

## Accesos

```text
Comerciante: WhatsApp + PIN de 4 dígitos
SuperAdmin: /admin/login → correo + contraseña
```

Consulta `docs/PLANTILLAS_NEGOCIOS_RD.md` para el diseño completo del sistema.


## Theme Engine 2.1

WAMERCIO separa las plantillas funcionales de los temas visuales. Cada tienda puede cambiar tema, colores, tipografías, header, hero, categorías, tarjetas, proporción de imágenes, botones, fondo y CSS avanzado sin perder productos ni configuración comercial. Consulta `docs/THEME_ENGINE.md`.
