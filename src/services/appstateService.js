// src/services/appStateService.js
import { BaseService, loadLocalJSON, saveLocalJSON, json, debounce } from './core/base.js';

export class AppStateService extends BaseService {
  constructor(key) {
    super();
    this.key = key;
    this.state = { data:{}, catalogs:{}, counts:{}, selected:null };
    this.saveDebounced = debounce(()=>this.save(), 150);
  }
  load() {
    const v = loadLocalJSON(this.key, null);
    if (v) this.state = { data:{}, catalogs:{}, counts:{}, selected:null, ...v };
    this._emit();
    return !!v;
  }
  save() { saveLocalJSON(this.key, this.state); }
  get() { return this.state; }
  set(next) { this.state = json.clone(next); this.saveDebounced(); this._emit(); }
  patch(mutator) { const s=json.clone(this.state); mutator(s); this.set(s); }
  selectGacha(name) { this.patch(s => { s.selected = name ?? null; }); }
  // === 追記: 薄いゲッター ===
  getData(){ return (this.state && this.state.data) || {}; }
  getCounts(){ return (this.state && this.state.counts) || {}; }
  // アイテム名（code）を変更：同 rarity 内で oldCode -> newCode を反映
  renameItemCode(gacha, rarity, oldCode, newCode){
    if (!gacha || !rarity || !oldCode || !newCode || oldCode === newCode) return false;

    this.patch(s=>{
      // ---- catalogs ----
      (s.catalogs ||= {});
      const cg = (s.catalogs[gacha] ||= { pulls:0, items:{} });
      (cg.items ||= {});
      const arr = (cg.items[rarity] ||= []);
      // 置換（複数個所持している可能性もあるため全置換→ユニーク化）
      for (let i=0;i<arr.length;i++){
        if (arr[i] === oldCode) arr[i] = newCode;
      }
      cg.items[rarity] = Array.from(new Set(cg.items[rarity]));

      // ---- data（ユーザーごとの獲得内訳）----
      (s.data ||= {});
      console.log(s.data);
      for (const user of Object.keys(s.data)){
        console.log('renameItemName', user);
        const gmap = (s.data[user] ||= {});
          console.log('gmap', gmap);
        const dG   = gmap[gacha];
          console.log('dG', dG);
        if (!dG) continue;
        (dG.items ||= {});
        console.log('dG.items', dG.items);
        const got = dG.items[rarity];
        console.log('got', got);
        if (Array.isArray(got)){
          console.log('renaming', oldCode, '->', newCode);
          let touched = false;
          for (let i=0;i<got.length;i++){
            if (got[i] === oldCode){ 
              console.log('got[i]', got[i], '->', newCode);
              got[i] = newCode; touched = true; }
          }
          if (touched){
            dG.items[rarity] = Array.from(new Set(got)); // ユニーク化
            console.log('after rename', dG.items[rarity]);
          }
        }
      }

      // ---- counts ----
      (s.counts ||= {});
      for (const user of Object.keys(s.counts)){
        const gmap = (s.counts[user] ||= {});
        const byG  = gmap[gacha];
        if (!byG) continue;
        const bag  = (byG[rarity] ||= {});
        if (Object.prototype.hasOwnProperty.call(bag, oldCode)){
          bag[newCode] = (bag[newCode] || 0) + (bag[oldCode] || 0);
          delete bag[oldCode];
        }
      }
    });

    this._emit?.();
    this.saveDebounced?.();
    return true;
  }

  // レアリティ移動：fromRarity -> toRarity へ code を移す
  moveItemRarity(gacha, fromRarity, code, toRarity){
    if (!gacha || !fromRarity || !toRarity || !code || fromRarity === toRarity) return false;

    this.patch(s=>{
      // ---- catalogs ----
      (s.catalogs ||= {});
      const cg   = (s.catalogs[gacha] ||= { pulls:0, items:{} });
      (cg.items  ||= {});
      const from = (cg.items[fromRarity] ||= []);
      const to   = (cg.items[toRarity]   ||= []);
      // from から全削除（重複があり得るため全部落とす）
      for (let i=from.length-1;i>=0;i--){
        if (from[i] === code) from.splice(i,1);
      }
      if (!to.includes(code)) to.push(code);

      // ---- data（ユーザーごとの獲得内訳）----
      (s.data ||= {});
      for (const user of Object.keys(s.data)){
        console.log('renameItemRarity', user);
        const gmap = (s.data[user] ||= {});
        const dG   = gmap[gacha];
        if (!dG) continue;
        (dG.items ||= {});
        const gotFrom = (dG.items[fromRarity] ||= []);
        const gotTo   = (dG.items[toRarity]   ||= []);
        // from から全削除 → to に一度だけ追加
        let moved = false;
        for (let i=gotFrom.length-1;i>=0;i--){
          if (gotFrom[i] === code){ gotFrom.splice(i,1); moved = true; }
        }
        if (moved && !gotTo.includes(code)) gotTo.push(code);
      }

      // ---- counts ----
      (s.counts ||= {});
      for (const user of Object.keys(s.counts)){
        const gmap = (s.counts[user] ||= {});
        const byG  = (gmap[gacha]    ||= {});
        const cf   = (byG[fromRarity] ||= {});
        const ct   = (byG[toRarity]   ||= {});
        if (Object.prototype.hasOwnProperty.call(cf, code)){
          ct[code] = (ct[code] || 0) + (cf[code] || 0);
          delete cf[code];
        }
      }
    });

    this._emit?.();
    this.saveDebounced?.();
    return true;
  }
  // 追記: マージ系ユーティリティ（AppStateService クラスのメソッドとして）
  mergeAll(payload = {}, { setSelectedIfEmpty = true } = {}) {
    const { data = {}, catalogs = {}, counts = {}, selected = null } = payload;
    this.patch(s => {
      // --- data: pullsは加算、itemsはユニーク統合 ---
      s.data ||= {};
      for (const [user, gmap] of Object.entries(data)) {
        const sd = (s.data[user] ||= {});
        for (const [gacha, info] of Object.entries(gmap || {})) {
          const tgt = (sd[gacha] ||= { pulls: 0, items: {} });
          tgt.pulls = (tgt.pulls || 0) + (+info?.pulls || 0);
          const items = info?.items || {};
          for (const [rarity, codes] of Object.entries(items)) {
            const arr = (tgt.items[rarity] ||= []);
            for (const c of (codes || [])) if (c && !arr.includes(c)) arr.push(c);
            arr.sort((a,b)=>a.localeCompare(b,'ja'));
          }
        }
      }

      // --- catalogs: pullsは加算、コードはユニーク統合 ---
      s.catalogs ||= {};
      for (const [gacha, cg] of Object.entries(catalogs)) {
        const tgt = (s.catalogs[gacha] ||= { pulls: 0, items: {} });
        tgt.pulls = (tgt.pulls || 0) + (+cg?.pulls || 0);
        const items = cg?.items || {};
        for (const [rarity, codes] of Object.entries(items)) {
          const arr = (tgt.items[rarity] ||= []);
          for (const c of (codes || [])) if (c && !arr.includes(c)) arr.push(c);
          arr.sort((a,b)=>a.localeCompare(b,'ja'));
        }
      }

      // --- counts: ユーザー×ガチャ×レア×コードの出現回数を加算 ---
      s.counts ||= {};
      for (const [user, gmap] of Object.entries(counts)) {
        const su = (s.counts[user] ||= {});
        for (const [gacha, rmap] of Object.entries(gmap || {})) {
          const sg = (su[gacha] ||= {});
          for (const [rarity, cmap] of Object.entries(rmap || {})) {
            const sr = (sg[rarity] ||= {});
            for (const [code, n] of Object.entries(cmap || {})) {
              sr[code] = (sr[code] || 0) + (+n || 0);
            }
          }
        }
      }

      // --- selected: 取り込み側が指定していれば尊重。無ければ初回のみ自動選択 ---
      if (selected) {
        s.selected = selected;
      } else if (setSelectedIfEmpty && !s.selected) {
        const names = new Set();
        Object.values(s.data).forEach(gm=>Object.keys(gm||{}).forEach(n=>names.add(n)));
        Object.keys(s.catalogs||{}).forEach(n=>names.add(n));
        const arr=[...names]; arr.sort((a,b)=>a.localeCompare(b,'ja'));
        s.selected = arr[0] || null;
      }
    });
    return true;
  }

  // 追記: ガチャを“空で”新規追加（最小骨格だけ作る）
  ensureGacha(gachaName) {
    if (!gachaName) return false;
    this.patch(s=>{
      s.catalogs ||= {};
      s.data ||= {};
      // catalogs 側に空の器
      if (!s.catalogs[gachaName]) s.catalogs[gachaName] = { pulls: 0, items: {} };
      // data 側はユーザー次第なのでここでは作らない（必要に応じて upsertHit を使う）
    });
    return true;
  }

  // 追記: 1ヒット単位の追記（ユーザー/ガチャ/レア/コード/N回）
  upsertHit(user, gacha, rarity, code, n = 1) {
    if (!user || !gacha || !rarity || !code) return false;
    this.patch(s=>{
      // catalogs：コードのユニーク集合
      (s.catalogs ||= {});
      const cg = (s.catalogs[gacha] ||= { pulls: 0, items: {} });
      const arr = (cg.items[rarity] ||= []);
      if (!arr.includes(code)) arr.push(code);

      // data：ユーザーの獲得内訳（itemsはリスト＝1明細1件の履歴表現）
      (s.data ||= {});
      const dg = ((s.data[user] ||= {})[gacha] ||= { pulls: 0, items: {} });
      dg.pulls += n;
      const dl = (dg.items[rarity] ||= []);
      for (let i=0;i<n;i++) dl.push(code);

      // counts：集計は加算
      (s.counts ||= {});
      const cnt = (((s.counts[user] ||= {})[gacha] ||= {})[rarity] ||= {});
      cnt[code] = (cnt[code] || 0) + n;

      // selected が未設定ならこのガチャを選ぶ
      if (!s.selected) s.selected = gacha;
    });
    return true;
  }
    getCatalog(gacha){
    const c = this.state?.catalogs?.[gacha] || null;
    return c || null;
  }

  /** レア順を返す。rarityService があればそれを優先。 */
  _rarityOrderFor(gacha, { rarityService=null, baseOrder=[] } = {}){
    // 1) rarityService があれば listRarities(gacha) で順を得る
    let order = Array.isArray(rarityService?.listRarities?.(gacha))
      ? rarityService.listRarities(gacha).slice()
      : [];

    // 2) 無ければ baseOrder（アプリ既定の UR/SSR/SR/R/N/はずれ …）
    if (order.length === 0 && Array.isArray(baseOrder)) order = baseOrder.slice();

    // 3) カタログにある未知レアを抽出して末尾にアルファベット順で追加
    const cat = this.getCatalog(gacha);
    const have = new Set(order);
    if (cat?.items && typeof cat.items === 'object') {
      const extra = Object.keys(cat.items).filter(r => !have.has(r)).sort();
      order.push(...extra);
    }

    // 比較用マップ
    const idx = new Map(order.map((r,i)=>[r,i]));
    return { order, indexOf:(r)=> (idx.has(r) ? idx.get(r) : (order.length + 999)) };
  }

  /** items[rarity] が配列/連想/文字列でも配列に正規化 */
  _ensureArray(v){
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v);
    return v ? [String(v)] : [];
  }

  /**
   * カタログだけから完成リスト [{gacha, rarity, code}] を返す
   * data との合流はしない
   */
  listItemsFromCatalog(gacha, { rarityService=null, baseOrder=[] } = {}){
    const cat = this.getCatalog(gacha);
    if (!cat || !cat.items) return [];

    const { indexOf } = this._rarityOrderFor(gacha, { rarityService, baseOrder });

    const out = [];
    for (const [rarity, raw] of Object.entries(cat.items)){
      const arr = this._ensureArray(raw);
      for (const code of arr){
        out.push({ gacha, rarity, code });
      }
    }

    // 並び：レア順 → コードのアルファベット
    out.sort((a,b)=>{
      const ra = indexOf(a.rarity), rb = indexOf(b.rarity);
      if (ra !== rb) return ra - rb;
      return String(a.code).localeCompare(String(b.code), 'ja');
    });
    return out;
  }

  listGachas({ sort = true } = {}) {
    const names = Object.keys(this.state?.catalogs || {});
    if (sort) names.sort((a,b)=> a.localeCompare(b, 'ja'));
    return names;
  }
  getSelectedGacha(){
  return this.state?.selected ?? null;
}

}
