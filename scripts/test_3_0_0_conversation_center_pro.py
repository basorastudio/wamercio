from pathlib import Path

root=Path('.')
api=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
pro=(root/'services/api/internal/httpapi/conversation_pro.go').read_text(encoding='utf-8')
conv=(root/'apps/web/app/conversations/page.tsx').read_text(encoding='utf-8')
controls=(root/'apps/web/components/conversation-pro-controls.tsx').read_text(encoding='utf-8')
up=(root/'services/api/migrations/000041_conversation_center_pro.up.sql').read_text(encoding='utf-8')
down=(root/'services/api/migrations/000041_conversation_center_pro.down.sql').read_text(encoding='utf-8')

# Persistence model
for needle in [
    'CREATE TABLE IF NOT EXISTS conversation_queues',
    'CREATE TABLE IF NOT EXISTS conversation_queue_members',
    'CREATE TABLE IF NOT EXISTS conversation_tags',
    'CREATE TABLE IF NOT EXISTS conversation_events',
    'CREATE TABLE IF NOT EXISTS scheduled_conversation_messages',
    'ADD COLUMN IF NOT EXISTS assigned_staff_id',
    'ADD COLUMN IF NOT EXISTS last_inbound_at',
    'ADD COLUMN IF NOT EXISTS last_outbound_at',
    "UPDATE conversations c SET queue_id=q.id",
]:
    assert needle in up, f'missing migration contract: {needle}'
assert 'DROP TABLE IF EXISTS scheduled_conversation_messages' in down
assert 'DROP COLUMN IF EXISTS assigned_staff_id' in down

# HTTP surface
for route in [
    '/conversation-queues',
    '/conversation-queues/{id}/members',
    '/conversation-tags',
    '/conversations/{id}/workflow',
    '/conversations/{id}/auto-assign',
    '/conversations/{id}/scheduled',
    '/conversations/{id}/send-poll',
]:
    assert route in api, f'missing route: {route}'

# Routing / SLA / scheduling behaviors
for strategy in ['round_robin','least_load','random']:
    assert strategy in pro, strategy
assert "ss.role<>'delivery'" in pro, 'delivery users must not be auto-assigned to chats'
assert 'cancel_on_reply=true' in pro and 'Cancelado automáticamente: el cliente respondió' in pro
assert 'lastInbound.After(*lastOutbound)' in pro, 'SLA must only run while client is waiting for a reply'
assert "status='processing'" in pro and "status='sent'" in pro
assert 'BuildPollCreation' in (root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text(encoding='utf-8')

# UI keeps the existing conversations page and extends it.
for label in ['Sin asignar','Urgentes','SLA','Respuestas rápidas','Enviar encuesta']:
    assert label in conv, f'missing conversation UI: {label}'
assert "text.trimStart().startsWith('/')" in conv, 'slash quick replies missing'
for label in ['Gestión de atención','Agentes de la cola','Etiquetas','Programar seguimiento','Cancelar si el cliente responde']:
    assert label in controls, f'missing PRO control: {label}'
assert 'Round-robin' in controls and 'Menor carga' in controls and 'Aleatoria' in controls

print('PASS: WAMERCIO 3.0.0 Centro Conversacional PRO contract')
