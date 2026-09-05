"use client";
import Link from "next/link";
import {useMemo,useState} from "react";
import {Search,MapPin,Store} from "lucide-react";
import {money} from "@/lib/api";

export function Marketplace({data}:{data:any}){
  const {marketplace,tenants,products}=data;
  const [q,setQ]=useState("");
  const filtered=useMemo(()=>products.filter((p:any)=>`${p.Name} ${p.TenantName}`.toLowerCase().includes(q.toLowerCase())),[products,q]);
  return <main className="min-h-screen bg-[#f5f5f5] pb-16" style={{'--brand':marketplace.Accent||'#ff5400'} as any}>
    <section className="bg-[#212529] text-white">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex items-center gap-2 text-sm text-white/60"><MapPin size={16}/>Marketplace local</div>
        <h1 className="mt-3 text-4xl font-black md:text-6xl">{marketplace.Name}</h1>
        <p className="mt-3 max-w-2xl text-white/70">{marketplace.Description}</p>
        <div className="relative mt-8 max-w-2xl"><Search className="absolute left-4 top-3.5 text-gray-400" size={20}/><input className="field pl-11 text-[#212529]" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar productos o comercios"/></div>
      </div>
    </section>
    <section className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-end justify-between"><div><p className="text-xs font-bold text-[var(--brand)]">COMERCIOS</p><h2 className="text-2xl font-black">Negocios disponibles</h2></div></div>
      <div className="hide-scrollbar mt-5 flex gap-4 overflow-x-auto pb-2">{tenants.map((t:any)=><Link href={`/t/${t.Slug}`} key={t.ID} className="min-w-64 rounded-2xl bg-white p-5 shadow-soft"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-2xl">{t.LogoURL?<img className="h-full w-full rounded-2xl object-cover" src={t.LogoURL}/>:<Store/>}</div><h3 className="mt-4 font-black">{t.Name}</h3><p className="mt-1 line-clamp-2 text-sm text-gray-500">{t.Description}</p><span className="mt-4 inline-flex text-sm font-bold text-[var(--brand)]">Ver catálogo →</span></Link>)}</div>
      <div className="mt-12"><p className="text-xs font-bold text-[var(--brand)]">PRODUCTOS</p><h2 className="text-2xl font-black">Productos del marketplace</h2></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{filtered.map((p:any)=>{const price=p.OnSale&&p.PromoPrice?p.PromoPrice:p.Price;return <Link href={`/t/${p.TenantSlug}`} key={p.ID} className="rounded-2xl bg-white p-4 shadow-soft"><div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-gray-100 text-4xl">{p.ImageURL?<img className="h-full w-full object-cover" src={p.ImageURL}/>:<>🛍️</>}</div><div className="mt-3 text-xs font-bold text-gray-400">{p.TenantName}</div><h3 className="mt-1 font-black">{p.Name}</h3><div className="mt-3 font-black text-[var(--brand)]">{money(price)}</div></Link>})}</div>
    </section>
  </main>
}
