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
  const elements = Object.fromEntries(['expenseCount', 'expenseEmpty', 'expenseList', 'expenseTotalKRW', 'expenseTotalUSD', 'expenseRate', 'expenseConvertedTotal'].map(id => [id, node('div')]));
  elements.expenseRate.value = '1400';
  const context = vm.createContext({ C, node, $: id => elements[id], money: (value, currency) => `${currency} ${value}` });
  vm.runInContext(source.slice(source.indexOf('  function renderExpenses('), source.indexOf('  async function loadExpenseRate(')), context);
  context.renderExpenses({ trips: [{ id: 'a', title: '<여행>', events: [event('meal', { krw: 0, usdCents: 12345 })] }] });
  const row = elements.expenseList.children[0];
  assert.equal(row.children.length, 4);
  assert.equal(row.children[1].textContent, 'meal');
  assert.equal(row.children[2].textContent, 'KRW 0');
  assert.equal(row.children[3].textContent, 'USD 123.45');
  assert.equal(elements.expenseTotalUSD.textContent, 'USD 123.45');
  assert.equal(elements.expenseEmpty.hidden, true);
  assert.equal(elements.expenseConvertedTotal.textContent, 'KRW 172830');
  elements.expenseRate.value = '';
  context.renderExpenseTotal({usdCents: 100, krw: 500});
  assert.equal(elements.expenseConvertedTotal.textContent, '환율을 입력해 주세요.');
  context.renderExpenses({ trips: [] });
  assert.equal(elements.expenseList.children.length, 0);
  assert.equal(elements.expenseEmpty.hidden, false);
  assert.equal(elements.expenseTotalKRW.textContent, 'KRW 0');
  assert.equal(elements.expenseTotalUSD.textContent, 'USD 0');
  assert.equal(elements.expenseConvertedTotal.textContent, 'KRW 0');
});


test('KRW total converts combined USD cents and rounds once to nearest won', () => {
  assert.equal(C.expenseTotalKRW({usdCents: 12345, krw: 50000}, '1400'), 222830);
  assert.equal(C.expenseTotalKRW({usdCents: 30, krw: 1000}, '1432.5678'), 1430);
  assert.equal(C.expenseTotalKRW({usdCents: 1, krw: 0}, '1450'), 15);
  assert.equal(C.expenseTotalKRW({usdCents: 1, krw: 0}, '1449.9999'), 14);
  for (const rate of ['', '0', '-1', 'Infinity', '1e3', '1400.12345', '1000001']) {
    assert.throws(() => C.expenseTotalKRW({usdCents: 100, krw: 0}, rate));
  }
  assert.throws(() => C.expenseTotalKRW({usdCents: 100, krw: Number.MAX_SAFE_INTEGER}, '1400'), /합계/);
});

test('rate loading applies dated rates, preserves manual input and handles network failure', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
  const elements = {expenseRate: {value: ''}, expenseRateStatus: {textContent: ''}};
  let resolveResponse, rendered = 0;
  const context = vm.createContext({ C, $: id => elements[id], AbortController, setTimeout, clearTimeout,
    expenseRateAttempted: false, expenseRateVersion: 0,
    session: {snapshot: () => ({unlocked: true})}, renderExpenseTotal: () => rendered++,
    fetch: async () => ({ok: true, json: async () => ({base: 'USD', quote: 'KRW', date: '2026-10-22', rate: 1432.5678})})
  });
  vm.runInContext(source.slice(source.indexOf('  async function loadExpenseRate('), source.indexOf('  const placeLabel=')), context);
  await context.loadExpenseRate();
  assert.equal(elements.expenseRate.value, '1432.5678');
  assert.match(elements.expenseRateStatus.textContent, /2026-10-22/);
  assert.equal(rendered, 1);
  context.fetch = () => new Promise(resolve => { resolveResponse = resolve; });
  const loading = context.loadExpenseRate();
  context.expenseRateVersion++;
  elements.expenseRate.value = '1500';
  resolveResponse({ok: true, json: async () => ({base: 'USD', quote: 'KRW', date:'2026-10-22', rate:1400})});
  await loading;
  assert.equal(elements.expenseRate.value, '1500');
  context.fetch = async () => { throw Error('offline'); };
  await context.loadExpenseRate();
  assert.match(elements.expenseRateStatus.textContent, /직접 입력/);
  assert.equal(elements.expenseRate.value, '1500');
  context.fetch = async () => ({ok:true, json:async()=>({base: 'USD', quote: 'KRW', date:'invalid',rate:1400})});
  await context.loadExpenseRate();
  assert.equal(elements.expenseRate.value, '1500');
});
