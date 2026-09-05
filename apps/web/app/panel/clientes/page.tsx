"use client";
import {useQuery} from "@tanstack/react-query";
import {BadgeCheck, ShieldX} from "lucide-react";
import {api} from "@/lib/api";

export default function Customers(){
 const q=useQuery({queryKey:["customers"],queryFn:()=>api<any>("/api/v1/dashboard/customers")});
 return <div><div><h1 className="text-3xl font-black">Clientes</h1><p className="mt-1 text-sm text-gray-500">Clientes vinculados a este negocio e identidad verificada cuando corresponda.</p></div><div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-soft"><table className="w-full min-w-[980px] text-sm"><thead className="bg-gray-50 text-left"><tr><th className="p-4">Cliente</th><th>Identidad</th><th>WhatsApp</th><th>Fecha nac.</th><th>Sexo</th><th>Pedidos</th><th>Puntos</th><th>Desde</th></tr></thead><tbody>{(q.data?.customers||[]).map((c:any)=><tr className="border-t border-gray-100" key={c.ID}><td className="p-4"><div className="font-bold">{c.Name}</div>{c.Email&&<div className="text-xs text-gray-400">{c.Email}</div>}</td><td>{c.IdentityVerified?<span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700"><BadgeCheck size={14}/> {c.DocumentMasked||"Verificada"}</span>:<span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500"><ShieldX size={14}/> Sin verificar</span>}</td><td>{c.WhatsApp}</td><td>{c.BirthDate||"—"}</td><td>{c.Sex==="M"?"Masculino":c.Sex==="F"?"Femenino":c.Sex||"—"}</td><td>{c.TotalOrders}</td><td>{c.Points}</td><td>{c.CreatedAt}</td></tr>)}</tbody></table></div></div>
}
