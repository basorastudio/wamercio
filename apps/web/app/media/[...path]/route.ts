import {NextRequest,NextResponse} from "next/server";
export async function GET(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params; const base=process.env.API_INTERNAL_URL||"http://api:8080";
  const res=await fetch(`${base}/media/${path.join('/')}`,{cache:'no-store'});
  return new NextResponse(res.body,{status:res.status,headers:{'Content-Type':res.headers.get('content-type')||'application/octet-stream','Cache-Control':'public, max-age=86400'}})
}
