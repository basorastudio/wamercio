CREATE TABLE IF NOT EXISTS store_social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL CHECK (provider IN ('facebook','instagram','linkedin','google_business')),
  provider_user_id text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  account_type varchar(40) NOT NULL DEFAULT 'profile',
  avatar_url text NOT NULL DEFAULT '',
  profile_url text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL DEFAULT '',
  token_expires_at timestamptz,
  granted_scopes text NOT NULL DEFAULT '',
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','error')),
  connected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_social_connection_provider_user ON store_social_connections(store_id,provider,provider_user_id) WHERE provider_user_id<>'' AND status<>'revoked';
CREATE INDEX IF NOT EXISTS idx_store_social_connections_store_provider ON store_social_connections(store_id,provider,status);

CREATE TABLE IF NOT EXISTS social_oauth_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  provider varchar(32) NOT NULL,
  state_hash varchar(128) NOT NULL UNIQUE,
  pkce_verifier_encrypted text NOT NULL DEFAULT '',
  redirect_uri text NOT NULL,
  return_path text NOT NULL DEFAULT '/settings/social',
  status varchar(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','completed','failed','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_oauth_store_created ON social_oauth_transactions(store_id,created_at DESC);

CREATE TABLE IF NOT EXISTS store_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind varchar(16) NOT NULL DEFAULT 'image' CHECK (kind IN ('image','video','document')),
  name text NOT NULL DEFAULT '',
  url text NOT NULL,
  thumbnail_url text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  source varchar(24) NOT NULL DEFAULT 'upload',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_media_assets_store_created ON store_media_assets(store_id,created_at DESC);

CREATE TABLE IF NOT EXISTS store_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','scheduled','publishing','published','partial','failed')),
  base_text text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  provider_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at timestamptz,
  timezone varchar(80) NOT NULL DEFAULT 'America/Santo_Domingo',
  promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_social_posts_schedule ON store_social_posts(status,scheduled_at) WHERE status='scheduled';
CREATE INDEX IF NOT EXISTS idx_store_social_posts_store_updated ON store_social_posts(store_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS store_social_post_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES store_social_posts(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES store_social_connections(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','publishing','published','failed')),
  provider_post_id text NOT NULL DEFAULT '',
  provider_url text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id,connection_id)
);
CREATE INDEX IF NOT EXISTS idx_social_delivery_retry ON store_social_post_deliveries(post_id,status);

CREATE TABLE IF NOT EXISTS store_google_business_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  location_enabled boolean NOT NULL DEFAULT true,
  reviews_enabled boolean NOT NULL DEFAULT true,
  posts_enabled boolean NOT NULL DEFAULT true,
  hours_enabled boolean NOT NULL DEFAULT true,
  connection_id uuid REFERENCES store_social_connections(id) ON DELETE SET NULL,
  last_sync_direction varchar(20) NOT NULL DEFAULT '',
  last_synced_at timestamptz,
  review_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_evaluation_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  question text NOT NULL DEFAULT '¿Cómo valoras la atención recibida?',
  options jsonb NOT NULL DEFAULT '[{"score":1,"label":"Mala"},{"score":2,"label":"Regular"},{"score":3,"label":"Buena"},{"score":4,"label":"Muy Buena"},{"score":5,"label":"Excelente"}]'::jsonb,
  feedback_enabled boolean NOT NULL DEFAULT true,
  feedback_max_score smallint NOT NULL DEFAULT 2 CHECK (feedback_max_score BETWEEN 1 AND 5),
  feedback_message text NOT NULL DEFAULT 'Gracias por tu respuesta. ¿En qué podemos mejorar nuestro servicio?',
  google_review_enabled boolean NOT NULL DEFAULT false,
  google_review_min_score smallint NOT NULL DEFAULT 1 CHECK (google_review_min_score BETWEEN 1 AND 5),
  google_review_message text NOT NULL DEFAULT 'Gracias por compartir tu valoración. Si deseas, también puedes compartir tu experiencia en Google:',
  thank_you_message text NOT NULL DEFAULT 'Gracias por evaluar nuestra atención. Tu opinión es muy importante para nosotros.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_customer_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL,
  agent_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  label text NOT NULL DEFAULT '',
  feedback text NOT NULL DEFAULT '',
  source varchar(20) NOT NULL DEFAULT 'whatsapp',
  google_review_requested boolean NOT NULL DEFAULT false,
  google_review_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_customer_evaluations_store_created ON store_customer_evaluations(store_id,created_at DESC);

CREATE TABLE IF NOT EXISTS store_evaluation_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL,
  agent_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  state varchar(20) NOT NULL DEFAULT 'rating' CHECK (state IN ('rating','feedback','completed')),
  evaluation_id uuid REFERENCES store_customer_evaluations(id) ON DELETE SET NULL,
  settings_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_message_id text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id,conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_store_evaluation_pending_state ON store_evaluation_pending(store_id,state,expires_at);
