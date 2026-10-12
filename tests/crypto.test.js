const { test } = require('node:test');
const assert = require('node:assert/strict');
const K = require('../crypto.js');
const password = 'a-long-travel-password';
test('encrypted JSON round trip preserves Korean text and randomizes ciphertext', async () => {
  const data = { title: '여행 ✈', trips: [1, 2] };
  const a = await K.encryptJSON(data, password), b = await K.encryptJSON(data, password);
  assert.equal(a.iterations, 600000);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.equal(JSON.stringify(a).includes('여행'), false);
  assert.deepEqual(await K.decryptJSON(a, password), data);
});
test('short password, wrong password, tampering, and unsupported KDF rejected', async () => {
  await assert.rejects(K.encryptJSON({}, '1234567'));
  const envelope = await K.encryptJSON({ secret: 'hello' }, password);
  await assert.rejects(K.decryptJSON(envelope, 'different-password-123'));
  const bytes = Buffer.from(envelope.ciphertext, 'base64'); bytes[0] ^= 1;
  await assert.rejects(K.decryptJSON({ ...envelope, ciphertext: bytes.toString('base64') }, password));
  await assert.rejects(K.decryptJSON({ ...envelope, iterations: 999999999 }, password));
  await assert.rejects(K.decryptJSON({ ...envelope, iv: 'bad' }, password));
});
test('eight-character password can encrypt and decrypt records', async () => {
  const value = { title: '여행' };
  const envelope = await K.encryptJSON(value, 'Trip2027');
  assert.deepEqual(await K.decryptJSON(envelope, 'Trip2027'), value);
});
