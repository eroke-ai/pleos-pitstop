// 차종별 운전자 조건 A/B: Pleos Connect 적용 차종(그랜저·아반떼·투싼)의 구매층을 조건으로 세워
// 이전 화면(A)과 지금 화면(B)에 같은 과제를 자동으로 시키고 직접 잰 값만 기록한다. 사람 대상 실험이 아니다.
// 화면에 나오는 차와 부품은 두 안 모두 그랜저 예시 데이터다. 바뀌는 것은 운전자 조건과 화면 크기뿐이다.
// 사용: node persona2.js <A web> <B web> <out.json> [캡처 폴더]
const { chromium } = require('playwright');
const [A, B, outFile, shotDir] = process.argv.slice(2);
const PERSONAS = [
  { id: 'G50', car: '더 뉴 그랜저', name: '50대 · 정비소에 맡기는 운전자', cond: '기본 보기, 1600×720', vw: [1600, 720], tasks: ['now', 'bh', 'wiper'] },
  { id: 'G60', car: '더 뉴 그랜저', name: '60대 · 큰 글자가 필요한 운전자', cond: '쉬운 보기, 누를 때 20px 빗나감, 1600×720', vw: [1600, 720], easy: true, jitter: 20, tasks: ['now', 'bh', 'sym'] },
  { id: 'G40', car: '더 뉴 그랜저', name: '40대 · 부품 사서 정비소 가는 운전자', cond: '기본 보기, 1600×720', vw: [1600, 720], tasks: ['mount', 'savepn', 'plug'] },
  { id: 'A20', car: '디 올 뉴 아반떼', name: '20대 · 첫 차 초보', cond: '쉬운 보기, 16:9 화면(1920×1080)', vw: [1920, 1080], easy: true, tasks: ['symptom', 'bh', 'now'] },
  { id: 'A30', car: '디 올 뉴 아반떼', name: '30대 · 직접 갈아 끼우는 운전자', cond: '기본 보기, 16:9 화면(1920×1080)', vw: [1920, 1080], tasks: ['savepn', 'wiper', 'cheap'] },
  { id: 'T17', car: '디 올 뉴 투싼', name: '가족용 SUV 운전자 · 17인치', cond: '기본 보기, 16:9 화면(1920×1080), 누를 때 20px 빗나감', vw: [1920, 1080], jitter: 20, tasks: ['now', 'wiper', 'sym'] },
  { id: 'T13', car: '디 올 뉴 투싼', name: '가족용 SUV 운전자 · 12.9인치', cond: '기본 보기, 작은 16:9 화면(1280×720으로 가정), 누를 때 20px 빗나감', vw: [1280, 720], jitter: 20, tasks: ['now', 'bh', 'symptom'] },
];
(async () => {
  const b = await chromium.launch(), res = [];
  for (const P of PERSONAS.filter(x => !process.env.ONLY || process.env.ONLY.split(',').includes(x.id))) for (const [v, web] of [['A', A], ['B', B]]) {
    const p = await b.newPage({ viewport: { width: P.vw[0], height: P.vw[1] } }); await p.addInitScript(() => { window.__night = 0; });
    const ev = (f, a) => p.evaluate(f, a), wait = ms => p.waitForTimeout(ms);
    const fresh = async () => { await p.goto('file://' + web + '/index.html'); await ev(() => localStorage.clear()); await p.reload(); await wait(1900); if (P.easy) { await p.click('#easy'); await wait(200); } };
    let taps = 0, miss = 0, minT = 999, dir = 0;
    const first = async sels => { for (const s of sels) { const ok = await ev(s => [...document.querySelectorAll(s)].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }), s); if (ok) return s; } return null; };
    const tap = async (...sels) => {
      const sel = await first(sels); if (!sel) throw new Error('없음 ' + sels[0]);
      const r = await ev(s => { const e = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().width > 0); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after'); let x = 0, y = 0; if (a.content !== 'none' && a.position === 'absolute') { x = -parseFloat(a.left) || 0; y = -parseFloat(a.top) || 0; } e.dataset.pt = 1; return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width + 2 * x, h: r.height + 2 * y }; }, sel);
      minT = Math.min(minT, Math.round(Math.min(r.w, r.h)));
      if (P.jitter) { const [dx, dy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][dir++ % 4].map(k => k * P.jitter); const hit = await ev(([x, y]) => { const t = document.querySelector('[data-pt]'), e = document.elementFromPoint(x, y); return !!e && (t === e || t.contains(e)); }, [r.cx + dx, r.cy + dy]); if (!hit) { miss++; taps++; } }
      await ev(() => { const t = document.querySelector('[data-pt]'); if (t) delete t.dataset.pt; });
      await p.mouse.click(r.cx, r.cy); taps++; await wait(950);
    };
    // 화면에 보이는 글자 크기(실제 화면 픽셀): 스테이지 배율을 곱한다
    const audit = () => ev(() => {
      const st = document.getElementById('stage').getBoundingClientRect(), k = st.width / 1600;
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'; };
      const texts = [...document.querySelectorAll('#stage *')].filter(e => vis(e) && !e.closest('svg') && !e.closest('.demo') && !e.closest('.brand') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
      const fs = texts.map(e => parseFloat(getComputedStyle(e).fontSize) * k);
      return { minFont: Math.round(Math.min(...fs) * 10) / 10, under12: fs.filter(x => x < 12).length, scale: Math.round(k * 100) / 100, used: Math.round(st.width * st.height / (innerWidth * innerHeight) * 100) };
    });
    const has = t => ev(t => document.getElementById('stage').innerText.includes(t), t);
    const row = { id: P.id, car: P.car, name: P.name, cond: P.cond, v, tasks: {} };
    for (const T of P.tasks) {
      taps = 0; miss = 0; minT = 999; let o = {};
      try {
        await fresh();
        if (T === 'now') { // 첫 화면에서 지금 할 일을 눌러 품번까지
          const a = await audit(); await tap('.a-hero [data-go="sys"]', '.side [data-go="sys"]', '[data-go="sys"][data-part="oil_filter"]');
          o = { ok: await has('26300-L1100'), taps, miss, minT, ...a };
          if (shotDir && T === 'now') await p.screenshot({ path: `${shotDir}/${P.id}_${v}_now.png` });
        }
        if (T === 'bh') { await ev(() => PS.onVehicle({ warn: { brakeFluid: true } }, 'demo')); await wait(400); await tap('[data-bh]'); const a = await audit(); await tap('#bhok'); o = { ok: await ev(() => !!(S.visit && /블루핸즈/.test(S.visit.shop))), taps, miss, minT, minFont: a.minFont }; }
        if (T === 'sym') { await ev(() => PS.onVehicle({ gear: 'D', speed: 37 }, 'demo')); await wait(400); const a = await audit(), n0 = await ev(() => S.sym.length); await tap('#symb'); o = { ok: (await ev(() => S.sym.length)) === n0 + 1, taps, miss, minT, minFont: a.minFont }; }
        if (T === 'wiper') { // 와이퍼 주문 끝까지
          await tap('[data-go="sys"][data-part="wiper_d"]'); if (!(await ev(() => S.cart.wiper_d > 0))) await tap('.ex [data-inc]', '[data-inc="wiper_d"]');
          await tap('#order'); await tap('#opaid'); o = { ok: await ev(() => !!S.order), taps, miss, minT };
        }
        if (T === 'symptom') { // 증상 말로 찾기: 브레이크에서 끼익 소리
          if (!(await p.$('#q'))) await tap('[data-go="search"]'); await tap('#srchbox', '.srch', '#q'); await p.focus('#q'); await p.keyboard.type('끼익'); await wait(500);
          o = { ok: await has('패드'), taps, miss, minT, ...(await audit()) };
        }
        if (T === 'savepn') { // 에어컨 필터 품번을 찾아 폰으로 가져갈 QR까지
          if (!(await p.$('#q'))) await tap('[data-go="search"]'); await tap('#srchbox', '.srch', '#q'); await p.focus('#q'); await p.keyboard.type('에어컨 필터'); await wait(500);
          if (await first(['[data-savepn]'])) { await tap('[data-savepn]'); await tap('#savedb'); }
          else { await tap('[data-go="sys"][data-part="cabin_filter"]', '[data-go="sys"][data-part]'); if (await first(['[data-savepn]'])) { await tap('[data-savepn]'); await tap('#savedb', '#sendpn'); } else { await tap('.ex [data-inc]'); await tap('#sendpn'); } }
          o = { ok: await ev(() => !!document.querySelector('#modal svg, #pqr svg')), taps, miss, minT };
        }
        if (T === 'mount') { // 미미 세 곳 모두 담기
          if (!(await p.$('#q'))) await tap('[data-go="search"]'); await tap('#srchbox', '.srch', '#q'); await p.focus('#q'); await p.keyboard.type('미미'); await wait(500);
          await tap('[data-go="sys"][data-part="mount"]', '[data-go="sys"][data-part]');
          if (await first(['#addall'])) await tap('#addall'); else for (const id of ['mount', 'mount_tm', 'roll_rod']) { if (!(await ev(id => S.cart[id] > 0, id))) { if (await first([`[data-pick="${id}"]`])) await tap(`[data-pick="${id}"]`); await tap('.ex [data-inc]'); } }
          o = { ok: await ev(() => ['mount', 'mount_tm', 'roll_rod'].every(i => S.cart[i] > 0)), taps, miss, minT, guide: await has('세 곳') };
        }
        if (T === 'plug') { await ev(() => go({ name: 'sys', zone: 'en', sys: '점화', part: 'spark_plug' })); await wait(400); for (let i = 0; i < 6 && (await ev(() => S.cart.spark_plug || 0)) < 4; i++) { await tap('.ex [data-inc]'); } o = { ok: (await ev(() => S.cart.spark_plug)) === 4, taps, miss, minT, guide: await has('한 대분') }; }
        if (T === 'cheap') { // 1만 원 이하 부품만 골라 보기
          const s = await first(['[data-filt="cheap"]', '[data-f="cheap"]', '.a-filt button:nth-of-type(3)']); if (!s) o = { ok: false, note: '기능 없음', taps: 0 }; else { await tap(s); o = { ok: true, taps, miss, minT, shown: await ev(() => document.querySelectorAll('#stage [data-go="sys"][data-part]').length) }; }
        }
      } catch (e) { o = { ok: false, note: String(e.message).slice(0, 80), taps, miss }; }
      row.tasks[T] = o;
    }
    res.push(row); await p.close(); console.log(P.id, v, JSON.stringify(row.tasks));
  }
  require('fs').writeFileSync(outFile, JSON.stringify(res, null, 1)); await b.close();
})();
