'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {Boxes,Tags} from 'lucide-react'

const items=[
  {href:'/catalog/products',label:'Productos',icon:Boxes},
  {href:'/catalog/categories',label:'Categorías',icon:Tags},
]

export default function CatalogNav(){
 const path=usePathname()
 return <div className="mb-5 inline-flex rounded-2xl border border-[#e8ebf2] bg-white p-1 shadow-sm">{items.map(item=>{const I=item.icon;const active=path===item.href;return <Link key={item.href} href={item.href} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${active?'bg-brand-50 text-brand-700':'text-[#7b8197] hover:bg-[#fafbfe]'}`}><I className="h-4 w-4"/>{item.label}</Link>})}</div>
}
