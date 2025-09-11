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
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  }catch(_){ return {}; }
}
export function saveRarityConfig(obj = rarityConfigByGacha){
  try{ localStorage.setItem(LS_KEY_RARITY, JSON.stringify(obj)); }
  catch(e){ console.warn("rarity 保存失敗:", e); }
}
export function getRarityConfigByGacha(){ return rarityConfigByGacha; }
export function setRarityConfigForGacha(gacha, map){
  rarityConfigByGacha[gacha] = map || {};
  saveRarityConfig();
  dispatchChanged();
}

// ================= コア関数 =================
// 1) getRarityMeta
export function getRarityMeta(gacha, rarity){
  const baseUser = rarityConfigByGacha?.[BASE_KEY] || null;
  const fromGacha = rarityConfigByGacha?.[gacha]?.[rarity] || null;
  if (fromGacha) return fromGacha;
  if (baseUser && baseUser[rarity]) return baseUser[rarity];
  if (baseRarityConfig[rarity]) return baseRarityConfig[rarity];
  return { color:null, rarityNum:1, emitRate:null };
}

// 2) listRaritiesForGacha
export function listRaritiesForGacha(gacha, opts = {}){
  if (gacha === BASE_KEY){
    const set = new Set([
      ...Object.keys(baseRarityConfig),
      ...Object.keys(rarityConfigByGacha?.[BASE_KEY] || {}),
    ]);
    return sortRarityNames(Array.from(set), gacha);
  }
  const { gData, gCatalogByGacha } = opts.gData ? opts : getStateSafe();
  const set = new Set();

  if (gData) {
    for (const user of Object.keys(gData)) {
      const perGacha = gData[user]?.[gacha];
      if (!perGacha) continue;
      const items = perGacha.items || {};
      for (const r of Object.keys(items)) set.add(r);
    }
  }
  const cat = gCatalogByGacha?.[gacha] || [];
  for (const it of cat) if (it?.rarity) set.add(it.rarity);

  for (const r of Object.keys(rarityConfigByGacha?.[gacha] || {})) set.add(r);
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
      <button id="resetRarityCfg" class="btn subtle">このタブの設定を既定に戻す</button>
      <span class="muted" style="margin-left:auto" id="raritySumHint"></span>
    </div>

    <div id="rarityTableWrap" class="rarity-wrap"></div>
  `;

  ensureAddModal(); // 追加モーダルをDOMに常駐させる

  const tabs = panel.querySelector('#rarityGachaTabs');
  const wrap = panel.querySelector('#rarityTableWrap');
  const sumHint = panel.querySelector('#raritySumHint');

  let current = BASE_KEY; // 既定でベース（要件）

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
    const html = [
      `<button type="button" class="tab ${current===BASE_KEY?'active':''}" data-gacha="${BASE_KEY}">ベース</button>`,
      ...names.map(g => `<button type="button" class="tab ${current===g?'active':''}" data-gacha="${escapeHtml(g)}">${escapeHtml(g)}</button>`)
    ].join('');
    tabs.innerHTML = html;
  }

  tabs.addEventListener('click', (e)=>{
    const btn = e.target.closest('button.tab'); if(!btn) return;
    const g = btn.getAttribute('data-gacha');
    current = g;
    renderTabs();
    renderTable();
  });

  panel.querySelector('#resetRarityCfg').addEventListener('click', ()=>{
    if (!confirm("このタブのレアリティ設定を既定に戻します。よろしいですか？")) return;
    if (current === BASE_KEY){
      delete rarityConfigByGacha[BASE_KEY];
    }else{
      delete rarityConfigByGacha[current];
    }
    saveRarityConfig();
    dispatchChanged();
    renderTable();
  });

  panel.querySelector('#addRarityRow').addEventListener('click', ()=>{
    openAddModal({
      onSubmit: ({ name, rarityNum, color })=>{
        const target = (rarityConfigByGacha[current] ||= {});
        if (target[name]) { alert("同名のレアリティが既に存在します。"); return; }
        target[name] = { color, rarityNum, emitRate: null };
        saveRarityConfig();
        dispatchChanged();
        renderTable();
      }
    });
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
    updateSumHint();
  }, { passive:true });

  wrap.addEventListener('click', (e)=>{
    const btn = e.target.closest('button.del'); if(!btn) return;
    const tr = btn.closest('tr[data-rarity]'); if(!tr) return;
    const rarity = tr.getAttribute('data-rarity');

    if (current === BASE_KEY){
      // ベースは「上書き分」だけ削除可。ベース本体は削除不可。
      const baseUser = rarityConfigByGacha?.[BASE_KEY] || {};
      if (!baseUser[rarity]) { alert("既定ベースのレアリティは削除できません。"); return; }
      delete baseUser[rarity];
      saveRarityConfig();
      dispatchChanged();
      renderTable();
      return;
    }

    // 既に誰かが引いているか？
    const used = hasAnyHitForRarity(current, rarity);

    const proceed = (onOk)=>{
      // 既存の「アイテム削除」モーダル流用（存在すれば）
      if (typeof window.openConfirmDialog === 'function'){
        window.openConfirmDialog({
          title: "確認",
          message: used ? "すでにガチャを引いた方がいますが、本当に削除しますか？" : "削除しますか？",
          confirmText: "削除する",
          onConfirm: onOk,
        });
      }else{
        // フォールバック
        const ok = confirm(used ? "すでにガチャを引いた方がいますが、本当に削除しますか？" : "削除しますか？");
        if (ok) onOk();
      }
    };

    proceed(()=>{
      const cfg = (rarityConfigByGacha[current] ||= {});
      delete cfg[rarity];
      saveRarityConfig();
      dispatchChanged();
      renderTable();
    });
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
    let total = 0;

    const rows = rarities.map(r => {
      const m = getRarityMeta(current, r);
      const color = sanitizeColor(m.color) || '#ffffff';
      const num = (typeof m.rarityNum === 'number') ? m.rarityNum : '';
      const rate = (typeof m.emitRate === 'number') ? String(m.emitRate) : '';
      if (typeof m.emitRate === 'number') total += m.emitRate;

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
    sumHint.textContent = (total>0) ? `排出率の合計: ${total.toFixed(2)}%` : '';
  }

  function updateSumHint(){
    if (current === BASE_KEY){ sumHint.textContent = ''; return; }
    let t = 0;
    const cfg = rarityConfigByGacha[current] || {};
    for (const r of Object.keys(cfg)){ const v = cfg[r]?.emitRate; if (typeof v === 'number') t += v; }
    sumHint.textContent = (t>0) ? `排出率の合計: ${t.toFixed(2)}%` : '';
  }

  // 初期化：AppStateBridge 準備待ち＋明示呼び出し
  const kickoff = ()=>{
    current = BASE_KEY; // 既定でベース
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

// =============== 追加モーダル（カスタムレアリティ） ===============
function ensureAddModal(){
  if (document.getElementById('rarityAddModal')) return;
  const div = document.createElement('div');
  div.innerHTML = `
  <dialog id="rarityAddModal">
    <form method="dialog" class="modal">
      <h3>カスタムレアリティを追加</h3>
      <div class="grid two-col" style="gap:8px">
        <label>カスタムレアリティ名
          <input type="text" id="rarityAddName" placeholder="例：限定" required>
        </label>
        <label>レアリティの強さ (rarityNum)
          <input type="number" id="rarityAddNum" min="0" max="999" step="1" value="1" required>
        </label>
        <label>色
          <div id="rarityAddColorHost"></div>
        </label>
      </div>
      <div class="modal-actions">
        <button type="submit" id="rarityAddOk" class="btn primary">追加</button>
        <button type="button" id="rarityAddCancel" class="btn">キャンセル</button>
      </div>
    </form>
  </dialog>`;
  document.body.appendChild(div.firstElementChild);
}

function openAddModal({ onSubmit }){
  const dlg = document.getElementById('rarityAddModal');
  const name = dlg.querySelector('#rarityAddName');
  const num = dlg.querySelector('#rarityAddNum');
  const colorHost = dlg.querySelector('#rarityAddColorHost');
  name.value = ''; num.value = '1';
  let _addColorValue = '#ffffff';
  import("/src/color_picker.js").then(mod => {
    mod.mountColorPicker(colorHost, {
      value: _addColorValue,
      onChange: v => { _addColorValue = v; }
    });
  });

  const onCancel = ()=> dlg.close();
  const onOk = (ev)=>{
    ev?.preventDefault?.();
    const n = name.value.trim();
    const vv = clampInt(parseInt(num.value, 10), 0, 999);
    const cc = (_addColorValue === "rainbow") ? "rainbow" :
           (sanitizeColor(_addColorValue) || '#ffffff');
    if (!n){ name.focus(); return; }
    if (vv === null){ num.focus(); return; }
    try{ onSubmit && onSubmit({ name:n, rarityNum: vv, color: cc }); }
    finally{ dlg.close(); }
  };

  dlg.addEventListener('close', ()=> {
    // cleanup listeners
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
    form.removeEventListener('submit', onOk);
  }, { once:true });

  const form = dlg.querySelector('form');
  const okBtn = dlg.querySelector('#rarityAddOk');
  const cancelBtn = dlg.querySelector('#rarityAddCancel');
  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', onCancel);
  form.addEventListener('submit', onOk);

  dlg.showModal();
}

// =============== ヘルパ群 ===============
function hasAnyHitForRarity(gacha, rarity){
  const { gData, gHitCounts } = getStateSafe();
  // counts 優先（実数）、無ければ data（種の集合）
  if (gHitCounts){
    for (const u of Object.keys(gHitCounts)){
      const perG = gHitCounts[u]?.[gacha]?.[rarity];
      if (!perG) continue;
      for (const code of Object.keys(perG)){
        if ((perG[code] || 0) > 0) return true;
      }
    }
  }
  if (gData){
    for (const u of Object.keys(gData)){
      const perG = gData[u]?.[gacha];
      if (!perG) continue;
      const items = perG.items || {};
      if ((items[rarity] || []).length) return true;
    }
  }
  return false;
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
