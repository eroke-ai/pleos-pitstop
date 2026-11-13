// 가상 사용자 조건별 시제품 자동 측정 (실제 사용자 실험이 아님)
// 같은 과제를 사용자 조건(글자 확대, 손가락 오차, 쉬운 설명 등)을 바꿔 가며 자동으로 수행하고 직접 잰 값만 기록한다.
// 사용: node persona.js <web폴더> <결과.json> [캡처폴더 접두어]
const { chromium } = require('playwright');
const [web, outFile, shotPre] = process.argv.slice(2);
const PERSONAS = [
  { id: 'senior', name: '고령 운전자', cond: '쉬운 보기 켬(개선안은 큰 글자 포함), 누를 때 20px 빗나감', easy: true, jitter: 20, tasks: ['T1', 'T2', 'T4'] },
  { id: 'novice', name: '초보 운전자', cond: '쉬운 보기 켬, 경고가 하나 뜬 상황', easy: true, one: true, tasks: ['T1', 'T2'] },
  { id: 'diy', name: '자가정비 숙련자', cond: '기본 설정, 품번까지 최단 경로', tasks: ['T1', 'T3'] },
  { id: 'carry', name: '부품 사서 정비소 가는 운전자', cond: '기본 설정, 품번을 폰으로', tasks: ['T3'] },
  { id: 'driving', name: '운전 중', cond: '주행 화면, 누를 때 20px 빗나감', jitter: 20, tasks: ['T4'] },
];
(async () => {
  const b = await chromium.launch(); const res = [];
  for (const P of PERSONAS) {
    const p = await b.newPage({ viewport: { width: 1600, height: 720 }, deviceScaleFactor: 1 }); if (process.env.DBG) { await p.addInitScript(() => { window.__dbg = 1; }); p.on('console', m => m.text().startsWith('CLIP') && console.log(P.id, m.text())); }
    const ev = (f, a) => p.evaluate(f, a), wait = ms => p.waitForTimeout(ms);
    // 글자만 키우기(안드로이드 글자 크기 설정과 같은 효과): 새로 그려지는 요소의 글자 크기를 배율만큼 키운다
    if (P.zoom) await p.addInitScript(k => {
      const scale = root => { const els = [root, ...root.querySelectorAll('*')].filter(e => e.nodeType === 1 && !e.dataset.z && !e.closest('svg')); const sz = els.map(e => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { e.dataset.z = 1; e.style.fontSize = (sz[i] * k) + 'px'; }); };
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scale(n)))).observe(document, { childList: true, subtree: true });
    }, P.zoom);
    const fresh = async () => { await p.goto('file://' + web + '/index.html'); await ev(() => localStorage.clear()); await p.reload(); await wait(1900); if (P.easy) { await p.click('#easy'); await wait(150); } };
    let taps = 0, miss = 0, tries = 0, minTarget = 999, dir = 0;
    // 누르기: 빗나감 조건이면 가운데에서 jitter만큼 벗어난 곳을 먼저 눌러 보고, 목표에 안 닿으면 '놓침'으로 센 뒤 가운데를 누른다
    const tap = async sel => {
      const r = await ev(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after'); let x = 0, y = 0; if (a.content !== 'none' && a.position === 'absolute') { x = -parseFloat(a.left) || 0; y = -parseFloat(a.top) || 0; } return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width + 2 * x, h: r.height + 2 * y }; }, sel);
      if (!r) throw new Error('없음 ' + sel);
      minTarget = Math.min(minTarget, Math.round(Math.min(r.w, r.h)));
      if (P.jitter) {
        const [dx, dy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][dir++ % 4].map(v => v * P.jitter); tries++;
        const hit = await ev(([s, x, y]) => { const t = document.querySelector(s), e = document.elementFromPoint(x, y); return !!e && (t === e || t.contains(e)); }, [sel, r.cx + dx, r.cy + dy]);
        if (!hit) { miss++; taps++; }
      }
      await p.mouse.click(r.cx, r.cy); taps++; await wait(260);
    };
    const reset = () => { taps = 0; miss = 0; tries = 0; minTarget = 999; };
    // 화면 상태 측정: 읽히는 글자 크기, 잘림, 겹침, 화면 밖
    const audit = () => ev(() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > st.top && r.top < st.bottom && getComputedStyle(e).visibility !== 'hidden'; };
      const texts = [...document.querySelectorAll('#stage *')].filter(e => vis(e) && !e.closest('svg') && !e.closest('.demo') && !e.closest('.brand') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
      const fs = texts.map(e => parseFloat(getComputedStyle(e).fontSize));
      const btn = [...document.querySelectorAll('#stage button')].filter(vis);
      // 잘림: 글자가 자기가 든 버튼·카드·창 밖으로 2px 넘게 나가거나, 말줄임(…)으로 잘린 경우
      const clipped = texts.filter(e => { const box = e.closest('button,.card,.sheet,.chip,.tag,.label,.top'); const cs = getComputedStyle(e); if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) return true; if (!box) return false; const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect(), o = box.getBoundingClientRect(); return r.right > o.right + 2 || r.left < o.left - 2 || r.bottom > o.bottom + 2 || r.top < o.top - 2; }); if (window.__dbg) console.log('CLIP ' + clipped.map(e => e.className + ':' + e.textContent.slice(0, 24)).join(' | ') + ' SMALL ' + texts.filter(e => parseFloat(getComputedStyle(e).fontSize) < 15).map(e => e.className + ':' + e.textContent.slice(0, 10)).slice(0, 40).join(' | '));
      const side = document.querySelector('.side'); let below = 0;
      if (side) { const s = side.getBoundingClientRect(); below = [...side.querySelectorAll('button')].filter(e => e.getBoundingClientRect().bottom > s.bottom + 1).length; }
      const R = btn.filter(e => !e.closest('.side') || true).map(e => [e, e.getBoundingClientRect()]); let overlap = 0;
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const [a, ra] = R[i], [c, rc] = R[j]; if (a.contains(c) || c.contains(a)) continue; if (a.closest('.modal') !== c.closest('.modal')) continue; if (ra.left < rc.right - 1 && rc.left < ra.right - 1 && ra.top < rc.bottom - 1 && rc.top < ra.bottom - 1) overlap++; }
      const off = btn.filter(e => { const r = e.getBoundingClientRect(); return r.right > st.right + 1 || r.left < st.left - 1; }).length;
      return { minFont: Math.round(Math.min(...fs) * 10) / 10, under15: fs.filter(x => x < 15).length, textCount: fs.length, buttons: btn.length, clipped: clipped.length, overlap, off, sideBelow: below };
    });
    const out = { id: P.id, name: P.name, cond: P.cond, tasks: {} };
    for (const T of P.tasks) {
      reset(); await fresh();
      if (T === 'T1') { // 첫 화면에서 지금 할 일 파악(경고 2개 + 교체 3개 + 겨울)
        await ev(one => PS.onVehicle(one ? { warn: { brakeFluid: true } } : { warn: { tire: true, brakeFluid: true }, temp: 3 }, 'demo'), !!P.one); await wait(300);
        const a = await audit();
        const top = await ev(() => { const c = document.querySelector('.side [data-go="sys"]'); const r = c.getBoundingClientRect(); const name = [...c.querySelectorAll('div,b')].map(e => parseFloat(getComputedStyle(e).fontSize)); return { topFont: Math.max(...name), topH: Math.round(r.height), easyShown: document.querySelector('.side').innerText.includes('안전과 직결'), bhVisible: (() => { const e = document.querySelector('.side [data-bh]'); if (!e) return false; const r = e.getBoundingClientRect(), s = document.querySelector('.side').getBoundingClientRect(); return r.bottom <= s.bottom; })() }; });
        if (shotPre) await p.screenshot({ path: `${shotPre}_${P.id}_T1.png` });
        out.tasks.T1 = { ...a, ...top };
      }
      if (T === 'T2') { // 경고 → 블루핸즈 예약 완료
        await ev(() => PS.onVehicle({ warn: { brakeFluid: true } }, 'demo')); await wait(300);
        await tap('.alert [data-bh]'); const a = await audit(); if (shotPre) await p.screenshot({ path: `${shotPre}_${P.id}_T2.png` });
        await tap('#bhok'); const done = await ev(() => !!(S.visit && /블루핸즈/.test(S.visit.shop)));
        out.tasks.T2 = { done, taps, miss, tries, minTarget, sheetClipped: a.clipped, sheetOverlap: a.overlap, sheetMinFont: a.minFont, sheetFits: await ev(() => { const m = document.querySelector('#modal .sheet'); if (!m) return true; const r = m.getBoundingClientRect(); return r.top >= 0 && r.bottom <= 720; }) };
      }
      if (T === 'T3') { // 엔진오일 필터 품번 찾기 → 담기 → 품번 목록을 폰으로
        await tap('.label[data-part="oil_filter"]'); await wait(500);
        const pn = await ev(() => document.getElementById('stage').innerText.includes(partById('oil_filter').no)); const tapsToPn = taps;
        const a = await audit();
        if (!(await ev(() => Object.values(S.cart).some(q => q > 0)))) await tap('[data-inc="oil_filter"]');
        await tap('#sendpn'); const qr = await ev(() => !!document.querySelector('#pqr svg'));
        if (shotPre) await p.screenshot({ path: `${shotPre}_${P.id}_T3.png` });
        out.tasks.T3 = { partNoShown: pn, tapsToPartNo: tapsToPn, tapsToPhone: taps, phoneQr: qr, minTarget, minFont: a.minFont, under15: a.under15 };
      }
      if (T === 'T4') { // 주행 중 증상 기록
        await ev(() => PS.onVehicle({ gear: 'D', speed: 37 }, 'demo')); await wait(300);
        const a = await audit(); const n0 = await ev(() => S.sym.length);
        const t0 = Date.now(); await tap('#symb'); const shown = await ev(() => document.getElementById('stage').innerText.includes('증상 기록됨'));
        if (shotPre) await p.screenshot({ path: `${shotPre}_${P.id}_T4.png` });
        out.tasks.T4 = { recorded: (await ev(() => S.sym.length)) === n0 + 1, cardShown: shown, taps, miss, tries, minTarget, minFont: a.minFont, buttons: a.buttons, clipped: a.clipped, textCount: a.textCount };
      }
    }
    res.push(out); await p.close();
  }
  require('fs').writeFileSync(outFile, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
  await b.close();
})();
