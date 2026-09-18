DROP TABLE IF EXISTS scheduled_conversation_messages;
DROP TABLE IF EXISTS conversation_events;
DROP TABLE IF EXISTS conversation_tag_links;
ALTER TABLE conversations
  DROP COLUMN IF EXISTS assignment_updated_at,
  DROP COLUMN IF EXISTS last_outbound_at,
  DROP COLUMN IF EXISTS last_inbound_at,
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS first_response_at,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS assigned_staff_id,
  DROP COLUMN IF EXISTS queue_id;
DROP TABLE IF EXISTS conversation_tags;
DROP TABLE IF EXISTS conversation_queue_members;
DROP TABLE IF EXISTS conversation_queues;
