'use client'
import {useEffect,useMemo,useState} from 'react'
import {useParams} from 'next/navigation'
import {api,dateTime,money} from '@/lib/api'
import {Check,Clock3,FileCheck2,MessageCircleMore,PackageCheck,ShoppingBag,Store,Truck,UploadCloud} from 'lucide-react'

const steps=[
  ['pending','Recibido'],
  ['confirmed','Confirmado'],
  ['preparing','Preparando'],
  ['ready','Listo'],
  ['out_for_delivery','En camino'],
  ['delivered','Entregado'],
]
const aliases:any={processing:'preparing',picked_up:'delivered'}
const payLabel:any={cash:'Efectivo',cash_on_delivery:'Tarjeta en terminal',bank_transfer:'Transferencia electrónica',cheque:'Cheque'}

export default function OrderTracking(){
 const{token}=useParams<{token:string}>()
 const[data,setData]=useState<any>(null),[err,setErr]=useState(''),[proofBusy,setProofBusy]=useState(false),[proofMsg,setProofMsg]=useState('')
 const load=()=>api(`/public/orders/${token}`).then(setData).catch((e:any)=>setErr(e.message))
 const uploadProof=async(file?:File)=>{if(!file)return;setProofBusy(true);setProofMsg('');try{const form=new FormData();form.append('file',file);const out=await api<{url:string}>(`/public/orders/${token}/proof`,{method:'POST',body:form});setData((v:any)=>({...v,payment_proof_url:out.url}));setProofMsg('Comprobante enviado correctamente.')}catch(e:any){setProofMsg(e.message||'No se pudo enviar el comprobante')}finally{setProofBusy(false)}}
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t)},[token])
 const normalized=aliases[data?.status]||data?.status
 const currentIndex=useMemo(()=>steps.findIndex(([s])=>s===normalized),[normalized])
 if(err)return <div className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-6"><div className="card max-w-md p-8 text-center"><ShoppingBag className="mx-auto h-10 w-10 text-slate-300"/><h1 className="mt-4 text-xl font-semibold">Pedido no disponible</h1><p className="mt-2 text-sm text-[#8d92aa]">{err}</p></div></div>
 if(!data)return <div className="grid min-h-dvh place-items-center bg-[#f7f9fc] text-[#8d92aa]">Cargando pedido...</div>
 const canceled=data.status==='canceled'
 return <div className="min-h-dvh bg-[#f7f9fc] px-4 py-6 sm:py-10">
  <main className="mx-auto max-w-3xl">
   <header className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500 text-white"><Store className="h-5 w-5"/></div><div><h1 className="font-semibold text-ink-900">{data.store_name}</h1><p className="text-xs text-[#8d92aa]">Seguimiento de pedido</p></div>{data.store_whatsapp&&<a target="_blank" href={`https://wa.me/${String(data.store_whatsapp).replace(/\D/g,'')}`} className="btn-secondary ml-auto px-3"><MessageCircleMore className="h-4 w-4"/><span className="hidden sm:inline">WhatsApp</span></a>}</header>
   <section className="card overflow-hidden"><div className="bg-gradient-to-br from-[#2da87d] to-[#42bd91] p-6 text-white sm:p-8"><p className="text-sm text-white/75">Pedido #{data.number}</p><h2 className="mt-1 text-2xl font-semibold">{canceled?'Pedido cancelado':normalized==='delivered'?'¡Pedido completado!':'Estamos trabajando en tu pedido'}</h2><p className="mt-2 text-sm text-white/80">Hola, {data.customer_name}. Aquí puedes ver el estado más reciente sin crear una cuenta.</p></div>
    <div className="p-5 sm:p-7">
      {canceled?<div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">Este pedido fue cancelado. Si necesitas ayuda, comunícate con la tienda por WhatsApp.</div>:<div className="space-y-3">{steps.map(([key,label],i)=>{const done=currentIndex>=i;const active=currentIndex===i;return <div key={key} className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${done?'bg-brand-500 text-white':'bg-[#eef1f4] text-[#9aa0b4]'}`}>{done?<Check className="h-4 w-4"/>:<Clock3 className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><div className={`text-sm font-semibold ${active?'text-brand-700':'text-ink-900'}`}>{label}</div><div className="text-xs text-[#9aa0b4]">{active?'Estado actual':done?'Completado':'Pendiente'}</div></div></div>})}</div>}
      <div className="mt-7 border-t border-slate-100 pt-6"><h3 className="font-semibold text-ink-900">Resumen</h3><div className="mt-4 space-y-3">{data.items?.map((it:any,i:number)=><div key={i} className="flex items-start gap-3 rounded-2xl bg-[#fafbfe] p-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-600"><PackageCheck className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{it.quantity} × {it.product_name}</div>{it.variant_name&&<div className="text-xs text-[#8d92aa]">{it.variant_name}</div>}</div><strong className="text-sm">{money(it.line_total)}</strong></div>)}</div></div>
      <div className="mt-6 rounded-2xl border border-[#e9ebf2] p-4 text-sm"><div className="flex justify-between py-1"><span className="text-[#8d92aa]">Subtotal</span><strong>{money(data.subtotal)}</strong></div><div className="flex justify-between py-1"><span className="text-[#8d92aa]">Delivery</span><strong>{money(data.shipping)}</strong></div>{Number(data.discount)>0&&<div className="flex justify-between py-1"><span className="text-[#8d92aa]">Descuento</span><strong>- {money(data.discount)}</strong></div>}<div className="mt-2 flex justify-between border-t border-[#eef0f4] pt-3 text-base"><span className="font-semibold">Total</span><strong className="text-brand-700">{money(data.total)}</strong></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#fafbfe] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-brand-600"/>{data.delivery_type==='pickup'?'Recoger en tienda':'Delivery'}</div><p className="mt-1 text-xs text-[#8d92aa]">Modalidad de entrega</p></div><div className="rounded-2xl bg-[#fafbfe] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag className="h-4 w-4 text-brand-600"/>{payLabel[data.payment_method]||data.payment_method}</div><p className="mt-1 text-xs text-[#8d92aa]">Pago: {data.payment_status==='paid'?'Pagado':'Pendiente'}</p></div></div>
      {data.payment_method==='cash'&&<div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900">{data.cash_change_requested?<>Indicaste que pagarás con <strong>{money(data.cash_tendered)}</strong>. Vuelto estimado: <strong>{money(Math.max(0,Number(data.cash_tendered||0)-Number(data.total||0)))}</strong>.</>:<>Indicaste que pagarás el monto exacto.</>}</div>}
      {data.payment_method==='bank_transfer'&&data.payment_status==='pending'&&<div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/50 p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">{data.payment_proof_url?<FileCheck2 className="h-5 w-5"/>:<UploadCloud className="h-5 w-5"/>}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-ink-900">{data.payment_proof_url?'Comprobante recibido':'Envía tu comprobante'}</h3>{data.payment_account?.account_number&&<div className="mt-3 rounded-xl border border-brand-100 bg-white p-3 text-xs text-[#596178]"><div className="font-semibold text-ink-900">{data.payment_account.bank_name||data.payment_account.bank_short_name||'Cuenta bancaria'}</div><div className="mt-1">{data.payment_account.account_type||'Cuenta'} · <span className="font-semibold">{data.payment_account.account_number}</span></div>{data.payment_account.account_holder&&<div className="mt-1 text-[#7f879f]">Titular: {data.payment_account.account_holder}</div>}</div>}<p className="mt-2 text-xs leading-5 text-[#7f879f]">{data.payment_proof_url?'La tienda podrá revisarlo desde el pedido. Puedes reemplazarlo mientras el pago siga pendiente.':'Transfiere a la cuenta seleccionada y sube una foto o PDF del comprobante para agilizar la confirmación.'}</p><label className="btn-primary mt-3 cursor-pointer text-xs"><UploadCloud className="h-4 w-4"/>{proofBusy?'Subiendo...':data.payment_proof_url?'Reemplazar comprobante':'Subir comprobante'}<input type="file" accept="image/*,application/pdf" className="hidden" disabled={proofBusy} onChange={e=>{void uploadProof(e.target.files?.[0]);e.currentTarget.value=''}}/></label>{proofMsg&&<p className={`mt-2 text-xs ${proofMsg.includes('correctamente')?'text-emerald-700':'text-rose-700'}`}>{proofMsg}</p>}</div></div></div>}
      <p className="mt-6 text-center text-xs text-[#a0a5b8]">Creado {dateTime(data.created_at)} · Se actualiza automáticamente</p>
    </div>
   </section>
  </main>
 </div>
}
