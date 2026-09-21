DROP TABLE IF EXISTS conversation_notes;
ALTER TABLE conversations DROP COLUMN IF EXISTS status;
ALTER TABLE conversations DROP COLUMN IF EXISTS customer_id;
