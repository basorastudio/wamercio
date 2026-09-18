import {NextRequest,NextResponse} from 'next/server'

const platformRoutes=['/admin','/dashboard','/pos','/orders','/quotes','/conversations','/customers','/crm','/tasks','/flows','/voice','/calls','/courier','/catalog','/staff','/delivery','/payment-methods','/settings','/stores','/plans','/support','/transactions','/coupons','/register','/login']
const clean=(v:string)=>v.split(':')[0].toLowerCase().replace(/\.$/,'')

export function middleware(req:NextRequest){
  const host=clean(req.headers.get('x-forwarded-host')||req.headers.get('host')||'')
  const platform=(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase()
  const isPlatform=host===platform||host===`www.${platform}`||host==='localhost'||host==='127.0.0.1'
  const path=req.nextUrl.pathname
  if(!isPlatform&&platformRoutes.some(prefix=>path===prefix||path.startsWith(prefix+'/'))){
    const url=req.nextUrl.clone();url.protocol='https:';url.host=platform;return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|api/|media/).*)']}
