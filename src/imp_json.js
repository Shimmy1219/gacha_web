// /src/imp_json.js
// JSON -> 正規化 -> Service保存 -> UI反映
// OOP: JsonImporter

// Services は window.Services から受け取る想定：
// Services.app (=AppStateService), Services.rarity (=RarityService)
const DEFAULT_RARITY_COLORS = {
  "UR":"#f59e0b","SSR":"#fde68a","SR":"#a78bfa","R":"#93c5fd","N":"#a7f3d0","はずれ":"#fca5a5"
};

function buildCatalogsFromData(data){
  const out={};
  for (const [user,gmap] of Object.entries(data||{})){
    for (const [gacha,info] of Object.entries(gmap||{})){
      const pulls=+info?.pulls||0;
      const items=info?.items||{};
      (out[gacha] ||= {pulls:0,items:{}});
      out[gacha].pulls += pulls;
      for (const [rarity,codes] of Object.entries(items)){
        const arr = (out[gacha].items[rarity] ||= []);
        for (const c of (codes||[])) if (c && !arr.includes(c)) arr.push(c);
        arr.sort((a,b)=>a.localeCompare(b,'ja'));
      }
    }
  }
  return out;
}

function deriveCountsFromData(data){
  const out={};
  for (const [user,gmap] of Object.entries(data||{})){
    for (const [gacha,info] of Object.entries(gmap||{})){
      for (const [rarity,codes] of Object.entries(info?.items||{})){
        for (const code of (codes||[])){
          ((((out[user] ||= {})[gacha] ||= {})[rarity] ||= {})[code] ||= 0);
          out[user][gacha][rarity][code] += 1;
        }
      }
    }
  }
  return out;
}

function ensureRarityFromData(raritySvc, data){
  if (!raritySvc) return;
  const map = new Map(); // gacha -> Set(rarity)
  for (const gmap of Object.values(data||{})){
    for (const [gacha,info] of Object.entries(gmap||{})){
      const set = (map.get(gacha) || new Set());
      for (const r of Object.keys(info?.items||{})) set.add(r);
      map.set(gacha,set);
    }
  }
  for (const [gacha,set] of map){
    for (const r of set){
      const prev = raritySvc.getMeta(gacha,r) || {};
      raritySvc.upsert(gacha,r,{
        color:     prev.color ?? (DEFAULT_RARITY_COLORS[r]||'#c0c0c0'),
        rarityNum: typeof prev.rarityNum==='number' ? prev.rarityNum :
                   ({ "はずれ":0,"N":2,"R":4,"SR":5,"SSR":6,"UR":8 }[r] ?? null),
        emitRate:  typeof prev.emitRate==='number' ? prev.emitRate : null
      });
    }
  }
}

function pickFirstGachaName(data,catalogs){
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

export class JsonImporter {
  constructor(services = window?.Services || {}){
    this.services = services;
    this.app = services.app || services.appStateService || null;
    this.rarity = services.rarity || services.rarityService || null;
  }

  importObject(obj){
    // フォーマットA: すでに {data, catalogs, counts, selected}
    const hasFull = obj && typeof obj==='object' && ('data' in obj);
    const data     = hasFull ? (obj.data||{}) : (obj||{});
    const catalogs = hasFull ? (obj.catalogs||buildCatalogsFromData(data)) : buildCatalogsFromData(data);
    const counts   = hasFull ? (obj.counts||deriveCountsFromData(data))     : deriveCountsFromData(data);
    const selected = hasFull ? (obj.selected ?? null) : null;

    // Rarity 初期投入
    ensureRarityFromData(this.rarity, data);

    // AppState へ保存
    if (this.app) {
      this.app.mergeAll({ data, catalogs, counts, selected: null });
    }
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
