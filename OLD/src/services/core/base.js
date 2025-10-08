// src/services/core/base.js
export class BaseService extends EventTarget {
  onChange(listener) { this.addEventListener('change', listener); return () => this.removeEventListener('change', listener); }
  _emit() { this.dispatchEvent(new Event('change')); }
}

export const json = {
  parse(s, fallback) { try { return JSON.parse(s ?? ''); } catch { return fallback; } },
  clone(v) { try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); } }
};

export function loadLocalJSON(key, fallback) {
  return json.parse(localStorage.getItem(key), fallback);
}
export function saveLocalJSON(key, value) {
  if (value == null) return localStorage.removeItem(key);
  localStorage.setItem(key, JSON.stringify(value));
}

export function debounce(fn, ms=150) {
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}
