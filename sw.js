const CACHE = 'gacha-viewer-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  // アイコン・フォント・CDN不可のローカルスクリプト等を列挙
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

// キャッシュ優先 / ランタイムはネット→失敗時キャッシュ
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(r=>r || fetch(e.request)));
  } else {
    e.respondWith(
      fetch(e.request).catch(()=>caches.match(e.request))
    );
  }
});
