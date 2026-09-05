import {NextResponse} from "next/server";
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params; const base=process.env.API_INTERNAL_URL||'http://api:8080';
  const r=await fetch(`${base}/api/v1/public/tenants/${slug}`,{cache:'no-store'}); if(!r.ok)return NextResponse.json({},{status:404});
  const d=await r.json(); const t=d.tenant;
  return NextResponse.json({name:t.Name,short_name:t.Name.slice(0,20),description:t.Description||'',start_url:`/t/${slug}`,scope:`/t/${slug}`,display:'standalone',background_color:'#ffffff',theme_color:t.Accent||'#ff5400',icons:[]},{headers:{'Content-Type':'application/manifest+json'}})
}
