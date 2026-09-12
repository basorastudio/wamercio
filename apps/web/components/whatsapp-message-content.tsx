'use client'

import {ContactRound,Download,FileText,Image as ImageIcon,MapPin,Mic,Sticker,Video} from 'lucide-react'

export type WhatsAppMessage={
  id:string
  message_id?:string
  direction:'in'|'out'
  type:string
  body:string
  status?:string
  media_url?:string
  mime_type?:string
  file_name?:string
  file_size?:number
  caption?:string
  occurred_at:string
}

const humanSize=(n?:number)=>{
  const v=Number(n||0)
  if(!v)return ''
  if(v<1024)return `${v} B`
  if(v<1024*1024)return `${(v/1024).toFixed(v<10240?1:0)} KB`
  return `${(v/1024/1024).toFixed(v<10*1024*1024?1:0)} MB`
}

const mapHref=(body:string)=>{
  const m=body.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  return m?`https://www.google.com/maps?q=${encodeURIComponent(`${m[1]},${m[2]}`)}`:''
}

export function WhatsAppMessageContent({m}:{m:WhatsAppMessage}){
  const type=(m.type||'text').toLowerCase()
  const caption=(m.caption||'').trim()
  const text=(m.body||'').trim()
  const media=m.media_url||''

  if(type.includes('image')&&media)return <div className="min-w-[180px] max-w-[330px]">
    <a href={media} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md bg-[#eef1f2]">
      <img src={media} alt={caption||m.file_name||'Imagen de WhatsApp'} className="max-h-[360px] w-full object-cover" loading="lazy"/>
    </a>
    {(caption&&caption!==text)&&<p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-[19px] text-[#111b21]">{caption}</p>}
  </div>

  if(type.includes('sticker')&&media)return <a href={media} target="_blank" rel="noreferrer" className="block"><img src={media} alt="Sticker" className="max-h-48 max-w-48 object-contain" loading="lazy"/></a>

  if(type.includes('video')&&media)return <div className="min-w-[220px] max-w-[360px]">
    <video src={media} controls preload="metadata" playsInline className="max-h-[360px] w-full rounded-md bg-black"/>
    {(caption&&caption!==text)&&<p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-[19px] text-[#111b21]">{caption}</p>}
  </div>

  if((type.includes('audio')||type.includes('ptt'))&&media)return <div className="min-w-[240px] max-w-[360px]"><audio src={media} controls preload="metadata" className="h-10 w-full"/></div>

  if(type.includes('document')&&media)return <a href={media} target="_blank" rel="noreferrer" download={m.file_name||undefined} className="flex min-w-[210px] max-w-[340px] items-center gap-3 rounded-md bg-black/5 p-3 hover:bg-black/10">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#54656f]"><FileText className="h-5 w-5"/></div>
    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-[#111b21]">{m.file_name||text||'Documento'}</div><div className="mt-0.5 text-[11px] uppercase text-[#667781]">{(m.mime_type||'archivo').split('/').pop()} {humanSize(m.file_size)&&`· ${humanSize(m.file_size)}`}</div></div>
    <Download className="h-5 w-5 shrink-0 text-[#667781]"/>
  </a>

  if(type.includes('location')){
    const href=mapHref(text)
    return <a href={href||undefined} target={href?'_blank':undefined} rel="noreferrer" className="flex min-w-[210px] items-center gap-3 rounded-md bg-black/5 p-3 hover:bg-black/10"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><MapPin className="h-5 w-5"/></div><div><div className="text-sm font-medium text-[#111b21]">Ubicación</div><div className="mt-0.5 text-xs text-[#667781]">{text.replace(/^Ubicación(?: en vivo)?\s*·\s*/i,'')||'Abrir ubicación'}</div></div></a>
  }

  if(type.includes('contact'))return <div className="flex min-w-[210px] items-center gap-3 rounded-md bg-black/5 p-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><ContactRound className="h-5 w-5"/></div><div><div className="text-sm font-medium text-[#111b21]">Contacto</div><div className="mt-0.5 text-xs text-[#667781]">{text||'Contacto de WhatsApp'}</div></div></div>

  if(type!=='text'&&type!=='extended_text'){
    const Icon=type.includes('image')?ImageIcon:type.includes('video')?Video:type.includes('aud')||type.includes('ptt')?Mic:type.includes('document')?FileText:type.includes('sticker')?Sticker:FileText
    return <div className="flex items-center gap-2 text-[14px] leading-[19px] text-[#111b21]"><Icon className="h-4 w-4 shrink-0 text-[#667781]"/><span className="whitespace-pre-wrap break-words">{text||caption||'Contenido de WhatsApp'}</span></div>
  }

  return <p className="whitespace-pre-wrap break-words text-[14px] leading-[19px] text-[#111b21]">{text||'Mensaje de WhatsApp'}</p>
}
