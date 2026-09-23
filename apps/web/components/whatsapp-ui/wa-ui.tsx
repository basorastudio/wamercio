'use client'

import type {KeyboardEvent,MutableRefObject,ReactNode} from 'react'
import {ChevronLeft,Mic,Search,Send} from 'lucide-react'

export type WaMessageStatus='sending'|'sent'|'delivered'|'read'|'failed'

const AVATAR_COLORS=['#dba685','#53a6fd','#25d366','#fc9775','#ff72a1','#a791ff','#fb5061','#53bdeb','#42c7b8','#ffd279']
const initials=(name:string)=>name.trim().split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase()||'W'
const avatarColor=(name:string)=>{let hash=0;for(const ch of name)hash=ch.charCodeAt(0)+((hash<<5)-hash);return AVATAR_COLORS[Math.abs(hash)%AVATAR_COLORS.length]}

export function WaAvatar({name,src,size='md',online=false}:{name:string;src?:string|null;size?:'sm'|'md'|'lg';online?:boolean}){
  return <div className={`wa-avatar wa-avatar-${size}`} style={{backgroundColor:src?undefined:avatarColor(name)}}>{src?<img src={src} alt={name}/>:<span>{initials(name)}</span>}{online&&<i className="wa-avatar-online"/>}</div>
}

function SingleCheck(){return <svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.175a.463.463 0 0 0-.349-.158.467.467 0 0 0-.338.131.537.537 0 0 0-.14.353.54.54 0 0 0 .13.363l2.39 2.576a.465.465 0 0 0 .349.158.457.457 0 0 0 .368-.189l6.596-8.14a.504.504 0 0 0 .103-.36.516.516 0 0 0-.223-.271z" fill="currentColor"/></svg>}
function DoubleCheck(){return <svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.175a.463.463 0 0 0-.349-.158.467.467 0 0 0-.338.131.537.537 0 0 0-.14.353.54.54 0 0 0 .13.363l2.39 2.576a.465.465 0 0 0 .349.158.457.457 0 0 0 .368-.189l6.596-8.14a.504.504 0 0 0 .103-.36.516.516 0 0 0-.223-.271z" fill="currentColor"/><path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.298-.728.897 1.58 1.704a.465.465 0 0 0 .349.158.457.457 0 0 0 .368-.189l6.596-8.14a.504.504 0 0 0 .103-.36.516.516 0 0 0-.193-.484z" fill="currentColor"/></svg>}

export function WaMessageStatusIcon({status}:{status?:string}){
  const s=(status||'sent').toLowerCase()
  if(s==='failed'||s==='error')return <span className="wa-status wa-status-failed" title="No enviado">!</span>
  if(s==='read'||s==='played')return <span className="wa-status wa-status-read"><DoubleCheck/></span>
  if(s==='delivered')return <span className="wa-status"><DoubleCheck/></span>
  return <span className="wa-status"><SingleCheck/></span>
}

export function WaChatListItem({name,avatar,lastMessage,timestamp,unreadCount=0,isSelected=false,onClick,badges,workflow,online=false}:{name:string;avatar?:string|null;lastMessage?:string;timestamp?:string;unreadCount?:number;isSelected?:boolean;onClick?:()=>void;badges?:ReactNode;workflow?:ReactNode;online?:boolean}){
  return <button type="button" onClick={onClick} className={`wa-chat-list-item ${isSelected?'is-selected':''}`}>
    <WaAvatar name={name} src={avatar} size="md" online={online}/>
    <div className="wa-chat-list-main">
      <div className="wa-chat-list-row"><span className="wa-chat-list-name">{name}</span>{timestamp&&<time className={unreadCount>0?'is-unread':''}>{timestamp}</time>}</div>
      <div className="wa-chat-list-row wa-chat-list-preview"><span className="wa-chat-list-message">{lastMessage||'Nueva conversación'}</span>{badges}<span className="wa-chat-list-spacer"/>{unreadCount>0&&<span className="wa-unread-count">{unreadCount>999?'999+':unreadCount}</span>}</div>
      {workflow&&<div className="wa-chat-list-workflow">{workflow}</div>}
    </div>
  </button>
}

export function WaChatHeader({name,avatar,status,badge,onBack,onProfile,actions}:{name:string;avatar?:string|null;status?:ReactNode;badge?:ReactNode;onBack?:()=>void;onProfile?:()=>void;actions?:ReactNode}){
  return <header className="wa-chat-header">
    {onBack&&<button type="button" onClick={onBack} className="wa-header-icon wa-header-back" aria-label="Volver"><ChevronLeft/></button>}
    <button type="button" onClick={onProfile} className="wa-chat-header-person" disabled={!onProfile}>
      <WaAvatar name={name} src={avatar} size="sm"/>
      <span className="wa-chat-header-copy"><span className="wa-chat-header-title"><span>{name}</span>{badge}</span>{status&&<span className="wa-chat-header-status">{status}</span>}</span>
    </button>
    <div className="wa-chat-header-actions">{actions}</div>
  </header>
}

export function WaHeaderAction({title,onClick,active=false,children}:{title:string;onClick?:()=>void;active?:boolean;children:ReactNode}){
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`wa-header-icon ${active?'is-active':''}`}>{children}</button>
}

export function WaDateSeparator({label}:{label:string}){return <div className="wa-date-separator"><span>{label}</span></div>}

export function WaMessageBubble({direction,timestamp,status,showTail=false,active=false,children}:{direction:'in'|'out';timestamp?:string;status?:string;showTail?:boolean;active?:boolean;children:ReactNode}){
  const outgoing=direction==='out'
  return <div className={`wa-message-row ${outgoing?'is-outgoing':'is-incoming'} ${active?'is-search-hit':''}`}>
    <div className={`wa-message-bubble ${outgoing?'is-outgoing':'is-incoming'} ${showTail?'has-tail':''}`}>
      {showTail&&<span className="wa-message-tail" aria-hidden="true"/>}
      <div className="wa-message-content">{children}</div>
      <div className="wa-message-meta">{timestamp&&<time>{timestamp}</time>}{outgoing&&<WaMessageStatusIcon status={status}/>}</div>
    </div>
  </div>
}

const sameDate=(a:string,b:string)=>{const x=new Date(a),y=new Date(b);return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()&&x.getDate()===y.getDate()}
const dateLabel=(value:string)=>{const d=new Date(value),now=new Date(),yesterday=new Date();yesterday.setDate(now.getDate()-1);if(sameDate(value,now.toISOString()))return 'HOY';if(sameDate(value,yesterday.toISOString()))return 'AYER';return d.toLocaleDateString('es-DO',{day:'numeric',month:'long',year:d.getFullYear()===now.getFullYear()?undefined:'numeric'}).toUpperCase()}
const timeGap=(a:string,b:string)=>Math.abs(new Date(a).getTime()-new Date(b).getTime())/1000

export function WaConversationTimeline<T extends {id:string;direction:'in'|'out';occurred_at:string;status?:string}>({messages,renderMessage,formatTime,messageRefs,activeId,empty}:{messages:T[];renderMessage:(message:T)=>ReactNode;formatTime:(value?:string|null)=>string;messageRefs?:MutableRefObject<Record<string,HTMLDivElement|null>>;activeId?:string;empty?:ReactNode}){
  if(messages.length===0)return <>{empty}</>
  return <div className="wa-timeline-inner">{messages.map((m,i)=>{const prev=i?messages[i-1]:null;const dayBreak=!prev||!sameDate(prev.occurred_at,m.occurred_at);const showTail=!prev||prev.direction!==m.direction||timeGap(prev.occurred_at,m.occurred_at)>120;return <div key={m.id}>{dayBreak&&<WaDateSeparator label={dateLabel(m.occurred_at)}/>}<div ref={node=>{if(messageRefs)messageRefs.current[m.id]=node}} className="wa-message-anchor"><WaMessageBubble direction={m.direction} timestamp={formatTime(m.occurred_at)} status={m.status} showTail={showTail} active={activeId===m.id}>{renderMessage(m)}</WaMessageBubble></div></div>})}</div>
}

export function WaComposerShell({children,className=''}:{children:ReactNode;className?:string}){return <div className={`wa-composer ${className}`}>{children}</div>}
export function WaComposerInput({value,onChange,onKeyDown,placeholder,disabled}:{value:string;onChange:(value:string)=>void;onKeyDown?:(e:KeyboardEvent<HTMLTextAreaElement>)=>void;placeholder?:string;disabled?:boolean}){return <textarea rows={1} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)} onKeyDown={onKeyDown} className="wa-composer-input" placeholder={placeholder||'Escribe un mensaje'}/>} 
export function WaComposerAction({title,onClick,active=false,disabled=false,children}:{title:string;onClick?:()=>void;active?:boolean;disabled?:boolean;children:ReactNode}){return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={`wa-composer-action ${active?'is-active':''}`}>{children}</button>}
export function WaSendButton({hasText,onSend,onVoice,disabled=false}:{hasText:boolean;onSend?:()=>void;onVoice?:()=>void;disabled?:boolean}){return <button type={hasText?'submit':'button'} onClick={hasText?onSend:onVoice} disabled={disabled} className="wa-composer-send" aria-label={hasText?'Enviar mensaje':'Grabar nota de voz'}>{hasText?<Send/>:<Mic/>}</button>}

export function WaSidebarSearch({value,onChange,placeholder='Buscar o iniciar un chat'}:{value:string;onChange:(value:string)=>void;placeholder?:string}){return <div className="wa-sidebar-search"><Search/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>}
export function WaFilterChip({active,onClick,children}:{active?:boolean;onClick?:()=>void;children:ReactNode}){return <button type="button" onClick={onClick} className={`wa-filter-chip ${active?'is-active':''}`}>{children}</button>}

export function WaEmptyChat({title='WhatsApp para WAMERCIO',copy='Selecciona una conversación para comenzar.'}:{title?:string;copy?:string}){return <div className="wa-empty-chat"><div className="wa-empty-orbit"><span className="wa-empty-logo">W</span></div><h3>{title}</h3><p>{copy}</p><div className="wa-empty-encrypted">🔒 Mensajería comercial gestionada desde WAMERCIO</div></div>}
