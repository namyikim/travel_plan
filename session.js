(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./crypto.js'), require('./sync.js'));
  else root.TravelSession = factory(root.TravelCore, root.TravelCrypto, root.TravelSync);
}(globalThis, (C, K, S) => {
  'use strict';
  function createSession(deps = {}) {
    const read = deps.readRemote || S.readRemote, write = deps.writeRemote || S.writeRemote;
    let data = null, connection = null, password = null, sha = null, dirty = false, busy = false;
    function ready() {
      if (busy) throw new Error('처리 중입니다. 잠시 기다려 주세요.');
      if (!connection || !data) throw new Error('먼저 비밀번호로 잠금을 해제해 주세요.');
    }
    async function work(action) {
      if (busy) throw new Error('처리 중입니다. 잠시 기다려 주세요.');
      busy = true;
      try { return await action(); } finally { busy = false; }
    }
    function snapshot() { return { unlocked: !!connection, busy, dirty, data: data ? C.validateData(data) : null, repo: connection?.repo || '' }; }
    async function open(config, pass) {
      if (connection) throw new Error('다른 저장소를 연결하려면 먼저 잠가 주세요.');
      K.checkPassword(pass);
      const valid = S.validateConnection(config);
      return work(async () => {
        const remote = await read(valid);
        const loaded = remote.envelope ? C.validateData(await K.decryptJSON(remote.envelope, pass)) : C.emptyData();
        connection = valid; password = pass; data = loaded; sha = remote.sha; dirty = false;
      });
    }
    function update(transform) { ready(); data = C.validateData(transform(C.validateData(data))); dirty = true; }
    async function save() {
      ready();
      return work(async () => {
        const envelope = await K.encryptJSON(data, password);
        const result = await write(connection, envelope, sha);
        sha = result.sha; dirty = false;
      });
    }
    async function reload(discard = false) {
      ready();
      if (dirty && !discard) throw new Error('저장하지 않은 변경이 있습니다.');
      return work(async () => {
        const remote = await read(connection);
        const loaded = remote.envelope ? C.validateData(await K.decryptJSON(remote.envelope, password)) : C.emptyData();
        data = loaded; sha = remote.sha; dirty = false;
      });
    }
    function lock(discard = false) {
      ready();
      if (dirty && !discard) throw new Error('저장하지 않은 변경이 있습니다.');
      data = null; connection = null; password = null; sha = null; dirty = false;
    }
    async function connectionFile() { ready(); return work(() => K.encryptJSON(connection, password)); }
    async function backup() { ready(); return work(() => K.encryptJSON(data, password)); }
    async function changePassword(next) {
      ready(); K.checkPassword(next);
      return work(async () => {
        const config = await K.encryptJSON(connection, next);
        const envelope = await K.encryptJSON(data, next);
        const result = await write(connection, envelope, sha);
        sha = result.sha; password = next; dirty = false;
        return config;
      });
    }
    return { snapshot, open, update, save, reload, lock, connectionFile, backup, changePassword };
  }
  return { createSession };
}));
