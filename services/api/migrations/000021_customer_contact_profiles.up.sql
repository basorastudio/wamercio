-- WAMERCIO 2.5.8: distinguish WhatsApp contacts from customers and persist WhatsApp profile metadata.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS contact_name varchar(190),
  ADD COLUMN IF NOT EXISTS contact_address text,
  ADD COLUMN IF NOT EXISTS contact_notes text,
  ADD COLUMN IF NOT EXISTS contact_status varchar(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS whatsapp_name varchar(190),
  ADD COLUMN IF NOT EXISTS whatsapp_phone varchar(40),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS profile_picture_id varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_phone ON conversations(store_id, whatsapp_phone);

-- Preserve useful CRM data from legacy rows that were created automatically for every WhatsApp contact.
UPDATE conversations c
SET contact_name = coalesce(nullif(c.contact_name,''), nullif(cu.name,''), nullif(c.display_name,'')),
    contact_address = coalesce(nullif(c.contact_address,''), nullif(cu.address,'')),
    contact_notes = coalesce(nullif(c.contact_notes,''), nullif(cu.notes,'')),
    contact_status = coalesce(nullif(cu.status,''), c.contact_status),
    whatsapp_phone = coalesce(nullif(c.whatsapp_phone,''), nullif(cu.phone,''))
FROM customers cu
WHERE c.customer_id=cu.id
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id=cu.id AND o.status<>'canceled'
  );

-- A WhatsApp contact only becomes a customer when it has a non-canceled order.
UPDATE conversations c
SET customer_id=NULL
WHERE c.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id=c.customer_id AND o.status<>'canceled'
  );

UPDATE conversations
SET whatsapp_name = coalesce(nullif(whatsapp_name,''), nullif(display_name,'')),
    whatsapp_phone = coalesce(
      nullif(whatsapp_phone,''),
      CASE WHEN split_part(lower(remote_jid),'@',2)='s.whatsapp.net'
           THEN regexp_replace(split_part(remote_jid,'@',1),'[^0-9]','','g')
           ELSE NULL END
    )
WHERE split_part(lower(remote_jid),'@',2) IN ('s.whatsapp.net','lid');

-- Link legacy WhatsApp conversations to real customers by phone when a purchase already exists.
UPDATE conversations c
SET customer_id = (
  SELECT cu.id
  FROM customers cu
  WHERE cu.store_id=c.store_id
    AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g') = regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g')
    AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g') <> ''
    AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=cu.id AND o.status<>'canceled')
  ORDER BY cu.last_order_at DESC NULLS LAST,cu.created_at DESC
  LIMIT 1
)
WHERE c.customer_id IS NULL
  AND split_part(lower(c.remote_jid),'@',2) IN ('s.whatsapp.net','lid')
  AND regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g') <> ''
  AND EXISTS (
    SELECT 1 FROM customers cu
    WHERE cu.store_id=c.store_id
      AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g') = regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g')
      AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=cu.id AND o.status<>'canceled')
  );

-- Keep customer purchase statistics aligned with the same non-canceled purchase rule.
UPDATE customers c
SET order_count = stats.cnt,
    total_spent = stats.spent,
    last_order_at = stats.last_at,
    updated_at = now()
FROM (
  SELECT c2.id,
         count(o.id) FILTER (WHERE o.status<>'canceled')::int AS cnt,
         coalesce(sum(o.total) FILTER (WHERE o.status<>'canceled'),0) AS spent,
         max(o.created_at) FILTER (WHERE o.status<>'canceled') AS last_at
  FROM customers c2
  LEFT JOIN orders o ON o.customer_id=c2.id
  GROUP BY c2.id
) stats
WHERE c.id=stats.id;
