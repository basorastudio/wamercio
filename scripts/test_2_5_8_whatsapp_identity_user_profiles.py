from pathlib import Path

def need(path, needle):
    text=Path(path).read_text()
    if needle not in text:
        raise SystemExit(f'FAIL: {path} missing {needle!r}')

# Migration/schema additions
need('services/api/migrations/000023_whatsapp_identity_user_profiles.up.sql', 'profile_picture_url')
need('services/api/migrations/000023_whatsapp_identity_user_profiles.up.sql', 'ALTER TABLE store_staff')
need('services/api/migrations/000023_whatsapp_identity_user_profiles.up.sql', 'ALTER TABLE whatsapp_sessions')
need('services/api/migrations/000023_whatsapp_identity_user_profiles.up.sql', 'ALTER TABLE support_whatsapp_session')

# Linked WhatsApp account profile surface
need('services/whatsapp-bridge/internal/bridge/bridge.go', 'refreshLinkedAccountProfile')
need('services/whatsapp-bridge/internal/bridge/bridge.go', 's.Client.Store.BusinessName')
need('services/whatsapp-bridge/internal/bridge/bridge.go', 's.Client.Store.PushName')
need('services/whatsapp-bridge/internal/bridge/bridge.go', 'profile_picture_url')
need('apps/web/app/settings/whatsapp/page.tsx', 'state.profile_picture_url')
need('apps/web/app/settings/whatsapp/page.tsx', 'state.whatsapp_name')
need('apps/web/app/admin/settings/page.tsx', 'wa.profile_picture_url')
need('apps/web/app/admin/settings/page.tsx', 'wa.whatsapp_name')

# Owner/customer profile surfaces
need('services/api/internal/httpapi/server.go', 'whatsapp_name')
need('apps/web/app/admin/owners/page.tsx', 'u.profile_picture_url')
need('apps/web/app/admin/owners/page.tsx', 'u.whatsapp_name')
need('apps/web/app/admin/global-customers/page.tsx', 'x.profile_picture_url')
need('apps/web/app/admin/global-customers/page.tsx', 'x.whatsapp_name')
need('apps/web/app/settings/profile/page.tsx', 'form.document_number')
need('apps/web/app/settings/profile/page.tsx', 'form.last_name')
need('apps/web/app/settings/profile/page.tsx', 'form.birth_date')
need('apps/web/app/settings/profile/page.tsx', 'form.gender')
need('apps/web/app/settings/profile/page.tsx', 'me.profile_picture_url')

# Staff form: WhatsApp first, identity fields, intl-tel-input component
staff=Path('apps/web/app/staff/page.tsx').read_text()
for needle in ["import PhoneInput", "document_number", "last_name", "birth_date", "gender", "<PhoneInput"]:
    if needle not in staff:
        raise SystemExit(f'FAIL: staff form missing {needle!r}')
order=[staff.find('WhatsApp *'),staff.find('Cédula *'),staff.find('Nombre *'),staff.find('Apellido'),staff.find('Fecha de nacimiento'),staff.find('Género')]
if any(i < 0 for i in order) or order != sorted(order):
    raise SystemExit(f'FAIL: staff identity field order incorrect: {order}')

# Staff API stores the new identity fields
need('services/api/internal/httpapi/server.go', 'UPDATE store_staff SET name=$1,last_name=')
need('services/api/internal/httpapi/server.go', 'identity_verified_at')

print('PASS: linked WhatsApp profiles, owner/customer identity surfaces and staff form regressions')
