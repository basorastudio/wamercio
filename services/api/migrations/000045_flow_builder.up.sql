-- WAMERCIO 4.0 / fase 3.4: automatizaciones visuales.
CREATE TABLE IF NOT EXISTS automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  description text NOT NULL DEFAULT '',
  trigger_type varchar(40) NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual','message_received','keyword','quote_sent','quote_approved','order_created','order_status','task_due')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_flows_trigger ON automation_flows(store_id,trigger_type,is_active);

CREATE TABLE IF NOT EXISTS automation_flow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  node_key varchar(80) NOT NULL,
  node_type varchar(40) NOT NULL CHECK (node_type IN ('trigger','condition_contains','send_message','add_tag','assign_queue','create_task','delay','set_priority','end')),
  label varchar(180) NOT NULL DEFAULT '',
  position_x int NOT NULL DEFAULT 0,
  position_y int NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flow_id,node_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_flow_nodes ON automation_flow_nodes(flow_id,node_key);

CREATE TABLE IF NOT EXISTS automation_flow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  source_key varchar(80) NOT NULL,
  target_key varchar(80) NOT NULL,
  branch varchar(20) NOT NULL DEFAULT 'default' CHECK (branch IN ('default','true','false')),
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_automation_flow_edges ON automation_flow_edges(flow_id,source_key,sort_order);

CREATE TABLE IF NOT EXISTS automation_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES automation_flows(id) ON DELETE SET NULL,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  trigger_type varchar(40) NOT NULL,
  entity_id varchar(120) NOT NULL DEFAULT '',
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running','waiting','completed','failed','cancelled')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_node_key varchar(80) NOT NULL DEFAULT '',
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_flow_runs_store ON automation_flow_runs(store_id,started_at DESC);

CREATE TABLE IF NOT EXISTS automation_flow_steps (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES automation_flow_runs(id) ON DELETE CASCADE,
  node_key varchar(80) NOT NULL,
  node_type varchar(40) NOT NULL,
  status varchar(20) NOT NULL,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS automation_due_notified_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_automation ON crm_tasks(store_id,due_at) WHERE automation_due_notified_at IS NULL AND status IN ('pending','in_progress');
