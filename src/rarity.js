// /src/rarity.js  —— 完全置き換え版 ——
// ガチャ別レアリティ設定（色/強さ/排出率）＋UI（タブ/テーブル/追加モーダル/削除確認）
// 依存：AppStateBridge（あれば使う）、無ければ window.* を読む。存在しなければ空で動く。

export const LS_KEY_RARITY = "gacha_rarity_config_v1";
export const BASE_KEY = "__BASE__"; // ベース既定を編集するための特別タブ
export const baseRarityOrder = ["UR","SSR","SR","R","N","はずれ"];
import { mountColorPicker, RAINBOW_VALUE } from "/src/color_picker.js";
// 既存CSSに合わせた既定色（UR は暫定）
export const baseRarityConfig = {
  UR:      { color: "#f59e0b", rarityNum: 8, emitRate: null },
  SSR:     { color: "#fde68a", rarityNum: 6, emitRate: null },
  SR:      { color: "#a78bfa", rarityNum: 5, emitRate: null },
  R:       { color: "#93c5fd", rarityNum: 4, emitRate: null },
  N:       { color: "#a7f3d0", rarityNum: 2, emitRate: null },
  "はずれ": { color: "#fca5a5", rarityNum: 0, emitRate: null },
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
  const fromGacha = rarityConfigByGacha?.[gacha]?.[rarity] || null;
  if (fromGacha) return fromGacha;

  // ベース（ハードコード既定）は UI から編集できない読み取り専用のデフォルト
  if (baseRarityConfig[rarity]) {
    // 共有参照の事故を防ぐためコピーを返す
    return structuredClone(baseRarityConfig[rarity]);
  }
  return { color: null, rarityNum: 1, emitRate: null };
}

// 2) listRaritiesForGacha  — ベースタブ/ベース上書きの取り込みと __deleted を撤廃
export function listRaritiesForGacha(gacha, opts = {}){
  const { gData, gCatalogByGacha } = (opts && opts.gData) ? opts : getStateSafe();

  // 非 BASE：各情報源をマージしてユニーク化（ベース上書きは無視）
  const set = new Set();

  // 0) ベース定義（新規ガチャでも既定の並びを出すために含める）
  for (const r of Object.keys(baseRarityConfig)) set.add(r);

  // 1) ガチャ固有のユーザー設定
  for (const r of Object.keys(rarityConfigByGacha?.[gacha] || {})) set.add(r);

  // 2) 実データ（集計済みデータ：items のキーがレアリティ名）
  if (gData) {
    for (const user of Object.keys(gData)) {
      const perGacha = gData[user]?.[gacha];
      if (!perGacha) continue;
      const items = perGacha.items || {};
      for (const r of Object.keys(items)) set.add(r);
    }
  }

  // 3) カタログ（貼り付け解析済みのアイテム一覧）
  const cat = gCatalogByGacha?.[gacha] || [];
  if (Array.isArray(cat)) {
    for (const it of cat) {
      const r = (it && (it.rarity ?? it.rarityName ?? it.rank ?? it.rarityLabel));
      if (typeof r === 'string' && r) set.add(r);
    }
  } else if (cat && typeof cat === 'object') {
    for (const it of Object.values(cat)) {
      const r = (it && (it.rarity ?? it.rarityName ?? it.rank ?? it.rarityLabel));
      if (typeof r === 'string' && r) set.add(r);
    }
  }

  // 4) __deleted フィルタ（ガチャ固有のみ尊重）
  for (const [r, meta] of Object.entries(rarityConfigByGacha?.[gacha] || {})) {
    if (meta && meta.__deleted === true) set.delete(r);
  }

  return sortRarityNames(Array.from(set), gacha);
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
    // モーダル廃止版：強さ0の「はずれ」行を即時追加（名前は後で編集可能）
    const cfg = (rarityConfigByGacha[current] ||= {});
    const baseName = 'はずれ';
    const existing = new Set(listRaritiesForGacha(current));
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
    const entry = (cfg[rarity] ||= structuredClone(getRarityMeta(current, rarity)));

    if (e.target.classList.contains('rarity-num')){
      const v = e.target.value.trim();
      entry.rarityNum = v==='' ? null : clampInt(parseInt(v,10), 0, 999);
    }else if (e.target.classList.contains('rarity-rate')){
      const v = e.target.value.trim();
      entry.emitRate = v==='' ? null : clampFloat(parseFloat(v), 0, 100);
    }
    cfg[rarity] = entry;
    saveRarityConfig();
  }, { passive:true });

  wrap.addEventListener('click', (e)=>{
    const delBtn = e.target.closest('button.del');
    if (!delBtn) return;

    e.preventDefault();

    const tr = delBtn.closest('tr[data-rarity]');
    if (!tr) return;

    const rarity = tr.getAttribute('data-rarity');
    const cfg = (rarityConfigByGacha[current] ||= {});

    // ガチャ固有設定に“その名前のエントリがある” → 物理削除
    // そうでない（ベース/カタログ/実績由来の行）   → 論理削除（__deleted=true のトゥームストーン）
    if (Object.prototype.hasOwnProperty.call(cfg, rarity)) {
      delete cfg[rarity];
    } else {
      cfg[rarity] = { __deleted: true };
    }

    saveRarityConfig();
    dispatchChanged();
    renderTable();         // 再描画（__deleted 除外が効く）
  });

  // 変更確定（blur や Enter 後）に一度だけ通知して他UIを更新
  wrap.addEventListener('change', (e)=>{
    const tr = e.target.closest('tr[data-rarity]');
    if(!tr) return;
    // 値は input ハンドラですでに保存済み
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
    // 既に同名があるなら拒否
    if (cfg[newName]) {
      alert('同名のレアリティがすでに存在します。別名を指定してください。');
      el.textContent = oldName;
      return;
    }

    // 現行エントリを新キーへ移動（※この行は edit 可能＝cfg[oldName] が存在）
    const entry = (cfg[oldName] ||= structuredClone(getRarityMeta(current, oldName)));
    delete cfg[oldName];
    cfg[newName] = entry;

    saveRarityConfig();
    dispatchChanged();   // 他UIに通知
    renderTable();       // 再描画して data-rarity を更新
  });

  function renderTable(){
    renderTabs(); // タブ表示（アクティブ反映）
    const rarities = listRaritiesForGacha(current);
    const cfg = rarityConfigByGacha[current] || {};

    const rows = rarities.map(r => {
      const m = getRarityMeta(current, r);
      const color = sanitizeColor(m.color) || '#ffffff';
      const num = (typeof m.rarityNum === 'number') ? m.rarityNum : '';
      const rate = (typeof m.emitRate === 'number') ? String(m.emitRate) : '';

      const colorToken = (m.color === RAINBOW_VALUE) ? RAINBOW_VALUE : (sanitizeColor(m.color) || '#ffffff');
      // そのタブ設定に存在するキーはリネーム可能（contenteditable）
      const isEditableName = !!cfg[r];
      const ce = isEditableName ? ' contenteditable="true" spellcheck="false" data-orig="'+escapeHtml(r)+'"' : '';
      const rainbow = (m.color === RAINBOW_VALUE);
      const styleAttr = rainbow ? '' : ` style="color:${m.color||''}"`;
      const extraCls  = `rarity${rainbow?' rainbow':''}${isEditableName?' rarity-name':''}`;
      const raritySpan = `<span class="${extraCls}"${ce}${styleAttr}>${escapeHtml(r)}</span>`;

      return `
        <tr data-rarity="${escapeHtml(r)}">
          <th scope="row">${raritySpan}</th>
          <td><div class="cp-host" data-value="${colorToken}" aria-label="色"></div></td>
          <td><input type="number" class="rarity-num" inputmode="numeric" min="0" max="999" step="1" value="${escapeHtml(num)}" aria-label="強さ"></td>
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
    // 生成したセルにカラーピッカーを装着
    wrap.querySelectorAll('.cp-host').forEach(el => {
      const tr = el.closest('tr[data-rarity]'); if(!tr) return;
      const rarity = tr.getAttribute('data-rarity');
      const initial = el.getAttribute('data-value') || '#ffffff';

      mountColorPicker(el, {
        value: initial,
        onChange: (v) => {
          const cfg = (rarityConfigByGacha[current] ||= {});
          const entry = (cfg[rarity] ||= structuredClone(getRarityMeta(current, rarity)));

          // "rainbow" は特別値として保存／表示
          entry.color = (v === RAINBOW_VALUE) ? RAINBOW_VALUE : (v || null);

          // 表示を即時反映
          const span = tr.querySelector('.rarity');
          if (v === RAINBOW_VALUE){
            span.classList.add('rainbow');
            span.style.color = '';
          }else{
            span.classList.remove('rainbow');
            span.style.color = v || '';
          }

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
