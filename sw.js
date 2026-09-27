const CACHE = 'mistake-notebook-v1';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.json','./data/allen-jee-syllabus.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy)); return res;
  }).catch(()=>caches.match('./index.html'))));
});