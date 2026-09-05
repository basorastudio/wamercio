import type {Metadata} from "next";
import {serverApi} from "@/lib/api";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;
  try{const d=await serverApi<any>(`/api/v1/public/tenants/${slug}`);const t=d.tenant;return {title:`${t.Name} | wamercio`,description:t.Description||'Catálogo y pedidos en línea',manifest:`/t/${slug}/manifest.webmanifest`,openGraph:{title:t.Name,description:t.Description||'',images:t.CoverURL?[t.CoverURL]:[]}}}catch{return {title:'wamercio'}}
}
export default function TenantLayout({children}:{children:React.ReactNode}){return children}
