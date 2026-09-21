#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }
f=apps/web/app/admin/settings/page.tsx
grep -q "type SettingsSectionItem = readonly" "$f" || fail "SettingsSectionItem type missing"
grep -q "type SettingsSectionGroup = readonly" "$f" || fail "SettingsSectionGroup type missing"
grep -Fq "const sections: readonly SettingsSectionGroup[]=" "$f" || fail "sections explicit type missing"
grep -q "type LucideIcon" "$f" || fail "LucideIcon type missing"
# Regression: the old literal inference caused Next/TypeScript to narrow every group to the first id (general).
if sed -n '1,18p' "$f" | grep -q "] as const"; then fail "sections must not use literal as const inference"; fi
echo "PASS: Centro SaaS sections have stable explicit TypeScript types"
