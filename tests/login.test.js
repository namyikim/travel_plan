const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoginStore } = require('../login.js');
function storage() { let row; return { read: async () => structuredClone(row), write: async v => { row = structuredClone(v); }, clear: async () => { row = undefined; } }; }
const credentials = { connection: { repo: 'namyikim/travel-data', token: 'test-secret' }, password: 'Password2026' };
test('login survives a new instance without plaintext stored and logout removes it', async () => {
 const db = storage(), first = createLoginStore(db);
 await first.save(credentials);
 const row = await db.read();
 assert.equal(row.key.extractable, false);
 assert.ok(!JSON.stringify(row).includes('Password2026'));
 assert.ok(!JSON.stringify(row).includes('test-secret'));
 const next = createLoginStore(db);
 assert.deepEqual(await next.load(), credentials);
 await next.clear();
 assert.equal(await createLoginStore(db).load(), null);
});
test('logout wins over an in-progress remember operation', async () => {
 const db = storage(), store = createLoginStore(db);
 const saving = store.save(credentials);
 const clearing = store.clear();
 await Promise.all([saving, clearing]);
 assert.equal(await store.load(), null);
});
test('password update replaces saved credentials and corruption never restores login', async () => {
 const db = storage(), store = createLoginStore(db);
 await store.save(credentials);
 await store.save({ ...credentials, password: 'Changed2027' });
 assert.equal((await store.load()).password, 'Changed2027');
 const row = await db.read(); row.ciphertext = new ArrayBuffer(16); await db.write(row);
 await assert.rejects(store.load());
});
