// /src/rarity.js  —— 完全置き換え版 ——
// ガチャ別レアリティ設定（色/強さ/排出率）＋UI（タブ/テーブル/追加モーダル/削除確認）
// 依存：AppStateBridge（あれば使う）、無ければ window.* を読む。存在しなければ空で動く。

export const LS_KEY_RARITY = "gacha_rarity_config_v1";
export const BASE_KEY = "__BASE__"; // ベース既定を編集するための特別タブ
export const baseRarityOrder = ["UR","SSR","SR","R","N","はずれ"];
import { mountColorPicker, RAINBOW_VALUE, GOLD_HEX, SILVER_HEX } from "/src/color_picker.js";
// 既存CSSに合わせた既定色（UR は暫定）
export const baseRarityConfig = {
  // 既定の排出率：UR=1, SSR=5, SR=10, R=15, N=20, はずれ=49
  UR:      { color: "#f59e0b", rarityNum: 8, emitRate: 1 },
  SSR:     { color: "#fde68a", rarityNum: 6, emitRate: 5 },
  SR:      { color: "#a78bfa", rarityNum: 5, emitRate: 10 },
  R:       { color: "#93c5fd", rarityNum: 4, emitRate: 15 },
  N:       { color: "#a7f3d0", rarityNum: 2, emitRate: 20 },
  "はずれ": { color: "#fca5a5", rarityNum: 0, emitRate: 49 },
};

let rarityConfigByGacha = loadRarityConfig(); // { [gacha|__BASE__]: { [rarity]: {color, rarityNum, emitRate} } }

// ================= I/O =================
export function loadRarityConfig(){
  try{
    const raw = localStorage.getItem(LS_KEY_RARITY);
    if(!raw) return {};
    const obj = JSON.parse(raw) || {};
    if (obj && typeof obj === 'object' && obj[BASE_KEY]) {
      // ベースは廃止：読み込み時に破棄して即時クリーンアップ
      delete obj[BASE_KEY];
      try { localStorage.setItem(LS_KEY_RARITY, JSON.stringify(obj)); } catch(_){}
    }
    return (obj && typeof obj === 'object') ? obj : {};
  }catch(_){ return {}; }
}

export function saveRarityConfig(obj = rarityConfigByGacha){
  try{
    let out = obj || {};
    if (out && typeof out === 'object' && out[BASE_KEY]) {
      // ベースは保存しない
      const { [BASE_KEY]: _drop, ...rest } = out;
      out = rest;
    }
    localStorage.setItem(LS_KEY_RARITY, JSON.stringify(out));
  }catch(e){
    console.warn("rarity 保存失敗:", e);
  }
}

// ================= コア関数 =================
// 1) getRarityMeta
export function getRarityMeta(gacha, rarity){
  // シンプル方針：表示＝保存。ベースは初期シード時のみ使用。
  return rarityConfigByGacha?.[gacha]?.[rarity] || null;
}

// 2) listRaritiesForGacha  — ベースタブ/ベース上書きの取り込みと __deleted を撤廃
export function listRaritiesForGacha(gacha){
  // シンプル方針：そのガチャの config に存在するキーのみを表示
  const names = Object.keys(rarityConfigByGacha?.[gacha] || {});
  return sortRarityNames(names, gacha);
}


function sortRarityNames(arr, gacha){
  return arr.sort((a,b)=>{
    const ma = getRarityMeta(gacha, a);
    const mb = getRarityMeta(gacha, b);
    const na = (typeof ma.rarityNum === 'number') ? ma.rarityNum : -1;
    const nb = (typeof mb.rarityNum === 'number') ? mb.rarityNum : -1;
    if (na !== nb) return nb - na;
    const ia = baseRarityOrder.indexOf(a), ib = baseRarityOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, 'ja');
  });
}

// 3) isMiss
export function isMiss(gacha, rarity){ return getRarityMeta(gacha, rarity)?.rarityNum === 0; }

// =============== UI（タブ＋テーブル＋モーダル） ===============
export function initRarityUI(){
  const panel = document.getElementById('rarityPanel');
  if (!panel) return;

  panel.innerHTML = `
    <h2 style="margin-bottom:.25rem">レアリティ設定</h2>
    <div class="muted" style="margin-bottom:8px">
      ガチャごとに色・強さ・排出率(%)を設定できます。カスタム名も追加可能です。
    </div>

    <div id="rarityGachaTabs" class="tabs"></div>

    <div class="subcontrols" style="display:flex;gap:8px;align-items:center;margin:8px 0 12px">
      <button id="addRarityRow" class="btn ghost">レアリティを追加</button>
    </div>

    <div id="rarityTableWrap" class="rarity-wrap"></div>
  `;


  const tabs = panel.querySelector('#rarityGachaTabs');
  const wrap = panel.querySelector('#rarityTableWrap');

  let current = null; // 既定でベース（要件）

  function gachaNames(){
    const { gData, gCatalogByGacha } = getStateSafe();
    const set = new Set([
      ...Object.keys(gCatalogByGacha || {}),
      ...Object.keys(gData || {}).flatMap(u => Object.keys(gData[u]||{})),
    ]);
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'ja'));
  }

  function renderTabs(){
    const names = gachaNames();
    const html = names.map(g =>
      `<button type="button" class="tab ${current===g?'active':''}" data-gacha="${escapeHtml(g)}">${escapeHtml(g)}</button>`
    ).join('');
    tabs.innerHTML = html;
  }

  tabs.addEventListener('click', (e)=>{
    const btn = e.target.closest('button.tab'); if(!btn) return;
    const g = btn.getAttribute('data-gacha');
    current = g;
    renderTabs();
    renderTable();
  });

  panel.querySelector('#addRarityRow').addEventListener('click', ()=>{
    const MAX_TYPES = 20;

    // いま表示対象のレアリティ件数を取得
    const existingList = listRaritiesForGacha(current);
    if (existingList.length >= MAX_TYPES) {
      alert('レアリティの種類は最大20までです。これ以上は追加できません。');
      return;
    }

    // 「はずれ」をベースに一意名を作って追加
    const cfg = (rarityConfigByGacha[current] ||= {});
    const baseName = 'はずれ';
    const existing = new Set(existingList);
    let name = baseName;
    let i = 2;
    while (existing.has(name)) { name = baseName + i; i++; }

    const baseMeta = baseRarityConfig['はずれ'] || {};
    cfg[name] = { color: baseMeta.color || null, rarityNum: 0, emitRate: null };
    saveRarityConfig();
    dispatchChanged();
    renderTable();

    // 追加直後に名前セルへフォーカス（全選択）
    try{
      const wrapEl = panel.querySelector('#rarityTableWrap');
      const trEl = Array.from(wrapEl?.querySelectorAll('tr[data-rarity]')||[])
        .find(tr => tr.getAttribute('data-rarity') === name);
      const nameEl = trEl?.querySelector('.rarity-name');
      nameEl?.focus();
      const sel = window.getSelection?.();
      if (nameEl && sel) {
        sel.removeAllRanges?.();
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        sel.addRange(range);
      }
    }catch(_){}
  });


  wrap.addEventListener('input', (e)=>{
    const tr = e.target.closest('tr[data-rarity]'); if(!tr) return;
    const rarity = tr.getAttribute('data-rarity');
    const cfg = (rarityConfigByGacha[current] ||= {});
    const entry = (cfg[rarity] ||= { color: null, rarityNum: 1, emitRate: null });

    const MAX_NUM = 20;

    if (e.target.classList.contains('rarity-num')){
      const raw = e.target.value.trim();
      let n = (raw === '') ? null : parseInt(raw, 10);
      if (n != null && n > MAX_NUM) {
        n = MAX_NUM;
        e.target.value = String(MAX_NUM);
        alert('強さの最大値は20です。20に丸めました。');
      }
      entry.rarityNum = (n === null) ? null : clampInt(n, 0, MAX_NUM);
      cfg[rarity] = entry;
      saveRarityConfig();

      // 強さ変更 → 単調性が影響するので正規化して再描画
      normalizeEmitRatesForGacha(current);
      renderTable();

    } else if (e.target.classList.contains('rarity-rate')){
      const v = e.target.value.trim();
      entry.emitRate = v==='' ? null : clampFloat(parseFloat(v), 0, 100);
      cfg[rarity] = entry;
      saveRarityConfig();

      // 排出率編集 → 最弱から帳尻合わせして100%化（単調性も担保）
      normalizeEmitRatesForGacha(current, { changed: rarity });
      renderTable();
    }
  });


  wrap.addEventListener('click', (e)=>{
    const delBtn = e.target.closest('button.del');
    if (!delBtn) return;

    e.preventDefault();

    const tr = delBtn.closest('tr[data-rarity]');
    if (!tr) return;

    const rarity = tr.getAttribute('data-rarity');
    const cfg = (rarityConfigByGacha[current] ||= {});

    // シンプル方針：常に物理削除
    delete cfg[rarity];

    saveRarityConfig();
    dispatchChanged();
    renderTable(); // config-only なので復活しない
  });

  // 変更確定（blur や Enter 後）に一度だけ通知して他UIを更新
  wrap.addEventListener('change', (e)=>{
    const tr = e.target.closest('tr[data-rarity]');
    if(!tr) return;
    // 値は input ハンドラですでに保存済み
    if (current) normalizeEmitRatesForGacha(current);
    dispatchChanged();     // ← ここで state:changed を出す
  });

  // 名称編集: フォーカスで元名を保持 & 全選択
  wrap.addEventListener('focusin', (e) => {
    const el = e.target.closest('.rarity-name');
    if (!el) return;
    // 元名を保存（Escで戻せるように）
    el.setAttribute('data-orig', (el.textContent || '').trim());
    // 文字列を全選択（編集しやすく）
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  });

  // 名称編集: Enterで確定、Escで取り消し
  wrap.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t) return;

    // 既存の number 用 Enter 確定に加えて name も対象にする
    if (e.key === 'Enter' &&
        (t.classList?.contains('rarity-num') ||
        t.classList?.contains('rarity-rate') ||
        t.classList?.contains('rarity-name'))) {
      e.preventDefault();
      e.stopPropagation();
      t.blur();                 // ← 確定＝フォーカス外し
    }

    // Esc は編集をキャンセル
    if (e.key === 'Escape' && t.classList?.contains('rarity-name')) {
      e.preventDefault();
      const orig = t.getAttribute('data-orig') || '';
      t.textContent = orig;
      t.blur();
    }
  });

  // 名称編集: フォーカスが外れたタイミングでリネームを確定
  wrap.addEventListener('focusout', (e) => {
    const el = e.target.closest('.rarity-name');
    if (!el) return;

    const tr = el.closest('tr[data-rarity]'); if (!tr) return;
    const oldName = tr.getAttribute('data-rarity');
    const newName = (el.textContent || '').trim();

    // 変更なし or 空は何もしない（空は元に戻す）
    if (!newName) { el.textContent = oldName; return; }
    if (newName === oldName) return;

    const cfg = (rarityConfigByGacha[current] ||= {});

    // 衝突は弾く（自ガチャ config に既にある場合）
    if (Object.prototype.hasOwnProperty.call(cfg, newName)) {
      alert('同名のレアリティがすでに存在します。別名を指定してください。');
      el.textContent = oldName;
      return;
    }

    // 物理移動（旧→新）
    const entry = cfg[oldName] || { color: null, rarityNum: 1, emitRate: null };
    delete cfg[oldName];
    cfg[newName] = entry;

    // in-place 更新（再描画しない）
    tr.setAttribute('data-rarity', newName);
    el.setAttribute('data-orig', newName);
    el.textContent = newName;

    saveRarityConfig();
    dispatchChanged();
  });


  function renderTable(){
    const MAX_TYPES = 20;
    const MAX_NUM   = 20;

    renderTabs(); // タブ表示（アクティブ反映）

    // シンプル方針：表示＝保存。
    // このガチャの設定が空なら、初回だけ baseRarityOrder を元にシードして保存。
    if (current) {
      const seedCfg = (rarityConfigByGacha[current] ||= {});
      if (Object.keys(seedCfg).length === 0) {
        for (const r of baseRarityOrder) {
          const base = baseRarityConfig[r] || { color: null, rarityNum: 1, emitRate: null };
          seedCfg[r] = structuredClone(base);
        }
        saveRarityConfig();
      }
    }
    ensureAutoEmitRatesForGacha(current)

    const rarities = listRaritiesForGacha(current).slice(0, MAX_TYPES);
    const cfg = rarityConfigByGacha[current] || {};

    const rows = rarities.map(r => {
      const m = getRarityMeta(current, r) || {};
      const num  = (typeof m.rarityNum === 'number') ? Math.min(m.rarityNum, MAX_NUM) : '';
      const rate = (typeof m.emitRate === 'number') ? String(m.emitRate) : '';

      const colorToken = (m.color === RAINBOW_VALUE) ? RAINBOW_VALUE : (sanitizeColor(m.color) || '#ffffff');

      // 金/銀/虹 表示
      const isRainbow = (m.color === RAINBOW_VALUE);
      const isGold    = (m.color === GOLD_HEX);
      const isSilver  = (m.color === SILVER_HEX);
      const isMetal   = isGold || isSilver;

      const styleAttr = (isRainbow || isMetal) ? '' : ` style="color:${m.color||''}"`;
      const extraCls  = `rarity${isRainbow?' rainbow':''}${isGold?' metal-gold':''}${isSilver?' metal-silver':''} rarity-name`;

      const raritySpan =
        `<span class="${extraCls}" contenteditable="true" spellcheck="false" data-orig="${escapeHtml(r)}"${styleAttr}>${escapeHtml(r)}</span>`;

      return `
        <tr data-rarity="${escapeHtml(r)}">
          <th scope="row">${raritySpan}</th>
          <td><div class="cp-host" data-value="${colorToken}" aria-label="色"></div></td>
          <td><input type="number" class="rarity-num" inputmode="numeric" min="0" max="${MAX_NUM}" step="1" value="${escapeHtml(num)}" aria-label="強さ"></td>
          <td class="emit-cell"><input type="number" class="rarity-rate" inputmode="decimal" min="0" max="100" step="0.01" value="${escapeHtml(rate)}" aria-label="排出率"><span class="unit">%</span></td>
          <td class="ops"><button class="btn subtle danger del" title="このレアリティ設定を削除">削除</button></td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table class="table rarity-table">
        <thead><tr><th>レアリティ</th><th>色</th><th>強さ</th><th>排出率</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // カラーピッカー装着（config-only で保存）
    wrap.querySelectorAll('.cp-host').forEach(el => {
      const tr = el.closest('tr[data-rarity]'); if(!tr) return;
      const rarity  = tr.getAttribute('data-rarity');
      const initial = el.getAttribute('data-value') || '#ffffff';

      mountColorPicker(el, {
        value: initial,
        onChange: (v) => {
          const cfg = (rarityConfigByGacha[current] ||= {});
          const entry = (cfg[rarity] ||= { color: null, rarityNum: 1, emitRate: null });

          // 保存
          entry.color = (v === RAINBOW_VALUE) ? RAINBOW_VALUE : (v || null);

          // 表示を即時反映（金/銀/虹クラス切替）
          const span = tr.querySelector('.rarity');
          const isGold    = (v === GOLD_HEX);
          const isSilver  = (v === SILVER_HEX);
          const isRainbow = (v === RAINBOW_VALUE);

          span.classList.toggle('rainbow',     isRainbow);
          span.classList.toggle('metal-gold',  isGold);
          span.classList.toggle('metal-silver',isSilver);
          span.style.color = (isRainbow || isGold || isSilver) ? '' : (v || '');

          cfg[rarity] = entry;
          saveRarityConfig();
          dispatchChanged();
        }
      });
    });
  }


  // 初期化：AppStateBridge 準備待ち＋明示呼び出し
  const kickoff = ()=>{
    const names = gachaNames();
    current = names.length ? names[0] : null; // 最初の実ガチャを選ぶ。無ければ未選択
    renderTable();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=> requestAnimationFrame(kickoff), { once:true });
  } else {
    requestAnimationFrame(kickoff);
  }

  // 既存ガチャの読込に追従
  document.addEventListener('state:changed', ()=>{
    // いま rarity パネル内の入力にフォーカスがあるなら再描画を抑止
    const ae = document.activeElement;
    if (ae && wrap.contains(ae)) return;

    if (current !== BASE_KEY){
      const names = gachaNames();
      if (!names.includes(current)) current = BASE_KEY;
    }
    renderTable();
  });
}

function clampInt(v, min, max){
  if (Number.isNaN(v)) return null;
  return Math.min(max, Math.max(min, v|0));
}
function clampFloat(v, min, max){
  if (Number.isNaN(v)) return null;
  return Math.min(max, Math.max(min, v));
}
function sanitizeColor(v){
  if (!v) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
  return null;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function getStateSafe(){
  const br = (typeof window !== 'undefined') ? window.AppStateBridge : null;
  if (br && typeof br.getState === 'function'){
    const st = br.getState();
    // 既存ガチャ読み込み強化：window.* も併用
    return {
      gData: st.gData || window.gData || {},
      gCatalogByGacha: st.gCatalogByGacha || window.gCatalogByGacha || {},
      gHitCounts: st.gHitCounts || window.gHitCounts || {},
    };
  }
  return {
    gData: window.gData || {},
    gCatalogByGacha: window.gCatalogByGacha || {},
    gHitCounts: window.gHitCounts || {},
  };
}
function dispatchChanged(){
  try{ document.dispatchEvent(new CustomEvent('rarityconfig:changed', { detail: { rarityConfigByGacha } })); }catch(_){}
  try{ document.dispatchEvent(new Event('state:changed')); }catch(_){}
}

// ===== 排出率の自動配分・正規化ヘルパ =====

// 小数点2桁に丸める（UIのstep=0.01に揃える）
function round2(x){ return Math.round((+x + Number.EPSILON) * 100) / 100; }

// rarityNumが小さい=弱い（当たりやすい）。弱いほど確率が高くなるよう、配列を
// rarityNum 昇順（弱い→強い）で並べ替えて扱う。
function sortEntriesByStrength(cfg){
  const arr = Object.entries(cfg).map(([name, meta]) => {
    const rn = (typeof meta.rarityNum === 'number') ? meta.rarityNum : 0;
    let rate = (typeof meta.emitRate === 'number') ? clampFloat(meta.emitRate, 0, 100) : null;
    return { name, rn, rate };
  });
  arr.sort((a,b)=>{
    if (a.rn !== b.rn) return a.rn - b.rn; // 弱い→強い
    return a.name.localeCompare(b.name, 'ja');
  });
  return arr;
}

// 合計100%に合わせる。弱い側(配列先頭)から増減させ、単調性(弱い>=強い)を守る。
function adjustSumTo100KeepMonotone(entries){
  // 単調性を一度保証（弱い>=強い）
  for (let i = entries.length - 2; i >= 0; i--){
    const nxt = entries[i+1].rate ?? 0;
    const cur = entries[i].rate ?? 0;
    if (cur < nxt) entries[i].rate = nxt;
  }

  // 合計計算
  let sum = entries.reduce((s, e)=> s + (e.rate ?? 0), 0);
  sum = round2(sum);
  let residual = round2(100 - sum);
  if (residual === 0) return;

  if (residual > 0){
    // 弱い方から加算。各要素は最大100まで、かつ弱い>=強いを維持
    for (let i = 0; i < entries.length && residual > 0; i++){
      const prev = (i === 0) ? 100 : entries[i-1].rate;  // 上(弱い側)の上限
      const cap  = Math.min(100, (prev ?? 100));
      const room = round2(cap - (entries[i].rate ?? 0));
      const add  = Math.min(residual, Math.max(0, room));
      entries[i].rate = round2((entries[i].rate ?? 0) + add);
      residual = round2(residual - add);
    }
  }else if (residual < 0){
    // 弱い方から減算。ただし「弱い>=強い」を壊さないよう下限は次(強い側)の値
    residual = -residual;
    for (let i = 0; i < entries.length && residual > 0; i++){
      const next = (i === entries.length-1) ? 0 : (entries[i+1].rate ?? 0); // 下限
      const room = round2((entries[i].rate ?? 0) - next);
      const sub  = Math.min(residual, Math.max(0, room));
      entries[i].rate = round2((entries[i].rate ?? 0) - sub);
      residual = round2(residual - sub);
    }
  }

  // 念のためもう一度単調性を保証
  for (let i = entries.length - 2; i >= 0; i--){
    const nxt = entries[i+1].rate ?? 0;
    const cur = entries[i].rate ?? 0;
    if (cur < nxt) entries[i].rate = nxt;
  }
}

// 未設定の排出率を強さで自動配分（弱いほど高確率）。最後に合計100%化。
export function ensureAutoEmitRatesForGacha(gacha){
  const cfg = (rarityConfigByGacha[gacha] ||= {});
  const entries = sortEntriesByStrength(cfg);

  const hasAnyNull = entries.some(e => e.rate == null);
  if (!hasAnyNull) return; // すでに全て数値なら何もしない

  // 既知アンカー（rate!=null）で区間内を線形補間、未端は端の値を延長
  // 既知アンカーがゼロの場合は三角重みで自動生成（弱い側が重い）
  const idxKnown = entries
    .map((e,i)=> e.rate!=null ? i : -1)
    .filter(i=> i>=0);

  if (idxKnown.length === 0){
    // 三角重み：w_i = (N - i) で弱いほど重く
    const N = entries.length;
    const sumW = N*(N+1)/2;
    entries.forEach((e,i)=>{
      const w = (N - i);
      e.rate = round2(100 * w / sumW);
    });
  }else{
    // アンカーの単調性を事前に是正（弱い>=強い）
    for (let i = entries.length - 2; i >= 0; i--){
      const nxt = entries[i+1].rate ?? 0;
      const cur = entries[i].rate ?? 0;
      if (cur != null && nxt != null && cur < nxt){
        entries[i].rate = nxt;
      }
    }
    // 各区間を線形補間
    const known = idxKnown;
    // 左端〜最初のアンカー
    for (let i = 0; i < known[0]; i++){
      entries[i].rate = entries[known[0]].rate;
    }
    // アンカー間
    for (let k = 0; k < known.length - 1; k++){
      const L = known[k], R = known[k+1];
      const left = entries[L].rate, right = entries[R].rate;
      const span = R - L;
      for (let i = L+1; i < R; i++){
        const t = (i - L) / span; // 0→1
        const v = round2(left - (left - right) * t); // 弱い→強いで減少
        entries[i].rate = v;
      }
    }
    // 最後のアンカー〜右端（強い側）は値を延長
    for (let i = known[known.length - 1] + 1; i < entries.length; i++){
      entries[i].rate = entries[known[known.length - 1]].rate;
    }
  }

  // 合計100%へ調整（弱い側から）
  adjustSumTo100KeepMonotone(entries);

  // 保存
  entries.forEach(e=>{
    const meta = (cfg[e.name] ||= { color:null, rarityNum:0, emitRate:null });
    meta.emitRate = round2(e.rate);
  });
  saveRarityConfig();
}

// 編集後の正規化（changed には今回直接編集したレアリティ名を渡せる）
export function normalizeEmitRatesForGacha(gacha, { changed = null } = {}){
  const cfg = (rarityConfigByGacha[gacha] ||= {});
  const entries = sortEntriesByStrength(cfg);

  // 文字入力直後など null が混じるケースは自動補完
  const hasAnyNull = entries.some(e => e.rate == null);
  if (hasAnyNull) {
    ensureAutoEmitRatesForGacha(gacha);
    return;
  }

  // 単調性（弱い>=強い）を維持。ユーザーが強い側を上げすぎたら、
  // 必要に応じて弱い側を底上げして矛盾を解消。
  for (let i = entries.length - 2; i >= 0; i--){
    const nxt = entries[i+1].rate;
    if (entries[i].rate < nxt) entries[i].rate = nxt;
  }

  // 合計100%に補正（弱い側から）
  adjustSumTo100KeepMonotone(entries);

  // 保存
  entries.forEach(e=>{
    const meta = (cfg[e.name] ||= { color:null, rarityNum:0, emitRate:null });
    meta.emitRate = round2(e.rate);
  });
  saveRarityConfig();
  dispatchChanged();
}
