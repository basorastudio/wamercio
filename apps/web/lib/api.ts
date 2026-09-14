export async function api<T=any>(path:string, init:RequestInit={}):Promise<T>{
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) headers.set('Content-Type','application/json')
  if(typeof window!=='undefined') headers.set('X-Wamercio-Host',window.location.hostname)
  const res = await fetch(`/api/v1${path}`, {...init, headers, credentials:'include', cache:'no-store'})
  const data = await res.json().catch(()=>({}))
  if(!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data as T
}
export async function upload(file:File):Promise<string>{
  const form=new FormData(); form.append('file',file)
  const data=await api<{url:string}>('/uploads',{method:'POST',body:form})
  return data.url
}
export const money=(n:number|string|undefined)=>new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',maximumFractionDigits:2}).format(Number(n||0))
export const dateTime=(v:string)=>new Intl.DateTimeFormat('es-DO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))
