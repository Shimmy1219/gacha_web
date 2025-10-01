// /src/imp_txt.js
// TXT(base64) -> [JSON直/inflateRaw/inflate] 自動判別 → 正規化 → Service保存（gachaId化） → UI反映

const DEFAULT_RARITY_COLORS = {
  "UR":"#f59e0b","SSR":"#fde68a","SR":"#a78bfa","R":"#93c5fd","N":"#a7f3d0","はずれ":"#fca5a5"
};

/** URL-safe補正 + padding + atob → Uint8Array */
function base64ToU8(base64){
  const fixed = String(base64).replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  const pad   = fixed.length % 4 ? 4 - (fixed.length % 4) : 0;
  const withPad = fixed + '='.repeat(pad);
  const bin = atob(withPad);
  const u8  = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
const td = new TextDecoder('utf-8', { fatal:false });

/** TXT → JSONテキスト（自動判別）。成功すれば { ok:true, text }、失敗なら { ok:false, reason } */
function decodeTxtToJsonText(rawBase64){
  try{
    const u8 = base64ToU8(rawBase64);

    // 1) “プレーンUTF-8のJSON”
    try{
      const t1 = td.decode(u8).trim();
      if (t1.startsWith('{') || t1.startsWith('[')) {
        JSON.parse(t1);
        return { ok:true, text:t1 };
      }
    }catch{/* 次へ */}

    // 2) raw-deflate
    if (window.pako && typeof window.pako.inflateRaw === 'function'){
      try{
        const inflated = window.pako.inflateRaw(u8);
        const t2 = td.decode(inflated).trim();
        JSON.parse(t2);
        return { ok:true, text:t2 };
      }catch(e){ /* 次へ */ }
    }

    // 3) zlib inflate
    if (window.pako && typeof window.pako.inflate === 'function'){
      try{
        const inflated = window.pako.inflate(u8);
        const t3 = td.decode(inflated).trim();
        JSON.parse(t3);
        return { ok:true, text:t3 };
      }catch(e){ /* 次へ */ }
    }

    return { ok:false, reason:'base64は読めたが、JSON/deflateのいずれでも復元できませんでした。' };
  }catch(e){
    return { ok:false, reason:'base64復元に失敗: ' + (e?.message ?? String(e)) };
  }
}

function safeLocaleSort(arr){ arr.sort((a,b)=> String(a).localeCompare(String(b),'ja')); return arr; }

/** namazu系の history_list から data/counts/rarities を構築（※ここでは“名前キー”のまま） */
function buildFromHistoryList(ext, gachaName){
  const data   = {};
  const counts = {};
  const seenR  = new Set();

  const hist = Array.isArray(ext?.gacha_data?.history_list) ? ext.gacha_data.history_list : [];
  for (const rec of hist){
    const user = String(rec?.[0] ?? '').trim(); if (!user) continue;
    const lines = Array.isArray(rec?.[1]) ? rec[1] : [];
    const dg = ((data[user] ||= {})[gachaName] ||= { pulls:0, items:{} });
    const cu = (((counts[user] ||= {})[gachaName] ||= {}));

    for (const row of lines){
      const rarity = String(row?.[1] ?? '').trim(); if (!rarity) continue;
      const code   = String(row?.[2] ?? '').trim(); if (!code) continue;
      const n      = Math.max(1, +row?.[3] || 1);

      seenR.add(rarity);

      dg.pulls += n;
      const list = (dg.items[rarity] ||= []);
      for (let i=0;i<n;i++) list.push(code);

      const cr = (cu[rarity] ||= {});
      cr[code] = (cr[code] || 0) + n;
    }
    Object.keys(dg.items).forEach(r => safeLocaleSort(dg.items[r]));
  }
  return { data, counts, rarities: seenR };
}

function buildCatalogs(ext, gachaName, fallbackData){
  const catalogs = {};
  const cat = (catalogs[gachaName] = { pulls: 0, items: {} });

  // 第一候補: item_base（例: [ '0', 143150, 'N-A' ] ）
  const base = Array.isArray(ext?.gacha_data?.item_base) ? ext.gacha_data.item_base : null;
  if (base && base.length){
    for (const row of base){
      const code = String(row?.[2] ?? '').trim(); if (!code) continue;
      const rarity = String(code.split('-')[0] || '').trim() || 'N';
      const arr = (cat.items[rarity] ||= []);
      if (!arr.includes(code)) arr.push(code);
    }
    Object.keys(cat.items).forEach(r => safeLocaleSort(cat.items[r]));
    return catalogs;
  }

  // 第二候補: history から復元
  for (const user of Object.keys(fallbackData||{})){
    const g = fallbackData[user]?.[gachaName]; if (!g) continue;
    for (const [rarity, codes] of Object.entries(g.items||{})){
      const arr = (cat.items[rarity] ||= []);
      for (const c of codes) if (c && !arr.includes(c)) arr.push(c);
    }
  }
  Object.keys(cat.items).forEach(r => safeLocaleSort(cat.items[r]));
  return catalogs;
}

function applyExternalRarityBase(raritySvc, ext, gachaId){
  if (!raritySvc || !ext || !gachaId) return;
  const rows = Array.isArray(ext?.gacha_data?.rarity_base) ? ext.gacha_data.rarity_base : [];
  if (!rows.length) return;

  const vals = rows.map(r => +((Array.isArray(r)? r[1] : r?.value) ?? 0) || 0);
  const max  = Math.max(...vals,0);
  const scale= (max>100) ? 100 : 1;

  const usedNums = new Set((raritySvc.listRarities?.(gachaId) || [])
    .map(r => raritySvc.getMeta?.(gachaId,r)?.rarityNum)
    .filter(n=>typeof n==='number'));

  const nextNum = ()=>{ for(let i=1;i<=20;i++){ if(!usedNums.has(i)){ usedNums.add(i); return i; } } return 20; };

  for (const row of rows){
    const rarity = String(Array.isArray(row)? row[0] : (row?.name ?? '')).trim();
    if (!rarity) continue;
    const raw = +((Array.isArray(row)? row[1] : row?.value) ?? 0);

    const prev = raritySvc.getMeta(gachaId, rarity) || {};
    raritySvc.upsert(gachaId, rarity, {
      color:     prev.color ?? (DEFAULT_RARITY_COLORS[rarity]||'#c0c0c0'),
      rarityNum: typeof prev.rarityNum==='number' ? prev.rarityNum :
                 ({ "はずれ":0,"N":2,"R":4,"SR":5,"SSR":6,"UR":8 }[rarity] ?? nextNum()),
      emitRate:  raw / scale
    });
  }
}

/** gacha_name_list と gacha_select から人間が付けたガチャ名を取得（表示名） */
function pickGachaName(ext){
  const selRaw = ext?.gacha_select;
  const nameList = ext?.gacha_name_list;

  if (nameList != null){
    if (Array.isArray(nameList)){
      const idx = (typeof selRaw === 'string' && /^\d+$/.test(selRaw)) ? parseInt(selRaw,10) :
                  (typeof selRaw === 'number' ? selRaw : 0);
      const v = nameList[idx];
      if (v) return String(v).trim();
    } else if (typeof nameList === 'object'){
      const key = String(selRaw ?? '').trim();
      if (key && nameList[key]) return String(nameList[key]).trim();
      const firstKey = Object.keys(nameList)[0];
      if (firstKey) return String(nameList[firstKey]).trim();
    }
  }
  return String(ext?.gacha_name || ext?.title || ext?.name || 'ガチャ').trim();
}

function refreshUI(){
  try{ window.rebuildGachaCaches?.(); }catch{}
  try{ window.renderTabs?.(); }catch{}
  try{ window.renderItemGrid?.(); }catch{}
  try{ window.renderUsersList?.(); }catch{}
  try{ window.renderRiaguPanel?.(); }catch{}
  try{ window.startDone?.(); }catch{}
}

/** 表示名から gachaId を決める：一意に同名があれば再利用、なければ新規作成 */
function ensureGachaIdByDisplayName(app, displayName){
  const meta = app?.get?.()?.meta || {};
  const hits = Object.entries(meta).filter(([id, m]) => (m?.displayName || '') === displayName);
  if (hits.length === 1) return hits[0][0];
  return app.createGacha(String(displayName || 'ガチャ'));
}

/** data/counts の“ガチャ名キー”を “gachaIdキー”に変換（appへ upsertHit で投入） */
function applyToAppViaCounts(app, dataByName, countsByName, targetGachaId){
  // counts を正にして、一意に n を入れる（data は catalog 充足のための保険）
  const data   = dataByName   || {};
  const counts = countsByName || {};

  // counts が空でも data を見て upsertHit できるように変換
  const ensureCounts = (user, gName, rarity, code) => {
    ((((counts[user] ||= {})[gName] ||= {})[rarity] ||= {})[code] ||= 0);
    counts[user][gName][rarity][code] += 1;
  };
  if (!Object.keys(counts).length){
    for (const [user, gmap] of Object.entries(data)){
      for (const [gName, info] of Object.entries(gmap||{})){
        for (const [rarity, list] of Object.entries(info?.items||{})){
          for (const code of (list||[])) ensureCounts(user, gName, rarity, code);
        }
      }
    }
  }

  let firstSelected = null;

  for (const [user, gmap] of Object.entries(counts)){
    for (const [gName, rarMap] of Object.entries(gmap||{})){
      // このTXTは「1ガチャ分」を想定していることが多いので targetGachaId を優先
      const gid = targetGachaId || ensureGachaIdByDisplayName(app, gName);
      if (!firstSelected) firstSelected = gid;

      for (const [rarity, codeMap] of Object.entries(rarMap||{})){
        for (const [code, n] of Object.entries(codeMap||{})){
          const num = Math.max(1, +n || 1);
          app.upsertHit(user, gid, rarity, code, num);
        }
      }
    }
  }
  if (firstSelected) app.selectGacha(firstSelected);
}

export class TxtImporter {
  constructor(services = window?.Services || {}){
    this.services = services;
    this.app    = services.app || services.appStateService || null;
    this.rarity = services.rarity || services.rarityService || null;
  }

  _normalize(ext){
    // 互換形（data/catalogs/counts など）が来た場合
    if (ext && typeof ext==='object' && ('data' in ext || 'catalogs' in ext)){
      const gname = pickGachaName(ext);
      const data = ext.data || {};
      return {
        data,
        catalogs: ext.catalogs || buildCatalogs(ext, gname, data),
        counts:   ext.counts   || {},
        selected: null,
        gachaNameHint: gname,
        raw: ext
      };
    }

    // namazuTools 形式
    const gacha = pickGachaName(ext);
    const { data, counts, rarities } = buildFromHistoryList(ext, gacha);
    const catalogs = buildCatalogs(ext, gacha, data);

    return {
      data, catalogs, counts,
      selected: null,
      gachaNameHint: gacha,
      rarities,
      raw: ext
    };
  }

  importObject(ext){
    const norm = this._normalize(ext);
    const app = this.app, raritySvc = this.rarity;
    if (!app) { alert('AppStateService が初期化されていません。'); return; }

    // 表示名 → gachaId を決定
    const gachaId = ensureGachaIdByDisplayName(app, norm.gachaNameHint);

    // Rarity upsert（色/番号）＋ rarity_base の emitRate
    if (raritySvc){
      const rSet = new Set();
      const catItems = norm.catalogs?.[norm.gachaNameHint]?.items || {};
      Object.keys(catItems).forEach(r => rSet.add(r));
      if (norm.rarities) norm.rarities.forEach(r => rSet.add(r));

      for (const r of rSet){
        const prev = raritySvc.getMeta?.(gachaId, r) || {};
        raritySvc.upsert?.(gachaId, r, {
          color:     prev.color ?? (DEFAULT_RARITY_COLORS[r]||'#c0c0c0'),
          rarityNum: typeof prev.rarityNum==='number' ? prev.rarityNum :
                     ({ "はずれ":0,"N":2,"R":4,"SR":5,"SSR":6,"UR":8 }[r] ?? null),
          emitRate:  typeof prev.emitRate==='number' ? prev.emitRate : null
        });
      }
      applyExternalRarityBase(raritySvc, norm.raw, gachaId);
    }

    // AppState へ投入（upsertHit で data/catalogs/counts を同時更新）
    applyToAppViaCounts(app, norm.data, norm.counts, gachaId);

    refreshUI();
  }

  async importFile(file){
    const raw = await file.text();
    const res = decodeTxtToJsonText(raw);
    if (!res.ok){
      alert('TXTの復元に失敗しました（base64/deflate判定）: ' + res.reason);
      return;
    }
    let obj;
    try{ obj = JSON.parse(res.text); }
    catch(e){ alert('JSONの解析に失敗しました: ' + (e?.message ?? String(e))); return; }
    this.importObject(obj);
  }
}

// index からの薄い配線
export function wireTxtInputs(){
  const importer = new TxtImporter();
  const btn = document.getElementById('tileTxt');
  const inp = document.getElementById('txtFileInput');
  btn?.addEventListener('click', ()=> inp?.click());
  inp?.addEventListener('change', e=>{
    const f = e.target?.files?.[0]; if(!f) return;
    importer.importFile(f); e.target.value='';
  });
}
