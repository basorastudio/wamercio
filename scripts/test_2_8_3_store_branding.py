from pathlib import Path

root=Path(__file__).resolve().parents[1]
settings=(root/'apps/web/app/settings/store/page.tsx').read_text(encoding='utf-8')
nav=(root/'apps/web/components/settings-nav.tsx').read_text(encoding='utf-8')
storefront=(root/'apps/web/components/storefront.tsx').read_text(encoding='utf-8')
preview=(root/'apps/web/components/store-theme-preview.tsx').read_text(encoding='utf-8')
themes=(root/'apps/web/lib/store-themes.ts').read_text(encoding='utf-8')
page=(root/'apps/web/app/page.tsx').read_text(encoding='utf-8')
layout=(root/'apps/web/app/layout.tsx').read_text(encoding='utf-8')
manifest=(root/'apps/web/app/manifest.webmanifest/route.ts').read_text(encoding='utf-8')
modal=(root/'apps/web/components/customer-access-modal.tsx').read_text(encoding='utf-8')

def need(text,needle,msg):
    assert needle in text,msg

def forbid(text,needle,msg):
    assert needle not in text,msg

# Parallel settings nav must stay fixed beside the canvas on desktop.
need(nav,"xl:sticky",'settings parallel navigation must be sticky on desktop')
need(nav,"xl:top-",'settings sticky navigation must define a top offset')

# The right preview should not repeat the preset name/explanatory paragraph requested for removal.
forbid(settings,"{resolvedTheme(form.visual_theme,form.theme_config).preset.name}",'settings preview must not show theme preset heading')
forbid(settings,"{previewTip}",'settings preview must not show explanatory preview copy')

# Hero overlay editor + persisted per-element visibility/position controls.
need(settings,"StoreHeroEditor",'settings must expose the draggable cover editor')
need(settings,"setHeroElement",'settings must persist hero element configuration')
for key in ('label','title','description','whatsapp','address'):
    need(themes,f"{key}?:Partial<StoreHeroElementConfig>",f'theme config must persist hero {key} visibility/position')
need((root/'apps/web/components/store-hero-editor.tsx').read_text(encoding='utf-8') if (root/'apps/web/components/store-hero-editor.tsx').exists() else '',"onPointerMove",'cover editor must support pointer drag positioning')
need(storefront,"resolvedHeroContent",'storefront must resolve persisted hero visibility/positions')
need(storefront,"heroElementStyle",'storefront must place cover elements from persisted positions')

# Public storefront must be tenant-branded, not platform-branded.
forbid(storefront,"${data.store.name} · WAMERCIO",'browser title must not append WAMERCIO')
forbid(storefront,"Impulsado por WAMERCIO",'public footer must not expose WAMERCIO branding')
forbid(storefront,"Puntos WAMERCIO",'loyalty label must be store-neutral')
need(storefront,"applyStoreBrowserBrand",'storefront must update browser/PWA branding from the current store')
need(modal,"brand?:StorefrontBrand",'customer access modal must accept store branding')
need(storefront,"brand={storefrontBrand}",'storefront must pass its branding to the access modal')

# Server metadata/viewport must be correct before hydration, including PWA install metadata.
need(layout,"generateMetadata",'root layout must generate dynamic tenant metadata for every storefront route')
need(layout,"generateViewport",'root layout must generate dynamic tenant viewport theme color')
need(layout,"title:{absolute:store.name}",'tenant title must be the store name only')
need(layout,"store.logo_url||`/tenant-icon.svg?tenant=",'tenant favicon must use store logo or tenant fallback')
need(layout,"manifest:`/manifest.webmanifest?",'tenant manifest URL must be versioned/dynamic')
need(manifest,"'X-Wamercio-Host':host",'manifest route must resolve the tenant through its host')

tenant_icon=(root/'apps/web/app/tenant-icon.svg/route.ts').read_text(encoding='utf-8')
need(tenant_icon,"'X-Wamercio-Host':host",'tenant fallback icon must resolve the business through host')
forbid(tenant_icon,'WAMERCIO','tenant fallback icon must never expose platform branding')
need(manifest,'fallbackIcon','tenant manifest must use a business-specific fallback icon')

# Mobile search must default collapsed and expand from a search icon button.
need(storefront,"mobileSearchExpanded",'storefront must track collapsed mobile search state')
need(storefront,"data-testid=\"storefront-mobile-search-toggle\"",'mobile header must expose only a search button initially')
need(storefront,"storefront-mobile-search-panel",'mobile search panel must render only when expanded')
need(storefront,"hidden md:block",'desktop search remains visible while mobile version is collapsed')

print('PASS: WAMERCIO 2.8.3 store branding and cover editor contract')
