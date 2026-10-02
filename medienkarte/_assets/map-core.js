export const MIN_ZOOM = 9;
export const MAX_PACKAGES = 96;
export const DATA_VERSION = 'free-web-4';
export const GRADES = Object.freeze({A:{label:'Sehr gut geeignet',color:'#1E6B45'},B:{label:'Gut geeignet',color:'#4FAE7C'},C:{label:'Grundsätzlich geeignet',color:'#B08A3C'}});
export const LIGHT_FIELDS = 'name suitabilityGrade sizeKm2 forestType habitatType terrain accessibility seasonMonths elevationRangeM soilMoisture dataQuality dataQualityReason dataVersion isSynthetic habitatExplanation attribution possibleSpecies';
export function detailLevel(zoom,count=0){
  if(zoom<9 || count>96)return {id:'overview',minSize:Infinity,alpha:0,tappable:false,markers:false};
  if(zoom<12 || count>40)return {id:'regional',minSize:2,alpha:.12,tappable:false,markers:false};
  return {id:zoom<13?'area':'detail',minSize:0,alpha:.18,tappable:true,markers:true};
}
export function radiusBounds(center,radius,viewport){
  if(radius===0)return viewport;
  requireValue([10,20,50].includes(radius),'Ungültiger Suchbereich');
  const dy=radius/111.32,dx=radius/(111.32*Math.max(.2,Math.cos(center.lat*Math.PI/180)));
  return [center.lng-dx,center.lat-dy,center.lng+dx,center.lat+dy];
}
export function displayLevel(loaded,zoom){
  const camera=detailLevel(zoom);
  return {...camera,minSize:Math.max(loaded.minSize,camera.minSize),alpha:Math.min(loaded.alpha,camera.alpha),
    tappable:loaded.tappable&&camera.tappable,markers:loaded.tappable&&camera.markers};
}
export function markerCenter(geometry){
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  let lat=0,lng=0,count=0;
  for(const rings of polygons)for(const [x,y] of rings[0].slice(0,-1)){lat+=y;lng+=x;count++;}
  return {lat:lat/count,lng:lng/count};
}
export function featureBounds(geometry){
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
  for(const rings of polygons)for(const [x,y] of rings[0]){w=Math.min(w,x);s=Math.min(s,y);e=Math.max(e,x);n=Math.max(n,y);}
  return [w,s,e,n];
}
export function searchPlan(index,bounds,zoom){
  // Same one-cell safety margin as Mobile. Empty packages count toward budget, but are never fetched.
  const expanded=[bounds[0]-.25,bounds[1]-.125,bounds[2]+.25,bounds[3]+.125];
  const all=index.packages.filter(p=>intersects(p.bbox,expanded));
  const level=detailLevel(zoom,all.length);
  return {level,bounds:expanded,packages:level.id==='overview'?[]:all.filter(p=>p.count>0)};
}
export function visibleFeatures(features,level,bounds,grades){
  return features.filter(f=>f.properties.sizeKm2>=level.minSize && grades.has(f.properties.suitabilityGrade) && intersects(featureBounds(f.geometry),bounds));
}
export function normalizePlace(value){return value.trim().toLowerCase().replaceAll('ä','ae').replaceAll('ö','oe').replaceAll('ü','ue').replaceAll('ß','ss');}
export function findPlaces(places,query){
  const q=normalizePlace(query);if(q.length<2)return [];
  return places.map(p=>{const n=normalizePlace(p.name);return {p,n,rank:n===q?0:n.startsWith(q)?1:n.includes(' '+q)?2:n.includes(q)?3:4};})
    .filter(x=>x.rank<4).sort((a,b)=>a.rank-b.rank||a.n.localeCompare(b.n,'de')||a.p.lat-b.p.lat||a.p.lon-b.p.lon).slice(0,10).map(x=>x.p);
}
export function validatePlaces(data){
  keys(data,'schema attribution license_url places');requireValue(data.schema==='free-web-places-1'&&typeof data.attribution==='string'&&Array.isArray(data.places));
  for(const p of data.places){keys(p,'id name lat lon');requireValue(typeof p.id==='string'&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon));}
  return data;
}
// Same positive-only notice as App V1.1. Missing evidence is not permission.
export function protectionNotice(entry,enabled){return enabled&&entry?.status==='checked'&&entry.nsg_hit===true ? 'Nach unserem Datenstand überschneidet oder berührt dieses Pilzgebiet ein Schutzgebiet. Die Habitatbewertung sagt nicht aus, ob Sammeln dort erlaubt ist. Prüfe die örtlichen Betretungs- und Sammelregeln sowie die Beschilderung vor Ort.' : null;}
export function currentLocation(geo=globalThis.navigator?.geolocation){
  return new Promise((resolve,reject)=>{if(!geo)return reject(new Error('Standort wird in diesem Browser nicht unterstützt.'));
    geo.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),e=>reject(new Error(e.code===1?'Ohne Standortfreigabe kannst du weiterhin die Ortssuche verwenden.':'Dein Standort konnte nicht ermittelt werden. Bitte versuche es erneut.')),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});});
}
export const DEFAULT_VIEW = {lat:51.1,lng:10.4,z:6};
// The first sixteen presets retain the starting cameras of the existing media links.
// Additional cities use coordinates from the bundled GeoNames place catalog.
export const REGION_VIEWS = Object.freeze({
  augsburg:{lat:48.372,lng:10.899,z:10},
  berlin:{lat:52.52,lng:13.405,z:10},
  bremen:{lat:53.0793,lng:8.8017,z:10},
  dresden:{lat:51.0504,lng:13.7373,z:10},
  duesseldorf:{lat:51.2277,lng:6.7735,z:10},
  erfurt:{lat:50.9848,lng:11.0299,z:10},
  hamburg:{lat:53.5511,lng:9.9937,z:10},
  hannover:{lat:52.3759,lng:9.732,z:10},
  kiel:{lat:54.3233,lng:10.1228,z:10},
  magdeburg:{lat:52.1205,lng:11.6276,z:10},
  mainz:{lat:49.9929,lng:8.2473,z:10},
  muenchen:{lat:48.05,lng:11.56,z:10},
  nuernberg:{lat:49.454,lng:11.078,z:10},
  potsdam:{lat:52.4,lng:13.06,z:10},
  regensburg:{lat:49.015,lng:12.102,z:10},
  saarbruecken:{lat:49.2402,lng:7.0,z:10},
  schwerin:{lat:53.6355,lng:11.4012,z:10},
  stuttgart:{lat:48.7758,lng:9.1829,z:10},
  wiesbaden:{lat:50.0782,lng:8.2398,z:10}
});
export function mediaStartView(search,dataset){
  if(dataset.generic!=='true')return search?parseView(search):parseView('?lat='+dataset.lat+'&lng='+dataset.lng+'&z='+dataset.zoom);
  const requested=new URLSearchParams(search);
  const preset=REGION_VIEWS[normalizePlace(requested.get('region')||'')]||DEFAULT_VIEW;
  const camera=new URLSearchParams({lat:String(preset.lat),lng:String(preset.lng),z:String(preset.z)});
  for(const key of ['lat','lng','z']){
    const raw=requested.get(key);
    if(raw!==null&&/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw.trim()))camera.set(key,raw);
  }
  return parseView(camera);
}
export function parseView(search) {
  const params = new URLSearchParams(search);
  const value = (key, fallback, min, max) => {
    const raw = params.get(key);
    if (raw === null || !raw.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : fallback;
  };
  return {lat:value('lat',DEFAULT_VIEW.lat,45.75,55.3),lng:value('lng',DEFAULT_VIEW.lng,5.5,17.25),
          z:Math.round(value('z',DEFAULT_VIEW.z,5,18))};
}
export function intersects(a,b) { return a[0]<=b[2] && a[2]>=b[0] && a[1]<=b[3] && a[3]>=b[1]; }
export function visiblePackages(index,bounds,zoom) {
  if(zoom<MIN_ZOOM) return [];
  return index.packages.filter(p=>p.count>0 && intersects(p.bbox,bounds));
}
export function requireValue(condition,message='Ungültige Kartendaten') {if(!condition) throw new Error(message);}
function keys(obj,expected){requireValue(obj && typeof obj==='object' && !Array.isArray(obj) && Object.keys(obj).sort().join('|')===expected.split(' ').sort().join('|'));}
export function validateIndex(index){
  keys(index,'schema version area_count package_count coverage habitat_data_as_of protection_status packages');
  requireValue(index.schema==='free-web-index-1' && index.version===DATA_VERSION && index.area_count===37582 && index.package_count===2863);
  requireValue(['blocked','checked','confirmed-only'].includes(index.protection_status) && index.packages.length===index.package_count);
  const ids=new Set();
  for(const p of index.packages){
    keys(p,'id bbox count bytes sha256 protection_bytes protection_sha256');
    requireValue(/^(DE|AT|CH)_p\d+_\d+$/.test(p.id) && !ids.has(p.id)); ids.add(p.id);
    requireValue(Array.isArray(p.bbox) && p.bbox.length===4 && p.bbox.every(Number.isFinite));
    requireValue(Number.isInteger(p.count)&&p.count>=0 && Number.isInteger(p.bytes)&&p.bytes>0 && Number.isInteger(p.protection_bytes)&&p.protection_bytes>0);
    requireValue(/^[a-f0-9]{64}$/.test(p.sha256)&&/^[a-f0-9]{64}$/.test(p.protection_sha256));
  }
  return index;
}
export function validatePackage(data,p){
  keys(data,'type package_id features');
  requireValue(data.type==='FeatureCollection' && data.package_id===p.id && Array.isArray(data.features) && data.features.length===p.count);
  const ids=new Set();
  for(const f of data.features){
    keys(f,'type id geometry properties');keys(f.properties,LIGHT_FIELDS);keys(f.geometry,'type coordinates');
    requireValue(f.type==='Feature'&&typeof f.id==='string'&&!ids.has(f.id));ids.add(f.id);
    requireValue(typeof f.properties.name==='string'&&['A','B','C'].includes(f.properties.suitabilityGrade));
    const a=f.properties;
    requireValue(Array.isArray(a.possibleSpecies)&&a.possibleSpecies.length<=5&&new Set(a.possibleSpecies).size===a.possibleSpecies.length&&a.possibleSpecies.every(v=>typeof v==='string'&&v.length>0&&v.length<=80&&/^[\p{L} -]+$/u.test(v)));
    requireValue(Number.isFinite(a.sizeKm2)&&a.sizeKm2>0&&a.isSynthetic===false);
    requireValue(['forest','grassland'].includes(a.habitatType)&&['flat','hilly','mountainous'].includes(a.terrain)&&['easy','moderate','demanding'].includes(a.accessibility));
    requireValue(['high','medium','limited'].includes(a.dataQuality)&&Array.isArray(a.seasonMonths)&&a.seasonMonths.length>0&&new Set(a.seasonMonths).size===a.seasonMonths.length&&a.seasonMonths.every(v=>Number.isInteger(v)&&v>=1&&v<=12));
    keys(a.elevationRangeM,'min max');requireValue(Number.isInteger(a.elevationRangeM.min)&&Number.isInteger(a.elevationRangeM.max)&&a.elevationRangeM.min<=a.elevationRangeM.max);
    requireValue(Array.isArray(a.attribution)&&a.attribution.length>0);
    const unsafe=/steinpilz|pfiffer|maronen|parasol|reizker|boletus|cantharell|imleria|lactarius|macrolepiota|premium|kernbereich|teilbereich|categoryPosition|speciesScores|eligibilityMask|reasonMask|\bscore\b/i;
    for(const v of [a.soilMoisture,a.dataQualityReason,a.dataVersion,a.habitatExplanation,...a.attribution,...(a.forestType===null?[]:[a.forestType])]) requireValue(typeof v==='string'&&v.length>0&&v.length<=2000&&!unsafe.test(v));
    requireValue(['Polygon','MultiPolygon'].includes(f.geometry.type));
    const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    requireValue(Array.isArray(polygons)&&polygons.length>0);
    for(const polygon of polygons){requireValue(Array.isArray(polygon)&&polygon.length>0);
      for(const ring of polygon){requireValue(Array.isArray(ring)&&ring.length>=4 && JSON.stringify(ring[0])===JSON.stringify(ring.at(-1)));
        for(const xy of ring) requireValue(Array.isArray(xy)&&xy.length===2&&xy.every(Number.isFinite)&&Math.abs(xy[0])<=180&&Math.abs(xy[1])<=90);
      }
    }
  }
  return data;
}
export function validateProtection(data,p,features){
  keys(data,'schema package_id source habitats');
  requireValue(data.schema==='protection_v1'&&data.package_id===p.id);
  requireValue(data.habitats && Object.keys(data.habitats).sort().join('|')===features.map(f=>f.id).sort().join('|'));
  if(data.source!==null){keys(data.source,'title url data_as_of retrieved_at license license_url attribution');requireValue(Object.values(data.source).every(x=>typeof x==='string'&&x.length>0));}
  for(const entry of Object.values(data.habitats)){
    keys(entry,'status nsg_hit nsg');requireValue(Array.isArray(entry.nsg));
    requireValue((entry.status==='unknown'&&entry.nsg_hit===null&&entry.nsg.length===0)||
      (entry.status==='checked'&&typeof entry.nsg_hit==='boolean'&&data.source!==null&&Boolean(entry.nsg.length)===entry.nsg_hit));
    for(const nsg of entry.nsg){keys(nsg,'id name');requireValue(typeof nsg.id==='string'&&typeof nsg.name==='string');}
  }
  return data;
}
export async function checkedJSON(url,expectedBytes,expectedSHA,signal){
  const response=await fetch(url,{signal,credentials:'omit'});
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();
  if(expectedBytes!==undefined) requireValue(bytes.byteLength===expectedBytes,'Dateigröße stimmt nicht');
  if(expectedSHA!==undefined){
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    requireValue(hash===expectedSHA,'Integritätsprüfung fehlgeschlagen');
  }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export class PackageLoader {
  constructor(base,{concurrency=3,cacheSize=96,protectionEnabled=false,onChange=()=>{}}={}) {
    this.base=base;this.concurrency=concurrency;this.cacheSize=cacheSize;this.onChange=onChange;
    this.cache=new Map();this.active=new Map();this.failed=new Set();this.wanted=new Map();
    this.protectionEnabled=protectionEnabled;
  }
  select(packages){
    this.wanted=new Map(packages.map(p=>[p.id,p]));
    for(const [id,job] of this.active) if(!this.wanted.has(id)) job.controller.abort();
    for(const id of this.wanted.keys()) if(this.cache.has(id)){const v=this.cache.get(id);this.cache.delete(id);this.cache.set(id,v);}
    this.pump();this.trim();
  }
  retry(){this.failed.clear();for(const [id,result] of this.cache) if(result.protectionFailed) this.cache.delete(id);this.pump();}
  trim(){for(const id of this.cache.keys()){if(this.cache.size<=this.cacheSize) break;if(!this.wanted.has(id))this.cache.delete(id);}}
  pump(){
    for(const [id,p] of this.wanted){
      if(this.active.size>=this.concurrency) break;
      if(this.cache.has(id)||this.active.has(id)||this.failed.has(id))continue;
      const controller=new AbortController();const job={controller};this.active.set(id,job);
      this.load(p,controller.signal).then(result=>{if(!controller.signal.aborted&&this.wanted.has(id)){this.cache.set(id,result);this.trim();}}).catch(error=>{if(error.name!=='AbortError'&&this.wanted.has(id))this.failed.add(id);})
        .finally(()=>{if(this.active.get(id)===job)this.active.delete(id);this.pump();this.onChange();});
    }
  }
  async load(p,signal){
    const data=validatePackage(await checkedJSON(`${this.base}packages/${p.id}.json`,p.bytes,p.sha256,signal),p);
    let protection=null,protectionFailed=false;
    try{if(this.protectionEnabled)protection=validateProtection(await checkedJSON(`${this.base}protection/${p.id}.json`,p.protection_bytes,p.protection_sha256,signal),p,data.features);}
    catch(error){if(error.name==='AbortError')throw error;protectionFailed=true;}
    return {data,protection,protectionFailed};
  }
}
