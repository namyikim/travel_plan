(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TravelWeather=factory();}(globalThis,()=>{
'use strict';
const regions={oahu:{name:'오하우 · 호놀룰루',lat:21.31,lon:-157.86},maui:{name:'마우이 · 카훌루이',lat:20.89,lon:-156.47},lahaina:{name:'마우이 · 라하이나',lat:20.88,lon:-156.68},haleakala:{name:'마우이 · 할레아칼라 정상',lat:20.71,lon:-156.25},kona:{name:'빅아일랜드 · 코나',lat:19.64,lon:-155.99},hilo:{name:'빅아일랜드 · 힐로',lat:19.71,lon:-155.08},volcano:{name:'빅아일랜드 · 화산공원',lat:19.42,lon:-155.26}};
function infer(trip,date){
 const events=trip.events.filter(e=>e.date===date),stays=(trip.stays||[]).filter(s=>s.start<=date&&s.end>=date);
 const labels=[events.map(e=>e.place).join(' '),stays.map(s=>s.name).join(' '),trip.destination+' '+trip.title];
 for(const label of labels){
  for(const [pattern,key] of [[/할레아칼라|haleakal/i,'haleakala'],[/힐로|hilo/i,'hilo'],[/화산|volcano/i,'volcano'],[/라하이나|카아나팔리|카어나팔리|lahaina|kaanapali/i,'lahaina'],[/마우이|maui/i,'maui'],[/코나|빅아일랜드|빅아이랜드|kona|big island/i,'kona'],[/오아후|오하우|호놀룰루|와이키키|oahu|honolulu|waikiki/i,'oahu']])if(pattern.test(label))return key;
 }
 return /하와이|hawaii/i.test(labels.join(' '))?'oahu':null;
}
function previousYear(date){const year=Number(date.slice(0,4))-1;let result=year+date.slice(4);if(date.slice(5)==='02-29'&&new Date(result+'T00:00:00Z').getUTCMonth()!==1)result=year+'-02-28';return result;}
function codeLabel(code){if(code===0)return '☀️ 맑음';if([1,2].includes(code))return '🌤️ 구름 조금';if(code===3)return '☁️ 흐림';if([45,48].includes(code))return '🌫️ 안개';if(code>=95)return '⛈️ 뇌우';if([71,73,75,77,85,86].includes(code))return '🌨️ 눈';if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return '🌧️ 비';return '날씨 정보 없음';}
function forecastFor(data,date){return (data.properties?.periods||[]).filter(p=>p.startTime?.slice(0,10)===date&&Number.isFinite(p.temperature)).map(p=>({day:p.isDaytime,temp:Math.round((p.temperatureUnit==='F'?(p.temperature-32)*5/9:p.temperature)*10)/10,summary:p.shortForecast||''}));}
function create(){
 let key='',generation=0,controller=null;const cache=new Map();
 const $=id=>document.getElementById(id);
 function clear(){generation++;controller?.abort();controller=null;key='';context='';currentTrip=null;currentDate='';cache.clear();$('weatherRegion').value='';$('dayWeather').hidden=true;$('weatherContent').replaceChildren();}
 async function json(url,signal){const child=new AbortController();const abort=()=>child.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);try{const response=await fetch(url,{signal:child.signal,credentials:'omit'});if(!response.ok)throw Error('날씨 서비스 응답 오류');return await response.json();}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}}
 function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
 function display(result,region,date){
  const box=$('weatherContent');box.replaceChildren(text('strong',result.heading),text('p',result.body),text('p',`${region.name} · 여행일 ${date} · ${result.note}`));
  const a=document.createElement('a');a.href=result.url;a.textContent=result.source+' ↗';a.target='_blank';a.rel='noopener noreferrer';box.append(a);
 }
 async function load(trip,date,regionKey){
  const region=regions[regionKey];if(!region)return;
  const next=JSON.stringify([trip.id,date,regionKey]);if(next===key)return;key=next;const current=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
  $('weatherContent').replaceChildren(text('p','날씨 정보를 불러오고 있어요…'));
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Pacific/Honolulu',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=name=>parts.find(p=>p.type===name).value;const today=`${part('year')}-${part('month')}-${part('day')}`;
  const delta=(Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;
  const cacheKey=JSON.stringify([date,regionKey,today]);const cached=cache.get(cacheKey);if(cached&&Date.now()-cached.at<1800000){display(cached.value,region,date);return;}
  let forecastUnavailable=false;
  try{
   if(delta>=0&&delta<=7){
    try{
     const point=await json(`https://api.weather.gov/points/${region.lat},${region.lon}`,signal);
     const url=new URL(point.properties?.forecast);if(url.origin!=='https://api.weather.gov')throw Error('예보 주소 오류');
     const periods=forecastFor(await json(url.href,signal),date);
     if(periods.length){const result={heading:'🌦️ 미국 기상청(NWS) 예보',body:periods.map(p=>`${p.day?'낮':'밤'} ${p.temp}°C · ${p.summary}`).join(' / '),note:'발표된 시간대만 표시 · 여행 전 최신 예보를 확인하세요.',source:'미국 기상청 NWS',url:`https://forecast.weather.gov/MapClick.php?lat=${region.lat}&lon=${region.lon}`};if(current!==generation)return;cache.set(cacheKey,{at:Date.now(),value:result});display(result,region,date);return;}
     forecastUnavailable=true;
    }catch(error){if(signal.aborted)return;forecastUnavailable=true;}
   }
   const historical=previousYear(date);const url=new URL('https://archive-api.open-meteo.com/v1/archive');url.search=new URLSearchParams({latitude:region.lat,longitude:region.lon,start_date:historical,end_date:historical,daily:'temperature_2m_max,temperature_2m_min,weather_code',timezone:'Pacific/Honolulu'});
   const data=await json(url.href,signal),daily=data.daily;
   if(daily?.time?.[0]!==historical||!Number.isFinite(daily.temperature_2m_max?.[0])||!Number.isFinite(daily.temperature_2m_min?.[0]))throw Error('과거 날씨 자료가 없습니다.');
   const result={heading:'📅 전년도 같은 시기 · 참고용 (예보 아님)',body:`${codeLabel(daily.weather_code?.[0])} · 최고 ${daily.temperature_2m_max[0]}°C / 최저 ${daily.temperature_2m_min[0]}°C`,note:`${historical} 과거 재분석 자료.${forecastUnavailable?' 현재 NWS 예보를 받지 못해 과거 자료를 표시합니다.':' 예보가 제공되는 약 7일 전부터 접속 시 NWS 예보를 우선 확인합니다.'}${date.slice(5)==='02-29'?' 윤년 대체일: 2월 28일.':''}`,source:'Open-Meteo · 과거 날씨 재분석',url:'https://open-meteo.com/en/docs/historical-weather-api'};
   if(current!==generation)return;cache.set(cacheKey,{at:Date.now(),value:result});display(result,region,date);
  }catch(error){if(current===generation&&!signal.aborted){key='';$('weatherContent').replaceChildren(text('p','날씨를 불러오지 못했습니다. 일정 저장에는 영향이 없습니다. 다른 날짜로 이동했다가 다시 선택해 주세요.'));}}
 }
 let currentTrip=null,currentDate='',context='';
 function update(trip,date){
  const next=trip.id+date,detected=infer(trip,date);$('dayWeather').hidden=false;
  if(context!==next){context=next;$('weatherRegion').value=detected||'';}
  currentTrip=trip;currentDate=date;
  if(!$('weatherRegion').value){generation++;controller?.abort();key='';$('weatherContent').replaceChildren(text('p','하와이 날씨를 확인할 지역을 선택해 주세요.'));return;}
  load(trip,date,$('weatherRegion').value);
 }
 for(const [value,region] of Object.entries(regions)){const option=text('option',region.name);option.value=value;$('weatherRegion').append(option);}
 $('weatherRegion').addEventListener('change',()=>{key='';if(currentTrip)update(currentTrip,currentDate);});
 return {update,clear};
}
return {regions,infer,previousYear,codeLabel,forecastFor,create};
}));
