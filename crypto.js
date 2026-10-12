(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TravelCrypto = api;
}(globalThis, () => {
  'use strict';
  const ITERATIONS = 600000;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
  function checkPassword(password) {
    if (typeof password !== 'string' || Array.from(password).length < 16 || password.length > 1024) throw new Error('비밀번호는 16자 이상, 1,024자 이하로 입력해 주세요.');
    if (!globalThis.crypto?.subtle) throw new Error('암호화를 사용할 수 없습니다. HTTPS 주소로 접속해 주세요.');
  }
  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  function fromBase64(value) {
    if (typeof value !== 'string' || value.length > 1200000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('암호화 파일 형식이 올바르지 않습니다.');
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
  }
  async function derive(password, salt) {
    const source = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptJSON(value, password) {
    checkPassword(password);
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = encoder.encode(JSON.stringify(value));
    if (plaintext.length > 600000) throw new Error('여행 데이터가 너무 큽니다. 오래된 메모나 일정을 정리해 주세요.');
    const key = await derive(password, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return { version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
  }
  async function decryptJSON(envelope, password) {
    checkPassword(password);
    if (!envelope || envelope.version !== 1 || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS) throw new Error('지원하지 않는 암호화 파일입니다.');
    const salt = fromBase64(envelope.salt), iv = fromBase64(envelope.iv), ciphertext = fromBase64(envelope.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('암호화 파일이 손상되었습니다.');
    try {
      const key = await derive(password, salt);
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return JSON.parse(decoder.decode(plaintext));
    } catch { throw new Error('비밀번호가 다르거나 암호화 파일이 손상되었습니다.'); }
  }
  return { encryptJSON, decryptJSON, checkPassword, toBase64, fromBase64 };
}));
