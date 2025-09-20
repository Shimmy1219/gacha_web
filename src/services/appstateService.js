// src/services/appStateService.js
import { BaseService, loadLocalJSON, saveLocalJSON, json, debounce } from './core/base.js';

export class AppStateService extends BaseService {
  constructor(key='gacha_app_state_v1') {
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
}
