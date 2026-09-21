from pathlib import Path
root=Path(__file__).resolve().parents[1]
bridge=(root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text(encoding='utf-8')
api=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
ev=(root/'services/api/internal/httpapi/evaluations.go').read_text(encoding='utf-8')
assert 'action == "polls"' in bridge, 'bridge poll route missing'
assert 'BuildPollCreation' in bridge, 'native poll creation missing'
assert 'DecryptPollVote' in bridge, 'native poll vote decrypt missing'
assert 'poll_message_id' in bridge and 'poll_selected_options' in bridge, 'poll vote metadata not forwarded'
assert 'evaluation_poll' in api, 'evaluation poll outbox delivery missing'
assert '/polls' in api, 'API does not call bridge poll endpoint'
assert 'PollMessageID' in api and 'PollSelectedOptions' in api, 'API event poll metadata missing'
assert 'queueWhatsAppPoll' in ev, 'evaluation close does not queue native poll'
assert 'parseEvaluationPollSelection' in ev, 'evaluation does not map native poll vote to score'
assert 'sent_message_id' in ev, 'evaluation poll is not correlated by sent message id'
print('PASS: WAMERCIO 2.9.0 native WhatsApp evaluation poll contract')
