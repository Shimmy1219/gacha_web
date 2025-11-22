// /src/rarity.js  —— 完全置き換え版 ——
// ガチャ別レアリティ設定（色/強さ/排出率）＋UI（タブ/テーブル/追加モーダル/削除確認）
// 依存：AppStateBridge（あれば使う）、無ければ window.* を読む。存在しなければ空で動く。
export const BASE_KEY = "__BASE__";
export const baseRarityOrder = ["UR","SSR","SR","R","N","はずれ"];
import { mountColorPicker, RAINBOW_VALUE, GOLD_HEX, SILVER_HEX } from "/src/color_picker.js";
import { clampFloatN, PRECISION_DECIMALS } from "/src/rarity_emit_calc.js";
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
// 追加：サービスを利用
import { RarityService } from '/src/services/rarityService.js';
import { rarityNameSpanHTML, applyRarityColor } from "/src/rarity_style.js";

const _W = (typeof window !== 'undefined') ? window : {};
const existing = _W.Services && (_W.Services.rarity || _W.Services.rarityService);
// ★ 追加: PC/モバイル判定（index.html と同等ロジック）
function isMobileLike(){
  return window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)').matches;
}
let __pendingNextFocus = null; 
// LSキーは既存の窓口を尊重
const raritySvc = existing || (() => {
  const key = (_W && _W.LS_KEY_RARITY) || 'gacha_rarity_config_v2';
  const svc = new RarityService(key);
  svc.load();
  // 共有レジストリがなければ作る
  _W.Services = _W.Services || {};
  // 一貫したキー名で載せる
  _W.Services.rarity = svc;
  return svc;
})();

// NEW: LSから選択ガチャIDを読む
function loadSelectedFromLS(){
  try{
    const v = localStorage.getItem('rarity_tab_selected');
    return v || null;
  }catch(_){ return null; }
}
// NEW: LSに選択ガチャIDを書き込む
function saveSelectedToLS(gachaId){
  try{
    if (gachaId) localStorage.setItem('rarity_tab_selected', gachaId);
  }catch(_){}
}



// 補助：並び順（強さ desc → 既定順 → 名前）
function sortRarityNamesSvc(gachaId, names){
  const baseOrder = Array.isArray(baseRarityOrder) ? baseRarityOrder : [];
  return [...names].sort((a,b)=>{
    const ma = raritySvc.getMeta(gachaId, a) || {};
    const mb = raritySvc.getMeta(gachaId, b) || {};
    const na = (typeof ma.rarityNum === 'number') ? ma.rarityNum : -1;
    const nb = (typeof mb.rarityNum === 'number') ? mb.rarityNum : -1;
    if (na !== nb) return nb - na;
    const ia = baseOrder.indexOf(a), ib = baseOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, "ja");
  });
}
// 補助：emit 正規化をサービスに合わせて呼ぶ（in-place 変化 → save）
// 旧: normalizeEmitViaService(gacha) を差し替え
function normalizeEmitViaService(gachaId){
  if (!gachaId) return;

  const bottom = getBottomRarityName(gachaId);
  if (!bottom) return;

  let sumOthers = 0;
  const names = raritySvc.listRarities(gachaId);
  for (const r of names){
    if (r === bottom) continue;
    const v = raritySvc.getMeta(gachaId, r)?.emitRate;
    if (typeof v === 'number' && !Number.isNaN(v)) sumOthers += v;
  }

  let rest = 100 - sumOthers;
  rest = clampFloatN(typeof rest === 'number' ? rest : 0, 0, 100, PRECISION_DECIMALS);

  const meta = raritySvc.getMeta(gachaId, bottom) || {};
  if (meta.emitRate !== rest){
    raritySvc.upsert(gachaId, bottom, { ...meta, emitRate: rest });
  }
  raritySvc.save();
}


export function saveRarityConfig(obj = rarityFlat){
  raritySvc.save();
}

function getFlatKey(gacha, rarity){ return `${gacha}::${rarity}`; }

export function getRarityMeta(gachaId, rarity){
  return raritySvc.getMeta(gachaId, rarity);
}
export function setRarityMeta(gachaId, rarity, meta){
  raritySvc.upsert(gachaId, rarity, {
    color:     meta?.color ?? null,
    rarityNum: (typeof meta?.rarityNum === "number" ? meta.rarityNum : (meta?.rarityNum == null ? null : (meta.rarityNum|0))),
    emitRate:  (typeof meta?.emitRate === "number" ? meta.emitRate : null),
  });
}
function getBottomRarityName(gachaId){
  const sorted = listRaritiesForGacha(gachaId); // UI並び→末尾が最下位
  return sorted.length ? sorted[sorted.length - 1] : null;
}
export function deleteRarityMeta(gachaId, rarity){
  raritySvc.deleteRarity(gachaId, rarity);
}
export function listRaritiesForGacha(gachaId){
  const names = raritySvc.listRarities(gachaId);
  return sortRarityNamesSvc(gachaId, names);
}
function sortRarityNames(arr, gachaId){
  return arr.sort((a,b)=>{
    const ma = getRarityMeta(gachaId, a);
    const mb = getRarityMeta(gachaId, b);
    const na = (typeof ma?.rarityNum === 'number') ? ma.rarityNum : -1;
    const nb = (typeof mb?.rarityNum === 'number') ? mb.rarityNum : -1;
    if (na !== nb) return nb - na;
    const ia = baseRarityOrder.indexOf(a), ib = baseRarityOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, 'ja');
  });
}

// 3) isMiss
export function isMiss(gachaId, rarity){
  return (raritySvc.getMeta(gachaId, rarity)?.rarityNum|0) === 0;
}
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
    <div class="subcontrols" style="display:block;width:100%;margin:12px 0 0"></div>
    <div id="rarityTableWrap" class="rarity-wrap"></div>

    <div class="addRarityBtn" style="display:flex;gap:8px;align-items:center;margin:12px 0 0">
      <button id="addRarityRow" class="btn ghost">レアリティを追加</button>
    </div>
  `;

  const tabs = panel.querySelector('#rarityGachaTabs');
  const wrap = panel.querySelector('#rarityTableWrap');

  // ▼ 以降 “current” は gachaId を保持
  let current = null;

  // -- gachaId 一覧（AppState と RarityService の和集合）
  function listGachaIds(){
    const app = (window.Services && window.Services.app) || null;
    const idsFromApp = app?.listGachas?.({ sort:true }) || [];
    const idsFromRty = raritySvc.listGachas() || [];
    // 和集合で重複排除、表示は app 側の order を優先
    const set = new Set(idsFromApp);
    for (const id of idsFromRty) set.add(id);
    return Array.from(set);
  }
  // id→表示名
  function dispName(id){
    const app = (window.Services && window.Services.app) || null;
    return app?.getDisplayName?.(id) || id;
  }

  function renderTabs(){
    const ids = listGachaIds();

    // 1) LSの選択を優先（存在しているIDなら）
    const fromLS = loadSelectedFromLS();
    if (fromLS && ids.includes(fromLS)) current = fromLS;

    // 2) まだ決まっていなければ先頭
    if (current == null || !ids.includes(current)) current = ids[0] || null;

    // 3) レアリティセクション内だけで選択表現（aria-selected + active）
    const html = ids.map(id => {
      const label = escapeHtml(dispName(id));
      const isSel = (current === id);
      // ▼ 重要：CSSの赤ラインは .tab.active に依存 → active を付ける
      const cls   = `tab${isSel ? ' active' : ''}`;
      const aria  = isSel ? 'true' : 'false';
      return `<button type="button" class="${cls}" data-rarity-tab data-gacha-id="${id}" aria-selected="${aria}">${label}</button>`;
    }).join('');
    tabs.innerHTML = html;

    // 4) pt-controlsへ現在のgachaIdを連携
    try{
      if (window.PTControls?.attach) window.PTControls.attach(window.Services||{});
      if (window.PTControls?.renderPtControls) window.PTControls.renderPtControls(current);
    }catch(_){}

    // 5) 永続化（再描画のたびに確定値を保存しておく）
    saveSelectedToLS(current);
  }



  tabs.addEventListener('click', (e)=>{
    // レアリティセクション内のタブだけを対象にする
    const btn = e.target.closest('[data-rarity-tab]'); 
    if(!btn || !tabs.contains(btn)) return;

    const id = btn.getAttribute('data-gacha-id');
    if (!id || id === current) return;

    current = id;
    // 永続化
    saveSelectedToLS(current);

    // レアリティセクションだけを更新
    renderTabs();
    renderTable();

    // pt-controlsへも反映
    try{
      if (window.PTControls?.renderPtControls) window.PTControls.renderPtControls(current);
    }catch(_){}

    // 他UIが必要なら拾えるイベント
    try{
      document.dispatchEvent(new CustomEvent('rarity:tab:changed', { detail:{ gachaId: current }}));
    }catch(_){}
  });


  panel.querySelector('#addRarityRow').addEventListener('click', ()=>{
    if (!current) return;
    const MAX_TYPES = 20;
    const existingList = raritySvc.listRarities(current);
    if (existingList.length >= MAX_TYPES) {
      alert('レアリティの種類は最大20までです。これ以上は追加できません。');
      return;
    }
    // 「はずれ」を基点にユニーク名を採番
    const baseName = 'はずれ';
    const existing = new Set(existingList);
    let name = baseName, i = 2;
    while (existing.has(name)) { name = baseName + i; i++; }

    const baseMeta = baseRarityConfig['はずれ'] || {};
    raritySvc.upsert(current, name, { color: baseMeta.color || null, rarityNum: 0, emitRate: null });

    dispatchChanged?.();
    renderTable();

    // 追加直後に名前セルへフォーカス
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

  wrap.addEventListener('input', (e) => {
    const t  = e.target;
    const tr = t.closest('tr[data-rarity]');
    if (!tr) return;

    // 強さ：入力中の軽クランプのみ
    if (t.classList?.contains('rarity-num')) {
      const raw = String(t.value ?? '').trim();
      if (raw === '') return;
      let n = parseInt(raw, 10);
      if (Number.isNaN(n)) return;
      if (n > 20) { n = 20; t.value = '20'; }
      if (n < 0)  { n = 0;  t.value = '0'; }
      return;
    }

    // 排出率：入力中はフォーマットしない
    if (t.classList?.contains('rarity-rate')) {
      const rarity = tr.getAttribute('data-rarity');
      if (rarity === getBottomRarityName(current)) {
        const meta = raritySvc.getMeta(current, rarity) || {};
        const v = (typeof meta.emitRate === 'number' && !Number.isNaN(meta.emitRate))
          ? meta.emitRate : '';
        t.value = (v === '' ? '' : String(v).replace(/\.?0+$/, ''));
        return;
      }
      return;
    }
  });

  wrap.addEventListener('click', (e)=>{
    const inMore = e.target.closest('.more-wrap');
    if (!inMore) {
      wrap.querySelectorAll('.more-menu').forEach(m=>{
        m.style.display = 'none';
        const btn = m.parentElement?.querySelector('.more-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }
    const moreBtn = e.target.closest('.more-btn');
    if (moreBtn) {
      e.preventDefault();
      const holder = moreBtn.closest('.more-wrap');
      const menu   = holder?.querySelector('.more-menu');
      if (menu) {
        wrap.querySelectorAll('.more-menu').forEach(m=>{
          if (m !== menu) {
            m.style.display = 'none';
            const b = m.parentElement?.querySelector('.more-btn');
            if (b) b.setAttribute('aria-expanded', 'false');
          }
        });
        const willOpen = menu.style.display !== 'block';
        menu.style.display = willOpen ? 'block' : 'none';
        moreBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      }
      return;
    }

    const delBtn = e.target.closest('button.del');
    if (!delBtn) return;
    e.preventDefault();

    const tr = delBtn.closest('tr[data-rarity]');
    if (!tr || !current) return;

    const rarity = tr.getAttribute('data-rarity');
    raritySvc.deleteRarity(current, rarity);
    normalizeEmitViaService(current);

    dispatchChanged?.();
    renderTable();
  });

  wrap.addEventListener('change', (e)=>{
    const t = e.target;
    const tr = t.closest('tr[data-rarity]'); 
    if(!tr || !current) return;

    const rarity = tr.getAttribute('data-rarity');

    // 強さ(rarityNum)
    if (t.classList.contains('rarity-num')) {
      const raw = String(t.value ?? '').trim();
      let n = (raw === '') ? null : parseInt(raw, 10);
      if (n != null) {
        if (Number.isNaN(n)) n = null;
        else n = Math.min(20, Math.max(0, n|0));
      }
      if (n != null) {
        const dup = raritySvc.listRarities(current).some(r =>
          r !== rarity && (raritySvc.getMeta(current, r)?.rarityNum ?? null) === n
        );
        if (dup) {
          alert('強さ(rarityNum)が重複しています。別の値を指定してください。');
          t.value = t.dataset.prev ?? (raritySvc.getMeta(current, rarity)?.rarityNum ?? '');
          return;
        }
      }
      const meta = { ...(raritySvc.getMeta(current, rarity) || {}) , rarityNum: n };
      raritySvc.upsert(current, rarity, meta);

      normalizeEmitViaService(current);
      dispatchChanged?.();
      renderTable();
      return;
    }

    // 排出率(rarity-rate)
    if (t.classList.contains('rarity-rate')) {
      const bottom = getBottomRarityName(current);
      if (rarity === bottom) {
        const meta = raritySvc.getMeta(current, rarity) || {};
        t.value = (typeof meta.emitRate === 'number')
          ? String(meta.emitRate).replace(/\.?0+$/, '')
          : '';
        return;
      }
      const raw = String(t.value ?? '').trim();
      let num = null;
      if (raw !== '') {
        const f = parseFloat(raw);
        num = clampFloatN(f, 0, 100, PRECISION_DECIMALS);
        if (num === null) num = 0;
      }
      let sumOthers = 0;
      const names = raritySvc.listRarities(current);
      for (const r of names) {
        if (r === bottom) continue;
        if (r === rarity) continue;
        const v = raritySvc.getMeta(current, r)?.emitRate;
        if (typeof v === 'number' && !Number.isNaN(v)) sumOthers += v;
      }
      const wouldTotal = sumOthers + (typeof num === 'number' ? num : 0);
      if (wouldTotal > 100 + 1e-9) {
        alert('合計が100%を超えています。値を調整してください。');
        t.value = t.dataset.prev ?? (()=>{
          const old = raritySvc.getMeta(current, rarity)?.emitRate;
          return (typeof old === 'number') ? String(old).replace(/\.?0+$/, '') : '';
        })();
        return;
      }
      const currentMeta = raritySvc.getMeta(current, rarity) || {};
      raritySvc.upsert(current, rarity, { ...currentMeta, emitRate: num });

      if (typeof num === 'number') {
        const txt = num.toFixed(PRECISION_DECIMALS).replace(/\.?0+$/,'');
        if (txt !== raw) t.value = txt;
      } else {
        t.value = '';
      }

      normalizeEmitViaService(current);
      dispatchChanged?.();
      renderTable();
      return;
    }

    normalizeEmitViaService(current);
    dispatchChanged?.();
  });

  wrap.addEventListener('focusin', (e) => {
    const nameEl = e.target.closest('.rarity-name');
    if (nameEl) {
      nameEl.setAttribute('data-orig', (nameEl.textContent || '').trim());
      const r = document.createRange();
      r.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    }
    const t = e.target;
    const tr = t?.closest?.('tr[data-rarity]');
    if (!tr) return;
    if (t.classList?.contains('rarity-rate') || t.classList?.contains('rarity-num')) {
      t.dataset.prev = String(t.value ?? '');
    }
  });

  wrap.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t) return;
    if (e.key === 'Enter' &&
        (t.classList?.contains('rarity-num') ||
         t.classList?.contains('rarity-rate') ||
         t.classList?.contains('rarity-name'))) {
      e.preventDefault();
      e.stopPropagation();

      if (!isMobileLike()) {
        const tr = t.closest('tr[data-rarity]');
        const curRarity = tr?.getAttribute('data-rarity') || null;
        __pendingNextFocus = {
          kind: t.classList.contains('rarity-num') ? 'num'
              : t.classList.contains('rarity-rate') ? 'rate'
              : 'name',
          fromRarityName: curRarity
        };
      } else {
        __pendingNextFocus = null;
      }
      t.blur();
    }
    if (e.key === 'Escape' && t.classList?.contains('rarity-name')) {
      e.preventDefault();
      const orig = t.getAttribute('data-orig') || '';
      t.textContent = orig;
      t.blur();
    }
  });

  wrap.addEventListener('focusout', (e) => {
    const el = e.target.closest('.rarity-name'); if (!el) return;
    const tr = el.closest('tr[data-rarity]'); if (!tr) return;
    if (!current) return;

    const oldName = tr.getAttribute('data-rarity');
    const newName = (el.textContent || '').trim();
    if (!newName || newName === oldName) { el.textContent = oldName; return; }

    if (raritySvc.hasRarity(current, newName)) {
      alert('同名のレアリティがすでに存在します。別名を指定してください。');
      el.textContent = oldName; 
      return;
    }
    const ok = raritySvc.renameRarity(current, oldName, newName, { override:false });
    if (!ok) { el.textContent = oldName; return; }

    tr.setAttribute('data-rarity', newName);
    el.setAttribute('data-orig', newName);
    el.textContent = newName;

    normalizeEmitViaService(current);
    dispatchChanged?.();
    renderTable();
  });

  function renderTable(){
    const MAX_TYPES = 20;
    const MAX_NUM   = 20;

    renderTabs();

    if (current) {
      const seedCfg = raritySvc.listRarities(current);
      if (seedCfg.length === 0) {
        for (const r of baseRarityOrder) {
          const base = baseRarityConfig[r] || { color: null, rarityNum: 1, emitRate: null };
          raritySvc.upsert(current, r, structuredClone(base));
        }
        raritySvc.save();
      }
    }
    normalizeEmitViaService(current);

    const rarities = listRaritiesForGacha(current).slice(0, MAX_TYPES);

    function formatRate10(v){
      if (typeof v !== 'number' || Number.isNaN(v)) return '';
      return v.toFixed(10).replace(/\.?0+$/,'');
    }

    const rows = rarities.map(r => {
      const m = getRarityMeta(current, r) || {};
      const numRaw  = (typeof m.rarityNum === 'number') ? Math.min(m.rarityNum, MAX_NUM) : '';
      const rate    = (typeof m.emitRate === 'number') ? formatRate10(m.emitRate) : '';
      const num     = (numRaw === '' ? null : numRaw);

      const colorToken = (m.color === RAINBOW_VALUE) ? RAINBOW_VALUE : (sanitizeColor?.(m.color) || '#ffffff');

      const raritySpan = rarityNameSpanHTML(r, m.color, {
        attrs: { contenteditable: "true", spellcheck: "false", "data-orig": r }
      });
      const bottomName  = getBottomRarityName(current);
      const isAutoRow   = (r === bottomName);
      const rateDisabled = (isAutoRow || num === 0)
        ? 'disabled aria-disabled="true" title="自動欄: 合計100%に合わせて自動調整されます"'
        : '';
      return `
        <tr data-rarity="${escapeHtml(r)}">
          <th scope="row">${raritySpan}</th>
          <td><div class="cp-host" data-value="${colorToken}" aria-label="色"></div></td>
          <td><input type="number" class="rarity-num" inputmode="numeric" min="0" max="${MAX_NUM}" step="1" value="${escapeHtml(numRaw)}" aria-label="強さ"></td>
          <td class="emit-cell"><input type="number" class="rarity-rate" inputmode="decimal" min="0" max="100" step="0.0000000001" ${rateDisabled} value="${escapeHtml(rate)}" aria-label="排出率"><span class="unit">%</span></td>
          <td class="ops"><button class="btn subtle danger del" title="このレアリティ設定を削除">削除</button></td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table class="table rarity-table">
        <thead><tr><th>レアリティ</th><th>色</th><th>強さ</th><th>排出率</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    const isMobileView = document.getElementById('mainUI')?.classList.contains('mobile-views') === true;

    if (isMobileView) {
      const hdr = wrap.querySelector('thead th:nth-child(4)');
      if (hdr) hdr.textContent = '排出率(%)';
      wrap.querySelectorAll('td.emit-cell .unit').forEach(u => { u.style.display = 'none'; });
      wrap.querySelectorAll('td.ops').forEach(td => {
        const delBtn = td.querySelector('button.del');
        if (!delBtn) return;
        td.innerHTML = `
          <div class="more-wrap" style="position:relative; display:inline-block">
            <button type="button" class="icon-btn more-btn"
                    aria-haspopup="true" aria-expanded="false" title="操作メニュー"
                    style="width:18px; min-width:18px; height:28px; display:inline-flex; align-items:center; justify-content:center; padding:0;">
              ⋮
            </button>
            <div class="more-menu" role="menu"
                style="display:none; position:absolute;
                        right: calc(100% + 8px);
                        top: 50%; transform: translateY(-50%);
                        background:var(--panel-2); border:1px solid var(--border);
                        border-radius:10px; padding:0; min-width:120px; z-index:5;
                        box-shadow: 0 6px 24px rgba(0,0,0,.25);">
              <button type="button" class="btn small ghost menu-del del" role="menuitem"
                      style="display:block; width:100%; padding:10px 14px; text-align:center; border-radius:10px;">
                削除
              </button>
            </div>
          </div>
        `;
      });
    }

    // カラーピッカー装着
    wrap.querySelectorAll('.cp-host').forEach(el => {
      const tr = el.closest('tr[data-rarity]'); if(!tr) return;
      const rarity  = tr.getAttribute('data-rarity');
      const initial = el.getAttribute('data-value') || '#ffffff';

      mountColorPicker(el, {
        value: initial,
        onChange: (v) => {
          const cur = raritySvc.getMeta(current, rarity) || { color: null, rarityNum: 1, emitRate: null };
          const next = { ...cur, color: (v === RAINBOW_VALUE) ? RAINBOW_VALUE : (v || null) };

          raritySvc.upsert(current, rarity, next);
          const span = tr.querySelector('.rarity');
          applyRarityColor(span, v);
          dispatchChanged?.();
        }
      });
    });

    try{
      if (__pendingNextFocus && !isMobileLike()) {
        const kind   = __pendingNextFocus.kind;
        const from   = __pendingNextFocus.fromRarityName;
        __pendingNextFocus = null;

        const order = rarities;
        const start = Math.max(0, order.indexOf(from));
        for (let i = start + 1; i < order.length; i++) {
          const r  = order[i];
          const tr = wrap.querySelector(`tr[data-rarity="${CSS.escape(r)}"]`);
          let sel  = null;

          if (kind === 'rate') {
            sel = tr?.querySelector('.rarity-rate');
            if (sel && sel.disabled) { sel = null; }
          } else if (kind === 'num') {
            sel = tr?.querySelector('.rarity-num');
            if (sel && sel.disabled) { sel = null; }
          } else {
            sel = tr?.querySelector('.rarity-name') || null;
          }
          if (sel) {
            sel.focus?.();
            if (typeof sel.select === 'function') sel.select();
            if (kind === 'name' && sel !== null) {
              const range = document.createRange();
              range.selectNodeContents(sel);
              const s = window.getSelection();
              s.removeAllRanges(); s.addRange(range);
            }
            break;
          }
        }
      }
    } catch (_){}

    function ensureAutoEmitViaService(gachaId){
      normalizeEmitViaService(gachaId);
    }
  }
  // 手動再描画API：JSON/TXT取込直後など、いつでも呼べる
  window.refreshRarityUI = function refreshRarityUI(nextGachaId){
    try { raritySvc.load?.(); } catch(_){}

    // nextGachaId が来ていればそれを優先
    if (nextGachaId) {
      current = nextGachaId;
      saveSelectedToLS(current);
    } else {
      // 無ければ LS を参照（妥当性チェック付き）
      const ids = listGachaIds();
      const fromLS = loadSelectedFromLS();
      if (fromLS && ids.includes(fromLS)) current = fromLS;
      else if (!current || !ids.includes(current)) current = ids[0] || null;
    }

    renderTabs();
    renderTable();
  };

  const kickoff = ()=>{
    const ids = listGachaIds();

    // 1) AppState の選択を最優先
    let sel = null;
    try{ sel = window.Services?.app?.getSelectedGacha?.() || null; }catch(_){}
    if (sel && ids.includes(sel)) {
      current = sel;
    } else {
      // 2) 次に LS の選択
      const fromLS = loadSelectedFromLS();
      if (fromLS && ids.includes(fromLS)) current = fromLS;
      // 3) まだ無ければ先頭
      if (!current || !ids.includes(current)) current = ids[0] || null;
    }

    // 4) 確定した選択を保存
    saveSelectedToLS(current);

    renderTable();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=> requestAnimationFrame(kickoff), { once:true });
  } else {
    requestAnimationFrame(kickoff);
  }

  try{
    if (window.PTControls?.attach) window.PTControls.attach(window.Services||{});
    if (window.PTControls?.renderPtControls) window.PTControls.renderPtControls(current);
  }catch(_){}

  document.addEventListener('state:changed', ()=>{
    const ae = document.activeElement;
    if (ae && wrap.contains(ae)) return;

    const ids = listGachaIds();

    // AppState or LS から現在値を補正
    try{
      const sel = window.Services?.app?.getSelectedGacha?.();
      if (sel && ids.includes(sel)) current = sel;
    }catch(_){}

    if (!current || !ids.includes(current)) {
      const fromLS = loadSelectedFromLS();
      if (fromLS && ids.includes(fromLS)) current = fromLS;
      else current = ids[0] || null;
    }

    saveSelectedToLS(current);
    renderTable();
  });
  // JSON/TXT取込側が発火する“共通トリガ”に追従
  document.addEventListener('gacha:data:updated', () => {
    try { raritySvc.load?.(); } catch(_){}
    window.refreshRarityUI?.();
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
  // どこからでも受けられる汎用イベントに簡素化（未定義参照を排除）
  try { document.dispatchEvent(new Event('rarityconfig:changed')); } catch(_){}
  try { document.dispatchEvent(new Event('state:changed')); } catch(_){}
}