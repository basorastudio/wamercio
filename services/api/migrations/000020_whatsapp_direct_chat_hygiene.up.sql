-- WAMERCIO only exposes direct person-to-person WhatsApp conversations.
-- Remove data imported by historical syncs for groups, statuses, broadcasts,
-- channels/newsletters and any other non-user JID. Child messages/notes are
-- removed by their existing ON DELETE rules.
DELETE FROM conversations
WHERE split_part(lower(remote_jid),'@',2) NOT IN ('s.whatsapp.net','lid');

DELETE FROM support_whatsapp_conversations
WHERE split_part(lower(remote_jid),'@',2) NOT IN ('s.whatsapp.net','lid');
