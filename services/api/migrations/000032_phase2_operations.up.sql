-- WAMERCIO 2.7.0: composición de catálogo, atributos gastronómicos y automatizaciones comerciales.

CREATE TABLE IF NOT EXISTS modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  description text,
  min_select int NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select int NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_select >= min_select)
);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_store ON modifier_groups(store_id,is_active,sort_order,name);

CREATE TABLE IF NOT EXISTS modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  price_delta numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id,is_active,sort_order,name);

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id,group_id)
);
CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_group ON product_modifier_groups(group_id,product_id);

CREATE TABLE IF NOT EXISTS bundle_components (
  bundle_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (bundle_product_id,component_product_id),
  CHECK (bundle_product_id <> component_product_id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_components_component ON bundle_components(component_product_id,bundle_product_id);

CREATE TABLE IF NOT EXISTS allergens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  icon varchar(40) NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id,name)
);
CREATE INDEX IF NOT EXISTS idx_allergens_store ON allergens(store_id,is_active,sort_order,name);

CREATE TABLE IF NOT EXISTS product_allergens (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  allergen_id uuid NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id,allergen_id)
);
CREATE INDEX IF NOT EXISTS idx_product_allergens_allergen ON product_allergens(allergen_id,product_id);

CREATE TABLE IF NOT EXISTS product_dietary_tags (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag varchar(60) NOT NULL,
  PRIMARY KEY (product_id,tag)
);
CREATE INDEX IF NOT EXISTS idx_product_dietary_tags_tag ON product_dietary_tags(tag,product_id);

CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  event varchar(60) NOT NULL,
  audience varchar(30) NOT NULL DEFAULT 'event_customer' CHECK (audience IN ('event_customer','all_customers')),
  template_text text NOT NULL,
  delay_minutes int NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0 AND delay_minutes <= 43200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_event ON automation_rules(store_id,event,is_active);

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES automation_rules(id) ON DELETE SET NULL,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event varchar(60) NOT NULL,
  entity_id varchar(120),
  destination varchar(40),
  rendered_text text NOT NULL DEFAULT '',
  status varchar(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','skipped','failed')),
  error text,
  dedupe_key varchar(260),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_runs_dedupe ON automation_runs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_runs_store_created ON automation_runs(store_id,created_at DESC);
