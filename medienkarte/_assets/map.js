import {DATA_VERSION,GRADES,mediaStartView,checkedJSON,validateIndex,validatePlaces,PackageLoader,searchPlan,radiusBounds,visibleFeatures,displayLevel,findPlaces,currentLocation,protectionNotice} from './map-core.js?v=regions-1';
import {createGoogleMap,MAP_UNAVAILABLE_MESSAGE} from './google-maps.js';
import {speciesSection} from './species-view.js';
import {installMapConsent} from './map-consent.js';
import {loadWeather} from './media-weather.js';
const $=id=>document.getElementById(id), base=new URL('./data/'+DATA_VERSION+'/',import.meta.url).href;
let mapFailed=false;
let map,index,loader,plan,selected=null,expanded=false,radius=0,shown=[],renderFrame=0;
let weather=null,weatherFailure=null;
let grades=new Set(['A','B','C']),placeData,placeRequest,searchSequence=0;
const emptySelection=$('selection').cloneNode(true);
const labels={flat:'Flach',hilly:'Hügelig',mountainous:'Bergig',easy:'Leicht',moderate:'Mittel',demanding:'Anspruchsvoll',forest:'Wald',grassland:'Grünland',high:'Hoch',medium:'Mittel',limited:'Eingeschränkt'};
const months=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const number=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2});
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function sourceCredit(text){const p=node('p');for(const part of text.split(/(https:\/\/[^\s<>]+)/g)){if(part.startsWith('https://')){const url=part.replace(/[.,;]+$/,'');const a=node('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode(part.slice(url.length)));}else p.append(document.createTextNode(part));}return p;}
function hint(text){$('hint').textContent=text;$('hint').hidden=!text;}
function showFailure(){mapFailed=true;$('map-fallback').hidden=false;$('map-error').textContent=MAP_UNAVAILABLE_MESSAGE;$('load-status').textContent='Die Karte ist nicht verfügbar. Es werden keine Gebiete automatisch geladen.';$('show-areas').disabled=true;$('locate').disabled=true;}
function moved(){if(!map)return;const v=map.view();const url=new URL(location.href);for(const [k,val] of Object.entries({lat:v.lat.toFixed(5),lng:v.lng.toFixed(5),z:Math.round(v.z)}))url.searchParams.set(k,val);history.replaceState(null,'',url);$('show-areas').textContent=plan?'In diesem Bereich suchen':'Pilzgebiete anzeigen';if(v.z<9)hint('Zoome näher heran, um Pilzgebiete anzuzeigen.');else hint('');if(plan)queueRender();}
function clearSelection(){selected=null;expanded=false;map?.select(null);$('selection').replaceChildren(...Array.from(emptySelection.childNodes,x=>x.cloneNode(true)));$('detail-panel').classList.remove('is-selected');$('close-detail').hidden=true;}
function facts(rows){const dl=node('dl',undefined,'facts');for(const [key,value]of rows){dl.append(node('dt',key),node('dd',value));}return dl;}
function showDetail(feature){selected=feature.id;map?.select(selected);const p=feature.properties,g=p.suitabilityGrade,box=$('selection');box.replaceChildren();
 const top=node('div',undefined,'summary-line');top.append(node('span',g,'grade grade-'+g.toLowerCase()),node('span',GRADES[g].label));box.append(top,node('h2',p.name),node('p',number.format(p.sizeKm2)+' km² · '+(p.forestType||labels[p.habitatType]),'area-size'));
 const band=node('div',undefined,'suitability-band');band.setAttribute('aria-label','Eignungsklasse '+g);for(const grade of ['C','B','A']){const s=node('span');s.style.background=GRADES[grade].color;if(grade===g)s.className='active';band.append(s);}box.append(band,node('p','Orientierung nach Eignungsklasse A/B/C','band-label'),facts([['Gelände',labels[p.terrain]],['Zugänglichkeit',labels[p.accessibility]]]));
 const species=speciesSection(p.possibleSpecies);if(species)box.append(species);
 const weatherBox=node('section',undefined,'area-weather');weatherBox.append(node('h3','Wetter am Gebiet'));
 if(weather){const reading=weather.forArea(feature);if(reading){weatherBox.append(node('p','Modellwerte am Gebietsmittelpunkt · letzte 30 vollständige UTC-Tage bis '+weather.lastDate,'source-line'));
 const daily=node('details');daily.append(node('summary','30 Tageswerte: Niederschlag und Temperatur'));const table=node('table');const header=node('tr');for(const label of ['Tag (UTC)','Niederschlag','Temperatur'])header.append(node('th',label));table.append(header);
 for(const row of reading.daily){const tr=node('tr');tr.append(node('td',row.date),node('td',row.rain===null?'kein Wert':number.format(row.rain)+' mm'),node('td',row.temperature===null?'kein Wert':number.format(row.temperature)+' °C'));table.append(tr);}daily.append(table);
 weatherBox.append(facts([['Niederschlag, 26-Tage-Mittel',reading.rain26===null?'kein Wert':number.format(reading.rain26)+' mm/Tag'],['Temperatur, 20-Tage-Mittel',reading.temperature20===null?'kein Wert':number.format(reading.temperature20)+' °C'],['Bodenfeuchte 3–9 cm',reading.soil===null?'kein Wert':number.format(reading.soil)+' m³/m³'],['Bodenfeuchte gültig',weather.soilValidAt]]),daily);
 }else weatherBox.append(node('p','Für dieses Gebiet liegt kein gültiger Wetterwert vor.'));}
 else weatherBox.append(node('p',weatherFailure?'Wetterdaten derzeit nicht verfügbar.':'Wetterdaten werden geladen …'));
 box.append(weatherBox);
 // Only confirmed V1.1 sidecar hits; no inferred permission for missing records.
 let protection;for(const entry of loader.cache.values()){if(entry.protection?.habitats[selected]){protection=entry.protection.habitats[selected];break;}}
 const message=protectionNotice(protection,loader.protectionEnabled);if(message){const notice=node('section',undefined,'nsg-notice');notice.append(node('strong','ⓘ Hinweis zu Schutzgebieten'),node('p',message));const matches=node('details');matches.append(node('summary','Erkannte Schutzgebiete ansehen'));const list=node('ul');for(const item of protection.nsg)list.append(node('li',item.name));matches.append(list);const link=node('a','Mehr zu Schutz & Sammelregeln / Quellen');link.href='#quellen';link.onclick=()=>{$('quellen').open=true;$('detail-panel').classList.remove('is-selected');};notice.append(matches,link);box.append(notice);}
 if(!expanded){const button=node('button','Gebiet ansehen','primary-button');button.type='button';button.onclick=()=>{expanded=true;showDetail(feature);};box.append(button);}
 else{const more=node('section',undefined,'more-info');more.append(node('h3','Das Gebiet verstehen'),node('p',p.habitatExplanation),facts([['Saison',p.seasonMonths.map(m=>months[m-1]).join(' · ')],['Höhenlage',p.elevationRangeM.min+'–'+p.elevationRangeM.max+' m'],['Boden & Feuchte',p.soilMoisture],['Datenqualität',labels[p.dataQuality]]]),node('p',p.dataQualityReason),node('h3','Daten & Quellen'),node('p',p.dataVersion));const ul=node('ul');for(const value of p.attribution)ul.append(node('li',value));more.append(ul);box.append(more);}
 $('detail-panel').classList.add('is-selected');$('close-detail').hidden=false;
 if(matchMedia('(max-width:760px)').matches)$('detail-panel').scrollIntoView({block:'end'});
}
function choose(id){const f=shown.find(x=>x.id===id);if(!f||!plan?.level.tappable)return;expanded=false;showDetail(f);}
function render(){if(mapFailed||!loader||!plan||!map)return;
 const features=[];let ready=0,errors=0,pending=0;
 for(const [id]of loader.wanted){const result=loader.cache.get(id);if(result){ready++;features.push(...result.data.features);if(result.protectionFailed)errors++;}else if(loader.failed.has(id))errors++;else pending++;}
 shown=visibleFeatures(features,plan.level,plan.bounds,grades);if(selected&&!shown.some(f=>f.id===selected))clearSelection();
 const protectedIds=new Set();for(const result of loader.cache.values())for(const [id,entry]of Object.entries(result.protection?.habitats||{}))if(protectionNotice(entry,loader.protectionEnabled))protectedIds.add(id);
 map.render(shown,plan.level,selected,protectedIds);
 const visibleCount=shown.filter(f=>f.properties.sizeKm2>=displayLevel(plan.level,map.view().z).minSize).length;
 $('load-status').textContent=pending?'Gebiete werden geladen · '+ready+'/'+loader.wanted.size+' Pakete':errors?'Einige Gebiete konnten nicht geladen werden · '+errors+' Paketfehler':visibleCount+' Gebiete angezeigt'+(plan.level.id==='regional'?' · größere Flächen · zum Auswählen Suchbereich verkleinern oder näher zoomen':'');
 $('retry').hidden=!errors;$('show-areas').disabled=false;
 if(!pending&&!errors&&!shown.length)hint(grades.size?'Hier sind im gewählten Suchbereich keine passenden Flächen enthalten.':'Aktiviere mindestens eine Eignungsklasse im Filter.');
}
function queueRender(){if(!renderFrame)renderFrame=requestAnimationFrame(()=>{renderFrame=0;render();});}
function searchAreas(){if(mapFailed||!map||!index)return;const view=map.view();const next=searchPlan(index,radiusBounds(view,radius,view.bounds),view.z);
 if(next.level.id==='overview'){hint('Bitte näher heranzoomen oder einen kleineren Suchbereich wählen. Die vorhandene Auswahl bleibt bestehen.');return;}
 clearSelection();hint('');plan=next;loader.select(next.packages);queueRender();$('show-areas').textContent='In diesem Bereich suchen';
}
$('show-areas').onclick=searchAreas;$('retry').onclick=()=>{loader?.retry();queueRender();};$('reload-map').onclick=()=>location.reload();
$('close-detail').onclick=()=>{clearSelection();$('open-search').focus();};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))clearSelection();});
$('open-filters').onclick=()=>$('filter-dialog').showModal();
for(const checkbox of document.querySelectorAll('[name=grade]'))checkbox.onchange=()=>{grades=new Set(Array.from(document.querySelectorAll('[name=grade]:checked'),x=>x.value));for(const grade of ['A','B','C'])document.querySelector('.legend .grade-'+grade.toLowerCase()).style.opacity=grades.has(grade)?'1':'.25';hint('');queueRender();};
for(const input of document.querySelectorAll('[name=radius]'))input.onchange=()=>{radius=Number(input.value);$('show-areas').textContent='In diesem Bereich suchen';};
async function places(){if(placeData)return placeData;if(!placeRequest)placeRequest=checkedJSON(base+'places.json').then(validatePlaces).then(data=>placeData=data).catch(error=>{placeRequest=null;throw error;});return placeRequest;}
async function searchPlaces(){const sequence=++searchSequence,query=$('place-query').value;$('place-results').replaceChildren();if(query.trim().length<2){$('search-status').textContent='Mindestens zwei Zeichen eingeben.';return;}$('search-status').textContent='Orte werden gesucht …';
 try{const data=await places();if(sequence!==searchSequence)return;const found=findPlaces(data.places,query);$('search-status').textContent=found.length?found.length+' passende Orte':'Kein passender Ort gefunden.';
 for(const place of found){const button=node('button');button.type='button';button.append(node('span',place.name),node('small',place.lat.toFixed(2)+'° N · '+place.lon.toFixed(2)+'° O'));button.onclick=()=>{if(!map){$('search-status').textContent='Zum Zentrieren muss die Basiskarte verfügbar sein.';return;}map.center({lat:place.lat,lng:place.lon},12);$('place-label').textContent=place.name;$('search-dialog').close();hint('Klicke auf „In diesem Bereich suchen“, um die Gebiete zu laden.');$('show-areas').textContent='In diesem Bereich suchen';};$('place-results').append(button);}}
 catch{if(sequence===searchSequence)$('search-status').textContent='Ortsnamen konnten nicht geladen werden. Bitte erneut suchen.';}}
$('open-search').onclick=()=>{$('search-dialog').showModal();$('place-query').focus();};$('place-query').oninput=searchPlaces;
$('locate').onclick=async()=>{$('locate').disabled=true;hint('Standort wird nur nach deiner Freigabe verwendet.');try{const point=await currentLocation();if(point.lat<45.75||point.lat>55.3||point.lng<5.5||point.lng>17.25){hint('Dein Standort liegt außerhalb des Kartengebiets Deutschland / Österreich / Schweiz. Nutze bitte die Ortssuche.');return;}map.center(point,12);map.location(point);$('place-label').textContent='Mein Standort';hint('Standort gefunden. Starte die Gebietssuche für diesen Bereich.');$('show-areas').textContent='In diesem Bereich suchen';}catch(error){hint(error.message);}finally{$('locate').disabled=mapFailed;}};
async function sources(){try{const data=await checkedJSON(base+'sources.json');const box=$('source-content');box.replaceChildren(node('p','Habitatdaten: '+data.habitat_data_as_of+'. Die Klassen beschreiben Standortbedingungen, keine aktuellen Pilzfunde.'),node('h3','Naturschutz & Sammelregeln'),node('p','Die Habitatbewertung ist keine Sammelerlaubnis. Schutz-, Betretungs- und Sammelregeln unterscheiden sich je nach Gebiet und Region. Beachte örtliche Vorschriften, Schonzeiten, Mengenbeschränkungen, geschützte Arten und die Beschilderung vor Ort.'),node('p','Nur bestätigte Treffer ausgewählter amtlicher Schutzgebietsdaten werden angezeigt. Ein fehlender Hinweis bedeutet keine Sammelerlaubnis. Die Daten können unvollständig oder nicht mehr aktuell sein. Keine vollständige Schutzgebiets- oder Rechtsabdeckung.'));
 for(const item of data.protection||[]){box.append(node('h3',item.title));for(const credit of item.attribution.split('\n'))box.append(sourceCredit(credit));}
 const ul=node('ul');for(const item of data.habitats){const li=node('li');li.append(node('strong',item.title),node('p',item.attribution));if(item.license_url?.startsWith('https://')){const link=node('a',item.license);link.href=item.license_url;link.target='_blank';link.rel='noopener noreferrer';li.append(link);}ul.append(li);}
 box.append(ul,node('p','Ortsnamen: GeoNames (CC BY 4.0). Die Basiskarte wird von Google Maps geladen; dabei wird eine Verbindung zu Google hergestellt.'));
 for(const [text,url]of [['GeoNames','https://www.geonames.org/'],['CC BY 4.0','https://creativecommons.org/licenses/by/4.0/'],['Google Maps','https://maps.google.com']]){const link=node('a',text+' ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';box.append(link,node('span',' · '));}
 }catch{$('source-content').textContent='Die Quellen konnten nicht geladen werden. Bitte die Seite erneut laden.';}}
sources();
function startMap(){const start=mediaStartView(location.search,document.body.dataset);
 return Promise.all([checkedJSON(base+'index.json').then(validateIndex),createGoogleMap($('map'),start,{onIdle:moved,onSelect:choose,onClear:clearSelection,onError:showFailure})]).then(([loadedIndex,adapter])=>{if(mapFailed)return;index=loadedIndex;map=adapter;loader=new PackageLoader(base,{protectionEnabled:['checked','confirmed-only'].includes(index.protection_status),onChange:queueRender});for(const id of ['show-areas','locate','open-search','open-filters'])$(id).disabled=false;$('load-status').textContent='Gebiete werden vorbereitet …';moved();setTimeout(searchAreas,650);return loadWeather().then(data=>{weather=data;weatherFailure=null;$('weather-stand').textContent='Wetterdaten: 30 vollständige Tage bis '+weather.lastDate+' · aktuelle Bodenfeuchte: '+weather.soilValidAt+' · '+weather.source+' / '+weather.model+' · '+weather.license;map.weather(weather);if(selected){const f=shown.find(x=>x.id===selected);if(f)showDetail(f);}}).catch(error=>{weatherFailure=error;$('weather-stand').textContent='Wetterdaten derzeit nicht verfügbar';});}).catch(showFailure);}
installMapConsent({get:$,start:startMap,reload:()=>location.reload()});
function openLinkedDetails(){const target=document.getElementById(location.hash.slice(1));if(target?.tagName==='DETAILS')target.open=true;}
window.addEventListener('hashchange',openLinkedDetails);openLinkedDetails();
