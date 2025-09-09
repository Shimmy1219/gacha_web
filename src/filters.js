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

/** ガチャ/レア度共通のマルチセレクト・フィルタを生成 */
function createMultiSelectFilter({ wrapId, buttonId, popoverId, autoCloseMs = 1800 }) {
  let wrap, btn, pop;
  let options = [];              // 表示候補 ['UR','SSR',...] or ['ガチャA','ガチャB',...]
  let selected = '*';            // '*' or Set<string>
  let autoCloseTimer = null;
  let detachFloating = null;
  let onChange = null;

  function $id(id){ return document.getElementById(id); }

  function setOptions(list){
    options = Array.from(new Set(list || []));
    // 選択セットに存在しない値があればクリーンアップ
    if (selected !== '*') {
      const next = new Set(Array.from(selected).filter(v => options.includes(v)));
      selected = next.size === 0 ? '*' : next;
    }
    updateButtonLabel();
    // まだヘッダ（「すべて」）が無い段階では描画しない（重複防止）
    if (pop && pop.querySelector('.gf-all')) {
      renderItems();
    }
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
    btn.textContent = (n === 1) ? Array.from(selected)[0] : `${n}項目`;
  }

  function renderItems(){
    if (!pop) return;
    // 先頭の「すべて」行と区切りを残して全削除
    while (pop.children.length > 2) pop.removeChild(pop.lastChild);

    const selSet = (selected === '*') ? new Set(options) : new Set(selected);

    options.forEach(name => {
      const row = document.createElement('div');
      row.className = 'gf-item';
      row.setAttribute('role','option');
      row.setAttribute('aria-selected', selSet.has(name) ? 'true' : 'false');
      row.innerHTML = `<span class="gf-check">${selSet.has(name) ? '✓' : ''}</span><span class="gf-name" title="${name}">${name}</span>`;
      row.addEventListener('click', () => {
        let s = (selected === '*') ? new Set(options) : new Set(selected);
        if (s.has(name)) s.delete(name); else s.add(name);
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

// 互換API：既存コードが使うヘルパ
export function getSelectedGachas(){ return GachaFilter.getSelection(); }
export function getSelectedRarities(){ return RarityFilter.getSelection(); }

// 既存のグローバル依存があるため、window にも載せておく（段階的移行用）
if (typeof window !== 'undefined') {
  Object.assign(window, {
    GachaFilter, RarityFilter, openFloatingPopover,
    getSelectedGachas, getSelectedRarities
  });
}
