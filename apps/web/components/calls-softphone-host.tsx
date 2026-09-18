'use client'

import {useEffect,useRef,useState} from 'react'
import CallsSoftphone,{type CallsSoftphoneHandle,type SoftphoneTarget} from '@/components/calls-softphone'

const dismissedKey=(id:string)=>`wamercio_call_dismissed_${id}`
type PendingIncoming={id:string;store_id:string;phone:string;display_name:string;conversation_id:string;avatar_url:string}

export default function CallsSoftphoneHost(){
  const[open,setOpen]=useState(false)
  const[storeId,setStoreId]=useState('')
  const[target,setTarget]=useState<SoftphoneTarget|null>(null)
  const[incomingCallId,setIncomingCallId]=useState('')
  const softphoneRef=useRef<CallsSoftphoneHandle|null>(null)
  const pendingIncomingRef=useRef<PendingIncoming|null>(null)

  const openCanonicalPip=async()=>{
    const opened=await softphoneRef.current?.openPictureInPicture()
    if(opened)pendingIncomingRef.current=null
    return !!opened
  }

  useEffect(()=>{
    if(typeof window==='undefined')return

    // Chromium requires transient user activation to create a *new* Document
    // Picture-in-Picture window. If an incoming call arrived while no PiP was
    // open and the browser blocked requestWindow(), use the very next genuine
    // user interaction anywhere in WAMERCIO to open the SAME canonical PiP.
    // We intentionally do not draw a second in-app softphone or mutate the
    // sidebar into an alternate call UI.
    const resumePending=()=>{
      if(!pendingIncomingRef.current)return
      void openCanonicalPip()
    }
    window.addEventListener('pointerdown',resumePending,true)
    window.addEventListener('keydown',resumePending,true)
    return()=>{
      window.removeEventListener('pointerdown',resumePending,true)
      window.removeEventListener('keydown',resumePending,true)
    }
  },[])

  useEffect(()=>{
    if(typeof window==='undefined')return

    const resolveStore=(requested?:string)=>String(requested||localStorage.getItem('wamercio_store_id')||storeId||'')

    const onActiveStore=(event:Event)=>{
      const detail=(event as CustomEvent).detail||{}
      const id=resolveStore(detail.store_id)
      if(id)setStoreId(id)
    }

    const onOpen=(event:Event)=>{
      const detail=(event as CustomEvent).detail||{}
      const nextStore=resolveStore(detail.store_id)
      if(nextStore)setStoreId(nextStore)
      const nextTarget:SoftphoneTarget|null=(detail.phone||detail.display_name||detail.conversation_id)?{
        phone:String(detail.phone||'').replace(/\D/g,''),
        display_name:String(detail.display_name||''),
        conversation_id:String(detail.conversation_id||''),
        kind:detail.kind,
        avatar_url:String(detail.avatar_url||''),
      }:null
      pendingIncomingRef.current=null
      setIncomingCallId('')
      setTarget(nextTarget)
      setOpen(true)

      // This event normally originates from an actual click (sidebar/chat/
      // customer table), so requestWindow can consume that user activation.
      if(detail.picture_in_picture!==false){
        void openCanonicalPip()
      }
      if(detail.auto_call&&nextTarget){
        window.setTimeout(()=>{void softphoneRef.current?.startDirectCall(nextTarget,nextStore)},0)
      }
    }

    const onIncoming=(event:Event)=>{
      const detail=(event as CustomEvent).detail||{}
      const id=String(detail.id||'')
      if(!id)return
      if(localStorage.getItem(dismissedKey(id))==='1')return
      const nextStore=resolveStore(detail.store_id)
      if(nextStore)setStoreId(nextStore)
      const incoming:PendingIncoming={
        id,
        store_id:nextStore,
        phone:String(detail.phone||'').replace(/\D/g,''),
        display_name:String(detail.display_name||''),
        conversation_id:String(detail.conversation_id||''),
        avatar_url:String(detail.avatar_url||''),
      }
      pendingIncomingRef.current=incoming
      setIncomingCallId(id)
      setTarget({
        phone:incoming.phone,
        display_name:incoming.display_name,
        conversation_id:incoming.conversation_id,
        avatar_url:incoming.avatar_url,
        kind:'contact',
      })
      setOpen(true)

      // Reuse/open the one canonical WAMERCIO Document-PiP softphone. When a
      // PiP already exists this succeeds immediately. Creating a new PiP may
      // be blocked by Chromium without transient user activation; in that
      // case pendingIncomingRef is kept and the next interaction opens this
      // exact same PiP (never a duplicate sidebar/in-page softphone).
      void openCanonicalPip().then(opened=>{
        if(opened)return
        try{
          if('Notification' in window&&Notification.permission==='granted'){
            const label=incoming.display_name||incoming.phone||'Contacto WhatsApp'
            const notification=new Notification('Llamada entrante en WAMERCIO',{body:label,tag:`wamercio-call-${id}`,requireInteraction:true})
            notification.onclick=()=>{
              window.focus()
              void openCanonicalPip()
              notification.close()
            }
          }
        }catch{}
      })
    }

    const onStorage=(event:StorageEvent)=>{
      if(!incomingCallId||event.key!==dismissedKey(incomingCallId)||event.newValue!=='1')return
      pendingIncomingRef.current=null
      setOpen(false)
      setIncomingCallId('')
    }

    const onCallEnded=(event:Event)=>{
      const id=String((event as CustomEvent).detail?.id||'')
      if(!id||id!==incomingCallId)return
      pendingIncomingRef.current=null
      setIncomingCallId('')
    }

    window.addEventListener('wamercio:active-store-changed',onActiveStore as EventListener)
    window.addEventListener('wamercio:open-softphone',onOpen as EventListener)
    window.addEventListener('wamercio:incoming-call',onIncoming as EventListener)
    window.addEventListener('wamercio:softphone-call-ended',onCallEnded as EventListener)
    window.addEventListener('storage',onStorage)
    return()=>{
      window.removeEventListener('wamercio:active-store-changed',onActiveStore as EventListener)
      window.removeEventListener('wamercio:open-softphone',onOpen as EventListener)
      window.removeEventListener('wamercio:incoming-call',onIncoming as EventListener)
      window.removeEventListener('wamercio:softphone-call-ended',onCallEnded as EventListener)
      window.removeEventListener('storage',onStorage)
    }
  },[storeId,incomingCallId])

  const close=()=>{
    if(typeof window!=='undefined'&&incomingCallId){
      localStorage.setItem(dismissedKey(incomingCallId),'1')
    }
    pendingIncomingRef.current=null
    setOpen(false)
    setIncomingCallId('')
  }

  return <CallsSoftphone
    ref={softphoneRef}
    open={open}
    onClose={close}
    storeId={storeId}
    target={target}
    title={target?.display_name?`Llamar a ${target.display_name}`:'WAMERCIO Softphone'}
    subtitle="Directorio, teclado y llamada WhatsApp en una sola interfaz. La llamada permanece activa aunque navegues por otras secciones de WAMERCIO."
  />
}
