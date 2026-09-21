-- WAMERCIO 3.0: Centro Conversacional PRO.
-- Colas, asignación multiagente, etiquetas, prioridades, SLA básico y seguimientos programados.

CREATE TABLE IF NOT EXISTS conversation_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  routing_strategy varchar(24) NOT NULL DEFAULT 'manual' CHECK (routing_strategy IN ('manual','round_robin','least_load','random')),
  sla_minutes int NOT NULL DEFAULT 30 CHECK (sla_minutes BETWEEN 1 AND 10080),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id,name)
);
CREATE INDEX IF NOT EXISTS idx_conversation_queues_store ON conversation_queues(store_id,is_active,sort_order,name);

CREATE TABLE IF NOT EXISTS conversation_queue_members (
  queue_id uuid NOT NULL REFERENCES conversation_queues(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES store_staff(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(queue_id,staff_id)
);

CREATE TABLE IF NOT EXISTS conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  color varchar(16) NOT NULL DEFAULT '#D9FDD3',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id,name)
);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_store ON conversation_tags(store_id,is_active,name);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS queue_id uuid REFERENCES conversation_queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_queue ON conversations(store_id,queue_id,status,last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(store_id,assigned_staff_id,status,last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(store_id,priority,status,last_message_at DESC);

CREATE TABLE IF NOT EXISTS conversation_tag_links (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES conversation_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(conversation_id,tag_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_tag_links_tag ON conversation_tag_links(tag_id,conversation_id);

CREATE TABLE IF NOT EXISTS conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(50) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation ON conversation_events(conversation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_events_store ON conversation_events(store_id,created_at DESC);

CREATE TABLE IF NOT EXISTS scheduled_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  cancel_on_reply boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','cancelled','failed')),
  error text,
  sent_message_id varchar(190),
  cancelled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_conversation_due ON scheduled_conversation_messages(status,scheduled_for) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_conversation_chat ON scheduled_conversation_messages(conversation_id,created_at DESC);

-- Every existing store starts with a General queue without changing current assignments.
INSERT INTO conversation_queues(store_id,name,routing_strategy,sla_minutes,sort_order)
SELECT id,'General','manual',30,10 FROM stores
ON CONFLICT(store_id,name) DO NOTHING;

-- Existing conversations inherit the General queue without changing their assigned agent.
UPDATE conversations c SET queue_id=q.id
FROM conversation_queues q
WHERE q.store_id=c.store_id AND q.name='General' AND c.queue_id IS NULL;

-- Useful starter labels, kept per tenant and fully editable later.
INSERT INTO conversation_tags(store_id,name,color)
SELECT id,'Venta','#D9FDD3' FROM stores ON CONFLICT(store_id,name) DO NOTHING;
INSERT INTO conversation_tags(store_id,name,color)
SELECT id,'Seguimiento','#FFF4CC' FROM stores ON CONFLICT(store_id,name) DO NOTHING;
INSERT INTO conversation_tags(store_id,name,color)
SELECT id,'Importante','#FFE0E0' FROM stores ON CONFLICT(store_id,name) DO NOTHING;

-- Seed last inbound timestamp from the existing message history.
UPDATE conversations c SET last_inbound_at=x.last_inbound
FROM (
  SELECT conversation_id,max(occurred_at) AS last_inbound
  FROM messages WHERE direction='in' GROUP BY conversation_id
) x
WHERE c.id=x.conversation_id AND c.last_inbound_at IS NULL;

UPDATE conversations c SET last_outbound_at=x.last_outbound
FROM (
  SELECT conversation_id,max(occurred_at) AS last_outbound
  FROM messages WHERE direction='out' GROUP BY conversation_id
) x
WHERE c.id=x.conversation_id AND c.last_outbound_at IS NULL;
