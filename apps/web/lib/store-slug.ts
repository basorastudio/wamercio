export function storeSlugify(value:string){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g,'')
    .slice(0,80)
}
