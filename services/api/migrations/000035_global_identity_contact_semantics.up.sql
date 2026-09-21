-- WAMERCIO 2.8.5: global identity does not imply a commercial customer relationship.
-- A registered WAMERCIO identity may be displayed by legal name in any store, but
-- the store classifies it as Customer only after a non-canceled, non-quote purchase.

-- Undo the erroneous conversation linkage introduced by 2.8.4 for identities
-- that still have no qualifying purchase in this store. The global account remains
-- intact and can continue to sign in through platform-wide customer authentication.
UPDATE conversations c
SET customer_id=NULL,
    updated_at=now()
WHERE c.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id=c.customer_id
      AND o.status<>'canceled'
      AND o.flow_type<>'quote'
  );

-- Prefer the registered platform identity as the visible name while preserving
-- contact_name (merchant override) and whatsapp_name (WhatsApp profile) separately.
UPDATE conversations c
SET display_name=coalesce(nullif((
      SELECT trim(concat_ws(' ',g.name,nullif(g.last_name,'')))
      FROM global_customers g
      WHERE g.status='active'
        AND coalesce(g.pin_hash,'')<>''
        AND regexp_replace(coalesce(g.phone,''),'[^0-9]','','g')=coalesce(
          nullif(regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g'),''),
          CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net'
               THEN regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g') ELSE '' END
        )
      ORDER BY g.updated_at DESC
      LIMIT 1
    ),''),c.display_name),
    updated_at=now()
WHERE coalesce(c.contact_name,'')=''
  AND EXISTS (
    SELECT 1 FROM global_customers g
    WHERE g.status='active'
      AND coalesce(g.pin_hash,'')<>''
      AND regexp_replace(coalesce(g.phone,''),'[^0-9]','','g')=coalesce(
        nullif(regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g'),''),
        CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net'
             THEN regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g') ELSE '' END
      )
  );
