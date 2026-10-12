const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sync.js');
const connection = { repo: 'owner/travel-data', token: 'test-only-placeholder' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const envelope = { ciphertext: 'encrypted-test' };
test('personal setup chooses the fixed private repository without repository input', () => {
  assert.deepEqual(S.personalConnection('test-placeholder'), { repo: 'namyikim/travel-data', token: 'test-placeholder' });
  assert.throws(() => S.personalConnection(''));
});
test('read decryptable envelope and sha from private repository', async () => {
  const result = await S.readRemote(connection, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-only-placeholder');
    return url.endsWith('/contents/travel-data.json') ? response({ sha: 'abc', encoding: 'base64', content: Buffer.from(JSON.stringify(envelope)).toString('base64') }) : response({ private: true });
  });
  assert.deepEqual(result, { envelope, sha: 'abc' });
});
test('missing file means empty only after verifying accessible private repository', async () => {
  assert.deepEqual(await S.readRemote(connection, async url => url.endsWith('/contents/travel-data.json') ? response({}, 404) : response({ private: true })), { envelope: null, sha: null });
  await assert.rejects(S.readRemote(connection, async () => response({}, 404)), e => e.code === 'ACCESS');
  await assert.rejects(S.readRemote(connection, async () => response({ private: false })), e => e.code === 'PUBLIC');
});
test('write uses sha for update and no sha for creation', async () => {
  for (const sha of [null, 'previous']) {
    const result = await S.writeRemote(connection, envelope, sha, async (url, options) => {
      if (options.method !== 'PUT') return response({ private: true });
      const body = JSON.parse(options.body);
      assert.equal(body.sha, sha || undefined);
      assert.deepEqual(JSON.parse(Buffer.from(body.content, 'base64').toString()), envelope);
      return response({ content: { sha: 'new-sha' } });
    });
    assert.deepEqual(result, { sha: 'new-sha' });
  }
});
test('conflict is surfaced without retry or overwrite and auth is categorized', async () => {
  let writes = 0;
  await assert.rejects(S.writeRemote(connection, envelope, 'old', async (url, options) => {
    if (options.method !== 'PUT') return response({ private: true });
    writes++; return response({}, 409);
  }), e => e.code === 'CONFLICT');
  assert.equal(writes, 1);
  for (const status of [401, 403]) await assert.rejects(S.readRemote(connection, async () => response({}, status)), e => e.code === (status === 401 ? 'AUTH' : 'PERMISSION'));
});
test('reject malformed repository, public writes, oversized data, and network failure', async () => {
  assert.throws(() => S.validateConnection({ ...connection, repo: 'owner/../../bad' }));
  await assert.rejects(S.writeRemote(connection, envelope, null, async () => response({ private: false })), e => e.code === 'PUBLIC');
  await assert.rejects(S.writeRemote(connection, { text: 'x'.repeat(900000) }, null, async () => response({ private: true })), e => e.code === 'SIZE');
  await assert.rejects(S.readRemote(connection, async () => { throw new Error('network with credential'); }), e => e.code === 'NETWORK' && !e.message.includes('credential'));
});
