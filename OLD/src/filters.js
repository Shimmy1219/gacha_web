// /src/filters.js
// 目的: ガチャ／レア度フィルタの UI ロジックをモジュール化。
// - createMultiSelectFilter() を使って GachaFilter / RarityFilter を生成
// - openFloatingPopover() は共通ヘルパとして公開
// - 既存互換: window に GachaFilter/RarityFilter と getSelected* をエクスポート

/** body 直下へポップオーバーを移して、ボタンに追従させる */
export function openFloatingPopover(wrapEl, btnEl, popEl) {
  if (!wrapEl || !btnEl || !popEl) return () => {};
  document.body.appendChild(popEl);
  popEl.classList.add('floating');
  popEl.style.visibility = 'hidden';
  popEl.style.display = 'block';

  function place() {
    const r = btnEl.getBoundingClientRect();
    const margin = 8;
    // 横幅はボタン以上
    popEl.style.minWidth = Math.max(r.width, 160) + 'px';
    // 一旦配置して高さ計測
    popEl.style.left = Math.round(r.left) + 'px';
    popEl.style.top  = Math.round(r.bottom + margin) + 'px';
    const ph = popEl.offsetHeight;

    // 下に入らなければ上に
    let top = r.bottom + margin;
    if (top + ph > window.innerHeight) {
      top = Math.max(8, r.top - ph - margin);
    }
    // 右端はみ出し補正
    let left = r.left;
    const pw = popEl.offsetWidth;
    if (left + pw > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - pw - 8);
    }
    popEl.style.left = Math.round(left) + 'px';
    popEl.style.top  = Math.round(top) + 'px';
  }
  place();
  popEl.style.visibility = '';

  const onMove = () => place();
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);

  const onKey = (e)=>{ if (e.key === 'Escape') cleanup(); };
  window.addEventListener('keydown', onKey);

  const onClickAway = (e)=>{
    if (!popEl.contains(e.target) && !btnEl.contains(e.target)) cleanup();
  };
  // クリック外しで閉じる（キャプチャで先に拾う）
  window.addEventListener('pointerdown', onClickAway, true);

  function cleanup(){
    try {
      // 元のラッパに戻す（display/visibility は呼び出し側で制御）
      wrapEl.appendChild(popEl);
      popEl.classList.remove('floating');
      popEl.style.display = 'none';
      popEl.style.visibility = '';
    } catch {}
    window.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onClickAway, true);
  }
  return cleanup;
}

/** ガチャ/レア度共通のマルチセレクト・フィルタを生成
 *  文字列候補に加え、{ value, label, attrs } 形式も受け付ける。
 *  - Rarity: 文字列のまま（value=label）
 *  - Gacha : value=gachaId, label=displayName, attrs: {'data-gacha-id': gachaId}
 */
function createMultiSelectFilter({ wrapId, buttonId, popoverId, autoCloseMs = 1800 }) {
  let wrap, btn, pop;
  /** @type {{value:string,label:string,attrs?:Record<string,string>}[]} */
  let options = [];
  /** '*' or Set<value> */
  let selected = '*';
  let autoCloseTimer = null;
  let detachFloating = null;
  let onChange = null;
  /** value -> label の逆引き */
  let labelMap = new Map();

  function $id(id){ return document.getElementById(id); }

  function norm(o){
    if (o == null) return null;
    if (typeof o === 'string') return { value:o, label:o, attrs:{} };
    const v = String(o.value ?? o.id ?? '');
    const L = String(o.label ?? v);
    const attrs = o.attrs && typeof o.attrs === 'object' ? { ...o.attrs } : {};
    if (!v) return null;
    return { value:v, label:L, attrs };
  }

  function setOptions(list){
    const next = [];
    labelMap = new Map();
    for (const raw of (list || [])){
      const it = norm(raw);
      if (!it) continue;
      if (labelMap.has(it.value)) continue; // 重複排除 by value
      next.push(it);
      labelMap.set(it.value, it.label);
    }
    options = next;

    // 選択セットに存在しない値があればクリーンアップ
    if (selected !== '*') {
      const keep = new Set(Array.from(selected).filter(v => labelMap.has(v)));
      selected = keep.size === 0 ? '*' : keep;
    }
    updateButtonLabel();

    // まだヘッダ（「すべて」）が無い段階では描画しない（重複防止）
    if (pop && pop.querySelector('.gf-all')) renderItems();
  }

  function getSelection(){ return selected === '*' ? '*' : new Set(selected); }

  function setSelection(v){
    selected = (v === '*') ? '*' : new Set(v);
    updateButtonLabel();
    renderItems();
    notify();
  }

  function notify(){ if (typeof onChange === 'function') onChange(getSelection()); }

  function updateButtonLabel(){
    if (!btn) return;
    if (selected === '*'){ btn.textContent = 'すべて'; return; }
    const n = selected.size;
    if (n === 1){
      const only = Array.from(selected)[0];
      btn.textContent = labelMap.get(only) ?? only;
    } else {
      btn.textContent = `${n}項目`;
    }
  }

  function renderItems(){
    if (!pop) return;
    // 先頭の「すべて」行と区切りを残して全削除
    while (pop.children.length > 2) pop.removeChild(pop.lastChild);

    const allValues = options.map(o => o.value);
    const selSet = (selected === '*') ? new Set(allValues) : new Set(selected);

    options.forEach(({ value, label, attrs }) => {
      const row = document.createElement('div');
      row.className = 'gf-item';
      row.setAttribute('role','option');
      row.setAttribute('aria-selected', selSet.has(value) ? 'true' : 'false');
      // 任意の属性（例: data-gacha-id）を付与
      if (attrs) for (const [k,v] of Object.entries(attrs)) row.setAttribute(k, String(v));
      row.innerHTML = `<span class="gf-check">${selSet.has(value) ? '✓' : ''}</span><span class="gf-name" title="${label}">${label}</span>`;
      row.addEventListener('click', () => {
        let s = (selected === '*') ? new Set(allValues) : new Set(selected);
        if (s.has(value)) s.delete(value); else s.add(value);
        selected = (s.size === 0) ? '*' : s;
        updateButtonLabel();
        renderItems();
        notify();
        bumpAutoClose();
      });
      pop.appendChild(row);
    });
  }

  function buildOnce(){
    // 1) 「すべて」トグル
    const all = document.createElement('div');
    all.className = 'gf-item gf-all';
    all.innerHTML = `<span class="gf-check">${selected==='*'?'✓':''}</span><span class="gf-name">すべて</span>`;
    all.addEventListener('click', () => {
      if (selected === '*') {
        selected = new Set();         // いったん空に
        updateButtonLabel();
        renderItems();                // その後に全解除
      } else {
        selected = '*';               // 全選択
      }
      updateButtonLabel();
      renderItems();
      notify();
      bumpAutoClose();
    });
    pop.appendChild(all);

    // 2) 仕切り
    const hr = document.createElement('div');
    hr.style.height = '1px';
    hr.style.background = 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)';
    hr.style.margin = '6px 4px';
    pop.appendChild(hr);

    // 3) 項目群
    renderItems();
  }

  function open(){
    if (!wrap || !btn || !pop) return;
    // ヘッダ未構築なら一度クリアしてから初期構築
    if (!pop.querySelector('.gf-all')) {
      pop.innerHTML = '';
      buildOnce();
    } else {
      // すでに構築済みなら、候補や選択状態の変更を反映
      renderItems();
    }

    // body 直下にフローティング表示
    detachFloating = openFloatingPopover(wrap, btn, pop);

    // オープン表示
    wrap.classList.add('open');
    pop.style.display = 'block';

    bumpAutoClose();
  }

  function close(){
    if (!wrap || !btn || !pop) return;
    wrap.classList.remove('open');
    pop.style.display = 'none';
    if (detachFloating) { detachFloating(); detachFloating = null; }
    clearAutoClose();
  }

  function bumpAutoClose(){
    clearAutoClose();
    if (!autoCloseMs) return;
    autoCloseTimer = setTimeout(close, autoCloseMs);
  }
  function clearAutoClose(){ if (autoCloseTimer){ clearTimeout(autoCloseTimer); autoCloseTimer = null; } }

  function init(){
    wrap = $id(wrapId);
    btn  = $id(buttonId);
    pop  = $id(popoverId);
    if (!wrap || !btn || !pop) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (wrap.classList.contains('open')) close(); else open();
    });
    // 操作中はオートクローズを延長
    pop.addEventListener('pointerdown', bumpAutoClose);
    pop.addEventListener('pointermove', bumpAutoClose);
    pop.addEventListener('wheel', bumpAutoClose, { passive: true });

    updateButtonLabel();
  }

  return {
    init, setOptions, getSelection, setSelection, open, close, updateButtonLabel,
    set onChange(fn){ onChange = fn; }
  };
}


// ---- 実体：ガチャ／レア度 ----
export const GachaFilter = createMultiSelectFilter({
  wrapId: 'gachaFilterWrap',
  buttonId: 'gachaFilterBtn',
  popoverId: 'gachaPopover',
  autoCloseMs: 1800
});

export const RarityFilter = createMultiSelectFilter({
  wrapId: 'rarityFilterWrap',
  buttonId: 'rarityFilterBtn',
  popoverId: 'rarityPopover',
  autoCloseMs: 1800
});

// 初期化（index.html の DOM 構築後に呼ぶ）
export function initFilters(){
  GachaFilter.init();
  RarityFilter.init();
}

// === NEW: AppState/RarityService からフィルタ候補を同期するヘルパ ===
export function syncFiltersFromApp(services = {}) {
  const app = services.appStateService || services.app || null;
  const raritySvc = services.rarityService || services.rarity || null;
  if (!app) return;

  // --- ガチャ候補: catalogs のキー一覧（表示は displayName） ---
  const state = app.get?.() || {};
  const catalogs = state.catalogs || {};
  const ids = Object.keys(catalogs);

  // 表示名順で並べ替え
  ids.sort((a,b)=>{
    const na = app.getDisplayName?.(a) || a;
    const nb = app.getDisplayName?.(b) || b;
    const t = String(na).localeCompare(String(nb),'ja');
    return t !== 0 ? t : a.localeCompare(b,'ja');
  });

  // GachaFilter は {value:id, label:displayName, attrs:{'data-gacha-id':id}} を受け取る
  if (typeof GachaFilter?.setOptions === 'function') {
    const options = ids.map(id => ({
      value: id,
      label: app.getDisplayName?.(id) || id,
      attrs: { 'data-gacha-id': id }
    }));
    const prev = GachaFilter.getSelection();
    GachaFilter.setOptions(options);
    if (prev === '*') GachaFilter.setSelection('*');
    else if (prev && prev.size) {
      const keep = new Set([...prev].filter(g=>ids.includes(g)));
      GachaFilter.setSelection(keep.size ? keep : '*');
    } else {
      GachaFilter.setSelection('*');
    }
  }

  // --- レアリティ候補: 基本順 → 追加分の順でユニオン（従来通り文字列） ---
  const base = (window.baseRarityOrder || ["UR","SSR","SR","R","N","はずれ"]);
  const rset = new Set();

  for (const g of ids) {
    let list = Array.isArray(raritySvc?.listRarities?.(g))
      ? raritySvc.listRarities(g)
      : Object.keys(catalogs[g]?.items || {});
    for (const r of list) rset.add(r);
  }
  const extra = [...rset].filter(r=>!base.includes(r)).sort((a,b)=>a.localeCompare(b,'ja'));
  const rOrder = [...base.filter(r=>rset.has(r)), ...extra];

  if (typeof RarityFilter?.setOptions === 'function') {
    const prevR = RarityFilter.getSelection();
    RarityFilter.setOptions(rOrder);
    if (prevR === '*') RarityFilter.setSelection('*');
    else if (prevR && prevR.size) {
      const keepR = new Set([...prevR].filter(r=>rOrder.includes(r)));
      RarityFilter.setSelection(keepR.size ? keepR : '*');
    } else {
      RarityFilter.setSelection('*');
    }
  }
}


// === NEW: AppState の変更に追随して自動同期（購読） ===
export function attachAppStateFilters(services = {}) {
  const app = services.appStateService || services.app || null;
  if (!app?.onChange) { syncFiltersFromApp(services); return; }
  syncFiltersFromApp(services);       // 初期同期
  app.onChange(()=>{                  // 以降、状態変化ごとに同期
    try { syncFiltersFromApp(services); }
    catch(e){ console.warn('filter sync failed', e); }
  });
}


// 互換API：既存コードが使うヘルパ
export function getSelectedGachas(){ return GachaFilter.getSelection(); }
export function getSelectedRarities(){ return RarityFilter.getSelection(); }

// 既存のグローバル依存があるため、window にも載せておく（段階的移行用）
if (typeof window !== 'undefined') {
  Object.assign(window, {
    GachaFilter, RarityFilter, openFloatingPopover,
    getSelectedGachas, getSelectedRarities,
    // NEW
    syncFiltersFromApp, attachAppStateFilters
  });
}