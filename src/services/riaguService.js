// src/services/riaguService.js
import { BaseService, loadLocalJSON, saveLocalJSON, json } from './core/base.js';

export class RiaguService extends BaseService {
  constructor(key='gacha_riagu_meta_v1'){ 
    super(); 
    this.key = key; 
    this.meta = {}; 
  }

  load(){ this.meta = loadLocalJSON(this.key, {}) || {}; this._emit(); return true; }
  save(){ saveLocalJSON(this.key, this.meta); }
  get(){ return this.meta; }
  set(v){ this.meta = json.clone(v); this.save(); this._emit(); }
  patch(mut){ const m = json.clone(this.meta); mut(m); this.set(m); }
  // === 追記: 便宜関数群 ===
  // key生成
  keyOf(gacha, rarity, code){ return `${gacha}::${rarity}::${code}`; }

  // メタ取得/設定（1キー）
  getMeta(k){ return (this.meta || {})[k] || null; }
  setMeta(k, meta){ this.meta = { ...(this.meta||{}), [k]: { ...meta } }; this.save(); this._emit(); }

  // 一括キー一覧（リアグの実体は skipSet を採用）
  listKeys(){
    if (!this._skipSet) {
      // 既存の skipSet を内部管理（localStorage: gacha_item_image_skip_v1）
      const arr = this._loadSkipArray();
      this._skipSet = new Set(arr);
    }
    return new Set(this._skipSet);
  }

  // 旧skipSet互換: 追加/削除
  addKey(k){
    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray());
    if (!this._skipSet.has(k)) { this._skipSet.add(k); this._saveSkipArray(); this._emit(); }
  }
  delKey(k){
    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray());
    if (this._skipSet.delete(k)) { this._saveSkipArray(); this._emit(); }
  }

  // リアグ化（画像解除はUI側で実施 or 画像サービスに委譲）
  async mark(item, meta){
    const k = typeof item === 'string' ? item : this.keyOf(item.gacha, item.rarity, item.code);
    this.setMeta(k, meta || {});
    this.addKey(k);
  }

  // リアグ解除（メタ削除 + キー解除）
  unmark(item){
    const k = typeof item === 'string' ? item : this.keyOf(item.gacha, item.rarity, item.code);
    const next = { ...(this.meta||{}) }; delete next[k];
    this.meta = next; this.save();
    this.delKey(k);
    this._emit();
  }

  // AppStateを使った勝者集計（UIの単純化用）
  winnersForKey(k, appState){
    const [gacha, rarity, code] = k.split('::');
    const winners = []; let total = 0;

    const counts = (appState?.getCounts && appState.getCounts()) || {};
    const data   = (appState?.getData && appState.getData()) || {};
    const hasCounts = counts && Object.keys(counts).length > 0;

    if (hasCounts) {
      for (const [user, gobj] of Object.entries(counts)) {
        const n = ((((gobj || {})[gacha] || {})[rarity] || {})[code] || 0) | 0;
        if (n > 0) { winners.push({ user, count: n }); total += n; }
      }
    }
    for (const [user, uobj] of Object.entries(data || {})) {
      const have = ((((uobj || {})[gacha] || {}).items || {})[rarity] || []).includes(code);
      if (!have) continue;
      if (winners.some(w => w.user === user)) continue;
      const n = ((((counts || {})[user] || {})[gacha] || {})[rarity] || {})[code] | 0;
      const cnt = n > 0 ? n : 1;
      winners.push({ user, count: cnt }); total += cnt;
    }
    return { winners, total };
  }

  // 内部: skip配列のload/save（localStorage）
  _loadSkipArray(){
    try{ return JSON.parse(localStorage.getItem('gacha_item_image_skip_v1')||'[]') || []; }catch{ return []; }
  }
  _saveSkipArray(){
    try{
      const arr = Array.from(this._skipSet||[]);
      localStorage.setItem('gacha_item_image_skip_v1', JSON.stringify(arr));
    }catch{}
  }
  // リアグ関連キーのリネーム（meta + skipSet）
  renameKey(oldKey, newKey){
    if (!oldKey || !newKey || oldKey === newKey) return false;

    // メタ移行
    this.patch(m=>{
      if (m && (oldKey in m)){
        m[newKey] = typeof structuredClone === "function" ? structuredClone(m[oldKey]) : JSON.parse(JSON.stringify(m[oldKey]));
        delete m[oldKey];
      }
    });

    // skipSet も更新
    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray?.() || []);
    if (this._skipSet?.has(oldKey)){
      this._skipSet.delete(oldKey);
      this._skipSet.add(newKey);
      this._saveSkipArray?.();
    }

    this._emit?.();
    return true;
  }
  pruneByCatalog(catalogs){
    const valid = new Set();
    for (const [gacha, cat] of Object.entries(catalogs || {})) {
      const items = cat?.items || {};
      for (const [rarity, codes] of Object.entries(items)) {
        for (const code of (codes || [])) {
          valid.add(`${gacha}::${rarity}::${code}`);
        }
      }
    }

    let touched = false;

    // meta
    this.patch(meta=>{
      for (const k of Object.keys(meta || {})) {
        if (!valid.has(k)) { delete meta[k]; touched = true; }
      }
    });

    // skip
    if (!this._skipSet) this._skipSet = new Set(this._loadSkipArray?.() || []);
    const next = new Set();
    for (const v of this._skipSet) {
      if (typeof v === 'string' && v.split('::').length >= 3) {
        if (valid.has(v)) next.add(v);
      } else {
        next.add(v); // ガチャ単位などは維持
      }
    }
    if (next.size !== this._skipSet.size) {
      this._skipSet = next; this._saveSkipArray?.(); touched = true;
    }

    if (touched) this._emit?.();
    return touched;
  }
}
