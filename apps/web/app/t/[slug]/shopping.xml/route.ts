function esc(v:any){return String(v??'').replace(/[<>&'\"]/g,(c)=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]||c))}
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params; const base=process.env.API_INTERNAL_URL||'http://api:8080'; const root=process.env.NEXT_PUBLIC_ROOT_DOMAIN||'localhost'; const scheme=root==='localhost'?'http':'https';
  const r=await fetch(`${base}/api/v1/public/tenants/${slug}/catalog`,{cache:'no-store'}); if(!r.ok)return new Response('No encontrado',{status:404});
  const d=await r.json(); const items=(d.products||[]).map((p:any)=>`<item><g:id>${esc(p.ID)}</g:id><title>${esc(p.Name)}</title><description>${esc(p.Description)}</description><link>${scheme}://${slug}.${root}/</link><g:price>${Number(p.OnSale&&p.PromoPrice?p.PromoPrice:p.Price).toFixed(2)} DOP</g:price><g:availability>${p.TrackStock&&p.Stock<=0?'out_of_stock':'in_stock'}</g:availability>${p.ImageURL?`<g:image_link>${esc(`${scheme}://${slug}.${root}${p.ImageURL}`)}</g:image_link>`:''}</item>`).join('');
  const xml=`<?xml version="1.0" encoding="UTF-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>${esc(d.tenant.Name)}</title><link>${scheme}://${slug}.${root}/</link><description>${esc(d.tenant.Description)}</description>${items}</channel></rss>`;
  return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8'}})
}
