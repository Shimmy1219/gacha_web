// /src/ui-riagu.js
// リアグ（リアルグッズ）UIを index.html から切り出し
// 公開API: initRiaguUI, renderRiaguPanel, openRiaguModal, closeRiaguModal

let BRIDGE = {};
let selectedRiaguGacha = null;     // タブ選択状態（リアグ用）
let currentRiaguTarget = null;     // モーダルの対象

// --- ユーティリティ ---
const $  = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const get = (name) => (BRIDGE && name in BRIDGE) ? BRIDGE[name] : (window?.[name]);

function getModalOpen(){
  if (typeof BRIDGE.openModal === 'function') return BRIDGE.openModal;
  const fn = window?.open;
  // 独自 open(modal) を優先（window.open は length>1 のため弾く）
  return (typeof fn === 'function' && fn.length === 1) ? fn : (m)=>{
    m?.classList?.add('show');
    m?.setAttribute?.('aria-hidden','false');
  };
}
function getModalClose(){
  if (typeof BRIDGE.closeModal === 'function') return BRIDGE.closeModal;
  const fn = window?.close;
  return (typeof fn === 'function' && fn.length === 1) ? fn : (m)=>{
    m?.classList?.remove('show');
    m?.setAttribute?.('aria-hidden','true');
  };
}
function tryCall(fn, ...args){ try{ if (typeof fn === 'function') return fn(...args);}catch(_e){} }
function ensureKeyOf(){
  return get('keyOf') || ((gacha, rarity, code)=>`${gacha}::${rarity}::${code}`);
}
function ensureEscapeHtml(){
  return get('escapeHtml') || ((s)=>String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
}

// --- 集計ヘルパ（リアグ専用） ---
function winnersForKey(k){
  const [gacha, rarity, code] = k.split('::');
  const winners = [];
  let total = 0;

  const gHitCounts = get('gHitCounts') || {};
  const gData      = get('gData') || {};
  const hasCounts  = gHitCounts && Object.keys(gHitCounts).length > 0;

  // 1) 可能なら gHitCounts を優先
  if (hasCounts) {
    for (const [user, gobj] of Object.entries(gHitCounts)) {
      const n = ((((gobj || {})[gacha] || {})[rarity] || {})[code] || 0) | 0;
      if (n > 0) { winners.push({ user, count: n }); total += n; }
    }
  }

  // 2) フォールバック：gData に該当アイテムを“保有”していれば最低1として計上
  for (const [user, uobj] of Object.entries(gData || {})) {
    const have = ((((uobj || {})[gacha] || {}).items || {})[rarity] || []).includes(code);
    if (!have) continue;
    if (winners.some(w => w.user === user)) continue; // 既に 1) で入っていればスキップ

    const n = ((((gHitCounts || {})[user] || {})[gacha] || {})[rarity] || {})[code] | 0;
    const cnt = n > 0 ? n : 1; // counts 無しなら 1 扱い
    winners.push({ user, count: cnt });
    total += cnt;
  }
  return { winners, total };
}

// --- 旧形式キー（RARITY::CODE）→ 正規キー（GACHA::RARITY::CODE）正規化 ---
function normalizeSkipKeys(rawKeys){
  const keyOf = ensureKeyOf();
  const result = new Set();

  // ガチャ候補（カタログがあれば優先）
  const byGachaCatalog = get('gCatalogByGacha') || {};
  const byGachaItems   = get('gItemsByGacha')  || {};
  const gachas = Object.keys(byGachaCatalog).length
    ? Object.keys(byGachaCatalog)
    : Object.keys(byGachaItems);

  for (const k of (rawKeys || [])){
    const parts = String(k).split('::');
    if (parts.length >= 3) { result.add(k); continue; }

    if (parts.length === 2){
      const [rarity, code] = parts;
      for (const g of gachas){
        const list = (byGachaCatalog[g] || byGachaItems[g] || []);
        if (list.some(it => it && it.rarity === rarity && it.code === code)){
          result.add(keyOf(g, rarity, code));
        }
      }
    }
  }
  return Array.from(result);
}

// --- パネル描画 ---
export function renderRiaguPanel(){
  const box  = $('#riaguSummary');
  const tabs = $('#riaguTabs');
  if (!box || !tabs) return;

  const skipSet    = get('skipSet') || new Set();
  const riaguMeta  = get('riaguMeta') || {};
  const escapeHtml = ensureEscapeHtml();

  const rawKeys = Array.from(skipSet || []);
  const keys    = normalizeSkipKeys(rawKeys);

  tabs.innerHTML = '';
  box.innerHTML  = '';

  if (keys.length === 0){
    box.innerHTML = '<div class="muted">リアグは未設定です。</div>';
    return;
  }

  // ガチャごとにグルーピング
  const byGacha = new Map();
  for (const k of keys){
    const [gacha] = k.split('::');
    if(!byGacha.has(gacha)) byGacha.set(gacha, []);
    byGacha.get(gacha).push(k);
  }
  const gachas = Array.from(byGacha.keys()).sort((a,b)=>a.localeCompare(b,'ja'));

  // 初期選択
  if (!selectedRiaguGacha || !byGacha.has(selectedRiaguGacha)){
    selectedRiaguGacha = gachas[0];
  }

  // タブ描画
  gachas.forEach(g => {
    const t = document.createElement('div');
    t.className = 'tab' + (g === selectedRiaguGacha ? ' active' : '');
    t.textContent = g;
    t.dataset.gacha = g;
    t.addEventListener('click', () => {
      selectedRiaguGacha = g;
      document.querySelectorAll('#riaguTabs .tab').forEach(x => x.classList.toggle('active', x === t));
      renderRiaguPanel(); // 再描画（本文のみ更新）
    });
    tabs.appendChild(t);
  });

  // 本文（選択ガチャのみ表示）
  const list = byGacha.get(selectedRiaguGacha) || [];
  let groupTotal = 0;
  const itemsHtml = [];

  list.forEach(k => {
    const [, rarity, code] = k.split('::');
    const meta = riaguMeta[k] || {};
    const { winners, total } = winnersForKey(k);
    const cost = +meta.cost || 0;
    const orderQty = total;
    const sum = cost * orderQty;
    groupTotal += sum;

    const winHtml = winners.length
      ? winners.map(w => `<span class="riagu-chip">${escapeHtml(w.user)} ×${w.count}</span>`).join('')
      : '<span class="muted">獲得者なし</span>';

    itemsHtml.push(`
      <div class="riagu-item" data-key="${encodeURIComponent(k)}">
        <div class="riagu-head">
          <div class="riagu-title">
            <span class="rarity ${escapeHtml(rarity)}">【${escapeHtml(rarity)}】</span>
            <span class="item-name">${escapeHtml(code)}</span>
          </div>
          <div class="riagu-meta">
            <span class="badge">${meta.type ? escapeHtml(meta.type) : '-'}</span>
          </div>
        </div>
        <div class="riagu-stats">
          <span class="tag">原価: ¥${cost.toLocaleString('ja-JP')}</span>
          <span class="tag">発注数: ${orderQty}</span>
          <span class="tag"><strong>合計: ¥${sum.toLocaleString('ja-JP')}</strong></span>
        </div>
        <div class="riagu-winners">${winHtml}</div>
        <div class="riagu-actions">
          <button class="btn small ghost" data-edit-riagu="${encodeURIComponent(k)}">編集</button>
          <button class="btn small"        data-unset-riagu="${encodeURIComponent(k)}">解除</button>
        </div>
      </div>`);
  });

  const groupHtml = `
    <div class="riagu-group">
      ${itemsHtml.join('')}
      <div class="riagu-total">このガチャ合計: ¥${groupTotal.toLocaleString('ja-JP')}</div>
    </div>
  `;
  box.innerHTML = groupHtml;

  // アクション: 編集/解除
  box.querySelectorAll('[data-edit-riagu]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const k = decodeURIComponent(b.getAttribute('data-edit-riagu')||'');
      const [gacha, rarity, code] = k.split('::');
      openRiaguModal({ gacha, rarity, code });
    });
  });
  box.querySelectorAll('[data-unset-riagu]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const k = decodeURIComponent(b.getAttribute('data-unset-riagu')||'');
      const riaguMeta = get('riaguMeta') || {};
      const LS_KEY_RIAGU_META = get('LS_KEY_RIAGU_META');
      const skipDel = get('skipDel');
      delete riaguMeta[k];
      tryCall(get('saveLocalJSON'), LS_KEY_RIAGU_META, riaguMeta);
      tryCall(skipDel, k);
      tryCall(get('renderItemGrid'));
      tryCall(renderRiaguPanel);
      tryCall(get('saveAppStateDebounced'));
    });
  });
}


// --- モーダル制御 ---
export function openRiaguModal(it){
  currentRiaguTarget = it;
  const keyOf = ensureKeyOf();
  const riaguMeta = get('riaguMeta') || {};
  const k = keyOf(it.gacha, it.rarity, it.code);
  const targetEl = $('#riaguTarget');
  if (targetEl) targetEl.textContent = `${it.gacha} / ${it.rarity}:${it.code}`;
  $('#riaguCost')?.setAttribute('value',''); // 初期化
  $('#riaguType')?.setAttribute('value','');

  const meta = riaguMeta[k] || {};
  const costInput = $('#riaguCost');
  const typeInput = $('#riaguType');
  if (costInput) costInput.value = (meta.cost ?? '');
  if (typeInput) typeInput.value = (meta.type ?? '');

  getModalOpen()($('#riaguModal'));
}

export function closeRiaguModal(){
  getModalClose()($('#riaguModal'));
  currentRiaguTarget = null;
}

// --- 初期化 ---
export function initRiaguUI(opts = {}){
  BRIDGE = Object.assign({}, opts);

  // モーダルボタン結線
  $('#riaguClose')?.addEventListener('click', closeRiaguModal);

  $('#riaguSave')?.addEventListener('click', async ()=>{
    if(!currentRiaguTarget) return;
    const keyOf = ensureKeyOf();
    const LS_KEY_RIAGU_META = get('LS_KEY_RIAGU_META');
    const riaguMeta = get('riaguMeta') || {};
    const skipAdd = get('skipAdd');

    const k = keyOf(currentRiaguTarget.gacha, currentRiaguTarget.rarity, currentRiaguTarget.code);
    const cost = Math.max(0, parseInt(String($('#riaguCost')?.value ?? '').replace(/[^\d]/g,''),10) || 0);
    const type = ( ($('#riaguType')?.value ?? '') ).trim();

    riaguMeta[k] = { cost, type };
    tryCall(get('saveLocalJSON'), LS_KEY_RIAGU_META, riaguMeta);

    // リアグ化：画像解除→スキップ登録（= リアグ）
    await tryCall(get('clearImage'), currentRiaguTarget);
    tryCall(skipAdd, k);

    tryCall(get('renderItemGrid'));
    tryCall(renderRiaguPanel);
    tryCall(get('saveAppStateDebounced'));
    closeRiaguModal();
  });

  $('#riaguUnset')?.addEventListener('click', ()=>{
    if(!currentRiaguTarget) return;
    const keyOf = ensureKeyOf();
    const LS_KEY_RIAGU_META = get('LS_KEY_RIAGU_META');
    const riaguMeta = get('riaguMeta') || {};
    const skipDel = get('skipDel');

    const k = keyOf(currentRiaguTarget.gacha, currentRiaguTarget.rarity, currentRiaguTarget.code);
    delete riaguMeta[k];
    tryCall(get('saveLocalJSON'), LS_KEY_RIAGU_META, riaguMeta);
    tryCall(skipDel, k);

    tryCall(get('renderItemGrid'));
    tryCall(renderRiaguPanel);
    tryCall(get('saveAppStateDebounced'));
    closeRiaguModal();
  });

  // 初期描画
  tryCall(renderRiaguPanel);

  // 互換維持：グローバル露出（ui-toolbar / imp_exp_file などの tryCall があるため）
  Object.assign(window, {
    renderRiaguPanel,
    openRiaguModal,
    closeRiaguModal
  });
}
