-- WAMERCIO 2.8.4: WhatsApp self-chat hygiene and registered-customer recognition.
-- A registered global customer is a customer before the first purchase; an unknown
-- WhatsApp identity remains a contact until it registers or completes a purchase.

-- Remove conversations accidentally created from the business's own WhatsApp
-- identity. Messages are removed through ON DELETE CASCADE.
DELETE FROM conversations c
USING whatsapp_sessions ws
WHERE c.store_id=ws.store_id
  AND (
    lower(c.remote_jid)=lower(coalesce(ws.jid,''))
    OR (
      regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g')<>''
      AND regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g')=regexp_replace(coalesce(ws.phone,''),'[^0-9]','','g')
    )
    OR (
      split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net'
      AND regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g')=regexp_replace(coalesce(ws.phone,''),'[^0-9]','','g')
    )
  );

-- Reuse any pre-existing local CRM row that already carries the same normalized
-- phone, even if an older version stored it with punctuation or a leading plus sign.
UPDATE customers cu
SET global_customer_id=g.id,
    name=trim(concat_ws(' ',g.name,nullif(g.last_name,''))),
    status=CASE WHEN cu.status='blocked' THEN cu.status ELSE 'active' END,
    updated_at=now()
FROM global_customers g
WHERE g.status='active'
  AND coalesce(g.pin_hash,'')<>''
  AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(g.phone,''),'[^0-9]','','g')
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.store_id=cu.store_id
      AND coalesce(
        nullif(regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g'),''),
        CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net'
             THEN regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g')
             ELSE '' END
      )=regexp_replace(coalesce(g.phone,''),'[^0-9]','','g')
  );

-- Materialize the store relationship when a WhatsApp conversation belongs to a
-- registered WAMERCIO customer. DISTINCT ON prevents duplicate LID/PN aliases from
-- trying to insert the same store + phone more than once in the same statement.
INSERT INTO customers(store_id,global_customer_id,name,phone,status)
SELECT DISTINCT ON (c.store_id,g.phone)
       c.store_id,
       g.id,
       trim(concat_ws(' ',g.name,nullif(g.last_name,''))),
       g.phone,
       'active'
FROM conversations c
JOIN global_customers g
  ON regexp_replace(coalesce(g.phone,''),'[^0-9]','','g') =
     coalesce(
       nullif(regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g'),''),
       CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net'
            THEN regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g')
            ELSE '' END
     )
WHERE g.status='active'
  AND coalesce(g.pin_hash,'')<>''
  AND coalesce(g.phone,'')<>''
  AND NOT EXISTS (
    SELECT 1 FROM customers cu
    WHERE cu.store_id=c.store_id
      AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(g.phone,''),'[^0-9]','','g')
  )
ORDER BY c.store_id,g.phone,c.updated_at DESC
ON CONFLICT(store_id,phone) DO UPDATE SET
  global_customer_id=EXCLUDED.global_customer_id,
  name=EXCLUDED.name,
  status=CASE WHEN customers.status='blocked' THEN customers.status ELSE 'active' END,
  updated_at=now();

-- Link all existing conversations to the store customer created/resolved above.
UPDATE conversations c
SET customer_id=cu.id,
    display_name=CASE WHEN coalesce(c.contact_name,'')='' THEN cu.name ELSE c.display_name END,
    updated_at=now()
FROM customers cu
JOIN global_customers g ON g.id=cu.global_customer_id
WHERE cu.store_id=c.store_id
  AND g.status='active'
  AND coalesce(g.pin_hash,'')<>''
  AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g') =
      coalesce(
        nullif(regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g'),''),
        CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net'
             THEN regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g')
             ELSE '' END
      );
