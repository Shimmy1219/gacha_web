// /src/color_picker.js
// 20色＋カスタム＋虹色。ポップオーバーは body 直下に“浮かせる”実装。
// 金/銀は簡易メタリック表現。

export const RAINBOW_VALUE = "rainbow";

const GOLD_HEX   = "#d4af37";
const SILVER_HEX = "#c0c0c0";

export const DEFAULT_PALETTE = [
  // 既存ベース色
  { name: "UR(Amber)", value: "#f59e0b" },
  { name: "SSR(Yellow)", value: "#fde68a" },
  { name: "SR(Violet)", value: "#a78bfa" },
  { name: "R(LightBlue)", value: "#93c5fd" },
  { name: "N(Mint)", value: "#a7f3d0" },
  { name: "はずれ(Rose)", value: "#fca5a5" },

  // 実用色
  { name: "Red",    value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber",  value: "#eab308" },
  { name: "Lime",   value: "#84cc16" },
  { name: "Green",  value: "#22c55e" },
  { name: "Teal",   value: "#14b8a6" },
  { name: "Cyan",   value: "#06b6d4" },
  { name: "Blue",   value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink",   value: "#ec4899" },
  { name: "Rose",   value: "#f43f5e" },

  // 指定：金/銀/モノトーン
  { name: "金", value: GOLD_HEX },
  { name: "銀", value: SILVER_HEX },
  { name: "黒", value: "#111111" },
  { name: "灰", value: "#9ca3af" },
  { name: "白", value: "#ffffff" },

  // スペシャル
  { name: "虹", value: RAINBOW_VALUE },
];

let _styleInjected = false;
function injectStyles(){
  if (_styleInjected) return; _styleInjected = true;
  const css = `
  .cp-root{ position:relative; display:inline-block; }
  .cp-chip{ width:44px; height:32px; border-radius:8px; border:1px solid var(--border);
            background:transparent; cursor:pointer; display:inline-grid; place-items:center; }
  .cp-chip .chip{ width:28px; height:18px; border-radius:5px; border:1px solid var(--border); }
  .cp-chip.rainbow .chip{
    background: linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f);
    border-color: transparent;
  }
  /* 金属調（簡易） */
  .cp-chip.metal-gold .chip{
    background:
      linear-gradient(135deg, #7a5c13 0%, #ffd56a 30%, #a67c00 50%, #ffe69a 70%, #7a5c13 100%);
    border-color: #b08d1a;
  }
  .cp-chip.metal-silver .chip{
    background:
      linear-gradient(135deg, #6b7280 0%, #e5e7eb 35%, #9ca3af 55%, #f3f4f6 75%, #6b7280 100%);
    border-color: #9ca3af;
  }

  /* === ポップオーバーは body 直下に固定配置（panel の overflow を回避） === */
  .cp-pop{ position:fixed; z-index:4000; left:0; top:0; display:none;
           background: var(--panel); border:1px solid var(--border); border-radius:12px;
           box-shadow: var(--shadow); padding:10px; }
  .cp-pop.open{ display:block; }

  .cp-grid{ display:grid; grid-template-columns: repeat(6, 28px); gap:8px; }
  .cp-swatch{ width:28px; height:28px; border-radius:6px; border:1px solid var(--border); cursor:pointer; }
  .cp-swatch[data-v="${RAINBOW_VALUE}"]{
    background: linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f); border-color: transparent;
  }
  /* 金属調スウォッチ */
  .cp-swatch.metal-gold{
    background:
      linear-gradient(135deg, #7a5c13 0%, #ffd56a 30%, #a67c00 50%, #ffe69a 70%, #7a5c13 100%);
    border-color:#b08d1a;
  }
  .cp-swatch.metal-silver{
    background:
      linear-gradient(135deg, #6b7280 0%, #e5e7eb 35%, #9ca3af 55%, #f3f4f6 75%, #6b7280 100%);
    border-color:#9ca3af;
  }

  .cp-row{ display:flex; gap:8px; align-items:center; margin-top:10px; }
  .cp-custom{ border:1px dashed var(--border); border-radius:6px; padding:6px 8px; font-size:.85rem; }
  .cp-native{ position:absolute; left:-9999px; opacity:0; }

  /* 虹色テキスト（既存の rarity 表示用） */
  .rarity.rainbow{
    background: linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f);
    -webkit-background-clip: text; background-clip: text; color: transparent !important;
  }`;
  const st = document.createElement('style'); st.textContent = css;
  document.head.appendChild(st);
}

function isMetal(v){ return v === GOLD_HEX || v === SILVER_HEX; }
function isGold(v){ return v === GOLD_HEX; }
function isSilver(v){ return v === SILVER_HEX; }

let _currentOpen = null; // 同時に1つだけ開く

function clampToViewport(x, y, w, h, margin=8){
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const nx = Math.min(Math.max(margin, x), Math.max(margin, vw - w - margin));
  const ny = Math.min(Math.max(margin, y), Math.max(margin, vh - h - margin));
  return [Math.round(nx), Math.round(ny)];
}

export function mountColorPicker(hostEl, { value = "#ffffff", onChange, palette = DEFAULT_PALETTE } = {}){
  injectStyles();

  const root = document.createElement('div');
  root.className = 'cp-root';

  const chipBtn = document.createElement('button');
  chipBtn.type = 'button';
  chipBtn.className = 'cp-chip';
  chipBtn.setAttribute('aria-haspopup', 'dialog');
  chipBtn.innerHTML = `<span class="chip"></span>`;
  root.appendChild(chipBtn);

  // ポップは最初から body 直下に作る（パネルの overflow: hidden を避ける）
  const pop = document.createElement('div');
  pop.className = 'cp-pop';
  pop.innerHTML = `
    <div class="cp-grid"></div>
    <div class="cp-row">
      <button type="button" class="cp-custom">カスタム…</button>
      <input type="color" class="cp-native" value="#ffffff" />
    </div>`;
  document.body.appendChild(pop);

  // build swatches
  const grid = pop.querySelector('.cp-grid');
  palette.forEach(({ name, value: v })=>{
    const b = document.createElement('button');
    b.type='button'; b.className='cp-swatch'; b.title = name; b.dataset.v = v;
    if (v === RAINBOW_VALUE){
      // styleはCSS側
    }else if (v === GOLD_HEX){
      b.classList.add('metal-gold');
    }else if (v === SILVER_HEX){
      b.classList.add('metal-silver');
    }else{
      b.style.background = v;
    }
    grid.appendChild(b);
  });

  const nativeBtn = pop.querySelector('.cp-custom');
  const nativeIn  = pop.querySelector('.cp-native');

  function setChipVisual(v){
    chipBtn.classList.toggle('rainbow', v === RAINBOW_VALUE);
    chipBtn.classList.toggle('metal-gold', isGold(v));
    chipBtn.classList.toggle('metal-silver', isSilver(v));
    const chip = chipBtn.querySelector('.chip');
    if (v === RAINBOW_VALUE || isMetal(v)){
      chip.style.background = ''; // 背景はクラスで
    }else{
      chip.style.background = v;
    }
  }

  function setValue(v, trigger=true){
    setChipVisual(v);
    chipBtn.dataset.value = v;
    if (trigger && typeof onChange === 'function') onChange(v);
  }

  function positionPopover(){
    const r = chipBtn.getBoundingClientRect();
    // 一旦表示してサイズを測る
    pop.style.visibility = 'hidden';
    pop.classList.add('open');
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.classList.remove('open');
    pop.style.visibility = '';

    const [x,y] = clampToViewport(r.left, r.bottom + 6, w, h, 8);
    pop.style.left = x + 'px';
    pop.style.top  = y + 'px';
  }

  function openPopover(){
    if (_currentOpen && _currentOpen !== closePopover) _currentOpen();
    positionPopover();
    pop.classList.add('open');
    _currentOpen = closePopover;
    window.addEventListener('scroll', closePopover, { passive:true, once:true });
    window.addEventListener('resize', closePopover, { passive:true, once:true });
  }

  function closePopover(){
    pop.classList.remove('open');
    if (_currentOpen === closePopover) _currentOpen = null;
  }

  chipBtn.addEventListener('click', ()=>{
    if (pop.classList.contains('open')) closePopover(); else openPopover();
  });

  grid.addEventListener('click', (e)=>{
    const b = e.target.closest('.cp-swatch'); if(!b) return;
    setValue(b.dataset.v, true);
    closePopover();
  });

  nativeBtn.addEventListener('click', ()=>{
    const v = chipBtn.dataset.value;
    if (v && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) nativeIn.value = v;
    nativeIn.click();
  });
  nativeIn.addEventListener('input', ()=>{
    const v = nativeIn.value || '#ffffff';
    setValue(v, true);
  });

  document.addEventListener('pointerdown', (e)=>{
    // root でも pop でもない場所を押したら閉じる
    if (!pop.classList.contains('open')) return;
    const inRoot = root.contains(e.target);
    const inPop  = pop.contains(e.target);
    if (!inRoot && !inPop) closePopover();
  });

  // 初期状態
  setValue(value, false);

  // 宿主を差し替え
  hostEl.replaceWith(root);
  return root;
}
