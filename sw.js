// Reviewed immutable same-origin shell only. Public accepted evidence is in
// IndexedDB, never HTTP caches. No invoice, payment, external media or runtime writes.
const OFFLINE_CACHE = "anmore-social-shell-v1";
const SHELL = ["index.html","app.js","feed.css","manifest.webmanifest","icons/icon-192.png","icons/apple-touch-icon.png","offline.html","offline.css"];
self.addEventListener("fetch", event => {
 const request=event.request,url=new URL(request.url),root=new URL('./',self.registration.scope);
 if(request.method!=="GET"||url.origin!==root.origin)return;
 const path=url.pathname.slice(root.pathname.length);
 const landing=(path===''||path==='index.html')&&(url.search===''||url.search==='?source=pwa')&&request.mode==='navigate';
 const asset=SHELL.includes(path)&&(url.search===''||(['app.js','feed.css'].includes(path)&&url.search==='?v=durable-feed-1'));
 if(!landing&&!asset)return;
 // Version-pinned cache-first shell avoids mixing new markup and an old bundle.
 // Activation remains explicit; no network response is ever written at runtime.
 event.respondWith((async()=>{
  const cache=await caches.open(OFFLINE_CACHE);
  return await cache.match(new URL(landing?'index.html':path,root).href)||fetch(request,{cache:'no-store'});
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='ACTIVATE_OFFLINE_UPDATE'&&event.source?.url&&new URL(event.source.url).origin===self.location.origin)
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('install',event=>event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.addAll(SHELL.map(path=>'./'+path)))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key!==OFFLINE_CACHE&&['anmore-social-pwa-','anmore-social-offline-','anmore-social-shell-'].some(prefix=>key.startsWith(prefix))).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
