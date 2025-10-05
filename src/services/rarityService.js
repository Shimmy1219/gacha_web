// src/services/rarityService.js (v2)
import { BaseService, loadLocalJSON, saveLocalJSON } from './core/base.js';

const LS_KEY_DEFAULT = 'gacha_rarity_config_v2';
// flat 例: { "GA_xxx::UR": { color:"#ffd700", rarityNum:5, emitRate:null }, ... }

export class RarityService extends BaseService {
  constructor(key = LS_KEY_DEFAULT) {
    super();
    this.key = key;
    this.flat = {};
  }

  // ---------- storage ----------
  load() { this.flat = loadLocalJSON(this.key, {}) || {}; this._emit(); return true; }
  save() { saveLocalJSON(this.key, this.flat); }
  _commit(t){ if (t){ this.save(); this._emit(); } }

  // ---------- helpers ----------
  _k(gachaId, rarity){ return `${gachaId}::${rarity}`; }
  _entriesOf(gachaId){ const pre = `${gachaId}::`; return Object.entries(this.flat).filter(([k])=>k.startsWith(pre)); }

  // ---------- read ----------
  listForGacha(gachaId){
    const preLen = `${gachaId}::`.length;
    return this._entriesOf(gachaId).map(([k,v]) => ({ rarity: k.slice(preLen), ...v }));
  }
  getMeta(gachaId, rarity){ return this.flat[this._k(gachaId, rarity)] || null; }
  listGachas(){
    const s = new Set();
    for (const k of Object.keys(this.flat)) {
      const i = k.indexOf('::'); if (i>0) s.add(k.slice(0, i));
    }
    return Array.from(s);
  }
  listRarities(gachaId){
    const preLen = `${gachaId}::`.length;
    return this._entriesOf(gachaId).map(([k]) => k.slice(preLen));
  }
  hasGacha(gachaId){ return this.listRarities(gachaId).length > 0; }
  hasRarity(gachaId, rarity){ return Object.prototype.hasOwnProperty.call(this.flat, this._k(gachaId, rarity)); }
  getGacha(gachaId){
    const out = {}; const preLen = `${gachaId}::`.length;
    for (const [k,v] of this._entriesOf(gachaId)) out[k.slice(preLen)] = v;
    return out;
  }

  // ---------- write (single) ----------
  upsert(gachaId, rarity, meta){ this.flat[this._k(gachaId, rarity)] = { ...meta }; this._commit(true); }
  deleteRarity(gachaId, rarity){
    const k = this._k(gachaId, rarity); const touched = !!this.flat[k];
    if (touched) delete this.flat[k]; this._commit(touched);
  }

  // ---------- write (bulk) ----------
  setGacha(gachaId, data, { clear=false } = {}){
    if (clear){ for (const [k] of this._entriesOf(gachaId)) delete this.flat[k]; }
    let touched=false;
    for (const [rarity, meta] of Object.entries(data || {})){
      this.flat[this._k(gachaId, rarity)] = meta; touched = true;
    }
    this._commit(touched);
  }
  upsertMany(gachaId, entries){
    const obj = Array.isArray(entries) ? Object.fromEntries(entries) : (entries || {});
    this.setGacha(gachaId, obj, { clear:false });
  }
  setEmitRates(gachaId, rates = {}){
    let touched = false;
    for (const [r, rate] of Object.entries(rates)) {
      const k = this._k(gachaId, r), meta = this.flat[k];
      if (!meta) continue;
      if ((meta.emitRate ?? null) !== rate) { this.flat[k] = { ...meta, emitRate: rate }; touched = true; }
    }
    this._commit(touched);
  }
  deleteRarities(gachaId, rarities = []){
    let touched = false;
    for (const r of rarities){ const k = this._k(gachaId, r); if (this.flat[k]){ delete this.flat[k]; touched = true; } }
    this._commit(touched);
  }
  deleteGacha(gachaId){
    let touched = false;
    for (const [k] of this._entriesOf(gachaId)){ delete this.flat[k]; touched = true; }
    this._commit(touched);
  }

  // ---------- rename/copy ----------
  renameRarity(gachaId, from, to, { override=false } = {}){
    if (from === to) return true;
    const kFrom = this._k(gachaId, from), kTo = this._k(gachaId, to);
    const src = this.flat[kFrom]; if (!src) return false;
    if (this.flat[kTo] && !override) return false;
    this.flat[kTo] = src; delete this.flat[kFrom]; this._commit(true); return true;
  }
  copyGacha(fromId, toId, { override=false, mapRarity } = {}){
    if (fromId === toId) return true;
    const preLen = `${fromId}::`.length;
    const renamer = typeof mapRarity === 'function' ? mapRarity : (r)=>r;

    if (!override){
      for (const [k] of this._entriesOf(fromId)){
        const r = k.slice(preLen);
        if (this.flat.hasOwnProperty(this._k(toId, renamer(r)))) return false;
      }
    }
    let touched=false;
    for (const [k,v] of this._entriesOf(fromId)){
      const r = k.slice(preLen);
      this.flat[this._k(toId, renamer(r))] = v; touched = true;
    }
    this._commit(touched); return true;
  }

  // ---------- import/export ----------
  migrateFromNested(nested = {}, { clear=false, only=null } = {}){
    // v2では gachaId 前提。nested のキーは gachaId を想定。
    if (clear) this.flat = {};
    const limit = Array.isArray(only) ? new Set(only) : null;
    let touched=false;
    for (const [gachaId, table] of Object.entries(nested)){
      if (limit && !limit.has(gachaId)) continue;
      for (const [rarity, meta] of Object.entries(table || {})){
        this.flat[this._k(gachaId, rarity)] = meta; touched = true;
      }
    }
    this._commit(touched);
  }
  exportNested({ only=null } = {}){
    const limit = Array.isArray(only) ? new Set(only) : null;
    const out = {};
    for (const [k,v] of Object.entries(this.flat)){
      const i = k.indexOf('::'); if (i<=0) continue;
      const id = k.slice(0,i), r = k.slice(i+2);
      if (limit && !limit.has(id)) continue;
      (out[id] ||= {})[r] = v;
    }
    return out;
  }
  ensureDefaultsForGacha(gachaId, defaults = {}){
    let touched=false;
    for (const [r, meta] of Object.entries(defaults)){
      const k = this._k(gachaId, r);
      if (!this.flat[k]){ this.flat[k] = meta; touched = true; }
    }
    this._commit(touched);
  }
}
