// No embedded key. Only a dedicated, restricted browser key may be supplied at runtime.
import {checkedJSON,GRADES,markerCenter,displayLevel} from './map-core.js';
export const MAP_UNAVAILABLE_MESSAGE='Die Karte ist vorübergehend nicht verfügbar. Bitte versuche es später erneut.';
export async function createGoogleMap(element,view,{onIdle,onSelect,onClear,onError}) {
  const config=await checkedJSON(new URL('./runtime-config.json',import.meta.url).href);
  if(Object.keys(config).join()!=='googleMapsApiKey'||typeof config.googleMapsApiKey!=='string'||!/^AIza[\w-]{35}$/.test(config.googleMapsApiKey)) throw new Error('Google Maps ist noch nicht eingerichtet. Für die lokale Vorschau fehlt der eigene Web-API-Key.');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Google Maps konnte nicht geladen werden. Bitte versuche es später erneut.')),15000);
    window.gm_authFailure=()=>{clearTimeout(timer);const error=new Error('Google Maps ist derzeit nicht verfügbar. Bitte prüfe die Freigabe des Web-Schlüssels.');onError(error);reject(error);};
    window.pilzgebieteMapReady=()=>{clearTimeout(timer);resolve();};
    const script=document.createElement('script');
    const params=new URLSearchParams({key:config.googleMapsApiKey,loading:'async',callback:'pilzgebieteMapReady',v:'quarterly',language:'de',region:'DE'});
    script.src='https://maps.googleapis.com/maps/api/js?'+params;script.async=true;
    script.onerror=()=>{clearTimeout(timer);reject(new Error('Google Maps konnte nicht geladen werden. Bitte prüfe deine Internetverbindung.'));};
    document.head.append(script);
  });
  const gm=window.google.maps;
  const map=new gm.Map(element,{center:{lat:view.lat,lng:view.lng},zoom:view.z,mapTypeId:'roadmap',minZoom:5,maxZoom:18,
    disableDefaultUI:true,zoomControl:true,clickableIcons:false,gestureHandling:'cooperative',
    restriction:{latLngBounds:{south:45.5,west:4,north:56.5,east:18},strictBounds:false}});
  // A loaded API script does not prove that a usable basemap arrived (e.g. quota failure).
  const tilesTimer=setTimeout(()=>onError(new Error('Die Basiskarte konnte nicht vollständig geladen werden. Bitte versuche es später erneut.')),15000);
  map.addListener('tilesloaded',()=>clearTimeout(tilesTimer));
  const data=new gm.Data({map});let shapes=[],pins=[],selection=null,lastFeatures=[],lastLevel=null,protectionIds=new Set(),weatherOverlay=null;
  class Pin extends gm.OverlayView {
    constructor(position,label,color,selected,action){super();Object.assign(this,{position,label,color,selected,action});this.setMap(map);}
    onAdd(){this.el=document.createElement('button');this.el.type='button';this.el.className='map-pin'+(this.selected?' selected':'')+(this.action.protected?' has-protection':'');const text=document.createElement('span');text.textContent=this.label;this.el.append(text);this.el.style.background=this.color;this.el.setAttribute('aria-label',this.action.name+(this.action.protected?', Hinweis zu Schutzgebieten':''));this.el.addEventListener('click',e=>{e.stopPropagation();this.action.run();});gm.OverlayView.preventMapHitsAndGesturesFrom(this.el);this.getPanes().overlayMouseTarget.append(this.el);}
    draw(){if(!this.el)return;const p=this.getProjection().fromLatLngToDivPixel(new gm.LatLng(this.position));this.el.style.left=p.x+'px';this.el.style.top=p.y+'px';}
    onRemove(){this.el?.remove();}
  }
  function restyle(){const level=displayLevel(lastLevel,map.getZoom());data.setStyle(f=>{const selected=f.getId()===selection,grade=GRADES[f.getProperty('suitabilityGrade')];return {fillColor:grade.color,visible:f.getProperty('sizeKm2')>=level.minSize,fillOpacity:selected ? .34 : level.alpha,strokeColor:grade.color,strokeOpacity:selected?1:.85,strokeWeight:selected?4:2,clickable:level.tappable};});}
  function renderPins(){pins.forEach(p=>p.setMap(null));pins=[];if(!lastLevel||!displayLevel(lastLevel,map.getZoom()).markers)return;
    for(const feature of lastFeatures){const g=GRADES[feature.properties.suitabilityGrade];pins.push(new Pin(markerCenter(feature.geometry),feature.properties.suitabilityGrade,g.color,selection===feature.id,{name:feature.properties.name+', '+g.label,protected:protectionIds.has(feature.id),run:()=>onSelect(feature.id)}));}}
  data.addListener('click',event=>{if(lastLevel&&displayLevel(lastLevel,map.getZoom()).tappable)onSelect(event.feature.getId());});
  map.addListener('click',()=>onClear());map.addListener('idle',()=>{if(lastLevel)restyle();renderPins();onIdle();});let userPin=null;
  return {
    view(){const b=map.getBounds(),c=map.getCenter();return {lat:c.lat(),lng:c.lng(),z:map.getZoom(),bounds:b?[b.getSouthWest().lng(),b.getSouthWest().lat(),b.getNorthEast().lng(),b.getNorthEast().lat()]:[view.lng-.03,view.lat-.03,view.lng+.03,view.lat+.03]};},
    // Apply both together so overview bounds cannot clamp the new center first.
    center(point,zoom){map.moveCamera({center:point,zoom});},
    render(features,level,selected,confirmedProtection=new Set()){selection=selected;lastLevel=level;lastFeatures=features;protectionIds=confirmedProtection;shapes.forEach(f=>data.remove(f));shapes=data.addGeoJson({type:'FeatureCollection',features});restyle();renderPins();},
    select(id){selection=id;if(lastLevel)restyle();renderPins();},
    location(point){userPin?.setMap(null);userPin=new Pin(point,'•','#2474c7',false,{name:'Dein Standort',run:()=>{}});},
    weather(weatherData){weatherOverlay?.setMap(null);weatherOverlay=new gm.GroundOverlay(weatherData.imageUrl,weatherData.bounds,{map,opacity:1,clickable:false});},
  };
}
