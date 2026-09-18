'use client'

import {useEffect,useRef,useState} from 'react'
import CallsSoftphone,{type CallsSoftphoneHandle,type SoftphoneTarget} from '@/components/calls-softphone'

const dismissedKey=(id:string)=>`wamercio_call_dismissed_${id}`

export default function CallsSoftphoneHost(){
  const[open,setOpen]=useState(false)
  const[storeId,setStoreId]=useState('')
  const[target,setTarget]=useState<SoftphoneTarget|null>(null)
  const[incomingCallId,setIncomingCallId]=useState('')
  const softphoneRef=useRef<CallsSoftphoneHandle|null>(null)

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
      setIncomingCallId('')
      window.dispatchEvent(new CustomEvent('wamercio:call-attention-clear'))
      setTarget(nextTarget)
      setOpen(true)

      // The event itself is dispatched synchronously from a real click, so
      // Document Picture-in-Picture may be requested here without losing the
      // browser's user-activation token.
      if(detail.picture_in_picture!==false){
        void softphoneRef.current?.openPictureInPicture()
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
      setIncomingCallId(id)
      setTarget({
        phone:String(detail.phone||'').replace(/\D/g,''),
        display_name:String(detail.display_name||''),
        conversation_id:String(detail.conversation_id||''),
        kind:'contact',
      })
      setOpen(true)
      // Incoming calls always target the one canonical Document-PiP softphone.
      // Chromium may require a transient user activation for requestWindow().
      // If automatic PiP is blocked, do NOT render a second softphone: surface
      // a compact attention state in the sidebar and reuse this same PiP when
      // the agent clicks it.
      void softphoneRef.current?.openPictureInPicture().then(opened=>{
        if(opened){
          window.dispatchEvent(new CustomEvent('wamercio:call-attention-clear'))
          return
        }
        window.dispatchEvent(new CustomEvent('wamercio:incoming-call-attention',{detail:{id,store_id:nextStore,phone:String(detail.phone||'').replace(/\D/g,''),display_name:String(detail.display_name||'')}}))
        try{
          if('Notification' in window&&Notification.permission==='granted'){
            const label=String(detail.display_name||detail.phone||'Contacto WhatsApp')
            new Notification('Llamada entrante en WAMERCIO',{body:label,tag:`wamercio-call-${id}`})
          }
        }catch{}
      })
    }

    const onStorage=(event:StorageEvent)=>{
      if(!incomingCallId||event.key!==dismissedKey(incomingCallId)||event.newValue!=='1')return
      setOpen(false)
      setIncomingCallId('')
    }

    window.addEventListener('wamercio:active-store-changed',onActiveStore as EventListener)
    window.addEventListener('wamercio:open-softphone',onOpen as EventListener)
    window.addEventListener('wamercio:incoming-call',onIncoming as EventListener)
    window.addEventListener('storage',onStorage)
    return()=>{
      window.removeEventListener('wamercio:active-store-changed',onActiveStore as EventListener)
      window.removeEventListener('wamercio:open-softphone',onOpen as EventListener)
      window.removeEventListener('wamercio:incoming-call',onIncoming as EventListener)
      window.removeEventListener('storage',onStorage)
    }
  },[storeId,incomingCallId])

  const close=()=>{
    if(typeof window!=='undefined'&&incomingCallId){
      localStorage.setItem(dismissedKey(incomingCallId),'1')
    }
    setOpen(false)
    setIncomingCallId('')
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('wamercio:call-attention-clear'))
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
