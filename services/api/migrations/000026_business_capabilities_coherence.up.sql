-- Make dine-in/table support explicit without overwriting capabilities that an
-- administrator already configured. New/custom food templates inherit dine-in
-- unless they require lead time (bakery/pre-order style businesses).
UPDATE business_templates
SET settings = CASE
      WHEN coalesce(settings,'{}'::jsonb) ? 'supports_dine_in' THEN coalesce(settings,'{}'::jsonb)
      ELSE jsonb_set(
        coalesce(settings,'{}'::jsonb),
        '{supports_dine_in}',
        to_jsonb(engine='food' AND lower(coalesce(settings->>'requires_lead_time','false'))<>'true'),
        true
      )
    END,
    updated_at = now();

-- Existing stores preserve explicit overrides. Stores without the flag receive
-- the same engine-based default used by the application capability resolver.
UPDATE stores
SET template_config = CASE
      WHEN coalesce(template_config,'{}'::jsonb) ? 'supports_dine_in' THEN coalesce(template_config,'{}'::jsonb)
      ELSE jsonb_set(
        coalesce(template_config,'{}'::jsonb),
        '{supports_dine_in}',
        to_jsonb(business_engine='food' AND lower(coalesce(template_config->>'requires_lead_time','false'))<>'true'),
        true
      )
    END,
    updated_at = now();
