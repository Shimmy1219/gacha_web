// /src/blob-upload.js
// 目的: 「保存オプション」モーダルのロジックを1箇所に集約。
// - CSRF取得（Double Submit Cookie）
// - ZIP生成→Vercel Blob直送→受け取りURL発行（/api/receive/token）
// - UI配線（保存/アップロード/URLコピー/閉じる）
// - 既存との互換: window.__vercelBlobUpload を公開

import { upload } from 'https://esm.sh/@vercel/blob@0.23.4/client';

// ====== CSRF ======
let csrfToken = '';
export async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const r = await fetch(`/api/blob/csrf?ts=${Date.now()}`, {
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const j = await r.json();
  if (!r.ok || !j?.token) throw new Error('CSRF token fetch failed');
  csrfToken = j.token;
  return csrfToken;
}

// ====== メタ ======
function getUserId() {
  return (window.localStorage.getItem('uid') || 'guest');
}
const PURPOSE = 'zips';
const RECEIVE_TOKEN_TTL_DAYS = 7; // 受け取りURLの事実上の既定期限（サーバ側で運用）

// ====== 受け取り用リンク発行 ======
export async function issueReceiveShareUrl({ url, name, purpose = PURPOSE, validUntil }) {
  await ensureCsrf();
  const body = {
    url,
    name,
    purpose,
    validUntil: validUntil || new Date(Date.now() + RECEIVE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    csrf: csrfToken
  };
  const res = await fetch('/api/receive/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    const msg = j?.error || `Token API failed (${res.status})`;
    throw new Error(msg);
  }
  // { ok:true, token, shareUrl, exp }
  return j;
}

// ====== 直送アップロード（互換: window.__vercelBlobUpload） ======
export async function uploadZip(filename, blob, { userId = getUserId(), purpose = PURPOSE } = {}) {
  await ensureCsrf();
  return await upload(filename, blob, {
    access: 'public',
    multipart: true,                 // 100–200MB想定
    contentType: 'application/zip',
    handleUploadUrl: '/api/blob/upload',
    clientPayload: JSON.stringify({ csrf: csrfToken, userId, purpose })
  });
}

// 既存互換（既存コードが window.__vercelBlobUpload を呼んでいるため残す）
function exposeCompat() {
  window.__vercelBlobUpload = (filename, blob) => uploadZip(filename, blob);
}

// ====== ユーティリティ ======
function sanitizeLocal(s) {
  // 既存の sanitize() があればそれを使う。無ければ簡易実装。
  if (typeof window.sanitize === 'function') return window.sanitize(s);
  return String(s).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
}
function isUserAbort(err){
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    err?.name === 'AbortError' ||
    /aborted a request|user aborted|user canceled|user cancelled|キャンセル/.test(msg)
  );
}
function closeModalCompat(modal){
  // index.html 側の close(modal) があればそれを使う
  if (typeof window.close === 'function') { try { window.close(modal); return; } catch {} }
  // フォールバック（単体で閉じる）
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

// ====== UI 初期化（保存オプションモーダル） ======
export function initSaveModal() {
  exposeCompat();

  const modal     = document.getElementById('saveOptionModal');
  if (!modal) return;

  const closeBtn  = document.getElementById('saveOptClose');
  const saveBtn   = document.getElementById('saveDeviceBtn');
  const uploadBtn = document.getElementById('uploadBlobBtn');
  const resultBox = document.getElementById('uploadResult');
  const urlLink   = document.getElementById('uploadUrlLink');
  const urlText   = document.getElementById('uploadUrlText');
  const copyBtn   = document.getElementById('copyUploadUrlBtn');

  // 閉じる
  closeBtn?.addEventListener('click', () => closeModalCompat(modal));

  // 端末へ保存
  saveBtn?.addEventListener('click', async () => {
    const user = window.__saveTargetUser, gobj = window.__saveTargetGobj;
    if (!user || !gobj) return;
    const old = saveBtn.textContent;
    saveBtn.disabled = true; saveBtn.textContent = '保存準備…';
    try {
      // 1) ZIP生成（index.html にある buildZipForUser を利用）
      if (typeof window.buildZipForUser !== 'function') throw new Error('buildZipForUser() not found');
      const { blob } = await window.buildZipForUser(user, gobj);
      const filename = `${sanitizeLocal(user)}_gacha.zip`;

      // 2) File System Access API が使えればそちらを使う
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]
          });
          const w = await handle.createWritable();
          await w.write(blob); await w.close();
        } catch (e) {
          // ユーザーキャンセルは静かに無視
          if (!isUserAbort(e)) throw e;
        }
      } else {
        // 3) フォールバック: a[download]
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (e) {
      alert('保存に失敗: ' + (e?.message || e));
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = old;
    }
  });

  // Blobへアップロード → 受け取りURL発行 → UI反映
  uploadBtn?.addEventListener('click', async () => {
    const user = window.__saveTargetUser, gobj = window.__saveTargetGobj;
    if (!user || !gobj) return;

    const old = uploadBtn.textContent;
    uploadBtn.disabled = true; uploadBtn.textContent = 'アップロード中…';
    try {
      // 1) ZIP生成
      if (typeof window.buildZipForUser !== 'function') throw new Error('buildZipForUser() not found');
      const { blob } = await window.buildZipForUser(user, gobj);
      const filename = `${sanitizeLocal(user)}_gacha.zip`;

      // 2) 直送アップロード（Vercel Blob）
      const put = await window.__vercelBlobUpload(filename, blob);
      const downloadUrl = put.downloadUrl || put.url;
      if (!downloadUrl) throw new Error('upload response has no downloadUrl');

      // 3) 受け取りURLの発行
      const tokenRes = await issueReceiveShareUrl({
        url: downloadUrl,
        name: filename,
        purpose: PURPOSE
        // validUntil はサーバ側既定（7日想定）
      });
      const shareUrl = tokenRes?.shareUrl || '';
      if (!shareUrl) throw new Error('Token API returned no shareUrl');

      // 4) ユーザー別の最新URLとして保存（一覧の「URLをコピー」用）
      if (typeof window.setLastUploadUrl === 'function') {
        window.setLastUploadUrl(user, shareUrl);
      }
      if (typeof window.renderUsersList === 'function') {
        window.renderUsersList();
      }

      // 5) UI反映
      if (resultBox && urlLink) {
        resultBox.style.display = 'block';
        urlLink.href = shareUrl;
        urlLink.title = shareUrl;                 // hoverで全体確認
        if (urlText) urlText.textContent = shareUrl;
        else urlLink.textContent = shareUrl;     // #uploadUrlText が無くても表示
      }
    } catch (e) {
      console.error(e);
      alert('アップロード/共有リンク発行に失敗: ' + (e?.message || e));
    } finally {
      uploadBtn.disabled = false; uploadBtn.textContent = old;
    }
  });

  // 受け取りURLをコピー
  copyBtn?.addEventListener('click', async () => {
    const url = urlLink?.href || '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = 'コピーしました';
      setTimeout(() => (copyBtn.textContent = 'URLをコピー'), 1200);
    } catch {
      window.prompt('このURLをコピーしてください', url);
    }
  });
}
