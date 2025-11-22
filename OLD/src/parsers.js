/* ====== 解析: 出現アイテム一覧 ======
   行の並びが ①タブ区切り（1\tR\t7.5%\tC）
            または ②縦4行（1 / R / 7.5% / C） を両対応 */
export function parseCatalogText(text){
  const items = [];
  const clean = text.replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').trim();
  // ① タブ区切り
  const reTab = /^\s*\d+\s*\t\s*([^\t]+)\t([^\t\n]+)\t([^\t\n]+)\s*$/gm;
  let m;
  while((m = reTab.exec(clean)) !== null){
    const rarity=(m[1]||"").trim(); const code=(m[3]||"").trim();
    if(rarity) items.push({rarity, code});
  }
  if(items.length>0) return items;

  // ② 縦4行
  const lines = clean.split(/\n+/);
  // ヘッダ除去
  while(lines.length && /No\./.test(lines[0])) lines.shift();
  while(lines.length && /レアリティ|景品名|出現率/.test(lines[0])) lines.shift();

  for(let i=0;i+3<lines.length;i++){
    const a=lines[i].trim(), b=lines[i+1].trim(), c=lines[i+2].trim(), d=lines[i+3].trim();
    if(/^\d+$/.test(a) && b && d){ items.push({rarity:b, code:d}); i+=3; }
  }
  return items;
}

/* ====== 解析: 手動入力（1ブロック） ====== */
export function splitLiveBlocks(text){
  const clean = text.replace(/\r/g, '').trim();
  // 「#なまずつーるず」(末尾に空白があっても可) だけを区切りに採用
  return clean
    .split(/#なまずつーるず[^\S\r\n]*/g)
    .map(s => s.trim())
    .filter(Boolean);
}
export function parseLiveBlock(block){
  const lines = block.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(lines.length<3) return null;
  const gacha = lines[0];
  const mUser = /^(.+?)\s*([0-9]+)\s*連$/.exec(lines[1]);
  if(!mUser) return null;
  const user = mUser[1].trim(); const pulls = parseInt(mUser[2],10)||0;
  const items = {};
  const counts = {}; // counts[rarity][code] = number

  for(let i=2;i<lines.length;i++){
    const line = lines[i];
    const m = /【([^】]+)】\s*([^\s　]+)[\s　]+(\d+)個?/.exec(line);
    if(!m) continue;
    const rarity=m[1].trim(), code=m[2].trim(), num=parseInt(m[3],10)||0;
    items[rarity]=items[rarity]||[]; if(!items[rarity].includes(code)) items[rarity].push(code);
    counts[rarity]=counts[rarity]||{}; counts[rarity][code]=(counts[rarity][code]||0)+num;
  }
  return {gacha,user,pulls,items,counts};
}

// base64 → Uint8Array（URL-safe/改行を除去）
export function b64ToBytes(b64){
  const s = (b64||"").replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const bin = atob(s + '='.repeat(pad));
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

