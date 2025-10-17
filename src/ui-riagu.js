// /src/ui-riagu.js
// リアグ（リアルグッズ）UIを index.html から切り出し
// 公開API: initRiaguUI, renderRiaguPanel, openRiaguModal, closeRiaguModal

let BRIDGE = {};
let selectedRiaguGacha = null;     // タブ選択状態（gachaId）
let currentRiaguTarget = null;     // モーダルの対象 { gachaId, rarity, code }

// --- ユーティリティ ---
const $  = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const get = (name) => (BRIDGE && name in BRIDGE) ? BRIDGE[name] : (window?.[name]);

let __lastOpener = null;
import { rarityNameSpanHTML } from "/src/rarity_style.js";

function listRiaguSourceItems(gachaId){
  const services   = (window.BRIDGE?.services) || window.Services || {};
  const app        = services.app || services.appStateService || null;
  const raritySvc  = services.rarity || services.rarityService || null;
  const baseOrder  = (window.baseRarityOrder || ["UR","SSR","SR","R","N","はずれ"]);
  if (!app?.listItemsFromCatalog) return [];
  return app.listItemsFromCatalog(gachaId, { rarityService: raritySvc, baseOrder });
}

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
  // gachaId 前提の正規キー
  return get('keyOf') || ((gachaId, rarity, code)=>`${gachaId}::${rarity}::${code}`);
}
function ensureEscapeHtml(){
  return get('escapeHtml') || ((s)=>String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))); // prettier-ignore
}

// --- 集計ヘルパ（リアグ専用・Service委譲版） ---
function winnersForKey(k){
  const services = BRIDGE?.services || window?.Services || {};
  const riagu = services.riagu || services.riaguService || null;
  const app   = services.app || services.appStateService || null;

  // 優先: Service 実装（AppStateService の薄いゲッターを利用）
  if (riagu && typeof riagu.winnersForKey === 'function') {
    return riagu.winnersForKey(k, app);
  }

  // フォールバック（旧ロジック）— ただし gachaId 前提
  const [gachaId, rarity, code] = k.split('::');
  const winners = [];
  let total = 0;

  const gHitCounts = get('gHitCounts') || {};
  const gData      = get('gData') || {};
  const hasCounts  = gHitCounts && Object.keys(gHitCounts).length > 0;

  if (hasCounts) {
    for (const [user, gobj] of Object.entries(gHitCounts)) {
      const n = ((((gobj || {})[gachaId] || {})[rarity] || {})[code] || 0) | 0;
      if (n > 0) { winners.push({ user, count: n }); total += n; }
    }
  }
  for (const [user, uobj] of Object.entries(gData || {})) {
    const have = ((((uobj || {})[gachaId] || {}).items || {})[rarity] || []).includes(code);
    if (!have) continue;
    if (winners.some(w => w.user === user)) continue;
    const n = ((((gHitCounts || {})[user] || {})[gachaId] || {})[rarity] || {})[code] | 0;
    const cnt = n > 0 ? n : 1;
    winners.push({ user, count: cnt }); total += cnt;
  }
  return { winners, total };
}

// --- 旧形式キー（RARITY::CODE）→ 正規キー（GACHAID::RARITY::CODE）正規化 ---
function normalizeSkipKeys(arr){
  // 期待形式: "gachaId::rarity::code"
  // 旧形式（"rarity::code"）は、この場では除外して描画を壊さない
  return (arr || []).filter(k => (k.split('::').length >= 3));
}

// --- パネル描画 ---
export function renderRiaguPanel(){
  const box  = $('#riaguSummary');
  const tabs = $('#riaguTabs');
  if (!box || !tabs) return;

  const services  = BRIDGE?.services || window?.Services || {};
  const riagu     = services.riagu || services.riaguService || null;
  const raritySvc = services.rarity || services.rarityService || null;
  const app       = services.app || services.appStateService || null;
  const escapeHtml = ensureEscapeHtml();

  // Service からキー一覧（なければ旧 skipSet）
  const rawKeys = (riagu && typeof riagu.listKeys === 'function') ? Array.from(riagu.listKeys()) : Array.from(get('skipSet') || []);
  tabs.innerHTML = '';
  box.innerHTML  = '';

  if (rawKeys.length === 0){
    box.innerHTML = '<div class="muted">リアグは未設定です。</div>';
    return;
  }

  // 旧式 "RARITY::CODE" を正規キーへ解決（3 パーツ以外は弾く）
  const keys = normalizeSkipKeys(rawKeys);

  // ガチャごとにグループ化（gachaId）— falsy な gachaId は除外
  const byGacha = new Map();
  for (const k of keys){
    const p = String(k).split('::');
    const gachaId = p[0] || null;
    if (!gachaId) continue; // ← ここで undefined/null を排除
    if (!byGacha.has(gachaId)) byGacha.set(gachaId, []);
    byGacha.get(gachaId).push(k);
  }
  const gachas = Array.from(byGacha.keys()).sort((a,b)=>a.localeCompare(b,'ja'));

  if (!gachas.length){
    box.innerHTML = '<div class="muted">リアグは未設定です。</div>';
    return;
  }

  if (!selectedRiaguGacha || !byGacha.has(selectedRiaguGacha)) {
    selectedRiaguGacha = gachas[0];
  }

  // タブ（表示は displayName、属性は data-gacha-id）
  gachas.forEach(id => {
    const t = document.createElement('div');
    const label = app?.getDisplayName?.(id) || id || '(無名ガチャ)';
    t.className = 'tab' + (id === selectedRiaguGacha ? ' active' : '');
    t.textContent = label;
    t.dataset.gachaId = id;
    t.addEventListener('click', () => {
      selectedRiaguGacha = id;
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
    const [gachaId, rarity, code] = k.split('::');

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

    // レアリティ色（rarityService から取得）
    const color = raritySvc?.getMeta?.(gachaId, rarity)?.color ?? null;
    const rarityHTML = typeof rarityNameSpanHTML === 'function'
      ? rarityNameSpanHTML(`【${escapeHtml(rarity)}】`, color, { extraClasses: `rarity ${escapeHtml(rarity)}` })
      : `<span class="rarity ${escapeHtml(rarity)}">${`【${escapeHtml(rarity)}】`}</span>`;

    itemsHtml.push(`
      <div class="riagu-item" data-riagu-key="${escapeHtml(k)}">
        <div class="riagu-head">
          <div class="riagu-title">
            ${rarityHTML}
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

  const totalLabel = (() => {
    const disp = app?.getDisplayName?.(selectedRiaguGacha) || selectedRiaguGacha || '(無名ガチャ)';
    return `${disp} 合計`;
  })();

  box.innerHTML = itemsHtml.join('') + `
    <div class="riagu-total">${totalLabel}: ¥${groupTotal.toLocaleString()}</div>
  `;

  // 編集
  $$('#riaguSummary [data-edit-riagu]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.getAttribute('data-edit-riagu') || '';
      const [gachaId, rarity, code] = k.split('::');
      openRiaguModal({ gachaId, rarity, code });   // 正規引数で呼ぶ
    });
  });

  // 解除
  $$('#riaguSummary [data-unset-riagu]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const k = btn.getAttribute('data-unset-riagu') || '';
      const [gachaId, rarity, code] = k.split('::');

      if (riagu && typeof riagu.unmark === 'function') {
        riagu.unmark({ gachaId, rarity, code });
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
  // 呼び出しの揺れを吸収：{ gachaId, ... } / { gacha, ... } 両対応
  const gachaId = it?.gachaId ?? it?.gacha ?? null;
  if (!gachaId) return; // gachaId 不明なら何もしない

  // 正規化して保持（既存コード互換のため gacha も埋める）
  currentRiaguTarget = {
    gachaId,
    gacha: gachaId,
    rarity: it?.rarity ?? "",
    code: it?.code ?? ""
  };

  const keyOf = ensureKeyOf();

  const services = BRIDGE?.services || window?.Services || {};
  const riagu = services.riagu || services.riaguService || null;
  const app   = services.app || services.appStateService || null;

  const k = keyOf(gachaId, currentRiaguTarget.rarity, currentRiaguTarget.code);

  // メタは Service から取得（フォールバックあり）
  let meta = {};
  if (riagu && typeof riagu.getMeta === 'function') meta = riagu.getMeta(k) || {};
  else meta = (get('riaguMeta') || {})[k] || {};

  // gachaId → 表示名
  const disp = app?.getDisplayName?.(gachaId) || gachaId;
  $('#riaguTarget').textContent = `${disp} / ${currentRiaguTarget.rarity} / ${currentRiaguTarget.code}`;
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

  // モーダルボタン結線
  $('#riaguClose')?.addEventListener('click', closeRiaguModal);

  // 保存（リアグ設定）
  $('#riaguSave')?.addEventListener('click', async ()=>{
    if(!currentRiaguTarget) return;

    const keyOf = ensureKeyOf();
    const riagu = services.riagu || services.riaguService || null;

    const { gachaId, rarity, code } = currentRiaguTarget;
    const k = keyOf(gachaId, rarity, code);
    const cost = Math.max(0, parseInt(String($('#riaguCost')?.value ?? '').replace(/[^\d]/g,''),10) || 0);
    const type = ( ($('#riaguType')?.value ?? '') ).trim();

    // 画像解除は従来どおり UI で（既存API {gacha, rarity, code} 想定のため変換）
    await tryCall(get('clearImage'), { gacha: gachaId, rarity, code });

    // Service に集約（meta設定 + リアグ登録）
    if (riagu && typeof riagu.mark === 'function') {
      await riagu.mark({ gachaId, rarity, code }, { cost, type });
    } else {
      // フォールバック（旧処理）
      const LS_KEY_RIAGU_META = get('LS_KEY_RIAGU_META');
      const riaguMeta = get('riaguMeta') || {};
      riaguMeta[k] = { cost, type };
      tryCall(get('saveLocalJSON'), LS_KEY_RIAGU_META, riaguMeta);
      tryCall(get('skipAdd'), k);
    }

    tryCall(get('renderItemGrid'));
    tryCall(renderRiaguPanel);
    // AppState の保存はサービス側でバッファ（存在すれば）
    const app = services.app || services.appStateService || null;
    if (app && typeof app.saveDebounced === 'function') app.saveDebounced();
    else tryCall(get('saveAppStateDebounced'));

    closeRiaguModal();
  });

  // 解除（リアグ解除）
  $('#riaguUnset')?.addEventListener('click', ()=>{
    if(!currentRiaguTarget) return;

    const riagu = services.riagu || services.riaguService || null;
    const { gachaId, rarity, code } = currentRiaguTarget;

    if (riagu && typeof riagu.unmark === 'function') {
      riagu.unmark({ gachaId, rarity, code }); // メタ削除 + リアグ解除
    } else {
      // フォールバック（旧処理）
      const keyOf = ensureKeyOf();
      const LS_KEY_RIAGU_META = get('LS_KEY_RIAGU_META');
      const riaguMeta = get('riaguMeta') || {};
      const k = keyOf(gachaId, rarity, code);
      delete riaguMeta[k];
      tryCall(get('saveLocalJSON'), LS_KEY_RIAGU_META, riaguMeta);
      tryCall(get('skipDel'), k);
    }

    tryCall(get('renderItemGrid'));
    tryCall(renderRiaguPanel);
    const app = services.app || services.appStateService || null;
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
  const riaguSvc   = services.riagu || services.riaguService || null;
  const raritySvc2 = services.rarity || services.rarityService || null;

  if (riaguSvc?.onChange) {
    riaguSvc.onChange(() => { renderRiaguPanel(); });
  }

  // レアリティ設定が変わったら riagu も再描画（色反映）
  if (raritySvc2?.onChange) {
    raritySvc2.onChange(() => { renderRiaguPanel(); });
  }
}
