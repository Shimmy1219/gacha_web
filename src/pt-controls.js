// pt-controls.js
// レアリティ設定セクション内の .subcontrols に「PT課金設定」フォームを動的挿入。
// 見た目は pt-input と同等のスタイルを適用。保存先は window + gacha_global_setting_v1（キーは gachaId ）。

(function(){
  'use strict';

  const GLOBAL_NS = 'gacha_global_setting_v1';
  let CURRENT_GACHA = null;  // ← gachaId を保持

  // ========== Storage ==========
  function _getApp(){
    const S = window.Services || {};
    return S.app || S.appStateService || null;
  }
  function loadAll(){
    // 優先: window グローバル
    const w = (window[GLOBAL_NS] && typeof window[GLOBAL_NS] === 'object') ? window[GLOBAL_NS] : null;
    if (w) return { ...w };

    // 次点: AppState の state[GLOBAL_NS]（任意領域）
    try{
      const app = _getApp();
      const raw = app?.state?.[GLOBAL_NS] || null;
      if (raw && typeof raw === 'object') return { ...raw };
    }catch(_){}

    // 最後: localStorage
    try{ return JSON.parse(localStorage.getItem(GLOBAL_NS) || '{}'); }catch(_){ return {}; }
  }
  function saveAll(obj){
    const data = obj || {};
    // 1) window 反映
    window[GLOBAL_NS] = { ...data };

    // 2) AppState の任意領域に反映（存在すれば）
    try{
      const app = _getApp();
      if (app?.save){
        app.state = app.state || {};
        app.state[GLOBAL_NS] = { ...data };
        app.save();
      }
    }catch(_){}

    // 3) localStorage 退避
    try{ localStorage.setItem(GLOBAL_NS, JSON.stringify(data)); }catch(_){}
  }
  function loadFor(gachaId){
    const all = loadAll();
    return all[gachaId] || { perPull:0, complete:0, bundles:[], guarantees:[] };
  }
  function saveFor(gachaId, meta){
    const all = loadAll();
    all[gachaId] = meta;
    saveAll(all);
  }

  // ========== State helpers ==========
  function getSelectedGacha(){
    // まずは pt-controls が最後に render した gachaId を信頼
    if (CURRENT_GACHA) return CURRENT_GACHA;

    // フォールバック：アプリ側が持つ選択状態 or グローバル
    const app = _getApp();
    // AppState v2 の selected は gachaId
    return app?.getSelectedGacha?.() ?? app?.state?.selected ?? window.selectedGacha ?? null;
  }
  function listRarities(gachaId){
    const S = window.Services || {};
    const r = S.rarity || S.rarityService || null;
    if (r?.listRarities){
      const a = r.listRarities(gachaId);
      if (Array.isArray(a) && a.length) return a.slice();
    }
    // フォールバック：AppState のカタログから拾う
    const app = _getApp();
    const items = app?.getCatalog?.(gachaId)?.items || {};
    const names = Object.keys(items);
    return names.length ? names : ['UR','SSR','SR','R','N','はずれ'];
  }

  // ========== DOM helpers ==========
  function h(tag, props={}, ...kids){
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(props)){
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    kids.flat().forEach(k=> k && el.appendChild(k));
    return el;
  }
  function injectOnce(id, css){
    if (document.getElementById(id)) return;
    const s = document.createElement('style'); s.id = id; s.textContent = css;
    document.head.appendChild(s);
  }

  // 1行削除ボタン
  function delBtn(onClick){
    // tiny → small に変更（＋と同じサイズ感）
    const b = h('button', {
      type: 'button',
      class: 'btn small ghost btn-inline',
      text: '－'
    });
    b.style.marginLeft = 'auto';
    b.addEventListener('click', onClick);
    return b;
  }

  // 3) バンドル行追加
  function addBundleRow(wrap, rowData){
    const ipPt    = h('input', { type:'number', min:'0', step:'1',
      class:'pt-input', placeholder:'pt' });
    const ipPulls = h('input', { type:'number', min:'1', step:'1',
      class:'pt-input', placeholder:'連' });
    if (rowData){
      if (rowData.pt != null)    ipPt.value = rowData.pt;
      if (rowData.pulls != null) ipPulls.value = rowData.pulls;
    }
    const row = h('div', { class:'pt-item-row' },
      ipPt, h('span',{text:'ptで'}), ipPulls, h('span',{text:'連'}),
      delBtn(()=> row.remove())
    );
    wrap.appendChild(row);
  }

  // 4) 保証行追加
  function addGuaranteeRow(wrap, rowData){
    const gachaId = getSelectedGacha();
    const rars  = listRarities(gachaId);
    const ipN   = h('input', { type:'number', min:'1', step:'1',
      class:'pt-input', placeholder:'n' });
    const sel   = h('select', { class:'pt-select' });
    rars.forEach(rv => sel.appendChild(h('option', { value: rv, text: rv })));
    if (rowData){
      if (rowData.minPulls != null) ipN.value = rowData.minPulls;
      if (rowData.minRarity)        sel.value = rowData.minRarity;
    }
    const row = h('div', { class:'pt-item-row' },
      ipN, h('span',{text:'連以上で'}), sel, h('span',{text:'以上確定'}),
      delBtn(()=> row.remove())
    );
    wrap.appendChild(row);
  }

  // ルートUI（h3の「PT課金設定」は入れない）
  function buildUI(){

    // 1回の消費pt
    const rowPerPull = h('div', { class:'pt-controls-row' },
      h('div',{class:'usc-label', text:'1回の消費pt'}),
      h('div',{class:'inline'},
        h('input',{ id:'ptPerPull', type:'number', min:'0', step:'1',
          class:'pt-input', placeholder:'10' })
      )
    );

    // コンプpt
    const rowComplete = h('div', { class:'pt-controls-row' },
      h('div',{class:'usc-label', text:'コンプpt'}),
      h('div',{class:'inline'},
        h('input',{ id:'ptComplete', type:'number', min:'0', step:'1',
          class:'pt-input', placeholder:'1000' })
      )
    );

    // ラベル下に出すフォームの“中身”コンテナ
    const bundlesWrap    = h('div', { id:'ptBundles',    class:'stack' });     // ← nowrap → stack
    const guaranteesWrap = h('div', { id:'ptGuarantees', class:'stack' }); 

    // お得バンドル：ラベル行（右は+ボタンのみ）
    const rowBundle = h('div', { class:'pt-controls-row' },
      h('div',{class:'usc-label', text:'お得バンドル（n ptで m 連）'}),
      h('div',{class:'inline'},
        h('button',{ id:'ptBundleAddBtn', type:'button',
          class:'btn small btn-inline', text:'＋' })
      )
    );
    // ラベル直下の全幅行
    const rowBundleBody = h('div', { class:'pt-controls-row-sub fullspan' }, bundlesWrap);

    // 保証：ラベル行（右は+ボタンのみ）
    const rowGuarantee = h('div', { class:'pt-controls-row' },
      h('div',{class:'usc-label', text:'保証（n連以上で ○○ 以上確定）'}),
      h('div',{class:'inline'},
        h('button',{ id:'ptGuaranteeAddBtn', type:'button',
          class:'btn small btn-inline', text:'＋' })
      )
    );
    // ラベル直下の全幅行
    const rowGuaranteeBody = h('div', { class:'pt-controls-row-sub fullspan' }, guaranteesWrap);

    // ルート
    const root = h('div', { class:'subcontrols pt-controls', id:'ptControls' },
      rowPerPull,
      rowComplete,
      rowBundle,
      rowBundleBody,
      rowGuarantee,
      rowGuaranteeBody
    );
    return root;
  }

  // 描画・読み取り
  function render(gachaId){
    if (!gachaId) return;

    // ★ この表示フォームが紐づく gachaId を固定
    CURRENT_GACHA = gachaId;

    // 1) ロード（無ければデフォルトを用意）
    let meta = loadFor(gachaId);
    const existed =
      !!(window.gacha_global_setting_v1 && gachaId in window.gacha_global_setting_v1) ||
      !!((_getApp()?.state?.gacha_global_setting_v1 || null) &&
        (gachaId in _getApp().state.gacha_global_setting_v1)) ||
      !!(localStorage.getItem('gacha_global_setting_v1') &&
        (function(){
            try{
              const o = JSON.parse(localStorage.getItem('gacha_global_setting_v1')||'{}');
              return gachaId in o;
            }catch(_){ return false; }
          })());

    // 2) UI参照
    const ip1 = document.getElementById('ptPerPull');
    const ip2 = document.getElementById('ptComplete');
    const bW  = document.getElementById('ptBundles');
    const gW  = document.getElementById('ptGuarantees');
    if (!ip1 || !ip2 || !bW || !gW) return;

    // 3) 値をフォームへ
    ip1.value = String(meta.perPull ?? 0);
    ip2.value = String(meta.complete ?? 0);

    // 4) バンドル描画（最低1行は表示）
    bW.innerHTML = '';
    const bundles = Array.isArray(meta.bundles) ? meta.bundles : [];
    if (bundles.length === 0) {
      addBundleRow(bW, null);
    } else {
      bundles.forEach(b => addBundleRow(bW, b));
    }

    // 5) 保証描画（最低1行は表示）
    gW.innerHTML = '';
    const guarantees = Array.isArray(meta.guarantees) ? meta.guarantees : [];
    if (guarantees.length === 0) {
      addGuaranteeRow(gW, null);
    } else {
      guarantees.forEach(x => addGuaranteeRow(gW, x));
    }

    // 6) 初回生成なら、今のフォーム状態を保存して “ある状態” にする
    if (!existed) {
      const now = readFromForm();
      saveFor(gachaId, now);
    }
  }

  function hasSetting(gachaId){
    const all = loadAll();
    return Object.prototype.hasOwnProperty.call(all, gachaId);
  }

  function readFromForm(){
    const perPull  = parseInt(document.getElementById('ptPerPull')?.value || '0', 10) || 0;
    const complete = parseInt(document.getElementById('ptComplete')?.value || '0', 10) || 0;

    // ← 修正ポイント：row 内の <input> は 2 つだけ（pt, pulls）
    const bundles = Array.from(document.querySelectorAll('#ptBundles .pt-item-row')).map(row=>{
      const inputs = row.querySelectorAll('input'); // [0]=pt, [1]=pulls
      const iptPt    = inputs[0];
      const iptPulls = inputs[1];
      return {
        pt:    parseInt(iptPt?.value    || '0', 10) || 0,
        pulls: parseInt(iptPulls?.value || '0', 10) || 0
      };
    }).filter(x => x.pt > 0 && x.pulls > 0);

    const guarantees = Array.from(document.querySelectorAll('#ptGuarantees .pt-item-row')).map(row=>{
      const iptN = row.querySelector('input');
      const sel  = row.querySelector('select');
      return {
        minPulls:  parseInt(iptN?.value || '0', 10) || 0,
        minRarity: (sel?.value || '').trim()
      };
    }).filter(x => x.minPulls > 0 && x.minRarity);

    return { perPull, complete, bundles, guarantees };
  }

  // subcontrols 検出
  function findSubcontrolsRoot(explicitRoot){
    if (explicitRoot) return explicitRoot;
    const candidates = [
      '#raritySection', '#rarityPanel', '#raritySettings', '#rarityArea',
      '#settingsRarity', '#tabRarity', '#gachaRarity'
    ];
    for (const sel of candidates){
      const host = document.querySelector(sel);
      const sc = host?.querySelector?.('.subcontrols');
      if (sc) return sc;
    }
    const hds = Array.from(document.querySelectorAll('h1,h2,h3,h4')).filter(h=> /レアリティ/.test(h.textContent||''));
    for (const hd of hds){
      const sc = hd.parentElement?.querySelector?.('.subcontrols');
      if (sc) return sc;
    }
    return document.querySelector('.subcontrols');
  }

  function attach(services, options={}){
    const mountInto = findSubcontrolsRoot(options.root || null);
    if (!mountInto) return false;

    let root = mountInto.querySelector('#ptControls');
    if (!root){
      root = buildUI();
      mountInto.appendChild(root);

      // 追加ボタン
      root.querySelector('#ptBundleAddBtn')?.addEventListener('click', ()=>{
        addBundleRow(root.querySelector('#ptBundles'));
      });
      root.querySelector('#ptGuaranteeAddBtn')?.addEventListener('click', ()=>{
        addGuaranteeRow(root.querySelector('#ptGuarantees'));
      });

      // オートセーブ：入力/変更/追加・削除の都度
      const autoSave = () => {
        // ★ 表示中 gachaId を最優先で保存
        const g = CURRENT_GACHA || getSelectedGacha();
        if (!g) return;
        saveFor(g, readFromForm());
      };
      root.addEventListener('input',  autoSave);
      root.addEventListener('change', autoSave);
      root.addEventListener('click', (e)=>{
        if (e.target.matches('#ptBundleAddBtn, #ptGuaranteeAddBtn, .btn.small.ghost')) {
          setTimeout(autoSave, 0);
        }
      });
    }

    const g = getSelectedGacha();
    if (g) render(g);

    return true;
  }

  // 公開API
  window.PTControls = {
    attach,
    renderPtControls: (gachaId)=> render(gachaId || getSelectedGacha()),
    loadFor,
    saveFor,
    hasSetting
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    attach(window.Services || {});
  });
})();
