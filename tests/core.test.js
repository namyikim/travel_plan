const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const trip = { id: 'trip-1', title: '가족 여행', destination: '제주', start: '2027-02-11', end: '2027-02-25', people: 3, events: [] };
const event = { id: 'event-1', date: '2027-02-12', time: '09:30', place: '해변 산책', transport: '도보', lodging: '', note: '천천히', url: 'https://example.com/reservation' };
test('trip and event CRUD preserves existing events and original input', () => {
  const empty = C.emptyData();
  let data = C.upsertTrip(empty, trip);
  data = C.upsertEvent(data, trip.id, event);
  data = C.upsertTrip(data, { ...trip, title: '새 제목' });
  assert.equal(empty.trips.length, 0);
  assert.equal(data.trips[0].events[0].place, '해변 산책');
  data = C.upsertEvent(data, trip.id, { ...event, place: '박물관' });
  assert.equal(data.trips[0].events.length, 1);
  assert.equal(data.trips[0].events[0].place, '박물관');
  assert.equal(C.removeEvent(data, trip.id, event.id).trips[0].events.length, 0);
  assert.equal(C.removeTrip(data, trip.id).trips.length, 0);
});
test('real calendar dates, dates in range, times, and positive integer people required', () => {
  for (const date of ['2027-02-29', '2027-02-30', '2027-13-01', '27-01-01']) assert.throws(() => C.validateTrip({ ...trip, end: date }));
  assert.doesNotThrow(() => C.validateTrip({ ...trip, start: '2028-02-29', end: '2028-03-01' }));
  for (const people of [0, -1, 1.5, Infinity]) assert.throws(() => C.validateTrip({ ...trip, people }));
  assert.throws(() => C.validateTrip({ ...trip, title: '  ' }));
  assert.throws(() => C.validateTrip({ ...trip, start: trip.end, end: trip.start }));
  assert.throws(() => C.validateEvent({ ...event, date: '2027-03-01' }, trip));
  assert.throws(() => C.validateEvent({ ...event, time: '24:00' }, trip));
  assert.throws(() => C.validateEvent({ ...event, url: 'javascript:alert(1)' }, trip));
  assert.throws(() => C.validateEvent({ ...event, url: 'https://user:pass@example.com' }, trip));
});
test('shortening a trip cannot remove or hide an existing event', () => {
  const data = C.upsertEvent(C.upsertTrip(C.emptyData(), trip), trip.id, event);
  assert.throws(() => C.upsertTrip(data, { ...trip, start: '2027-02-13' }));
  assert.equal(data.trips[0].events.length, 1);
});
test('remote data validation rejects duplicate ids, unknown schema, and invalid events', () => {
  assert.throws(() => C.validateData({ version: 2, trips: [] }));
  assert.throws(() => C.validateData({ version: 1, trips: [trip, trip] }));
  assert.throws(() => C.validateData({ version: 1, trips: [{ ...trip, events: [event, event] }] }));
  assert.throws(() => C.upsertEvent(C.emptyData(), 'missing', event));
  assert.throws(() => C.validateData({ version: 1, trips: [{ ...trip, events: [{ ...event, date: '2027-01-01' }] }] }));
});
test('day arithmetic uses date-only UTC across year and leap-day boundaries', () => {
  assert.equal(C.shiftDate('2028-02-28', 1), '2028-02-29');
  assert.equal(C.shiftDate('2027-12-31', 1), '2028-01-01');
  assert.equal(C.dayCount(trip.start, trip.end), 15);
});
test('old records have blank costs; USD and KRW survive editing and serialize independently', () => {
 assert.equal(C.validateEvent(event, trip).usdCents, null);
 assert.equal(C.validateEvent(event, trip).krw, null);
 const cost = { ...event, usdCents: C.parseMoney('123.45', 'USD'), krw: C.parseMoney('50000', 'KRW') };
 let data = C.upsertEvent(C.upsertTrip(C.emptyData(), trip), trip.id, cost);
 data = C.upsertTrip(JSON.parse(JSON.stringify(data)), { ...trip, title: '하와이' });
 assert.equal(data.trips[0].events[0].usdCents, 12345);
 assert.equal(data.trips[0].events[0].krw, 50000);
 assert.deepEqual(C.tripCosts(data.trips[0]), { usdCents: 12345, krw: 50000 });
});
test('cost totals use integer cents and update after removal', () => {
 let data = C.upsertTrip(C.emptyData(), trip);
 for (const [i, usd] of ['0.10','0.20'].entries()) data = C.upsertEvent(data, trip.id, { ...event, id: `cost-${i}`, usdCents: C.parseMoney(usd, 'USD'), krw: 1000 });
 assert.deepEqual(C.tripCosts(data.trips[0]), { usdCents: 30, krw: 2000 });
 data = C.removeEvent(data, trip.id, 'cost-0');
 assert.deepEqual(C.tripCosts(data.trips[0]), { usdCents: 20, krw: 1000 });
});
test('money validation permits blanks and zero but rejects negative, excess precision and unsafe amounts', () => {
 assert.equal(C.parseMoney('', 'USD'), null);
 assert.equal(C.parseMoney('0', 'KRW'), 0);
 for (const value of ['-1','Infinity','1e4','1.001','10000000000']) assert.throws(() => C.parseMoney(value, 'USD'));
 assert.throws(() => C.parseMoney('1.5', 'KRW'));
 for (const usdCents of [-1, NaN, Infinity, 1.2, Number.MAX_SAFE_INTEGER]) assert.throws(() => C.validateEvent({ ...event, usdCents }, trip));
});
test('Korea departure precedes Hawaii arrival despite reversed local clock times', () => {
 const depart = { ...event, id:'depart', date:'2027-02-11', time:'22:00', timeZone:'Asia/Seoul' };
 const arrive = { ...event, id:'arrive', date:'2027-02-11', time:'10:00', timeZone:'Pacific/Honolulu' };
 assert.equal(C.eventInstant(depart), Date.parse('2027-02-11T13:00:00Z'));
 assert.equal(C.eventInstant(arrive), Date.parse('2027-02-11T20:00:00Z'));
 assert.deepEqual([arrive,depart].sort(C.compareEvents).map(e=>e.id), ['depart','arrive']);
 assert.equal(C.validateEvent(event,trip).timeZone, 'Asia/Seoul');
});
test('US daylight saving and invalid local times are handled using the selected region', () => {
 const west = { ...event, date:'2027-07-11', time:'10:00', timeZone:'America/Los_Angeles' };
 assert.equal(C.eventInstant(west), Date.parse('2027-07-11T17:00:00Z'));
 assert.equal(C.eventInstant({...west,date:'2027-02-11'}), Date.parse('2027-02-11T18:00:00Z'));
 assert.throws(()=>C.eventInstant({...west,date:'2027-03-14',time:'02:30'}), /존재하지/);
 assert.equal(C.eventInstant({...west,date:'2027-11-07',time:'01:30'}), Date.parse('2027-11-07T08:30:00Z'));
 assert.equal(C.eventInstant({...west,date:'2027-11-07',time:'01:30',timeOccurrence:'later'}), Date.parse('2027-11-07T09:30:00Z'));
 assert.throws(()=>C.validateEvent({...event,timeZone:'Invalid/Zone'},trip));
});
test('all-date ordering uses instants, undated times sort last, and time zones survive edits', () => {
 const a={...event,id:'a',date:'2027-02-12',time:'01:00',timeZone:'Asia/Seoul'};
 const b={...event,id:'b',date:'2027-02-11',time:'10:00',timeZone:'Pacific/Honolulu'};
 assert.deepEqual([b,{...event,id:'c',time:''},a].sort(C.compareEvents).map(e=>e.id),['a','b','c']);
 const data=C.upsertEvent(C.upsertTrip(C.emptyData(),trip),trip.id,b);
 assert.equal(C.upsertTrip(data,{...trip,title:'새 여행'}).trips[0].events[0].timeZone,'Pacific/Honolulu');
});

test('point-to-point durations survive event edits and version-1 JSON round trips',()=>{
 const first={...event,id:'first',date:trip.start,time:'09:00'};
 const second={...event,id:'second',date:trip.start,time:'10:00',travelFromId:'first',travelMinutes:75};
 let data=C.upsertEvent(C.upsertTrip(C.emptyData(),trip),trip.id,first);
 data=C.upsertEvent(data,trip.id,second);
 data=C.validateData(JSON.parse(JSON.stringify(data)));
 assert.equal(data.trips[0].events[1].travelFromId,'first');
 assert.equal(data.trips[0].events[1].travelMinutes,75);
 data=C.upsertEvent(data,trip.id,{...data.trips[0].events[1],note:'edited'});
 assert.equal(data.trips[0].events[1].travelMinutes,75);
 assert.equal(C.validateEvent(event,trip).travelMinutes,null);
 for(const invalid of [-1,0,1.2,1441,NaN,Infinity,'30'])assert.throws(()=>C.validateEvent({...second,travelMinutes:invalid},trip));
 assert.throws(()=>C.validateEvent({...second,travelFromId:'second'},trip));
 assert.throws(()=>C.validateEvent({...second,travelFromId:null},trip));
 assert.throws(()=>C.validateEvent({...second,travelMinutes:null},trip));
});
