-- WAMERCIO 1.6: conversational CRM, inline contact panel and attention records.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'open';

CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(store_id,status,last_message_at DESC);

CREATE TABLE IF NOT EXISTS conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation ON conversation_notes(conversation_id,created_at DESC);

-- Link existing direct-number conversations to the customer CRM when possible.
UPDATE conversations c
SET customer_id=cu.id
FROM customers cu
WHERE c.customer_id IS NULL
  AND cu.store_id=c.store_id
  AND cu.phone=regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g');
