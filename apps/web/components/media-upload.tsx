"use client";
import {useState} from "react";
import {Upload} from "lucide-react";
export function MediaUpload({value,onChange,label='Subir imagen'}:{value:string,onChange:(v:string)=>void,label?:string}){
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('');
  async function upload(file:File){setBusy(true);setErr('');const fd=new FormData();fd.append('file',file);try{const r=await fetch('/api/backend/api/v1/media',{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'Error al subir');onChange(d.url)}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
  return <div><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm font-bold text-gray-600"><Upload size={18}/>{busy?'Subiendo...':label}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>{value&&<div className="mt-2 text-xs text-gray-500 break-all">{value}</div>}{err&&<div className="mt-2 text-xs text-red-600">{err}</div>}</div>
}
