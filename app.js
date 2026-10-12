(() => {
  'use strict';
  const C = TravelCore, K = TravelCrypto, S = TravelSync;
  const session = TravelSession.createSession();
  const $ = id => document.getElementById(id);
  let encryptedConnection = null, selectedTrip = null, selectedDate = '', pending = false, draft = false;
  let saveMessage = '저장된 기록을 불러왔어요.';
  const disabledBefore = new Map();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function node(tag, className, content) { const el = document.createElement(tag); if (className) el.className = className; if (content !== undefined) el.textContent = content; return el; }
  function action(label, className, listener) { const el = node('button', className, label); el.type = 'button'; el.addEventListener('click', listener); return el; }
  function link(label, href) { const el = node('a', '', label); el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; return el; }
  const tripNow = () => session.snapshot().data?.trips.find(trip => trip.id === selectedTrip);
  function setBusy(value) {
    pending = value; document.body.classList.toggle('busy', value); document.body.setAttribute('aria-busy', String(value));
    if (value) { for (const el of document.querySelectorAll('button,input,textarea')) { disabledBefore.set(el, el.disabled); el.disabled = true; } }
    else { for (const [el, disabled] of disabledBefore) el.disabled = disabled; disabledBefore.clear(); }
  }
  async function run(errorId, operation) {
    if (pending) return;
    $(errorId).textContent = ''; setBusy(true);
    try { await operation(); }
    catch (error) { $(errorId).textContent = error.message || '처리하지 못했습니다. 다시 시도해 주세요.'; }
    finally { setBusy(false); render(); }
  }
  function download(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function markChanged() { saveMessage = '아직 저장하지 않은 변경이 있어요.'; $('appError').textContent = ''; render(); }
  function render() {
    const state = session.snapshot();
    $('gate').hidden = state.unlocked; $('workspace').hidden = !state.unlocked;
    if (!state.unlocked) return;
    $('connectedRepo').textContent = state.repo;
    $('saveStatus').textContent = state.dirty ? '아직 저장하지 않은 변경이 있어요.' : saveMessage;
    $('saveBtn').disabled = pending;
    const trips = [...state.data.trips].sort((a, b) => a.start.localeCompare(b.start));
    if (!trips.some(trip => trip.id === selectedTrip)) selectedTrip = trips[0]?.id || null;
    $('tripList').replaceChildren();
    if (!trips.length) $('tripList').append(node('p', 'hint', '아직 등록한 여행이 없어요.'));
    for (const trip of trips) {
      const button = action('', `trip-card${trip.id === selectedTrip ? ' selected' : ''}`, () => { selectedTrip = trip.id; selectedDate = trip.start; render(); });
      button.setAttribute('aria-pressed', String(trip.id === selectedTrip));
      button.append(node('span', 'trip-card-destination', trip.destination), node('strong', '', trip.title), node('span', '', `${trip.start} → ${trip.end}`));
      $('tripList').append(button);
    }
    const trip = trips.find(item => item.id === selectedTrip);
    $('noTrip').hidden = !!trip; $('tripDetail').hidden = !trip;
    if (!trip) { $('timeline').replaceChildren(); return; }
    if (!C.validDate(selectedDate) || selectedDate < trip.start || selectedDate > trip.end) selectedDate = trip.start;
    $('tripDestination').textContent = trip.destination;
    $('tripTitle').textContent = trip.title;
    $('tripMeta').textContent = `${trip.start} — ${trip.end}  ·  ${C.dayCount(trip.start, trip.end)}일  ·  ${trip.people}명`;
    $('dayNumber').textContent = `DAY ${String(C.dayCount(trip.start, selectedDate)).padStart(2, '0')} / ${C.dayCount(trip.start, trip.end)}`;
    $('dayHeading').textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${selectedDate}T00:00:00Z`));
    $('dayPicker').value = selectedDate; $('dayPicker').min = trip.start; $('dayPicker').max = trip.end;
    $('prevDayBtn').disabled = pending || selectedDate === trip.start; $('nextDayBtn').disabled = pending || selectedDate === trip.end;
    const events = trip.events.filter(event => event.date === selectedDate).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    $('eventCount').textContent = `${events.length}개의 일정`;
    $('timeline').replaceChildren();
    if (!events.length) { const empty = node('div', 'day-empty'); empty.append(node('p', '', '아직 비어 있는 하루예요.'), action('＋ 첫 일정 적기', 'small-btn', () => openEvent())); $('timeline').append(empty); }
    for (const event of events) {
      const card = node('article', 'event-card'), content = node('div', 'event-content'), heading = node('div', 'event-heading');
      heading.append(node('h4', '', event.place), action('수정', 'quiet', () => openEvent(event)));
      content.append(heading);
      if (event.transport) content.append(node('p', 'event-info', `이동  ·  ${event.transport}`));
      if (event.lodging) content.append(node('p', 'event-info', `숙소  ·  ${event.lodging}`));
      if (event.note) content.append(node('p', 'event-note', event.note));
      const links = node('div', 'event-links');
      links.append(link('지도에서 찾기 ↗', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${trip.destination} ${event.place}`)}`));
      if (event.url) links.append(link('예약·참고 링크 ↗', event.url));
      content.append(links); card.append(node('div', 'event-time', event.time || '자유'), content); $('timeline').append(card);
    }
  }
  function openTrip(edit = false) {
    if (pending) return;
    const trip = edit ? tripNow() : null;
    $('tripForm').reset(); $('tripFormError').textContent = '';
    $('tripDialogTitle').textContent = trip ? '여행 수정' : '새 여행 만들기';
    $('tripId').value = trip?.id || '';
    $('tripName').value = trip?.title || ''; $('destination').value = trip?.destination || '';
    $('startDate').value = trip?.start || today(); $('endDate').value = trip?.end || today(); $('people').value = trip?.people || 1;
    $('deleteTripBtn').hidden = !trip; draft = false; $('tripDialog').showModal(); $('tripName').focus();
  }
  function openEvent(event = null) {
    if (pending) return;
    const trip = tripNow(); if (!trip) return;
    $('eventForm').reset(); $('eventFormError').textContent = ''; $('eventDialogTitle').textContent = event ? '일정 수정' : '일정 추가';
    for (const [field, key] of [['eventId','id'],['eventTime','time'],['eventPlace','place'],['eventTransport','transport'],['eventLodging','lodging'],['eventNote','note'],['eventUrl','url']]) $(field).value = event?.[key] || '';
    $('eventDate').value = event?.date || selectedDate; $('eventDate').min = trip.start; $('eventDate').max = trip.end;
    $('deleteEventBtn').hidden = !event; draft = false; $('eventDialog').showModal(); $('eventPlace').focus();
  }
  function closeDialog(id) {
    if (pending) return;
    if (['tripDialog','eventDialog'].includes(id) && draft && !confirm('반영하지 않은 입력을 닫을까요?')) return;
    draft = false; $(id).close();
    if (id === 'settingsDialog') $('passwordForm').reset();
  }
  function clearSensitiveDOM() {
    for (const id of ['tripList','timeline','tripDestination','tripTitle','tripMeta','dayNumber','dayHeading','eventCount','connectedRepo','saveStatus','appError','settingsStatus','settingsError','tripFormError','eventFormError']) $(id).replaceChildren();
    for (const id of ['tripForm','eventForm','setupForm','unlockForm','passwordForm']) $(id).reset();
    for (const dialog of document.querySelectorAll('dialog')) if (dialog.open) dialog.close();
    $('dayPicker').value = ''; $('connectionFile').value = '';
    selectedTrip = null; selectedDate = ''; draft = false;
  }
  function lock(disconnect = false) {
    if (pending) return;
    const state = session.snapshot();
    if ((state.dirty || draft) && !confirm('저장하지 않은 변경을 버리고 잠글까요?')) return;
    session.lock(true); clearSensitiveDOM();
    if (disconnect) { encryptedConnection = null; $('configStatus').textContent = '연결을 해제했어요. 연결 파일을 선택하거나 처음 연결을 진행하세요.'; }
    render(); $('unlockPassword').focus();
  }
  $('unlockForm').addEventListener('submit', event => {
    event.preventDefault(); run('gateError', async () => {
      if (!encryptedConnection) throw new Error('연결 정보가 아직 없어요. 아래의 처음 연결 또는 연결 파일 선택을 이용해 주세요.');
      const pass = $('unlockPassword').value;
      const connection = S.validateConnection(await K.decryptJSON(encryptedConnection, pass));
      await session.open(connection, pass); $('unlockForm').reset(); saveMessage = '저장된 기록을 불러왔어요.';
    });
  });
  $('setupForm').addEventListener('submit', event => {
    event.preventDefault(); run('gateError', async () => {
      const pass = $('setupPassword').value;
      if (pass !== $('setupConfirm').value) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      const connection = S.validateConnection({ repo: $('setupRepo').value.trim(), token: $('setupToken').value });
      const config = await K.encryptJSON(connection, pass);
      await session.open(connection, pass); encryptedConnection = config; $('setupForm').reset();
      saveMessage = '연결했어요. 첫 여행을 만든 뒤 변경 내용을 저장해 주세요.';
      $('settingsStatus').textContent = '연결 파일을 내려받아 보관하세요. 사이트 저장소에 업로드하면 다음부터 비밀번호만으로 열 수 있어요.';
      $('settingsDialog').showModal();
    });
  });
  $('connectionFile').addEventListener('change', () => run('gateError', async () => {
    const file = $('connectionFile').files[0]; if (!file) return;
    if (file.size > 16000) throw new Error('연결 파일 크기가 올바르지 않습니다.');
    const config = JSON.parse(await file.text());
    if (config.version !== 1 || config.kdf !== 'PBKDF2-SHA256') throw new Error('암호화된 connect.json을 선택해 주세요.');
    encryptedConnection = config; $('configStatus').textContent = '연결 파일을 선택했어요. 비밀번호를 입력해 주세요.';
  }));
  for (const id of ['newTripBtn','firstTripBtn']) $(id).addEventListener('click', () => openTrip());
  $('editTripBtn').addEventListener('click', () => openTrip(true));
  $('newEventBtn').addEventListener('click', () => openEvent());
  $('tripForm').addEventListener('submit', event => {
    event.preventDefault(); if (pending) return;
    try {
      const id = $('tripId').value || crypto.randomUUID();
      session.update(data => C.upsertTrip(data, { id, title: $('tripName').value, destination: $('destination').value, start: $('startDate').value, end: $('endDate').value, people: Number($('people').value), events: [] }));
      selectedTrip = id; draft = false; $('tripDialog').close(); markChanged();
    } catch (error) { $('tripFormError').textContent = error.message; }
  });
  $('eventForm').addEventListener('submit', event => {
    event.preventDefault(); if (pending) return;
    try {
      const input = { id: $('eventId').value || crypto.randomUUID(), date: $('eventDate').value, time: $('eventTime').value, place: $('eventPlace').value, transport: $('eventTransport').value, lodging: $('eventLodging').value, note: $('eventNote').value, url: $('eventUrl').value };
      session.update(data => C.upsertEvent(data, selectedTrip, input));
      selectedDate = input.date; draft = false; $('eventDialog').close(); markChanged();
    } catch (error) { $('eventFormError').textContent = error.message; }
  });
  $('deleteTripBtn').addEventListener('click', () => { if (!pending && confirm('이 여행과 모든 일정을 삭제할까요? 저장하면 다른 기기에도 반영됩니다.')) { session.update(data => C.removeTrip(data, $('tripId').value)); draft = false; $('tripDialog').close(); markChanged(); } });
  $('deleteEventBtn').addEventListener('click', () => { if (!pending && confirm('이 일정을 삭제할까요?')) { session.update(data => C.removeEvent(data, selectedTrip, $('eventId').value)); draft = false; $('eventDialog').close(); markChanged(); } });
  for (const [id, offset] of [['prevDayBtn',-1],['nextDayBtn',1]]) $(id).addEventListener('click', () => { if (!pending) { selectedDate = C.shiftDate(selectedDate, offset); render(); } });
  $('dayPicker').addEventListener('change', () => { if (!pending) { selectedDate = $('dayPicker').value; render(); } });
  $('saveBtn').addEventListener('click', () => run('appError', async () => { $('saveStatus').textContent = '암호화하여 저장하고 있어요…'; await session.save(); saveMessage = `저장 완료 · ${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`; }));
  $('reloadBtn').addEventListener('click', () => {
    if (session.snapshot().dirty && !confirm('저장하지 않은 변경을 버리고 최신 기록을 불러올까요? 변경을 남기려면 취소한 뒤 연결 설정에서 암호화 백업을 받으세요.')) return;
    run('appError', async () => { await session.reload(true); saveMessage = '최신 기록을 불러왔어요.'; });
  });
  $('settingsBtn').addEventListener('click', () => { if (!pending) { $('settingsError').textContent = ''; $('settingsStatus').textContent = ''; $('settingsDialog').showModal(); } });
  $('lockBtn').addEventListener('click', () => lock()); $('disconnectBtn').addEventListener('click', () => lock(true));
  $('downloadConnectionBtn').addEventListener('click', () => run('settingsError', async () => { const config = await session.connectionFile(); encryptedConnection = config; download('connect.json', config); $('settingsStatus').textContent = '연결 파일을 내려받았어요. 사이트 저장소 루트에 connect.json으로 업로드하면 비밀번호로 바로 열 수 있어요.'; }));
  $('downloadBackupBtn').addEventListener('click', () => run('settingsError', async () => { download(`travel-backup-${today()}.json`, await session.backup()); $('settingsStatus').textContent = '암호화 백업을 내려받았어요. 복구에는 현재 비밀번호가 필요합니다.'; }));
  $('passwordForm').addEventListener('submit', event => {
    event.preventDefault();
    if ($('nextPassword').value !== $('nextConfirm').value) { $('settingsError').textContent = '새 비밀번호 확인이 일치하지 않습니다.'; return; }
    if (!confirm('현재 기록을 저장하고 비밀번호를 바꿀까요? 새 연결 파일을 보관하고 사이트의 connect.json도 교체해야 합니다.')) return;
    run('settingsError', async () => { const config = await session.changePassword($('nextPassword').value); encryptedConnection = config; $('passwordForm').reset(); download('connect.json', config); $('settingsStatus').textContent = '비밀번호를 변경했어요. 새 connect.json을 사이트 저장소에 교체해 주세요. 필요하면 연결 파일을 다시 내려받을 수 있어요.'; saveMessage = '새 비밀번호로 저장했어요.'; });
  });
  for (const el of document.querySelectorAll('[data-close]')) el.addEventListener('click', () => closeDialog(el.dataset.close));
  for (const id of ['tripDialog','eventDialog','settingsDialog']) $(id).addEventListener('cancel', event => { event.preventDefault(); closeDialog(id); });
  for (const id of ['tripForm','eventForm']) $(id).addEventListener('input', () => { draft = true; });
  window.addEventListener('beforeunload', event => { if (session.snapshot().dirty || draft || pending) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { session.invalidate(); clearSensitiveDOM(); render(); });
  async function init() {
    setBusy(true);
    try {
      const result = await fetch('connect.json', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (result.status === 404) { $('configStatus').textContent = '처음이라면 아래에서 저장소를 연결해 주세요.'; $('setupDetails').open = true; }
      else if (!result.ok) throw new Error('연결 정보를 불러오지 못했습니다. 새로고침하거나 연결 파일을 선택해 주세요.');
      else { const content = await result.text(); if (content.length > 16000) throw new Error('연결 파일이 너무 큽니다.'); encryptedConnection = JSON.parse(content); $('configStatus').textContent = '비밀번호로 나의 여행 계획을 열어보세요.'; }
    } catch (error) { $('configStatus').textContent = '연결 정보를 불러오지 못했어요. 연결 파일 선택이나 처음 연결을 이용해 주세요.'; }
    finally { setBusy(false); render(); }
  }
  init();
})();
