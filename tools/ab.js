// A/B 비교: 같은 과업을 두 안에서 자동으로 수행하고 직접 잰 값만 기록한다(사람 대상 실험 아님)
const { chromium } = require('playwright');
const web = process.argv[2], out = process.argv[3];
const url = 'file://' + web + '/index.html';
(async () => {
  const b = await chromium.launch();
  const res = {};
  async function page(ab) {
    const p = await b.newPage({ viewport: { width: 1600, height: 720 }, deviceScaleFactor: 1 });
    await p.goto(url); await p.evaluate(a => { localStorage.clear(); localStorage.setItem('pitstop.ab', JSON.stringify(a)); }, ab);
    await p.reload(); await p.waitForTimeout(1900); return p;
  }
  // 1) 주문: 부품 그림 화면에서 주문 완료까지 누른 횟수·걸린 화면 수·시간
  for (const v of ['A', 'B']) {
    const p = await page({ order: v }); let taps = 0, sheets = 0;
    await p.evaluate(() => go({ name: 'sys', zone: 'en', sys: '엔진 윤활', grp: '오일 교환' }));
    const t0 = Date.now();
    await p.click('#order'); taps++; sheets++;
    if (await p.$('#onext')) { await p.click('#onext'); taps++; sheets++; }
    await p.click('#opaid'); taps++;
    const done = await p.evaluate(() => document.getElementById('stage').innerText.includes('주문 완료'));
    const ms = Date.now() - t0;
    // 6개 담았을 때 창이 화면 안에 들어가는지
    await p.evaluate(() => { document.getElementById('modal')?.remove(); S.cart = {}; PARTS.slice(0, 6).forEach(x => S.cart[x.id] = 1); openOrder(); });
    const fit = await p.evaluate(() => { const s = document.querySelector('#modal .sheet').getBoundingClientRect(); return s.top >= 0 && s.bottom <= 720; });
    await p.screenshot({ path: `${out}/ab_order_${v}.png` });
    res['order_' + v] = { taps, sheets, done, ms, fitsWith6: fit }; await p.close();
  }
  // 2) 증상 기록: 시속 37km에서 브레이크를 막 뗀 순간 누름 → 말하는 동안(1.2초) 정차·브레이크 밟음
  for (const v of ['A', 'B']) {
    const p = await page({ sym: v });
    await p.evaluate(() => { PS.onVehicle({ gear: 'D', speed: 37 }, 'demo'); PS.onVehicle({ brake: true }, 'demo'); PS.onVehicle({ brake: false }, 'demo'); });
    const n0 = await p.evaluate(() => S.sym.length);
    const tap = await p.evaluate(() => { window.__tap = performance.now(); document.getElementById('symb').click(); setTimeout(() => { PS.onVehicle({ speed: 0 }, 'demo'); PS.onVehicle({ brake: true }, 'demo'); }, 400); return true; });
    // 카드가 처음 보일 때까지 시간
    const shownMs = await p.evaluate(() => new Promise(r => { const t = setInterval(() => { if (document.getElementById('stage').innerText.includes('증상 기록됨')) { clearInterval(t); r(Math.round(performance.now() - window.__tap)); } }, 10); setTimeout(() => r(-1), 4000); }));
    await p.waitForTimeout(1500);
    const rec = await p.evaluate(() => S.sym[S.sym.length - 1]);
    await p.screenshot({ path: `${out}/ab_sym_${v}.png` });
    // 음성 인식이 실패한 경우
    await p.evaluate(() => { UI.symCard = null; render(); PS.onVehicle({ brake: false, speed: 52 }, 'demo'); });
    const n1 = await p.evaluate(() => S.sym.length);
    await p.evaluate(() => { const save = window.PS.onSpeech; window.__stt = save; window.PS.onSpeech = () => {}; document.getElementById('symb').click(); });
    await p.evaluate(() => { window.PS.onSpeech = window.__stt; PS.onSpeechError(); });
    const n2 = await p.evaluate(() => S.sym.length);
    res['sym_' + v] = { cardShownMs: shownMs, savedSpeed: rec.speed, savedBrake: rec.brake, phrase: rec.phrase, truth: '37 km/h · 뗀 직후', keptOnSttFail: n2 > n1 };
    await p.close();
  }
  // 3) 정비 지도: 경고 개수별로 음성 찾기 버튼과 첫 번째 점검 카드가 스크롤 없이 보이는지
  for (const v of ['A', 'B']) {
    const p = await page({ home: v }); const rows = [];
    const sets = [{}, { engineOil: true }, { engineOil: true, washer: true }, { engineOil: true, washer: true, brakeFluid: true, tire: true }];
    for (const w of sets) {
      await p.evaluate(w => { PS.onVehicle({ warn: Object.assign({ engineOil: false, washer: false, brakeFluid: false, tire: false }, w) }, 'demo'); UI.alertDone = true; go({ name: 'home' }); }, w);
      rows.push(await p.evaluate(() => { const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(), s = el.closest('.side').getBoundingClientRect(); return r.top >= s.top && r.bottom <= s.bottom; };
        return { cards: needs().length, voiceVisible: vis(document.getElementById('vsearch')), firstCardVisible: vis(document.querySelector('.side [data-go="sys"]')), firstCardTop: Math.round(document.querySelector('.side [data-go="sys"]')?.getBoundingClientRect().top || 0) }; }));
    }
    await p.screenshot({ path: `${out}/ab_home_${v}.png` });
    res['home_' + v] = rows; await p.close();
  }
  require('fs').writeFileSync(`${out}/ab.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
