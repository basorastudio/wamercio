CREATE TABLE IF NOT EXISTS platform_territory_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  message text NOT NULL DEFAULT '',
  changes_detected boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'api.digital.gob.do',
  province_count integer NOT NULL DEFAULT 0,
  district_count integer NOT NULL DEFAULT 0,
  neighborhood_count integer NOT NULL DEFAULT 0,
  custom_neighborhood_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_territory_sync_events_created_at
  ON platform_territory_sync_events (created_at DESC);
