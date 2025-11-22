// src/services/imagesService.js (v2)
import { BaseService, loadLocalJSON, saveLocalJSON } from './core/base.js';

const DB_NAME = 'gachaImagesDB', STORE = 'images';

async function idbOpen(){
  return await new Promise((res,rej)=>{
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = e => { const db = e.target.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    r.onsuccess = e => res(e.target.result);
    r.onerror = e => rej(e.target.error);
  });
}
async function idbPut(key,blob){ const db=await idbOpen(); return await new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(blob,key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); }
async function idbGet(key){ const db=await idbOpen(); return await new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(key); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); }
async function idbDelete(key){ const db=await idbOpen(); return await new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); }

export class ImagesService extends BaseService {
  constructor({mapKey='gacha_item_image_map_v2', origKey='gacha_item_original_v2', skipKey='gacha_item_image_skip_v2'} = {}) {
    super();
    this.K_MAP = mapKey; this.K_ORIG = origKey; this.K_SKIP = skipKey;
    this.map = {};          // { itemKey: "idb:<id>" or URL }
    this.orig = {};         // { itemKey: { mime, idbKey } }
    this.skip = new Set();  // Set<itemKey or "gachaId::">
  }

  load(){
    this.map  = loadLocalJSON(this.K_MAP, {}) || {};
    this.orig = loadLocalJSON(this.K_ORIG, {}) || {};
    this.skip = new Set(loadLocalJSON(this.K_SKIP, []) || []);
    this._emit(); return true;
  }
  save(){
    saveLocalJSON(this.K_MAP, this.map);
    saveLocalJSON(this.K_ORIG, this.orig);
    saveLocalJSON(this.K_SKIP, Array.from(this.skip));
  }

  // ---- skip ----
  hasSkip(key){ return this.skip.has(key) || this.skip.has(this._stripGacha(key)); }
  addSkip(key){ this.skip.add(key); this.skip.delete(this._stripGacha(key)); this.save(); this._emit(); }
  delSkip(key){ this.skip.delete(key); this.skip.delete(this._stripGacha(key)); this.save(); this._emit(); }
  toggleSkip(key){ this.hasSkip(key) ? this.delSkip(key) : this.addSkip(key); }

  _stripGacha(key){ const i=key.indexOf('::'); return i>=0 ? key.slice(0,i) + '::' : key; }

  // ---- blobs / url ----
  async putBlob(itemKey, blob){
    const idbKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await idbPut(idbKey, blob);
    this.map[itemKey] = `idb:${idbKey}`;
    this.orig[itemKey] = { mime: blob.type || 'application/octet-stream', idbKey };
    this.save(); this._emit();
  }
  async getBlobUrl(itemKey){
    const v = this.map[itemKey]; if(!v) return null;
    if(v.startsWith('idb:')){ const blob = await idbGet(v.slice(4)); return blob ? URL.createObjectURL(blob) : null; }
    return v;
  }
  async clear(item){
    const key = typeof item === 'string' ? item : `${item.gachaId}::${item.rarity}::${item.code}`;
    const mapVal = this.map[key];
    if (mapVal?.startsWith('idb:')) await idbDelete(mapVal.slice(4));
    delete this.map[key]; delete this.orig[key];
    this.save(); this._emit();
  }

  /** ガチャ単位やレア単位でまとめクリア：prefix = "gachaId::" or "gachaId::rarity::" */
  async clearByPrefix(prefix){
    const toDel = Object.keys(this.map).filter(k => k.startsWith(prefix));
    for (const k of toDel) {
      const v = this.map[k];
      if (v?.startsWith('idb:')) await idbDelete(v.slice(4));
      delete this.map[k]; delete this.orig[k];
    }
    this.save(); this._emit();
  }

  /** itemKey のリネーム（map, orig, skip を横断更新） */
  renameKey(oldKey, newKey){
    if (!oldKey || !newKey || oldKey === newKey) return false;
    let touched = false;
    if (this.map && (oldKey in this.map)){ this.map[newKey] = this.map[oldKey]; delete this.map[oldKey]; touched = true; }
    if (this.orig && (oldKey in this.orig)){ this.orig[newKey] = this.orig[oldKey]; delete this.orig[oldKey]; touched = true; }
    if (this.skip.has(oldKey)){ this.skip.delete(oldKey); this.skip.add(newKey); touched = true; }
    if (touched){ this.save(); this._emit(); }
    return touched;
  }

  /** catalogs に存在しない itemKey を掃除 */
  pruneByCatalog(catalogs){
    const valid = new Set();
    for (const [gachaId, cat] of Object.entries(catalogs || {})) {
      const items = cat?.items || {};
      for (const [rarity, codes] of Object.entries(items)) {
        for (const code of (codes || [])) valid.add(`${gachaId}::${rarity}::${code}`);
      }
    }

    let touched = false;
    for (const k of Object.keys(this.map || {}))  if (!valid.has(k)) { delete this.map[k]; touched = true; }
    for (const k of Object.keys(this.orig || {})) if (!valid.has(k)) { delete this.orig[k]; touched = true; }

    // skip は "gachaId::" のガチャ単位指定を維持。itemKey 形式のみ精査。
    const next = new Set();
    for (const v of this.skip) {
      if (typeof v === 'string' && v.split('::').length >= 3) {
        if (valid.has(v)) next.add(v);
      } else {
        next.add(v);
      }
    }
    if (next.size !== this.skip.size){ this.skip = next; touched = true; }

    if (touched){ this.save(); this._emit(); }
    return touched;
  }
}
