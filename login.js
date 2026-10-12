(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TravelLogin = factory();
}(globalThis, () => {
  'use strict';
  function browserStorage() {
    function access(mode, operation) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('travel-note-login', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('login');
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('브라우저 로그인 저장소를 열 수 없습니다.'));
        request.onsuccess = () => {
          const db = request.result;
          let tx, result;
          try {
            tx = db.transaction('login', mode);
            const work = operation(tx.objectStore('login'));
            work.onsuccess = () => { result = work.result; };
          } catch (error) { db.close(); reject(error); return; }
          tx.oncomplete = () => { db.close(); resolve(result); };
          tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('로그인 정보 저장 실패')); };
        };
      });
    }
    return { read: () => access('readonly', s => s.get('current')), write: value => access('readwrite', s => s.put(value, 'current')), clear: () => access('readwrite', s => s.delete('current')) };
  }
  function createLoginStore(storage = browserStorage()) {
    let queue = Promise.resolve();
    const enqueue = action => { const task = queue.then(action); queue = task.catch(() => {}); return task; };
    return {
      save: credentials => enqueue(async () => {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(credentials)));
        await storage.write({ version: 1, key, iv, ciphertext });
      }),
      load: () => enqueue(async () => {
        const row = await storage.read();
        if (!row) return null;
        if (row.version !== 1) throw new Error('저장된 로그인 정보를 다시 등록해 주세요.');
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv }, row.key, row.ciphertext);
        return JSON.parse(new TextDecoder().decode(plain));
      }),
      clear: () => enqueue(() => storage.clear())
    };
  }
  return { createLoginStore };
}));
