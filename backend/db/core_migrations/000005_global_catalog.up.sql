CREATE TABLE IF NOT EXISTS platform_catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT '📦',
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_catalog_categories_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS platform_catalog_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES platform_catalog_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_catalog_groups_category_name_unique UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS platform_catalog_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES platform_catalog_categories(id) ON DELETE CASCADE,
  group_id uuid REFERENCES platform_catalog_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_catalog_details_category_group_name_unique UNIQUE (category_id, group_id, name)
);

CREATE TABLE IF NOT EXISTS platform_catalog_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo text NOT NULL DEFAULT '',
  origin_country text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_catalog_brands_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS platform_catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  barcode text NOT NULL DEFAULT '',
  image text NOT NULL DEFAULT '',
  image_source_url text NOT NULL DEFAULT '',
  category_id uuid REFERENCES platform_catalog_categories(id) ON DELETE SET NULL,
  group_id uuid REFERENCES platform_catalog_groups(id) ON DELETE SET NULL,
  detail_id uuid REFERENCES platform_catalog_details(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES platform_catalog_brands(id) ON DELETE SET NULL,
  format text NOT NULL DEFAULT 'Unidad',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_catalog_products_source_key_unique UNIQUE (source_key)
);

CREATE TABLE IF NOT EXISTS platform_catalog_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  requests_count integer NOT NULL DEFAULT 1,
  owner_name text NOT NULL DEFAULT '',
  owner_whatsapp text NOT NULL DEFAULT '',
  tenant_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  last_requested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_catalog_suggestions_barcode_unique UNIQUE (barcode),
  CONSTRAINT platform_catalog_suggestions_status_check CHECK (status IN ('pending','converted','dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_category ON platform_catalog_products(category_id);
CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_group ON platform_catalog_products(group_id);
CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_detail ON platform_catalog_products(detail_id);
CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_brand ON platform_catalog_products(brand_id);
CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_barcode ON platform_catalog_products(barcode);
CREATE INDEX IF NOT EXISTS idx_platform_catalog_suggestions_status ON platform_catalog_suggestions(status);
