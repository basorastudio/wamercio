from pathlib import Path

root = Path(__file__).resolve().parents[1]
owners = (root / 'apps/web/app/admin/owners/page.tsx').read_text(encoding='utf-8')
landing_editor = (root / 'apps/web/app/admin/landing/page.tsx').read_text(encoding='utf-8')
landing_public = (root / 'apps/web/components/platform-landing.tsx').read_text(encoding='utf-8')

checks = {
    'verified owner identity fields are locked': 'const identityLocked=identityVerified' in owners and 'readOnly={identityLocked}' in owners and 'disabled={identityLocked}' in owners,
    'business whatsapp is prefilled from owner unless manually overridden': 'syncBusinessWhatsAppFromOwner' in owners and 'businessWhatsAppOverridden' in owners,
    'landing editor and preview own independent desktop scrolling': 'xl:h-[calc(100dvh-9rem)]' in landing_editor and 'xl:overflow-y-auto xl:overscroll-contain' in landing_editor,
    'landing editor exposes missing public landing sections': all(k in landing_editor for k in ['feature_1_title','process_title','plans_title','demo_title','closing_title','footer_text']),
    'public landing consumes editable section content': all(k in landing_public for k in ['landing.feature_1_title','landing.process_title','landing.plans_title','landing.demo_title','landing.closing_title','landing.footer_text']),
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    for name in failed:
        print('FAIL:', name)
    raise SystemExit(1)
print('PASS: owner identity lock, business WhatsApp inheritance and landing editor regressions')
