const CACHE='wamercio-store-v1.2';
const SHELL=['/login','/manifest.webmanifest','/icon.svg','/favicon.ico'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).finally(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith('/api/')) return;
  if(url.pathname.startsWith('/_next/static/') || /\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(url.pathname)){
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;})));
    return;
  }
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;}).catch(()=>caches.match(req).then(x=>x||caches.match('/login'))));
  }
});
