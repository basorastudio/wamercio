'use client'
import {useEffect,useState} from 'react'
import AdminShell from '@/components/store-shell'
import {api,dateTime} from '@/lib/api'
import {Alert,Loading} from '@/components/ui'
import PhoneInput from '@/components/phone-input'
import PinInput from '@/components/pin-input'
import {UserRound,ShieldCheck,KeyRound,Save} from 'lucide-react'

export default function Profile(){
 const[me,setMe]=useState<any>(null),[form,setForm]=useState<any>(null),[pin,setPin]=useState({current_pin:'',new_pin:''}),[err,setErr]=useState(''),[ok,setOk]=useState(''),[busy,setBusy]=useState(false)
 const load=()=>api('/me').then((x:any)=>{setMe(x);setForm({name:x.name,phone:x.phone||''})})
 useEffect(()=>{load()},[])
 const save=async(e:React.FormEvent)=>{e.preventDefault();setErr('');setOk('');setBusy(true);try{await api('/me',{method:'PATCH',body:JSON.stringify(form)});await load();setOk('Perfil actualizado correctamente.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const change=async(e:React.FormEvent)=>{e.preventDefault();setErr('');setOk('');if(!/^\d{4}$/.test(pin.current_pin)||!/^\d{4}$/.test(pin.new_pin)){setErr('Completa los 4 dígitos del PIN actual y del nuevo PIN.');return}setBusy(true);try{await api('/me/pin',{method:'POST',body:JSON.stringify({current_pin:pin.current_pin,new_pin:pin.new_pin})});setPin({current_pin:'',new_pin:''});setOk('PIN actualizado correctamente.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 return <AdminShell title="Mi cuenta" subtitle="WhatsApp, perfil y PIN de acceso">{!me||!form?<Loading/>:<div>{err&&<Alert text={err}/>} {ok&&<Alert text={ok} type="success"/>}<div className="grid gap-5 xl:grid-cols-[1fr_420px]">
  <form onSubmit={save} className="card p-5 sm:p-6"><div className="flex items-center gap-4"><div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><UserRound className="h-7 w-7"/></div><div><h2 className="text-xl font-bold">{me.name}</h2><p className="text-sm text-[#8d92aa]">Cuenta comercial WAMERCIO</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div><label className="label">Nombre</label><input className="field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><label className="label">WhatsApp de acceso</label><PhoneInput value={form.phone} onChange={value=>setForm({...form,phone:value})} required/><p className="mt-1 text-xs text-[#a2a6b8]">Este número funciona como tu usuario.</p></div></div><div className="mt-6 flex flex-col gap-3 border-t border-[#f0f1f5] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#a2a6b8]">Cuenta creada: {dateTime(me.created_at)}</p><button disabled={busy} className="btn-primary"><Save className="h-4 w-4"/>Guardar cambios</button></div></form>
  <form onSubmit={change} className="card p-5 sm:p-6"><div className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><ShieldCheck/></div><h3 className="mt-4 text-lg font-bold">PIN de acceso</h3><p className="mt-1 text-sm leading-6 text-[#8d92aa]">Usa cuatro dígitos fáciles de recordar y difíciles de adivinar.</p><div className="mt-5 space-y-5"><div><label className="label">PIN actual</label><PinInput value={pin.current_pin} onChange={value=>setPin({...pin,current_pin:value})} required label="PIN actual"/></div><div><label className="label">Nuevo PIN</label><PinInput value={pin.new_pin} onChange={value=>setPin({...pin,new_pin:value})} required label="Nuevo PIN"/></div></div><button disabled={busy} className="btn-secondary mt-5 w-full"><KeyRound className="h-4 w-4"/>Cambiar PIN</button></form>
 </div></div>}</AdminShell>
}
