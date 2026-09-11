'use client'

import {useEffect,useRef} from 'react'

type PinInputProps={
  value:string
  onChange:(value:string)=>void
  onComplete?:(value:string)=>void
  autoFocus?:boolean
  disabled?:boolean
  required?:boolean
  label?:string
}

export default function PinInput({value,onChange,onComplete,autoFocus=false,disabled=false,required=false,label='PIN de 4 dígitos'}:PinInputProps){
  const refs=useRef<Array<HTMLInputElement|null>>([])
  const digits=(value||'').replace(/\D/g,'').slice(0,4)

  useEffect(()=>{
    if(autoFocus&&digits.length===0){
      const t=setTimeout(()=>refs.current[0]?.focus(),80)
      return()=>clearTimeout(t)
    }
  },[autoFocus,digits.length])

  const commit=(next:string,focusIndex?:number)=>{
    const clean=next.replace(/\D/g,'').slice(0,4)
    onChange(clean)
    if(typeof focusIndex==='number')requestAnimationFrame(()=>refs.current[Math.max(0,Math.min(3,focusIndex))]?.focus())
    if(clean.length===4)onComplete?.(clean)
  }

  const setAt=(index:number,char:string)=>{
    const c=char.replace(/\D/g,'').slice(-1)
    if(!c)return
    const arr=digits.split('')
    while(arr.length<4)arr.push('')
    arr[index]=c
    const next=arr.join('').replace(/\s/g,'').slice(0,4)
    commit(next,index<3?index+1:index)
  }

  const keyDown=(index:number,e:React.KeyboardEvent<HTMLInputElement>)=>{
    if(e.key==='Backspace'){
      e.preventDefault()
      const arr=digits.split('')
      if(arr[index]){
        arr[index]=''
        commit(arr.join(''),index)
      }else if(index>0){
        arr[index-1]=''
        commit(arr.join(''),index-1)
      }
      return
    }
    if(e.key==='ArrowLeft'&&index>0){e.preventDefault();refs.current[index-1]?.focus()}
    if(e.key==='ArrowRight'&&index<3){e.preventDefault();refs.current[index+1]?.focus()}
  }

  const paste=(e:React.ClipboardEvent<HTMLInputElement>)=>{
    const pasted=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,4)
    if(!pasted)return
    e.preventDefault()
    commit(pasted,Math.min(pasted.length,4)-1)
  }

  return <div className="grid grid-cols-4 gap-2.5 sm:gap-3" role="group" aria-label={label}>
    {[0,1,2,3].map(i=><input
      key={i}
      ref={el=>{refs.current[i]=el}}
      aria-label={`${label}, dígito ${i+1}`}
      className="h-14 min-w-0 rounded-lg border border-slate-200 bg-white text-center text-2xl font-semibold text-ink-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-slate-50"
      inputMode="numeric"
      pattern="[0-9]*"
      type="password"
      maxLength={1}
      autoComplete={i===0?'one-time-code':'off'}
      disabled={disabled}
      required={required&&i===0}
      value={digits[i]||''}
      onFocus={e=>{
        if(i>digits.length){refs.current[Math.min(digits.length,3)]?.focus();return}
        e.currentTarget.select()
      }}
      onChange={e=>setAt(i,e.target.value)}
      onKeyDown={e=>keyDown(i,e)}
      onPaste={paste}
    />)}
  </div>
}
