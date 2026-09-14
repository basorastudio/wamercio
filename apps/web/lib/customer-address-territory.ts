export const unwrapTerritoryList=(value:any):any[]=>Array.isArray(value)?value:Array.isArray(value?.data)?value.data:Array.isArray(value?.items)?value.items:[]

export async function loadAddressTerritory(request:(path:string)=>Promise<any>,provinceCode:string,cityId:string){
  const cities=provinceCode?unwrapTerritoryList(await request(`/public/territories/cities?provinceCode=${encodeURIComponent(provinceCode)}`)):[]
  const neighborhoods=provinceCode&&cityId?unwrapTerritoryList(await request(`/public/territories/neighborhoods?cityId=${encodeURIComponent(cityId)}`)):[]
  return {cities,neighborhoods}
}
