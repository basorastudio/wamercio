'use client'
import Link from 'next/link'
import {Clock3,Globe2,Link2,Palette,ShoppingBag,Store} from 'lucide-react'

const items=[
  {id:'general',label:'Mi negocio',href:'/settings/store?tab=general',icon:Store},
  {id:'design',label:'Diseño y marca',href:'/settings/store?tab=design',icon:Palette},
  {id:'sales',label:'Ventas y entrega',href:'/settings/store?tab=sales',icon:ShoppingBag},
  {id:'hours',label:'Horarios',href:'/settings/store?tab=hours',icon:Clock3},
  {id:'domains',label:'Dominios',href:'/settings/store?tab=domains',icon:Globe2},
  {id:'connection',label:'Conexión',href:'/settings/whatsapp',icon:Link2},
] as const

type SettingsTab=(typeof items)[number]['id']
type LocalTab='general'|'design'|'sales'|'hours'|'domains'
export default function SettingsNav({active,onSelect}:{active:SettingsTab;onSelect?:(tab:LocalTab)=>void}){
  return <aside className="card h-fit p-2 xl:sticky xl:top-[82px] xl:self-start">{items.map(item=>{
    const I=item.icon
    const cls=`flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold transition ${active===item.id?'bg-brand-50 text-brand-700':'text-[#747a92] hover:bg-[#fafbfc]'}`
    if((item.id==='general'||item.id==='design'||item.id==='sales'||item.id==='hours'||item.id==='domains')&&onSelect)return <button type="button" key={item.id} onClick={()=>onSelect(item.id)} className={cls}><I className="h-4 w-4"/>{item.label}</button>
    return <Link key={item.id} href={item.href} className={cls}><I className="h-4 w-4"/>{item.label}</Link>
  })}</aside>
}
