# WAMERCIO Store Scope and QR Design

## Goal

Add a scannable QR for each business to the mobile preview, remove the redundant tables-management callout from sales settings, and add a persistent territorial service scope that controls which address selectors customers see and which addresses the API accepts.

## Store service scope

Each store has `service_scope` with one of three values:

- `national`: customers choose Province, Municipio / Distrito and Barrio.
- `provincial`: the store province is fixed from the store territorial identity; customers choose Municipio / Distrito and Barrio.
- `municipal`: the store province and municipality/district are fixed; customers choose Barrio.

Existing stores default to `national`. Provincial scope requires a store province. Municipal scope requires both a store province and municipality/district.

The store settings API returns the store territory anchor fields (`province_code`, `province`, `city_id`, `municipality`, `neighborhood_id`, `neighborhood`) together with `service_scope`. The public storefront API returns the same scope and anchor values so customer registration and address management can render the correct controls.

## Server-side enforcement

Customer registration, customer address create/update, and checkout normalize fixed territory levels from the store configuration. A provincial store always uses its own province. A municipal store always uses its own province and municipality/district. Required territory values are validated after normalization. Checkout rejects saved delivery addresses that no longer fit the current store scope.

Requests that are not associated with a tenant storefront remain globally valid and use national behavior, preserving the global customer account model.

## Merchant settings UX

`Mi negocio` adds an `Alcance del negocio` section with three selectable cards: Nacional, Provincial and Municipal. The current store territory is shown in the option copy. Provincial/Municipal options are disabled when the required store anchor does not exist.

The right-side mobile preview keeps the existing phone mockup and adds a QR block beneath it using the store public URL. The QR is generated with the existing `qrcode.react` dependency.

The redundant `Gestión de mesas habilitada` panel is removed from `Ventas y entrega`; the existing `Mesas y reservas` switch and the dedicated `Gestión de mesas` navigation remain authoritative.

## Customer UX

The customer registration modal and saved-address form use the public store scope:

- national -> Province + Municipio / Distrito + Barrio
- provincial -> Municipio / Distrito + Barrio, with province fixed silently from the store
- municipal -> Barrio, with province and municipality fixed silently from the store

When GEO RD MAP is unavailable, fixed levels stay fixed and only the variable levels fall back to text entry.

## Tests

Regression tests cover the migration, settings QR and scope cards, removal of the tables callout, public/settings API fields, customer selector visibility, and server-side scope normalization. Go unit tests cover the pure address-scope normalization rules.
