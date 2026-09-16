'use client'
import {useEffect,useMemo,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api} from '@/lib/api'
import {Alert,Loading,PageEmpty,Switch} from '@/components/ui'
import {Banknote,Landmark,CreditCard,Save,Truck,Store as StoreIcon,UtensilsCrossed,Check} from 'lucide-react'

type PaymentMethod='cash'|'cash_on_delivery'|'bank_transfer'
type Fulfillment='delivery'|'pickup'|'dine_in'
type Rules=Record<Fulfillment,Record<PaymentMethod,boolean>>

const methodMeta:Record<PaymentMethod,{label:string;short:string}>={
 cash:{label:'Efectivo',short:'Efectivo'},
 cash_on_delivery:{label:'Tarjeta en terminal',short:'Tarjeta'},
 bank_transfer:{label:'Transferencia electrónica',short:'Transferencia'},
}
function normalizeRules(settings:any):Rules{
 const raw=settings?.payment_methods_by_fulfillment||{}
 const globals:Record<PaymentMethod,boolean>={cash:!!settings?.cash_enabled,cash_on_delivery:!!settings?.cash_on_delivery_enabled,bank_transfer:!!settings?.bank_transfer_enabled}
 const modes:Fulfillment[]=['delivery','pickup','dine_in'],methods:PaymentMethod[]=['cash','cash_on_delivery','bank_transfer']
 const out:any={}
 for(const mode of modes){out[mode]={};for(const method of methods)out[mode][method]=typeof raw?.[mode]?.[method]==='boolean'?raw[mode][method]:globals[method]}
 return out as Rules
}

export default function PaymentMethods(){
 const[store,setStore]=useState(''),[data,setData]=useState<any>(null),[banks,setBanks]=useState<any[]>([]),[loading,setLoading]=useState(false),[err,setErr]=useState(''),[saved,setSaved]=useState(false)
 useEffect(()=>{if(!store){setData(null);return};setLoading(true);setErr('');Promise.all([api(`/stores/${store}/settings`),api<any[]>('/banks')]).then(([settings,bankRows])=>{setData({...settings,bank_account_type:String(settings?.bank_account_type||'').toLowerCase()==='ahorros'?'Ahorros':String(settings?.bank_account_type||'').toLowerCase()==='corriente'?'Corriente':'',payment_methods_by_fulfillment:normalizeRules(settings)});setBanks(bankRows)}).catch((e:any)=>setErr(e.message)).finally(()=>setLoading(false))},[store])
 const globals=useMemo<Record<PaymentMethod,boolean>>(()=>({cash:!!data?.cash_enabled,cash_on_delivery:!!data?.cash_on_delivery_enabled,bank_transfer:!!data?.bank_transfer_enabled}),[data])
 const fulfillments=useMemo(()=>data?([
  data.delivery_enabled?{key:'delivery' as Fulfillment,label:'Delivery',detail:'Entrega a domicilio',icon:Truck}:null,
  data.pickup_enabled?{key:'pickup' as Fulfillment,label:'Recoger',detail:'Retiro en el negocio',icon:StoreIcon}:null,
  data.dine_in_enabled?{key:'dine_in' as Fulfillment,label:'Mesa',detail:'Reserva y consumo en el negocio',icon:UtensilsCrossed}:null,
 ].filter(Boolean) as {key:Fulfillment;label:string;detail:string;icon:any}[]):[],[data])
 const save=async()=>{setErr('');setSaved(false);try{await api(`/stores/${store}/settings`,{method:'PUT',body:JSON.stringify(data)});setSaved(true);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('wamercio:store-settings-changed',{detail:{store_id:store}}))}catch(e:any){setErr(e.message)}}
 const setRule=(mode:Fulfillment,method:PaymentMethod,value:boolean)=>setData((current:any)=>({...current,payment_methods_by_fulfillment:{...normalizeRules(current),[mode]:{...normalizeRules(current)[mode],[method]:value}}}))
 return <StoreShell title="Métodos de pago" subtitle="Controla cómo puede pagar el cliente en cada modalidad de pedido" context={<StoreSelector value={store} onChange={setStore}/>} actions={<button disabled={!store||!data} onClick={save} className="btn-primary"><Save className="h-4 w-4"/>Guardar cambios</button>}>
  {!store?<PageEmpty title="Selecciona un negocio" detail="Elige el negocio donde configurarás las formas de pago."/>:loading?<Loading/>:data&&<div className="space-y-5">{err&&<Alert text={err}/>} {saved&&<div className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">Métodos de pago actualizados.</div>}
   <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">WAMERCIO registra el método informado, pero no cobra ni autoriza transacciones electrónicas. Las transferencias y terminales físicas se verifican fuera de la plataforma.</div>
   <div className="grid gap-4 md:grid-cols-3">
    <article className="card p-5"><Banknote className="h-5 w-5 text-brand-600"/><h3 className="mt-3 font-semibold">Efectivo</h3><p className="mt-1 min-h-10 text-sm text-[#8d92aa]">El cliente paga al retirar o recibir.</p><div className="mt-4"><Switch checked={!!data.cash_enabled} onChange={v=>setData({...data,cash_enabled:v})} label="Aceptar efectivo"/></div></article>
    <article className="card p-5"><CreditCard className="h-5 w-5 text-brand-600"/><h3 className="mt-3 font-semibold">Tarjeta en terminal</h3><p className="mt-1 min-h-10 text-sm text-[#8d92aa]">El cliente paga con tarjeta en una terminal física al retirar o recibir.</p><div className="mt-4"><Switch checked={!!data.cash_on_delivery_enabled} onChange={v=>setData({...data,cash_on_delivery_enabled:v})} label="Aceptar tarjeta en terminal"/></div></article>
    <article className="card p-5"><Landmark className="h-5 w-5 text-brand-600"/><h3 className="mt-3 font-semibold">Transferencia electrónica</h3><p className="mt-1 min-h-10 text-sm text-[#8d92aa]">El cliente realiza una transferencia electrónica y el negocio valida el comprobante.</p><div className="mt-4"><Switch checked={!!data.bank_transfer_enabled} onChange={v=>setData({...data,bank_transfer_enabled:v})} label="Aceptar transferencia electrónica"/></div></article>
   </div>

   <section className="card p-5 sm:p-6">
    <div><p className="section-kicker">Control por pedido</p><h2 className="mt-1 text-lg font-semibold">Disponibilidad por modalidad</h2><p className="mt-1 text-sm leading-6 text-[#8d92aa]">Decide qué métodos aparecerán cuando el cliente elija Delivery, Recoger o Mesa. Un método desactivado arriba queda bloqueado en todas las modalidades.</p></div>
    {fulfillments.length?<div className="mt-5 grid gap-4 xl:grid-cols-3">{fulfillments.map(mode=>{const I=mode.icon;const rules=normalizeRules(data)[mode.key];return <article key={mode.key} className="rounded-2xl border border-[#e7ebe9] bg-[#fbfcfc] p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><I className="h-4 w-4"/></span><div><h3 className="font-semibold text-ink-900">{mode.label}</h3><p className="mt-0.5 text-xs text-[#8d92aa]">{mode.detail}</p></div></div><div className="mt-4 space-y-2">{(['cash','cash_on_delivery','bank_transfer'] as PaymentMethod[]).map(method=>{const globallyEnabled=globals[method];const checked=globallyEnabled&&!!rules[method];return <button key={method} type="button" disabled={!globallyEnabled} onClick={()=>setRule(mode.key,method,!rules[method])} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${globallyEnabled?'bg-white hover:border-brand-200':'cursor-not-allowed bg-slate-50 opacity-55'}`}><span className={`grid h-6 w-6 place-items-center rounded-lg border ${checked?'border-brand-500 bg-brand-500 text-white':'border-[#dfe3e8] bg-white text-transparent'}`}><Check className="h-3.5 w-3.5"/></span><span className="min-w-0 flex-1 text-sm font-medium text-ink-900">{methodMeta[method].label}</span>{!globallyEnabled&&<span className="text-[10px] font-semibold uppercase tracking-wide text-[#9aa0b4]">Desactivado</span>}</button>})}</div></article>})}</div>:<div className="mt-5 rounded-2xl border border-dashed border-[#dfe4e6] p-6 text-center text-sm text-[#8d92aa]">Activa al menos una modalidad de pedido en Configuración → Ventas y entrega.</div>}
   </section>

   {data.bank_transfer_enabled&&<section className="card p-5 sm:p-6"><h2 className="font-semibold">Cuenta de referencia</h2><p className="mt-1 text-sm text-[#8d92aa]">Estos datos se muestran al cliente cuando elige transferencia.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><label className="label">Banco</label><select className="field" value={data.bank_name||''} onChange={e=>setData({...data,bank_name:e.target.value})}><option value="">Selecciona un banco</option>{banks.map(b=><option key={b.id} value={b.name}>{b.short_name||b.name}</option>)}{data.bank_name&&!banks.some(b=>b.name===data.bank_name)&&<option value={data.bank_name}>{data.bank_name}</option>}</select></div><div><label className="label">Titular</label><input className="field" value={data.bank_account_name||''} onChange={e=>setData({...data,bank_account_name:e.target.value})}/></div><div><label className="label">Número de cuenta</label><input className="field" value={data.bank_account_number||''} onChange={e=>setData({...data,bank_account_number:e.target.value})}/></div><div><label className="label">Tipo de cuenta</label><select className="field" value={data.bank_account_type||''} onChange={e=>setData({...data,bank_account_type:e.target.value})}><option value="">Selecciona el tipo de cuenta</option><option value="Ahorros">Ahorros</option><option value="Corriente">Corriente</option></select></div></div></section>}
  </div>}
 </StoreShell>
}
