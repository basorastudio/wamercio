DROP INDEX IF EXISTS idx_crm_tasks_due_automation;
ALTER TABLE crm_tasks DROP COLUMN IF EXISTS automation_due_notified_at;
DROP TABLE IF EXISTS automation_flow_steps;
DROP TABLE IF EXISTS automation_flow_runs;
DROP TABLE IF EXISTS automation_flow_edges;
DROP TABLE IF EXISTS automation_flow_nodes;
DROP TABLE IF EXISTS automation_flows;
