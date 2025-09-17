// src/services/rarityService.js
import { BaseService, loadLocalJSON, saveLocalJSON } from './core/base.js';

export class RarityService extends BaseService {
  constructor(key = 'gacha_rarity_config_v1') {
    super();
    this.key = key;
    // 例: { "やみぃガチャ::UR": { color:"#ffd700", rarityNum:5, emitRate:null } }
    this.flat = {};
  }

  // -------------------- storage --------------------
  load() {
    this.flat = loadLocalJSON(this.key, {}) || {};
    this._emit(); // UI 初期描画のために通知（従来仕様を維持）
    return true;
  }
  save() { saveLocalJSON(this.key, this.flat); }

  // -------------------- keys & helpers --------------------
  _k(gacha, rarity) { return `${gacha}::${rarity}`; }

  // 変更があった時だけ save + emit
  _commit(touched) {
    if (touched) { this.save(); this._emit(); }
  }

  // 指定ガチャの [key, value] を列挙
  _entriesOf(gacha) {
    const pre = `${gacha}::`;
    return Object.entries(this.flat).filter(([k]) => k.startsWith(pre));
  }

  // 指定ガチャの全キーを削除
  _deleteByPrefix(gacha) {
    let touched = false;
    for (const [k] of this._entriesOf(gacha)) {
      delete this.flat[k];
      touched = true;
    }
    this._commit(touched);
    return touched;
  }

  // -------------------- read --------------------
  listForGacha(gacha) {
    const preLen = `${gacha}::`.length;
    return this._entriesOf(gacha).map(([k, v]) => ({ rarity: k.slice(preLen), ...v }));
  }

  getMeta(gacha, rarity) {
    return this.flat[this._k(gacha, rarity)] || null; // 参照返し（UI側で in-place 更新したい場合あり）
  }

  listGachas() {
    const s = new Set();
    for (const k of Object.keys(this.flat)) {
      const i = k.indexOf('::');
      if (i > 0) s.add(k.slice(0, i));
    }
    return Array.from(s);
  }

  listRarities(gacha) {
    const preLen = `${gacha}::`.length;
    return this._entriesOf(gacha).map(([k]) => k.slice(preLen));
  }

  hasGacha(gacha) {
    return this.listRarities(gacha).length > 0;
  }

  hasRarity(gacha, rarity) {
    return Object.prototype.hasOwnProperty.call(this.flat, this._k(gacha, rarity));
  }

  getGacha(gacha) {
    const out = {};
    const preLen = `${gacha}::`.length;
    for (const [k, v] of this._entriesOf(gacha)) out[k.slice(preLen)] = v;
    return out;
  }

  // -------------------- write (single) --------------------
  upsert(gacha, rarity, meta) {
    this.flat[this._k(gacha, rarity)] = { ...meta };
    this._commit(true);
  }

  deleteRarity(gacha, rarity) {
    const k = this._k(gacha, rarity);
    const touched = !!this.flat[k];
    if (touched) delete this.flat[k];
    this._commit(touched);
  }

  // -------------------- write (bulk) --------------------
  /**
   * ガチャ1つ分をまとめて設定
   * @param {string} gacha
   * @param {Object} data  { rarity: meta, ... }
   * @param {Object} opt   { clear=false }
   */
  setGacha(gacha, data, { clear = false } = {}) {
    if (clear) this._deleteByPrefix(gacha);
    let touched = false;
    for (const [rarity, meta] of Object.entries(data || {})) {
      this.flat[this._k(gacha, rarity)] = meta;
      touched = true;
    }
    this._commit(touched);
  }

  /**
   * 一括アップサート（object or entries）
   */
  upsertMany(gacha, entries) {
    const obj = Array.isArray(entries) ? Object.fromEntries(entries) : (entries || {});
    this.setGacha(gacha, obj, { clear: false });
  }

  /**
   * emitRate だけを一括更新（色や強さは維持）
   */
  setEmitRates(gacha, rates = {}) {
    let touched = false;
    for (const [r, rate] of Object.entries(rates)) {
      const k = this._k(gacha, r);
      const meta = this.flat[k];
      if (!meta) continue;
      if ((meta.emitRate ?? null) !== rate) {
        this.flat[k] = { ...meta, emitRate: rate };
        touched = true;
      }
    }
    this._commit(touched);
  }

  /**
   * 指定レアリティ群の削除
   */
  deleteRarities(gacha, rarities = []) {
    let touched = false;
    for (const r of rarities) {
      const k = this._k(gacha, r);
      if (this.flat[k]) { delete this.flat[k]; touched = true; }
    }
    this._commit(touched);
  }

  deleteGacha(gacha) {
    this._deleteByPrefix(gacha);
  }

  // -------------------- rename / copy --------------------
  renameGacha(from, to) {
    if (from === to) return;
    const preLen = `${from}::`.length;
    let touched = false;
    const add = {};
    for (const [k, v] of this._entriesOf(from)) {
      add[`${to}::${k.slice(preLen)}`] = v;
      delete this.flat[k];
      touched = true;
    }
    if (touched) Object.assign(this.flat, add);
    this._commit(touched);
  }

  /**
   * レアリティ名の改名（同名がある場合は override 指定で上書き）
   */
  renameRarity(gacha, from, to, { override = false } = {}) {
    if (from === to) return true;
    const kFrom = this._k(gacha, from);
    const kTo   = this._k(gacha, to);
    const src = this.flat[kFrom];
    if (!src) return false;
    if (this.flat[kTo] && !override) return false;

    this.flat[kTo] = src;
    delete this.flat[kFrom];
    this._commit(true);
    return true;
  }

  /**
   * ガチャのコピー（新名称へ複製）
   * @param {Object} opt { override=false, mapRarity=(r)=>r }
   */
  copyGacha(from, to, { override = false, mapRarity } = {}) {
    if (from === to) return true;
    const preLen = `${from}::`.length;
    const renamer = typeof mapRarity === 'function' ? mapRarity : (r) => r;

    // 衝突チェック
    if (!override) {
      for (const [k] of this._entriesOf(from)) {
        const r = k.slice(preLen);
        if (this.flat.hasOwnProperty(this._k(to, renamer(r)))) return false;
      }
    }

    let touched = false;
    for (const [k, v] of this._entriesOf(from)) {
      const r = k.slice(preLen);
      this.flat[this._k(to, renamer(r))] = v;
      touched = true;
    }
    this._commit(touched);
    return true;
  }

  // -------------------- import / export / migrate --------------------
  /**
   * ネスト形式 → フラットへ取り込み
   * @param {Object} nested { gacha: { rarity: meta, ... }, ... }
   * @param {Object} opt { clear=false, only?: string[] }
   */
  migrateFromNested(nested = {}, { clear = false, only = null } = {}) {
    if (clear) this.flat = {};
    const limit = Array.isArray(only) ? new Set(only) : null;

    let touched = false;
    for (const [gacha, table] of Object.entries(nested)) {
      if (limit && !limit.has(gacha)) continue;
      for (const [rarity, meta] of Object.entries(table || {})) {
        this.flat[this._k(gacha, rarity)] = meta;
        touched = true;
      }
    }
    this._commit(touched);
  }

  /**
   * フラット保持分をネスト形式へダンプ
   * @returns {Object} { gacha: { rarity: meta, ... }, ... }
   */
  exportNested({ only = null } = {}) {
    const limit = Array.isArray(only) ? new Set(only) : null;
    const out = {};
    for (const [k, v] of Object.entries(this.flat)) {
      const i = k.indexOf('::'); if (i <= 0) continue;
      const g = k.slice(0, i), r = k.slice(i + 2);
      if (limit && !limit.has(g)) continue;
      (out[g] ||= {})[r] = v;
    }
    return out;
  }

  /**
   * 既定値を充填（存在しないレアリティのみ追加）
   */
  ensureDefaultsForGacha(gacha, defaults = {}) {
    let touched = false;
    for (const [r, meta] of Object.entries(defaults)) {
      const k = this._k(gacha, r);
      if (!this.flat[k]) { this.flat[k] = meta; touched = true; }
    }
    this._commit(touched);
  }
}
