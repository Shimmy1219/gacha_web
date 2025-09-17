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
}
