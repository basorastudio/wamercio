# WAMERCIO 4.1.2 — Corrección de build de Clientes/Softphone

El despliegue de Dokploy compiló API, WhatsApp Bridge y Domain Router, y el frontend llegó a `Compiled successfully`, pero falló durante `Linting and checking validity of types` porque `Customer` no declaraba `conversation_id`.

Se corrigió de forma integral:

1. `Customer` declara `conversation_id?: string`.
2. `GET /customers` obtiene y devuelve la conversación WhatsApp más reciente del cliente.
3. El botón de llamada de la tabla de Clientes usa `kind: customer`.
4. Se mantiene el `conversation_id` en Contactos y en la ficha individual del cliente.
5. No hay migraciones nuevas.
