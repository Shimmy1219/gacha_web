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
  const key = (_W && _W.LS_KEY_RARITY) || 'gacha_rarity_config_v1';
  const svc = new RarityService(key);
  svc.load();
  // 共有レジストリがなければ作る
  _W.Services = _W.Services || {};
  // 一貫したキー名で載せる
  _W.Services.rarity = svc;
  return svc;
})();

// 補助：並び順（強さ desc → 既定順 → 名前）
function sortRarityNamesSvc(gacha, names){
  const baseOrder = Array.isArray(baseRarityOrder) ? baseRarityOrder : [];
  return [...names].sort((a,b)=>{
    const ma = raritySvc.getMeta(gacha, a) || {};
    const mb = raritySvc.getMeta(gacha, b) || {};
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
function normalizeEmitViaService(gacha){
  if (!gacha) return;

  const bottom = getBottomRarityName(gacha);
  if (!bottom) return;

  // 他行の合計を出す（数値のものだけ足す）
  let sumOthers = 0;
  const names = raritySvc.listRarities(gacha);
  for (const r of names){
    if (r === bottom) continue;
    const v = raritySvc.getMeta(gacha, r)?.emitRate;
    if (typeof v === 'number' && !Number.isNaN(v)) sumOthers += v;
  }

  // 最下位だけ自動で残差を割り当て（0〜100にクランプ）
  let rest = 100 - sumOthers;
  rest = clampFloatN(typeof rest === 'number' ? rest : 0, 0, 100, PRECISION_DECIMALS);

  const meta = raritySvc.getMeta(gacha, bottom) || {};
  if (meta.emitRate !== rest){
    raritySvc.upsert(gacha, bottom, { ...meta, emitRate: rest });
  }
  raritySvc.save();
}

export function saveRarityConfig(obj = rarityFlat){
  raritySvc.save();
}

function getFlatKey(gacha, rarity){ return `${gacha}::${rarity}`; }

export function getRarityMeta(gacha, rarity){
  return raritySvc.getMeta(gacha, rarity);
}

export function setRarityMeta(gacha, rarity, meta){
  raritySvc.upsert(gacha, rarity, {
    color:     meta?.color ?? null,
    rarityNum: (typeof meta?.rarityNum === "number" ? meta.rarityNum : (meta?.rarityNum == null ? null : (meta.rarityNum|0))),
    emitRate:  (typeof meta?.emitRate === "number" ? meta.emitRate : null),
  });
}
function getBottomRarityName(gacha){
  const sorted = listRaritiesForGacha(gacha); // UI並びと同じ：強さ降順→末尾が最下位
  return sorted.length ? sorted[sorted.length - 1] : null;
}
export function deleteRarityMeta(gacha, rarity){
  raritySvc.deleteRarity(gacha, rarity);
}

export function listRaritiesForGacha(gacha){
  const names = raritySvc.listRarities(gacha);
  return sortRarityNamesSvc(gacha, names);
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
export function isMiss(gacha, rarity){
  return (raritySvc.getMeta(gacha, rarity)?.rarityNum|0) === 0;
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
      ...raritySvc.listGachas(), // ← 追加：サービスに保持されているガチャ名も含める
    ]);
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'ja'));
  }

  function renderTabs(){
    const names = gachaNames();
    if (current == null) current = names[0] || null; // ← 最初の1件を既定選択
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
    if (!current) return;
    const MAX_TYPES = 20;

    const existingList = raritySvc.listRarities(current);
    if (existingList.length >= MAX_TYPES) {
      alert('レアリティの種類は最大20までです。これ以上は追加できません。');
      return;
    }

    // 「はずれ」をベースにユニーク名を採番
    const baseName = 'はずれ';
    const existing = new Set(existingList);
    let name = baseName, i = 2;
    while (existing.has(name)) { name = baseName + i; i++; }

    const baseMeta = baseRarityConfig['はずれ'] || {};
    raritySvc.upsert(current, name, { color: baseMeta.color || null, rarityNum: 0, emitRate: null });

    dispatchChanged?.();
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


  wrap.addEventListener('input', (e) => {
    const t  = e.target;
    const tr = t.closest('tr[data-rarity]');
    if (!tr) return;

    // 1) 強さ：入力中だけ軽いクランプ（従来どおり）
    if (t.classList?.contains('rarity-num')) {
      const raw = String(t.value ?? '').trim();
      if (raw === '') return;
      let n = parseInt(raw, 10);
      if (Number.isNaN(n)) return;
      if (n > 20) { n = 20; t.value = '20'; }
      if (n < 0)  { n = 0;  t.value = '0'; }
      return;
    }

    // 2) 排出率：入力中は一切フォーマットしない（"0.", "0.0001" などの途中状態を保持）
    if (t.classList?.contains('rarity-rate')) {
      const rarity = tr.getAttribute('data-rarity');

      // 最下位(自動欄)は編集不可 → 現在値に即戻す（見た目だけ）
      if (rarity === getBottomRarityName(current)) {
        const meta = raritySvc.getMeta(current, rarity) || {};
        const v = (typeof meta.emitRate === 'number' && !Number.isNaN(meta.emitRate))
          ? meta.emitRate : '';
        t.value = (v === '' ? '' : String(v).replace(/\.?0+$/, ''));
        return;
      }

      // ← ここでは何もしない：
      //    ・parseFloatしない
      //    ・toFixedしない
      //    ・0〜100クランプもしない
      //    （確定は change/keydown(Enter→blur) 側で検証・保存）
      return;
    }
  });

  wrap.addEventListener('click', (e)=>{
    // “⋮”メニュー以外をクリック → 全メニューを閉じる
    const inMore = e.target.closest('.more-wrap');
    if (!inMore) {
      wrap.querySelectorAll('.more-menu').forEach(m=>{
        m.style.display = 'none';
        const btn = m.parentElement?.querySelector('.more-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }

    // “⋮”トグル
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

    // 削除（PC直ボタン/モバイルメニュー共通）
    const delBtn = e.target.closest('button.del');
    if (!delBtn) return;

    e.preventDefault();

    const tr = delBtn.closest('tr[data-rarity]');
    if (!tr || !current) return;

    const rarity = tr.getAttribute('data-rarity');

    // 物理削除（強さ=0でも可）
    raritySvc.deleteRarity(current, rarity);

    // 削除後に排出率を再計算（合計100%・単調性）
    normalizeEmitViaService(current);

    dispatchChanged?.();
    renderTable();
  });
  
  // 変更確定（blur や Enter 後）に一度だけ通知して他UIを更新
  // 変更確定（blur/Enter）時にのみ保存・正規化・重複検査を実施
  wrap.addEventListener('change', (e)=>{
    const t = e.target;
    const tr = t.closest('tr[data-rarity]'); 
    if(!tr || !current) return;

    const rarity = tr.getAttribute('data-rarity');

    // --- 強さ(rarityNum) 確定 ---
    if (t.classList.contains('rarity-num')) {
      const raw = String(t.value ?? '').trim();
      let n = (raw === '') ? null : parseInt(raw, 10);
      if (n != null) {
        if (Number.isNaN(n)) n = null;
        else n = Math.min(20, Math.max(0, n|0));
      }

      // 重複チェック（nullは対象外）
      if (n != null) {
        const dup = raritySvc.listRarities(current).some(r =>
          r !== rarity && (raritySvc.getMeta(current, r)?.rarityNum ?? null) === n
        );
        if (dup) {
          alert('強さ(rarityNum)が重複しています。別の値を指定してください。');
          // ロールバック
          t.value = t.dataset.prev ?? (raritySvc.getMeta(current, rarity)?.rarityNum ?? '');
          return;
        }
      }

      // 保存
      const meta = { ...(raritySvc.getMeta(current, rarity) || {}) , rarityNum: n };
      raritySvc.upsert(current, rarity, meta);

      // 合計100%維持（最下位だけ自動）
      normalizeEmitViaService(current);
      dispatchChanged?.();
      renderTable();
      return;
    }

    // --- 排出率(rarity-rate) 確定 ---
    if (t.classList.contains('rarity-rate')) {
      const bottom = getBottomRarityName(current);
      if (rarity === bottom) {
        // 自動欄は編集不可：即ロールバック
        const meta = raritySvc.getMeta(current, rarity) || {};
        t.value = (typeof meta.emitRate === 'number')
          ? String(meta.emitRate).replace(/\.?0+$/, '')
          : '';
        return;
      }

      // 入力値 → 数値化
      const raw = String(t.value ?? '').trim();
      let num = null;
      if (raw !== '') {
        const f = parseFloat(raw);
        num = clampFloatN(f, 0, 100, PRECISION_DECIMALS);
        if (num === null) num = 0; // NaN防御
      }

      // ここで“合計>100%”を先に検証
      let sumOthers = 0;
      const names = raritySvc.listRarities(current);
      for (const r of names) {
        if (r === bottom) continue;
        if (r === rarity) continue; // 今回の新値は後で足す
        const v = raritySvc.getMeta(current, r)?.emitRate;
        if (typeof v === 'number' && !Number.isNaN(v)) sumOthers += v;
      }
      const wouldTotal = sumOthers + (typeof num === 'number' ? num : 0);
      if (wouldTotal > 100 + 1e-9) { // 微小誤差許容
        alert('合計が100%を超えています。値を調整してください。');
        // ロールバック
        t.value = t.dataset.prev ?? (()=>{
          const old = raritySvc.getMeta(current, rarity)?.emitRate;
          return (typeof old === 'number') ? String(old).replace(/\.?0+$/, '') : '';
        })();
        return;
      }

      // 保存
      const currentMeta = raritySvc.getMeta(current, rarity) || {};
      raritySvc.upsert(current, rarity, { ...currentMeta, emitRate: num });

      // 表示は正規形へ
      if (typeof num === 'number') {
        const txt = num.toFixed(PRECISION_DECIMALS).replace(/\.?0+$/,'');
        if (txt !== raw) t.value = txt;
      } else {
        t.value = '';
      }

      // 合計100%のために最下位だけ再調整（合計=100なら bottom は0%になる）
      normalizeEmitViaService(current);
      dispatchChanged?.();
      renderTable();

      return;
    }

    // 3) その他（帳尻合わせのみ）
    normalizeEmitViaService(current);
    dispatchChanged?.();
  });


  // 名称編集: フォーカスで元名を保持 & 全選択
  wrap.addEventListener('focusin', (e) => {
    // 既存：rarity-name の全選択ロジックはそのまま残す
    const nameEl = e.target.closest('.rarity-name');
    if (nameEl) {
      nameEl.setAttribute('data-orig', (nameEl.textContent || '').trim());
      const r = document.createRange();
      r.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    }

    // ★ 追加：排出率/強さの直前値を data-prev に記録
    const t = e.target;
    const tr = t?.closest?.('tr[data-rarity]');
    if (!tr) return;

    if (t.classList?.contains('rarity-rate') || t.classList?.contains('rarity-num')) {
      t.dataset.prev = String(t.value ?? '');
    }
  });


  // 名称編集: Enterで確定、Escで取り消し
  wrap.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t) return;

    // Enter 確定：name/num/rate 全て共通で blur → change を発火
    if (e.key === 'Enter' &&
        (t.classList?.contains('rarity-num') ||
        t.classList?.contains('rarity-rate') ||
        t.classList?.contains('rarity-name'))) {
      e.preventDefault();
      e.stopPropagation();

      // PCのみ「次の行の同じ列」にフォーカス移動を予約
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

      t.blur(); // ← これで change → renderTable の順に進む
    }

    // Esc は既存の名称編集キャンセルを維持
    if (e.key === 'Escape' && t.classList?.contains('rarity-name')) {
      e.preventDefault();
      const orig = t.getAttribute('data-orig') || '';
      t.textContent = orig;
      t.blur();
    }
  });

  // 名称編集: フォーカスが外れたタイミングでリネームを確定
  // 名称編集（blur確定）
  wrap.addEventListener('focusout', (e) => {
    const el = e.target.closest('.rarity-name'); if (!el) return;
    const tr = el.closest('tr[data-rarity]'); if (!tr) return;
    if (!current) return;

    const oldName = tr.getAttribute('data-rarity');
    const newName = (el.textContent || '').trim();
    if (!newName || newName === oldName) { el.textContent = oldName; return; }

    // 同名チェック
    if (raritySvc.hasRarity(current, newName)) {
      alert('同名のレアリティがすでに存在します。別名を指定してください。');
      el.textContent = oldName; 
      return;
    }

    // 改名（metaはそのまま移動）
    const ok = raritySvc.renameRarity(current, oldName, newName, { override:false });
    if (!ok) { el.textContent = oldName; return; }

    tr.setAttribute('data-rarity', newName);
    el.setAttribute('data-orig', newName);
    el.textContent = newName;

    // 合計/単調性の再調整
    normalizeEmitViaService(current);

    dispatchChanged?.();
    renderTable();
  });


  function renderTable(){
    const MAX_TYPES = 20;
    const MAX_NUM   = 20;

    renderTabs(); // タブ表示（アクティブ反映）

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
    // emit の自動補完（未設定のみ）※既存ロジックを尊重
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

    // ★ ここを修正：モバイル表示かどうかは #mainUI のクラスだけで判定
    const isMobileView = document.getElementById('mainUI')?.classList.contains('mobile-views') === true;

    if (isMobileView) {
      // 1) ヘッダー「排出率」→「排出率(%)」
      const hdr = wrap.querySelector('thead th:nth-child(4)');
      if (hdr) hdr.textContent = '排出率(%)';

      // 1) セル内の “%” は非表示
      wrap.querySelectorAll('td.emit-cell .unit').forEach(u => { u.style.display = 'none'; });

      // 2) 右端の「削除」を “⋮” メニューに差し替え
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

    // カラーピッカー装着（サービスに保存）
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
        const kind   = __pendingNextFocus.kind;           // 'rate' | 'num' | 'name'
        const from   = __pendingNextFocus.fromRarityName; // いま確定した行のレア名
        __pendingNextFocus = null;

        // いま描画に使った“並び順（UI順）”を使って、次の有効セルを探す
        const order = rarities; // renderTable() 内で作った配列
        const start = Math.max(0, order.indexOf(from));
        for (let i = start + 1; i < order.length; i++) {
          const r  = order[i];
          const tr = wrap.querySelector(`tr[data-rarity="${CSS.escape(r)}"]`);
          let sel  = null;

          if (kind === 'rate') {
            sel = tr?.querySelector('.rarity-rate');
            // disabled（自動行/強さ0）はスキップ
            if (sel && sel.disabled) { sel = null; }
          } else if (kind === 'num') {
            sel = tr?.querySelector('.rarity-num');
            if (sel && sel.disabled) { sel = null; }
          } else {
            // name（contenteditable）
            sel = tr?.querySelector('.rarity-name') || null;
          }

          if (sel) {
            sel.focus?.();
            // number input は select しておくと連続入力がラク
            if (typeof sel.select === 'function') sel.select();
            // contenteditableはテキスト全選択
            if (kind === 'name' && sel !== null) {
              const range = document.createRange();
              range.selectNodeContents(sel);
              const s = window.getSelection();
              s.removeAllRanges(); s.addRange(range);
            }
            break; // 決まったら終了
          }
          // 見つからなければ次の行へ（= disabled 行は飛ばす）
        }
      }
    } catch (_){}

    // ------- 内部補助：この関数内だけで使う normalize/ensure ラッパ -------

    // 旧: ensureAutoEmitViaService(gacha) も同方針へ
    function ensureAutoEmitViaService(gacha){
      normalizeEmitViaService(gacha);
    }
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

    const names = gachaNames();
    if (!names.includes(current)) current = names[0] || null;

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