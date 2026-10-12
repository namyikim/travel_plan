(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TravelSync = api;
}(globalThis, () => {
  'use strict';
  const PERSONAL_REPOSITORY = 'namyikim/travel-data';
  const personalConnection = token => validateConnection({ repo: PERSONAL_REPOSITORY, token });
  function error(code, message) { return Object.assign(new Error(message), { code }); }
  function validateConnection(raw) {
    if (!raw || typeof raw.repo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(raw.repo) || /\/(?:\.|\.\.)$/.test(raw.repo)) throw error('CONFIG', '저장소는 사용자이름/저장소이름 형식으로 입력해 주세요.');
    if (typeof raw.token !== 'string' || !raw.token.trim() || /\s/.test(raw.token.trim())) throw error('CONFIG', '데이터 저장소용 토큰을 확인해 주세요.');
    return { repo: raw.repo, token: raw.token.trim() };
  }
  async function request(connection, suffix, options, fetchFn) {
    const config = validateConnection(connection);
    let result;
    try {
      result = await fetchFn(`https://api.github.com/repos/${config.repo}${suffix}`, {
        ...options, cache: 'no-store', signal: AbortSignal.timeout(25000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch { throw error('NETWORK', '연결하지 못했습니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요. 입력한 내용은 현재 화면에 남아 있습니다.'); }
    if (result.status === 401) throw error('AUTH', '토큰이 만료되었거나 올바르지 않습니다. 처음 연결에서 새 토큰을 입력해 주세요.');
    if (result.status === 403 || result.status === 429) throw error('PERMISSION', '저장소 권한 또는 요청 제한을 확인해 주세요. 잠시 후 다시 시도할 수 있습니다.');
    if (result.status === 409 || result.status === 422) throw error('CONFLICT', '다른 기기에서 기록이 바뀌었거나 저장 조건이 맞지 않습니다. 입력은 유지했습니다. 최신 기록을 불러와 확인해 주세요.');
    if (result.status !== 404 && !result.ok) throw error('REMOTE', `저장소 응답에 문제가 있습니다 (${result.status}). 잠시 후 다시 시도해 주세요.`);
    return result;
  }
  async function verifyPrivate(connection, fetchFn) {
    const result = await request(connection, '', { method: 'GET' }, fetchFn);
    if (result.status === 404) throw error('ACCESS', '저장소를 찾을 수 없습니다. 이름과 토큰의 저장소 접근 권한을 확인해 주세요.');
    const repo = await result.json();
    if (repo.private !== true) throw error('PUBLIC', '여행 기록은 비공개(Private) 저장소에만 저장할 수 있습니다.');
  }
  async function readRemote(connection, fetchFn = fetch) {
    await verifyPrivate(connection, fetchFn);
    const result = await request(connection, '/contents/travel-data.json', { method: 'GET' }, fetchFn);
    if (result.status === 404) return { envelope: null, sha: null };
    const file = await result.json();
    if (file.encoding !== 'base64' || typeof file.content !== 'string' || file.content.length > 1300000 || typeof file.sha !== 'string' || !file.sha) throw error('FORMAT', '여행 파일 형식이나 크기를 확인해 주세요.');
    try {
      const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
      return { envelope: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), sha: file.sha };
    } catch { throw error('FORMAT', '여행 파일을 읽을 수 없습니다. 파일 형식을 확인해 주세요.'); }
  }
  async function writeRemote(connection, envelope, sha, fetchFn = fetch) {
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    if (bytes.length > 850000) throw error('SIZE', '여행 파일이 너무 큽니다. 오래된 메모나 일정을 정리해 주세요.');
    await verifyPrivate(connection, fetchFn);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const body = { message: 'Update encrypted travel plans', content: btoa(binary), ...(sha ? { sha } : {}) };
    const result = await request(connection, '/contents/travel-data.json', { method: 'PUT', body: JSON.stringify(body) }, fetchFn);
    if (result.status === 404) throw error('ACCESS', '저장 권한이 없습니다. 데이터 저장소의 Contents 읽기·쓰기 권한을 확인해 주세요.');
    const saved = await result.json();
    if (!saved.content?.sha) throw error('FORMAT', '저장 결과를 확인하지 못했습니다. 최신 기록을 다시 불러와 확인해 주세요.');
    return { sha: saved.content.sha };
  }
  return { personalConnection, validateConnection, readRemote, writeRemote };
}));
