'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import {Archive,BarChart3,ContactRound,Download,File,FileImage,FileSpreadsheet,FileText,Image as ImageIcon,Link2,MapPin,Mic,Package,Pause,Play,Smile,Sticker,Video} from 'lucide-react'

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
  structured_payload?:Record<string,any>
  latitude?:number|null
  longitude?:number|null
  transcript?:string
  transcript_status?:string
  transcript_error?:string
}

const humanSize=(n?:number)=>{const v=Number(n||0);if(!v)return '';if(v<1024)return `${v} B`;if(v<1024*1024)return `${(v/1024).toFixed(v<10240?1:0)} KB`;return `${(v/1024/1024).toFixed(v<10*1024*1024?1:0)} MB`}
const mapHref=(body:string,lat?:number|null,lon?:number|null)=>{if(lat!==null&&lat!==undefined&&lon!==null&&lon!==undefined)return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lon}`)}`;const m=body.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);return m?`https://www.google.com/maps?q=${encodeURIComponent(`${m[1]},${m[2]}`)}`:''}
const urlRE=/(https?:\/\/[^\s<]+[^\s<.,;:!?\])])/gi
const fileExt=(name?:string,mime?:string)=>{const n=(name||'').split('?')[0];const ext=n.includes('.')?n.split('.').pop()||'':'';if(ext)return ext.toUpperCase();return (mime||'archivo').split('/').pop()?.split(';')[0].toUpperCase()||'ARCHIVO'}
const WAVE=[4,7,10,6,3,8,12,9,5,13,16,9,6,11,15,12,7,4,8,13,10,6,14,18,12,8,5,11,16,10,7,13,9,5,8,12,7,4,9,6,3,7,10,5,8,4]

function TextWithLinks({text}:{text:string}){const parts=text.split(urlRE);return <p className="whitespace-pre-wrap break-words text-[14.2px] leading-[19px] wa-text-primary">{parts.map((part,i)=>/^https?:\/\//i.test(part)?<a key={i} href={part} target="_blank" rel="noreferrer" className="text-[#027eb5] underline decoration-[#027eb5]/40 underline-offset-2">{part}</a>:part)}</p>}
function DocIcon({name,mime}:{name?:string;mime?:string}){const t=((name||'')+' '+(mime||'')).toLowerCase();const Icon=t.includes('.xls')||t.includes('spreadsheet')||t.includes('excel')?FileSpreadsheet:t.includes('.zip')||t.includes('.rar')||t.includes('compressed')?Archive:t.includes('.pdf')||t.includes('.doc')||t.includes('word')||t.includes('text/')?FileText:t.includes('image/')?FileImage:File;return <Icon className="h-5 w-5"/>}
function FileCard({m,text}:{m:WhatsAppMessage;text:string}){return <a href={m.media_url||undefined} target={m.media_url?'_blank':undefined} rel="noreferrer" download={m.file_name||undefined} className="wa-doc-card transition hover:bg-black/[.075]"><div className="wa-doc-icon"><DocIcon name={m.file_name} mime={m.mime_type}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium wa-text-primary">{m.file_name||text||'Archivo'}</div><div className="mt-0.5 flex flex-wrap gap-x-1 text-[10px] uppercase wa-text-secondary"><span>{fileExt(m.file_name,m.mime_type)}</span>{humanSize(m.file_size)&&<><span>·</span><span>{humanSize(m.file_size)}</span></>}</div></div>{m.media_url&&<Download className="h-5 w-5 shrink-0 wa-text-secondary"/>}</a>}

function VoicePlayer({m}:{m:WhatsAppMessage}){
  const audio=useRef<HTMLAudioElement|null>(null)
  const[playing,setPlaying]=useState(false)
  const[progress,setProgress]=useState(0)
  const[duration,setDuration]=useState('0:00')
  useEffect(()=>()=>{audio.current?.pause()},[])
  const toggle=async()=>{if(!audio.current)return;if(audio.current.paused){try{await audio.current.play()}catch{}}else audio.current.pause()}
  const played=Math.round((progress/100)*WAVE.length)
  return <div className="wa-voice">
    <audio ref={audio} src={m.media_url} preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setProgress(0)}} onLoadedMetadata={()=>{const d=audio.current?.duration||0;setDuration(`${Math.floor(d/60)}:${String(Math.floor(d%60)).padStart(2,'0')}`)}} onTimeUpdate={()=>{const a=audio.current;if(a&&a.duration)setProgress((a.currentTime/a.duration)*100)}}/>
    <div className="wa-voice-main"><button type="button" onClick={toggle} className="wa-voice-play" aria-label={playing?'Pausar audio':'Reproducir audio'}>{playing?<Pause/>:<Play className="translate-x-[1px]"/>}</button><div className="min-w-0 flex-1"><div className="wa-waveform" aria-hidden="true">{WAVE.map((h,i)=><i key={i} style={{height:`${Math.max(4,h)}px`,backgroundColor:i<played?'#00a884':undefined}}/>)}</div><div className="wa-voice-time">{duration}{m.file_name?` · ${m.file_name}`:''}</div></div></div>
    {m.transcript&&<div className="wa-transcript"><div className="mb-1 text-[9px] font-bold uppercase tracking-[.12em] wa-action">Transcripción</div><p className="whitespace-pre-wrap">{m.transcript}</p></div>}
    {!m.transcript&&m.transcript_status==='processing'&&<div className="mt-2 text-[10px] font-medium wa-text-secondary">Transcribiendo audio...</div>}
  </div>
}

function InteractiveCard({m,text,caption}:{m:WhatsAppMessage;text:string;caption:string}){
  const payload=m.structured_payload||{}
  const rawButtons=payload.buttons||payload.options||payload.rows||[]
  const buttons=Array.isArray(rawButtons)?rawButtons.slice(0,10):[]
  const title=String(payload.title||payload.header||'Mensaje interactivo')
  return <div className="wa-interactive-card"><div className="wa-interactive-body"><div className="mb-1 text-[12px] font-semibold wa-text-primary">{title}</div><TextWithLinks text={text||caption||'Interacción de WhatsApp'}/></div>{buttons.map((button:any,i:number)=><div key={i} className="wa-interactive-button"><span>{String(button?.title||button?.text||button?.label||button?.name||button)}</span></div>)}</div>
}

export function WhatsAppMessageContent({m}:{m:WhatsAppMessage}){
  const type=(m.type||'text').toLowerCase(),mime=(m.mime_type||'').toLowerCase(),caption=(m.caption||'').trim(),text=(m.body||'').trim(),media=m.media_url||''
  const isImage=type.includes('image')||mime.startsWith('image/'),isVideo=type.includes('video')||type.includes('ptv')||mime.startsWith('video/'),isAudio=type.includes('audio')||type.includes('ptt')||mime.startsWith('audio/'),isSticker=type.includes('sticker'),isDoc=type.includes('document')||type.includes('file')||(!isImage&&!isVideo&&!isAudio&&!isSticker&&!!media),viewOnce=type.includes('view_once')||type.includes('viewonce')
  const locationLabel=useMemo(()=>m.structured_payload?.name||m.structured_payload?.address||text.replace(/^Ubicación(?: en vivo)?\s*·\s*/i,'')||`${m.latitude??''}, ${m.longitude??''}`,[m.structured_payload,text,m.latitude,m.longitude])

  if(isSticker&&media)return <div className="max-w-[220px]"><a href={media} target="_blank" rel="noreferrer" className="block"><img src={media} alt="Sticker" className="max-h-[210px] max-w-[210px] object-contain" loading="lazy"/></a>{caption&&<div className="mt-1"><TextWithLinks text={caption}/></div>}</div>
  if(isImage&&media)return <div className="min-w-[180px] max-w-[340px]"><a href={media} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-[6px] bg-[#eef1f2]"><img src={media} alt={caption||m.file_name||'Imagen de WhatsApp'} className="max-h-[390px] w-full object-cover" loading="lazy"/>{viewOnce&&<span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">1 vez</span>}</a>{caption&&caption!==text&&<div className="mt-1.5"><TextWithLinks text={caption}/></div>}</div>
  if(isVideo&&media)return <div className="min-w-[220px] max-w-[360px]"><div className="relative overflow-hidden rounded-[6px] bg-black"><video src={media} controls preload="metadata" playsInline className="max-h-[390px] w-full bg-black"/>{viewOnce&&<span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">1 vez</span>}</div>{caption&&caption!==text&&<div className="mt-1.5"><TextWithLinks text={caption}/></div>}</div>
  if(isAudio&&media)return <VoicePlayer m={m}/>
  if(isDoc)return <div><FileCard m={m} text={text}/>{caption&&caption!==text&&<div className="mt-1.5"><TextWithLinks text={caption}/></div>}</div>

  if(type.includes('location')){const href=mapHref(text,m.latitude,m.longitude);return <a href={href||undefined} target={href?'_blank':undefined} rel="noreferrer" className="wa-location-card hover:bg-black/[.075]"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><MapPin className="h-6 w-6"/></div><div className="min-w-0"><div className="text-sm font-medium wa-text-primary">{type.includes('live')?'Ubicación en vivo':'Ubicación'}</div><div className="mt-0.5 truncate text-xs wa-text-secondary">{locationLabel||'Abrir ubicación'}</div><div className="mt-1 text-[10px] font-semibold wa-action">Abrir mapa</div></div></a>}
  if(type.includes('contact'))return <div className="wa-location-card"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><ContactRound className="h-6 w-6"/></div><div className="min-w-0"><div className="text-sm font-medium wa-text-primary">{m.structured_payload?.display_name|| (type.includes('array')?'Contactos':'Contacto')}</div><div className="mt-0.5 whitespace-pre-wrap break-words text-xs wa-text-secondary">{text||'Contacto de WhatsApp'}</div></div></div>
  if(type.includes('poll'))return <div className="wa-interactive-card"><div className="wa-interactive-body"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fff3cf] text-[#b77900]"><BarChart3 className="h-5 w-5"/></div><div className="min-w-0"><div className="text-sm font-medium wa-text-primary">Encuesta</div><div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 wa-text-secondary">{text||'Encuesta de WhatsApp'}</div></div></div></div></div>
  if(type.includes('reaction'))return <div className="inline-flex min-w-[90px] items-center gap-2 rounded-full bg-black/[.045] px-3 py-2"><Smile className="h-4 w-4 text-[#008069]"/><span className="text-lg leading-none">{text||'👍'}</span><span className="text-xs wa-text-secondary">Reacción</span></div>
  if(type.includes('product')||type.includes('order')||type.includes('catalog'))return <div className="wa-location-card"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><Package className="h-5 w-5"/></div><div className="min-w-0"><div className="text-sm font-medium wa-text-primary">Contenido comercial</div><div className="mt-0.5 whitespace-pre-wrap break-words text-xs wa-text-secondary">{text||'Producto o pedido compartido desde WhatsApp'}</div></div></div>
  if(type.includes('button')||type.includes('list')||type.includes('interactive')||type.includes('template'))return <InteractiveCard m={m} text={text} caption={caption}/>
  if(type!=='text'&&type!=='extended_text'){const Icon=type.includes('image')?ImageIcon:type.includes('video')?Video:type.includes('aud')||type.includes('ptt')?Mic:type.includes('sticker')?Sticker:FileText;return <div className="flex max-w-[350px] items-start gap-2 rounded-[7px] bg-black/[.035] p-2.5 text-[14px] leading-[19px] wa-text-primary"><Icon className="mt-0.5 h-4 w-4 shrink-0 wa-text-secondary"/><div className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-wide wa-text-secondary">Contenido de WhatsApp</div><div className="mt-1"><TextWithLinks text={text||caption||'Este tipo de contenido no incluye una previsualización disponible.'}/></div></div></div>}
  return <TextWithLinks text={text||'Mensaje de WhatsApp'}/>
}
