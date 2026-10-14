(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory(require('./core.js'));
  else root.TravelMap=factory(root.TravelCore);
}(globalThis,C=>{
  'use strict';
  const dayEvents=(trip,date)=>trip.events.filter(event=>event.date===date).sort(C.compareEvents);
  // If a stop is reordered, do not display its old duration on an unrelated leg.
  const legMinutes=(from,to)=>from && to && from.date===to.date && to.travelFromId===from.id && Number.isInteger(to.travelMinutes) && to.travelMinutes>=1 && to.travelMinutes<=1440 ? to.travelMinutes : null;
  const formatMinutes=minutes=>minutes>=60 ? `${Math.floor(minutes/60)}시간${minutes%60 ? ` ${minutes%60}분` : ''}` : `${minutes}분`;
  function routeURL(events){
    if(events.length<2 || events.length>25) throw new Error('자동차 경로는 2~25개 장소에서 사용할 수 있어요.');
    if(events.some(event=>!event.mapLocation)) throw new Error('먼저 모든 일정의 지도 위치를 지정해 주세요.');
    if(events.some(event=>['flight','ferry'].includes(C.eventCategory(event)))) throw new Error('비행기·배 일정은 자동차 경로 대신 점선으로 확인해 주세요.');
    return `https://router.project-osrm.org/route/v1/driving/${events.map(e=>`${e.mapLocation.lon},${e.mapLocation.lat}`).join(';')}?overview=full&geometries=geojson&steps=false`;
  }
  function searchURL(query, island) {
    const url=new URL('https://nominatim.openstreetmap.org/search');
    url.search=new URLSearchParams({q:query.trim(),format:'jsonv2',limit:'5','accept-language':'ko,en'});
    const bounds={oahu:'-158.4,21.8,-157.6,21.2',maui:'-156.8,21.1,-155.9,20.5',bigisland:'-156.2,20.4,-154.7,18.8'};
    if(Object.hasOwn(bounds,island)) {
      url.searchParams.set('countrycodes','us');
      url.searchParams.set('viewbox',bounds[island]);
      url.searchParams.set('bounded','0');
    }
    return url;
  }
  const restaurantSearchText=event=>event.location?.trim() || event.place;
  function create({onLocation,onEdit,onTravelTime,isBusy,restaurants=false}){
    const ids=restaurants?{dayMap:'restaurantMap',mapStatus:'restaurantMapStatus',mapStops:'restaurantList',fitMapBtn:'restaurantFitMapBtn'}:{};
    const $=id=>document.getElementById(ids[id] || id);
    let island='oahu';
    const islandViews={oahu:[[21.48,-157.96],10],maui:[[20.8,-156.32],10],bigisland:[[19.65,-155.5],9]};
    function islandView(){map.setView(...islandViews[island]);}
    const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const button=(text,handler)=>{const b=el('button','quiet',text);b.type='button';b.addEventListener('click',handler);return b;};
    let map=null,layer=null,events=[],generation=0,signature='',pick=null,controller=null,routeLayer=null,lastSearch=0,searchBusy=false,routeBusy=false;
    const cache=new Map();
    const status=text=>{$('mapStatus').textContent=text;};
    function ensure(){
      if(map)return;
      if(!globalThis.L)throw new Error('지도를 불러오지 못했어요. 새로고침해 주세요.');
      map=L.map($('dayMap'),{scrollWheelZoom:false}).setView([21.3,-157.8],9);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror',()=>status('지도 배경을 불러오지 못했어요. 인터넷 연결을 확인해 주세요. 장소 목록은 계속 사용할 수 있습니다.'));
      layer=L.featureGroup().addTo(map);
      map.on('click',event=>{
        if(!pick || isBusy())return;
        const chosen=pick;pick=null;
        if(!confirm(`‘${chosen.place}’ 위치를 선택한 지점으로 지정할까요?`))return;
        onLocation(chosen.id,{lat:event.latlng.lat,lon:event.latlng.lng,label:chosen.place});
      });
    }
    function paint(){
      layer.clearLayers();routeLayer=null;
      let previous=null,previousEvent=null;
      events.forEach((event,index)=>{
        const location=event.mapLocation;
        if(!location){previous=null;previousEvent=null;return;}
        const point=[location.lat,location.lon];
        const icon=L.divIcon({className:'route-pin',html:String(index+1),iconSize:[30,30],iconAnchor:[15,15]});
        const popup=el('div','');popup.append(el('strong','',`${index+1}. ${event.place}`),el('p','',restaurants ? event.menu || '' : `${event.time || '시간 미정'} · ${C.timeZones[event.timeZone]}`),el('p','',location.label));
        L.marker(point,{icon,title:`${index+1}. ${event.place}`}).bindPopup(popup).addTo(layer);
        if(previous && !restaurants){
          L.polyline([previous,point],{color:'#2463d4',weight:3,dashArray:'6 8'}).addTo(layer);
          const minutes=legMinutes(previousEvent,event);
          if(minutes!==null){
            // This midpoint is on the planned connection, not a traffic-aware road route.
            const midpoint=[(previous[0]+point[0])/2,(previous[1]+point[1])/2];
            const labelIcon=L.divIcon({className:'route-duration-marker',html:`<span>약 ${formatMinutes(minutes)}</span>`,iconSize:[112,30],iconAnchor:[56,15]});
            L.marker(midpoint,{icon:labelIcon,interactive:false,keyboard:false,zIndexOffset:500}).addTo(layer);
          }
        }
        previous=point;previousEvent=event;
      });
      if(restaurants)islandView();
      else if(layer.getLayers().length)map.fitBounds(layer.getBounds(),{padding:[35,35],maxZoom:14});
      else map.setView(events[0]?.timeZone === 'Asia/Seoul' ? [37.56,126.97] : [21.3,-157.8],9);
      const missing=events.filter(e=>!e.mapLocation).length;
      if(restaurants){status(!events.length?'등록한 맛집이 없어요. 맛집 등록으로 추가해 주세요.':`${events.length}개 맛집 · 지도 표시 ${events.length-missing}개${missing ? ` · 위치 미지정 ${missing}개` : ''}`);return;}
      status(!events.length ? '이 날짜에는 일정이 없습니다.' : missing ? `${missing}개 일정의 위치를 지정해 주세요. 점선은 위치가 지정된 연속 일정만 연결합니다.` : '번호는 방문 순서입니다. 점선은 장소 사이 연결이며 실제 도로 경로가 아닙니다.');
    }
    async function search(event,query,results,searchButton){
      if(searchBusy || isBusy())return;
      query=query.trim();if(!query){status('검색할 장소명이나 주소를 입력해 주세요.');return;}
      const cacheKey=JSON.stringify([restaurants?island:null,query]);
      const current=generation;searchBusy=true;searchButton.disabled=true;results.replaceChildren();
      status('장소를 검색하고 있어요…');
      try{
        let found=cache.get(cacheKey);
        if(!found){
          const wait=Math.max(0,1100-(Date.now()-lastSearch));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
          if(current!==generation)return;
          lastSearch=Date.now();
          const url=searchURL(query,restaurants?island:undefined);
          const response=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),referrerPolicy:'strict-origin-when-cross-origin'});
          if(!response.ok)throw new Error('장소 검색 서비스에 연결하지 못했어요. 잠시 후 다시 시도하거나 지도에서 직접 지정해 주세요.');
          const data=await response.json();if(!Array.isArray(data))throw new Error('장소 검색 결과를 읽지 못했어요.');
          found=data.map(item=>({lat:Number(item.lat),lon:Number(item.lon),label:String(item.display_name || '').slice(0,1000)})).filter(p=>Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&p.label);
          if(current!==generation)return;cache.set(cacheKey,found);
        }
        if(current!==generation)return;
        status(found.length?'주소를 확인하고 해당 장소를 선택하세요.':'검색 결과가 없어요. 영문 장소명·주소로 검색하거나 지도에서 직접 지정해 주세요.');
        for(const place of found){const choice=button(place.label,()=>{if(current===generation&&!isBusy())onLocation(event.id,place);});choice.classList.add('map-result');results.append(choice);}
      }catch(error){if(current===generation)status(error.name==='TimeoutError'?'검색 시간이 초과됐어요. 다시 시도해 주세요.':error.message);}
      finally{if(current===generation){searchBusy=false;searchButton.disabled=false;}}
    }
    function list(){
      $('mapStops').replaceChildren();
      events.forEach((event,index)=>{
        if(index>0 && !restaurants){
          const from=events[index-1],minutes=legMinutes(from,event);
          const leg=el('div','map-leg-time');
          const label=el('label','map-leg-caption',`${index} → ${index+1} 지점 이동시간`);
          const input=el('input','map-leg-input');
          input.type='number';input.min='1';input.max='1440';input.step='1';input.inputMode='numeric';
          input.id=`mapLegMinutes${index}`;input.placeholder='예: 45';input.value=minutes??'';
          input.setAttribute('aria-label',`${index}번 지점에서 ${index+1}번 지점까지 예상 이동시간 (분)`);
          label.htmlFor=input.id;
          input.addEventListener('change',()=>{
            if(isBusy())return;
            if(input.value!==''&&!input.checkValidity()){input.reportValidity();return;}
            onTravelTime(from.id,event.id,input.value===''?null:Number(input.value));
          });
          leg.append(label,input,el('span','map-leg-unit','분 · 수동 입력'));
          $('mapStops').append(leg);
        }
        const card=el('article','map-stop'),heading=el('div','section-label');
        heading.append(el('strong','',restaurants ? `${index+1}. ${event.place}` : `${index+1}. ${event.time || '시간 미정'} · ${event.place}`),button(restaurants?'맛집 수정':'일정 수정',()=>{if(!isBusy())onEdit(event);}));card.append(heading);
        if(restaurants){
          for(const [label,value] of [['위치',event.location],['추천 메뉴',event.menu],['메모',event.note]])if(value)card.append(el('p','event-note',`${label} · ${value}`));
          if(event.url){const a=el('a','','예약·참고 링크 ↗');a.href=event.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
        }
        if(event.mapLocation)card.append(el('p','hint',`📍 ${event.mapLocation.label}`));
        const row=el('div','map-search'),input=el('input','');input.type='search';input.maxLength=300;input.value=event.mapLocation?.label || (restaurants ? restaurantSearchText(event) : event.place);input.setAttribute('aria-label',`${event.place}의 지도 검색어`);input.placeholder='정확한 장소명 또는 주소 (영문 가능)';
        const results=el('div','map-results'),find=button('장소 검색',()=>search(event,input.value,results,find));
        input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search(event,input.value,results,find);}});
        row.append(input,find);card.append(row,results);
        const actions=el('div','actions');actions.append(button('지도에서 지정',()=>{if(isBusy())return;pick=event;status(`‘${event.place}’ 위치를 지도에서 클릭하세요. 지도를 확대·이동해 정확한 지점을 선택하세요.`);$('dayMap').scrollIntoView({behavior:'smooth',block:'center'});}));
        if(event.mapLocation)actions.append(button('위치 지우기',()=>{if(!isBusy())onLocation(event.id,null);}));
        const next=events[index+1];
        if(!restaurants && event.mapLocation && next?.mapLocation){const a=el('a','quiet','다음 장소 길찾기 ↗');const origin=`${event.mapLocation.lat},${event.mapLocation.lon}`,destination=`${next.mapLocation.lat},${next.mapLocation.lon}`;a.href=`https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',origin,destination})}`;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}
        card.append(actions);$('mapStops').append(card);
      });
    }
    async function route(){
      if(routeBusy || isBusy())return;
      let url;try{url=routeURL(events);}catch(error){status(error.message);return;}
      routeBusy=true;const current=generation;$('roadRouteBtn').disabled=true;status('자동차 도로 경로를 찾고 있어요…');
      try{
        const response=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
        if(!response.ok)throw new Error('도로 경로 서비스에 연결하지 못했어요.');
        const data=await response.json(),result=data.routes?.[0];
        if(data.code!=='Ok'||!result||!Array.isArray(result.geometry?.coordinates)||!Number.isFinite(result.distance)||!Number.isFinite(result.duration))throw new Error('자동차로 연결할 수 있는 도로 경로가 없어요. 섬 사이 이동은 점선으로 확인해 주세요.');
        const coordinates=result.geometry.coordinates;
        if(!coordinates.length||!coordinates.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Math.abs(p[0])<=180&&Number.isFinite(p[1])&&Math.abs(p[1])<=90))throw new Error('경로 좌표를 읽지 못했어요.');
        if(current!==generation)return;
        if(routeLayer)map.removeLayer(routeLayer);
        routeLayer=L.polyline(coordinates.map(p=>[p[1],p[0]]),{color:'#087e92',weight:5}).addTo(map);
        map.fitBounds(routeLayer.getBounds(),{padding:[35,35]});
        status(`자동차 경로 약 ${(result.distance/1000).toFixed(1)}km · ${Math.round(result.duration/60)}분 (교통·체류 시간 제외, OSRM). 점선은 원래 방문 순서입니다.`);
      }catch(error){if(current===generation)status(`${error.message} 점선은 실제 도로가 아닌 방문 순서입니다.`);}
      finally{if(current===generation){routeBusy=false;$('roadRouteBtn').disabled=false;}}
    }
    function clear(){
      generation++;controller?.abort();controller=null;signature='';events=[];pick=null;searchBusy=false;routeBusy=false;cache.clear();
      if(map){map.remove();map=null;layer=null;routeLayer=null;}
      $('mapStops').replaceChildren();$('mapStatus').textContent='';
    }
    function update(trip,date){
      try{
        ensure();if(restaurants)island=trip.id;const selected=restaurants?trip.events:dayEvents(trip,date),next=JSON.stringify([trip.id,date,selected]);
        if(next!==signature){
          generation++;controller?.abort();controller=new AbortController();pick=null;searchBusy=false;routeBusy=false;
          if(routeLayer)map.removeLayer(routeLayer);routeLayer=null;
          signature=next;events=selected;paint();list();if(!restaurants)$('roadRouteBtn').disabled=false;
        }
        map.invalidateSize();
      }catch(error){status(error.message);}
    }
    if(!restaurants)$('roadRouteBtn').addEventListener('click',route);
    $('fitMapBtn').addEventListener('click',()=>{if(restaurants&&map){islandView();return;}if(map&&layer?.getLayers().length)map.fitBounds(layer.getBounds(),{padding:[35,35],maxZoom:14});});
    return {update,clear};
  }
  return {searchURL,restaurantSearchText,dayEvents,legMinutes,formatMinutes,routeURL,create};
}));
