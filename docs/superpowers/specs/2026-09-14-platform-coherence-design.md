# WAMERCIO Platform Coherence Design

## Goal

Make WAMERCIO behave like one coherent conversational-commerce platform whose terminology, checkout, catalog editor, POS and configuration adapt to the registered business type instead of only changing labels.

## Audit findings

1. `business_templates.settings` already defines capabilities (`supports_variants`, `supports_extras`, `appointments`, `quotation`, `personalization`, `checkout_fields`, etc.), but most of the web application ignores them.
2. `checkout_fields` is seeded for bakeries, salons, barbershops, florists, personalized gifts and wholesalers, but it is never rendered or persisted by the public checkout.
3. The product editor always exposes variants/extras and always starts with the same stock behavior, even when the business template says otherwise.
4. `Mesas y reservas` can be enabled for any business although it is primarily a food/restaurant capability.
5. Service businesses use the generic “Recoger” vocabulary even though the customer is booking/attending a service at the premises.
6. The storefront uses a mixture of “Mi pedido” and “Mi compra” for the pre-order cart.
7. Landing defaults still mention “pago al recibir” after the product terminology was changed to “Tarjeta en terminal”.
8. The template administration UI cannot edit most of the capabilities that the template model already supports.
9. Order detail APIs do not expose `custom_fields`, making business-specific checkout information invisible after submission.
10. The historical internal key `cash_on_delivery` now represents “Tarjeta en terminal”. It will be preserved as an API/database compatibility key in this release while all customer-facing copy remains canonical.

## Design

### Central capability resolver

Add one frontend resolver that translates `business_engine + template_config` into stable capabilities: item labels, primary action, variants/extras support, stock default, dine-in support, appointments, quotation/personalization/wholesale flags, checkout fields, modality labels and contextual nouns. Existing stores with missing configuration receive safe defaults.

### Context-aware merchant UI

The product editor uses the resolver to hide unsupported variant/extra editors, apply template stock defaults on new products, and show the configured variant hint. Sales settings only offer tables/reservations to businesses that support dine-in. Service businesses receive contextual copy instead of restaurant/pickup language.

### Context-aware storefront checkout

The cart becomes consistently “Mi compra”. Delivery/pickup labels adapt to business type. Template `checkout_fields` render before notes using text, number, date, time, textarea and select inputs. Required fields are validated client-side and sent as `custom_fields`. The primary product CTA is contextual (`Comprar`, `Reservar`, `Cotizar`, etc.) while editing remains “Actualizar mi compra”.

### Server validation and order persistence

The public checkout loads `template_config`, validates required configured checkout fields, sanitizes them to known keys, persists them to `orders.custom_fields`, and sets `flow_type='reservation'` for table/appointment-oriented purchases while keeping normal orders compatible. Merchant and customer order detail APIs expose both `custom_fields` and `flow_type`.

### Template administration

SuperAdmin template editing exposes existing capability flags and a compact checkout-field editor, so future business types can be created without code changes. Seed data is enriched with explicit `supports_dine_in` for food businesses where tables make sense.

### Consistency cleanup

Update stale landing payment wording, template documentation and cart terminology. Preserve legacy internal payment keys only for compatibility and document that decision.

## Verification

Add regression tests for capability resolution, contextual checkout fields, API persistence/exposure, template editor controls, terminology and existing 2.5.8 suites. Run the full `verify-2.5.8.sh` suite against the packaged release.
