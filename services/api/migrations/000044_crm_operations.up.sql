-- WAMERCIO 4.0 / fase 3.3: CRM operativo, Kanban y tareas.
CREATE TABLE IF NOT EXISTS crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  slug varchar(60) NOT NULL,
  color varchar(16) NOT NULL DEFAULT '#D9FDD3',
  sort_order int NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id,slug)
);
CREATE INDEX IF NOT EXISTS idx_crm_stages_store ON crm_stages(store_id,is_active,sort_order);

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES crm_stages(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  assigned_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  title varchar(220) NOT NULL,
  value numeric(14,2) NOT NULL DEFAULT 0,
  probability smallint NOT NULL DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  notes text NOT NULL DEFAULT '',
  next_action_at timestamptz,
  closed_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(store_id,stage_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_staff ON crm_opportunities(assigned_staff_id,status,next_action_at);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  assigned_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title varchar(220) NOT NULL,
  description text NOT NULL DEFAULT '',
  priority varchar(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_store_due ON crm_tasks(store_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_staff_due ON crm_tasks(assigned_staff_id,status,due_at);

CREATE TABLE IF NOT EXISTS crm_activity (
  id bigserial PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  event_type varchar(50) NOT NULL,
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_activity_opp ON crm_activity(opportunity_id,created_at DESC);

INSERT INTO crm_stages(store_id,name,slug,color,sort_order)
SELECT id,'Nuevo','nuevo','#E8F0FE',10 FROM stores ON CONFLICT(store_id,slug) DO NOTHING;
INSERT INTO crm_stages(store_id,name,slug,color,sort_order)
SELECT id,'Contactado','contactado','#E1F5FE',20 FROM stores ON CONFLICT(store_id,slug) DO NOTHING;
INSERT INTO crm_stages(store_id,name,slug,color,sort_order)
SELECT id,'Interesado','interesado','#FFF4CC',30 FROM stores ON CONFLICT(store_id,slug) DO NOTHING;
INSERT INTO crm_stages(store_id,name,slug,color,sort_order)
SELECT id,'Cotizado','cotizado','#EDE7F6',40 FROM stores ON CONFLICT(store_id,slug) DO NOTHING;
INSERT INTO crm_stages(store_id,name,slug,color,sort_order)
SELECT id,'Negociación','negociacion','#FFE0B2',50 FROM stores ON CONFLICT(store_id,slug) DO NOTHING;
INSERT INTO crm_stages(store_id,name,slug,color,sort_order,is_won)
SELECT id,'Ganado','ganado','#D9FDD3',60,true FROM stores ON CONFLICT(store_id,slug) DO NOTHING;
INSERT INTO crm_stages(store_id,name,slug,color,sort_order,is_lost)
SELECT id,'Perdido','perdido','#FFE0E0',70,true FROM stores ON CONFLICT(store_id,slug) DO NOTHING;
