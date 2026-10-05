const CACHE='ui-builder-__BUILD_ID__';
const LOCAL=['./','./index.html','./styles.css','./library-store.js','./app.js','./manifest.webmanifest','./icon-180.png','./icon-512.png',
  './assets/icons/back.svg?v=__BUILD_ID__',
  './assets/icons/home.svg?v=__BUILD_ID__',
  './assets/icons/undo.svg?v=__BUILD_ID__',
  './assets/icons/redo.svg?v=__BUILD_ID__',
  './assets/icons/preview.svg?v=__BUILD_ID__',
  './assets/icons/export.svg?v=__BUILD_ID__',
  './assets/icons/close.svg?v=__BUILD_ID__',
  './assets/icons/container-vertical.svg?v=__BUILD_ID__',
  './assets/icons/container-horizontal.svg?v=__BUILD_ID__',
  './assets/icons/spacer.svg?v=__BUILD_ID__',
  './assets/icons/info.svg?v=__BUILD_ID__',
  './assets/icons/layers.svg?v=__BUILD_ID__',
  './assets/icons/style.svg?v=__BUILD_ID__',
  './assets/icons/pages.svg?v=__BUILD_ID__'
];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(LOCAL)).then(()=>self.skipWaiting()));
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
