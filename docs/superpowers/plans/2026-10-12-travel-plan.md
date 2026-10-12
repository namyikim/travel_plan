# Travel Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user chooses delegation. Steps use checkbox syntax for tracking.

**Goal:** 비밀번호로 잠금을 해제하고 여행과 날짜별 일정을 직접 관리하는 GitHub Pages 웹페이지를 만든다.

**Architecture:** 공개 저장소의 정적 HTML/CSS/JS에서 비공개 GitHub 저장소의 암호화 파일을 조회·저장한다. 데이터 검증, 암호화, GitHub 동기화, 화면을 분리한다.

**Tech Stack:** HTML, CSS, browser JavaScript, Web Crypto, Node built-in test runner, GitHub Contents API.

**Spec:** ../specs/2026-10-12-travel-plan-design.md

## Global Constraints
- 빌드 및 외부 런타임 의존성이 없다. 한국어 반응형 화면을 제공한다.
- PBKDF2-SHA256 600,000회, AES-GCM, 비밀번호 16자 이상을 적용한다.
- 공개 저장소에는 코드와 암호화 connect.json만 둔다. 개인 기록과 토큰 원문을 커밋하지 않는다.
- 비밀번호·복호화 데이터·데이터용 토큰을 세션 메모리에서만 유지한다.
- SHA 충돌 시 자동 덮어쓰지 않는다. 저장 실패 시 세션의 입력을 유지한다.
- 업로드용 인증과 비공개 데이터 저장용 토큰은 별개다.

## Review Focus
1. 기간 축소 시 기존 일정이 사라지지 않도록 거부한다.
2. 잘못된 비밀번호 또는 변조된 암호문은 데이터 표시 전에 거부한다.
3. 저장 도중 잠금을 누르면 입력 손실을 방지한다.
4. 새 데이터 저장소의 파일 부재와 저장소 접근 실패를 구분한다.
5. 링크와 메모에 스크립트가 있어도 실행하지 않는다.

### Task 1: 데이터 모델
**Files:** core.js, tests/core.test.js, package.json
**Interfaces:** validateTrip(trip), validateEvent(event, trip), upsertTrip(data, trip), upsertEvent(data, tripId, event), removeTrip(data, tripId), removeEvent(data, tripId, eventId). data={version:1,trips:[]}; trip={id,title,destination,start,end,people,events:[]}; event={id,date,time,place,transport,lodging,note,url}.
- [ ] 작성: 실제 날짜·시간, 여행 CRUD, 이벤트 CRUD, 기간 축소, javascript: URL 거부 테스트. assert.throws(() => validateTrip({...trip,end:'2026-02-30'})); assert.throws(() => validateEvent({...event,url:'javascript:alert(1)'},trip)).
- [ ] 실행: node --test tests/core.test.js → 모듈 부재로 실패 확인.
- [ ] 구현: 위 인터페이스를 CommonJS/브라우저 호환으로 내보낸다. URL은 빈 값 또는 http/https만 허용하고 안정적인 ID를 유지한다.
- [ ] 실행: node --test tests/core.test.js → 모두 통과.
- [ ] 커밋: feat: add validated travel data model.

### Task 2: 암호화와 GitHub 저장
**Files:** crypto.js, sync.js, tests/crypto.test.js, tests/sync.test.js
**Interfaces:** encryptJSON(value,password)→Promise<{version,kdf,iterations,salt,iv,ciphertext}>; decryptJSON(envelope,password)→Promise<object>; readRemote(connection,fetchFn)→Promise<{envelope,sha}>; writeRemote(connection,envelope,sha,fetchFn)→Promise<{sha}>. connection={repo,token}; 고정 경로 travel-data.json.
- [ ] 작성: JSON 왕복, 15자 비밀번호 거부, 잘못된 비밀번호 및 암호문 변조 거부 테스트. assert.equal(envelope.iterations,600000); assert.rejects(() => decryptJSON(envelope,'different-password-123')).
- [ ] 작성: 모의 API 401/403/409, 저장소 없음, 접근 가능한 저장소의 파일 없음, 새 파일 생성 및 SHA 갱신 테스트. 충돌 후 write 호출 횟수는 1이다.
- [ ] 실행: node --test tests/crypto.test.js tests/sync.test.js → 실패 확인.
- [ ] 구현: 랜덤 salt와 12-byte IV, 비추출 키를 사용한다. 파일 부재 시 저장소 접근을 별도 확인한 뒤 빈 상태를 반환한다. 토큰을 메시지에 포함하지 않는다.
- [ ] 실행: node --test tests/crypto.test.js tests/sync.test.js → 모두 통과.
- [ ] 커밋: feat: add encrypted private repository sync.

### Task 3: 웹페이지와 설정
**Files:** index.html, style.css, app.js, tests/ui-contract.test.js
**Interfaces:** Task 1·2의 인터페이스를 사용한다. connect.json은 encryptJSON(connection,password)의 결과다. 같은 비밀번호로 데이터 파일을 독립 salt로 암호화한다.
- [ ] 작성: 초기 화면 정보 비노출, CSP 존재, 외부 스크립트 부재, 원문 토큰 영구 저장 부재에 대한 계약 테스트.
- [ ] 실행: node --test tests/ui-contract.test.js → 화면 파일 부재로 실패 확인.
- [ ] 구현: 잠금 화면, 초기 연결 설정, 암호화 연결 파일 다운로드, 여행 목록·상세·일정 편집 폼, 지도 검색 링크, 저장 상태, 잠금/연결 해제 및 비밀번호 변경을 구현한다. 비밀번호 변경 시 새 비밀번호로 데이터 저장 성공 후 새 연결 파일을 다운로드하도록 하고 공개 connect.json 교체 전까지 기존 기기 연결이 일치하지 않음을 안내한다.
- [ ] 구현: 비동기 작업 중 저장·잠금 중복 실행 방지, 미저장 변경 확인, 저장 실패 입력 유지, 충돌 시 사용자 선택 후 재조회. innerHTML로 사용자 입력을 렌더링하지 않는다.
- [ ] 실행: npm test → 모두 통과. 가능한 환경에서 브라우저로 초기 설정, 저장·재조회, 오답 비밀번호, 잠금, 모바일 화면 및 악성 메모를 확인한다. 브라우저 검증이 불가하면 그 한계를 기록한다.
- [ ] 커밋: feat: build password-protected travel planner interface.

### Task 4: 배포·문서·최종 검증
**Files:** README.md, .nojekyll, .github/workflows/test.yml
- [ ] 작성: README에 비공개 저장소 생성, 데이터용 Contents 토큰, 16자 이상 비밀번호, connect.json 업로드, GitHub Pages main/root 설정, 키 변경과 충돌 대응을 설명한다. 개인 데이터용 토큰이 없으면 실제 동기화는 미확인으로 표시한다.
- [ ] 구현: Node 테스트 CI와 .nojekyll을 추가한다.
- [ ] 실행: npm test, JavaScript 문법 검사, git diff --check. 전체 파일에서 인증 원문·여행 개인정보 미포함을 확인한다.
- [ ] 커밋: docs: document setup and add test workflow.
- [ ] 푸시: 사용자가 승인한 main으로 비강제 푸시한다. 인증은 세션에서만 제공하고 remote URL에 자격증명을 저장하지 않는다. 원격 변경이 있으면 먼저 검토·통합한다.
- [ ] 확인: GitHub 플러그인으로 원격 커밋·Actions 결과·Pages 상태를 확인한다. Pages 관리 권한이 없으면 사용자에게 main/root 설정 경로를 안내한다. 확인되지 않은 주소를 배포 완료라고 표현하지 않는다.
