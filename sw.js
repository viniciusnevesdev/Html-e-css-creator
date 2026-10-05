const CACHE='ui-builder-__BUILD_ID__';
const LOCAL=['./','./index.html','./styles.css','./library-store.js','./app.js','./manifest.webmanifest','./icon-180.png','./icon-512.png',
  './assets/icons/back.svg',
  './assets/icons/home.svg',
  './assets/icons/undo.svg',
  './assets/icons/redo.svg',
  './assets/icons/preview.svg',
  './assets/icons/export.svg',
  './assets/icons/close.svg',
  './assets/icons/container-vertical.svg',
  './assets/icons/container-horizontal.svg',
  './assets/icons/spacer.svg',
  './assets/icons/info.svg',
  './assets/icons/layers.svg',
  './assets/icons/style.svg',
  './assets/icons/pages.svg'
];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(LOCAL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  const url=new URL(e.request.url);
  const sameOrigin=url.origin===self.location.origin;

  if(sameOrigin){
    e.respondWith(
      fetch(e.request)
        .then(res=>{
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
          return res;
        })
        .catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request)
      .then(hit=>hit||fetch(e.request).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        return res;
      }))
  );
});
