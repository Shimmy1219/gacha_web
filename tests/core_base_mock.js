// appStateService.js が import する core/base.js のテスト用モック実装
export class BaseService {
  constructor(){ this._handlers = new Set(); }
  on(fn){ this._handlers.add(fn); }
  off(fn){ this._handlers.delete(fn); }
  _emit(){ for (const h of this._handlers) try{ h(); }catch(_){} }
}

export function loadLocalJSON(key, def){
  const raw = localStorage.getItem(key);
  if (raw == null) return def;
  try { return JSON.parse(raw); } catch { return def; }
}
export function saveLocalJSON(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

export const json = {
  clone: (v)=> structuredClone(v)
};

// テストではとりあえず即時実行でOK（保存/描画のタイミングを待たない）
export const debounce = (fn)=> fn;
