from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]

def text(rel): return (root/rel).read_text(encoding='utf-8')
def must(rel,*tokens):
    s=text(rel)
    for token in tokens:
        assert token in s, f'{rel}: missing {token}'

assert text('VERSION').strip()=='4.0.0'
migrations=root/'services/api/migrations'
for n in [
 '000042_quotes_pro','000043_delivery_pro','000044_crm_operations',
 '000045_flow_builder','000046_voice_transcription','000047_calls_premium']:
    assert (migrations/f'{n}.up.sql').exists(), n+' up'
    assert (migrations/f'{n}.down.sql').exists(), n+' down'

must('services/api/internal/httpapi/server.go',
 '/public/quotes/{token}/pdf','/quotes/{id}/pdf','/delivery/routes/{id}/optimize',
 '/crm/opportunities','/tasks','/flows','/voice/transcripts','/calls','/internal/calls/events',
 'go srv.taskDueLoop()')
must('services/api/internal/httpapi/quotes_pro.go','shareQuote','convertQuoteToOrder','syncQuoteCRM(r.Context(), id, "cotizado")','syncQuoteCRM(r.Context(), id, "ganado")')
must('services/api/internal/httpapi/quote_pdf.go','buildQuotePDF','application/pdf','publicQuotePDF')
must('services/api/internal/httpapi/delivery_pro.go','associateConversationLocation','optimizeDeliveryRoute','haversineKM','recordCourierLocation')
must('services/api/internal/httpapi/crm_operations.go','syncQuoteCRM','taskDueLoop','automation_due_notified_at')
must('services/api/internal/httpapi/flow_builder.go','triggerVisualFlows','condition_contains','send_message','assign_queue','create_task','scheduled_conversation_messages','set_priority')
must('services/api/internal/httpapi/voice_transcription.go','STT_API_URL','message_transcripts','transcriptionLoop')
must('services/api/internal/httpapi/calls_premium.go','CALLS_ADAPTER_URL','answer','transfer','hold','resume','callAdapterEvent')
must('services/whatsapp-bridge/internal/bridge/bridge.go','structured_payload','latitude','longitude')
for page in ['quotes','crm','tasks','flows','voice','calls','delivery','courier']:
    assert (root/f'apps/web/app/{page}/page.tsx').exists(), page
assert (root/'apps/web/app/quote/[token]/page.tsx').exists()
must('apps/web/app/conversations/page.tsx','Asociar a dirección','/delivery/conversations/${selected.id}/address','latestLocation')
must('apps/web/app/delivery/page.tsx','Modo repartidor','Optimizar','/delivery/routes/${x.id}/optimize')
must('apps/web/app/courier/page.tsx','watchPosition','/delivery/courier/location','Mis entregas')
must('apps/web/app/calls/page.tsx','Contestar','Transferir llamada','Poner en espera','Reanudar')
must('apps/web/components/whatsapp-message-content.tsx','transcript','latitude','longitude')
must('apps/web/components/store-shell.tsx','Cotizaciones','CRM','Flow Builder','Voz y transcripción','Calls')
must('.env.example','STT_API_URL=','CALLS_ADAPTER_URL=')
must('docker-compose.yml','STT_API_URL: ${STT_API_URL:-}','CALLS_ADAPTER_URL: ${CALLS_ADAPTER_URL:-}')
print('PASS: WAMERCIO 4.0.0 expansion contract')
