// A/B 비교 2차: 이전 화면(A, v9 구조)과 투시 렌즈 화면(B)에서 같은 과제를 자동으로 수행하고 직접 잰 값만 기록한다.
// 사람 대상 실험이 아니다. 두 안 모두 같은 부품 데이터를 쓴다. 사용: node ab2.js <A web> <B web> <out.json>
const { chromium } = require('playwright');
const [A, B, out] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(), res = {};
  for (const [v, web] of [['A', A], ['B', B]]) {
    const p = await b.newPage({ viewport: { width: 1600, height: 720 } }); await p.addInitScript(() => { window.__night = 0; });
    const ev = (f, a) => p.evaluate(f, a), w = ms => p.waitForTimeout(ms);
    const fresh = async () => { await p.goto('file://' + web + '/index.html'); await ev(() => localStorage.clear()); await p.reload(); await w(1900); };
    let taps = 0; const tap = async sel => { await p.click(sel); taps++; await w(900); };
    const r = res[v] = {};
    // 1) 손으로만: 경고가 없는 오른쪽 헤드램프 품번 보기
    await fresh(); taps = 0;
    if (v === 'A') { await tap('[data-go="zone"][data-zone="lp"]'); await tap('[data-go="sys"][data-sys="앞 램프"]'); }
    else { const k = 1; await p.mouse.click(-40 + 90 / 100 * 1240, 62 + 49 / 100 * (1240 * 515 / 940)); taps++; await w(1100); }
    if (!(await p.$('[data-pick="headlamp_r"]'))) await tap('[data-go="sys"][data-grp="헤드램프"]');
    await tap('[data-pick="headlamp_r"]');
    r.touchFind = { taps, ok: await ev(() => (document.querySelector('.ex') || document.body).innerText.includes('92102-L1000')) };
    // 2) 입력으로: 같은 부품을 검색창에 쳐서 품번 보기(글자 입력은 횟수에서 뺌)
    await fresh(); taps = 0;
    if (!(await p.$('#q'))) await tap('[data-go="search"]');
    await tap('#q'); await p.keyboard.type('오른쪽 헤드램프'); await w(400);
    r.typeFind = { taps, ok: await ev(() => document.getElementById('stage').innerText.includes('92102-L1000')) };
    // 3) 점화 플러그 한 대분(4개) 담기
    await fresh(); await ev(() => go({ name: 'sys', zone: 'en', sys: '점화', part: 'spark_plug' })); await w(300); taps = 0;
    for (let i = 0; i < 6 && (await ev(() => S.cart.spark_plug || 0)) < 4; i++) { await p.click('.ex [data-inc]'); taps++; await w(150); }
    r.plug4 = { taps, ok: (await ev(() => S.cart.spark_plug)) === 4, hint: await ev(() => /4기통|한 대분/.test(document.getElementById('stage').innerText)) };
    // 4) 검색 결과에서 품번만 저장
    await fresh(); await ev(() => go({ name: 'search', q: '에어컨 필터' })); await w(300); taps = 0;
    if (!(await p.$('[data-savepn]'))) await tap('[data-go="sys"][data-part]');
    await tap('[data-savepn]');
    r.savePn = { taps, ok: await ev(() => S.saved.length === 1) };
    // 5) 주문 뒤 첫 화면에서 다음 할 일을 알 수 있는가
    await fresh(); await ev(() => go({ name: 'sys', zone: 'en', sys: '엔진 윤활' })); await w(300); await p.click('#order'); await w(300); await p.click('#opaid'); await w(300); await p.click('#onow'); await w(300);
    await ev(() => go({ name: 'home' })); await w(300);
    r.afterOrder = { shown: await ev(() => /주문한 부품|주문 내역|부품 주문함/.test(document.getElementById('stage').innerText)), cartLeft: await ev(() => cartCount()) };
    // 6) 구역으로 들어가는 데 걸리는 시간(누른 뒤 구역 화면이 뜰 때까지, 5회 중앙값)
    const ts = []; for (let i = 0; i < 5; i++) { await ev(() => go({ name: 'home' })); await w(300); const t0 = Date.now(); await p.click('[data-go="zone"][data-zone="en"]'); await p.waitForFunction(() => UI.route.name === 'zone'); ts.push(Date.now() - t0); }
    r.zoneMs = ts.sort((a, b) => a - b)[2];
    await p.close();
  }
  require('fs').writeFileSync(out, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res)); await b.close();
})();
