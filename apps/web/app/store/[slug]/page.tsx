import {redirect} from 'next/navigation'

export default function LegacyStoreRoute({params}:{params:{slug:string}}){
  redirect(`/${params.slug}`)
}
