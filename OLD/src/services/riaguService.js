// src/services/riaguService.js (v2)
import { BaseService, loadLocalJSON, saveLocalJSON, json } from './core/base.js';

const LS_KEY_DEFAULT = 'gacha_riagu_meta_v2';
const SKIP_KEY = 'gacha_item_image_skip_v2'; // 画像スキップと同居（配列互換）

export class RiaguService extends BaseService {
  constructor(key = LS_KEY_DEFAULT){ 
    super(); 
    this.key = key; 
    this.meta = {}; // { itemKey: {...} }
    this._skipSet = null; // 遅延ロード
  }

  load(){ this.meta = loadLocalJSON(this.key, {}) || {}; this._emit(); return true; }
  save(){ saveLocalJSON(this.key, this.meta); }
  get(){ return this.meta; }
  set(v){ this.meta = json.clone(v); this.save(); this._emit(); }
  patch(mut){ const m = json.clone(this.meta); mut(m); this.set(m); }

  // ---- key helpers ----
  keyOf(gachaId, rarity, code){ return `${gachaId}::${rarity}::${code}`; }

  // ---- meta ops ----
  getMeta(k){ return (this.meta || {})[k] || null; }
  setMeta(k, meta){ this.meta = { ...(this.meta||{}), [k]: { ...meta } }; this.save(); this._emit(); }

  // ---- skipSet 同期（画像と共用の配列キーを読む）----
  _loadSkipArray(){
    try{ return JSON.parse(localStorage.getItem(SKIP_KEY) || '[]') || []; }catch{ return []; }
  }
  _saveSkipArray(){
    try{ localStorage.setItem(SKIP_KEY, JSON.stringify(Array.from(this._skipSet||[]))); }catch{}
  }

  listKeys(){
    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray());
    return new Set(this._skipSet);
  }
  addKey(k){
    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray());
    if (!this._skipSet.has(k)) { this._skipSet.add(k); this._saveSkipArray(); this._emit(); }
  }
  delKey(k){
    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray());
    if (this._skipSet.delete(k)) { this._saveSkipArray(); this._emit(); }
  }

  // ---- mark/unmark ----
  async mark(item, meta){
    const k = typeof item === 'string' ? item : this.keyOf(item.gachaId, item.rarity, item.code);
    this.setMeta(k, meta || {});
    this.addKey(k);
  }
  unmark(item){
    const k = typeof item === 'string' ? item : this.keyOf(item.gachaId, item.rarity, item.code);
    const next = { ...(this.meta||{}) }; delete next[k];
    this.meta = next; this.save();
    this.delKey(k);
    this._emit();
  }

  // ---- winners (AppState v2 版) ----
  winnersForKey(k, appState){
    const [gachaId, rarity, code] = k.split('::');
    const winners = []; let total = 0;

    const counts = (appState?.getCounts && appState.getCounts()) || {};
    const data   = (appState?.getData && appState.getData()) || {};
    const hasCounts = counts && Object.keys(counts).length > 0;

    if (hasCounts) {
      for (const [user, gobj] of Object.entries(counts)) {
        const n = ((((gobj || {})[gachaId] || {})[rarity] || {})[code] || 0) | 0;
        if (n > 0) { winners.push({ user, count: n }); total += n; }
      }
    }
    for (const [user, uobj] of Object.entries(data || {})) {
      const have = ((((uobj || {})[gachaId] || {}).items || {})[rarity] || []).includes(code);
      if (!have) continue;
      if (winners.some(w => w.user === user)) continue;
      const n = ((((counts || {})[user] || {})[gachaId] || {})[rarity] || {})[code] | 0;
      const cnt = n > 0 ? n : 1;
      winners.push({ user, count: cnt }); total += cnt;
    }
    return { winners, total };
  }

  // ---- meta/skip の整合性を保つ掃除 ----
  pruneByCatalog(catalogs){
    const valid = new Set();
    for (const [gachaId, cat] of Object.entries(catalogs || {})) {
      const items = cat?.items || {};
      for (const [rarity, codes] of Object.entries(items)) {
        for (const code of (codes || [])) valid.add(`${gachaId}::${rarity}::${code}`);
      }
    }

    let touched = false;
    this.patch(meta=>{
      for (const k of Object.keys(meta || {})) {
        if (!valid.has(k)) { delete meta[k]; touched = true; }
      }
    });

    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray() || []);
    const next = new Set();
    for (const v of this._skipSet) {
      if (typeof v === 'string' && v.split('::').length >= 3) {
        if (valid.has(v)) next.add(v);
      } else {
        next.add(v);
      }
    }
    if (next.size !== this._skipSet.size) { this._skipSet = next; this._saveSkipArray(); touched = true; }

    if (touched) this._emit?.();
    return touched;
  }

  // ---- itemKey のリネーム（meta + skipSet）----
  renameKey(oldKey, newKey){
    if (!oldKey || !newKey || oldKey === newKey) return false;

    this.patch(m=>{
      if (m && (oldKey in m)){
        m[newKey] = typeof structuredClone === "function" ? structuredClone(m[oldKey]) : JSON.parse(JSON.stringify(m[oldKey]));
        delete m[oldKey];
      }
    });

    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray() || []);
    if (this._skipSet.has(oldKey)){ this._skipSet.delete(oldKey); this._skipSet.add(newKey); this._saveSkipArray(); }

    this._emit?.();
    return true;
  }
}
