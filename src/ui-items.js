/* ui-items.js
 * 目的:
 *  - ガチャタブの描画（追加ボタン / ×削除ボタン含む）
 *  - アイテムカードグリッドの描画（画像設定 / 解除 / リアグ / アイテム削除ボタン含む）
 *  - タブのモバイル向け pointerdown 最適化
 *
 * 依存（グローバル）:
 *   gAllGachas, selectedGacha, gItemsByGacha
 *   keyOf, skipHas, lookupVal, thumbInnerHTML, resolveThumbs
 *   openDeleteConfirm, openImageModal, openRiaguModal, openItemDeleteConfirm, clearImage
 *   getSelectedRarities (filters.js), $, $$, open, startModal
 */

(function (global) {
  'use strict';

  const $  = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  // --- 安全に選択ガチャを決定 ---
  function firstGacha() {
    const arr = global.gAllGachas || [];
    return arr.length ? arr[0] : null;
  }
  function ensureSelectedGacha() {
    const list = global.gAllGachas || [];
    if (!global.selectedGacha || !list.includes(global.selectedGacha)) {
      global.selectedGacha = firstGacha();
    }
    return global.selectedGacha;
  }

  // ---------- タブ描画 ----------
  function renderTabs() {
    const tabs = $("#gachaTabs");
    if (!tabs) return;

    tabs.innerHTML = "";

    const gachas = Array.isArray(global.gAllGachas) ? global.gAllGachas : [];
    const sel = ensureSelectedGacha();

    // 既存ガチャのタブ
    gachas.forEach((g) => {
      const el = document.createElement("div");
      el.className = "tab" + (sel === g ? " active" : "");
      el.textContent = g;
      el.dataset.gacha = g;

      // タブ選択
      el.addEventListener("click", () => {
        global.selectedGacha = g;
        $$(".tab", tabs).forEach(t => t.classList.toggle("active", t.dataset.gacha === g));
        renderItemGrid();
      });

      // 右上 ×（ガチャ削除）
      const x = document.createElement("button");
      x.type = "button";
      x.className = "close";
      x.textContent = "×";
      x.title = "このガチャを削除";
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (typeof global.openDeleteConfirm === "function") global.openDeleteConfirm(g);
      });
      el.appendChild(x);

      tabs.appendChild(el);
    });

    // “＋” 追加タブ（開始モーダルを開く） — ガチャ0件でも必ず表示
    const add = document.createElement("div");
    add.className = "tab add";
    add.title = "ガチャの種類を追加";
    add.textContent = "＋";
    add.style.fontWeight = "800";
    add.style.borderStyle = "solid";
    add.addEventListener("click", () => global.open?.(global.startModal));
    tabs.appendChild(add);
  }

  // ---------- アイテムカードグリッド ----------
  function renderItemGrid() {
    const grid = $("#itemGrid");
    if (!grid) return;

    grid.innerHTML = "";

    const g = ensureSelectedGacha();
    if (!g) {
      // ガチャが本当に空（0件）のときだけ案内を表示
      grid.textContent = "ガチャがありません。開始メニューから定義またはJSONを読み込んでください。";
      return;
    }

    const rSel = global.getSelectedRarities ? global.getSelectedRarities() : "*";
    const all = (global.gItemsByGacha?.[g] || []);
    const list = rSel === "*" ? all : all.filter(it => rSel.has(it.rarity));

    for (const it of list) {
      const key = global.keyOf(it.gacha, it.rarity, it.code);
      const skipped  = !!global.skipHas?.(key);
      const hasImage = !!global.lookupVal?.(global.imgMap || {}, key);

      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <div class="item-thumb" data-thumb-key="${key}">${global.thumbInnerHTML?.(it) || ""}</div>
        <div class="item-code">${(global.escapeHtml ? global.escapeHtml(it.code) : String(it.code))}</div>
        <div class="muted"><span class="rarity ${it.rarity}">${it.rarity}</span></div>
        <div class="card-actions">
          <button class="btn" data-action="primary"${skipped ? " disabled" : ""}>${hasImage ? "解除" : "画像設定"}</button>
          <button class="btn ghost" data-action="skip">${skipped ? "リアグ解除" : "リアグ"}</button>
        </div>
        <div class="flag">
          <span class="badge">${it.gacha} / ${it.rarity}:${(global.escapeHtml ? global.escapeHtml(it.code) : String(it.code))}</span>
          ${skipped ? '<span class="badge skip">リアグ</span>' : ""}
        </div>`;

      // 画像設定 / 解除
      card.querySelector('[data-action="primary"]').addEventListener("click", () => {
        const nowHas = !!global.lookupVal?.(global.imgMap || {}, key);
        if (nowHas) { global.clearImage?.(it); }
        else        { global.openImageModal?.(it); }
      });

      // リアグ切替
      card.querySelector('[data-action="skip"]').addEventListener("click", () => {
        global.openRiaguModal?.(it);
      });

      // 右上 ×（アイテム削除）
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "close";
      closeBtn.textContent = "×";
      closeBtn.title = "このアイテムを削除";
      closeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        global.openItemDeleteConfirm?.(it);
      });
      card.appendChild(closeBtn);

      grid.appendChild(card);
    }

    // 遅延サムネ解決（IndexedDB / Blob URL）
    global.resolveThumbs?.(grid);
  }

  // ---------- タブの pointerdown バインド（モバイル向け反応改善） ----------
  function bindTabsPointerDownOnce() {
    document.addEventListener("DOMContentLoaded", () => {
      const wrap = document.getElementById("gachaTabs");
      if (wrap && !wrap.__boundPointer) {
        wrap.addEventListener("pointerdown", (e) => {
          const t = e.target.closest(".tab");
          if (!t || t.classList.contains("add")) return;
          const g = t.dataset.gacha; if (!g) return;
          global.selectedGacha = g;
          $$(".tab", wrap).forEach(x => x.classList.toggle("active", x.dataset.gacha === g));
          renderItemGrid();
          e.preventDefault(); // 300ms 遅延/ゴーストクリック抑止
        }, { passive: false });
        wrap.__boundPointer = true;
      }
    });
  }

  // 公開
  global.renderTabs     = renderTabs;
  global.renderItemGrid = renderItemGrid;

  // 初期描画（DOM 構築後に「必ず」タブ→グリッドの順で）
  document.addEventListener("DOMContentLoaded", () => {
    renderTabs();
    renderItemGrid();
  });

  bindTabsPointerDownOnce();

})(window);
