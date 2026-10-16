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
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),25000);
    try {
      result = await fetchFn(`https://api.github.com/repos/${config.repo}${suffix}`, {
        ...options, cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch (cause) {
      const stage=options.method==='PUT'?'GitHub 저장 요청':'GitHub 조회 요청';
      throw error('NETWORK', controller.signal.aborted ? `${stage}이 25초 안에 응답하지 않았습니다. 입력은 현재 화면에 남아 있습니다.` : `${stage}을 완료하지 못했습니다 (${cause?.name || '통신 오류'}). 입력은 현재 화면에 남아 있습니다.`);
    } finally {clearTimeout(timer);} 
    if (result.status === 401) throw error('AUTH', '토큰이 만료되었거나 올바르지 않습니다. 처음 연결에서 새 토큰을 입력해 주세요.');
    if (result.status === 403 || result.status === 429) throw error('PERMISSION', '저장소 권한 또는 요청 제한을 확인해 주세요. 잠시 후 다시 시도할 수 있습니다.');
    if (result.status === 409 || result.status === 422) {
      let detail='';try{const body=await result.json();detail=typeof body.message==='string'?body.message.slice(0,300):'';}catch{}
      throw error('CONFLICT', `저장 충돌 (HTTP ${result.status})${detail ? ': '+detail : ''}. 입력은 유지됩니다.`);
    }
    if (result.status !== 404 && !result.ok) throw error('REMOTE', `저장소 응답에 문제가 있습니다 (${result.status}). 잠시 후 다시 시도해 주세요.`);
    return result;
  }
  async function verifyPrivate(connection, fetchFn) {
    const result = await request(connection, '', { method: 'GET' }, fetchFn);
    if (result.status === 404) throw error('ACCESS', '저장소를 찾을 수 없습니다. 이름과 토큰의 저장소 접근 권한을 확인해 주세요.');
    const repo = await result.json();
    if (repo.private !== true) throw error('PUBLIC', '여행 기록은 비공개(Private) 저장소에만 저장할 수 있습니다.');
  }
  async function readRemote(connection, fetchFn = fetch, revision = null) {
    await verifyPrivate(connection, fetchFn);
    if(revision !== null && !/^[a-f0-9]{40}$/.test(revision)) throw error('FORMAT','저장 이력 식별자가 올바르지 않습니다.');
    const result = await request(connection, '/contents/travel-data.json'+(revision ? `?ref=${revision}` : ''), { method: 'GET' }, fetchFn);
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
  function encryptedFields(value) {
    if (!value || value.version !== 1 || value.kdf !== 'PBKDF2-SHA256' || value.iterations !== 600000) throw error('FORMAT', '암호화된 연결 정보만 등록할 수 있습니다.');
    const { version, kdf, iterations, salt, iv, ciphertext } = value;
    for (const field of [salt, iv, ciphertext]) if (typeof field !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(field) || field.length > 16000) throw error('FORMAT', '연결 정보 형식을 확인해 주세요.');
    try { if (atob(salt).length !== 16 || atob(iv).length !== 12 || atob(ciphertext).length < 16) throw new Error(); }
    catch { throw error('FORMAT', '연결 정보 형식을 확인해 주세요.'); }
    return { version, kdf, iterations, salt, iv, ciphertext };
  }
  async function publishConnection(connection, envelope, fetchFn = fetch, verify = async () => {}) {
    const clean = encryptedFields(envelope);
    const site = { repo: 'namyikim/travel_plan', token: validateConnection(connection).token };
    try {
      const previous = await request(site, '/contents/connect.json', { method: 'GET' }, fetchFn);
      let sha;
      if (previous.status !== 404) {
        const file = await previous.json(); sha = file.sha;
        if (typeof sha !== 'string' || !sha) throw error('FORMAT', '기존 연결 정보를 확인하지 못했습니다.');
      }
      await verify();
      const result = await request(site, '/contents/connect.json', { method: 'PUT', body: JSON.stringify({ message: 'Update encrypted password access', content: btoa(JSON.stringify(clean)), ...(sha ? { sha } : {}) }) }, fetchFn);
      if (result.status === 404) throw error('PERMISSION', '사이트 저장소 접근 권한이 없습니다.');
      const saved = await result.json();
      if (!saved.content?.sha) throw error('FORMAT', '연결 정보 등록 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
      return { sha: saved.content.sha };
    } catch (failure) {
      if (['AUTH','PERMISSION','ACCESS'].includes(failure.code)) throw error(failure.code, '자동 연결 등록에는 travel_plan과 travel-data 두 저장소의 Contents 읽기·쓰기 권한이 필요합니다. 토큰 권한을 확인한 뒤 다시 시도해 주세요.');
      throw failure;
    }
  }
  async function readPublishedConnection(fetchFn = fetch) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    let result;
    try { result = await fetchFn(`https://raw.githubusercontent.com/namyikim/travel_plan/main/connect.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal }); }
    catch { throw error('NETWORK', '연결 정보를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'); } finally {clearTimeout(timer);}
    if (result.status === 404) return null;
    if (!result.ok) throw error('REMOTE', '연결 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    const body = await result.text();
    if (body.length > 16000) throw error('FORMAT', '연결 정보 크기가 올바르지 않습니다.');
    return encryptedFields(JSON.parse(body));
  }
  async function listHistory(connection, fetchFn=fetch) {
    const response=await request(connection,'/commits?path=travel-data.json&per_page=30',{method:'GET'},fetchFn);
    if(!response.ok)throw error('REMOTE','저장 이력을 불러오지 못했습니다.');
    const rows=await response.json();if(!Array.isArray(rows))throw error('FORMAT','저장 이력 형식이 올바르지 않습니다.');
    return rows.map(row=>({sha:row.sha,date:row.commit?.committer?.date || row.commit?.author?.date})).filter(row=>/^[a-f0-9]{40}$/.test(row.sha) && !Number.isNaN(Date.parse(row.date)));
  }
  return { listHistory, personalConnection, validateConnection, readRemote, writeRemote, publishConnection, readPublishedConnection };
}));
