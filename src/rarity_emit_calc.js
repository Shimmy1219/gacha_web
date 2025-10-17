// /src/emit_rates.js —— 排出率ロジック専用（UI/保存に非依存）

export const PRECISION_DECIMALS = 10;
const POW10 = Math.pow(10, PRECISION_DECIMALS);

export function roundN(x, n = PRECISION_DECIMALS){
  const p = Math.pow(10, n);
  return Math.round((+x + Number.EPSILON) * p) / p;
}

export function clampFloatN(v, min = 0, max = 100, n = PRECISION_DECIMALS){
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  const clamped = Math.min(max, Math.max(min, v));
  return roundN(clamped, n);
}

/**
 * cfg: Record<rarityName, { rarityNum: number|null, emitRate: number|null, ... }>
 * → rarityNum 昇順（弱い→強い）でソートされた配列に変換
 */
function toSortedEntries(cfg){
  const arr = Object.entries(cfg).map(([name, meta])=>{
    const rn = (typeof meta.rarityNum === 'number') ? meta.rarityNum : 0;
    const rate = (typeof meta.emitRate === 'number')
      ? clampFloatN(meta.emitRate, 0, 100)
      : null;
    return { name, rn, rate };
  });
  arr.sort((a,b)=>{
    if (a.rn !== b.rn) return a.rn - b.rn; // 弱い(小)→強い(大)
    return a.name.localeCompare(b.name, 'ja');
  });
  return arr;
}

/**
 * 単調性(弱い≥強い)を保証
 */
function enforceMonotoneWeakToStrong(entries){
  for (let i = entries.length - 2; i >= 0; i--){
    const nxt = entries[i+1].rate ?? 0;
    const cur = entries[i].rate ?? 0;
    if (cur < nxt) entries[i].rate = nxt;
  }
}

/**
 * 合計100%へ調整（弱い側から優先して増減）
 */
function adjustSumTo100KeepMonotone(entries){
  enforceMonotoneWeakToStrong(entries);

  let sum = roundN(entries.reduce((s,e)=> s + (e.rate ?? 0), 0));
  let residual = roundN(100 - sum);

  if (residual === 0) return;

  if (residual > 0){
    // 弱い側から加算（上限：直上の値）
    for (let i = 0; i < entries.length && residual > 0; i++){
      const prev = (i === 0) ? 100 : entries[i-1].rate;
      const cap  = Math.min(100, (prev ?? 100));
      const room = roundN(cap - (entries[i].rate ?? 0));
      const add  = Math.min(residual, Math.max(0, room));
      entries[i].rate = roundN((entries[i].rate ?? 0) + add);
      residual = roundN(residual - add);
    }
  }else{
    // 弱い側から減算（下限：直下の値）
    residual = -residual;
    for (let i = 0; i < entries.length && residual > 0; i++){
      const next = (i === entries.length-1) ? 0 : (entries[i+1].rate ?? 0);
      const room = roundN((entries[i].rate ?? 0) - next);
      const sub  = Math.min(residual, Math.max(0, room));
      entries[i].rate = roundN((entries[i].rate ?? 0) - sub);
      residual = roundN(residual - sub);
    }
  }

  enforceMonotoneWeakToStrong(entries);
}

/**
 * 自動配分（未設定があるときのみ）
 * 1) 既知アンカーがあれば区間を線形補間し、端は延長
 * 2) 既知がゼロなら三角重み（弱いほど重い）
 * 3) 最後に合計100%へ調整
 */
function autoFillByStrength(entries){
  const knownIdx = entries.map((e,i)=> e.rate!=null ? i : -1).filter(i=> i>=0);

  if (knownIdx.length === 0){
    const N = entries.length;
    const sumW = N*(N+1)/2;
    entries.forEach((e,i)=>{
      const w = (N - i); // 弱い側が大きい
      e.rate = roundN(100 * w / sumW);
    });
  }else{
    // 既知アンカー単調性（弱い≥強い）を先に整える
    enforceMonotoneWeakToStrong(entries);

    // 左端～最初のアンカー
    for (let i = 0; i < knownIdx[0]; i++){
      entries[i].rate = entries[knownIdx[0]].rate;
    }
    // アンカー間を線形補間
    for (let k = 0; k < knownIdx.length - 1; k++){
      const L = knownIdx[k], R = knownIdx[k+1];
      const left = entries[L].rate, right = entries[R].rate;
      const span = R - L;
      for (let i = L+1; i < R; i++){
        const t = (i - L) / span;             // 0→1
        const v = roundN(left - (left - right) * t); // 弱い→強いで減少
        entries[i].rate = v;
      }
    }
    // 最後のアンカー～右端
    for (let i = knownIdx[knownIdx.length - 1] + 1; i < entries.length; i++){
      entries[i].rate = entries[knownIdx[knownIdx.length - 1]].rate;
    }
  }

  adjustSumTo100KeepMonotone(entries);
}

/**
 * 未設定があれば自動配分して100%化（in-place）
 * @returns {boolean} 何か変更があったか
 */
export function ensureAutoEmitRatesForGacha(cfgMap, gacha){
  const cfg = (cfgMap[gacha] ||= {});
  const entries = toSortedEntries(cfg);

  const hasNull = entries.some(e => e.rate == null);
  if (!hasNull) return false;

  autoFillByStrength(entries);

  // 保存（in-place）
  entries.forEach(e=>{
    const meta = (cfg[e.name] ||= { rarityNum:0, emitRate:null, color:null });
    meta.emitRate = roundN(e.rate);
  });
  return true;
}

/**
 * 編集後の正規化（単調性＋合計100%）in-place
 * @returns {boolean} 何か変更があったか
 */
export function normalizeEmitRatesForGacha(cfgMap, gacha, { changed = null } = {}){
  const cfg = (cfgMap[gacha] ||= {});
  const entries = toSortedEntries(cfg);

  const hasNull = entries.some(e => e.rate == null);
  if (hasNull){
    autoFillByStrength(entries);
  }else{
    enforceMonotoneWeakToStrong(entries);
    adjustSumTo100KeepMonotone(entries);
  }

  let changedFlag = false;
  entries.forEach(e=>{
    const meta = (cfg[e.name] ||= { rarityNum:0, emitRate:null, color:null });
    const next = roundN(e.rate);
    if (meta.emitRate !== next){
      meta.emitRate = next;
      changedFlag = true;
    }
  });
  return changedFlag;
}
