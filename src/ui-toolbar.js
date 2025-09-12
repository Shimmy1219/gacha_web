/* ui-toolbar.js
 * 目的:
 *  - サブコントロール開閉（保存含む）
 *  - ユーザー検索・トグル（#hideMiss / #showCounts / #showSkipOnly）
 *  - 変更時にレンダーを呼び出す（既存の renderUsersList / renderItemGrid / renderRiaguPanel を尊重）
 *
 * 依存:
 *  - index 側にある描画関数: renderUsersList / renderItemGrid / renderRiaguPanel
 *  - 画像マップ関連のグローバル: imgMap / origMap / skipSet / LS_KEY_IMG / LS_KEY_ORIG / LS_KEY_SKIP / idbClear / urlCache
 *  - JSON保存ユーティリティ: saveLocalJSON（なければ localStorage を直叩き）
 */

(function (global) {
  'use strict';

  // ---------- ユーティリティ ----------
  const $id = (id) => document.getElementById(id);

  function tryCall(fn) {
    if (typeof fn === 'function') {
      try { fn(); } catch (e) { console.warn(e); }
    }
  }

  function saveJSONSafe(key, obj) {
    if (typeof global.saveLocalJSON === 'function') {
      tryCall(() => global.saveLocalJSON(key, obj));
    } else {
      try {
        localStorage.setItem(key, JSON.stringify(obj));
      } catch (e) { /* ignore */ }
    }
  }

  // ---------- サブコントロール開閉 ----------
  const LS_KEY_SUBCTRL = 'user_subcontrols_collapsed_v1';
  let subctrlCollapsed = false;

  function loadSubctrlState() {
    try {
      // index 側の loadLocalJSON があれば使う
      if (typeof global.loadLocalJSON === 'function') {
        subctrlCollapsed = !!global.loadLocalJSON(LS_KEY_SUBCTRL, false);
      } else {
        subctrlCollapsed = !!JSON.parse(localStorage.getItem(LS_KEY_SUBCTRL) || 'false');
      }
    } catch {
      subctrlCollapsed = false;
    }
  }

  function persistSubctrlState(v) {
    subctrlCollapsed = !!v;
    saveJSONSafe(LS_KEY_SUBCTRL, subctrlCollapsed);
  }

  function setupSubcontrolsAccordion() {
    const toggle = $id('subcontrolsToggle');
    const body   = $id('subcontrolsBody');
    if (!toggle || !body) return;

    // 初期反映
    const applyState = (instant=false) => {
      toggle.setAttribute('aria-expanded', subctrlCollapsed ? 'false' : 'true');
      if (instant) {
        body.style.transition = 'none';
      }
      if (subctrlCollapsed) {
        body.style.height = '0px';
        body.style.opacity = '0';
      } else {
        body.style.height = 'auto';
        body.style.opacity = '1';
      }
      if (instant) {
        // reflow & transition 復帰
        // eslint-disable-next-line no-unused-expressions
        body.offsetHeight;
        body.style.transition = '';
      }
    };

    applyState(true);

    toggle.addEventListener('click', () => {
      const opening = subctrlCollapsed; // 現在閉じている→開く
      if (opening) {
        // 0 -> scrollHeight にアニメーション
        body.style.height = '0px';
        body.style.opacity = '0';
        // 次フレームで高さを確定
        requestAnimationFrame(() => {
          const h = body.scrollHeight;
          body.style.height = h + 'px';
          body.style.opacity = '1';
        });
      } else {
        // auto -> scrollHeight に一旦固定してから 0 に落とす
        const h = body.scrollHeight;
        body.style.height = h + 'px';
        body.style.opacity = '1';
        requestAnimationFrame(() => {
          body.style.height = '0px';
          body.style.opacity = '0';
        });
      }
      persistSubctrlState(!opening);
      toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');

      const onEnd = (e) => {
        if (e.propertyName !== 'height') return;
        body.removeEventListener('transitionend', onEnd);
        if (!subctrlCollapsed) {
          // 開いた最終形は height:auto に戻しておく
          body.style.height = 'auto';
        }
      };
      body.addEventListener('transitionend', onEnd);
    });
  }

  // ---------- フィルタUI（ユーザー検索＆トグル） ----------
  function setupFilterBindings(onChange) {
    const refresh = () => {
      // 既存の描画ロジックに丸投げ（依存関係は index.html にある）
      tryCall(global.renderUsersList);
      // リアグやアイテム面も連動が自然
      tryCall(global.renderItemGrid);
      tryCall(global.renderRiaguPanel);
      if (typeof onChange === 'function') onChange(getState());
      // 変更通知（オプショナル）
      document.dispatchEvent(new CustomEvent('toolbar:changed', { detail: getState() }));
    };

    const bind = (el, ev) => el && el.addEventListener(ev, refresh);

    bind($id('hideMiss'),     'change');
    bind($id('userSearch'),   'input');
    bind($id('showCounts'),   'change');
    bind($id('showSkipOnly'), 'change');
  }

  function getState() {
    const hideMiss     = !!$id('hideMiss')?.checked;
    const showCounts   = !!$id('showCounts')?.checked;
    const showSkipOnly = !!$id('showSkipOnly')?.checked;
    const userSearch   = String($id('userSearch')?.value || '');
    return { hideMiss, showCounts, showSkipOnly, userSearch, subctrlCollapsed };
  }

  // ---------- 初期化 ----------
  function init(options = {}) {
    loadSubctrlState();
    setupSubcontrolsAccordion();
    setupFilterBindings(options.onChange);
  }

  // 自動起動
  document.addEventListener('DOMContentLoaded', () => init());

  // 参照を公開（状態取得など）
  global.UIToolbar = {
    init,            // 明示初期化したい場合
    getState         // 現在のUI状態をまとめて取得
  };

})(window);
