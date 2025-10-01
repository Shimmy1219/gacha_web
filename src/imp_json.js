// /src/imp_json.js
// JSON -> 正規化（gachaId化） -> Service保存（upsertHit） -> UI反映
// Services は window.Services から受け取る想定：Services.app (=AppStateService v2), Services.rarity (=RarityService v2)

const DEFAULT_RARITY_COLORS = {
  "UR":"#f59e0b","SSR":"#fde68a","SR":"#a78bfa","R":"#93c5fd","N":"#a7f3d0","はずれ":"#fca5a5"
};

function buildCatalogsFromDataByName(data){
  const out={};
  for (const [user,gmap] of Object.entries(data||{})){
    for (const [gachaName,info] of Object.entries(gmap||{})){
      const pulls=+info?.pulls||0;
      const items=info?.items||{};
      (out[gachaName] ||= {pulls:0,items:{}});
      out[gachaName].pulls += pulls;
      for (const [rarity,codes] of Object.entries(items)){
        const arr = (out[gachaName].items[rarity] ||= []);
        for (const c of (codes||[])) if (c && !arr.includes(c)) arr.push(c);
        arr.sort((a,b)=>a.localeCompare(b,'ja'));
      }
    }
  }
  return out;
}

function deriveCountsFromDataByName(data){
  const out={};
  for (const [user,gmap] of Object.entries(data||{})){
    for (const [gachaName,info] of Object.entries(gmap||{})){
      for (const [rarity,codes] of Object.entries(info?.items||{})){
        for (const code of (codes||[])){
          ((((out[user] ||= {})[gachaName] ||= {})[rarity] ||= {})[code] ||= 0);
          out[user][gachaName][rarity][code] += 1;
        }
      }
    }
  }
  return out;
}

function ensureRaritiesForGachaId(raritySvc, gachaId, dataByName, gachaName){
  if (!raritySvc) return;
  const set = new Set();
  for (const gmap of Object.values(dataByName||{})){
    const info = gmap?.[gachaName];
    if (!info) continue;
    for (const r of Object.keys(info?.items||{})) set.add(r);
  }
  for (const r of set){
    const prev = raritySvc.getMeta(gachaId, r) || {};
    raritySvc.upsert(gachaId, r, {
      color:     prev.color ?? (DEFAULT_RARITY_COLORS[r]||'#c0c0c0'),
      rarityNum: typeof prev.rarityNum==='number' ? prev.rarityNum :
                 ({ "はずれ":0,"N":2,"R":4,"SR":5,"SSR":6,"UR":8 }[r] ?? null),
      emitRate:  typeof prev.emitRate==='number' ? prev.emitRate : null
    });
  }
}

function pickFirstGachaNameFrom(data,catalogs){
  const names = new Set();
  for (const gmap of Object.values(data||{})) Object.keys(gmap||{}).forEach(n=>names.add(n));
  Object.keys(catalogs||{}).forEach(n=>names.add(n));
  const arr=[...names]; arr.sort((a,b)=>a.localeCompare(b,'ja'));
  return arr[0]||null;
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

/** counts（ガチャ名キー）を app.upsertHit で投入（gachaId へ置換） */
function applyCountsToApp(app, countsByName){
  let firstId = null;
  for (const [user, gmap] of Object.entries(countsByName||{})){
    for (const [gachaName, rarMap] of Object.entries(gmap||{})){
      const gid = ensureGachaIdByDisplayName(app, gachaName);
      if (!firstId) firstId = gid;
      for (const [rarity, codeMap] of Object.entries(rarMap||{})){
        for (const [code, n] of Object.entries(codeMap||{})){
          app.upsertHit(user, gid, rarity, code, Math.max(1, +n || 1));
        }
      }
    }
  }
  if (firstId) app.selectGacha(firstId);
}

export class JsonImporter {
  constructor(services = window?.Services || {}){
    this.services = services;
    this.app = services.app || services.appStateService || null;
    this.rarity = services.rarity || services.rarityService || null;
  }

  importObject(obj){
    // 形式A: すでに {data, catalogs, counts, selected} っぽい
    const hasFull = obj && typeof obj==='object' && ('data' in obj || 'counts' in obj || 'catalogs' in obj);

    const dataByName     = hasFull ? (obj.data||{}) : (obj||{});
    const catalogsByName = hasFull ? (obj.catalogs||buildCatalogsFromDataByName(dataByName))
                                   : buildCatalogsFromDataByName(dataByName);
    const countsByName   = hasFull ? (obj.counts||deriveCountsFromDataByName(dataByName))
                                   : deriveCountsFromDataByName(dataByName);

    if (!this.app) { alert('AppStateService が初期化されていません。'); return; }

    // Rarity を gachaId に対して初期投入
    const gachaNames = new Set();
    for (const gmap of Object.values(dataByName||{})) for (const n of Object.keys(gmap||{})) gachaNames.add(n);
    for (const n of Object.keys(catalogsByName||{})) gachaNames.add(n);
    for (const gName of gachaNames){
      const gid = ensureGachaIdByDisplayName(this.app, gName);
      ensureRaritiesForGachaId(this.rarity, gid, dataByName, gName);
    }

    // 本体投入（counts を信頼して upsertHit）
    applyCountsToApp(this.app, countsByName);

    refreshUI();
  }

  async importFile(file){
    const txt = await file.text();
    let obj;
    try{ obj = JSON.parse(txt); }
    catch(e){ alert('JSON解析に失敗しました: '+e.message); return; }
    this.importObject(obj);
  }
}

// index 側から呼ぶだけの薄い配線
export function wireJsonInputs(){
  const importer = new JsonImporter();
  const btn = document.getElementById('tileJson');
  const inp = document.getElementById('jsonFile2');
  btn?.addEventListener('click', ()=> inp?.click());
  inp?.addEventListener('change', e=>{
    const f = e.target?.files?.[0]; if(!f) return;
    importer.importFile(f); e.target.value='';
  });
}
