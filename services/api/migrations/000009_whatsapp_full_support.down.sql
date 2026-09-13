DROP TABLE IF EXISTS support_whatsapp_messages;
DROP TABLE IF EXISTS support_whatsapp_conversations;
DROP TABLE IF EXISTS support_whatsapp_session;
ALTER TABLE messages DROP COLUMN IF EXISTS caption, DROP COLUMN IF EXISTS file_size, DROP COLUMN IF EXISTS file_name, DROP COLUMN IF EXISTS mime_type, DROP COLUMN IF EXISTS media_url;
