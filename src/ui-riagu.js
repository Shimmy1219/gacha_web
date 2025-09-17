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

let __lastOpener = null;

function getModalOpen(){
  if (typeof BRIDGE.openModal === 'function') return BRIDGE.openModal;
  return (m, { focus = '#riaguClose' } = {}) => {
    if (!m) return;
    // 1) 先に見える化
    m.setAttribute('aria-hidden', 'false');
    m.classList.add('show');

    // 2) 背景を無効化（必要に応じて範囲を狭める）
    document.querySelector('.container')?.setAttribute('inert', '');

    // 3) 次フレームで安全にフォーカス移動
    requestAnimationFrame(() => {
      const el = typeof focus === 'string' ? m.querySelector(focus) : focus;
      el?.focus?.();
    });
  };
}

function getModalClose(){
  if (typeof BRIDGE.closeModal === 'function') return BRIDGE.closeModal;
  return (m, { returnFocus } = {}) => {
    if (!m) return;
    // 1) 先にフォーカスを外へ戻す
    (returnFocus || __lastOpener || document.getElementById('menuBtn'))?.focus?.();

    // 2) 非表示化
    m.classList.remove('show');
    m.setAttribute('aria-hidden', 'true');

    // 3) 背景の inert 解除
    document.querySelector('.container')?.removeAttribute('inert');
  };
}

function tryCall(fn, ...args){ try{ if (typeof fn === 'function') return fn(...args);}catch(_e){} }
function ensureKeyOf(){
  return get('keyOf') || ((gacha, rarity, code)=>`${gacha}::${rarity}::${code}`);
}
function ensureEscapeHtml(){
  return get('escapeHtml') || ((s)=>String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
}

// --- 集計ヘルパ（リアグ専用・Service委譲版） ---
function winnersForKey(k){
  const services = BRIDGE?.services || window?.Services || {};
  const riagu = services.riaguService || services.riagu || null;
  const app   = services.appStateService || services.app || null;

  // 優先: Service 実装（AppStateService の薄いゲッターを利用）
  if (riagu && typeof riagu.winnersForKey === 'function') {
    return riagu.winnersForKey(k, app);
  }

  // フォールバック（旧ロジック）
  const [gacha, rarity, code] = k.split('::');
  const winners = [];
  let total = 0;

  const gHitCounts = get('gHitCounts') || {};
  const gData      = get('gData') || {};
  const hasCounts  = gHitCounts && Object.keys(gHitCounts).length > 0;

  if (hasCounts) {
    for (const [user, gobj] of Object.entries(gHitCounts)) {
      const n = ((((gobj || {})[gacha] || {})[rarity] || {})[code] || 0) | 0;
      if (n > 0) { winners.push({ user, count: n }); total += n; }
    }
  }
  for (const [user, uobj] of Object.entries(gData || {})) {
    const have = ((((uobj || {})[gacha] || {}).items || {})[rarity] || []).includes(code);
    if (!have) continue;
    if (winners.some(w => w.user === user)) continue;
    const n = ((((gHitCounts || {})[user] || {})[gacha] || {})[rarity] || {})[code] | 0;
    const cnt = n > 0 ? n : 1;
    winners.push({ user, count: cnt }); total += cnt;
  }
  return { winners, total };
}

// --- 旧形式キー（RARITY::CODE）→ 正規キー（GACHA::RARITY::CODE）正規化 ---
function normalizeSkipKeys(arr){
  // 期待形式: "gacha::rarity::code"
  // 旧形式（"rarity::code"）は、この場では除外して描画を壊さない
  return (arr || []).filter(k => (k.split('::').length >= 3));
}

// --- パネル描画 ---
export function renderRiaguPanel(){
  console.log('renderRiaguPanel');
  const box  = $('#riaguSummary');
  const tabs = $('#riaguTabs');
  if (!box || !tabs) return;

  const services = BRIDGE?.services || window?.Services || {};
  const riagu = services.riaguService || services.riagu || null;
  const escapeHtml = ensureEscapeHtml();

  // Service からキー一覧（なければ旧 skipSet）
  const rawKeys = (riagu && typeof riagu.listKeys === 'function') ? Array.from(riagu.listKeys()) : Array.from(get('skipSet') || []);
  console.log(`リアグ登録数: ${rawKeys}`);

  tabs.innerHTML = '';
  box.innerHTML  = '';

  if (rawKeys.length === 0){
    box.innerHTML = '<div class="muted">リアグは未設定です。</div>';
    return;
  }

  // 旧式 "RARITY::CODE" を正規キーへ解決
  const keys = normalizeSkipKeys(rawKeys);

  // ガチャごとにグループ化
  const byGacha = new Map();
  for (const k of keys){
    const [gacha] = k.split('::');
    if (!byGacha.has(gacha)) byGacha.set(gacha, []);
    byGacha.get(gacha).push(k);
  }
  const gachas = Array.from(byGacha.keys()).sort((a,b)=>a.localeCompare(b,'ja'));

  if (!selectedRiaguGacha || !byGacha.has(selectedRiaguGacha)) {
    selectedRiaguGacha = gachas[0];
  }

  // タブ
  gachas.forEach(g => {
    const t = document.createElement('div');
    t.className = 'tab' + (g === selectedRiaguGacha ? ' active' : '');
    t.textContent = g;
    t.dataset.gacha = g;
    t.addEventListener('click', () => {
      selectedRiaguGacha = g;
      document.querySelectorAll('#riaguTabs .tab').forEach(x => x.classList.toggle('active', x === t));
      renderRiaguPanel();
    });
    tabs.appendChild(t);
  });

  // コンテンツ
  const list = byGacha.get(selectedRiaguGacha) || [];
  let groupTotal = 0;
  const itemsHtml = [];

  list.forEach(k => {
    const [, rarity, code] = k.split('::');

    // メタ
    let meta = {};
    if (riagu && typeof riagu.getMeta === 'function') meta = riagu.getMeta(k) || {};
    else meta = (get('riaguMeta') || {})[k] || {};

    const { winners, total } = winnersForKey(k);
    const cost = +meta.cost || 0;
    const typeTxt = meta.type ? String(meta.type) : '-';
    const orderQty = total;
    const sum = cost * orderQty;
    groupTotal += sum;

    const winHtml = winners.length
      ? winners.map(w => `<span class="riagu-chip">${escapeHtml(w.user)} ×${w.count}</span>`).join('')
      : '<span class="muted">獲得者なし</span>';

    // 旧UIのDOM構造に合わせたマークアップ
    itemsHtml.push(`
      <div class="riagu-item" data-riagu-key="${escapeHtml(k)}">
        <div class="riagu-head">
          <div class="riagu-title">
            <span class="rarity ${escapeHtml(rarity)}">【${escapeHtml(rarity)}】</span>
            <span class="item-name">${escapeHtml(code)}</span>
          </div>
          <div class="riagu-meta"><span class="badge">種別: ${escapeHtml(typeTxt)}</span></div>
        </div>
        <div class="riagu-stats">
          <span class="tag">原価: ¥${cost.toLocaleString()}</span>
          <span class="tag">発注数: ${orderQty}</span>
          <span class="tag">合計: ¥${sum.toLocaleString()}</span>
        </div>
        <div class="riagu-winners">${winHtml}</div>
        <div class="riagu-actions">
          <button class="btn small ghost" data-edit-riagu="${escapeHtml(k)}">編集</button>
          <button class="btn small" data-unset-riagu="${escapeHtml(k)}">解除</button>
        </div>
      </div>
    `);
  });

  box.innerHTML = itemsHtml.join('') + `
    <div class="riagu-total">このガチャ合計: ¥${groupTotal.toLocaleString()}</div>
  `;

  // 編集
  $$('#riaguSummary [data-edit-riagu]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.getAttribute('data-edit-riagu') || '';
      const [gacha, rarity, code] = k.split('::');
      openRiaguModal({ gacha, rarity, code });
    });
  });

  // 解除
  $$('#riaguSummary [data-unset-riagu]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const k = btn.getAttribute('data-unset-riagu') || '';
      const [gacha, rarity, code] = k.split('::');

      if (riagu && typeof riagu.unmark === 'function') {
        riagu.unmark(k);
      } else {
        tryCall(get('skipDel'), k);
        const meta = get('riaguMeta') || {};
        delete meta[k];
        tryCall(get('saveLocalJSON'), get('LS_KEY_RIAGU_META'), meta);
      }

      tryCall(get('renderItemGrid'));
      renderRiaguPanel();
    });
  });
}




// --- モーダル制御 ---
export function openRiaguModal(it){
  currentRiaguTarget = it;
  const keyOf = ensureKeyOf();

  const services = BRIDGE?.services || window?.Services || {};
  const riagu = services.riaguService || services.riagu || null;

  const k = keyOf(it.gacha, it.rarity, it.code);

  // メタは Service から取得（フォールバックあり）
  let meta = {};
  if (riagu && typeof riagu.getMeta === 'function') meta = riagu.getMeta(k) || {};
  else meta = (get('riaguMeta') || {})[k] || {};

  $('#riaguTarget').textContent = `${it.gacha} / ${it.rarity} / ${it.code}`;
  $('#riaguCost').value = String(meta.cost ?? '');
  $('#riaguType').value = String(meta.type ?? '');

  getModalOpen()($('#riaguModal'));
}


export function closeRiaguModal(){
  getModalClose()($('#riaguModal'));
  currentRiaguTarget = null;
}

// --- 初期化 ---
export function initRiaguUI(opts = {}){
  // opts.services を優先、無ければ window.Services を使う
  BRIDGE = Object.assign({}, opts);
  if (!BRIDGE.services && window?.Services) {
    BRIDGE.services = window.Services;
  }

  const services = BRIDGE.services || {};

  console.log('initRiaguUI', services);

  // モーダルボタン結線
  $('#riaguClose')?.addEventListener('click', closeRiaguModal);

  // 保存（リアグ設定）
  $('#riaguSave')?.addEventListener('click', async ()=>{
    if(!currentRiaguTarget) return;

    const keyOf = ensureKeyOf();
    const riagu = services.riaguService || services.riagu || null;

    const k = keyOf(currentRiaguTarget.gacha, currentRiaguTarget.rarity, currentRiaguTarget.code);
    const cost = Math.max(0, parseInt(String($('#riaguCost')?.value ?? '').replace(/[^\d]/g,''),10) || 0);
    const type = ( ($('#riaguType')?.value ?? '') ).trim();

    // 画像解除は従来どおり UI で（環境によって非同期）
    await tryCall(get('clearImage'), currentRiaguTarget);

    // Service に集約（meta設定 + リアグ登録）
    if (riagu && typeof riagu.mark === 'function') {
      await riagu.mark(currentRiaguTarget, { cost, type });
    } else {
      // フォールバック（旧処理）
      const LS_KEY_RIAGU_META = get('LS_KEY_RIAGU_META');
      const riaguMeta = get('riaguMeta') || {};
      riaguMeta[k] = { cost, type };
      tryCall(get('saveLocalJSON'), LS_KEY_RIAGU_META, riaguMeta);
      tryCall(get('skipAdd'), k);
    }

    tryCall(get('renderItemGrid'));
    tryCall(renderRiaguPanel());
    console.log(`リアグ登録: ${k} (cost=${cost}, type=${type})`);

    // AppState 保存はサービスに任せる（存在すれば）
    const app = services.appStateService || services.app || null;
    if (app && typeof app.saveDebounced === 'function') app.saveDebounced();
    else tryCall(get('saveAppStateDebounced'));

    closeRiaguModal();
  });

  // 解除（リアグ解除）
  $('#riaguUnset')?.addEventListener('click', ()=>{
    if(!currentRiaguTarget) return;

    const riagu = services.riaguService || services.riagu || null;

    if (riagu && typeof riagu.unmark === 'function') {
      riagu.unmark(currentRiaguTarget); // メタ削除 + リアグ解除
    } else {
      // フォールバック（旧処理）
      const keyOf = ensureKeyOf();
      const LS_KEY_RIAGU_META = get('LS_KEY_RIAGU_META');
      const riaguMeta = get('riaguMeta') || {};
      const k = keyOf(currentRiaguTarget.gacha, currentRiaguTarget.rarity, currentRiaguTarget.code);
      delete riaguMeta[k];
      tryCall(get('saveLocalJSON'), LS_KEY_RIAGU_META, riaguMeta);
      tryCall(get('skipDel'), k);
    }

    tryCall(get('renderItemGrid'));
    tryCall(renderRiaguPanel());
    console.log(`リアグ解除: ${keyOf(currentRiaguTarget.gacha, currentRiaguTarget.rarity, currentRiaguTarget.code)}`);

    const app = services.appStateService || services.app || null;
    if (app && typeof app.saveDebounced === 'function') app.saveDebounced();
    else tryCall(get('saveAppStateDebounced'));

    closeRiaguModal();
  });

  // 初期描画
  tryCall(renderRiaguPanel);

  // 互換維持：グローバル露出（他モジュールの tryCall 用）
  Object.assign(window, {
    renderRiaguPanel,
    openRiaguModal,
    closeRiaguModal
  });

  // 変更監視（Service 側があれば確実に追随）
  const svc = (BRIDGE?.services || window?.Services || {});
  const riaguSvc = svc.riaguService || svc.riagu || null;
  if (riaguSvc && typeof riaguSvc.onChange === 'function') {
    riaguSvc.onChange(() => {
      // サービス側が LS 更新→_emit() したら確実に追随
      renderRiaguPanel();
    });
  }
}

