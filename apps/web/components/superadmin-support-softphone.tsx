'use client'

import {useEffect,useRef,useState} from 'react'
import CallsSoftphone,{type CallsSoftphoneHandle,type SoftphoneTarget} from '@/components/calls-softphone'

export default function SuperAdminSupportSoftphone(){
  const[open,setOpen]=useState(false)
  const[target,setTarget]=useState<SoftphoneTarget|null>(null)
  const softphoneRef=useRef<CallsSoftphoneHandle|null>(null)

  const openPip=async()=>!!(await softphoneRef.current?.openPictureInPicture())

  useEffect(()=>{
    if(typeof window==='undefined')return

    const onOpen=(event:Event)=>{
      const detail=(event as CustomEvent).detail||{}
      const nextTarget:SoftphoneTarget|null=(detail.phone||detail.display_name||detail.remote_jid)?{
        phone:String(detail.phone||'').replace(/\D/g,''),
        display_name:String(detail.display_name||''),
        avatar_url:String(detail.avatar_url||''),
        remote_jid:String(detail.remote_jid||''),
        kind:'contact',
      }:null
      setTarget(nextTarget)
      setOpen(true)
      void openPip()
      if(detail.auto_call&&nextTarget){
        window.setTimeout(()=>{void softphoneRef.current?.startDirectCall(nextTarget,'support')},0)
      }
    }

    const onIncoming=(event:Event)=>{
      const detail=(event as CustomEvent).detail||{}
      setTarget({
        phone:String(detail.phone||'').replace(/\D/g,''),
        display_name:String(detail.display_name||''),
        avatar_url:String(detail.avatar_url||''),
        kind:'contact',
      })
      setOpen(true)
      void openPip().then(opened=>{
        if(opened)return
        try{
          if('Notification' in window&&Notification.permission==='granted'){
            const label=String(detail.display_name||detail.phone||'Comercio WAMERCIO')
            const notification=new Notification('Llamada entrante · WAMERCIO',{body:label,tag:`wamercio-admin-call-${String(detail.id||'')}`,requireInteraction:true})
            notification.onclick=()=>{window.focus();void openPip();notification.close()}
          }
        }catch{}
      })
    }

    window.addEventListener('wamercio:open-admin-softphone',onOpen as EventListener)
    window.addEventListener('wamercio:incoming-admin-call',onIncoming as EventListener)
    return()=>{
      window.removeEventListener('wamercio:open-admin-softphone',onOpen as EventListener)
      window.removeEventListener('wamercio:incoming-admin-call',onIncoming as EventListener)
    }
  },[])

  return <CallsSoftphone
    ref={softphoneRef}
    open={open}
    onClose={()=>setOpen(false)}
    storeId="support"
    target={target}
    scope="superadmin"
    title="WAMERCIO Softphone"
    subtitle="Llamadas WhatsApp desde la sesión global de soporte."
  />
}
