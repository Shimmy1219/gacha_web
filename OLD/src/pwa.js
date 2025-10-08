// /src/pwa.js
// 役割:
// - Service Worker の登録とアップデートチェック（起動時・可視化時・定期）
// - SW の controllerchange で即時リロード
// - SW からの message 受信（SW_ACTIVATED ログ）
// - PWA(standalone) × モバイル相当でのズーム抑止（ダブルタップ/二本指）
//
// 既存 index.html の挙動を等価再現。副作用は initPWA() 呼び出し時のみ。

const SW_URL = '/sw.js';
const SW_REGISTER_OPTIONS = { type: 'module' };
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1h

let _regPromise = null;

// 追加: バックオフ付きリトライ
async function retryRegister(maxAttempts = 6) { // 6回で ~63秒程度
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, SW_REGISTER_OPTIONS);
      return reg;
    } catch (e) {
      attempt++;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15000); // 1s,2s,4s,8s,15s,15s...
      console.warn(`[pwa] register attempt ${attempt} failed:`, e);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`[pwa] SW register failed after ${maxAttempts} attempts`);
}

/** Service Worker を登録（多重呼び出しガード付き） */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (_regPromise) return _regPromise;

  _regPromise = new Promise((resolve) => {
    window.addEventListener('load', async () => {
      try {
        const reg = await retryRegister();

        // 起動直後にアップデート確認
        try { reg.update(); } catch {}

        // タブが可視になったらもう一度アップデート確認
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            try { reg.update(); } catch {}
          }
        });

        // 定期チェック（1時間ごと）
        setInterval(() => {
          try { reg.update(); } catch {}
        }, UPDATE_INTERVAL_MS);

        // 新SWへの乗り換えが発生したら即リロード
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // 連続リロード暴発を避けるため、最初の1回だけ
          if (!window.__swReloadedOnce) {
            window.__swReloadedOnce = true;
            location.reload();
          }
        });

        // 任意のログ（sw.js 側が postMessage({type:'SW_ACTIVATED'}) 済み）
        navigator.serviceWorker.addEventListener('message', (ev) => {
          if (ev?.data?.type === 'SW_ACTIVATED') {
            // 例: { type:'SW_ACTIVATED', version:'v2025-...' }
            console.log('[SW] activated:', ev.data.version || ev.data);
            // 必要ならアプリ側へイベント転送
            window.dispatchEvent(new CustomEvent('sw-activated', { detail: ev.data }));
          }
        });

        resolve(reg);
      } catch (e) {
        // ★ここで終わらせない：可視化のたびに再試行する
        console.warn('SW registration failed', e);

        const retryOnVisible = async () => {
          try {
            const reg = await retryRegister();
            document.removeEventListener('visibilitychange', onVisible);
            resolve(reg);
          } catch (err) {
            console.warn('[pwa] retry on visible failed:', err);
          }
        };
        const onVisible = () => {
          if (document.visibilityState === 'visible') {
            retryOnVisible();
          }
        };
        document.addEventListener('visibilitychange', onVisible);

        // さらに、一定間隔で自動再試行（最後は resolve する）
        const interval = setInterval(async () => {
          try {
            const reg = await retryRegister();
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            resolve(reg);
          } catch (err) {
            console.warn('[pwa] periodic retry failed:', err);
          }
        }, 15000); // 15sごと
      }
    }, { once: true });
  });

  return _regPromise;
}

/** PWA(standalone) × モバイル相当で、ダブルタップ＆ピンチズームを抑止 */
export function setupMobileStandaloneZoomBlock() {
  // “モバイル相当”かつ PWA(standalone) 判定
  const isMobile = window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)').matches;
  const isStandalone =
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator.standalone === 'boolean' && navigator.standalone === true); // iOS Safari

  if (!isMobile || !isStandalone) return;

  // 入力系はズーム抑止の対象外
  const isInteractive = (el) =>
    !!el.closest('input, textarea, select, button, [role="button"], [contenteditable="true"], .allow-zoom, .tab, #gachaTabs');

  // ダブルタップズーム抑止
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      if (isInteractive(e.target)) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // ピンチズーム抑止（2本指開始をキャンセル）
  document.addEventListener(
    'touchstart',
    (e) => {
      if (isInteractive(e.target)) return;
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
}

/** 初期化: SW 登録 + モバイルPWAズーム抑止 */
export function initPWA() {
  registerServiceWorker();
  setupMobileStandaloneZoomBlock();
}
