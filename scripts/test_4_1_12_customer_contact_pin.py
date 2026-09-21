from pathlib import Path
root=Path(__file__).resolve().parents[1]
customers=(root/'apps/web/app/customers/page.tsx').read_text()
staff=(root/'apps/web/app/staff/page.tsx').read_text()
pin=(root/'apps/web/components/pin-input.tsx').read_text()
server=(root/'services/api/internal/httpapi/server.go').read_text()

assert 'https://wa.me/' not in customers, 'Clientes/Contactos no deben abrir WhatsApp Web externo'
assert 'openPlatformWhatsApp' in customers and '/conversations?' in customers
assert customers.count('title="Abrir chat de WhatsApp"') >= 2, 'Falta acceso interno al chat en Clientes/Contactos'
assert 'startContactBlock' in customers and 'Bloquear contacto' in customers and 'Desbloquear contacto' in customers
assert '/conversations/${actionContact.conversation_id}/block' in customers
assert 'reason:blockReason' in customers
assert "contact_status==='blocked'" in customers
assert 'eventType = "contact_blocked"' in server
assert 'eventType := "contact_unblocked"' in server
assert 'conversation_events' in server and 'blocked_reason' in server
assert 'metadata["reason"] = reason' in server
assert "import PinInput from '@/components/pin-input'" in staff
assert '<PinInput value={form.pin' in staff
assert 'digits(form.pin).length!==staffPinLength' in staff
assert 'gridTemplateColumns:`repeat(${safeLength}' in pin
assert 'maxLength={1}' in pin and "e.key==='Backspace'" in pin and 'onPaste={paste}' in pin
# El formulario de usuarios no debe volver a un PIN monolítico.
segment=staff[staff.find('PIN de {staffPinLength} dígitos'):staff.find("{edit&&<div><label className=\"label\">Estado")]
assert 'inputMode="numeric"' not in segment, 'PIN de Usuarios volvió a un input único'
print('PASS: WAMERCIO 4.1.12 internal WhatsApp + contact blocking + progressive PIN regression')
