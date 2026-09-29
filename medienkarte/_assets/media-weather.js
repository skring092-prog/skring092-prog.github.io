// Read-only public weather snapshot. No user position or area request is sent.
const ROOT='https://pilzgebiete-weather-production-read.s-kring092.workers.dev/weather/';
const decoder=new TextDecoder('utf-8',{fatal:true});
const colors=[[217,155,80],[243,219,114],[198,222,122],[67,165,110],[85,200,223],[21,69,154]];
const stops=[0,1,2,4,5,6];

async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
async function asset(descriptor){
  if(!descriptor||! /^(parts\/(map_history|soil_current)\/[a-f0-9]{64}\.wxp|mapping\/[a-f0-9]{64}\.json)$/.test(descriptor.path)||typeof descriptor.sha256!=='string'||!descriptor.path.includes(descriptor.sha256))throw new Error('Ungültiger Wetterpfad');
  const response=await fetch(ROOT+descriptor.path,{credentials:'omit'});
  if(!response.ok)throw new Error('Wetter HTTP '+response.status);
  const raw=await response.arrayBuffer();
  if(raw.byteLength!==descriptor.bytes||await sha256(raw)!==descriptor.sha256)throw new Error('Wetterdatei nicht konsistent');
  return raw;
}
async function packageBlobs(raw){
  const view=new DataView(raw),length=view.getUint32(0,true);
  if(length<1||length>1048576||length+4>raw.byteLength)throw new Error('Wetterkopf ungültig');
  const head=JSON.parse(decoder.decode(new Uint8Array(raw,4,length)));
  if(head.schema!==1||!Array.isArray(head.blobs))throw new Error('Wetterpaket ungültig');
  let offset=4+length;const blobs={};
  for(const item of head.blobs){
    if(!Number.isInteger(item.bytes)||item.bytes<0||offset+item.bytes>raw.byteLength||blobs[item.name])throw new Error('Wetterinhalt ungültig');
    const bytes=raw.slice(offset,offset+item.bytes);offset+=item.bytes;
    if(await sha256(bytes)!==item.sha256)throw new Error('Wetterinhalt nicht konsistent');
    blobs[item.name]=new DataView(bytes);
  }
  if(offset!==raw.byteLength)throw new Error('Wetterpaket unvollständig');
  return {meta:head.meta,blobs};
}
function palette(value){
  const v=Math.min(6,Math.max(0,value));let i=stops.length-2;
  for(let k=0;k<stops.length-1;k++)if(v<=stops[k+1]){i=k;break;}
  const t=(v-stops[i])/(stops[i+1]-stops[i]);
  return [0,1,2].map(k=>Math.round(colors[i][k]+(colors[i+1][k]-colors[i][k])*t)).concat(Math.round((.35+.53*v/6)*255));
}
function gridValue(view,grid,lat,lon){
  const y=Math.round((lat-grid.lat0)/grid.spacingDeg),x=Math.round((lon-grid.lon0)/grid.spacingDeg);
  if(y<0||y>=grid.rows||x<0||x>=grid.cols)return null;
  const value=view.getFloat32((y*grid.cols+x)*4,true);
  return Number.isFinite(value)?value:null;
}
function fieldImage(field,grid){
  if(field.byteLength!==grid.rows*grid.cols*4)throw new Error('Wetterraster ungültig');
  const canvas=document.createElement('canvas');canvas.width=grid.cols;canvas.height=grid.rows;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(grid.cols,grid.rows);
  for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++){
    const v=field.getFloat32((y*grid.cols+x)*4,true);
    if(!Number.isFinite(v))continue;
    const i=((grid.rows-1-y)*grid.cols+x)*4;
    image.data.set(palette(v),i);
  }
  ctx.putImageData(image,0,0);
  return {imageUrl:canvas.toDataURL('image/png'),bounds:{south:grid.lat0-grid.spacingDeg/2,west:grid.lon0-grid.spacingDeg/2,north:grid.lat0+(grid.rows-.5)*grid.spacingDeg,east:grid.lon0+(grid.cols-.5)*grid.spacingDeg}};
}
export async function loadWeather(){
  const response=await fetch(ROOT+'manifest.json',{credentials:'omit',cache:'no-store'});
  if(!response.ok)throw new Error('Wettermanifest fehlt');
  const manifest=await response.json();
  if(manifest.schemaVersion!==1||!/^\d{4}-\d\d-\d\d$/.test(manifest.lastHistoryDateUtc)||!manifest.mapping||!manifest.parts?.map_history||!manifest.parts?.soil_current)throw new Error('Wettermanifest ungültig');
  const [mappingRaw,historyRaw,soilRaw]=await Promise.all([asset(manifest.mapping),asset(manifest.parts.map_history),asset(manifest.parts.soil_current)]);
  const mapping=JSON.parse(decoder.decode(mappingRaw));
  const [history,soil]=await Promise.all([packageBlobs(historyRaw),packageBlobs(soilRaw)]);
  const grid=mapping.grid;
  if(!grid||grid.rows!==467||grid.cols!==570||grid.spacingDeg!==.02||history.meta.mappingVersion!==manifest.mapping.version||soil.meta.mappingVersion!==manifest.mapping.version||history.meta.lastHistoryDateUtc!==manifest.lastHistoryDateUtc||history.meta.historyDays!==30||history.meta.mapMetric?.aggregation!=='complete-26-day-mean'||history.meta.mapMetric?.lastDateUtc!==manifest.lastHistoryDateUtc||history.blobs.history?.byteLength!==mapping.cellIds.length*30*8||soil.blobs.soil?.byteLength!==grid.rows*grid.cols*4)throw new Error('Wetterstände passen nicht zusammen');
  const offsets=new Map(mapping.cellIds.map((id,i)=>[id,i]));
  const visual=fieldImage(history.blobs.precipitation26,grid);
  const lastDate=manifest.lastHistoryDateUtc,soilValidAt=soil.meta.soilValidAtUtc;
  return {...visual,lastDate,soilValidAt,source:manifest.source,model:manifest.model,license:manifest.license,forArea(feature){
    const id=mapping.polygonCells[feature.id],offset=offsets.get(id);
    if(offset===undefined)return null;
    const historyView=history.blobs.history;
    const daily=[];let sum26=0,sum20=0,valid26=true,valid20=true;
    const end=new Date(lastDate+'T00:00:00Z');
    for(let d=0;d<30;d++){
      const rain=historyView.getFloat32((offset*60+d*2)*4,true),temperature=historyView.getFloat32((offset*60+d*2+1)*4,true);
      const date=new Date(end.getTime()-(29-d)*86400000).toISOString().slice(0,10);
      daily.push({date,rain:Number.isFinite(rain)?rain:null,temperature:Number.isFinite(temperature)?temperature:null});
      if(d>=4){if(Number.isFinite(rain))sum26+=rain;else valid26=false;}
      if(d>=10){if(Number.isFinite(temperature))sum20+=temperature;else valid20=false;}
    }
    const lat=43.18+Math.floor(id/1215)*.02,lon=-3.94+(id%1215)*.02;
    return {daily,rain26:valid26?sum26/26:null,temperature20:valid20?sum20/20:null,soil:gridValue(soil.blobs.soil,grid,lat,lon)};
  }};
}
