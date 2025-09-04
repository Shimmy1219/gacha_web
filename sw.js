// sw.js  —— 自動アップデート即時反映版 + ライブラリ類のプレキャッシュ対応
const VERSION = 'v2025-09-05-11';                // ★ デプロイ毎に必ず更新
const STATIC_CACHE  = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

// ライブラリ/ワーカー/自前JS を “同一オリジン” で確実にオフライン配信するためのプレキャッシュ対象
// （存在しないパスはキャッシュ失敗になるので、配置したものだけ残してください）
const PRECACHE_URLS = [
  '/',                        // ルート（SPAなら index.html 相当）
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',

  // --- ライブラリ類（/lib 配下に配置したものを列挙）---
  '/lib/jszip.min.js',
  '/lib/pako.min.js',

  // --- あなたのアプリコード（必要に応じて）---
  '/imp_exp_file.js',
  // '/styles.css', '/index.html', なども必要なら追加
];

// ===== install =====
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // cache.addAll は失敗するとトランザクション全体が落ちるため、Request(cache:'reload') で確実性を上げる
    await cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();       // ★ 旧SWの待機をスキップ（即時切替の鍵）
  })());
});

// ===== activate =====
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

// ===== fetch =====
// 取得戦略：
//  - HTML/ナビゲーション … network-first（オンラインなら常に最新）
//  - PRECACHE_URLS（/lib のライブラリや Worker 等）… cache-first（確実なオフライン動作）
//  - それ以外 … stale-while-revalidate（キャッシュ即時 + 裏で最新化）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) HTML（ナビゲーション）は常に新鮮さ優先
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(req.url, { cache: 'reload' }));
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // オフライン時はキャッシュから
        const cache = await caches.open(RUNTIME_CACHE);
        return (await cache.match(req)) || (await caches.match('/'));
      }
    })());
    return;
  }

  // 2) プレキャッシュ対象は cache-first（/lib のワーカーや圧縮ライブラリを確実に供給）
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        // 取得失敗時はキャッシュが無ければそのままエラー
        return cached || Promise.reject(e);
      }
    })());
    return;
  }

  // 3) その他：stale-while-revalidate
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
