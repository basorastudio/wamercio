from pathlib import Path

root=Path(__file__).resolve().parents[1]
ui=(root/'apps/web/app/conversations/page.tsx').read_text(encoding='utf-8')
api=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
bridge=(root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text(encoding='utf-8')
docker=(root/'services/whatsapp-bridge/Dockerfile').read_text(encoding='utf-8')

# Botón mágico: micrófono sin texto, enviar con texto y estado propio de grabación.
assert 'MediaRecorder' in ui and 'navigator.mediaDevices?.getUserMedia' in ui
assert "form.append('voice_note','true')" in ui
assert 'recordingClock(recordingSeconds)' in ui
assert 'Grabando nota de voz' in ui and 'Enviando nota de voz...' in ui
assert '<Mic className="h-5 w-5"/>' in ui
assert "text.trim()&&!recording?'submit':'button'" in ui
assert "recording?finishVoiceRecording:()=>void startVoiceRecording()" in ui
assert 'cancelVoiceRecording' in ui

# Menú contextual solicitado en sustitución del botón redundante de datos.
assert 'data-testid="ticket-actions-menu"' in ui
assert 'title="Datos del contacto"' not in ui
for label in ['Reabrir ticket','Devolver ticket a la cola','Resolver','Transferir','Buscar','Programar mensaje']:
    assert label in ui, f'Falta acción: {label}'
assert 'Buscar en esta conversación' in ui and 'chatSearchMatches' in ui
assert '/conversations/${selected.id}/workflow' in ui
assert '/conversations/${selected.id}/scheduled' in ui
assert 'Transferir ticket' in ui and 'Programar mensaje' in ui

# API y Bridge preservan la intención PTT y normalizan audio webm/mp4 a OGG/Opus.
assert 'voiceNote := strings.EqualFold(strings.TrimSpace(r.FormValue("voice_note")), "true")' in api
assert '_ = mw.WriteField("voice_note", "true")' in api
assert 'body = "Nota de voz"' in api
assert 'voiceNote := strings.EqualFold(strings.TrimSpace(r.FormValue("voice_note")), "true")' in bridge
assert 'normalizeVoiceNote' in bridge
assert 'exec.Command("ffmpeg"' in bridge
assert 'PTT: proto.Bool(ptt)' in bridge
assert 'resultType = "ptt"' in bridge
assert 'ffmpeg' in docker

print('PASS: WAMERCIO 4.1.13 magic composer + voice notes + ticket actions regression')
