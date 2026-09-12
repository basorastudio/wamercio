'use client'
import Link from 'next/link'
import {Clock3,Link2,ShoppingBag,Store} from 'lucide-react'

const items=[
  {id:'general',label:'Mi negocio',href:'/settings/store?tab=general',icon:Store},
  {id:'sales',label:'Ventas y entrega',href:'/settings/store?tab=sales',icon:ShoppingBag},
  {id:'hours',label:'Horarios',href:'/settings/store?tab=hours',icon:Clock3},
  {id:'connection',label:'Conexión',href:'/settings/whatsapp',icon:Link2},
] as const

type SettingsTab=(typeof items)[number]['id']

export default function SettingsNav({active,onSelect}:{active:SettingsTab;onSelect?:(tab:'general'|'sales'|'hours')=>void}){
  return <aside className="card h-fit p-2">{items.map(item=>{
    const I=item.icon
    const cls=`flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold transition ${active===item.id?'bg-brand-50 text-brand-700':'text-[#747a92] hover:bg-[#fafbfc]'}`
    if(item.id!=='connection'&&onSelect)return <button type="button" key={item.id} onClick={()=>onSelect(item.id)} className={cls}><I className="h-4 w-4"/>{item.label}</button>
    return <Link key={item.id} href={item.href} className={cls}><I className="h-4 w-4"/>{item.label}</Link>
  })}</aside>
}
