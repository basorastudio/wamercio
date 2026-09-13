CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'platform',
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  category text NOT NULL DEFAULT 'system',
  event_key text NOT NULL,
  name text NOT NULL,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  allow_business_override boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_scope_check CHECK (scope IN ('platform','business')),
  CONSTRAINT notification_templates_channel_check CHECK (channel IN ('whatsapp')),
  CONSTRAINT notification_templates_scope_tenant_check CHECK (
    (scope='platform' AND tenant_id IS NULL) OR
    (scope='business' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_platform_event
  ON notification_templates(event_key)
  WHERE scope='platform';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_business_event
  ON notification_templates(tenant_id,event_key)
  WHERE scope='business';

CREATE INDEX IF NOT EXISTS idx_notification_templates_scope_category
  ON notification_templates(scope,category,enabled,updated_at DESC);

INSERT INTO notification_templates (scope, channel, category, event_key, name, body, enabled, allow_business_override, created_by, updated_by)
VALUES
  ('platform','whatsapp','system','system.welcome','Bienvenida a WAMERCIO','Hola {{cliente}}, bienvenido a {{negocio}}. Ya puedes utilizar los servicios disponibles en WAMERCIO.',true,true,'system','system'),
  ('platform','whatsapp','registration','registration.client.completed','Registro de cliente completado','Hola {{cliente}}, tu cuenta fue creada correctamente en {{negocio}}.',true,true,'system','system'),
  ('platform','whatsapp','registration','registration.owner.created','Nuevo propietario registrado','Hola {{cliente}}, tu acceso administrativo a {{negocio}} fue creado correctamente.',true,true,'system','system'),
  ('platform','whatsapp','orders','order.created','Pedido recibido','Hola {{cliente}}, recibimos tu pedido {{pedido_id}} en {{negocio}}. {{mensaje}}',true,true,'system','system'),
  ('platform','whatsapp','orders','order.status.changed','Estado del pedido actualizado','Hola {{cliente}}, tu pedido {{pedido_id}} cambió al estado: {{estado}}. {{mensaje}}',true,true,'system','system'),
  ('platform','whatsapp','payments','store_credit.payment.recorded','Abono de fiado registrado','Hola {{cliente}}, registramos un abono de RD$ {{monto}}. Saldo pendiente: RD$ {{saldo}}.',true,true,'system','system'),
  ('platform','whatsapp','security','security.access.changed','Cambio de acceso','Hola {{cliente}}, se realizó un cambio de seguridad en tu acceso a {{negocio}}.',true,true,'system','system')
ON CONFLICT DO NOTHING;

INSERT INTO platform_settings (key,value,updated_at)
VALUES ('notification_templates_seeded_v1','true'::jsonb,now())
ON CONFLICT (key) DO NOTHING;
