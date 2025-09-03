// sw.js  —— 自動アップデート即時反映版
const VERSION = 'v2025-09-03-03';                // ★ デプロイ毎に必ず更新
const STATIC_CACHE  = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll([
      '/',                          // ルート（SPAなら index.html 相当）
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/manifest.webmanifest',
    ].map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();       // ★ 旧SWの待機をスキップ（即時切替の鍵）
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 旧バージョンのキャッシュを削除
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map(k => caches.delete(k))
    );
    await self.clients.claim();     // ★ 既存タブも即時コントロール
    // クライアントへ通知（任意：ログ用途）
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
  })());
});

// ★ ページ更新を即時化：新SWが waiting になったら skipWaiting 指示を受け付ける
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 取得戦略：HTMLは network-first、静的/メディアは stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // HTML（ナビゲーション）は常に新鮮さ優先
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(req.url, { cache: 'reload' }));
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(RUNTIME_CACHE);
        return (await cache.match(req)) || (await caches.match('/'));
      }
    })());
    return;
  }

  // それ以外：キャッシュ即時 + 裏で最新化
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    const updating = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || updating;
  })());
});
