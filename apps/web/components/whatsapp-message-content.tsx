'use client'

import {Archive,BarChart3,ContactRound,Download,File,FileImage,FileSpreadsheet,FileText,Image as ImageIcon,Link2,MapPin,Mic,Package,Smile,Sticker,Video} from 'lucide-react'

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
const urlRE=/(https?:\/\/[^\s<]+[^\s<.,;:!?\])])/gi
const fileExt=(name?:string,mime?:string)=>{
  const n=(name||'').split('?')[0]
  const ext=n.includes('.')?n.split('.').pop()||'':''
  if(ext)return ext.toUpperCase()
  return (mime||'archivo').split('/').pop()?.split(';')[0].toUpperCase()||'ARCHIVO'
}
function TextWithLinks({text}:{text:string}){
  const parts=text.split(urlRE)
  return <p className="whitespace-pre-wrap break-words text-[14px] leading-[19px] text-[#111b21]">{parts.map((part,i)=>/^https?:\/\//i.test(part)?<a key={i} href={part} target="_blank" rel="noreferrer" className="text-[#027eb5] underline decoration-[#027eb5]/40 underline-offset-2">{part}</a>:part)}</p>
}
function DocIcon({name,mime}:{name?:string;mime?:string}){
  const t=((name||'')+' '+(mime||'')).toLowerCase()
  const Icon=t.includes('.xls')||t.includes('spreadsheet')||t.includes('excel')?FileSpreadsheet:t.includes('.zip')||t.includes('.rar')||t.includes('compressed')?Archive:t.includes('.pdf')||t.includes('.doc')||t.includes('word')||t.includes('text/')?FileText:t.includes('image/')?FileImage:File
  return <Icon className="h-5 w-5"/>
}
function FileCard({m,text}:{m:WhatsAppMessage;text:string}){
  return <a href={m.media_url||undefined} target={m.media_url?'_blank':undefined} rel="noreferrer" download={m.file_name||undefined} className="flex min-w-[220px] max-w-[360px] items-center gap-3 rounded-[10px] bg-black/[.045] p-3 transition hover:bg-black/[.075]">
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#54656f] shadow-sm"><DocIcon name={m.file_name} mime={m.mime_type}/></div>
    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-[#111b21]">{m.file_name||text||'Archivo'}</div><div className="mt-0.5 flex flex-wrap gap-x-1 text-[10px] uppercase text-[#667781]"><span>{fileExt(m.file_name,m.mime_type)}</span>{humanSize(m.file_size)&&<><span>·</span><span>{humanSize(m.file_size)}</span></>}</div></div>
    {m.media_url&&<Download className="h-5 w-5 shrink-0 text-[#667781]"/>}
  </a>
}

export function WhatsAppMessageContent({m}:{m:WhatsAppMessage}){
  const type=(m.type||'text').toLowerCase()
  const mime=(m.mime_type||'').toLowerCase()
  const caption=(m.caption||'').trim()
  const text=(m.body||'').trim()
  const media=m.media_url||''
  const isImage=type.includes('image')||mime.startsWith('image/')
  const isVideo=type.includes('video')||type.includes('ptv')||mime.startsWith('video/')
  const isAudio=type.includes('audio')||type.includes('ptt')||mime.startsWith('audio/')
  const isSticker=type.includes('sticker')
  const isDoc=type.includes('document')||type.includes('file')||(!isImage&&!isVideo&&!isAudio&&!isSticker&&!!media)
  const viewOnce=type.includes('view_once')||type.includes('viewonce')

  if(isSticker&&media)return <div className="max-w-[220px]"><a href={media} target="_blank" rel="noreferrer" className="block"><img src={media} alt="Sticker" className="max-h-[210px] max-w-[210px] object-contain" loading="lazy"/></a>{caption&&<div className="mt-1"><TextWithLinks text={caption}/></div>}</div>

  if(isImage&&media)return <div className="min-w-[180px] max-w-[340px]">
    <a href={media} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-[8px] bg-[#eef1f2]">
      <img src={media} alt={caption||m.file_name||'Imagen de WhatsApp'} className="max-h-[390px] w-full object-cover" loading="lazy"/>
      {viewOnce&&<span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">1 vez</span>}
    </a>
    {(caption&&caption!==text)&&<div className="mt-1.5"><TextWithLinks text={caption}/></div>}
  </div>

  if(isVideo&&media)return <div className="min-w-[220px] max-w-[360px]">
    <div className="relative overflow-hidden rounded-[8px] bg-black"><video src={media} controls preload="metadata" playsInline className="max-h-[390px] w-full bg-black"/>{viewOnce&&<span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">1 vez</span>}</div>
    {(caption&&caption!==text)&&<div className="mt-1.5"><TextWithLinks text={caption}/></div>}
  </div>

  if(isAudio&&media)return <div className="min-w-[260px] max-w-[380px] rounded-[12px] bg-black/[.035] p-2.5"><div className="mb-2 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#00a884] text-white"><Mic className="h-4 w-4"/></span><div><div className="text-xs font-medium text-[#3b4a54]">{type.includes('ptt')?'Nota de voz':'Audio'}</div>{m.file_name&&<div className="max-w-[230px] truncate text-[10px] text-[#8696a0]">{m.file_name}</div>}</div></div><audio src={media} controls preload="metadata" className="h-9 w-full"/></div>

  if(isDoc)return <div>{<FileCard m={m} text={text}/>} {(caption&&caption!==text)&&<div className="mt-1.5"><TextWithLinks text={caption}/></div>}</div>

  if(type.includes('location')){
    const href=mapHref(text)
    return <a href={href||undefined} target={href?'_blank':undefined} rel="noreferrer" className="flex min-w-[220px] max-w-[340px] items-center gap-3 rounded-[10px] bg-black/[.045] p-3 hover:bg-black/[.075]"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><MapPin className="h-6 w-6"/></div><div className="min-w-0"><div className="text-sm font-medium text-[#111b21]">{type.includes('live')?'Ubicación en vivo':'Ubicación'}</div><div className="mt-0.5 truncate text-xs text-[#667781]">{text.replace(/^Ubicación(?: en vivo)?\s*·\s*/i,'')||'Abrir ubicación'}</div><div className="mt-1 text-[10px] font-semibold text-[#008069]">Abrir mapa</div></div></a>
  }

  if(type.includes('contact'))return <div className="min-w-[220px] max-w-[340px] rounded-[10px] bg-black/[.045] p-3"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><ContactRound className="h-6 w-6"/></div><div className="min-w-0"><div className="text-sm font-medium text-[#111b21]">{type.includes('array')?'Contactos':'Contacto'}</div><div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[#667781]">{text||'Contacto de WhatsApp'}</div></div></div></div>

  if(type.includes('poll'))return <div className="min-w-[230px] max-w-[350px] rounded-[10px] bg-black/[.045] p-3"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><BarChart3 className="h-5 w-5"/></div><div className="min-w-0"><div className="text-sm font-medium text-[#111b21]">Encuesta</div><div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#667781]">{text||'Encuesta de WhatsApp'}</div></div></div></div>

  if(type.includes('reaction'))return <div className="inline-flex min-w-[90px] items-center gap-2 rounded-full bg-black/[.045] px-3 py-2"><Smile className="h-4 w-4 text-[#008069]"/><span className="text-lg leading-none">{text||'👍'}</span><span className="text-xs text-[#667781]">Reacción</span></div>

  if(type.includes('product')||type.includes('order')||type.includes('catalog'))return <div className="flex min-w-[230px] max-w-[350px] items-center gap-3 rounded-[10px] bg-black/[.045] p-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><Package className="h-5 w-5"/></div><div className="min-w-0"><div className="text-sm font-medium text-[#111b21]">Contenido comercial</div><div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[#667781]">{text||'Producto o pedido compartido desde WhatsApp'}</div></div></div>

  if(type.includes('button')||type.includes('list')||type.includes('interactive')||type.includes('template'))return <div className="min-w-[220px] max-w-[350px] rounded-[10px] bg-black/[.045] p-3"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><Link2 className="h-5 w-5"/></div><div className="min-w-0"><div className="text-sm font-medium text-[#111b21]">Mensaje interactivo</div><div className="mt-1"><TextWithLinks text={text||caption||'Interacción de WhatsApp'}/></div></div></div></div>

  if(type!=='text'&&type!=='extended_text'){
    const Icon=type.includes('image')?ImageIcon:type.includes('video')?Video:type.includes('aud')||type.includes('ptt')?Mic:type.includes('sticker')?Sticker:FileText
    return <div className="flex max-w-[350px] items-start gap-2 rounded-[10px] bg-black/[.035] p-2.5 text-[14px] leading-[19px] text-[#111b21]"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#667781]"/><div className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-wide text-[#8696a0]">Contenido de WhatsApp</div><div className="mt-1"><TextWithLinks text={text||caption||'Este tipo de contenido no incluye una previsualización disponible.'}/></div></div></div>
  }

  return <TextWithLinks text={text||'Mensaje de WhatsApp'}/>
}
