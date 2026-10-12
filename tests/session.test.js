const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js'), K = require('../crypto.js');
const { createSession } = require('../session.js');
const password = 'my-private-travel-password';
const connection = { repo: 'owner/private', token: 'test-placeholder' };
const trip = { id: 'trip-1', title: '우리 여행', destination: '서울', start: '2027-02-11', end: '2027-02-12', people: 2, events: [] };
test('session saves encrypted edits, reloads, and lock clears all visible data', async () => {
  let remote = { envelope: null, sha: null };
  const session = createSession({ readRemote: async () => remote, writeRemote: async (config, envelope) => { remote = { envelope, sha: 'new' }; return { sha: 'new' }; } });
  await session.open(connection, password);
  session.update(data => C.upsertTrip(data, trip));
  assert.equal(session.snapshot().dirty, true);
  assert.throws(() => session.lock(), /저장/);
  await session.save();
  assert.equal(JSON.stringify(remote).includes('우리 여행'), false);
  assert.equal(session.snapshot().dirty, false);
  session.lock();
  assert.equal(session.snapshot().data, null);
  await assert.rejects(session.open(connection, 'wrong-password-long-enough'));
  assert.equal(session.snapshot().unlocked, false);
  await session.open(connection, password);
  assert.equal(session.snapshot().data.trips[0].title, '우리 여행');
});
test('failed write preserves edits; busy operation prevents lock and concurrent edits', async () => {
  let rejectWrite, began;
  const writing = new Promise(resolve => { began = resolve; });
  const session = createSession({ readRemote: async () => ({ envelope: null, sha: null }), writeRemote: () => { began(); return new Promise((resolve, reject) => { rejectWrite = reject; }); } });
  await session.open(connection, password);
  session.update(data => C.upsertTrip(data, trip));
  const saving = session.save();
  await writing;
  assert.throws(() => session.lock(true), /처리/);
  assert.throws(() => session.update(data => data), /처리/);
  rejectWrite(new Error('conflict'));
  await assert.rejects(saving, /conflict/);
  assert.equal(session.snapshot().dirty, true);
  assert.equal(session.snapshot().data.trips.length, 1);
});
test('rekey updates data and downloadable connection; old password cannot read new file', async () => {
  let remote = { envelope: null, sha: null };
  const session = createSession({ readRemote: async () => remote, writeRemote: async (config, envelope) => { remote = { envelope, sha: 'new' }; return { sha: 'new' }; } });
  await session.open(connection, password);
  const next = 'new-private-travel-password';
  const config = await session.changePassword(next);
  assert.deepEqual(await K.decryptJSON(config, next), connection);
  await assert.rejects(K.decryptJSON(remote.envelope, password));
  assert.deepEqual(await K.decryptJSON(remote.envelope, next), C.emptyData());
});
test('failed reload keeps local data and explicit discard is required', async () => {
  let fail = false;
  const session = createSession({ readRemote: async () => { if (fail) throw new Error('offline'); return { envelope: null, sha: null }; } });
  await session.open(connection, password);
  session.update(data => C.upsertTrip(data, trip));
  await assert.rejects(session.reload(), /저장/);
  fail = true;
  await assert.rejects(session.reload(true), /offline/);
  assert.equal(session.snapshot().data.trips.length, 1);
  assert.equal(session.snapshot().dirty, true);
});
test('existing falsy JSON payloads are corruption, never an empty new repository', async () => {
  for (const envelope of [null, false, 0, '']) {
    const session = createSession({ readRemote: async () => ({ envelope, sha: 'existing-file' }) });
    await assert.rejects(session.open(connection, password));
    assert.equal(session.snapshot().unlocked, false);
  }
});
test('corrupt reload preserves current edits instead of replacing them with empty data', async () => {
  let remote = { envelope: null, sha: null };
  const session = createSession({ readRemote: async () => remote });
  await session.open(connection, password);
  session.update(data => C.upsertTrip(data, trip));
  remote = { envelope: null, sha: 'existing-file' };
  await assert.rejects(session.reload(true));
  assert.equal(session.snapshot().data.trips[0].title, trip.title);
  assert.equal(session.snapshot().dirty, true);
});
test('navigation invalidates pending unlock and its eventual result cannot reopen the session', async () => {
  let resolveRead;
  const session = createSession({ readRemote: () => new Promise(resolve => { resolveRead = resolve; }) });
  const opening = session.open(connection, password);
  session.invalidate();
  resolveRead({ envelope: null, sha: null });
  await assert.rejects(opening, /잠겼/);
  assert.equal(session.snapshot().unlocked, false);
  assert.equal(session.snapshot().data, null);
});
test('navigation immediately clears a saving session and stale save completion stays locked', async () => {
  let resolveWrite, started;
  const writing = new Promise(resolve => { started = resolve; });
  const session = createSession({ readRemote: async () => ({ envelope: null, sha: null }), writeRemote: () => { started(); return new Promise(resolve => { resolveWrite = resolve; }); } });
  await session.open(connection, password);
  session.update(data => C.upsertTrip(data, trip));
  const saving = session.save();
  await writing;
  session.invalidate();
  assert.equal(session.snapshot().data, null);
  assert.equal(session.snapshot().unlocked, false);
  resolveWrite({ sha: 'saved' });
  await assert.rejects(saving, /잠겼/);
  assert.equal(session.snapshot().unlocked, false);
});
test('enable password access initializes data then publishes connection for another device', async () => {
  let remote = { envelope: null, sha: null }, published;
  const session = createSession({ readRemote: async () => remote, writeRemote: async (config, envelope) => { remote = { envelope, sha: 'new' }; return { sha: 'new' }; }, publishConnection: async (config, envelope) => { assert.ok(remote.envelope); published = envelope; return { sha: 'config' }; } });
  await session.open(connection, password);
  await session.enablePasswordAccess();
  const other = createSession({ readRemote: async () => remote });
  await other.open(await K.decryptJSON(published, password), password);
  assert.equal(other.snapshot().unlocked, true);
});
test('failed connection publishing keeps a usable session and can be retried without a JSON file', async () => {
  let remote = { envelope: null, sha: null }, fail = true, published;
  const session = createSession({ readRemote: async () => remote, writeRemote: async (config, envelope) => { remote = { envelope, sha: 'new' }; return { sha: 'new' }; }, publishConnection: async (config, envelope) => { if (fail) throw new Error('no site permission'); published = envelope; return { sha: 'config' }; } });
  await session.open(connection, password);
  await assert.rejects(session.enablePasswordAccess(), /no site permission/);
  assert.equal(session.snapshot().unlocked, true);
  assert.equal(session.snapshot().accessPending, true);
  fail = false;
  await session.enablePasswordAccess();
  assert.deepEqual(await K.decryptJSON(published, password), connection);
  assert.equal(session.snapshot().accessPending, false);
});
test('new password can be published and used on another device after a password change', async () => {
  let remote = { envelope: null, sha: null }, config;
  const session = createSession({ readRemote: async () => remote, writeRemote: async (connection, envelope) => { remote = { envelope, sha: 'saved' }; return { sha: 'saved' }; }, publishConnection: async (connection, envelope) => { config = envelope; return { sha: 'config' }; } });
  await session.open(connection, password);
  await session.enablePasswordAccess();
  await session.changePassword('NewTrip2027');
  assert.equal(session.snapshot().accessPending, true);
  await session.enablePasswordAccess();
  const other = createSession({ readRemote: async () => remote });
  await other.open(await K.decryptJSON(config, 'NewTrip2027'), 'NewTrip2027');
  assert.equal(other.snapshot().unlocked, true);
  await assert.rejects(K.decryptJSON(config, password));
});
