import {serverApi} from "@/lib/api";
import {Storefront} from "@/components/storefront";
import {Marketplace} from "@/components/marketplace";
import {notFound} from "next/navigation";
export default async function SitePage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  try { const data=await serverApi<any>(`/api/v1/public/tenants/${slug}/catalog`); return <Storefront data={data}/> }
  catch {
    try { const data=await serverApi<any>(`/api/v1/public/marketplaces/${slug}`); return <Marketplace data={data}/> }
    catch { return notFound() }
  }
}
