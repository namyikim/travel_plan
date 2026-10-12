(() => {
  'use strict';
  const C = TravelCore, K = TravelCrypto, S = TravelSync;
  const session = TravelSession.createSession();
  const loginStore = TravelLogin.createLoginStore();
  const $ = id => document.getElementById(id);
  let encryptedConnection = null, selectedTrip = null, selectedDate = '', pending = false, draft = false, viewGeneration = 0;
  let calendarMonth = '', calendarTrip = '';
  let saveMessage = '저장된 기록을 불러왔어요.';
  const disabledBefore = new Map();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function node(tag, className, content) { const el = document.createElement(tag); if (className) el.className = className; if (content !== undefined) el.textContent = content; return el; }
  function action(label, className, listener) { const el = node('button', className, label); el.type = 'button'; el.addEventListener('click', listener); return el; }
  function link(label, href) { const el = node('a', '', label); el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; return el; }
  const tripNow = () => session.snapshot().data?.trips.find(trip => trip.id === selectedTrip);
  function setBusy(value) {
    pending = value; document.body.classList.toggle('busy', value); document.body.setAttribute('aria-busy', String(value));
    if (value) { for (const el of document.querySelectorAll('button,input,textarea,select')) { disabledBefore.set(el, el.disabled); el.disabled = true; } }
    else { for (const [el, disabled] of disabledBefore) el.disabled = disabled; disabledBefore.clear(); }
  }
  async function run(errorId, operation) {
    if (pending) return;
    const generation = viewGeneration;
    const check = () => { if (generation !== viewGeneration) throw new Error('다시 비밀번호를 입력해 주세요.'); };
    $(errorId).textContent = ''; setBusy(true);
    try { await operation(check); }
    catch (error) { if (generation === viewGeneration) $(errorId === 'gateError' && session.snapshot().unlocked ? 'appError' : errorId).textContent = error.message || '처리하지 못했습니다. 다시 시도해 주세요.'; }
    finally { setBusy(false); render(); }
  }
  function download(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const money = (value, currency) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency, currencyDisplay: 'code' }).format(value);
  function markChanged() { saveMessage = '아직 저장하지 않은 변경이 있어요.'; $('appError').textContent = ''; render(); }
  function render() {
    const state = session.snapshot();
    if (state.unlocked) { if ($('gate').open) $('gate').close(); }
    else if (!$('gate').open) $('gate').showModal();
    $('workspace').hidden = !state.unlocked;
    if (!state.unlocked) return;
    $('connectedRepo').textContent = state.repo;
    $('saveStatus').textContent = state.accessPending ? '다른 기기 접속 등록이 아직 완료되지 않았어요. 연결 설정에서 다시 등록해 주세요.' : state.dirty ? '아직 저장하지 않은 변경이 있어요.' : saveMessage;
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
    renderCalendar(trip);
    const costs = C.tripCosts(trip);
    $('tripCosts').textContent = `여행 전체 금액  ·  ${money(costs.usdCents / 100, 'USD')}  +  ${money(costs.krw, 'KRW')}  ·  환율 미적용`;
    $('dayNumber').textContent = `DAY ${String(C.dayCount(trip.start, selectedDate)).padStart(2, '0')} / ${C.dayCount(trip.start, trip.end)}`;
    $('dayHeading').textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${selectedDate}T00:00:00Z`));
    $('dayPicker').value = selectedDate; $('dayPicker').min = trip.start; $('dayPicker').max = trip.end;
    $('prevDayBtn').disabled = pending || selectedDate === trip.start; $('nextDayBtn').disabled = pending || selectedDate === trip.end;
    const events = trip.events.filter(event => $('allEvents').checked || event.date === selectedDate).sort(C.compareEvents);
    $('eventCount').textContent = `${events.length}개의 일정 · 실제 시간순`;
    $('timeline').replaceChildren();
    if (!events.length) { const empty = node('div', 'day-empty'); empty.append(node('p', '', '아직 비어 있는 하루예요.'), action('＋ 첫 일정 적기', 'small-btn', () => openEvent())); $('timeline').append(empty); }
    for (const event of events) {
      const card = node('article', 'event-card'), content = node('div', 'event-content'), heading = node('div', 'event-heading');
      heading.append(node('h4', '', event.place), action('수정', 'quiet', () => openEvent(event)));
      content.append(heading, node('p', 'event-zone', `${event.date} · ${C.timeZones[event.timeZone]}${event.timeOccurrence === 'later' ? ' · 중복 시간 두 번째' : ''}`));
      if (event.transport) content.append(node('p', 'event-info', `이동  ·  ${event.transport}`));
      if (event.lodging) content.append(node('p', 'event-info', `숙소  ·  ${event.lodging}`));
      if (event.usdCents !== null || event.krw !== null) content.append(node('p', 'event-cost', [event.usdCents === null ? '' : money(event.usdCents / 100, 'USD'), event.krw === null ? '' : money(event.krw, 'KRW')].filter(Boolean).join(' + ')));
      if (event.note) content.append(node('p', 'event-note', event.note));
      const links = node('div', 'event-links');
      links.append(link('지도에서 찾기 ↗', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${trip.destination} ${event.place}`)}`));
      if (event.url) links.append(link('예약·참고 링크 ↗', event.url));
      content.append(links); card.append(node('div', 'event-time', event.time || '자유'), content); $('timeline').append(card);
    }
  }
  function renderCalendar(trip) {
    if (calendarTrip !== trip.id || calendarMonth < trip.start.slice(0,7) || calendarMonth > trip.end.slice(0,7)) calendarMonth = trip.start.slice(0,7);
    calendarTrip = trip.id;
    $('calendarMonth').textContent = `${calendarMonth.slice(0,4)}년 ${Number(calendarMonth.slice(5))}월`;
    $('calendarPrev').disabled = pending || calendarMonth <= trip.start.slice(0,7);
    $('calendarNext').disabled = pending || calendarMonth >= trip.end.slice(0,7);
    $('stayList').replaceChildren();
    const stays = [...trip.stays].sort((a,b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    if (!stays.length) $('stayList').append(node('p','hint','오아후 → 마우이처럼 지역별 체류 기간을 추가해 보세요.'));
    for (const stay of stays) {
      const button = action(`🏝️ ${stay.name} · ${stay.start.slice(5)} ~ ${stay.end.slice(5)}`, 'stay-chip', () => openStay(stay));
      button.title = `${stay.name} · ${stay.start} ~ ${stay.end} · 수정`; button.disabled = pending; $('stayList').append(button);
    }
    $('calendarGrid').replaceChildren();
    for (const day of C.calendarDays(trip, calendarMonth)) {
      if (!day.date) { const gap = node('div','calendar-gap'); gap.setAttribute('aria-hidden','true'); $('calendarGrid').append(gap); continue; }
      const cell = action('', `calendar-day${day.date === selectedDate ? ' selected' : ''}`, () => {
        if (pending) return;
        selectedDate = day.date; $('allEvents').checked = false; render(); $('dayDetails').scrollIntoView({behavior:'smooth',block:'start'}); $('newEventBtn').focus({preventScroll:true});
      });
      cell.disabled = pending || !day.inTrip;
      cell.setAttribute('aria-label', `${day.date} · ${day.stays.map(s=>s.name).join(', ')} · 일정 ${day.events.length}개`);
      if (day.date === selectedDate) cell.setAttribute('aria-current','date');
      cell.append(node('span','calendar-date',String(Number(day.date.slice(8)))));
      for (const stay of day.stays) { const badge=node('span','calendar-stay',`🏝️ ${stay.name}`); badge.title=stay.name; cell.append(badge); }
      for (const event of day.events.slice(0,3)) {
        const category = C.categories[C.eventCategory(event)];
        const line = node('span',`calendar-event category-${C.eventCategory(event)}`,`${category[0]} ${event.place}`);
        line.title = `${event.time || '시간 미정'} · ${C.timeZones[event.timeZone]} · ${event.place}`; cell.append(line);
      }
      if (day.events.length>3) cell.append(node('span','calendar-more',`+${day.events.length-3}개 더 보기`));
      if (day.inTrip && !day.events.length && !day.stays.length) cell.append(node('span','calendar-empty','일정 추가'));
      $('calendarGrid').append(cell);
    }
  }
  function openStay(stay = null) {
    if (pending) return;
    const trip = tripNow(); if (!trip) return;
    $('stayForm').reset(); $('stayFormError').textContent = '';
    $('stayId').value = stay?.id || ''; $('stayName').value = stay?.name || '';
    for (const field of ['stayStart','stayEnd']) { $(field).min=trip.start; $(field).max=trip.end; }
    $('stayStart').value = stay?.start || selectedDate; $('stayEnd').value = stay?.end || selectedDate;
    $('deleteStayBtn').hidden = !stay; draft=false; $('stayDialog').showModal(); $('stayName').focus();
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
    $('eventCategory').value = event?.category || 'auto';
    $('eventTimeZone').value = event?.timeZone || 'Asia/Seoul';
    $('eventTimeOccurrence').value = event?.timeOccurrence || 'earlier';
    $('eventUSD').value = event?.usdCents == null ? '' : (event.usdCents / 100).toFixed(2);
    $('eventKRW').value = event?.krw ?? '';
    $('eventDate').value = event?.date || selectedDate; $('eventDate').min = trip.start; $('eventDate').max = trip.end;
    $('deleteEventBtn').hidden = !event; draft = false; $('eventDialog').showModal(); $('eventPlace').focus();
  }
  function closeDialog(id) {
    if (pending) return;
    if (['tripDialog','eventDialog','stayDialog'].includes(id) && draft && !confirm('반영하지 않은 입력을 닫을까요?')) return;
    draft = false; $(id).close();
    if (id === 'settingsDialog') $('passwordForm').reset();
  }
  function clearSensitiveDOM() {
    for (const id of ['calendarGrid','stayList','calendarMonth','stayFormError','tripList','timeline','tripDestination','tripTitle','tripMeta','tripCosts','dayNumber','dayHeading','eventCount','connectedRepo','saveStatus','appError','settingsStatus','settingsError','tripFormError','eventFormError']) $(id).replaceChildren();
    for (const id of ['tripForm','eventForm','stayForm','setupForm','unlockForm','passwordForm']) $(id).reset();
    for (const dialog of document.querySelectorAll('dialog')) if (dialog.open) dialog.close();
    $('dayPicker').value = '';
    $('allEvents').checked = false;
    selectedTrip = null; selectedDate = ''; draft = false;
  }
  async function rememberLogin() {
    try { await session.rememberLogin(loginStore); }
    catch { $('appError').textContent = '로그인했지만 이 브라우저에서 로그인 유지 정보를 저장하지 못했어요. 다음 접속 때 다시 로그인해 주세요.'; }
  }
  function lock() {
    if (pending) return;
    const state = session.snapshot();
    if ((state.dirty || draft) && !confirm('저장하지 않은 변경을 버리고 로그아웃할까요?')) return;
    if (state.accessPending && !confirm('다른 기기의 접속 등록이 아직 완료되지 않았어요. 로그아웃할까요?')) return;
    run('appError', async () => {
      await loginStore.clear();
      session.lock(true); clearSensitiveDOM();
      $('configStatus').textContent = '로그아웃했어요. 비밀번호를 입력해 로그인하세요.';
    });
  }
  $('gate').addEventListener('cancel', event => event.preventDefault());
  $('unlockForm').addEventListener('submit', event => {
    event.preventDefault(); run('gateError', async check => {
      encryptedConnection = await S.readPublishedConnection(); check();
      if (!encryptedConnection) { $('setupDetails').hidden = false; throw new Error('아래의 최초 1회 설정에서 토큰과 비밀번호를 등록해 주세요. 이미 등록했다면 잠시 후 다시 시도해 주세요.'); }
      const pass = $('unlockPassword').value;
      const connection = S.validateConnection(await K.decryptJSON(encryptedConnection, pass));
      check();
      await session.open(connection, pass); $('unlockForm').reset(); saveMessage = '저장된 기록을 불러왔어요.';
      await rememberLogin();
    });
  });
  $('setupForm').addEventListener('submit', event => {
    event.preventDefault(); run('gateError', async () => {
      const pass = $('setupPassword').value;
      if (pass !== $('setupConfirm').value) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      const connection = S.personalConnection($('setupToken').value);
      await session.open(connection, pass); $('setupForm').reset();
      await rememberLogin();
      encryptedConnection = await session.enablePasswordAccess();
      $('setupDetails').hidden = true; $('setupDetails').open = false;
      saveMessage = '설정 완료! 다른 기기에서도 같은 비밀번호로 열 수 있어요.';
    });
  });
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
      const input = { id: $('eventId').value || crypto.randomUUID(), date: $('eventDate').value, time: $('eventTime').value, category: $('eventCategory').value, timeZone: $('eventTimeZone').value, timeOccurrence: $('eventTimeOccurrence').value, place: $('eventPlace').value, transport: $('eventTransport').value, lodging: $('eventLodging').value, note: $('eventNote').value, url: $('eventUrl').value, usdCents: C.parseMoney($('eventUSD').value, 'USD'), krw: C.parseMoney($('eventKRW').value, 'KRW') };
      session.update(data => C.upsertEvent(data, selectedTrip, input));
      selectedDate = input.date; calendarMonth = input.date.slice(0,7); draft = false; $('eventDialog').close(); markChanged();
    } catch (error) { $('eventFormError').textContent = error.message; }
  });
  $('newStayBtn').addEventListener('click', () => openStay());
  $('stayForm').addEventListener('submit', event => {
    event.preventDefault(); if(pending) return;
    try {
      session.update(data => C.upsertStay(data,selectedTrip,{id:$('stayId').value || crypto.randomUUID(), name:$('stayName').value,start:$('stayStart').value,end:$('stayEnd').value}));
      draft=false; $('stayDialog').close(); markChanged();
    } catch(error) { $('stayFormError').textContent=error.message; }
  });
  $('deleteStayBtn').addEventListener('click', () => {
    if(pending || !confirm('이 지역의 체류 기간을 삭제할까요? 상세 일정은 유지됩니다.')) return;
    session.update(data => C.removeStay(data,selectedTrip,$('stayId').value)); draft=false; $('stayDialog').close(); markChanged();
  });
  for(const [id,offset] of [['calendarPrev',-1],['calendarNext',1]]) $(id).addEventListener('click', () => {
    if(pending) return;
    const date=new Date(`${calendarMonth}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth()+offset); calendarMonth=date.toISOString().slice(0,7); render();
  });
  $('deleteTripBtn').addEventListener('click', () => { if (!pending && confirm('이 여행과 모든 일정을 삭제할까요? 저장하면 다른 기기에도 반영됩니다.')) { session.update(data => C.removeTrip(data, $('tripId').value)); draft = false; $('tripDialog').close(); markChanged(); } });
  $('deleteEventBtn').addEventListener('click', () => { if (!pending && confirm('이 일정을 삭제할까요?')) { session.update(data => C.removeEvent(data, selectedTrip, $('eventId').value)); draft = false; $('eventDialog').close(); markChanged(); } });
  for (const [id, offset] of [['prevDayBtn',-1],['nextDayBtn',1]]) $(id).addEventListener('click', () => { if (!pending) { selectedDate = C.shiftDate(selectedDate, offset); calendarMonth = selectedDate.slice(0,7); render(); } });
  $('allEvents').addEventListener('change', render);
  $('dayPicker').addEventListener('change', () => { if (!pending) { selectedDate = $('dayPicker').value; calendarMonth = selectedDate.slice(0,7); render(); } });
  $('saveBtn').addEventListener('click', () => run('appError', async () => { $('saveStatus').textContent = '암호화하여 저장하고 있어요…'; await session.save(); saveMessage = `저장 완료 · ${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`; }));
  $('reloadBtn').addEventListener('click', () => {
    if (session.snapshot().dirty && !confirm('저장하지 않은 변경을 버리고 최신 기록을 불러올까요? 변경을 남기려면 취소한 뒤 연결 설정에서 암호화 백업을 받으세요.')) return;
    run('appError', async () => { await session.reload(true); saveMessage = '최신 기록을 불러왔어요.'; });
  });
  $('settingsBtn').addEventListener('click', () => { if (!pending) { $('settingsError').textContent = ''; $('settingsStatus').textContent = ''; $('settingsDialog').showModal(); } });
  $('lockBtn').addEventListener('click', () => lock()); $('disconnectBtn').addEventListener('click', () => lock(true));
  $('enableAccessBtn').addEventListener('click', () => run('settingsError', async () => { encryptedConnection = await session.enablePasswordAccess(); $('settingsStatus').textContent = '등록 완료! 다른 기기에서도 같은 비밀번호로 열 수 있어요.'; saveMessage = '비밀번호 접속 등록을 완료했어요.'; }));
  $('downloadBackupBtn').addEventListener('click', () => run('settingsError', async () => { download(`travel-backup-${today()}.json`, await session.backup()); $('settingsStatus').textContent = '암호화 백업을 내려받았어요. 복구에는 현재 비밀번호가 필요합니다.'; }));
  $('passwordForm').addEventListener('submit', event => {
    event.preventDefault();
    if ($('nextPassword').value !== $('nextConfirm').value) { $('settingsError').textContent = '새 비밀번호 확인이 일치하지 않습니다.'; return; }
    if (!confirm('현재 기록을 저장하고 다른 기기의 접속 비밀번호도 함께 바꿀까요?')) return;
    run('settingsError', async () => { await session.changePassword($('nextPassword').value);
      try { await loginStore.clear(); await session.rememberLogin(loginStore); }
      catch { $('settingsError').textContent = '비밀번호는 변경됐지만 로그인 유지 갱신에 실패했어요. 다음 접속 때 새 비밀번호로 로그인해 주세요.'; }
      $('passwordForm').reset(); saveMessage = '새 비밀번호로 저장했어요.'; encryptedConnection = await session.enablePasswordAccess(); $('settingsStatus').textContent = '변경 완료! 다른 기기에서도 새 비밀번호로 열 수 있어요.'; });
  });
  for (const el of document.querySelectorAll('[data-close]')) el.addEventListener('click', () => closeDialog(el.dataset.close));
  for (const id of ['tripDialog','eventDialog','stayDialog','settingsDialog']) $(id).addEventListener('cancel', event => { event.preventDefault(); closeDialog(id); });
  for (const id of ['tripForm','eventForm','stayForm']) $(id).addEventListener('input', () => { draft = true; });
  window.addEventListener('beforeunload', event => { if (session.snapshot().dirty || session.snapshot().accessPending || draft || pending) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { viewGeneration++; session.invalidate(); clearSensitiveDOM(); render(); });
  async function init() {
    render();
    await run('gateError', async check => {
      $('configStatus').textContent = '로그인 상태를 확인하고 있습니다.';
      let saved;
      try { saved = await loginStore.load(); }
      catch { await loginStore.clear().catch(() => {}); }
      check();
      if (saved) {
        try {
          await session.open(saved.connection, saved.password); check();
          saveMessage = '자동 로그인했어요. 최신 기록을 불러왔습니다.';
          return;
        } catch (error) {
          check();
          if (error.code !== 'NETWORK') await loginStore.clear().catch(() => {});
          $('gateError').textContent = '자동 로그인하지 못했어요. 연결 상태를 확인하거나 비밀번호로 다시 로그인해 주세요.';
        }
      }
      encryptedConnection = await S.readPublishedConnection(); check();
      if (!encryptedConnection) { $('configStatus').textContent = '아래에서 처음 한 번 비밀번호를 설정해 주세요.'; $('setupDetails').hidden = false; $('setupDetails').open = true; }
      else $('configStatus').textContent = '로그인 상태는 이 브라우저에 유지됩니다. 공용 기기에서는 사용 후 로그아웃하세요.';
    });
    if (!session.snapshot().unlocked) $('unlockPassword').focus();
  }
  window.addEventListener('pageshow', event => { if (event.persisted) init(); });
  for (const [value, label] of Object.entries(C.timeZones)) { const option = node('option', '', label); option.value = value; $('eventTimeZone').append(option); }
  for (const [value, [icon,label]] of Object.entries(C.categories)) { const option=node('option','',`${icon} ${label}`); option.value=value; $('eventCategory').append(option); }
  init();
})();
