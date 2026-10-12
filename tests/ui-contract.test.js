const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('initial HTML exposes only lock screen and sets a strict script policy', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /id="workspace"[^>]*hidden/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script[^>]*src="https?:/);
  assert.doesNotMatch(html, /\son(?:click|submit|load)=/);
  for (const src of [...html.matchAll(/<script[^>]*src="([^"]+)"/g)]) assert.ok(fs.existsSync(path.join(__dirname, '..', src[1])));
});
test('UI never persists plaintext secrets or renders user HTML', () => {
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.doesNotMatch(app, /(?:localStorage|sessionStorage|indexedDB)/);
  assert.doesNotMatch(app, /\.innerHTML\s*=|insertAdjacentHTML|document\.write\(/);
  assert.match(app, /beforeunload/);
});
test('personal setup has no repository name entry field', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.doesNotMatch(html, /<input[^>]*id="setupRepo"/);
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.doesNotMatch(app, /\$\('setupRepo'\)/);
});
test('password access does not require connection-file upload or download controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.equal(/id="(?:connectionFile|downloadConnectionBtn)"/.test(html), false);
  assert.match(html, /id="enableAccessBtn"/);
  assert.match(html, /connect-src[^;]+https:\/\/raw\.githubusercontent\.com/);
});
