// /src/rarity.js  —— 完全置き換え版 ——
// ガチャ別レアリティ設定（色/強さ/排出率）＋UI（タブ/テーブル/追加モーダル/削除確認）
// 依存：AppStateBridge（あれば使う）、無ければ window.* を読む。存在しなければ空で動く。
export const BASE_KEY = "__BASE__";
export const baseRarityOrder = ["UR","SSR","SR","R","N","はずれ"];
import { mountColorPicker, RAINBOW_VALUE, GOLD_HEX, SILVER_HEX } from "/src/color_picker.js";
import { ensureAutoEmitRatesForGacha, normalizeEmitRatesForGacha, clampFloatN, PRECISION_DECIMALS } from "/src/rarity_emit_calc.js";
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

// LSキーは既存の窓口を尊重
const raritySvc = new RarityService((typeof window !== 'undefined' && window.LS_KEY_RARITY) || 'gacha_rarity_config_v1');
raritySvc.load();

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
function normalizeEmitViaService(gacha){
  const shim = { [gacha]: {} };
  for (const r of raritySvc.listRarities(gacha)) {
    // getMeta は参照返し：正規化側の in-place 書換がサービス内 flat に反映される
    shim[gacha][r] = raritySvc.getMeta(gacha, r);
  }
  try { normalizeEmitRatesForGacha(shim, gacha); } catch(_){}
  raritySvc.save(); // 変更の保存
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

    // “0.” や “0.000001” の途中状態を壊さないため、ここでは保存しない
    // 1) 強さ：0〜20 の範囲で入力値だけ整える
    if (t.classList?.contains('rarity-num')) {
      const raw = String(t.value ?? '').trim();
      if (raw === '') return;
      let n = parseInt(raw, 10);
      if (Number.isNaN(n)) return;
      if (n > 20) { n = 20; t.value = '20'; }
      if (n < 0)  { n = 0;  t.value = '0'; }
      return;
    }

    // 2) 排出率：0〜100 にクランプし、最大10桁に丸めてフィールドへ反映
    if (t.classList?.contains('rarity-rate')) {
      const raw = String(t.value ?? '').trim();
      if (raw === '') return;
      let num = parseFloat(raw);
      if (Number.isNaN(num)) num = 0;
      if (num < 0) num = 0;
      if (num > 100) num = 100;
      const f = 1e10; // 10桁丸め
      num = Math.round((num + Number.EPSILON) * f) / f;
      const txt = num.toFixed(10).replace(/\.?0+$/, '');
      if (txt !== raw) t.value = txt;
      return;
    }

    // 3) それ以外（名称編集など）はここでは何もしない
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

    // 1) 強さ(rarityNum)
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
          // UIを元に戻す（保存しない）
          const old = raritySvc.getMeta(current, rarity)?.rarityNum ?? null;
          t.value = (old == null ? '' : String(old));
          return;
        }
      }

      // 採用＆保存
      const meta = { ...(raritySvc.getMeta(current, rarity) || {}) , rarityNum: n };
      raritySvc.upsert(current, rarity, meta);

      // 単調性・合計100%を再調整
      normalizeEmitViaService(current);

      dispatchChanged?.();
      renderTable();
      return;
    }

    // 2) 排出率(rarity-rate)
    if (t.classList.contains('rarity-rate')) {
      const raw = String(t.value ?? '').trim();
      let num = null;
      if (raw !== '') {
        const f = parseFloat(raw);
        num = clampFloatN(f, 0, 100, PRECISION_DECIMALS);
        if (num === null) num = 0; // NaN防御
      }

      // 強さ=0は編集不可（ガード）
      const currentMeta = raritySvc.getMeta(current, rarity) || {};
      if ((currentMeta.rarityNum|0) === 0) { t.value = ''; return; }

      raritySvc.upsert(current, rarity, { ...currentMeta, emitRate: num });

      // 表示は正規形へ（指数回避＆末尾0削除）
      if (typeof num === 'number') {
        const txt = num.toFixed(PRECISION_DECIMALS).replace(/\.?0+$/,'');
        if (txt !== raw) t.value = txt;
      } else {
        t.value = '';
      }

      // 単調性・合計100%を再調整
      normalizeEmitViaService(current);

      dispatchChanged?.();
      renderTable();
      return;
    }

    // 3) その他（ここでは特に保存しないが、帳尻合わせだけは実施）
    normalizeEmitViaService(current);
    dispatchChanged?.();
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
    ensureAutoEmitRatesForGacha?.({ [current]: raritySvc.getGacha(current) }, current);

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

      const isRainbow = (m.color === RAINBOW_VALUE);
      const isGold    = (m.color === GOLD_HEX);
      const isSilver  = (m.color === SILVER_HEX);
      const isMetal   = isGold || isSilver;

      const styleAttr = (isRainbow || isMetal) ? '' : ` style="color:${m.color||''}"`;
      const extraCls  = `rarity${isRainbow?' rainbow':''}${isGold?' metal-gold':''}${isSilver?' metal-silver':''} rarity-name`;

      const raritySpan =
        `<span class="${extraCls}" contenteditable="true" spellcheck="false" data-orig="${escapeHtml(r)}"${styleAttr}>${escapeHtml(r)}</span>`;

      const rateDisabled = (num === 0) ? 'disabled aria-disabled="true" title="強さ=0は排出率を編集できません"' : '';

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
          const isGold    = (v === GOLD_HEX);
          const isSilver  = (v === SILVER_HEX);
          const isRainbow = (v === RAINBOW_VALUE);

          span.classList.toggle('rainbow',     isRainbow);
          span.classList.toggle('metal-gold',  isGold);
          span.classList.toggle('metal-silver',isSilver);
          span.style.color = (isRainbow || isGold || isSilver) ? '' : (v || '');

          dispatchChanged?.();
        }
      });
    });

    // ------- 内部補助：この関数内だけで使う normalize/ensure ラッパ -------

    function ensureAutoEmitViaService(gacha){
      const nested = { [gacha]: {} };
      for (const r of raritySvc.listRarities(gacha)) {
        nested[gacha][r] = raritySvc.getMeta(gacha, r); // 参照（in-place 書換を反映）
      }
      if (typeof ensureAutoEmitRatesForGacha === 'function') {
        ensureAutoEmitRatesForGacha(nested, gacha);
      } else if (typeof normalizeEmitRatesForGacha === 'function') {
        normalizeEmitRatesForGacha(nested, gacha);
      }
      raritySvc.save(); // in-place 変更を保存
    }
  }

  function normalizeEmitViaService(gacha){
    const nested = { [gacha]: {} };
    for (const r of raritySvc.listRarities(gacha)) {
      nested[gacha][r] = raritySvc.getMeta(gacha, r); // 参照（in-place 書換を反映）
    }
    if (typeof normalizeEmitRatesForGacha === 'function') {
      normalizeEmitRatesForGacha(nested, gacha);
    } else if (typeof ensureAutoEmitRatesForGacha === 'function') {
      ensureAutoEmitRatesForGacha(nested, gacha);
    }
    raritySvc.save();
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