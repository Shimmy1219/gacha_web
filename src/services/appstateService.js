// src/services/appStateService.js (v2)
import { BaseService, loadLocalJSON, saveLocalJSON, json, debounce } from './core/base.js';

const LS_KEY_DEFAULT = 'gacha_app_state_v2';
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`);

export class AppStateService extends BaseService {
  constructor(key = LS_KEY_DEFAULT) {
    super();
    this.key = key;
    this.state = { meta:{}, data:{}, catalogs:{}, counts:{}, selected:null };
    this.saveDebounced = debounce(()=>this.save(), 120);
  }

  // ---------------- storage ----------------
  load() {
    const v = loadLocalJSON(this.key, null);
    if (v) {
      // 後方互換不要だが、最低限の形を保証
      this.state = { meta:{}, data:{}, catalogs:{}, counts:{}, selected:null, ...v };
    }
    this._emit();
    return !!v;
  }
  save() { saveLocalJSON(this.key, this.state); }

  get() { return this.state; }
  set(next) { this.state = json.clone(next); this.saveDebounced(); this._emit(); }
  patch(mut) { const s = json.clone(this.state); mut(s); this.set(s); }

  // ---------------- meta (ID/表示名) ----------------
  /** 新規ガチャ（ID発行・空カタログ作成） */
  createGacha(displayName) {
    const id = newId();
    const now = Date.now();
    this.patch(s=>{
      (s.meta ||= {}); (s.catalogs ||= {});
      s.meta[id] = { displayName: String(displayName || '無題ガチャ'), createdAt: now };
      s.catalogs[id] = { pulls:0, items:{} };
      if (!s.selected) s.selected = id;
    });
    return id;
  }

  /** 既存IDの空器を確保する（外部でIDを決めてから使いたいケース） */
  ensureGachaById(gachaId, displayName = null) {
    if (!gachaId) return false;
    this.patch(s=>{
      (s.meta ||= {}); (s.catalogs ||= {});
      if (!s.meta[gachaId]) {
        s.meta[gachaId] = { displayName: displayName || '無題ガチャ', createdAt: Date.now() };
      } else if (displayName && s.meta[gachaId].displayName !== displayName) {
        // displayName を指定されたら更新（可変）
        s.meta[gachaId].displayName = displayName;
      }
      if (!s.catalogs[gachaId]) s.catalogs[gachaId] = { pulls:0, items:{} };
      if (!s.selected) s.selected = gachaId;
    });
    return true;
  }

  /** 表示名の更新（IDは不変） */
  renameGachaDisplayName(gachaId, nextName) {
    if (!gachaId) return false;
    this.patch(s=>{
      if (s.meta?.[gachaId]) s.meta[gachaId].displayName = String(nextName ?? '');
    });
    return true;
  }

  /** ガチャの削除（関連する data/counts も削除） */
  deleteGacha(gachaId) {
    if (!gachaId) return false;
    this.patch(s=>{
      if (s.meta) delete s.meta[gachaId];
      if (s.catalogs) delete s.catalogs[gachaId];
      // data / counts の各ユーザーからも除去
      if (s.data) for (const u of Object.keys(s.data)) delete (s.data[u]||{})[gachaId];
      if (s.counts) for (const u of Object.keys(s.counts)) delete (s.counts[u]||{})[gachaId];
      if (s.selected === gachaId) {
        const ids = Object.keys(s.catalogs || {});
        s.selected = ids[0] || null;
      }
    });
    return true;
  }

  // ---------------- selections ----------------
  selectGacha(gachaId) { this.patch(s => { s.selected = gachaId ?? null; }); }
  getSelectedGacha(){ return this.state?.selected ?? null; }

  // ---------------- getters (thin) ----------------
  getMeta(){ return (this.state && this.state.meta) || {}; }
  getDisplayName(gachaId){ return this.state?.meta?.[gachaId]?.displayName ?? ''; }
  getData(){ return (this.state && this.state.data) || {}; }
  getCounts(){ return (this.state && this.state.counts) || {}; }
  getCatalog(gachaId){ return this.state?.catalogs?.[gachaId] || null; }
  listGachas({ sort=true } = {}) {
    const ids = Object.keys(this.state?.catalogs || {});
    if (!sort) return ids;
    // 画面上は表示名順が自然
    ids.sort((a,b)=>{
      const na = this.getDisplayName(a), nb = this.getDisplayName(b);
      const t = String(na).localeCompare(String(nb), 'ja');
      return t !== 0 ? t : a.localeCompare(b,'ja');
    });
    return ids;
  }

  // ---------------- catalog/data/counts ops ----------------
  /** アイテムコード名変更（同 rarity 内） */
  renameItemCode(gachaId, rarity, oldCode, newCode){
    if (!gachaId || !rarity || !oldCode || !newCode || oldCode === newCode) return false;

    this.patch(s=>{
      // catalogs
      const cg = (s.catalogs[gachaId] ||= { pulls:0, items:{} });
      const arr = (cg.items[rarity] ||= []);
      for (let i=0;i<arr.length;i++) if (arr[i] === oldCode) arr[i] = newCode;
      cg.items[rarity] = Array.from(new Set(cg.items[rarity]));

      // data
      for (const user of Object.keys(s.data ||= {})) {
        const dG = (s.data[user] ||= {})[gachaId];
        if (!dG) continue;
        const got = (dG.items ||= {})[rarity];
        if (Array.isArray(got)) {
          let touched = false;
          for (let i=0;i<got.length;i++){
            if (got[i] === oldCode){ got[i] = newCode; touched = true; }
          }
          if (touched) dG.items[rarity] = Array.from(new Set(got));
        }
      }

      // counts
      for (const user of Object.keys(s.counts ||= {})) {
        const bag = (((s.counts[user] ||= {})[gachaId] ||= {})[rarity] ||= {});
        if (Object.prototype.hasOwnProperty.call(bag, oldCode)) {
          bag[newCode] = (bag[newCode] || 0) + (bag[oldCode] || 0);
          delete bag[oldCode];
        }
      }
    });
    return true;
  }

  /** レアリティ移動（from -> to） */
  moveItemRarity(gachaId, fromRarity, code, toRarity){
    if (!gachaId || !fromRarity || !toRarity || !code || fromRarity === toRarity) return false;

    this.patch(s=>{
      // catalogs
      const cg = (s.catalogs[gachaId] ||= { pulls:0, items:{} });
      const from = (cg.items[fromRarity] ||= []);
      const to   = (cg.items[toRarity]   ||= []);
      for (let i=from.length-1;i>=0;i--) if (from[i] === code) from.splice(i,1);
      if (!to.includes(code)) to.push(code);

      // data
      for (const user of Object.keys(s.data ||= {})) {
        const dG = (s.data[user] ||= {})[gachaId];
        if (!dG) continue;
        const gotFrom = (dG.items ||= {})[fromRarity] ||= [];
        const gotTo   = (dG.items ||= {})[toRarity]   ||= [];
        let moved = false;
        for (let i=gotFrom.length-1;i>=0;i--) if (gotFrom[i] === code){ gotFrom.splice(i,1); moved = true; }
        if (moved && !gotTo.includes(code)) gotTo.push(code);
      }

      // counts
      for (const user of Object.keys(s.counts ||= {})) {
        const byG = ((s.counts[user] ||= {})[gachaId] ||= {});
        const cf  = (byG[fromRarity] ||= {});
        const ct  = (byG[toRarity]   ||= {});
        if (Object.prototype.hasOwnProperty.call(cf, code)) {
          ct[code] = (ct[code] || 0) + (cf[code] || 0);
          delete cf[code];
        }
      }
    });
    return true;
  }

  /** 一明細追記（ユーザー/ガチャ/レア/コード/N） */
  upsertHit(user, gachaId, rarity, code, n = 1) {
    if (!user || !gachaId || !rarity || !code) return false;
    this.patch(s=>{
      // catalog
      const cg = (s.catalogs[gachaId] ||= { pulls:0, items:{} });
      const arr = (cg.items[rarity] ||= []);
      if (!arr.includes(code)) arr.push(code);

      // data
      const dg = ((s.data[user] ||= {})[gachaId] ||= { pulls: 0, items: {} });
      dg.pulls += n;
      const dl = (dg.items[rarity] ||= []);
      for (let i=0;i<n;i++) dl.push(code);

      // counts
      const cnt = (((s.counts[user] ||= {})[gachaId] ||= {})[rarity] ||= {});
      cnt[code] = (cnt[code] || 0) + n;

      if (!s.selected) s.selected = gachaId;
    });
    return true;
  }

  /** rarity の基準順を返却（RarityService の rarityNum を優先） */
  _rarityOrderFor(gachaId, { rarityService=null, baseOrder=[] } = {}){
    const names = new Set();

    if (Array.isArray(rarityService?.listRarities?.(gachaId))) {
      for (const r of rarityService.listRarities(gachaId)) names.add(r);
    }
    if (Array.isArray(baseOrder)) for (const r of baseOrder) names.add(r);

    const cat = this.getCatalog(gachaId);
    if (cat?.items && typeof cat.items === 'object') {
      for (const r of Object.keys(cat.items)) names.add(r);
    }

    const sorted = [...names].sort((a, b) => {
      const ma = rarityService?.getMeta?.(gachaId, a) || {};
      const mb = rarityService?.getMeta?.(gachaId, b) || {};
      const na = Number.isFinite(ma.rarityNum) ? ma.rarityNum : -1;
      const nb = Number.isFinite(mb.rarityNum) ? mb.rarityNum : -1;

      if (na !== nb) return nb - na; // 強いほど先
      const ia = Array.isArray(baseOrder) ? baseOrder.indexOf(a) : -1;
      const ib = Array.isArray(baseOrder) ? baseOrder.indexOf(b) : -1;
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return String(a).localeCompare(String(b), 'ja');
    });

    const idx = new Map(sorted.map((r, i) => [r, i]));
    return { order: sorted, indexOf: (r) => (idx.has(r) ? idx.get(r) : (sorted.length + 999)) };
  }

  _ensureArray(v){
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v);
    return v ? [String(v)] : [];
  }

  /** catalog から一覧を構築（data には依存しない） */
  listItemsFromCatalog(gachaId, { rarityService=null, baseOrder=[] } = {}){
    const cat = this.getCatalog(gachaId);
    if (!cat || !cat.items) return [];
    const { indexOf } = this._rarityOrderFor(gachaId, { rarityService, baseOrder });

    const out = [];
    for (const [rarity, raw] of Object.entries(cat.items)){
      const arr = this._ensureArray(raw);
      for (const code of arr){
        out.push({ gachaId, rarity, code });
      }
    }
    out.sort((a,b)=>{
      const ra = indexOf(a.rarity), rb = indexOf(b.rarity);
      if (ra !== rb) return ra - rb;
      return String(a.code).localeCompare(String(b.code), 'ja');
    });
    return out;
  }
}
