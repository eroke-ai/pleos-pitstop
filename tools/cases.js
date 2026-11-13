// 전체 경우 테스트: 화면 전환·차량 신호·예외·재시작·작은 화면을 자동으로 확인한다
// 사용: node cases.js <web폴더> <결과폴더> [폭] [높이]
const { chromium } = require('playwright');
const web = process.argv[2], out = process.argv[3];
const W = +(process.argv[4] || 1600), H = +(process.argv[5] || 720);
const url = 'file://' + web + '/index.html';
const results = [];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => p.evaluate(f, a);
  const wait = ms => p.waitForTimeout(ms);
  const route = () => ev(() => UI.route && UI.route.name);
  const has = sel => ev(s => !!document.querySelector(s), sel);
  const text = () => ev(() => document.getElementById('stage').innerText);
  async function test(name, fn) {
    const e0 = errs.length; let ok = false, note = '';
    try { const r = await fn(); ok = r === true || (r && r.ok); note = (r && r.note) || ''; } catch (e) { note = 'EXC ' + e.message.split('\n')[0]; }
    if (errs.length > e0) { ok = false; note += ' JS오류: ' + errs.slice(e0).join(' | '); }
    results.push({ name, ok, note }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? ' — ' + note : ''));
  }
  const fresh = async () => { await p.addInitScript(() => { window.__night = 0; }); await p.goto(url); await ev(() => localStorage.clear()); await p.reload(); await wait(1900); };
  const P = () => ev(() => PS.onVehicle({ gear: 'P', speed: 0 }, 'demo'));
  const D = (sp = 30) => ev(s => PS.onVehicle({ gear: 'D', speed: s }, 'demo'), sp);

  await fresh();
  await test('01 시작: 로고 후 정비 지도로 자동 이동(2초 안)', async () => (await route()) === 'home');
  await test('02 주차 중 정비 지도에 점검 필요 카드 표시', async () => (await text()).includes('점검'));
  await test('03 P→D: 주행 화면으로 바뀜', async () => { await D(42); await wait(250); return (await route()) === 'drive' && (await text()).includes('42'); });
  await test('04 주행 중 속도 변화가 바로 반영', async () => { await ev(() => PS.onVehicle({ speed: 88 }, 'demo')); return (await ev(() => $('#spd').textContent)) === '88'; });
  await test('05 주행 중에는 부품 찾기·주문 화면이 열리지 않음', async () => { const t = await text(); return !t.includes('주문하기') && !(await has('#q')); });
  await test('06 D→P: 정비 지도로 돌아옴', async () => { await P(); await wait(250); return (await route()) === 'home'; });
  await test('07 R·N 기어도 주행 화면 처리', async () => { await ev(() => PS.onVehicle({ gear: 'R', speed: 3 }, 'demo')); const a = await route(); await P(); await ev(() => PS.onVehicle({ gear: 'N', speed: 0 }, 'demo')); const c = await route(); await P(); return { ok: a === 'drive' && c === 'drive', note: `R=${a}, N=${c}` }; });
  await test('08 기어를 빠르게 20번 바꿔도 오류 없음', async () => { for (let i = 0; i < 20; i++) { await (i % 2 ? P() : D(10)); } await P(); return (await route()) === 'home'; });
  await test('09 엔진오일 경고 켜면 지도에 빨간 경고', async () => { await ev(() => PS.onVehicle({ warn: { engineOil: true } }, 'demo')); await wait(200); return (await text()).includes('엔진오일 부족'); });
  await test('10 경고 4개 동시에 켜도 화면 안에 다 보임', async () => {
    await ev(() => PS.onVehicle({ warn: { engineOil: true, washer: true, brakeFluid: true, tire: true } }, 'demo')); await wait(200);
    const t = await text(); const all = ['엔진오일 부족', '워셔액 부족', '브레이크액 부족', '공기압'].every(k => t.includes(k));
    const clipped = await ev(() => [...document.querySelectorAll('.screen *')].filter(e => { const r = e.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return !e.closest('.scroll') && e.children.length === 0 && e.innerText && r.height > 0 && (r.bottom > s.bottom + 1 || r.right > s.right + 1); }).map(e => e.innerText.slice(0, 20)));
    return { ok: all && clipped.length === 0, note: clipped.length ? '화면 밖: ' + clipped.slice(0, 4).join(', ') : '' };
  });
  await test('11 경고 끄면 원래대로', async () => { await ev(() => PS.onVehicle({ warn: { engineOil: false, washer: false, brakeFluid: false, tire: false } }, 'demo')); await wait(200); return !(await text()).includes('엔진오일 부족'); });
  await test('12 주행거리 0·차대번호 invalid 는 무시', async () => { await ev(() => PS.onVehicle({ odo: 0, vin: 'invalid' }, 'car')); return ev(() => S.veh.odo === 68402 && S.veh.vin.length === 17); });
  await test('13 주행거리 갱신(+12km) 반영', async () => { await ev(() => PS.onVehicle({ odo: 68414 }, 'car')); return ev(() => S.veh.odo === 68414); });
  await test('14 검색: 일상어 "깜빡이" → 방향지시등', async () => { await ev(() => go({ name: 'search', q: '깜빡이' })); return (await text()).includes('방향지시등'); });
  await test('15 검색: 결과 없음 안내', async () => { await ev(() => go({ name: 'search', q: 'ㅁㄴㅇㄹ' })); return (await text()).includes('찾지 못했어요') && (await has('#nomic')); });
  await test('16 검색: 빈 검색어', async () => { await ev(() => go({ name: 'search', q: '' })); return (await route()) === 'search'; });
  await test('17 검색: 특수문자·아주 긴 글', async () => { await ev(() => go({ name: 'search', q: '<b>(*&^%$#' + '가'.repeat(300) })); const bold = await ev(() => !!document.querySelector('.screen b b')); return !bold; });
  await test('18 음성 인식 실패 시 안내 후 마이크 원래대로', async () => { await ev(() => { go({ name: 'search', q: '' }); window.N0 = 1; UI.listening = true; PS.onSpeechError(); }); return ev(() => !UI.listening && !document.querySelector('.mic.live')); });
  await test('19 음성 응답이 안 오면 9초 뒤 자동으로 끝남', async () => { await ev(() => { UI.listening = true; UI.onSpeech = () => {}; clearTimeout(UI.listenTimer); UI.listenTimer = setTimeout(() => { if (UI.listening) PS.onSpeechError(); }, 300); }); await wait(500); return ev(() => !UI.listening); });
  await test('20 주차 중 말한 검색어가 출발 뒤 도착하면 무시', async () => { await ev(() => { go({ name: 'home' }); UI.listening = true; UI.listenFrom = 'home'; UI.onSpeech = t => go({ name: 'search', q: t }); }); await D(20); await ev(() => PS.onSpeech('와이퍼')); const r = await route(); await P(); return r === 'drive'; });
  await test('21 장바구니 비었을 때 주문 창 안 열림', async () => { await ev(() => { S.cart = {}; go({ name: 'home' }); openOrder(); }); return !(await has('#modal')); });
  await test('22 부품 담기 → 주문 → 결제(시연) → 완료', async () => {
    await ev(() => go({ name: 'sys', zone: 'en', sys: '엔진 윤활', grp: '오일 교환' })); await p.click('#order'); await p.click('#opaid');
    return ev(() => !!S.order && cartCount() === 0 && document.getElementById('stage').innerText.includes('주문 완료'));
  });
  await test('23 주문 창이 열린 채 출발하면 창이 닫히고 주행 화면', async () => { await ev(() => { S.cart = { [PARTS[0].id]: 1 }; openOrder(); }); await D(15); const r = await route(), m = await has('#modal'); await P(); return r === 'drive' && !m; });
  await test('24 수량 줄이기 0 아래로 안 내려감', async () => { await ev(() => { S.cart = {}; go({ name: 'sys', zone: 'en', sys: '엔진 윤활', grp: '오일 교환' }); }); const id = await ev(() => document.querySelector('[data-dec]').dataset.dec); for (let i = 0; i < 8; i++) await p.click(`[data-dec="${id}"]`); return ev(i => (S.cart[i] || 0) === 0, id); });
  await test('25 주행 중 증상 기록: 속도·기어·브레이크 상태 저장', async () => {
    await D(37); await ev(() => { PS.onVehicle({ brake: true }, 'demo'); PS.onVehicle({ brake: false }, 'demo'); });
    const n0 = await ev(() => S.sym.length); await ev(() => recordSymptom('방금 소리 났어')); await wait(150);
    return ev(n => S.sym.length === n + 1 && S.sym[S.sym.length - 1].speed === 37, n0);
  });
  await test('26 정차(속도 0) 상태에서도 증상 기록 가능', async () => { await ev(() => PS.onVehicle({ speed: 0 }, 'demo')); const n0 = await ev(() => S.sym.length); await ev(() => recordSymptom('덜컹')); return ev(n => S.sym.length === n + 1, n0); });
  await test('27 주문 없이 정비소 도착 신호 와도 오류 없음', async () => { await ev(() => { S.visit = null; PS.onWaypointArrived('모르는 곳'); }); await P(); return (await route()) === 'home'; });
  await test('28 정비소 도착 → P → 정비 요청서', async () => {
    await ev(() => { S.cart = { [PARTS[0].id]: 1 }; go({ name: 'home' }); openOrder(); }); await p.click('#opaid'); await p.click('#oway');
    await D(30); await ev(() => PS.onWaypointArrived(SHOPS[0].name)); await P(); return (await route()) === 'work';
  });
  await test('29 정비 후 출발하면 정비 이력이 자동으로 쌓임', async () => { const n0 = await ev(() => S.hist.length); await D(10); await P(); return ev(n => S.hist.length === n + 1, n0); });
  await test('30 앱 재시작 후 장바구니·이력 유지', async () => { await ev(() => { S.cart = { [PARTS[1].id]: 2 }; save(); }); const h = await ev(() => S.hist.length); await p.reload(); await wait(1900); return ev(n => S.cart[PARTS[1].id] === 2 && S.hist.length === n, h); });
  await test('31 저장 데이터가 깨져 있어도 시작됨', async () => { await ev(() => localStorage.setItem('pitstop.v1', '{broken')); await p.reload(); await wait(1900); return (await route()) === 'home'; });
  await test('32 주행 중 재시작해도 주행 화면부터', async () => { await ev(() => { S.veh.gear = 'D'; save(); }); await p.reload(); await wait(1900); const r = await route(); await P(); return { ok: r === 'drive', note: '재시작 후 ' + r }; });
  await test('33 모든 화면 뒤로 가기(홈으로) 동작', async () => {
    const names = [['zone', { zone: 'en' }], ['zone', { zone: 'lp' }], ['sys', { zone: 'ch', sys: '서스펜션' }], ['search', { q: '와이퍼' }], ['history', {}]];
    const bad = [];
    for (const [n, a] of names) { await ev(([n, a]) => go(Object.assign({ name: n }, a)), [n, a]); const back = await ev(() => { const b = document.querySelector('[data-go="home"], [data-go="zone"]'); if (!b) return false; b.click(); return true; }); if (!back) bad.push(n); }
    return { ok: !bad.length, note: bad.join(',') };
  });
  await test('34 모든 구역·계통 화면 열기', async () => {
    const combos = await ev(() => [...new Set(PARTS.map(p => p.zone + '|' + p.sys))]); const bad = [];
    for (const c of combos) { const [z, s] = c.split('|'); const ok = await ev(([z, s]) => { try { go({ name: 'sys', zone: z, sys: s }); const nm = PARTS.filter(p => p.zone === z && p.sys === s)[0].name; return document.getElementById('stage').innerText.includes(nm); } catch (e) { return false; } }, [z, s]); if (!ok) bad.push(c); }
    return { ok: !bad.length, note: `${combos.length}개 중 실패 ${bad.length} ${bad.slice(0, 3).join(' ')}` };
  });
  await test('35 부품 100개 모두 검색으로 찾아짐', async () => {
    const miss = await ev(() => PARTS.filter(pt => { go({ name: 'search', q: pt.name }); return !document.getElementById('stage').innerText.includes(pt.name); }).map(p => p.name));
    return { ok: !miss.length, note: miss.length ? '못 찾음: ' + miss.slice(0, 5).join(', ') : '' };
  });
  await test('36 품번으로 검색', async () => { const no = await ev(() => PARTS[3].no); await ev(n => go({ name: 'search', q: n }), no); return (await text()).includes(no); });
  // 작은 글자·누르기 영역(1600×720 설계 기준, 실제 표시 배율 반영)
  await test('37 글자 크기(실제 표시 기준 최소)', async () => {
    const r = await ev(() => { const sc = document.getElementById('stage').getBoundingClientRect().width / 1600; let min = 99, where = ''; ['home', 'search', 'history'].forEach(n => { go({ name: n, q: '와이퍼' }); document.querySelectorAll('.screen *').forEach(e => { if (e.children.length || !(e.innerText || '').trim() || !e.getBoundingClientRect().height) return; const f = parseFloat(getComputedStyle(e).fontSize) * sc; if (f < min) { min = f; where = n + ':' + e.innerText.slice(0, 12); } }); }); return { min: +min.toFixed(1), where, sc: +sc.toFixed(2) }; });
    return { ok: r.min >= 10, note: `배율 ${r.sc}, 최소 ${r.min}px (${r.where})` };
  });
  await test('38 누르는 요소 크기(손가락 닿는 범위 56px 미만 개수)', async () => {
    const r = await ev(() => { const sc = document.getElementById('stage').getBoundingClientRect().width / 1600; const small = []; ['home', 'zone', 'search', 'history'].forEach(n => { go({ name: n, zone: 'en', q: '와이퍼' }); document.querySelectorAll('button,[data-go],[data-pick],[data-inc],[data-dec]').forEach(e => { const b = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after'); const ex = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) * 2 : 0; if (b.width && (Math.min(b.width, b.height) / sc + ex) < 56) small.push(n + ':' + (e.innerText || e.className).slice(0, 10) + '=' + Math.round(Math.min(b.width, b.height) / sc + ex)); }); }); return [...new Set(small)]; });
    return { ok: r.length === 0, note: r.length + '개 ' + r.join(', ') };
  });
  await test('39 화면 전환 시간(정비 지도→구역→부품)', async () => {
    const t = await ev(() => { const a = performance.now(); go({ name: 'zone', zone: 'en' }); go({ name: 'sys', zone: 'en', sys: '엔진 윤활', grp: '오일 교환' }); go({ name: 'home' }); return (performance.now() - a) / 3; });
    return { ok: t < 100, note: `평균 ${t.toFixed(1)}ms` };
  });
  await test('40 실제 한글 조합 입력(깜빡이)이 깨지지 않음', async () => {
    await ev(() => go({ name: 'zone', zone: 'en' })); await p.click('#q'); await wait(150);
    const c = await p.context().newCDPSession(p);
    for (const syl of [['ㄲ', '까', '깜'], ['ㅃ', '빠', '빡'], ['ㅇ', '이']]) { for (const x of syl) { await c.send('Input.imeSetComposition', { text: x, selectionStart: x.length, selectionEnd: x.length }); await wait(40); } await c.send('Input.insertText', { text: syl[syl.length - 1] }); await wait(40); }
    const r = await ev(() => ({ v: document.getElementById('q').value, hit: document.getElementById('stage').innerText.includes('방향지시등') }));
    return { ok: r.v === '깜빡이' && r.hit, note: '입력값 ' + r.v };
  });
  // ---- 지인 피드백 반영분 ----
  const shot = n => p.screenshot({ path: `${out}/${n}.png` });
  await test('41 바깥 기온 3℃ → 겨울 전 점검 카드, 누르면 겨울 부품 6종', async () => {
    await fresh(); const before = (await text()).includes('겨울 전 점검');
    await ev(() => PS.onVehicle({ temp: 3 }, 'demo')); await wait(200); const shown = (await text()).includes('겨울 전 점검'); await shot('fb_winter_card');
    await p.click('[data-filter="winter"]'); await wait(300); const t = await text(); await shot('fb_winter_parts');
    await ev(() => { PS.onVehicle({ temp: 15 }, 'demo'); go({ name: 'home' }); }); await wait(200);
    return { ok: !before && shown && t.includes('겨울 전 점검 · 6') && t.includes('부동액') && !(await text()).includes('겨울 전 점검'), note: '15℃에서는 숨김' };
  });
  await test('42 브레이크액 경고 → 블루핸즈 예약(예시) → 경유지 추가', async () => {
    await fresh(); await ev(() => PS.onVehicle({ warn: { brakeFluid: true } }, 'demo')); await wait(250); await shot('fb_warn_alert');
    await p.click('.a-panel [data-bh]'); await wait(250); const sheet = await text(); await shot('fb_bluehands_sheet');
    const fit = await ev(() => { const r = document.querySelector('#modal .sheet').getBoundingClientRect(); return r.top >= 0 && r.bottom <= 720; });
    await p.click('#bhok'); await wait(300); const v = await ev(() => S.visit); await shot('fb_bluehands_booked');
    return { ok: sheet.includes('가까운 블루핸즈') && sheet.includes('예시') && fit && v && /블루핸즈/.test(v.shop) && v.slot === '지금 입고 가능', note: v && v.shop };
  });
  await test('43 블루핸즈 도착 → 정비 요청서 → 출발하면 이력 저장', async () => {
    await D(30); await wait(200); await ev(() => PS.onWaypointArrived(S.visit.shop)); await P(); await wait(300);
    const w = await text(), r1 = await route(); await shot('fb_bluehands_work');
    const n0 = await ev(() => S.hist.length); await D(20); await wait(500); const h = await ev(() => S.hist[0]);
    return { ok: r1 === 'work' && w.includes('브레이크액 부족 점검') && w.includes('예약 지금 입고 가능') && (await ev(() => S.hist.length)) === n0 + 1 && /블루핸즈/.test(h.title), note: h.title };
  });
  await test('44 워셔액 경고에는 블루핸즈 버튼 없음, 카드 아래 버튼은 1개만', async () => {
    await fresh(); await ev(() => PS.onVehicle({ warn: { washer: true } }, 'demo')); await wait(200); const n1 = await ev(() => document.querySelectorAll('[data-bh]').length);
    await ev(() => PS.onVehicle({ warn: { engineOil: true, tire: true, brakeFluid: true } }, 'demo')); await wait(200);
    const n2 = await ev(() => document.querySelectorAll('.a-panel [data-bh]').length);
    const small = await ev(() => [...document.querySelectorAll('[data-bh],#easy')].filter(e => { const r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after'); const ext = a.content !== 'none' ? 16 : 0; return (r.height + ext) / (document.getElementById('stage').getBoundingClientRect().width / 1600) < 55.5; }).length);
    return { ok: n1 === 0 && n2 === 1 && small === 0, note: `워셔 ${n1}, 경고 3개일 때 ${n2}` };
  });
  await test('45 쉬운 설명 켜면 카드에 한 줄 설명, 재시작 후에도 유지', async () => {
    await fresh(); const a = (await text()).includes('엔진을 보호하는 기름'); await p.click('#easy'); await wait(200); const b2 = (await text()).includes('엔진을 보호하는 기름'); await shot('fb_easy');
    await p.reload(); await wait(1900); const c = (await text()).includes('엔진을 보호하는 기름'); await p.click('#easy');
    return !a && b2 && c;
  });
  await test('46 주행 중 “핏스톱”이라고 말해도 증상 기록', async () => {
    await fresh(); await D(37); await wait(250); const g = (await text()).includes('핏스톱'); await shot('fb_drive_guide');
    const n0 = await ev(() => S.sym.length);
    await ev(() => { window.PitStopNativeFake = 1; document.getElementById('symb').click(); clearTimeout(UI.listenTimer); PS.onSpeech('핏 스탑'); }); await wait(200);
    const r = await ev(() => S.sym[S.sym.length - 1]); await P();
    return { ok: g && (await ev(() => S.sym.length)) === n0 + 1 && r.phrase === '핏스톱', note: r.phrase };
  });
  await test('47 블루핸즈 시트에 보험사 긴급출동 안내, 예약 후 예약 내역 QR', async () => {
    await fresh(); await ev(() => PS.onVehicle({ warn: { tire: true } }, 'demo')); await wait(250);
    await p.click('.a-panel [data-bh]'); await wait(250); const t1 = await text(); await shot('fb_bluehands_sheet');
    const fit1 = await ev(() => { const r = document.querySelector('#modal .sheet').getBoundingClientRect(); return r.top >= 0 && r.bottom <= 720; });
    await p.click('#bhok'); await wait(300); const t2 = await text(); await shot('fb_booking_qr');
    const q = await ev(() => { const r = document.querySelector('#modal .sheet').getBoundingClientRect(), g = document.querySelector('#pqr svg'); return { fit: r.top >= 0 && r.bottom <= 720, svg: !!g && g.querySelectorAll('path').length === 1 }; });
    await (await p.$('#pqr')).screenshot({ path: `${out}/qr_booking.png` });
    await D(20); await wait(250); const gone = !(await has('#modal')); await P(); await ev(() => { S.visit = null; });
    return { ok: t1.includes('보험사 긴급출동') && t1.includes('예시') && fit1 && t2.includes('예약 내역 가져가기') && q.fit && q.svg && gone, note: '주행 시작하면 창 닫힘 ' + gone };
  });
  await test('48 품번 목록 보내기 → 품번이 담긴 QR', async () => {
    await fresh(); await ev(() => { S.cart = { engine_oil: 5, oil_filter: 1 }; go({ name: 'sys', zone: 'en', sys: '엔진 윤활', grp: '오일 교환' }); }); await wait(250);
    await p.click('#sendpn'); await wait(250); const t = await text(); await shot('fb_partno_qr');
    await (await p.$('#pqr')).screenshot({ path: `${out}/qr_parts.png` });
    const no = await ev(() => partById('oil_filter').no); await p.click('#pqx');
    return { ok: t.includes('품번 목록 가져가기') && t.includes(no) && !(await has('#modal')), note: no };
  });
  await test('49 차 그림 라벨끼리 겹치지 않음(경고 조합 8가지)', async () => {
    await fresh(); let bad = [];
    for (let m = 0; m < 8; m++) {
      await ev(m => { PS.onVehicle({ warn: { tire: !!(m & 1), brakeFluid: !!(m & 2), engineOil: !!(m & 4), washer: !!(m & 4) } }, 'demo'); go({ name: 'home' }); }, m); await wait(120);
      const n = await ev(() => { const r = [...document.querySelectorAll('.a-call,.a-panel,.a-dock,.a-filt')].map(e => e.getBoundingClientRect()); let c = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) c++; return c + r.filter(x => x.right > 1600 || x.left < 0).length; });
      if (n) bad.push(m);
    }
    return { ok: !bad.length, note: bad.length ? '겹침 조합 ' + bad.join(',') : '' };
  });
  await test('50 알림 띠가 위쪽 버튼을 가리지 않음, 안내는 한 곳(ⓘ)에서 열림', async () => {
    await fresh(); await ev(() => toast('예약(예시) 지금 입고 가능 · 경유지 추가: 블루핸즈 서초점(예시)')); await wait(250);
    const hit = await ev(() => { const t = document.querySelector('.toast').getBoundingClientRect(); return [...document.querySelectorAll('.top button, .tab')].filter(b => { const r = b.getBoundingClientRect(); return r.left < t.right && t.left < r.right && r.top < t.bottom && t.top < r.bottom; }).length; });
    await p.click('[data-info]'); await wait(200); const t = await text(); await p.click('#infox');
    return { ok: hit === 0 && t.includes('예시 데이터 안내') && t.includes('WPC') && !(await has('#modal')), note: '가린 버튼 ' + hit };
  });
  await test('51 점검 5건 + 겨울 카드가 스크롤 없이 한 화면에', async () => {
    await fresh(); await ev(() => PS.onVehicle({ warn: { tire: true, brakeFluid: true }, temp: 3 }, 'demo')); await wait(250);
    const r = await ev(() => { const s = document.querySelector('.a-panel').getBoundingClientRect(); const b = [...document.querySelectorAll('.a-panel button')]; return { n: b.length, out: b.filter(e => e.getBoundingClientRect().bottom > s.bottom).length, small: b.filter(e => e.getBoundingClientRect().height / (document.getElementById('stage').getBoundingClientRect().width / 1600) < 55.5).length }; });
    return { ok: r.out === 0 && r.small === 0, note: `버튼 ${r.n}개, 화면 밖 ${r.out}, 56px 미만 ${r.small}` };
  });
  await test('52 차 아무 곳이나 누르면 그 구역으로 들어감(문짝→외장, 보닛→엔진룸, 바퀴→하체)', async () => {
    const k = W / 1600, res = [];
    for (const [x, y] of [[520, 420], [860, 370], [860, 470]]) { await fresh(); await p.mouse.click(x * k, y * k); await wait(1100); res.push(await ev(() => UI.route.name + ':' + UI.route.zone)); }
    await fresh(); await p.mouse.click(200 * k, 215 * k); await wait(900); const outside = await route();
    return { ok: res.join() === 'zone:ex,zone:en,zone:ch' && outside === 'home', note: res.join() + ' 차 밖=' + outside };
  });
  await test('53 첫 화면 검색창: 누르면 검색 화면, 입력하면 결과', async () => {
    await fresh(); const big = await ev(() => { const r = document.querySelector('#srchbox').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect().width / 1600; return r.height / s >= 56 && r.width / s >= 380; });
    await p.click('#q'); await wait(300); const r1 = await route(); await p.keyboard.type('백미러'); await wait(300);
    return { ok: big && r1 === 'search' && (await text()).includes('사이드미러') };
  });
  await test('54 뒤로: 검색→부품 그림→뒤로=검색, 다시 뒤로=내 차 / 구역→뒤로=내 차', async () => {
    await ev(() => go({ name: 'search', q: '미러' })); await wait(200); await p.click('[data-go="sys"]'); await wait(300); const a = await route();
    await p.click('#back'); await wait(200); const b1 = await ev(() => UI.route.name + ':' + UI.route.q); await p.click('#back'); await wait(200); const c = await route();
    await ev(() => go({ name: 'zone', zone: 'en' })); await wait(200); await ev(() => go({ name: 'sys', zone: 'en', sys: '엔진 윤활' })); await wait(200); await p.click('#back'); await wait(200); const d = await ev(() => UI.route.name + ':' + UI.route.zone);
    await p.click('#back'); await wait(200); const e = await route();
    return { ok: a === 'sys' && b1 === 'search:미러' && c === 'home' && d === 'zone:en' && e === 'home', note: [a, b1, c, d, e].join(' ') };
  });
  await test('55 검색에서 품번만 저장 → 위쪽 저장한 품번 → QR 시트', async () => {
    await fresh(); await ev(() => go({ name: 'search', q: '오른쪽 헤드램프' })); await wait(200); const side = (await text()).includes('운전석 쪽이 좌');
    await p.click('[data-savepn]'); await wait(300); const has1 = await has('#savedb'); await p.click('#savedb'); await wait(300); const t = await text();
    return { ok: side && has1 && t.includes('품번 목록 가져가기') && t.includes('92102-L1000') };
  });
  await test('56 좌우 부품은 둘 다 찾을 수 있음(헤드램프·리어램프·미러 커버)', async () => {
    const r = await ev(() => ['헤드램프', '리어램프', '사이드미러 커버'].map(q => { const n = searchParts(q).list.map(p => p.name); return n.some(x => x.includes('(좌)')) && n.some(x => x.includes('(우)')); }));
    return { ok: r.every(Boolean), note: r.join() };
  });
  await test('57 정비 이력 맨 위에 다음 할 일, 누르면 부품 화면', async () => {
    await fresh(); await ev(() => go({ name: 'history' })); await wait(200); const t = await text(); await p.click('.nx'); await wait(300);
    return { ok: t.includes('다음 할 일') && t.includes('엔진오일') && (await route()) === 'sys' };
  });
  await test('58 점화 플러그: + 한 번에 한 대분 4개, 합계 표시, 1개만으로 바꿀 수 있음', async () => {
    await fresh(); await ev(() => go({ name: 'sys', zone: 'en', sys: '점화', part: 'spark_plug' })); await wait(200); await p.click('.ex [data-inc]'); await wait(200);
    const q4 = await ev(() => S.cart.spark_plug), t = await text(); await p.click('[data-setq="spark_plug:1"]'); await wait(200); const q1 = await ev(() => S.cart.spark_plug);
    return { ok: q4 === 4 && t.includes('44,000원') && t.includes('4기통') && q1 === 1, note: `${q4}→${q1}` };
  });
  await test('59 미미로 검색하면 위치별 마운트 3종, 위치 그림에서 고르고 세 곳 모두 담기', async () => {
    await fresh(); const names = await ev(() => searchParts('미미').list.map(p => p.name)); const tm = await ev(() => searchParts('미션 미미').list[0].name);
    await ev(() => go({ name: 'sys', zone: 'en', sys: '마운트(미미)' })); await wait(200); await p.click('.tvp[data-pick="roll_rod"]'); await wait(200); const sel = await ev(() => UI.route.part);
    await p.click('#addall'); await wait(200); const c = await ev(() => ['mount', 'mount_tm', 'roll_rod'].map(i => S.cart[i]).join());
    const small = await ev(() => { const k = document.getElementById('stage').getBoundingClientRect().width / 1600; return [...document.querySelectorAll('.tvp,#addall,[data-setq]')].filter(e => { const r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after'); return (r.height + (a.content !== 'none' ? 16 : 0)) / k < 55.5; }).length; });
    return { ok: names.length === 3 && tm.includes('미션') && sel === 'roll_rod' && c === '1,1,1' && small === 0, note: `${names.join('/')} 작은 버튼 ${small}` };
  });
  await test('60 주문 뒤 첫 화면에 진행 중 카드와 부품 주문함 표시, 장바구니는 비워짐', async () => {
    await fresh(); await ev(() => go({ name: 'sys', zone: 'en', sys: '엔진 윤활' })); await wait(200); await p.click('#order'); await wait(200); await p.click('#opaid'); await wait(200); await p.click('#onow'); await wait(200);
    const cart = await ev(() => cartCount()); await ev(() => go({ name: 'home' })); await wait(200); const t = await text();
    await p.click('#ordway'); await wait(200); const v = await ev(() => !!S.visit); const t2 = await text();
    await p.click('#ordview'); await wait(200); const t3 = await text();
    return { ok: cart === 0 && t.includes('주문한 부품 받기') && t.includes('부품 주문함') && v && t2.includes('경유지에 넣었습니다') && t3.includes('26300-L1100'), note: `장바구니 ${cart}` };
  });
  await test('61 글자 조합 중에는 결과 없음 화면이 번쩍이지 않고, 입력이 멈추면 안내', async () => {
    await fresh(); await p.click('#q'); await wait(300); await p.keyboard.type('깜빡'); await wait(200); await p.fill('#q', '깜빡ㅋㅋ릉'); await wait(250); const early = (await text()).includes('찾지 못했어요');
    await wait(1000); const late = (await text()).includes('찾지 못했어요'); await p.fill('#q', '깜빡이'); await wait(250); const back = (await text()).includes('방향지시등');
    return { ok: !early && late && back, note: `바로 ${early} 멈춘 뒤 ${late} 다시 ${back}` };
  });
  await test('62 차 사진에서 헤드램프·리어램프·사이드미러를 누르면 바로 그 부품 화면', async () => {
    const G = { L: -40, T: 62, W: 1240, H: 1240 * 515 / 940 }, got = [];
    for (const [x, y] of [[90, 49], [12, 46], [53, 44]]) { await fresh(); await p.mouse.click((G.L + x / 100 * G.W) * (W / 1600), (G.T + y / 100 * G.H) * (W / 1600)); await wait(900); got.push(await p.evaluate(() => UI.route.sys || UI.route.name)); }
    await p.click('#back'); await wait(300); const bk = await p.evaluate(() => UI.route.name);
    return { ok: got.join() === '앞 램프,뒤 램프,사이드미러' && bk === 'home', note: got.join(' / ') + ' 뒤로=' + bk };
  });
  await test('63 구역으로 들어가는 전환은 누른 뒤 0.5초 안에 끝남(측정 도구 지연 포함)', async () => {
    await fresh(); const t0 = Date.now(); await p.click('[data-go="zone"][data-zone="en"]'); await p.waitForFunction(() => UI.route.name === 'zone'); const ms = Date.now() - t0;
    return { ok: ms < 500, note: `${ms}ms` };
  });
  require('fs').writeFileSync(`${out}/cases_${W}x${H}.json`, JSON.stringify(results, null, 1));
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} 통과 (${W}x${H})`);
  await b.close();
})();
