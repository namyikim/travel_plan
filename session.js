(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./crypto.js'), require('./sync.js'));
  else root.TravelSession = factory(root.TravelCore, root.TravelCrypto, root.TravelSync);
}(globalThis, (C, K, S) => {
  'use strict';
  function createSession(deps = {}) {
    const read = deps.readRemote || S.readRemote, write = deps.writeRemote || S.writeRemote;
    let data = null, connection = null, password = null, sha = null, dirty = false, busy = false, generation = 0;
    function ready() {
      if (busy) throw new Error('처리 중입니다. 잠시 기다려 주세요.');
      if (!connection || !data) throw new Error('먼저 비밀번호로 잠금을 해제해 주세요.');
    }
    async function work(action) {
      if (busy) throw new Error('처리 중입니다. 잠시 기다려 주세요.');
      busy = true;
      const current = generation;
      const check = () => { if (current !== generation) throw new Error('페이지를 벗어나 연결이 잠겼습니다. 다시 열어 주세요.'); };
      try { const result = await action(check); check(); return result; } finally { busy = false; }
    }
    const loadData = async (remote, pass) => remote.envelope === null && remote.sha === null ? C.emptyData() : C.validateData(await K.decryptJSON(remote.envelope, pass));
    function snapshot() { return { unlocked: !!connection, busy, dirty, data: data ? C.validateData(data) : null, repo: connection?.repo || '' }; }
    async function open(config, pass) {
      if (connection) throw new Error('다른 저장소를 연결하려면 먼저 잠가 주세요.');
      K.checkPassword(pass);
      const valid = S.validateConnection(config);
      return work(async check => {
        const remote = await read(valid);
        check();
        const loaded = await loadData(remote, pass);
        check();
        connection = valid; password = pass; data = loaded; sha = remote.sha; dirty = false;
      });
    }
    function update(transform) { ready(); data = C.validateData(transform(C.validateData(data))); dirty = true; }
    async function save() {
      ready();
      return work(async check => {
        const envelope = await K.encryptJSON(data, password);
        check();
        const result = await write(connection, envelope, sha);
        check();
        sha = result.sha; dirty = false;
      });
    }
    async function reload(discard = false) {
      ready();
      if (dirty && !discard) throw new Error('저장하지 않은 변경이 있습니다.');
      return work(async check => {
        const remote = await read(connection);
        check();
        const loaded = await loadData(remote, password);
        check();
        data = loaded; sha = remote.sha; dirty = false;
      });
    }
    function lock(discard = false) {
      ready();
      if (dirty && !discard) throw new Error('저장하지 않은 변경이 있습니다.');
      invalidate();
    }
    function invalidate() { generation++; data = null; connection = null; password = null; sha = null; dirty = false; }
    async function connectionFile() { ready(); return work(() => K.encryptJSON(connection, password)); }
    async function backup() { ready(); return work(() => K.encryptJSON(data, password)); }
    async function changePassword(next) {
      ready(); K.checkPassword(next);
      return work(async check => {
        const config = await K.encryptJSON(connection, next);
        check();
        const envelope = await K.encryptJSON(data, next);
        check();
        const result = await write(connection, envelope, sha);
        check();
        sha = result.sha; password = next; dirty = false;
        return config;
      });
    }
    return { snapshot, open, update, save, reload, lock, invalidate, connectionFile, backup, changePassword };
  }
  return { createSession };
}));
