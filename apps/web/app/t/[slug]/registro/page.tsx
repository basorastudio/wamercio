import {serverApi} from "@/lib/api";
import {CustomerRegistration} from "@/components/customer-registration";
import {notFound} from "next/navigation";

export default async function RegisterCustomerPage({params}:{params:Promise<{slug:string}>}){
 const{slug}=await params;
 try{const data=await serverApi<any>(`/api/v1/public/tenants/${slug}`);return <main className="min-h-screen bg-[#f5f5f5] px-4 py-10"><div className="mx-auto max-w-2xl"><a href="/" className="text-sm font-bold text-[#ff5400]">← Volver a {data.tenant.Name}</a><div className="mt-5"><CustomerRegistration tenant={data.tenant}/></div></div></main>}catch{return notFound()}
}
