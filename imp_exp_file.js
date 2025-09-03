/*!
 * imp_exp_file.js
 * すべての画像/動画/音声（IndexedDB）＋アプリ状態(JSON)を
 * ZIPにまとめ、任意でLZMA(.gabx)高圧縮して保存／復元するモジュール
 */
(function (global) {
  'use strict';

  // ===== 依存（既存の定義を尊重してフォールバック） =====
  const DB_NAME = global.DB_NAME || 'gachaImagesDB';
  const STORE   = global.STORE   || 'images';

  const K_IMG  = global.LS_KEY_IMG  || 'gacha_item_image_map_v1';
  const K_ORIG = global.LS_KEY_ORIG || 'gacha_item_original_v1';
  const K_SKIP = global.LS_KEY_SKIP || 'gacha_item_image_skip_v1';

  const JSZip = global.JSZip;
  const LZMA  = global.LZMA;
  const LZMA_WORKER_URL = "https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker-min.js";
  const lzma = (typeof LZMA !== 'undefined') ? new LZMA(LZMA_WORKER_URL) : null;

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

  // ===== LZMA helpers =====
  function lzmaCompress(u8, level=6){
    assert(lzma, "LZMA ライブラリ未ロード");
    return new Promise((res) => {
      lzma.compress(u8, level, (out)=> res(new Uint8Array(out)), ()=>{}, "uint8array");
    });
  }
  function lzmaDecompress(u8){
    assert(lzma, "LZMA ライブラリ未ロード");
    return new Promise((res, rej) => {
      lzma.decompress(u8, (out)=> {
        if (out instanceof Uint8Array) res(out);
        else if (typeof out === "string") res(new TextEncoder().encode(out));
        else rej(new Error("LZMA解凍結果の型不明"));
      }, ()=>{}, "uint8array");
    });
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

  // ===== 公開: エクスポート =====
  async function exportAll(format = "zip", btnEl){
    try{
      if (btnEl){ btnEl.disabled = true; btnEl.textContent = "収集中…"; }
      const zipBlob = await buildAllAsZipBlob();

      if (format === "zip"){
        await saveBlobSmart(zipBlob, "gacha_app_bundle.zip", "application/zip", btnEl);
        return;
      }
      if (format === "gabx"){
        if (btnEl) btnEl.textContent = "高圧縮中…";
        const u8 = new Uint8Array(await zipBlob.arrayBuffer());
        const lz = await lzmaCompress(u8, 6); // バランス重視
        const out = new Blob([lz], { type: "application/octet-stream" });
        await saveBlobSmart(out, "gacha_app_bundle.gabx", "application/octet-stream", btnEl);
        return;
      }
      throw new Error("未知のエクスポート形式: " + format);
    }catch(err){
      console.error(err);
      alert("エクスポートに失敗: " + (err?.message || err));
    }finally{
      if (btnEl){ btnEl.disabled = false; btnEl.textContent = "全体エクスポート"; }
    }
  }

  // 保存（File System Access → Web Share → ダウンロード）
  async function saveBlobSmart(blob, filename, mime, btnEl){
    if ('showSaveFilePicker' in global){
      const handle = await global.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: filename, accept: { [mime]: [ '.' + filename.split('.').pop() ] } }]
      });
      const w = await handle.createWritable();
      await w.write(blob); await w.close();
      if (btnEl){ btnEl.textContent = "保存しました"; setTimeout(()=> btnEl.textContent = "全体エクスポート", 900); }
      return;
    }
    if (navigator.canShare){
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files:[file] })){
        await navigator.share({ files:[file], title: filename });
        if (btnEl){ btnEl.textContent = "共有しました"; setTimeout(()=> btnEl.textContent = "全体エクスポート", 900); }
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    if (btnEl){ btnEl.textContent = "ダウンロード開始"; setTimeout(()=> btnEl.textContent = "全体エクスポート", 900); }
  }

  // ===== 公開: インポート =====
  async function importAll(fileOrBlob){
    try{
      assert(JSZip, "JSZip 未ロード");
      const ab = await fileOrBlob.arrayBuffer();
      let buf = new Uint8Array(ab);

      // まず ZIP として試す → ダメなら .gabx(LZMA) として解凍してから ZIP 読み込み
      let zip;
      try{
        zip = await JSZip.loadAsync(buf);
      }catch(_zipErr){
        try{
          const u8 = await lzmaDecompress(buf);
          zip = await JSZip.loadAsync(u8);
        }catch(e){
          throw new Error("ZIP でも .gabx でもありません");
        }
      }

      const metaFile = zip.file("app_state_v1.json");
      assert(metaFile, "app_state_v1.json が見つかりません");
      const meta = JSON.parse(await metaFile.async("string"));
      assert(meta && meta.version === 1, "未知のバンドル形式です");

      // 1) IDB 初期化
      await idbClear();

      // 2) IDB 書き戻し
      const files = Array.isArray(meta.idb?.files) ? meta.idb.files : [];
      for (const f of files){
        const zf = zip.file(f.name);
        if (!zf) continue;
        const raw = await zf.async("blob");
        const blob = f.type ? raw.slice(0, raw.size, f.type) : raw;
        await idbPut(f.key, blob);
      }

      // 3) アプリ状態を反映
      const br = getBridge();
      br.setState(meta.state || {
        gData: {}, gCatalogByGacha: {}, gHitCounts: {},
        selectedGacha: null, imgMap: {}, origMap: {}, skipArray:[]
      });

      // 4) 永続保存（マップ類）
      try{
        const st = meta.state || {};
        localStorage.setItem(K_IMG,  JSON.stringify(st.imgMap  || {}));
        localStorage.setItem(K_ORIG, JSON.stringify(st.origMap || {}));
        localStorage.setItem(K_SKIP, JSON.stringify(st.skipArray || []));
      }catch(e){}

      // 5) 画面更新
      br.afterRestore();
      alert("インポートが完了しました。");
    }catch(err){
      console.error(err);
      alert("インポートに失敗: " + (err?.message || err));
    }finally{
      // 呼び出し側で <input> の値はクリア済み
    }
  }

  // ===== 公開API =====
  global.ImpExp = { exportAll, importAll, /*内部デバッグ用*/ _buildZip: buildAllAsZipBlob };

})(window);
