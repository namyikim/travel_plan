(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TravelCore = api;
}(globalThis, () => {
  'use strict';
  const fail = (message) => { throw new Error(message); };
  const emptyData = () => ({ version: 1, trips: [] });
  function text(value, label, limit, required = false) {
    if (typeof value !== 'string') fail(`${label}을 확인해 주세요.`);
    const result = value.trim();
    if ((required && !result) || result.length > limit) fail(`${label}을 ${required ? '1~' : ''}${limit}자 이내로 입력해 주세요.`);
    return result;
  }
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1000-01-01' && value <= '9999-12-31' && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  }
  function id(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('항목 식별자가 올바르지 않습니다.');
    return value;
  }
  function validateTrip(raw) {
    if (!raw || typeof raw !== 'object') fail('여행 정보를 확인해 주세요.');
    const trip = { id: id(raw.id), title: text(raw.title, '여행명', 100, true), destination: text(raw.destination, '목적지', 160, true), start: raw.start, end: raw.end, people: raw.people, events: [] };
    if (!validDate(trip.start) || !validDate(trip.end) || trip.start > trip.end) fail('출발일과 돌아오는 날을 확인해 주세요.');
    if (!Number.isInteger(trip.people) || trip.people < 1 || trip.people > 999) fail('동행 인원은 1~999명으로 입력해 주세요.');
    if (!Array.isArray(raw.events)) fail('일정 목록을 확인해 주세요.');
    trip.events = raw.events.map(event => validateEvent(event, trip));
    unique(trip.events);
    if (raw.stays !== undefined && !Array.isArray(raw.stays)) fail('체류 지역 목록을 확인해 주세요.');
    trip.stays = (raw.stays || []).map(stay => validateStay(stay, trip));
    unique(trip.stays);
    return trip;
  }
  const categories = { flight: ['✈️','비행기'], stay: ['🏨','숙박'], drive: ['🚗','차량 이동'], ferry: ['⛴️','배 이동'], food: ['🍽️','식사'], sight: ['📍','관광'], other: ['🗓️','기타'] };
  function eventCategory(event) {
    if (event.category && event.category !== 'auto') return event.category;
    const label = `${event.place} ${event.transport}`;
    if (/비행|항공|공항|flight|airport|✈/i.test(label)) return 'flight';
    if (/페리|여객선|ferry|크루즈/i.test(label)) return 'ferry';
    if (/렌터카|렌트카|택시|드라이브|운전|rental car|taxi/i.test(label)) return 'drive';
    if (/식사|맛집|점심|저녁|조식|식당|restaurant|lunch|dinner/i.test(label)) return 'food';
    if (/체크인|체크아웃|호텔|숙소|hotel|check.?in|check.?out/i.test(label)) return 'stay';
    return 'sight';
  }
  function validateStay(raw, trip) {
    if (!raw || typeof raw !== 'object') fail('체류 지역을 확인해 주세요.');
    const stay = { id: id(raw.id), name: text(raw.name, '체류 지역', 60, true), start: raw.start, end: raw.end };
    if (!validDate(stay.start) || !validDate(stay.end) || stay.start > stay.end || stay.start < trip.start || stay.end > trip.end) fail('체류 기간은 여행 기간 안에서 시작일·종료일 순으로 입력해 주세요.');
    return stay;
  }
  function upsertStay(raw, tripId, input) {
    const data = validateData(raw), trip = findTrip(data, tripId), stay = validateStay(input, trip);
    const index = trip.stays.findIndex(item => item.id === stay.id);
    if (index < 0) trip.stays.push(stay); else trip.stays[index] = stay;
    return data;
  }
  function removeStay(raw, tripId, stayId) {
    const data = validateData(raw), trip = findTrip(data, tripId);
    trip.stays = trip.stays.filter(stay => stay.id !== stayId); return data;
  }
  function calendarDays(trip, month) {
    if (typeof month !== 'string' || !validDate(`${month}-01`)) fail('달력의 월을 확인해 주세요.');
    const first = `${month}-01`, start = new Date(`${first}T00:00:00Z`);
    const length = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth()+1, 0)).getUTCDate();
    const days = Array.from({length:start.getUTCDay()}, () => ({date:null}));
    for (let day=1; day<=length; day++) {
      const date = `${month}-${String(day).padStart(2,'0')}`;
      days.push({date, inTrip:date>=trip.start && date<=trip.end, stays:(trip.stays || []).filter(stay=>stay.start<=date && stay.end>=date), events:trip.events.filter(event=>event.date===date).sort(compareEvents)});
    }
    while(days.length%7) days.push({date:null});
    return days;
  }
  function calendarWeeks(trip, month) {
    const days = calendarDays(trip, month), byName = new Map();
    for (const stay of trip.stays || []) {
      const key = stay.name.normalize('NFKC').trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({...stay});
    }
    const ranges = [];
    for (const group of byName.values()) {
      group.sort((a,b)=>a.start.localeCompare(b.start));
      let current;
      for (const stay of group) {
        if (current && Date.parse(`${stay.start}T00:00:00Z`) <= Date.parse(`${current.end}T00:00:00Z`)+86400000) {
          if (stay.end > current.end) current.end = stay.end;
        } else { current = {...stay}; ranges.push(current); }
      }
    }
    ranges.sort((a,b)=>a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    const weeks = [];
    for (let offset=0; offset<days.length; offset+=7) {
      const weekDays=days.slice(offset,offset+7), bars=[], laneEnds=[];
      for (const range of ranges) {
        const columns=weekDays.map((day,index)=>day.date && day.date>=range.start && day.date<=range.end ? index : -1).filter(index=>index>=0);
        if (!columns.length) continue;
        const start=columns[0], end=columns[columns.length-1];
        let lane=laneEnds.findIndex(last=>last<start);
        if(lane<0) lane=laneEnds.length;
        laneEnds[lane]=end;
        bars.push({name:range.name,start:range.start,end:range.end,column:start+1,span:end-start+1,lane,continuesBefore:range.start<weekDays[start].date,continuesAfter:range.end>weekDays[end].date});
      }
      weeks.push({days:weekDays,bars,lanes:laneEnds.length});
    }
    return weeks;
  }
  const timeZones = {
    'Asia/Seoul': '한국', 'Pacific/Honolulu': '미국 · 하와이',
    'America/Los_Angeles': '미국 · 서부 (LA)', 'America/Denver': '미국 · 산악 (덴버)',
    'America/Chicago': '미국 · 중부 (시카고)', 'America/New_York': '미국 · 동부 (뉴욕)',
    'America/Anchorage': '미국 · 알래스카', 'America/Phoenix': '미국 · 애리조나 (피닉스)'
  };
  const formatters = new Map(), instants = new Map();
  function eventInstant(event) {
    const zone = event.timeZone ?? 'Asia/Seoul';
    if (!Object.hasOwn(timeZones, zone)) fail('시간대를 선택해 주세요.');
    if (!validDate(event.date) || typeof event.time !== 'string' || (event.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time))) fail('날짜와 시간을 확인해 주세요.');
    if (!event.time) return Infinity;
    const cacheKey = `${event.date}T${event.time}|${zone}`;
    if (event.timeOccurrence !== 'later' && instants.has(cacheKey)) return instants.get(cacheKey);
    if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-GB', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }));
    const localStamp = instant => {
      const parts = Object.fromEntries(formatters.get(zone).formatToParts(instant).map(p => [p.type,p.value]));
      return Date.parse(`${parts.year.padStart(4,'0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    };
    const target = Date.parse(`${event.date}T${event.time}:00Z`), offsets = new Set();
    for (const hours of [-36,0,36]) { const sample = target + hours * 3600000; offsets.add(localStamp(sample) - sample); }
    const candidates = [...offsets].map(offset => target - offset).filter(instant => localStamp(instant) === target);
    if (!candidates.length) fail('서머타임 전환으로 존재하지 않는 현지 시간입니다. 시간을 확인해 주세요.');
    // Repeated fall-back times use the first occurrence, unless explicitly selected otherwise.
    const instant = event.timeOccurrence === 'later' ? Math.max(...candidates) : Math.min(...candidates);
    if (event.timeOccurrence !== 'later') { if (instants.size > 5000) instants.clear(); instants.set(cacheKey, instant); }
    return instant;
  }
  function compareEvents(a,b) {
    const left = eventInstant(a), right = eventInstant(b);
    if (left !== right) return left < right ? -1 : 1;
    return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id);
  }
  function moneyUnits(value) {
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || value < 0 || value > 999999999999) fail('금액을 올바른 범위로 입력해 주세요.');
    return value;
  }
  function parseMoney(value, currency) {
    if (!['USD', 'KRW'].includes(currency) || typeof value !== 'string') fail('통화와 금액을 확인해 주세요.');
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!(currency === 'USD' ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(trimmed)) fail('USD는 소수점 두 자리까지, 원화는 정수로 입력해 주세요.');
    const [whole, fraction = ''] = trimmed.split('.');
    return moneyUnits(currency === 'USD' ? Number(whole) * 100 + Number(fraction.padEnd(2, '0')) : Number(whole));
  }
  function tripCosts(trip) {
    return trip.events.reduce((total, event) => {
      total.usdCents += event.usdCents ?? 0; total.krw += event.krw ?? 0;
      if (!Number.isSafeInteger(total.usdCents) || !Number.isSafeInteger(total.krw)) fail('금액 합계가 너무 큽니다.');
      return total;
    }, { usdCents: 0, krw: 0 });
  }
  function validateMapLocation(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || !Number.isFinite(value.lat) || !Number.isFinite(value.lon) || Math.abs(value.lat)>90 || Math.abs(value.lon)>180) fail('지도 위치가 올바르지 않습니다. 장소를 다시 선택해 주세요.');
    return {lat:value.lat,lon:value.lon,label:text(value.label,'지도 장소명',1000,true)};
  }
  // A time belongs to a specific pair of consecutive daily stops.
  // Missing fields keep older version-1 itinerary JSON compatible.
  function validateTravelMinutes(value) {
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || value < 1 || value > 1440) fail('지점 간 이동시간은 1~1440분의 정수로 입력해 주세요.');
    return value;
  }
  function validateEvent(raw, trip) {
    if (!raw || typeof raw !== 'object') fail('일정 정보를 확인해 주세요.');
    if (!validDate(raw.date) || raw.date < trip.start || raw.date > trip.end) fail('모든 일정 날짜는 여행 기간 안에 있어야 합니다.');
    if (typeof raw.time !== 'string' || (raw.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time))) fail('시간을 확인해 주세요.');
    const event = { id: id(raw.id), date: raw.date, time: raw.time, place: text(raw.place, '일정·장소', 200, true), transport: text(raw.transport, '이동 정보', 500), lodging: text(raw.lodging, '숙소', 500), note: text(raw.note, '메모', 5000), url: text(raw.url, '참고 링크', 2000), mapLocation: validateMapLocation(raw.mapLocation), category: raw.category ?? 'auto', timeZone: raw.timeZone ?? 'Asia/Seoul', timeOccurrence: raw.timeOccurrence ?? 'earlier', usdCents: moneyUnits(raw.usdCents), krw: moneyUnits(raw.krw), travelFromId: raw.travelFromId == null ? null : id(raw.travelFromId), travelMinutes: validateTravelMinutes(raw.travelMinutes) };
    if ((event.travelFromId === null) !== (event.travelMinutes === null) || event.travelFromId === event.id) fail('이동시간의 출발 지점 정보를 확인해 주세요.');
    if (!['earlier','later'].includes(event.timeOccurrence)) fail('중복 시간 기준을 확인해 주세요.');
    if (event.category !== 'auto' && !Object.hasOwn(categories, event.category)) fail('일정 아이콘을 선택해 주세요.');
    eventInstant(event);
    if (event.url) {
      let url;
      try { url = new URL(event.url); } catch { fail('참고 링크는 https:// 또는 http://로 시작하는 주소를 입력해 주세요.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('참고 링크는 인증 정보 없는 웹 주소를 입력해 주세요.');
      event.url = url.href;
    }
    return event;
  }
  function unique(items) {
    if (new Set(items.map(item => item.id)).size !== items.length) fail('중복된 항목 식별자가 있습니다.');
  }
  function validateData(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.trips)) fail('지원하지 않는 여행 파일 형식입니다.');
    const data = { version: 1, trips: raw.trips.map(validateTrip) };
    unique(data.trips);
    if (raw.restaurants !== undefined) {
      if (!Array.isArray(raw.restaurants)) fail('맛집 목록을 확인해 주세요.');
      data.restaurants = raw.restaurants.map(validateRestaurant);
      unique(data.restaurants);
    }
    return data;
  }
  const islands = {oahu:'오하우', maui:'마우이', bigisland:'빅아이랜드'};
  function validateRestaurant(raw) {
    if (!raw || !Object.hasOwn(islands, raw.island)) fail('섬을 선택해 주세요.');
    const result = {id:id(raw.id), island:raw.island, name:text(raw.name,'맛집 이름',200,true), location:text(raw.location || '','위치',500), menu:text(raw.menu || '','추천 메뉴',500), note:text(raw.note || '','메모',5000), url:text(raw.url || '','링크',2000)};
    if (result.url) {
      let parsed; try { parsed = new URL(result.url); } catch { fail('올바른 링크를 입력해 주세요.'); }
      if (!['https:','http:'].includes(parsed.protocol)) fail('http 또는 https 링크를 입력해 주세요.');
    }
    return result;
  }
  function upsertRestaurant(raw, input) {
    const data=validateData(raw), item=validateRestaurant(input);
    data.restaurants ||= [];
    const index=data.restaurants.findIndex(r=>r.id===item.id);
    if(index<0)data.restaurants.push(item); else data.restaurants[index]=item;
    return data;
  }
  function removeRestaurant(raw, restaurantId) {
    const data=validateData(raw); data.restaurants=(data.restaurants || []).filter(r=>r.id!==restaurantId); return data;
  }
  function findTrip(data, tripId) {
    const trip = data.trips.find(item => item.id === tripId);
    if (!trip) fail('여행을 찾을 수 없습니다.');
    return trip;
  }
  function upsertTrip(raw, input) {
    const data = validateData(raw);
    const index = data.trips.findIndex(trip => trip.id === input.id);
    const trip = validateTrip({ ...input, stays: index < 0 ? [] : data.trips[index].stays, events: index < 0 ? [] : data.trips[index].events });
    if (index < 0) data.trips.push(trip); else data.trips[index] = trip;
    return data;
  }
  function upsertEvent(raw, tripId, input) {
    const data = validateData(raw), trip = findTrip(data, tripId);
    const event = validateEvent(input, trip), index = trip.events.findIndex(item => item.id === event.id);
    if (index < 0) trip.events.push(event); else trip.events[index] = event;
    return data;
  }
  function removeTrip(raw, tripId) {
    const data = validateData(raw);
    findTrip(data, tripId);
    data.trips = data.trips.filter(trip => trip.id !== tripId);
    return data;
  }
  function removeEvent(raw, tripId, eventId) {
    const data = validateData(raw), trip = findTrip(data, tripId);
    trip.events = trip.events.filter(event => event.id !== eventId);
    return data;
  }
  function shiftDate(date, offset) {
    if (!validDate(date) || !Number.isInteger(offset)) fail('날짜를 확인해 주세요.');
    return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  }
  const dayCount = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  return { islands, upsertRestaurant, removeRestaurant, categories, eventCategory, upsertStay, removeStay, calendarDays, calendarWeeks, timeZones, eventInstant, compareEvents, parseMoney, tripCosts, emptyData, validDate, validateTrip, validateEvent, validateData, upsertTrip, upsertEvent, removeTrip, removeEvent, shiftDate, dayCount };
}));
