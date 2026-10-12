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
