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
    return trip;
  }
  function validateEvent(raw, trip) {
    if (!raw || typeof raw !== 'object') fail('일정 정보를 확인해 주세요.');
    if (!validDate(raw.date) || raw.date < trip.start || raw.date > trip.end) fail('모든 일정 날짜는 여행 기간 안에 있어야 합니다.');
    if (typeof raw.time !== 'string' || (raw.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time))) fail('시간을 확인해 주세요.');
    const event = { id: id(raw.id), date: raw.date, time: raw.time, place: text(raw.place, '일정·장소', 200, true), transport: text(raw.transport, '이동 정보', 500), lodging: text(raw.lodging, '숙소', 500), note: text(raw.note, '메모', 5000), url: text(raw.url, '참고 링크', 2000) };
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
    return data;
  }
  function findTrip(data, tripId) {
    const trip = data.trips.find(item => item.id === tripId);
    if (!trip) fail('여행을 찾을 수 없습니다.');
    return trip;
  }
  function upsertTrip(raw, input) {
    const data = validateData(raw);
    const index = data.trips.findIndex(trip => trip.id === input.id);
    const trip = validateTrip({ ...input, events: index < 0 ? [] : data.trips[index].events });
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
  return { emptyData, validDate, validateTrip, validateEvent, validateData, upsertTrip, upsertEvent, removeTrip, removeEvent, shiftDate, dayCount };
}));
