'use client'

import {useEffect,useState} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api,dateTime} from '@/lib/api'
import {Alert,Loading} from '@/components/ui'
import {KeyRound,Save,ShieldCheck,UserRound} from 'lucide-react'

type AdminMe={id:string;name:string;email:string;role:string;access:string[];created_at:string}

export default function SuperAdminProfile(){
  const[me,setMe]=useState<AdminMe|null>(null)
  const[form,setForm]=useState({name:'',email:''})
  const[password,setPassword]=useState({current_password:'',new_password:'',confirm_password:''})
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[notice,setNotice]=useState('')

  const load=async()=>{const x=await api<AdminMe>('/admin/me');setMe(x);setForm({name:x.name||'',email:x.email||''})}
  useEffect(()=>{load().catch((e:any)=>setError(e.message))},[])

  const save=async(e:React.FormEvent)=>{e.preventDefault();setError('');setNotice('');setBusy(true);try{await api('/admin/me',{method:'PATCH',body:JSON.stringify(form)});await load();window.dispatchEvent(new CustomEvent('wamercio:admin-profile-updated'));setNotice('Perfil actualizado correctamente.')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const changePassword=async(e:React.FormEvent)=>{e.preventDefault();setError('');setNotice('');if(password.new_password!==password.confirm_password){setError('La confirmación de la nueva contraseña no coincide.');return}if(password.new_password.length<8){setError('La nueva contraseña debe tener al menos 8 caracteres.');return}setBusy(true);try{await api('/admin/me/password',{method:'POST',body:JSON.stringify({current_password:password.current_password,new_password:password.new_password})});setPassword({current_password:'',new_password:'',confirm_password:''});setNotice('Contraseña actualizada correctamente.')}catch(e:any){setError(e.message)}finally{setBusy(false)}}

  return <SuperAdminShell title="Mi perfil" subtitle="Administra tu identidad de acceso al panel central de WAMERCIO.">
    {!me?<Loading/>:<div className="max-w-6xl space-y-5">
      {error&&<Alert text={error}/>} {notice&&<Alert type="success" text={notice}/>} 
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <form onSubmit={save} className="card p-5 sm:p-6">
          <div className="flex items-center gap-4"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#e3f6ea] text-[#0b5d3b]"><UserRound className="h-7 w-7"/></span><div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#0b5d3b]">Cuenta administrativa</div><h2 className="mt-1 text-xl font-bold text-[#0a3f2a]">{me.name}</h2><p className="mt-1 text-sm text-[#7f8a84]">{me.role==='superadmin'?'Superadministrador':'Administrador de plataforma'}</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><div><label className="label">Nombre *</label><input required className="field" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div><div><label className="label">Correo de acceso *</label><input required type="email" className="field" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></div></div>
          <div className="mt-6 flex flex-col gap-3 border-t border-[#efe7dc] pt-5 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-[#8b918d]">Cuenta creada: {dateTime(me.created_at)}</div><button disabled={busy} className="btn-primary"><Save className="h-4 w-4"/>{busy?'Guardando...':'Guardar cambios'}</button></div>
        </form>

        <form onSubmit={changePassword} className="card p-5 sm:p-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e3f6ea] text-[#0b5d3b]"><KeyRound className="h-5 w-5"/></span><h3 className="mt-4 text-lg font-bold text-[#0a3f2a]">Seguridad de acceso</h3><p className="mt-1 text-sm leading-6 text-[#7f8a84]">Cambia la contraseña utilizada para entrar al panel SuperAdmin.</p>
          <div className="mt-5 space-y-4"><div><label className="label">Contraseña actual</label><input required type="password" autoComplete="current-password" className="field" value={password.current_password} onChange={e=>setPassword(v=>({...v,current_password:e.target.value}))}/></div><div><label className="label">Nueva contraseña</label><input required minLength={8} type="password" autoComplete="new-password" className="field" value={password.new_password} onChange={e=>setPassword(v=>({...v,new_password:e.target.value}))}/></div><div><label className="label">Confirmar nueva contraseña</label><input required minLength={8} type="password" autoComplete="new-password" className="field" value={password.confirm_password} onChange={e=>setPassword(v=>({...v,confirm_password:e.target.value}))}/></div></div>
          <button disabled={busy} className="btn-secondary mt-5 w-full"><ShieldCheck className="h-4 w-4"/>Actualizar contraseña</button>
        </form>
      </div>
      <section className="card p-5 sm:p-6"><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#0b5d3b]">Permisos</div><h3 className="mt-1 text-lg font-bold text-[#0a3f2a]">Acceso a la plataforma</h3><p className="mt-1 text-sm text-[#7f8a84]">Los permisos se administran desde Usuarios SaaS y no se pueden modificar desde el propio perfil.</p><div className="mt-4 flex flex-wrap gap-2">{me.role==='superadmin'?<span className="rounded-full bg-[#e3f6ea] px-3 py-1.5 text-xs font-bold text-[#0b5d3b]">Acceso total de SuperAdmin</span>:(me.access||[]).map(x=><span key={x} className="rounded-full border border-[#e6ded1] bg-white px-3 py-1.5 text-xs font-semibold text-[#52615a]">{x}</span>)}</div></section>
    </div>}
  </SuperAdminShell>
}
