'use client'

import IntlTelInput,{type IntlTelInputRef} from '@intl-tel-input/react'
import {es} from 'intl-tel-input/locale'
import {useCallback,useMemo,useRef,useState} from 'react'

const COUNTRY_CACHE='wamercio_phone_country'

function fallbackCountry(){
  if(typeof navigator!=='undefined'){
    const locale=navigator.languages?.[0]||navigator.language||''
    const region=locale.split('-')[1]?.toLowerCase()
    if(region&&/^[a-z]{2}$/.test(region))return region
  }
  return 'do'
}

async function lookupCountry():Promise<any>{
  try{
    const cached=sessionStorage.getItem(COUNTRY_CACHE)
    if(cached&&/^[a-z]{2}$/.test(cached))return cached
    const res=await fetch('/api/v1/meta/country',{cache:'no-store',credentials:'same-origin'})
    if(res.ok){
      const data=await res.json() as {country?:string}
      const country=String(data.country||'').toLowerCase()
      if(/^[a-z]{2}$/.test(country)){
        sessionStorage.setItem(COUNTRY_CACHE,country)
        return country
      }
    }
  }catch{}
  return fallbackCountry()
}

export function phoneDisplay(value?:string|null){
  const raw=String(value||'').trim()
  if(!raw)return ''
  return raw.startsWith('+')?raw:`+${raw.replace(/\D/g,'')}`
}

type PhoneInputProps={
  value:string
  onChange:(value:string)=>void
  onValidityChange?:(valid:boolean)=>void
  required?:boolean
  disabled?:boolean
  autoFocus?:boolean
  placeholder?:string
  id?:string
  name?:string
  className?:string
  variant?:'default'|'dark'
  hideValidationMessage?:boolean
}

export default function PhoneInput({value,onChange,onValidityChange,required=false,disabled=false,autoFocus=false,placeholder,id,name,className='',variant='default',hideValidationMessage=false}:PhoneInputProps){
  const inputRef=useRef<IntlTelInputRef>(null)
  const [touched,setTouched]=useState(false)
  const [valid,setValid]=useState(!required||!value)
  const normalizedValue=useMemo(()=>phoneDisplay(value),[value])
  const initialCountryLookup=useCallback(()=>lookupCountry(),[])
  const updateValidity=(next:boolean)=>{
    setValid(next)
    const input=inputRef.current?.getInput()
    const hasValue=Boolean(input?.value.trim())
    input?.setCustomValidity(hasValue&&!next?'Revisa el número y el código de país.':'')
    onValidityChange?.(next)
  }

  const dark=variant==='dark'
  return <div className={`wamercio-phone-input ${dark?'wamercio-phone-input--dark':''} ${className}`}>
    <IntlTelInput
      ref={inputRef}
      value={normalizedValue}
      onChangeNumber={number=>{
        if(!number){inputRef.current?.getInput()?.setCustomValidity('');setValid(!required)}
        onChange(number)
      }}
      onChangeValidity={updateValidity}
      initialCountryLookup={initialCountryLookup}
      loadUtils={()=>import('intl-tel-input/utils')}
      separateDialCode
      showFlags
      countrySearch
      countrySelectorMode="AUTO"
      strictMode
      formatAsYouType
      numberDisplayFormat="INTERNATIONAL"
      placeholderNumberPolicy="AGGRESSIVE"
      countryNameLocale="es"
      uiTranslations={es}
      disabled={disabled}
      inputProps={{
        id,
        name,
        required,
        autoFocus,
        autoComplete:'tel',
        inputMode:'tel',
        ...(placeholder?{placeholder}:{}),
        className:`${dark?'wamercio-phone-control-dark':'field wamercio-phone-control'} ${touched&&!valid&&value?(dark?'!border-rose-400':'!border-rose-300 !ring-4 !ring-rose-100'):''}`,
        onBlur:()=>setTouched(true),
      }}
    />
    {!hideValidationMessage&&touched&&value&&!valid&&<p className={`mt-1.5 text-xs ${dark?'text-rose-300':'text-rose-600'}`}>Revisa el número y el código de país.</p>}
  </div>
}
