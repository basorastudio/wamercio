export type StorefrontBrand={name:string;logo_url?:string;primary_color?:string;theme_config?:any}

function ensureMeta(name:string){
  let node=document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement|null
  if(!node){node=document.createElement('meta');node.name=name;document.head.appendChild(node)}
  return node
}
function ensureLink(rel:string){
  let node=document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement|null
  if(!node){node=document.createElement('link');node.rel=rel;document.head.appendChild(node)}
  return node
}
export function storeBrandColor(brand:StorefrontBrand){return String(brand?.theme_config?.colors?.primary||brand?.primary_color||'#36b385')}
export function applyStoreBrowserBrand(brand:StorefrontBrand){
  if(typeof document==='undefined'||!brand?.name)return
  const color=storeBrandColor(brand)
  document.title=brand.name
  ensureMeta('theme-color').content=color
  ensureMeta('application-name').content=brand.name
  const appleTitle=ensureMeta('apple-mobile-web-app-title');appleTitle.content=brand.name
  const manifest=ensureLink('manifest');manifest.href=`/manifest.webmanifest?tenant=${encodeURIComponent(window.location.hostname)}&v=4.3.1`
  const fallbackIcon=`/tenant-icon.svg?tenant=${encodeURIComponent(window.location.hostname)}&v=4.3.1`
  const logo=brand.logo_url||fallbackIcon
  const icon=ensureLink('icon');icon.href=logo
  const shortcut=ensureLink('shortcut icon');shortcut.href=logo
  const apple=ensureLink('apple-touch-icon');apple.href=logo
}
