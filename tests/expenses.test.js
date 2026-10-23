const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const event = (id, values = {}) => ({
  id, date: '2027-02-12', time: '09:00', timeZone: 'Asia/Seoul',
  place: id, usdCents: null, krw: null, ...values
});

test('expenses collect every trip, include explicit zero and exclude missing amounts', () => {
  const data = { trips: [
    { id: 'a', title: '첫 여행', events: [event('blank'), event('usd', { usdCents: 10 }), event('zero', { krw: 0 })] },
    { id: 'b', title: '다음 여행', events: [event('both', { usdCents: 20, krw: 50000 }), event('krw', { krw: 1000 }), { ...event('legacy'), usdCents: undefined, krw: undefined }] }
  ] };
  const before = JSON.stringify(data);
  const { items, totals } = C.expenseSummary(data);
  assert.deepEqual(items.map(({ event }) => event.id), ['both', 'krw', 'usd', 'zero']);
  assert.equal(items[0].trip.title, '다음 여행');
  assert.deepEqual(totals, { usdCents: 30, krw: 51000 });
  assert.equal(JSON.stringify(data), before);
});

test('expenses sort across trips by actual instant, respecting local time zones', () => {
  const departure = event('departure', { time: '22:00', krw: 100 });
  const arrival = event('arrival', { time: '10:00', timeZone: 'Pacific/Honolulu', usdCents: 50 });
  const summary = C.expenseSummary({ trips: [
    { id: 'a', events: [arrival] }, { id: 'b', events: [departure] }
  ] });
  assert.deepEqual(summary.items.map(({ event }) => event.id), ['departure', 'arrival']);
});

test('empty expenses show zero totals, and edits and deletions recalculate totals', () => {
  assert.deepEqual(C.expenseSummary({ trips: [] }), { items: [], totals: { usdCents: 0, krw: 0 } });
  const trip = { id: 'a', events: [event('paid', { krw: 100 })] };
  trip.events[0].krw = 200;
  assert.equal(C.expenseSummary({ trips: [trip] }).totals.krw, 200);
  trip.events[0].krw = null;
  assert.equal(C.expenseSummary({ trips: [trip] }).items.length, 0);
  trip.events = [];
  assert.equal(C.expenseSummary({ trips: [trip] }).totals.krw, 0);
});

test('expenses reject unsafe combined totals across trips', () => {
  assert.throws(() => C.expenseSummary({ trips: [
    { id: 'a', events: [event('a', { krw: Number.MAX_SAFE_INTEGER })] },
    { id: 'b', events: [event('b', { krw: 1 })] }
  ] }), /합계가 너무 큽니다/);
});

test('expense rendering keeps currencies separate and clears stale rows and totals', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
  const node = (tag, className, textContent) => ({ tag, className, textContent, children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  });
  const elements = Object.fromEntries(['expenseCount', 'expenseEmpty', 'expenseList', 'expenseTotalKRW', 'expenseTotalUSD'].map(id => [id, node('div')]));
  const context = vm.createContext({ C, node, $: id => elements[id], money: (value, currency) => `${currency} ${value}` });
  vm.runInContext(source.slice(source.indexOf('  function renderExpenses('), source.indexOf('  const placeLabel=')), context);
  context.renderExpenses({ trips: [{ id: 'a', title: '<여행>', events: [event('meal', { krw: 0, usdCents: 12345 })] }] });
  const row = elements.expenseList.children[0];
  assert.equal(row.children[0].textContent, '<여행>');
  assert.equal(row.children[3].textContent, 'KRW 0');
  assert.equal(row.children[4].textContent, 'USD 123.45');
  assert.equal(elements.expenseTotalUSD.textContent, 'USD 123.45');
  assert.equal(elements.expenseEmpty.hidden, true);
  context.renderExpenses({ trips: [] });
  assert.equal(elements.expenseList.children.length, 0);
  assert.equal(elements.expenseEmpty.hidden, false);
  assert.equal(elements.expenseTotalKRW.textContent, 'KRW 0');
  assert.equal(elements.expenseTotalUSD.textContent, 'USD 0');
});
