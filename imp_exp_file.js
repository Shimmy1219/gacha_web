/*!
 * imp_exp_file.js
 * すべての画像/動画/音声（IndexedDB）＋アプリ状態(JSON)を
 * ZIPにまとめ、保存／復元するモジュール
 */
(function (global) {
  'use strict';

  // ===== 依存（既存の定義を尊重してフォールバック） =====
  const DB_NAME = global.DB_NAME || 'gachaImagesDB';
  const STORE   = global.STORE   || 'images';

  const K_IMG  = global.LS_KEY_IMG  || 'gacha_item_image_map_v1';
  const K_ORIG = global.LS_KEY_ORIG || 'gacha_item_original_v1';
  const K_SKIP = global.LS_KEY_SKIP || 'gacha_item_image_skip_v1';


  const APP_BUNDLE_EXT = '.shimmy';
  const APP_BUNDLE_MIME = 'application/x-shimmy'; 

  const JSZip = global.JSZip;
  function assert(cond, msg){ if(!cond) throw new Error(msg); }

  // ===== IndexedDB helpers =====
  function idbOpen(){
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      r.onsuccess = (e) => res(e.target.result);
      r.onerror = (e) => rej(e.target.error);
    });
  }
  async function idbPut(key, blob){
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = ()=>res(true);
      tx.onerror = ()=>rej(tx.error);
    });
  }
  async function idbGet(key){
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = ()=>res(rq.result || null);
      rq.onerror   = ()=>rej(rq.error);
    });
  }
  async function idbClear(){
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = ()=>res(true);
      tx.onerror    = ()=>rej(tx.error);
    });
  }
  async function idbListAllBlobs(){
    const db = await idbOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const list = [];
      const req = store.openCursor();
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if(cur){
          list.push({ key: String(cur.key), blob: cur.value });
          cur.continue();
        }
      };
      req.onerror = ()=> reject(req.error);
      tx.oncomplete = ()=>{
        resolve(list.map(({key, blob})=>({
          key,
          blob,
          type: (blob && blob.type) || "",
          size: blob?.size || 0
        })));
      };
    });
  }

  // ===== base64url for file-safe names =====
  function b64urlEncode(str){
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function b64urlDecode(s){
    s = s.replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  // ===== Appブリッジ =====
  function getBridge(){
    const br = global.AppStateBridge;
    assert(br && typeof br.getState === 'function' && typeof br.setState === 'function',
      "AppStateBridge が見つかりません（index.html 側にブリッジを定義してください）");
    return br;
  }

  // ===== ZIP 構築（内部関数） =====
  async function buildAllAsZipBlob(){
    assert(JSZip, "JSZip 未ロード");
    const zip = new JSZip();

    // 1) IDB原本 → /idb に格納（動画/音声は無再圧縮が合理的）
    const files = await idbListAllBlobs();
    const idbFiles = [];
    for(const {key, blob, type, size} of files){
      const name = `idb/${b64urlEncode(key)}`;
      zip.file(name, blob, { binary: true, compression: "STORE" });
      idbFiles.push({ key, name, type, size });
    }

    // 2) JSONメタ（アプリ状態一式）
    const br = getBridge();
    const st = br.getState();  // { gData, gCatalogByGacha, gHitCounts, selectedGacha, imgMap, origMap, skipArray }
    const meta = {
      version: 1,
      savedAt: new Date().toISOString(),
      state: st,
      idb: { store: STORE, files: idbFiles }
    };
    zip.file("app_state_v1.json", JSON.stringify(meta, null, 2), {
      compression: "DEFLATE", compressionOptions: { level: 6 }
    });

    // 3) ZIP化
    return await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
  }

  async function importAllZip(fileOrBlob, btnEl){
    if (btnEl){ btnEl.disabled = true; btnEl.textContent = "読み込み中…"; }

    const zip = await JSZip.loadAsync(fileOrBlob);
    const metaEntry = zip.file('app_state_v1.json');
    if (!metaEntry) throw new Error('app_state_v1.json が見つかりません');

    const meta = JSON.parse(await metaEntry.async('string'));
    const snap = meta?.state || {};
    const mapping = meta?.blobs || {};

    // 1) JSON 状態をアプリに流し込む
    gData            = snap.gData || {};
    gCatalogByGacha  = snap.gCatalogByGacha || {};
    gHitCounts       = snap.gHitCounts || {};
    imgMap           = snap.imgMap || {};
    origMap          = snap.origMap || {};
    skipSet          = new Set(snap.skip || []);
    gRarityOrder     = snap.rarityOrder || gRarityOrder;
    riaguMeta        = snap.riaguMeta || {};     

    // 2) バイナリをIDBに復元（origMap に対応づけ）
    for (const [key, rel] of Object.entries(mapping)){
      const f = zip.file(rel);
      if (!f) continue;
      const blob = await f.async('blob');
      await idbPut(key + '|orig', blob);
      origMap[key] = 'idb:' + (key + '|orig');

      // サムネが無い場合は、種類に応じて再生成（軽量）
      const isImage = /^image\//.test(blob.type);
      const isVideo = /^video\//.test(blob.type);
      const isAudio = /^audio\//.test(blob.type);

      let thumb = null;
      if (isImage) thumb = await compressImage(blob, { maxSize: 256, typePrefer: ["image/webp","image/jpeg"], quality: 0.85 });
      else if (isVideo) thumb = await extractVideoThumbnail(blob, { time: 0.1, maxSize: 256 });
      else if (isAudio) thumb = await makeNotePlaceholder(256);

      if (thumb) {
        await idbPut(key + '|thumb', thumb);
        imgMap[key] = 'idb:' + (key + '|thumb');
      }
    }

    // 3) ストレージへ保存
    saveLocalJSON(LS_KEY_IMG, imgMap);
    saveLocalJSON(LS_KEY_ORIG, origMap);
    saveLocalJSON(LS_KEY_SKIP, Array.from(skipSet));
    saveLocalJSON(LS_KEY_RIAGU_META, riaguMeta);

    // 4) UI 再構築
    rebuildGachaCaches();
    renderTabs();
    renderItemGrid();
    renderUsersList();
    if (typeof renderRiaguPanel === 'function') renderRiaguPanel();

    if (btnEl){ btnEl.disabled = false; btnEl.textContent = "全体インポート"; }
  }

  // 保存（File System Access → Web Share → ダウンロード）
  async function saveBlobSmart(blob, filename, mime, btnEl){
    // 1) File System Access API
    if ('showSaveFilePicker' in window){
      try{
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: filename, accept: { [mime]: [ '.' + filename.split('.').pop() ] } }]
        });
        const w = await handle.createWritable();
        await w.write(blob); await w.close();
        if (btnEl){ btnEl.textContent = "保存しました"; setTimeout(()=> btnEl.textContent = "全体エクスポート", 900); }
        return;
      }catch(e){
        // ← キャンセルは“成功扱いで何もしない”
        if (e && (e.name === 'AbortError' || e.code === 20)) {
          if (btnEl){ btnEl.disabled = false; btnEl.textContent = "全体エクスポート"; }
          return;
        }
        // それ以外は次の手段へフォールバック
      }
    }

    // 2) Web Share Level 2
    if (navigator.canShare){
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files:[file] })){
        await navigator.share({ files:[file], title: filename }).catch(()=>{ /* キャンセルは無視 */ });
        if (btnEl){ btnEl.textContent = "共有しました"; setTimeout(()=> btnEl.textContent = "全体エクスポート", 900); }
        return;
      }
    }

    // 3) ダウンロードリンク
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    if (btnEl){ btnEl.textContent = "ダウンロード開始"; setTimeout(()=> btnEl.textContent = "全体エクスポート", 900); }
  }

  // 保存（File System Access → Web Share → ダウンロード）
  async function exportAllZip(btnEl){
    if (btnEl){ btnEl.disabled = true; btnEl.textContent = "パッキング中…"; }

    // 1) JSON スナップショット（縮小整形でもOK）
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      state: {
        gData, gCatalogByGacha, gHitCounts,
        imgMap, origMap, skip: Array.from(skipSet),
        rarityOrder: gRarityOrder,
        riaguMeta   // ★追加
      },
      blobs: {}
    };
    const zip = new JSZip();

    // 2) 原本バイナリ（origMap優先、無ければimgMapのidb）を /blobs/ に入れる
    const blobsDir = zip.folder('blobs');
    for (const key of new Set([...Object.keys(origMap), ...Object.keys(imgMap)])) {
      // スキップは出力対象外
      if (skipHas(key)) continue;

      // まず origMap
      let blob = null;
      const orig = origMap[key];
      if (orig && orig.startsWith('idb:')) blob = await idbGet(orig.slice(4));

      // fallback: imgMap が idb:thumb の場合でも、可能ならそれを拾う
      if (!blob) {
        const v = imgMap[key];
        if (v && v.startsWith('idb:')) blob = await idbGet(v.slice(4));
      }
      if (!blob) continue;

      const ext = guessExt(blob.type) || 'bin';
      const safe = sanitize(key).replace(/::/g,'__');
      const rel = `blobs/${safe}.${ext}`;

      blobsDir.file(`${safe}.${ext}`, blob, { binary: true, compression: "STORE" }); // 原本は非圧縮で保持
      snapshot.blobs[key] = rel;
    }

    // 3) JSON を格納
    zip.file('app_state_v1.json', JSON.stringify(snapshot, null, 2));

    // 4) ZIP 化（メタはDEFLATE、バイナリは上でSTOREにしてある）
    const blob = await zip.generateAsync({ type: 'blob', compression: "DEFLATE", compressionOptions: { level: 6 } });

    // 5) 保存
    await saveBlobSmart(
      blob,
      `gacha_app_export_${Date.now()}${APP_BUNDLE_EXT}`,
      APP_BUNDLE_MIME,
      btnEl
    );


    if (btnEl){ btnEl.disabled = false; btnEl.textContent = "全体エクスポート"; }
  }
  // ===== 公開API =====
  global.ImpExp = {
  // 旧名（既存コードの互換用）
  exportAllZip,
  importAllZip,
  // 新名（将来はこっちを使う想定）
  exportAll: exportAllZip,
  importAll: importAllZip,
  // 参照用に公開（UI 側で accept に使える）
  BUNDLE_EXT: APP_BUNDLE_EXT,
  BUNDLE_MIME: APP_BUNDLE_MIME,
  /*内部デバッグ用*/ _buildZip: buildAllAsZipBlob
};

})(window);
