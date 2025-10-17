// /src/rarity_style.js
import { RAINBOW_VALUE, GOLD_HEX, SILVER_HEX } from "/src/color_picker.js";

// 色トークンから class と style を決める純関数
export function rarityClassAndStyle(color) {
  const isRainbow = color === RAINBOW_VALUE;
  const isGold    = color === GOLD_HEX;
  const isSilver  = color === SILVER_HEX;

  const className = [
    "rarity", "rarity-name",
    isRainbow && "rainbow",
    isGold    && "metal-gold",
    isSilver  && "metal-silver",
  ].filter(Boolean).join(" ");

  // 虹色／金銀はクラスで見た目を出すので style は空
  const style = (isRainbow || isGold || isSilver) ? "" : (color ? `color:${color}` : "");

  return { className, style, isRainbow, isGold, isSilver };
}

// ① rarity-name の <span> を “HTML文字列” として生成
export function rarityNameSpanHTML(label, color, { attrs = {}, extraClasses = "" } = {}) {
  const { className, style } = rarityClassAndStyle(color);
  const cls = extraClasses ? `${className} ${extraClasses}` : className;
  const styleAttr = style ? ` style="${style}"` : "";
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => v === true ? k : `${k}="${escapeHtml(String(v))}"`)
    .join(" ");

  return `<span class="${cls}" ${attrStr}${styleAttr}>${escapeHtml(label)}</span>`;
}

// ② 既存 DOM 要素に色・クラスを“上書き適用”
export function applyRarityColor(el, color) {
  if (!el) return;
  const { isRainbow, isGold, isSilver } = rarityClassAndStyle(color);

  // ベースの2クラスは常に付与（剥がされていても復旧）
  el.classList.add("rarity", "rarity-name");

  el.classList.toggle("rainbow",      isRainbow);
  el.classList.toggle("metal-gold",   isGold);
  el.classList.toggle("metal-silver", isSilver);

  // 虹/金/銀は style.color を消し、通常色は直接 color を当てる
  el.style.color = (isRainbow || isGold || isSilver) ? "" : (color || "");
}

// ローカル util（外部依存を増やさないため簡易実装）
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  })[m]);
}
