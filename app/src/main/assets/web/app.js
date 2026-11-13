'use strict';
/* 핏스톱 화면 로직. 차량 값은 Kotlin(Pleos SDK)이 window.PS.onVehicle()로 넣어 주고,
   네이티브가 없으면(브라우저 미리보기) 시연 패널로 같은 값을 만든다. */

const N = window.PitStopNative || null;
const $ = (s, r = document) => r.querySelector(s);
const won = n => n.toLocaleString('ko-KR') + '원';
const km = n => Math.round(n).toLocaleString('ko-KR') + 'km';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const partById = id => PARTS.find(p => p.id === id);
const zoneName = id => ZONES.find(z => z.id === id).name;
const log = m => { try { N ? N.log(String(m)) : console.log(m); } catch (e) {} };

const BRAND = `<button class="brand" id="brand"><svg width="30" height="30" viewBox="0 0 200 200"><path d="M100,8 C146,8 176,40 176,82 C176,128 124,166 100,192 C76,166 24,128 24,82 C24,40 54,8 100,8 Z" fill="#fb923c"/><path d="M100,44 L136,64 L136,104 L100,124 L64,104 L64,64 Z" fill="#081521"/><circle cx="100" cy="84" r="18" fill="#fb923c"/></svg><span style="display:inline-block;transform:skewX(-12deg)">PIT<b>STOP</b></span></button>`;

/* ---------------- 상태 ---------------- */
const KEY = 'pitstop.v1';
function freshState() {
  return {
    // vin 은 시연용 예시 값(실제 차량 아님)
    veh: { gear: 'P', speed: 0, odo: 68402, brake: false, temp: null, vin: 'KMHL141CBTA001234', warn: { engineOil: false, brakeFluid: false, washer: false, tire: false }, src: {} },
    cart: {}, hist: JSON.parse(JSON.stringify(SEED_HISTORY)), sym: JSON.parse(JSON.stringify(SEED_SYMPTOMS)),
    order: null, visit: null, saved: [], easy: false,
  };
}
let S = freshState();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.hist) S = Object.assign(freshState(), s); } catch (e) {}
if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(String(S.veh.vin || ''))) S.veh.vin = freshState().veh.vin;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const UI = { route: null, alertDone: false, lastBrakeUp: 0, symCard: null, demo: false, listening: false };

/* ---------------- 화면 맞춤 ---------------- */
const stage = $('#stage');
function fit() {
  const W = innerWidth, H = innerHeight, s = Math.min(W / 1600, H / 720);
  stage.style.transform = `translate(${(W - 1600 * s) / 2}px,${(H - 720 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit); fit();
if (N && N.lowEffects && N.lowEffects()) document.body.classList.add('lowfx');
// 이미지 미리 풀어 두기: 화면 밖에 붙여 둬서 첫 전환 때 빈 화면이 보이지 않게 한다
(() => { const keep = document.createElement('div'); keep.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:.01;pointer-events:none';
  ['side_xray2', 'engine_mount', 'engine_plug', 'engine_r', 'side_real', 'side_real2', 'drive_bg', 'xray_front', 'parts', 'front_xray'].forEach(n => { const i = new Image(); i.src = `img/${n}.webp`; i.style.width = '1px'; if (i.decode) i.decode().catch(() => {}); keep.appendChild(i); });
  document.body.appendChild(keep); })();

/* ---------------- 네이티브 연결 ---------------- */
function speak(t) {
  if (N) { N.speak(t); return; }
  try { const u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; speechSynthesis.speak(u); } catch (e) {}
}
function listen(cb, fallback) {
  UI.listening = true; UI.onSpeech = cb; UI.listenFrom = UI.route && UI.route.name; rerenderMic();
  clearTimeout(UI.listenTimer);
  UI.listenTimer = setTimeout(() => { if (UI.listening) window.PS.onSpeechError(); }, 9000);
  if (N && N.startListening) { N.startListening(); }
  else setTimeout(() => window.PS.onSpeech(fallback), 1200);
}
function rerenderMic() { document.querySelectorAll('.mic').forEach(m => m.classList.toggle('live', UI.listening)); }
function addWaypoints(list) {
  let ok = true;
  list.forEach(p => { try { if (N) ok = N.addWaypoint(p.name, p.lat, p.lng) && ok; } catch (e) { ok = false; } });
  return ok;
}
function toast(msg, warn) {
  const t = document.createElement('div'); t.className = 'toast' + (warn ? ' w' : ''); t.textContent = msg;
  stage.appendChild(t); setTimeout(() => t.remove(), 3200);
}

window.PS = {
  onVehicle(v, from) {
    if (typeof v === 'string') v = JSON.parse(v);
    if ('vin' in v && !/^[A-HJ-NPR-Z0-9]{17}$/.test(String(v.vin || '').toUpperCase())) delete v.vin;
    if ('odo' in v && !(v.odo > 0)) delete v.odo;
    const prev = JSON.parse(JSON.stringify(S.veh));
    if (v.warn) { Object.assign(S.veh.warn, v.warn); Object.keys(v.warn).forEach(k => S.veh.src[k] = from || 'car'); delete v.warn; }
    if ('temp' in v) S.veh.src.temp = from || 'car';
    Object.assign(S.veh, v);
    if (prev.brake && !S.veh.brake) UI.lastBrakeUp = Date.now();
    vehicleChanged(prev);
  },
  onSpeech(text) { clearTimeout(UI.listenTimer); UI.listening = false; rerenderMic(); const cb = UI.onSpeech; UI.onSpeech = null; UI.onSpeechFail = null; if (S.veh.gear !== 'P' && UI.listenFrom !== 'drive') return; if (cb && text) cb(text); },
  onSpeechError() { if (!UI.listening) return; clearTimeout(UI.listenTimer); UI.listening = false; rerenderMic(); const f = UI.onSpeechFail; UI.onSpeechFail = null; UI.onSpeech = null; if (f) { f(); return; } toast('음성을 알아듣지 못했어요. 다시 말씀해 주세요.', true); },
  onWaypointArrived(name) { arrived(name); },
  state: () => S,
};

function vehicleChanged(prev) {
  const v = S.veh;
  if (!UI.route || UI.route.name === 'splash') return;
  if (prev.gear === 'P' && v.gear !== 'P') { departed(); go({ name: 'drive' }); }
  else if (prev.gear !== 'P' && v.gear === 'P') { UI.alertDone = false; go(S.visit && S.visit.arrived && !S.visit.shown ? { name: 'work' } : { name: 'home' }); }
  else if (v.gear !== 'P' && UI.route.name === 'drive') { const sp = $('#spd'); if (sp) sp.textContent = Math.round(v.speed); }
  else if (JSON.stringify(prev.warn) !== JSON.stringify(v.warn) || prev.odo !== v.odo || prev.temp !== v.temp) { if (UI.route.name === 'home') { UI.alertDone = false; render(); } else render(); }
  save();
}

/* ---------------- 상태 판단 ---------------- */
const monthsBetween = (a, b) => { const [y1, m1] = a.split('.').map(Number), [y2, m2] = b.split('.').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
function lastOf(pid) { return S.hist.filter(h => h.parts && h.parts.includes(pid)).sort((a, b) => b.km - a.km)[0]; }
function status(it) {
  const w = S.veh.warn, demoTag = k => S.veh.src[k] === 'demo' ? ' · 시연용 신호' : '';
  if (it.warn === 'engineOil' && w.engineOil) return { l: 'r', tag: '경고', lab: '엔진오일 부족', d: '엔진오일 부족 경고 · 바로 점검하세요' + demoTag('engineOil') };
  if (it.warn === 'washer' && w.washer) return { l: 'r', tag: '경고', lab: '워셔액 부족', d: '워셔액 부족 경고 · 직접 보충 가능' + demoTag('washer') };
  if (it.warn === 'brakeFluid' && w.brakeFluid) return { l: 'r', tag: '경고', lab: '브레이크액 부족', d: '브레이크액 부족 경고 · 정비소에서 점검하세요' + demoTag('brakeFluid') };
  if ((it.warn === 'tire' || it.warn2 === 'tire') && w.tire) return { l: 'r', tag: '경고', lab: (it.id === 'fbrake' ? '앞 타이어' : it.label) + ' 공기압 낮음', d: '타이어 공기압 낮음 경고 · 공기압 점검' + demoTag('tire') };
  const last = it.lastPart && lastOf(it.lastPart);
  if (last && it.interval) {
    const used = S.veh.odo - last.km;
    if (used >= it.interval) return { l: 'o', tag: '교체 필요', lab: it.label + ' · 교체 필요', d: `마지막 교체 ${km(last.km)} (${last.date.slice(0, 7)}) · 교체할 때가 됐습니다` };
    if (used >= it.interval * 0.8) return { l: 'y', tag: '곧 교체', lab: it.label + ' · 곧 교체', d: `마지막 교체 ${km(last.km)} · ${km(it.interval - used)} 남음` };
  }
  if (last && it.months) {
    const m = monthsBetween(last.date, DEMO_TODAY);
    if (m >= 18) return { l: 'o', tag: '교체 필요', lab: `${it.label} · ${m}개월`, d: `마지막 교체 ${last.date.slice(0, 7)} (${last.src === 'man' ? '직접 입력' : '셀프'})` };
    if (m >= it.months) return { l: 'o', tag: '교체 필요', lab: it.label + ' · 교체 필요', d: `마지막 교체 ${last.date.slice(0, 7)} · ${m}개월 경과` };
  }
  return { l: 'g', tag: '양호', lab: it.label + ' · 양호', d: last ? `마지막 교체 ${last.date.slice(0, 7)} · ${km(last.km)}` : '경고 없음' };
}
const COL = { r: '#ef4444', o: '#f59e0b', y: '#eab308', g: '#22c55e' };
const RANK = { r: 0, o: 1, y: 2, g: 3 };
function needs() { return CHECK_ITEMS.map(it => ({ it, s: status(it) })).filter(x => x.s.l !== 'g').sort((a, b) => RANK[a.s.l] - RANK[b.s.l]); }
function sysLevel(zone, sys) { let l = 'g'; CHECK_ITEMS.filter(i => i.zone === zone && i.sys === sys).forEach(i => { const s = status(i).l; if (RANK[s] < RANK[l]) l = s; }); return l; }

/* ---------------- 공통 조각 ---------------- */
// 여러 개를 한 번에 바꾸는 부품: 처음 담을 때 기본 묶음 수량으로
const pack0 = p => (p.packs ? p.packs[0][0] : 1);
const addOne = id => { const p = partById(id), q = S.cart[id] || 0; S.cart[id] = q ? q + 1 : pack0(p); };
const packTag = p => p.packs && p.packs[0][0] > 1 ? ` <span class="tagz pkz">${p.packs[0][1]}</span>` : '';
// 위에서 본 그림: 기통(점화 플러그·코일), 위치별 마운트
function topView(sel, parts) {
  const K = 620 / 900;
  if (sel.multi === 'cyl') { const q = S.cart[sel.id] || 0, C = [[347, 410], [418, 367], [486, 325], [550, 287]];
    return `<div class="tv r"><div class="tvi cut"><img src="img/engine_plug.webp" alt="">
      <svg viewBox="0 0 900 560"><path d="M344 300 L250 300" stroke="#fb923c" stroke-width="2.5" fill="none"/><circle cx="344" cy="300" r="7" fill="#fb923c"/>
       <path d="M338 120 L250 120" stroke="#7dd3fc" stroke-width="2.5" fill="none"/><circle cx="338" cy="120" r="7" fill="#7dd3fc"/>
       ${C.map(([x, y], i) => { const on = i < q, bx = i ? x + 4 : 268, by = i ? y - 6 : 452; return `${i ? '' : `<path d="M348 433 L${bx + 24} ${by - 4}" stroke="${on ? '#fb923c' : 'rgba(255,255,255,.6)'}" stroke-width="2.5"/>`}<circle cx="${bx}" cy="${by}" r="24" fill="${on ? '#fb923c' : 'rgba(4,14,22,.9)'}" stroke="${on ? '#fdba74' : 'rgba(255,255,255,.6)'}" stroke-width="2.5"/><text x="${bx}" y="${by + 9}" text-anchor="middle" font-size="25" font-weight="800" fill="${on ? '#1a0d02' : '#e2e8f0'}">${i + 1}</text>`; }).join('')}</svg>
      <span class="tvl" style="right:${620 - 244 * K}px;top:${300 * K - 14}px;color:#fdba74">점화 플러그</span><span class="tvl" style="right:${620 - 244 * K}px;top:${120 * K - 14}px;color:#bae6fd">점화 코일</span></div>
     <div class="tvn"><b>${sel.name}</b> ${sel.pn} · 4기통, 코일 아래에 있습니다. 번호는 기통 순서</div><div class="tvq">${q ? `지금 ${q}개 담음 · ${won(sel.price * q)}` : '아직 담지 않았습니다'}</div></div>`; }
  const P = { r: [181, 163, 96, 70], l: [619, 128, 700, 60], b: [556, 438, 668, 500] }, tot = parts.reduce((a, p) => a + p.price, 0);
  return `<div class="tv r"><div class="tvi"><img src="img/engine_mount.webp" alt="">
   <svg viewBox="0 0 900 560">${parts.map(p => { const [x, y, bx, by] = P[p.pos], c = p.id === sel.id ? '#fb923c' : '#22d3ee'; return `<path d="M${x} ${y} L${bx} ${by}" stroke="${c}" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="34" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="7 6"/>`; }).join('')}</svg>
   ${parts.map(p => { const [, , x, y] = P[p.pos], on = p.id === sel.id; return `<button class="tvp${on ? ' on' : ''}${S.cart[p.id] ? ' in' : ''}" style="left:${Math.round(x * K)}px;top:${Math.round(y * K)}px" data-pick="${p.id}"><i></i><span>${p.name.split(' (')[0]}</span></button>`; }).join('')}</div>
   <div class="tvn">위치마다 품번이 다릅니다. 한 곳만 바꿔도 되고, 어느 쪽인지는 정비소에서 확인하세요.</div>
   <button class="ob tva" id="addall">세 곳 모두 담기 · ${won(tot)}</button></div>`;
}
// 부품 그림(직접 만든 3D 그림). 없는 부품은 그림을 넣지 않는다
const PART_IMG = { engine_oil: 'engine_oil', oil_filter: 'oil_filter', drain_plug: 'drain_plug', drain_washer: 'drain_washer', air_filter: 'air_filter', cabin_filter: 'cabin_filter', wiper_d: 'wiper', wiper_p: 'wiper', f_disc: 'f_disc', r_disc: 'f_disc', f_pad: 'f_pad', r_pad: 'f_pad', tire: 'tire', alloy: 'alloy', battery: 'battery', spark_plug: 'spark_plug', ign_coil: 'ign_coil', mount: 'mount', mount_tm: 'mount', roll_rod: 'roll_rod', washer_fluid: 'washer_fluid', coolant: 'coolant', brake_fluid: 'brake_fluid', f_shock: 'shock', r_shock: 'shock', belt: 'belt' };
const partImg = id => PART_IMG[id] ? `img/p/${PART_IMG[id]}.webp` : '';
const cartCount = () => Object.values(S.cart).reduce((a, b) => a + b, 0);
const cartTotal = () => Object.entries(S.cart).reduce((a, [id, q]) => a + partById(id).price * q, 0);
const INFO = '<button class="navb info" data-info="1">ⓘ 예시 데이터 안내</button>';
const gearChip = () => S.veh.gear === 'P' ? '<span class="chip g">P 주차 중</span>' : `<span class="chip d">${S.veh.gear} 주행 중</span>`;
const topParts = (q = '', note = '화면 시안 · 모비스 WPC 연계 가정 · 품번·가격·재고는 예시') => `<div class="top">${BRAND}<button class="navb back" id="back">‹ 뒤로</button>${gearChip()}
 <div class="srch${q ? ' on' : ''}" id="srchbox">🔍 <input id="q" placeholder="부품 이름, 품번, 증상으로 검색" value="${esc(q)}"><button class="mic" id="mic">🎙</button></div>
 <button class="cart" id="cartb">장바구니 ${cartCount()}</button>${S.saved.length ? `<button class="cart sv" id="savedb">저장한 품번 ${S.saved.length}</button>` : ''}<button class="navb" data-go="history">정비 이력</button>${INFO}</div>`;
const miniCar = (zone) => {
  const box = { en: [96, 24, 40, 30], ex: [52, 10, 50, 30], in: [50, 14, 46, 30], ch: [20, 36, 110, 26], lp: [4, 18, 132, 24] }[zone] || [0, 0, 0, 0];
  return `<button class="card" data-go="home" style="padding:6px;width:150px"><img src="img/side_xray2.webp" style="width:138px;display:block"><div style="position:absolute;left:${box[0] + 6}px;top:${box[1] + 6}px;width:${box[2]}px;height:${box[3]}px;border:2px solid #fb923c;border-radius:6px"></div></button>`;
};
const pinHtml = (x, y, c, blink) => `<div class="pin${blink ? ' blink' : ''}" style="left:${x}px;top:${y}px"><div class="g" style="background:${c}"></div><div class="r" style="border-color:${c}"></div><div class="c" style="background:${c}"></div></div>`;

/* ---------------- 라우팅 ---------------- */
// 정비 지도에서 구역·부품으로 들어갈 때 차 그림이 그쪽으로 확대되며 넘어간다(0.2초)
const ZONE_FOCUS = { in: [45, 45], ex: [60, 35], en: [82, 55], ch: [50, 82], lp: [90, 55] };
function go(r) { if (r.name === 'sys' && UI.route && (UI.route.name === 'search' || UI.route.name === 'home')) UI.fromSearch = UI.route; else if (r.name !== 'sys') UI.fromSearch = null; UI.route = r; render(); }
function render() {
  const r = UI.route, f = SCREENS[r.name];
  const same = UI.lastScreen === r.name; UI.lastScreen = r.name;
  stage.classList.toggle('big', !!S.easy);
  // 밤(18시~7시)에는 밝은 카드를 어둡게. 가이드: 낮·밤에 맞춰 밝기를 스스로 조절
  const hr = new Date().getHours(); stage.classList.toggle('night', window.__night != null ? !!window.__night : (hr >= 18 || hr < 7));
  stage.innerHTML = `<section class="screen${same ? ' still' : ''}">${f(r)}</section>` + (UI.demo ? demoPanel() : '');
  bindCommon(); (BIND[r.name] || (() => {}))(r);
}
function bindCommon() {
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const g = b.dataset.go;
    if (UI.route.name === 'home' && (g === 'zone' || g === 'sys') && !b.dataset.zoomed) { b.dataset.zoomed = 1; zoomInto(b, () => b.onclick()); return; }
    if (g === 'home') go({ name: 'home' }); else if (g === 'history') go({ name: 'history' });
    else if (g === 'zone') go({ name: 'zone', zone: b.dataset.zone });
    else if (g === 'sys') go({ name: 'sys', zone: b.dataset.zone, sys: b.dataset.sys, grp: b.dataset.grp, part: b.dataset.part });
    else if (g === 'search') go({ name: 'search', q: b.dataset.q || '', filter: b.dataset.filter, part: b.dataset.part });
  });
  const br = $('#brand'); if (br) { let n = 0, t; br.onclick = () => { n++; clearTimeout(t); t = setTimeout(() => n = 0, 700); if (n >= 3) { n = 0; UI.demo = !UI.demo; render(); } }; }
  const q = $('#q');
  if (q) {
    q.onfocus = () => { if (UI.route.name !== 'search') go({ name: 'search', q: q.value, focus: true }); };
    // 검색창은 그대로 두고 결과 부분만 바꾼다(한글 조합 중에 입력창을 새로 만들면 글자가 깨짐)
    q.oninput = () => {
      UI.route.q = q.value; UI.route.part = null; UI.route.filter = null;
      if (UI.route.name !== 'search') return render();
      // 글자를 조합하는 중간(ㄲ, 까…)에는 '찾지 못했어요'를 바로 띄우지 않고, 입력이 0.9초 멈추면 띄운다
      clearTimeout(UI.noresT);
      if (q.value.trim() && !searchParts(q.value).list.length && !UI.noresNow) { UI.noresT = setTimeout(() => { if (UI.route.name === 'search' && $('#q') && $('#q').value === q.value) { UI.noresNow = true; q.oninput(); UI.noresNow = false; } }, 900); return; }
      const sec = stage.querySelector('section.screen'), tmp = document.createElement('div');
      tmp.innerHTML = SCREENS.search(UI.route);
      [...sec.children].forEach(c => { if (!c.classList.contains('top')) c.remove(); });
      [...tmp.children].forEach(c => { if (!c.classList.contains('top')) sec.appendChild(c); });
      bindCommon(); BIND.search(UI.route);
    };
  }
  const mic = $('#mic'); if (mic) mic.onclick = () => listen(t => go({ name: 'search', q: t }), '오른쪽 사이드미러 깜빡이');
  document.querySelectorAll('[data-info]').forEach(b => b.onclick = openInfo);
  const cb = $('#cartb'); if (cb) cb.onclick = () => { if (cartCount()) openOrder(); else toast('장바구니가 비어 있어요', true); };
  const bk = $('#back'); if (bk) bk.onclick = goBack;
  const sb = $('#savedb'); if (sb) sb.onclick = openSaved;
  bindDemo();
}
// 뒤로: 부품 그림 → 구역 → 내 차. 검색에서 들어온 부품 그림은 검색으로 돌아간다
function goBack() {
  const r = UI.route;
  if (r.name === 'sys' && UI.fromSearch) { const b = UI.fromSearch; UI.fromSearch = null; return go(b); }
  if (r.name === 'sys') return go({ name: 'zone', zone: r.zone });
  go({ name: 'home' });
}
function openSaved() {
  const ids = [...new Set([...Object.keys(S.cart).filter(id => S.cart[id] > 0), ...S.saved])];
  if (!ids.length) { toast('담거나 저장한 부품이 없어요', true); return; }
  phoneSheet('품번 목록 가져가기', [`${CAR.name} ${CAR.trim} 순정 품번 (예시)`, ...ids.map(id => { const p = partById(id); return `${p.name} ${p.no}${S.cart[id] ? ' x' + S.cart[id] : ''}`; })], '정비소에 이 화면이나 휴대폰을 보여 주세요 · 인터넷 연결 없이 QR에 글자만 담습니다 · 품번은 예시');
}

function openInfo() {
  const old = $('#modal'); if (old) old.remove();
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
  const li = [`지금 화면은 ${DEMO_TODAY.slice(0, 4)}년 ${+DEMO_TODAY.slice(5, 7)}월, 출고 4년 차를 가정한 예시입니다.`, '품번·가격·재고는 예시입니다. 현대모비스 WPC와 연계됐다고 가정했습니다.', '부품대리점·정비소·블루핸즈 지점과 예약 시간, 보험사 번호도 예시입니다.', '차량 이미지는 현대자동차 공식 사진을 가공한 시연용입니다(엠블럼·번호판 제거).', '주행거리·기어·속도·브레이크·경고·바깥 기온은 차에서 읽습니다(Pleos Vehicle SDK). 에뮬레이터에 없는 신호는 ‘시연용 신호’라고 표시합니다.'];
  m.innerHTML = `<div class="sheet"><b class="h" style="font-size:24px">예시 데이터 안내</b><ul style="margin:14px 0 0;padding-left:22px;font-size:17px;line-height:1.65;color:#d6e2ee">${li.map(x => `<li style="margin-top:6px">${x}</li>`).join('')}</ul><button class="btn s" style="width:100%;margin-top:18px" id="infox">닫기</button></div>`;
  stage.appendChild(m); m.onclick = e => { if (e.target === m) m.remove(); }; m.querySelector('#infox').onclick = () => m.remove();
}

/* ---------------- 01 시작 ---------------- */
const SCREENS = {}, BIND = {};
SCREENS.splash = () => `<div style="position:absolute;inset:0;background:radial-gradient(900px 500px at 50% 45%,#0b2539 0%,#050a12 70%)"></div>
 <img src="img/side_xray2.webp" style="position:absolute;left:330px;top:250px;width:940px;opacity:.16">
 <div style="position:absolute;left:0;right:0;top:140px;display:flex;justify-content:center;align-items:center;gap:40px">
  <svg width="190" height="190" viewBox="0 0 200 200" style="filter:drop-shadow(0 0 26px rgba(251,146,60,.45))"><path d="M100,8 C146,8 176,40 176,82 C176,128 124,166 100,192 C76,166 24,128 24,82 C24,40 54,8 100,8 Z" fill="#fb923c"/><path d="M100,44 L136,64 L136,104 L100,124 L64,104 L64,64 Z" fill="#081521"/><circle cx="100" cy="84" r="18" fill="#fb923c"/></svg>
  <div><div style="letter-spacing:12px;color:#fdba74;font-size:24px;font-weight:500">PLEOS</div>
   <div style="font-size:104px;font-weight:900;line-height:1.02;transform:skewX(-8deg)">PIT<span style="color:var(--or)">STOP</span></div>
   <div style="font-size:26px;color:#cfe3f3;margin-top:10px">내 차 부품을 찾고, 바로 주문하다 · 플레오스 핏스톱</div></div></div>
 <div style="position:absolute;left:380px;right:380px;top:520px">
  <div style="height:4px;background:#13263a;border-radius:4px;overflow:hidden"><div id="bar" style="width:8%;height:100%;background:linear-gradient(90deg,#f97316,#fb923c);transition:width 1.1s ease"></div></div>
  <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:16px" id="chk">
   <span style="color:#6ee7a0">✔ 내 차 확인 · ${CAR.name}</span><span style="color:#6ee7a0">✔ 주행거리 ${km(S.veh.odo)}</span><span style="color:#7dd3fc" id="chk3">◌ 내 차에 맞는 부품 불러오는 중</span></div></div>
 <div class="mono" style="position:absolute;left:28px;bottom:22px;font-size:15px;color:#3d5a72">VEHICLE SDK · CarInfo(VIN) / Odometer / Gear · ${N ? 'Pleos 연결됨' : '미리보기'}</div>
 <div style="position:absolute;right:28px;bottom:22px;font-size:15px;color:#3d5a72">품번·가격은 예시 데이터</div>`;
BIND.splash = () => {
  requestAnimationFrame(() => { const b = $('#bar'); if (b) b.style.width = '100%'; });
  setTimeout(() => { const c = $('#chk3'); if (c) { c.style.color = '#6ee7a0'; c.textContent = `✔ 내 차 부품 ${PARTS.length}종 준비`; } }, 900);
  setTimeout(() => go({ name: S.veh.gear === 'P' ? 'home' : 'drive' }), 1500);
};

/* ---------------- 02 정비 지도 ---------------- */
// 첫 화면(투시 렌즈): 실제 차 사진 위에 손볼 곳만 속을 비춘다. 차 아무 곳이나 누르면 그 자리에 렌즈가 열리고 구역으로 들어간다.
const G = { L: -40, T: 62, W: 1240, H: 1240 * 515 / 940 };
const gpx = s => [G.L + s[0] / 100 * G.W, G.T + s[1] / 100 * G.H];
const CALL_UP = { cabin: [420, 190], wiper: [640, 150], oil: [868, 176] }, CALL_DOWN = { rtire: [150, 600], fbrake: [640, 600], washer: [930, 600] };
const tone = l => l === 'r' ? 'r' : l === 'g' ? 'g' : 'o';
// 차 사진의 어느 자리가 어느 구역인지(사진 기준 %). 차 밖이면 null
function zoneAt(x, y) {
  if (x < 8.6 || x > 93 || y < 27 || y > 77) return null;
  const wheel = (cx, cy) => Math.hypot((x - cx) * 1.83, y - cy) < 13.5;
  if (wheel(68.3, 62) || wheel(22.4, 61.5) || y > 66) return 'ch';
  if (x > 86.5 || x < 12) return 'lp';
  if (x >= 67 && y > 40) return 'en';
  if (x >= 27 && x <= 63 && y >= 30 && y <= 47) return 'in';
  if (y < 30 && (x < 24 || x > 62)) return null;
  if (y < 40 && x > 72) return null;
  return 'ex';
}
// 겉에서 바로 보이는 부품은 구역을 거치지 않고 그 부품 묶음으로 바로 간다(사진 기준 %)
const HOT = [
  { box: [79, 46, 93, 52], zone: 'lp', sys: '앞 램프', part: 'headlamp' },
  { box: [8.6, 43, 16, 50], zone: 'lp', sys: '뒤 램프', part: 'taillamp' },
  { box: [50, 40, 57, 48], zone: 'ex', sys: '사이드미러', part: 'mirror_cover_l' },
];
const hotAt = (x, y) => HOT.find(h => x >= h.box[0] && x <= h.box[2] && y >= h.box[1] && y <= h.box[3]);
// 렌즈 안 그림: 그 자리에 실제로 들어 있는 부품을 보여 준다(겉모습에 색만 입힌 그림이 아니라).
const C1 = '#8fe9f7', C2 = 'rgba(143,233,247,.45)', HI = '#ffb15c';
const LENS_ART = {
  oil: `<image href="img/engine_r.webp" x="-35" y="-10.4" width="170" height="120.9"/><circle cx="65" cy="68" r="11.5" fill="none" stroke="${HI}" stroke-width="1.6" stroke-dasharray="3 2.4"/>`,
  washer: `<image href="img/p/washer_fluid.webp" x="5" y="5" width="90" height="90"/>`,
  wiper: `<image href="img/p/wiper.webp" x="5" y="5" width="90" height="90"/>`,
  cabin: `<image href="img/p/cabin_filter.webp" x="5" y="5" width="90" height="90"/>`,
  fbrake: `<image href="img/p/f_disc.webp" x="5" y="5" width="90" height="90"/>`,
  rtire: `<image href="img/p/tire.webp" x="5" y="5" width="90" height="90"/>`,
};
function lensAt(x, y, r, cls, art) {
  const a = LENS_ART[art];
  return `<div class="a-lens ${cls}${a ? ' art' : ''}" style="left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px"><img src="img/side_xray2.webp" style="left:${G.L - (x - r) - 3}px;top:${G.T - (y - r) - 3}px;width:${G.W}px">${a ? `<svg viewBox="0 0 100 100">${a}</svg>` : ''}</div>`;
}
function zoomInto(el, then, at) {
  const scr = document.querySelector('.lens'), K = window.__slow || 1; if (!scr) return then();
  let cx, cy; const it = CHECK_ITEMS.find(i => i.part === el.dataset.part);
  if (at) [cx, cy] = at; else if (it) [cx, cy] = gpx(SPOTS[it.spot]); else [cx, cy] = gpx(ZONE_FOCUS[el.dataset.zone] || [50, 50]);
  scr.querySelectorAll('.a-panel,.a-dock,.a-filt,.a-call,.a-svg,.a-read,.a-ok,.a-lens,.a-hit').forEach(x => { x.style.transition = 'opacity .14s'; x.style.opacity = 0; });
  const car = scr.querySelector('.a-car'), ox = cx - G.L, oy = cy - G.T;
  const ov = document.createElement('div'); ov.className = 'a-reveal'; ov.innerHTML = `<img src="img/side_xray2.webp" style="left:${G.L}px;top:${G.T}px;width:${G.W}px">`;
  ov.style.clipPath = `circle(60px at ${cx}px ${cy}px)`; scr.appendChild(ov);
  const ring = document.createElement('div'); ring.className = 'a-ring'; ring.style.left = cx + 'px'; ring.style.top = cy + 'px'; scr.appendChild(ring);
  void ov.offsetWidth;
  requestAnimationFrame(() => { ov.style.transition = `clip-path ${.3 * K}s ease-in`; ov.style.clipPath = `circle(1700px at ${cx}px ${cy}px)`; ring.classList.add('go');
    [car, ov.firstChild].forEach(e => { e.style.transformOrigin = `${ox}px ${oy}px`; e.style.transition = `transform ${.34 * K}s cubic-bezier(.5,0,.2,1)`; e.style.transform = 'scale(1.55)'; }); });
  setTimeout(then, window.__holdZoom ? 1e9 : 300 * K);
}
SCREENS.home = () => {
  const list = needs(), top = list[0];
  const go = it => `data-go="sys" data-zone="${it.zone}" data-sys="${it.sys}" data-part="${it.part}"`;
  let h = '', lines = '';
  CHECK_ITEMS.forEach(it => {
    const s = status(it), [x, y] = gpx(SPOTS[it.spot]), isTop = top && top.it === it;
    if (s.l === 'g') return;
    const P = CALL_UP[it.id] || CALL_DOWN[it.id], up = !!CALL_UP[it.id], r = isTop ? 96 : 46;
    const ly = up ? P[1] + (isTop ? 78 : 62) : P[1] - 6, lx = P[0] + 14, ey = up ? y - r : y + r;
    lines += `<path d="M${lx},${ly} L${lx},${up ? ly + 14 : ly - 14} L${x},${ey}" class="a-line ${tone(s.l)}${isTop ? ' main' : ''}"/>`;
    h += lensAt(x, y, r, tone(s.l) + (isTop ? ' main' : ''), it.id);
    h += `<button class="a-call ${tone(s.l)}${isTop ? ' main' : ''}" style="left:${P[0]}px;top:${P[1]}px" ${go(it)}><b>${s.l === 'r' ? s.lab : it.label}</b><span>${s.tag}${it.interval && s.l !== 'r' && lastOf(it.lastPart) ? ` · ${km(S.veh.odo - lastOf(it.lastPart).km)} 주행` : ''}</span></button>`;
  });
  const bhItem = (list.find(x => x.s.l === 'r' && x.it.id !== 'washer') || {}).it;
  const ord = S.order, vis = S.visit, prog = !!(ord || vis), oids = ord ? ord.items.map(i => i.id) : [];
  const rows = (prog ? list.slice(0, 5) : list.slice(1)).map(({ it, s }) => { const od = oids.includes(it.part) || oids.includes(it.lastPart); return `<button class="a-row" ${go(it)}><i class="a-dot ${od ? 'c' : tone(s.l)}"></i><b>${it.name}</b><span class="a-tag ${od ? 'c' : tone(s.l)}">${od ? '부품 주문함' : s.tag}</span></button>`; }).join('');
  const cold = S.veh.temp != null && S.veh.temp <= 7;
  let extra = '';
  if (top && top.it.id === 'oil' && top.s.l !== 'r') { const set = PARTS.filter(p => p.grp === '오일 교환' && p.qty).reduce((a, p) => a + p.price * p.qty, 0); extra = `<div class="a-extra">엔진오일 교환 세트 ${won(set)} · 근처 대리점 재고 있음</div>`; }
  const hero = top ? `<div class="a-hero ${tone(top.s.l)}"><div class="a-eyebrow">지금 할 일</div><div class="a-name">${top.it.name}</div><div class="a-why">${top.s.d}</div>${S.easy && EASY[top.it.id] ? `<div class="a-why easy">${EASY[top.it.id]}</div>` : extra}
    <div class="a-acts">${top.it === bhItem ? `<button class="a-btn p" data-bh="${top.it.id}">블루핸즈 예약</button><button class="a-btn" ${go(top.it)}>부품 보기</button>` : `<button class="a-btn p" ${go(top.it)}>부품 보기 · 주문</button>`}</div></div>`
    : '<div class="a-hero g"><div class="a-eyebrow">지금 할 일</div><div class="a-name">손볼 곳이 없습니다</div><div class="a-why">부품을 찾으려면 차를 누르거나 위 검색창을 쓰세요.</div></div>';
  const progHero = !prog ? '' : `<div class="a-hero p"><div class="a-eyebrow">진행 중</div><div class="a-name">${ord ? '주문한 부품 받기' : esc(vis.shop) + ' 예약'}</div>
    <div class="a-why">${ord ? `${ord.title} · ${ord.items.length}종 · ${won(ord.total)}<br>${ord.pickup} · ${DEALERS[0].name}` : `${vis.slot ? '예약 ' + vis.slot + ' · ' : ''}${vis.why ? esc(vis.why) + ' 점검' : ''}`}</div>
    <div class="a-why" style="color:#141414;font-weight:600">${vis ? `경유지에 넣었습니다. ${esc(vis.shop)}에 도착하면 정비 요청서를 띄웁니다.` : '정비소까지 한 번에 가려면 경유지로 넣으세요.'}</div>
    <div class="a-acts">${ord ? '<button class="a-btn" id="ordview">주문 내역</button>' : ''}${ord && !vis ? '<button class="a-btn p" id="ordway">경유지 넣기</button>' : ''}</div></div>`;
  return `<div class="lens"><div class="top a-top">${BRAND}${gearChip()}<span class="chip">${CAR.name}</span><span class="chip">${km(S.veh.odo)}</span><button class="cart" id="cartb"${cartCount() ? '' : ' hidden'}>장바구니 ${cartCount()}</button><button class="navb" data-go="history">정비 이력</button><button class="navb" id="easy" role="switch" aria-checked="${!!S.easy}">쉬운 보기<span class="sw${S.easy ? ' on' : ''}"><i></i></span></button>${INFO}</div>
  <div class="a-floor"></div>
  <div class="a-spot"></div><img class="a-refl" src="img/side_real2.webp" style="left:${G.L}px;top:${G.T + G.H * 0.41}px;width:${G.W}px"><img class="a-car" src="img/side_real2.webp" style="left:${G.L}px;top:${G.T}px;width:${G.W}px">
  <div class="a-hit" id="carhit" style="left:${G.L}px;top:${G.T}px;width:${G.W}px;height:${G.H}px"></div>
  <svg class="a-svg" width="1600" height="720">${lines}</svg>${h}
  <div class="a-dock"><div class="srch a-srch" id="srchbox"><span class="a-mag">🔍</span><input id="q" placeholder="부품 이름 · 품번 · 증상으로 찾기" value=""><button class="mic" id="vsearch">🎙 말하기</button></div>
   ${ZONES.map(z => `<button class="tab" data-go="zone" data-zone="${z.id}">${z.name}</button>`).join('')}</div>
  <div class="a-filt"><span>모아 보기</span><button class="tab" data-go="search" data-filter="self">셀프 교체</button><button class="tab" data-go="search" data-filter="fix">파손 수리</button><button class="tab" data-go="search" data-filter="cheap">1만 원 이하</button></div>
  <div class="a-read"><i class="a-tap"></i>차의 아무 곳이나 눌러 보세요. 그 자리 부품이 열립니다.</div>
  <div class="a-panel">
   <div class="a-count"><div class="a-cap">손볼 곳</div><div class="a-num">${list.length}<small>건</small></div></div>
   ${prog ? progHero : hero}
   <div class="a-list">${rows}${cold && !(prog && list.length >= 4) ? `<button class="a-row" data-go="search" data-filter="winter"><i class="a-dot c"></i><b>겨울 전 점검</b><span class="a-tag c">바깥 ${Math.round(S.veh.temp)}℃${S.veh.src.temp === 'demo' ? ' · 시연용 신호' : ''}</span></button>` : ''}</div>
   ${list.length <= 3 && !prog ? '<div class="a-foot">주행 중에는 알림을 띄우지 않습니다.</div>' : ''}
  </div></div>`;
};
function alertText({ it, s }) {
  if (s.l === 'r') return { html: `<b>${s.lab}</b>입니다. ${it.id === 'washer' ? '워셔액을 보충하세요.' : '가까운 정비소에서 점검하세요.'}`, say: `${s.lab}입니다.` };
  return { html: `<b>${it.label} 교체 시기</b>입니다. 순정 부품을 주문할까요?`, say: `${it.label} 교체 시기입니다. 순정 부품을 주문할까요?` };
}
BIND.home = () => {
  const top = needs()[0];
  if (top && !UI.spoke) { UI.spoke = true; speak(alertText(top).say); }
  $('#vsearch').onclick = () => listen(t => go({ name: 'search', q: t }), '오른쪽 사이드미러 깜빡이');
  $('#easy').onclick = () => { S.easy = !S.easy; save(); render(); };
  const ov = $('#ordview'); if (ov) ov.onclick = () => phoneSheet('주문 내역', [`${S.order.title} · ${S.order.pickup}`, ...S.order.items.map(i => { const p = partById(i.id); return `${p.name} ${p.no} x${i.q}`; }), `합계 ${won(S.order.total)} (예시)`], '대리점에서 이 화면이나 휴대폰을 보여 주세요 · 품번·가격은 예시');
  const ow = $('#ordway'); if (ow) ow.onclick = () => { const ok = addWaypoints([DEALERS[0], SHOPS[0]]); S.visit = { shop: SHOPS[0].name, arrived: false, shown: false }; save(); render(); toast(ok ? `경유지 추가: ${DEALERS[0].name} → ${SHOPS[0].name}` : '내비게이션 연결 실패 · 경유지는 화면에 저장했습니다', !ok); };
  document.querySelectorAll('[data-bh]').forEach(b => b.onclick = () => openBluehands(b.dataset.bh));
  // 차 아무 곳이나: 누르고 있으면 렌즈가 손가락을 따라오고, 떼면 그 구역으로 들어간다
  const hit = $('#carhit'), scr = $('.lens'); let lens = null, busy = false;
  const pos = e => { const r = stage.getBoundingClientRect(), k = 1600 / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
  const pct = (x, y) => [(x - G.L) / G.W * 100, (y - G.T) / G.H * 100];
  const zoneOf = (x, y) => zoneAt(...pct(x, y)), hotOf = (x, y) => hotAt(...pct(x, y));
  // 이미 열려 있는 렌즈(점검할 곳)를 누르면 그 부품으로 바로 간다
  const onLens = (x, y) => { const top = needs()[0]; return needs().map(n => n.it).find(it => { const [cx, cy] = gpx(SPOTS[it.spot]); return Math.hypot(x - cx, y - cy) < (top.it === it ? 96 : 46); }); };
  const draw = (x, y) => {
    const z = zoneOf(x, y); if (lens) lens.remove(); lens = null; if (!z || onLens(x, y)) return null;
    lens = document.createElement('div'); lens.className = 'a-peek'; lens.innerHTML = lensAt(x, y, 74, 'peek') + `<div class="a-peekname" style="left:${x}px;top:${y - 74 - 46}px">${hotOf(x, y) ? hotOf(x, y).sys : zoneName(z)}</div>`;
    scr.appendChild(lens); return z;
  };
  hit.onpointerdown = e => { if (busy) return; try { hit.setPointerCapture(e.pointerId); } catch (x) {} draw(...pos(e)); };
  hit.onpointermove = e => { if (!busy && e.buttons) draw(...pos(e)); };
  hit.onpointerup = e => { if (busy) return; const [x, y] = pos(e), on = onLens(x, y);
    if (on) { if (lens) lens.remove(); const b = scr.querySelector(`.a-call[data-part="${on.part}"]`); if (b) { busy = true; b.click(); } return; }
    const z = draw(x, y); if (!z) return;
    busy = true; const nm = lens.querySelector('.a-peekname');
    setTimeout(() => { if (nm) nm.remove(); const h = hotOf(x, y); zoomInto(hit, () => go(h ? { name: 'sys', zone: h.zone, sys: h.sys, part: h.part } : { name: 'zone', zone: z }), [x, y]); }, 160); };
  hit.onpointercancel = () => { if (lens && !busy) { lens.remove(); lens = null; } };
};
// 쉬운 설명: 차를 잘 모르는 운전자용 한 줄
const EASY = {
  oil: '엔진을 보호하는 기름입니다. 정비소에 맡기면 30분쯤 걸립니다.',
  washer: '앞유리를 닦는 물입니다. 보닛을 열고 워셔액 뚜껑에 직접 부으면 됩니다.',
  wiper: '앞유리를 닦는 고무날입니다. 5분이면 직접 바꿀 수 있습니다.',
  cabin: '차 안으로 들어오는 공기를 거르는 필터입니다. 직접 바꿀 수 있습니다.',
  fbrake: '차를 세우는 부품입니다. 안전과 직결되니 정비소에 맡기세요.',
  rtire: '공기압이 낮으면 정비소에서 공기를 넣으세요. 계속 빠지면 점검이 필요합니다.',
};
/* ---------------- 경고 → 가까운 블루핸즈 예약(예시) ---------------- */
let BH = 0;
function openBluehands(itemId) {
  const x = needs().find(n => n.it.id === itemId); if (!x) return;
  const old = $('#modal'); if (old) old.remove();
  const rows = BLUEHANDS.map((b, i) => `<button class="opt${i === BH ? ' on' : ''}" data-bhi="${i}" style="display:flex;align-items:center;gap:14px;margin-top:8px;min-height:64px"><div style="flex:1"><b style="font-size:18px">${b.name}</b><div class="sm mu">${b.km}km · 약 ${b.min}분</div></div><span class="tag" style="${i ? '' : 'background:#123f2a;color:#86efac'}">${b.slot}</span></button>`).join('');
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="sheet"><div style="display:flex;justify-content:space-between;align-items:baseline"><b class="h" style="font-size:24px">가까운 블루핸즈</b><span class="sm" style="color:#fca5a5">${x.s.lab}</span></div>
   <div class="sm mu" style="margin-top:4px">빨리 받을 수 있는 곳부터 보여 줍니다.</div>${rows}
   <div style="display:flex;gap:12px;margin-top:16px"><button class="btn s" style="flex:1" id="bhx">닫기</button><button class="btn p" style="flex:2" id="bhok">예약하고 경유지 추가 (시연)</button></div>
   <div style="margin-top:10px;padding:10px 14px;border-radius:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);font-size:15px;display:flex;justify-content:space-between;gap:12px"><span>움직이기 어려우면 보험사 긴급출동을 부르세요</span><b style="white-space:nowrap">${INSURER.name} ${INSURER.tel}</b></div>
   <div class="sm" style="margin-top:8px;color:var(--dim);text-align:center">지점·예약 시간·보험사 번호는 예시 · 블루핸즈 예약은 출시 단계 연동 예정</div></div>`;
  stage.appendChild(m);
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.querySelectorAll('[data-bhi]').forEach(b => b.onclick = () => { BH = +b.dataset.bhi; openBluehands(itemId); });
  m.querySelector('#bhx').onclick = () => m.remove();
  m.querySelector('#bhok').onclick = () => {
    const b = BLUEHANDS[BH], ok = addWaypoints([b]);
    S.visit = { shop: b.name, arrived: false, shown: false, slot: b.slot, why: x.s.lab }; UI.alertDone = true; save(); m.remove(); render();
    toast(ok ? `예약(예시) ${b.slot} · 경유지 추가: ${b.name}` : `예약(예시) ${b.slot} · 내비게이션 연결 실패, 경유지는 화면에 저장했습니다`, !ok);
    speak(`${b.name.replace('(예시)', '')} 예약했습니다. 경유지로 추가했습니다.`);
    phoneSheet('예약 내역 가져가기', ['핏스톱 블루핸즈 예약 (예시)', b.name, `예약: ${b.slot}`, `요청: ${x.s.lab} 점검`, `차량: ${CAR.name} ${CAR.trim} · ${km(S.veh.odo)}`, `긴급출동: ${INSURER.name} ${INSURER.tel}`], '인터넷 연결 없이 QR에 글자만 담습니다 · 지점·시간·번호는 예시');
  };
}

/* ---------------- 03a 구역 ---------------- */
function sysList(zone) { const m = {}; PARTS.filter(p => p.zone === zone).forEach(p => (m[p.sys] = m[p.sys] || []).push(p)); return m; }
SCREENS.zone = r => {
  const z = r.zone, sl = sysList(z), names = Object.keys(sl), total = PARTS.filter(p => p.zone === z).length;
  let pic = '', hs = '';
  if (z === 'en') {
    // 엔진 그림 위에 계통 자리, 엔진 밖 부품(배터리·냉각수·워셔액)은 옆에 따로
    const K = 800 / 900, EP = { '엔진오일': [411, 115], '점화': [436, 59], '흡기': [228, 100], '벨트': [222, 330], '마운트(미미)': [181, 163] }, SAT = { '배터리·전기': ['battery', 60, 392, 176], '냉각': ['coolant', 1010, 150, 132], '워셔': ['washer_fluid', 1010, 400, 132] };
    pic = `<img src="img/engine_mount.webp" style="position:absolute;left:230px;top:158px;width:800px;height:498px;filter:drop-shadow(0 22px 30px rgba(0,0,0,.6))">` + Object.values(SAT).map(([f, x, y, w]) => `<img src="img/p/${f}.webp" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;filter:drop-shadow(0 12px 16px rgba(0,0,0,.55))">`).join('');
    hs = names.map(n => { const e = EP[n], t = SAT[n]; if (!e && !t) return ''; const x = e ? 230 + e[0] * K : t[1] + t[3] / 2 - 14, y = e ? 158 + e[1] * K : t[2] + t[3] + 14, l = sysLevel(z, n); return `<button class="hs${n === '마운트(미미)' || n === '벨트' || n === '흡기' ? ' lf' : ''}${t ? ' ct' : ''}" style="left:${x}px;top:${y}px" data-go="sys" data-zone="${z}" data-sys="${n}"><i class="${l === 'r' ? 'r' : l === 'o' || l === 'y' ? '' : 'c'}"></i><span>${n} <em>${sl[n].length}</em></span></button>`; }).join('');
  } else {
    pic = `<img src="img/side_xray2.webp" style="position:absolute;left:100px;top:150px;width:1000px;filter:drop-shadow(0 0 18px rgba(34,211,238,.25))">`;
    const used = [];
    hs = names.map(n => {
      const sp = sl[n].map(p => SPOTS[p.spot]); let x = sp.reduce((a, s) => a + s[0], 0) / sp.length, y = sp.reduce((a, s) => a + s[1], 0) / sp.length;
      while (used.some(([ux, uy]) => Math.abs(ux - x) < 9 && Math.abs(uy - y) < 7)) y -= 8; used.push([x, y]);
      const l = sysLevel(z, n);
      return `<button class="hs" style="left:${100 + x / 100 * 1000}px;top:${150 + y / 100 * 548}px" data-go="sys" data-zone="${z}" data-sys="${n}"><i class="${l === 'r' ? 'r' : l === 'o' || l === 'y' ? '' : 'c'}"></i><span>${n} <em>${sl[n].length}</em></span></button>`;
    }).join('');
  }
  const rows = names.map(n => { const l = sysLevel(z, n), st = l === 'r' ? `<span style="color:#fca5a5">경고 1</span>` : l === 'o' ? `<span style="color:#fdba74">교체 필요 1</span>` : l === 'y' ? `<span style="color:#fde68a">곧 교체 1</span>` : `<span>${sl[n].length}</span>`;
    return `<button class="sys${l !== 'g' ? ' on' : ''}" data-go="sys" data-zone="${z}" data-sys="${n}">${n}${st}</button>`; }).join('');
  const tasks = TASKS.filter(t => t.zone === z);
  return `${topParts('', '차량 이미지: 현대자동차 공식 사진 가공 · 품번·가격은 예시')}
 <div style="position:absolute;left:24px;top:72px;display:flex;gap:10px;align-items:center;z-index:4">${miniCar(z)}
  <div class="crumb"><button data-go="home">차 전체</button> › <b>${zoneName(z)}</b><div class="sm mu" style="margin-top:4px">이름을 누르면 부품 그림이 열립니다</div></div></div>
 <div style="position:absolute;left:400px;top:76px;display:flex;gap:8px;z-index:4">${ZONES.map(o => `<button class="zone${o.id === z ? ' on' : ''}" data-go="zone" data-zone="${o.id}">${o.name}</button>`).join('')}</div>
 ${pic}${hs}
 <div class="side scroll" style="width:440px;left:1160px;padding:20px 22px"><b style="font-size:20px">${zoneName(z)} · ${total}종</b>
  <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">${rows}</div>
  ${tasks.length ? `<div class="card" style="margin-top:14px;font-size:15px"><span class="mu sm">자주 하는 작업</span><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${tasks.map((t, i) => `<button class="zone${i === 0 ? ' on' : ''}" data-go="sys" data-zone="${t.zone}" data-sys="${t.sys}" ${t.grp ? `data-grp="${t.grp}"` : ''}>${t.name}</button>`).join('')}</div></div>` : ''}
 </div>`;
};

/* ---------------- 03c 계통·부품 그림·주문 ---------------- */
const OIL_DIAGRAM = { drain_plug: [425, 545, 470, 588, '풀기'], drain_washer: [425, 545, 236, 558, '교체'], oil_filter: [676, 474, 676, 474, '교체'], engine_oil: [459, 260, 520, 132, '넣기'] };
SCREENS.sys = r => {
  const z = r.zone, sys = r.sys, inSys = PARTS.filter(p => p.zone === z && p.sys === sys);
  const grps = [...new Set(inSys.map(p => p.grp))]; const grp = r.grp && grps.includes(r.grp) ? r.grp : (r.part ? partById(r.part).grp : grps[0]); r.grp = grp;
  const parts = inSys.filter(p => p.grp === grp); if (!r.part || !parts.find(p => p.id === r.part)) r.part = (parts.find(p => p.id === 'oil_filter') || parts[0]).id;
  const sel = partById(r.part), isOil = grp === '오일 교환';
  let center;
  if (isOil) {
    const lab = { drain_plug: '드레인 플러그', drain_washer: '와셔', oil_filter: '오일 필터', engine_oil: '엔진오일' };
    center = `<div style="position:absolute;left:540px;top:436px;width:120px;height:120px;border-radius:50%;background:radial-gradient(closest-side,rgba(251,146,60,.35),transparent)"></div>
     <img src="img/engine_r.webp" style="position:absolute;left:70px;top:80px;width:900px;height:640px;filter:drop-shadow(0 18px 24px rgba(0,0,0,.55))">
     <svg style="position:absolute;left:0;top:0" width="920" height="720"><g fill="none" stroke-width="2" stroke-dasharray="5 6" stroke-linecap="round"><path d="M459 258 L462 214" stroke="#9fb3c8"/><path d="M465 461 L556 484" stroke="#fb923c"/><path d="M425 547 L425 566 M425 582 L426 592" stroke="#9fb3c8"/></g><circle cx="600" cy="496" r="62" fill="none" stroke="#fb923c" stroke-width="1.5" stroke-dasharray="3 7" opacity=".9"/></svg>
     <div class="mt" style="left:459px;top:260px"></div><div class="mt" style="left:463px;top:460px"></div><div class="mt" style="left:425px;top:545px"></div>
     ${parts.map(p => { const d = OIL_DIAGRAM[p.id]; return `<button class="pl${p.id === sel.id ? ' on' : ''}" style="left:${d[2]}px;top:${d[3]}px" data-pick="${p.id}"><b>${p.step}</b>${lab[p.id]}${d[4] ? ` <em>${d[4]}</em>` : ''}</button>`; }).join('')}
     <div style="position:absolute;left:24px;bottom:16px;display:flex;gap:8px;align-items:center;font-size:15px;color:#9fb0c2"><span style="color:#e6f0fa;font-weight:700;margin-right:4px">교환 순서</span>①&nbsp;플러그 풀고 오일 빼기 <span style="color:#56687c">›</span> ②&nbsp;와셔 교체 <span style="color:#56687c">›</span> ③&nbsp;필터 교체 <span style="color:#56687c">›</span> ④&nbsp;새 오일 넣기</div>`;
  } else if (sel.multi || sel.pos) {
    center = `${topView(sel, parts)}`;
  } else {
    const [x, y] = SPOTS[sel.spot];
    center = `<img src="img/side_xray2.webp" style="position:absolute;left:60px;top:200px;width:860px;filter:drop-shadow(0 0 18px rgba(34,211,238,.25))">
     ${pinHtml(60 + x / 100 * 860, 200 + y / 100 * 471, '#fb923c', true)}
     <div class="label L-o" style="left:${Math.min(60 + x / 100 * 860 - 60, 700)}px;top:${200 + y / 100 * 471 - 70}px">${sel.name}</div>
     ${partImg(sel.id) ? `<div class="pshot"><img src="${partImg(sel.id)}" alt=""><span>부품 모습 · 예시 그림</span></div>` : ''}
     <div style="position:absolute;left:24px;bottom:18px;font-size:15px;color:#9fb0c2">위치: ${zoneName(z)} › ${sys}${sel.self ? ' · <span style="color:#6ee7a0">셀프 교체 가능</span>' : ' · 정비소 교체 권장'}</div>`;
  }
  // 오일 교환은 처음 들어올 때 기본 세트를 담아 둔다
  if (isOil && !S.order && !parts.some(p => S.cart[p.id] !== undefined)) parts.forEach(p => { if (p.qty) S.cart[p.id] = p.qty; });
  const rows = parts.map((p, i) => {
    const q = S.cart[p.id] || 0, n = p.step || i + 1, note = p.note ? ` <span class="tagz">${p.note}</span>` : '';
    if (p.id !== sel.id) return `<div class="pr" data-pick="${p.id}"><div class="num${q ? '' : ' g'}">${n}</div><div style="flex:1"><div style="font-size:15px">${p.name}${note}${packTag(p)}</div><div><span class="pk">품번</span><span class="pn">${p.no}</span></div></div><div style="width:84px;text-align:right">${won(p.price)}</div>${qtyCtl(p.id, q)}</div>`;
    const last = lastOf(p.id), d0 = DEALERS[0], d1 = DEALERS[1];
    return `<div class="ex"><div style="display:flex;align-items:center;gap:12px"><div class="num">${n}</div><div style="flex:1;font-size:17px;font-weight:700">${p.name}${note}</div><div style="width:84px;text-align:right;font-weight:700">${won(p.price)}</div>${qtyCtl(p.id, q)}</div>
     <div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:7px 14px;border-radius:14px;background:rgba(0,0,0,.28)"><div><div class="sm mu">품번</div><div class="mono" style="font-size:28px;font-weight:600;letter-spacing:1px;color:#fff;line-height:1.15">${p.no}</div></div>
      <div style="margin-left:auto;display:flex;gap:8px"><button class="ob" data-copy="${p.no}">⧉ 복사</button><button class="ob" data-savepn="${p.id}">${S.saved.includes(p.id) ? '★ 저장됨' : '☆ 품번만 저장'}</button></div></div>
     ${p.packs ? `<div class="pks"><span class="mu">수량</span>${p.packs.map(([n, t]) => `<button class="ob${q === n ? ' on' : ''}" data-setq="${p.id}:${n}">${t}</button>`).join('')}<span class="pkt">${q ? `${won(p.price)} × ${q} = <b>${won(p.price * q)}</b>` : `개당 ${won(p.price)}`}</span></div>` : ''}
     <dl class="gb"><dt>적용 차종</dt><dd>${CAR.name} ${CAR.trim} · ${CAR.year}년~ <span style="color:#6ee7a0">✔ 내 차 일치</span></dd>
      ${p.alt ? `<dt>대체 품번</dt><dd><span class="mono">${p.alt}</span> <span class="mu">이전 품번 · 같은 부품</span></dd>` : ''}
      ${p.spec ? `<dt>규격</dt><dd>${p.spec}</dd>` : ''}${p.cycle ? `<dt>교체 주기</dt><dd>${p.cycle}</dd>` : ''}
      <dt>이전 교체</dt><dd>${last ? `${last.date} · ${km(last.km)}` : '<span class="mu">기록 없음</span>'}</dd></dl>
     <div style="margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,.08)">
      <div class="st"><span class="d"></span>${d0.name} <span class="mu">${d0.km}km</span><span style="margin-left:auto">재고 3 · <b style="color:#6ee7a0">오늘 수령</b></span></div>
      <div class="st"><span class="d"></span>${d1.name} <span class="mu">${d1.km}km</span><span style="margin-left:auto">재고 1 · 오늘 수령</span></div></div></div>`;
  }).join('');
  const sug = isOil && !S.cart.air_filter ? (() => { const a = partById('air_filter'); return `<div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:8px 12px;border-radius:14px;border:1px dashed rgba(255,255,255,.16);font-size:15px"><span class="mu">오일 갈 때 같이 많이 바꿔요</span><span>${a.name}</span><span class="pn" style="font-size:15px;color:#b8c6d4">${a.no}</span><span style="margin-left:auto">${won(a.price)}</span><button class="ob" data-add="air_filter">+ 담기</button></div>`; })() : '';
  const cnt = cartCount();
  return `${topParts()}
 <div style="position:absolute;left:24px;top:72px;display:flex;gap:10px;align-items:center;z-index:4">${miniCar(z)}
  <div class="crumb"><button data-go="home">차 전체</button> › <button data-go="zone" data-zone="${z}">${zoneName(z)}</button> › <b>${sys}</b><div class="sm mu" style="margin-top:4px">${isOil ? '번호는 작업 순서입니다' : sel.pos ? '위치를 누르면 그 자리 품번이 나옵니다' : sel.multi ? '한 대분 수량을 자동으로 맞춥니다' : '부품을 누르면 위치를 보여 줍니다'}</div></div></div>
 <div style="position:absolute;left:24px;top:168px;width:190px;z-index:4"><div class="sm mu" style="margin:0 0 6px 4px">${sys} · ${inSys.length}</div>
  ${grps.map(g => `<button class="grp${g === grp ? ' on' : ''}" data-go="sys" data-zone="${z}" data-sys="${sys}" data-grp="${g}">${g}<span${g === grp ? ' style="color:#fdba74"' : ''}>${inSys.filter(p => p.grp === g).length}</span></button>`).join('')}</div>
 ${center}
 <div class="side" style="width:660px;left:940px;padding:16px 20px">
  <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:20px">${grp} · 부품 ${parts.length}</b><span class="ok">✔ 내 차(차대번호)에 맞는 부품만</span></div>
  <div class="scroll fade" style="margin-top:8px;position:absolute;left:20px;right:20px;top:52px;bottom:84px">${rows}${sug}</div>
  <div style="position:absolute;left:20px;right:20px;bottom:14px;display:flex;align-items:center;gap:14px;height:60px;padding:0 8px 0 20px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)">
   <div style="flex:1"><div style="font-size:16px"><b>${cnt}개 · ${won(cartTotal())}</b></div><div class="sm mu">${DEALERS[0].name} · 오늘 방문 수령</div></div>
   <button class="ob" style="height:44px;padding:0 18px" id="sendpn">품번 목록 보내기</button>
   <button class="btn p" style="width:180px;height:58px;font-size:18px" id="order">주문하기</button></div>
 </div>`;
};
const qtyCtl = (id, q) => `<div class="qty"><button data-dec="${id}">−</button><em>${q}</em><button data-inc="${id}">+</button></div>`;
BIND.sys = r => {
  document.querySelectorAll('[data-pick]').forEach(b => b.onclick = e => { if (e.target.closest('.qty')) return; r.part = b.dataset.pick; render(); });
  document.querySelectorAll('[data-inc]').forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.inc; addOne(id); save(); render(); });
  document.querySelectorAll('[data-setq]').forEach(b => b.onclick = e => { e.stopPropagation(); const [id, n] = b.dataset.setq.split(':'); S.cart[id] = +n; save(); render(); });
  const aa = $('#addall'); if (aa) aa.onclick = () => { PARTS.filter(p => p.zone === r.zone && p.sys === r.sys && p.pos).forEach(p => { if (!S.cart[p.id]) S.cart[p.id] = 1; }); save(); render(); toast('세 곳 모두 담았습니다'); };
  document.querySelectorAll('[data-dec]').forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.dec; S.cart[id] = Math.max(0, (S.cart[id] || 0) - 1); if (!S.cart[id]) S.cart[id] = 0; save(); render(); });
  bindPartActions();
  $('#order').onclick = () => cartCount() ? openOrder() : toast('수량을 1개 이상 담아 주세요', true);
  $('#sendpn').onclick = openSaved;
};
function bindPartActions() {
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = e => { e.stopPropagation(); try { N ? N.copy(b.dataset.copy) : navigator.clipboard.writeText(b.dataset.copy); } catch (x) {} toast(`품번 ${b.dataset.copy} 복사됨`); });
  document.querySelectorAll('[data-savepn]').forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.savepn; if (!S.saved.includes(id)) S.saved.push(id); save(); render(); toast('품번을 저장했습니다'); });
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = e => { e.stopPropagation(); addOne(b.dataset.add); save(); render(); const p = partById(b.dataset.add); toast(`${p.name} ${S.cart[p.id]}개 담음`); });
}

/* ---------------- 03b 검색 ---------------- */
const norm = s => s.replace(/\s+/g, '').toLowerCase();
function searchParts(q) {
  // 입력 중인 자음·모음(예: '깜빡ㅇ')은 떼고 찾는다
  const raw = q.trim().replace(/[ㄱ-ㅎㅏ-ㅣ]+$/, '').trim(); if (!raw) return { list: [], mapped: null };
  let mapped = null, terms = [norm(raw)];
  Object.keys(SYNONYMS).forEach(k => { if (norm(raw).includes(norm(k)) || (raw.length >= 2 && norm(k).startsWith(norm(raw)))) { mapped = { from: k, to: SYNONYMS[k] }; terms.push(norm(SYNONYMS[k])); } });
  const side = /오른쪽|우측|조수석/.test(raw) ? '(우)' : /왼쪽|좌측|운전석/.test(raw) ? '(좌)' : null;
  const words = raw.split(/\s+/).filter(w => w.length > 1).map(norm);
  const scored = PARTS.map(p => {
    const name = norm(p.name), al = (p.al || []).map(norm), meta = norm(p.sys + p.grp + zoneName(p.zone)); let s = 0;
    terms.forEach(t => { if (name.includes(t)) s += 6; if (al.some(a => a.includes(t) || t.includes(a))) s += 5; if (norm(p.no).includes(t)) s += 8; if (meta.includes(t)) s += 1; });
    words.forEach(w => { if (name.includes(w)) s += 2; if (al.some(a => a.includes(w))) s += 2; if (meta.includes(w)) s += 1; });
    if (side && s && p.name.includes(side)) s += 3; if (side && s && p.name.includes(side === '(우)' ? '(좌)' : '(우)')) s -= 2;
    return { p, s };
  }).filter(x => x.s > 1).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.p);
  return { list: scored, mapped };
}
const FILTERS = { self: ['셀프 교체 가능', p => p.self], fix: ['파손 수리 부품', p => ['사이드미러', '범퍼·커버', '유리'].includes(p.sys) || /램프/.test(p.sys)], cheap: ['1만 원 이하', p => p.price <= 10000], winter: ['겨울 전 점검', p => ['coolant', 'battery', 'wiper_d', 'wiper_p', 'washer_fluid', 'tire'].includes(p.id)] };
SCREENS.search = r => {
  let list, head;
  if (r.filter) { const [t, f] = FILTERS[r.filter]; list = PARTS.filter(f); head = `${t} · ${list.length}`; }
  else { const res = searchParts(r.q || ''); list = res.list; head = r.q ? `검색 결과 ${list.length}${res.mapped ? ` · <span style="color:#cbd5e1">‘${esc(res.mapped.from)}’ → ${esc(res.mapped.to)}</span>` : ''}` : '자주 찾는 부품'; if (!r.q) list = ['cabin_filter', 'wiper_d', 'engine_oil', 'battery', 'mirror_cover', 'plate_lamp'].map(partById); }
  if (!r.part || !list.find(p => p.id === r.part)) r.part = list[0] && list[0].id;
  const sel = r.part && partById(r.part);
  let center = '', side = '';
  if (sel) {
    const [x, y] = SPOTS[sel.spot], px = 300 + x / 100 * 900, py = 110 + y / 100 * 493, last = lastOf(sel.id), d0 = DEALERS[0];
    center = `<div style="position:absolute;left:380px;top:70px;display:flex;gap:8px;z-index:4">${ZONES.map(o => `<button class="zone${o.id === sel.zone ? ' on' : ''}" data-go="zone" data-zone="${o.id}">${o.name}</button>`).join('')}</div>
     <img src="img/side_xray2.webp" style="position:absolute;left:300px;top:110px;width:900px;filter:drop-shadow(0 0 18px rgba(34,211,238,.25))">
     ${pinHtml(px, py, '#fb923c', true)}<div class="label L-o" style="left:${Math.min(px - 80, 1000)}px;top:${py - 76}px">${sel.name}</div>`;
    side = `<div class="side" style="width:400px;left:1200px;padding:20px 22px"><div class="mu sm">${zoneName(sel.zone)} › ${sel.sys}</div>
     <div class="h" style="font-size:22px;margin-top:4px">${sel.name}</div><div class="ok" style="margin-top:6px">✔ 내 차 적용 (차대번호 기준)</div>
     <div class="card" style="margin-top:14px;padding:12px 16px"><div class="sm mu">품번</div><div style="display:flex;align-items:center;gap:8px"><span class="mono" style="font-size:26px;font-weight:600;letter-spacing:1px;color:#fff">${sel.no}</span><button class="ob" style="margin-left:auto" data-copy="${sel.no}">⧉ 복사</button></div>
      <button class="ob" style="margin-top:10px;width:100%;height:48px;justify-content:center" data-savepn="${sel.id}">${S.saved.includes(sel.id) ? '★ 저장됨 · 위쪽 ‘저장한 품번’에서 꺼내 보기' : '☆ 품번만 저장 (정비소에 가져가기)'}</button></div>
     ${sel.pos ? `<div class="card" style="margin-top:10px;font-size:15px;border-color:#7a4d0c;background:#1a1408">위치마다 품번이 다릅니다 (3곳). <b>이 품번은 ${sel.note}</b>입니다. ‘부품 그림 보기’에서 위치를 고를 수 있습니다.</div>` : /\((좌|우)\)/.test(sel.name) ? `<div class="card" style="margin-top:10px;font-size:15px;border-color:#7a4d0c;background:#1a1408">좌우가 다른 부품입니다. <b>운전석 쪽이 좌</b>, 조수석 쪽이 우입니다.</div>` : sel.packs ? `<div class="card" style="margin-top:10px;font-size:15px;border-color:#7a4d0c;background:#1a1408">${sel.pn}</div>` : ''}
     <div class="card" style="margin-top:10px;font-size:15px;line-height:2">
      <div style="display:flex;justify-content:space-between"><span class="mu">가격</span><span>${won(sel.price)}${sel.packs ? ` · ${sel.packs[0][1]} ${won(sel.price * pack0(sel))}` : ''}</span></div>
      <div style="display:flex;justify-content:space-between"><span class="mu">재고</span><span>${d0.name} 2 · 오늘 수령</span></div>
      <div style="display:flex;justify-content:space-between"><span class="mu">교체</span><span>${sel.note || (sel.self ? '셀프 교체 가능' : '정비소 교체 권장')}</span></div></div>
     <div class="card" style="margin-top:10px;font-size:15px"><span class="mu sm">이전 교체</span> &nbsp;${last ? `${last.date} · ${km(last.km)}` : '없음'}</div>
     <div style="position:absolute;left:22px;right:22px;bottom:18px;display:flex;gap:10px"><button class="btn s" style="flex:1;font-size:16px" data-go="sys" data-zone="${sel.zone}" data-sys="${sel.sys}" data-grp="${sel.grp}" data-part="${sel.id}">부품 그림 보기</button><button class="btn p" style="flex:1;font-size:16px" data-add="${sel.id}">${S.cart[sel.id] ? `담김 ${S.cart[sel.id]}` : sel.packs ? `${pack0(sel)}개 담기` : '담기'}</button></div></div>`;
  } else { const again = ['cabin_filter', 'wiper_d', 'engine_oil', 'battery'].map(partById);
    center = `<img src="img/side_xray2.webp" style="position:absolute;left:300px;top:110px;width:900px;opacity:.25">
     <div class="nores"><div class="h" style="font-size:26px">‘${esc(r.q || '')}’(으)로는 찾지 못했어요</div>
      <div style="font-size:17px;margin-top:8px;color:#c7d3e0">다른 이름이나 증상으로 찾아보세요. 예: 깜빡이, 백미러, 방지턱 넘을 때 소리</div>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button class="btn p" id="nomic" style="font-size:17px;padding:0 22px">🎙 말로 다시 찾기</button><button class="btn s" data-go="home" style="font-size:17px;padding:0 22px">차 그림에서 찾기</button></div>
      <div class="mu" style="font-size:15px;margin-top:22px">자주 찾는 부품</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">${again.map(p => `<button class="tab" data-go="search" data-q="${p.name.split(' (')[0]}">${p.name.split(' (')[0]}</button>`).join('')}</div></div>`; }
  return `${topParts(r.q || '', '품번·가격·재고는 예시')}
 <div style="position:absolute;left:24px;top:72px;width:330px;bottom:16px;z-index:4"><div class="crumb">${head}</div>
  <div class="scroll" style="margin-top:12px;position:absolute;top:24px;bottom:36px;left:0;right:0">${list.map(p => `<button class="res${sel && p.id === sel.id ? ' on' : ''}" data-res="${p.id}">${partImg(p.id) ? `<img class="rth" src="${partImg(p.id)}" alt="">` : '<i class="rth"></i>'}<div class="rtx"><div style="display:flex;justify-content:space-between"><b style="font-size:16px">${p.name}</b><span class="tagz">${zoneName(p.zone)}</span></div><div class="sm mu" style="margin-top:3px">${p.sys}${p.note ? ' · ' + p.note : p.self ? ' · 셀프 가능' : ''} · ${won(p.price)}</div></div></button>`).join('')}</div>
  <button class="sm mu" style="position:absolute;bottom:0;padding:21px 0 17px" data-go="home">못 찾으셨나요? 구역에서 찾기 ›</button></div>
 ${center}${side}`;
};
BIND.search = r => {
  document.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { r.part = b.dataset.res; render(); });
  bindPartActions();
  const nm = $('#nomic'); if (nm) nm.onclick = () => listen(t => go({ name: 'search', q: t }), '오른쪽 사이드미러 깜빡이');
  if (r.focus) { r.focus = false; const q = $('#q'); q.focus(); }
};

/* ---------------- 주문 ---------------- */
let ORD = { pick: 0 };
const PICKUPS = () => [
  { t: '대리점 방문 수령', d: `${DEALERS[0].name} · 오늘` },
  { t: '정비소로 배송', d: `${SHOPS[0].name.replace('(예시)', '')} · 내일` },
  { t: '셀프 정비소로 배송', d: '내일 도착' }, { t: '택배', d: '2일 소요' }];
function openOrder() { if (!cartCount()) { toast('담은 부품이 없어요', true); return; } ORD = { pick: 0, step: 1 }; drawOrder(); }
function drawOrder() {
  const old = $('#modal'); if (old) old.remove();
  const items = Object.entries(S.cart).filter(([, q]) => q > 0);
  let body;
  const lines = items.map(([id, q]) => { const p = partById(id); return `<div style="display:flex;padding:7px 0;border-bottom:1px solid var(--ln)"><span style="flex:1">${p.name} <span class="mono mu sm">${p.no}</span></span><span class="mu" style="width:50px">× ${q}</span><span>${won(p.price * q)}</span></div>`; }).join('');
  const pick = PICKUPS().map((o, i) => `<button class="opt${i === ORD.pick ? ' on' : ''}" data-pk="${i}"><b>${o.t}</b><div class="sm ${i === ORD.pick ? '' : 'mu'}" style="${i === ORD.pick ? 'color:#fdba74' : ''}">${o.d}</div></button>`).join('');
  if (ORD.step === 1) body = `<div style="display:flex;gap:26px">
    <div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline"><b class="h" style="font-size:24px">주문 확인</b><span class="ok sm">✔ 내 차(차대번호) 적용 부품</span></div>
     <div class="card" style="margin-top:10px;padding:4px 14px;font-size:15px;max-height:190px;overflow:auto">${lines}<div style="display:flex;justify-content:space-between;padding:8px 0 4px;font-size:17px"><span class="mu">합계 (예시)</span><b>${won(cartTotal())}</b></div></div>
     <div class="sm mu" style="margin-top:10px">받을 곳</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">${pick}</div></div>
    <div style="width:230px;text-align:center"><div style="background:#fff;border-radius:16px;padding:12px;display:inline-block">${qrSvg()}</div><div class="mu sm" style="margin-top:8px">휴대폰 카메라로 찍어 결제</div></div></div>
   <div style="display:flex;gap:12px;margin-top:16px"><button class="btn s" style="flex:1" id="ocancel">닫기</button><button class="btn p" style="flex:2" id="opaid">결제 완료 (시연)</button></div>
   <div class="sm" style="margin-top:8px;color:var(--dim);text-align:center">차량 내 결제는 출시 단계 연동 예정 · 시연 주문은 실제로 결제되지 않습니다</div>`;
  else body = `<b class="h" style="font-size:26px">주문 완료</b><div class="mu" style="margin-top:6px;font-size:16px">${PICKUPS()[ORD.pick].d}</div>
   <div class="card" style="margin-top:16px;font-size:16px;line-height:1.8">다음 출발 때 <b>${DEALERS[0].name}</b> → <b>${SHOPS[0].name}</b>을 경유지로 넣을까요?<div class="sm mu">정비소에 도착하면 정비 요청서를 띄우고, 정비 후 다시 출발할 때 주행거리를 자동으로 기록합니다.</div></div>
   <div style="display:flex;gap:12px;margin-top:20px"><button class="btn s" style="flex:1" id="onow">나중에</button><button class="btn p" style="flex:2" id="oway">경유지 추가</button></div>`;
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = `<div class="sheet">${body}</div>`; stage.appendChild(m);
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { ORD.pick = +b.dataset.pk; drawOrder(); });
  const on = (id, f) => { const b = m.querySelector('#' + id); if (b) b.onclick = f; };
  on('ocancel', () => m.remove());
  on('opaid', () => {
    const items = Object.entries(S.cart).filter(([, q]) => q > 0).map(([id, q]) => ({ id, q }));
    S.order = { at: DEMO_TODAY, items, total: cartTotal(), pickup: PICKUPS()[ORD.pick].t, title: orderTitle(items) }; S.cart = {}; save(); ORD.step = 3; drawOrder();
  });
  on('onow', () => { m.remove(); render(); toast('주문 완료 · 품번 목록이 저장되었습니다'); });
  on('oway', () => {
    const ok = addWaypoints([DEALERS[0], SHOPS[0]]);
    S.visit = { shop: SHOPS[0].name, arrived: false, shown: false }; save(); m.remove(); render();
    toast(ok ? `경유지 추가: ${DEALERS[0].name} → ${SHOPS[0].name}` : '내비게이션 연결 실패 · 경유지는 화면에 저장했습니다', !ok);
  });
}
function orderTitle(items) { const ids = items.map(i => i.id); if (ids.includes('engine_oil') || ids.includes('oil_filter')) return '엔진오일·필터 교환'; const p = partById(ids[0]); return `${p.name}${ids.length > 1 ? ` 외 ${ids.length - 1}종` : ''} 교체`; }
// 글자를 그대로 담은 QR(서버 없이 휴대폰 카메라로 읽힘). qrcode-generator(MIT) 사용
function textQr(text, px = 200) {
  try { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(); let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x},${y}h1v1h-1z`;
    return `<svg width="${px}" height="${px}" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  } catch (e) { log('qr ' + e); return ''; }
}
function phoneSheet(title, lines, foot) {
  const old = $('#modal'); if (old) old.remove();
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="sheet"><div style="display:flex;gap:26px;align-items:center"><div style="flex:1;min-width:0"><b class="h" style="font-size:24px">${title}</b>
    <div class="card" style="margin-top:12px;font-size:16px;line-height:1.7;max-height:250px;overflow:auto">${lines.map(esc).join('<br>')}</div></div>
    <div style="width:230px;text-align:center"><div style="background:#fff;border-radius:16px;padding:8px;display:inline-block;line-height:0" id="pqr">${textQr(lines.join('\n'))}</div><div class="mu sm" style="margin-top:8px">휴대폰 카메라로 찍으면<br>이 내용이 그대로 뜹니다</div></div></div>
   <button class="btn s" style="width:100%;margin-top:16px" id="pqx">닫기</button>
   <div class="sm" style="margin-top:8px;color:var(--dim);text-align:center">${foot}</div></div>`;
  stage.appendChild(m); m.onclick = e => { if (e.target === m) m.remove(); }; m.querySelector('#pqx').onclick = () => m.remove();
}
function qrSvg() { let s = '', seed = 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280; for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) { const f = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17); const fin = f && ((x % 18 === 0 || x % 18 === 6 || y % 18 === 0 || y % 18 === 6) || ((x % 18) > 1 && (x % 18) < 5 && (y % 18) > 1 && (y % 18) < 5)); if (f ? fin : r() > .5) s += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return `<svg width="200" height="200" viewBox="0 0 25 25" fill="#03131d" shape-rendering="crispEdges">${s}</svg>`; }

/* ---------------- 05 주행 중 · 증상 기록 ---------------- */
function brakeState() { if (S.veh.brake) return '밟는 중'; return Date.now() - UI.lastBrakeUp < 4000 ? '뗀 직후' : '안 밟음'; }
function snapNow() {
  const now = new Date(), hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');
  return { t: `${DEMO_TODAY.replace(/\./g, '-')}T${hh}:${mm}:${ss}`, at: Date.now(), speed: Math.round(S.veh.speed), gear: S.veh.gear, brake: brakeState(), km: Math.round(S.veh.odo) };
}
function hideSymLater(ms) { clearTimeout(UI.symT); UI.symT = setTimeout(() => { UI.symCard = null; if (UI.route.name === 'drive') render(); }, ms); }
function recordSymptom(phrase, snap, quiet) {
  const rec = Object.assign(snap || snapNow(), { phrase });
  S.sym.push(rec); save(); UI.symCard = rec; render(); if (!quiet) speak('증상을 기록했습니다.');
  hideSymLater(quiet ? 12000 : 8000);
  return rec;
}
SCREENS.drive = () => {
  const c = UI.symCard, v = S.veh;
  return `<div style="position:absolute;left:0;top:0;bottom:0;width:640px;border-right:1px solid var(--ln)"><img src="img/drive_bg.webp" style="position:absolute;inset:0;width:640px;height:720px"><div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,13,.55),rgba(5,8,13,.1) 40%,rgba(5,8,13,.85))"></div>
   <div style="position:absolute;left:22px;top:22px">${BRAND}</div>
   <div class="card" style="position:absolute;left:22px;top:90px"><div class="mu sm">현재 속도</div><div class="h" style="font-size:44px"><span id="spd">${Math.round(v.speed)}</span><span style="font-size:18px" class="mu"> km/h</span></div></div>
   ${c ? `<div style="position:absolute;left:40px;right:40px;bottom:40px;border-radius:18px;background:rgba(12,26,40,.96);border:1.5px solid #c05a9e;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.6);animation:up .25s">
     <div style="display:flex;align-items:center;gap:12px"><div style="width:46px;height:46px;border-radius:50%;background:#8e2f72;display:flex;align-items:center;justify-content:center;font-size:22px">🎙</div>
      <div><div class="mu" style="font-size:15px">“${esc(c.phrase)}”</div><div style="font-size:26px;font-weight:700">증상 기록됨</div></div><span class="tag t-sym" style="margin-left:auto;font-size:15px">${S.sym.length}회째</span></div>
     <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;font-size:16px"><span class="chip">${c.speed} km/h</span><span class="chip">기어 ${c.gear}</span><span class="chip">브레이크 ${c.brake}</span><span class="chip">${c.t.slice(11)}</span><span class="chip">${km(c.km)}</span></div>
     <div class="mu" style="margin-top:10px;font-size:15px">자세한 내용은 주차 후 확인할 수 있습니다.</div></div>`
    : `<button id="symb" style="position:absolute;left:50%;bottom:56px;transform:translateX(-50%);width:300px;height:96px;border-radius:999px;background:rgba(142,47,114,.9);border:2px solid #f0a1d8;display:flex;align-items:center;justify-content:center;gap:14px;font-size:24px;font-weight:700;box-shadow:0 10px 40px rgba(0,0,0,.5)"><span class="mic" style="margin:0;font-size:28px">🎙</span>방금 소리 났어</button>`}
  </div>
  <div style="position:absolute;left:640px;right:0;top:0;bottom:0;padding:60px 70px">
   <div class="mono" style="color:#5f7f99;font-size:16px">${v.gear} 주행 중</div>
   <div class="h" style="font-size:44px;margin-top:10px">운전에 집중하세요</div>
   <div style="font-size:24px;color:#c4d3e2;margin-top:18px;line-height:1.6">부품 찾기와 주문은 주차(P) 후에 열립니다.<br>이상한 소리나 떨림이 있으면 왼쪽 버튼을 누르고<br><b style="color:#f0a1d8">“핏스톱”</b> 또는 <b style="color:#f0a1d8">“방금 소리 났어”</b>라고 말하세요.<br>말하지 않아도 그 순간이 기록됩니다.</div>
   <div class="card" style="margin-top:34px;display:flex;gap:40px;font-size:20px"><div><div class="mu sm">주행거리</div><b>${km(v.odo)}</b></div><div><div class="mu sm">증상 기록</div><b>${S.sym.length}건</b></div>${S.visit && !S.visit.arrived ? `<div><div class="mu sm">경유지</div><b>${S.visit.shop}</b></div>` : ''}</div>
   <div style="position:absolute;left:70px;bottom:40px;font-size:15px;color:var(--dim)">주행 중에는 알림과 목록을 띄우지 않습니다 · 속도·기어·브레이크·주행거리: Pleos Vehicle SDK</div>
  </div>`;
};
BIND.drive = () => {
  const b = $('#symb'); if (!b) return;
  // 누른 순간의 차량 상태를 먼저 저장하고, 말은 뒤에 붙인다
  b.onclick = () => {
    const rec = recordSymptom('듣는 중…', null, true);
    const done = t => { rec.phrase = t; save(); if (UI.route.name === 'drive') render(); hideSymLater(4000); };
    UI.onSpeechFail = () => done('버튼으로 기록');
    listen(t => { done(/핏\s*스\s*[톱탑]|피트\s*스\s*[톱탑]|pit\s*stop/i.test(t) ? '핏스톱' : t); speak('증상을 기록했습니다.'); }, '방금 소리 났어');
  };
};

/* ---------------- 정비소 도착 · 정비 요청서 ---------------- */
function arrived(name) {
  // 정비소가 아닌 경유지(부품대리점 등)에 도착한 것은 정비 방문으로 보지 않는다
  if (DEALERS.some(d => d.name === name)) { if (S.visit && S.order) toast(`${name} 도착 · 주문한 부품을 받아 가세요`); return; }
  if (!S.visit) { if (!SHOPS.some(x => x.name === name)) return; S.visit = { shop: name, arrived: false, shown: false }; }
  S.visit.arrived = true; S.visit.arrivedKm = S.veh.odo; save();
  if (S.veh.gear === 'P') { go({ name: 'work' }); } else toast(`${S.visit.shop} 도착 · 주차하면 정비 요청서를 띄웁니다`);
}
function departed() {
  if (!(S.visit && S.visit.arrived)) return;
  const o = S.order, now = new Date(), tm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const parts = o ? o.items.map(i => i.id) : [];
  const rec = { id: 'a' + Date.now(), date: DEMO_TODAY, km: Math.round(S.veh.odo), title: `${o ? o.title : S.visit.why ? S.visit.why + ' 점검' : '정비'} · ${/블루핸즈/.test(S.visit.shop) ? '블루핸즈' : '공임 정비'}`, src: 'ok', parts, auto: true,
    basis: [`주행거리 ${km(S.veh.odo)} · 일시 ${DEMO_TODAY} ${tm} · 차량 기록 (정비소 출발 시 자동)`, o ? `순정 부품 ${parts.length}종 · ${o.pickup} · 앱 주문` : '앱 주문 없음', `${S.visit.shop} · 공임 정비`] };
  S.hist.unshift(rec); S.visit = null; S.order = null; save();
  setTimeout(() => toast(`정비 이력 저장 · ${km(rec.km)} · 확인됨`), 300);
}
SCREENS.work = () => {
  const o = S.order, sym = S.sym, v = S.veh, vin = v.vin ? v.vin.slice(0, 3) + '········' + v.vin.slice(-4) : '등록 안 됨';
  const slow = sym.length && sym.every(s => s.speed <= 20), brk = sym.length && sym.every(s => s.brake !== '안 밟음');
  return `<div style="position:absolute;left:0;top:0;bottom:0;width:640px;border-right:1px solid var(--ln)"><img src="img/side_real2.webp" style="position:absolute;left:-40px;top:200px;width:720px;opacity:.95"><div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,13,.2),rgba(5,8,13,.85))"></div>
   <div style="position:absolute;left:22px;top:22px">${BRAND}</div>
   <div class="card" style="position:absolute;left:40px;right:40px;bottom:40px;border-color:#fb923c"><div class="mu sm">경유지 도착</div><div style="font-size:26px;font-weight:700;margin-top:4px">${esc(S.visit ? S.visit.shop : '정비소')}</div>${S.visit && S.visit.slot ? `<div class="sm" style="color:#fdba74;margin-top:4px">예약 ${esc(S.visit.slot)} (예시)</div>` : ''}<div class="mu" style="margin-top:8px;font-size:15px">정비사에게 이 화면을 보여 주세요. 정비 후 출발하면 주행거리가 자동으로 기록됩니다.</div></div></div>
  <div style="position:absolute;left:640px;right:0;top:0;bottom:0;padding:22px 30px">
   <div style="display:flex;align-items:center;gap:10px"><span class="mono sm" style="color:#5f7f99">정비소 도착</span>${INFO}<button class="navb" data-go="home" style="margin-left:12px">닫기</button></div>
   <div class="h" style="font-size:30px;margin-top:6px">정비 요청서</div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
    <div class="card"><div class="mu sm">차량</div><div style="font-size:18px;font-weight:700">${CAR.name} ${CAR.trim}</div><div class="sm mu">차대번호 ${vin} · ${km(v.odo)}</div></div>
    <div class="card"><div class="mu sm">요청 작업</div><div style="font-size:18px;font-weight:700">${o ? o.title : S.visit && S.visit.why ? esc(S.visit.why) + ' 점검' : sym.length ? '앞쪽 하체 소음 점검' : '점검'}${o && sym.length ? ' + 하체 소음 점검' : ''}</div><div class="sm mu">${o ? `가져온 부품 ${o.items.length}종 · ${o.items.map(i => partById(i.id).no).join(', ')}` : '가져온 부품 없음'}</div></div></div>
   ${sym.length ? `<div class="card" style="margin-top:12px;border-color:#7a2a62"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">증상 기록 ${sym.length}건 · 주행 중 소리</b><span class="tag t-sym">차량 기록</span></div>
    <table class="sym"><tr><th>일시</th><th>속도</th><th>기어</th><th>브레이크</th><th>주행거리</th></tr>${sym.slice(-4).map(s => `<tr><td>${s.t.slice(5, 10).replace('-', '.')} ${s.t.slice(11, 16)}</td><td>${s.speed} km/h</td><td>${s.gear}</td><td>${s.brake}</td><td>${km(s.km)}</td></tr>`).join('')}</table>
    ${slow || brk ? `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#2a1023;color:#f5c2e4;font-size:15px">${sym.length}건 모두 ${[slow ? '<b>20km/h 이하</b>' : '', brk ? '<b>제동 전후</b>' : ''].filter(Boolean).join(', ')}</div>` : ''}</div>` : ''}
   <div class="card" style="margin-top:12px;display:flex;align-items:center;gap:14px"><div style="flex:1"><div class="mu sm">부품 교체 시</div><div style="font-size:15px">교체 내역이 이 증상 기록과 함께 정비 이력에 저장됩니다.</div></div><button class="btn s" style="width:170px;height:48px;font-size:15px" data-go="sys" data-zone="ch" data-sys="서스펜션">하체 부품 보기</button></div>
   <div class="sm" style="margin-top:12px;color:var(--dim)">※ 진단 결과가 아닌 주행 기록입니다.</div></div>`;
};
BIND.work = () => { if (S.visit) { S.visit.shown = true; save(); } };

/* ---------------- 04 정비 이력 ---------------- */
// 이력 화면 맨 위: 다음에 할 일(지금 필요한 것 1건 + 주행거리로 다가오는 것 1건)
function nextCard() {
  const now = needs()[0], go = it => `data-go="sys" data-zone="${it.zone}" data-sys="${it.sys}" data-part="${it.part}"`;
  const soon = CHECK_ITEMS.filter(it => it.interval && lastOf(it.lastPart) && status(it).l === 'g').map(it => ({ it, left: it.interval - (S.veh.odo - lastOf(it.lastPart).km) })).filter(x => x.left > 0).sort((a, b) => a.left - b.left)[0];
  const line = (it, t, c) => `<button class="nx" ${go(it)}><b>${it.name}</b><span style="color:${c}">${t} ›</span></button>`;
  return `<div class="card" style="margin-top:12px;padding:12px 14px;border-color:#7a4d0c;background:#1a1408"><div style="font-size:15px;font-weight:800;color:#fdba74">다음 할 일</div>
   ${now ? line(now.it, now.s.tag, now.s.l === 'r' ? '#fca5a5' : '#fdba74') : '<div style="font-size:16px;margin-top:6px">손볼 곳이 없습니다</div>'}${soon ? line(soon.it, '약 ' + km(soon.left) + ' 뒤', '#c7d3e0') : ''}</div>`;
}
SCREENS.history = r => {
  const f = r.f || 'all', recs = S.hist.filter(h => !h.divider), ok = recs.filter(h => h.src === 'ok' || h.src === 'bh').length, man = recs.filter(h => h.src === 'man').length, edits = recs.reduce((a, h) => a + (h.edits ? h.edits.length : 0), 0);
  const symCard = S.sym.length ? { id: 'sym', sym: true } : null;
  let items = [...(symCard ? [symCard] : []), ...S.hist];
  const keep = h => h.divider ? f === 'all' : h.sym ? (f === 'all' || f === 'sym') : f === 'all' || (f === 'ok' && h.src === 'ok') || (f === 'man' && h.src === 'man') || (f === 'bh' && h.src === 'bh');
  items = items.filter(keep);
  if (!r.sel) r.sel = (S.hist.find(h => h.auto) || S.hist.find(h => !h.divider)).id;
  const sel = S.hist.find(h => h.id === r.sel);
  const TAG = { ok: '<span class="tag t-ok">✔ 확인됨</span>', man: '<span class="tag t-man">직접 입력</span>', bh: '<span class="tag t-bh">블루핸즈 기록</span>' };
  const DOT = { ok: 'var(--gr)', man: '#8b95a5', bh: '#7cc8ff' };
  const tl = items.map(h => {
    if (h.divider) return `<div style="display:flex;align-items:center;gap:10px;color:#fbbf5a;font-size:15px;margin:2px 0 2px -36px"><span style="width:30px;height:2px;background:#fbbf5a"></span>${h.date} ${h.divider}<span style="flex:1;height:1px;background:#5a3d10"></span></div>`;
    if (h.sym) { const a = S.sym[0], b = S.sym[S.sym.length - 1]; return `<button class="card" style="padding:9px 14px" data-sel="sym"><span class="dot tl-dot" style="background:#f0a1d8"></span><div style="display:flex;justify-content:space-between"><b>주행 중 소리 · ${S.sym.length}회 기록</b><span class="tag t-sym">증상</span></div><div class="sm mu">${a.t.slice(0, 10).replace(/-/g, '.')}~${b.t.slice(5, 10).replace('-', '.')} · ${km(a.km)}~${km(b.km)}</div></button>`; }
    const on = h.id === r.sel, tag = TAG[h.src] + (h.edits ? '' : '');
    return `<button class="card" style="padding:9px 14px;${on ? 'border-color:#fb923c;background:rgba(251,146,60,.10)' : ''}" data-sel="${h.id}"><span class="dot tl-dot" style="background:${DOT[h.src]}"></span><div style="display:flex;justify-content:space-between"><b>${h.title}${h.auto ? ' <span class="tag t-or">방금 기록</span>' : ''}</b>${h.src === 'man' && h.edits ? '<span class="tag t-man">직접 입력 · 수정됨</span>' : tag}</div>
     <div class="sm mu">${h.date} · ${h.edits ? h.edits.map(e => `<s>${e.from}</s> → ${e.to}km (${e.at} 수정)`).join(' ') : km(h.km)}${h.parts && h.parts.length ? ` · 부품 ${h.parts.length}종` : ''}${h.memo ? ' · ' + h.memo : ''}</div></button>`;
  }).join('');
  let detail = '';
  if (r.sel === 'sym') detail = `<div class="h" style="font-size:22px;margin-top:4px">주행 중 소리 · ${S.sym.length}회</div><div style="margin-top:8px"><span class="tag t-sym">증상</span> <span class="sm mu">차량 기록 (진단 아님)</span></div>
    <div class="card" style="margin-top:12px;font-size:15px"><table class="sym">${S.sym.slice(-5).map(s => `<tr><td>${s.t.slice(5, 10).replace('-', '.')} ${s.t.slice(11, 16)}</td><td>${s.speed}km/h</td><td>${s.brake}</td><td>${km(s.km)}</td></tr>`).join('')}</table></div>
    <div class="sm mu" style="margin-top:10px">정비소 도착 시 정비 요청서에 함께 표시됩니다.</div>`;
  else if (sel) {
    const nx = sel.parts && sel.parts.includes('engine_oil') ? `<div class="card" style="margin-top:10px;font-size:15px"><div class="mu sm">다음 교체</div>${km(sel.km + 15000)} 또는 1년 뒤 (먼저 오는 시점)</div>` : '';
    detail = `<div class="h" style="font-size:22px;margin-top:4px">${sel.title}</div><div style="margin-top:8px">${TAG[sel.src]} <span class="sm mu">확인 근거</span></div>
     <div class="card" style="margin-top:12px;font-size:15px;line-height:1.9">${(sel.basis || []).map(b => `<div>${b.includes('차량 기록') ? '🚗' : b.includes('주문') ? '🧾' : b.includes('직접') ? '✍️' : '🛠'} ${b}</div>`).join('')}</div>
     ${sel.parts && sel.parts.length ? `<div class="card" style="margin-top:10px;font-size:15px;line-height:1.8"><div class="mu sm">사용한 순정부품</div>${sel.parts.map(id => { const p = partById(id); return `${p.name} <span class="mono">${p.no}</span>`; }).join('<br>')}</div>` : ''}
     ${sel.edits ? `<div class="card" style="margin-top:10px;font-size:15px"><div class="mu sm">수정 내역</div>${sel.edits.map(e => `${e.field}: ${e.from} → ${e.to} (${e.at})`).join('<br>')}</div>` : ''}${nx}`;
  }
  return `<div class="top">${BRAND}${gearChip()}<span class="chip">정비 이력</span><button class="navb" data-go="home">‹ 내 차</button>${INFO}</div>
 <div style="position:absolute;left:24px;top:76px;width:300px;bottom:0">
  <div class="mu sm">${CAR.name} · 출고 ${CAR.delivered}</div>
  <div class="h" style="font-size:40px;margin-top:4px">${Math.round(S.veh.odo).toLocaleString()}<span style="font-size:20px;color:var(--mu)"> km</span></div><div class="mu sm">현재 주행거리 · 차량 기록</div>
  ${nextCard()}
  <div class="card" style="margin-top:10px"><div style="font-size:15px">정비 기록 ${recs.length}건</div>
   <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin:10px 0 8px"><div style="width:${ok / recs.length * 100}%;background:var(--gr)"></div><div style="flex:1;background:#5b6474"></div></div>
   <div class="sm"><span class="tag t-ok">확인됨 ${ok}</span> <span class="tag t-man">직접 입력 ${man}</span></div>
   <div class="sm mu" style="margin-top:10px;line-height:1.6">확인됨: 차량 주행거리, 주문 내역, 블루핸즈 기록으로 확인된 정비<br>수정 내역 ${edits}건 · 수정 전 값과 날짜가 함께 남습니다</div></div>
  <button class="btn p" style="margin-top:16px;font-size:16px;height:56px;width:100%" id="export">정비 이력서 보내기</button><div class="sm mu" style="margin-top:6px;text-align:center">중고차 판매 시 활용</div></div>
 <div style="position:absolute;left:356px;top:76px;width:660px;bottom:0">
  <div class="tabs">${[['all', '전체'], ['ok', '확인됨'], ['man', '직접 입력'], ['sym', '증상'], ['bh', '블루핸즈·오토큐']].map(([k, n]) => `<button class="tab${f === k ? ' on' : ''}" data-f="${k}">${n}</button>`).join('')}</div>
  <div style="position:absolute;left:14px;top:58px;bottom:0;width:2px;background:var(--ln)"></div>
  <div class="scroll" style="position:absolute;top:56px;bottom:12px;left:0;right:0;padding-left:36px"><div style="margin-top:4px;display:flex;flex-direction:column;gap:9px;font-size:15px">${tl}</div></div></div>
 <div class="side scroll" style="left:1040px;width:auto">${detail}<div class="sm" style="margin-top:18px;color:var(--dim)">차량을 팔 때 다음 차주에게 이력을 넘길 수 있습니다.</div></div>`;
};
BIND.history = r => {
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { r.f = b.dataset.f; render(); });
  document.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { r.sel = b.dataset.sel; render(); });
  $('#export').onclick = () => toast('정비 이력서를 휴대폰으로 보냈습니다 (시연)');
};

/* ---------------- 시연 패널 (로고 3번 누르기) ---------------- */
function demoPanel() {
  const v = S.veh, w = v.warn;
  return `<div class="demo" id="demo"><h4>시연 패널 · 에뮬레이터에 없는 신호용 <button id="dx" style="height:auto;background:none;color:#94a3b8">닫기</button></h4>
  <div class="g2" style="grid-template-columns:repeat(3,1fr)">${['P', 'D', 'R'].map(g => `<button class="${v.gear === g ? 'on' : ''}" data-dg="${g}">기어 ${g}</button>`).join('')}</div>
  <div class="g2" style="margin-top:6px;grid-template-columns:repeat(3,1fr)">${[0, 17, 60].map(s => `<button class="${Math.round(v.speed) === s ? 'on' : ''}" data-ds="${s}">${s}km/h</button>`).join('')}</div>
  <div class="g2" style="margin-top:6px"><button class="${v.brake ? 'on' : ''}" id="dbrake">브레이크 ${v.brake ? '떼기' : '밟기'}</button><button id="dodo">주행 +12km</button>
   <button class="${w.engineOil ? 'on' : ''}" data-dw="engineOil">엔진오일 부족</button><button class="${w.washer ? 'on' : ''}" data-dw="washer">워셔액 부족</button>
   <button class="${w.tire ? 'on' : ''}" data-dw="tire">타이어 저압</button><button class="${w.brakeFluid ? 'on' : ''}" data-dw="brakeFluid">브레이크액 부족</button>
   <button class="${v.temp != null && v.temp <= 7 ? 'on' : ''}" id="dtemp">바깥 기온 3℃</button><button id="darr">경유지 도착</button><button id="dreset">처음부터</button></div>
  <div style="margin-top:8px;color:#64748b">신호 출처: ${N ? 'Pleos Vehicle SDK + 시연 버튼' : '브라우저 미리보기'}</div></div>`;
}
function bindDemo() {
  if (!UI.demo) return;
  const set = (o) => window.PS.onVehicle(o, 'demo');
  $('#dx').onclick = () => { UI.demo = false; render(); };
  document.querySelectorAll('[data-dg]').forEach(b => b.onclick = () => { const g = b.dataset.dg; set({ gear: g, speed: g === 'P' ? 0 : Math.max(S.veh.speed, 17) }); if (UI.demo && !$('#demo')) render(); });
  document.querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { set({ speed: +b.dataset.ds }); render(); });
  document.querySelectorAll('[data-dw]').forEach(b => b.onclick = () => { const k = b.dataset.dw; set({ warn: { [k]: !S.veh.warn[k] } }); render(); });
  $('#dbrake').onclick = () => { set({ brake: !S.veh.brake }); render(); };
  $('#dodo').onclick = () => { set({ odo: S.veh.odo + 12 }); render(); };
  $('#dtemp').onclick = () => { set({ temp: S.veh.temp != null && S.veh.temp <= 7 ? 15 : 3 }); render(); };
  $('#darr').onclick = () => { arrived(); if (UI.route.name !== 'work') render(); };
  $('#dreset').onclick = () => { S = freshState(); save(); UI.alertDone = false; UI.spoke = false; UI.symCard = null; go({ name: 'splash' }); };
}

/* ---------------- 시작 ---------------- */
if (N && N.getVehicle) { try { const v = JSON.parse(N.getVehicle()); if (v) window.PS.onVehicle(v, 'car'); } catch (e) { log('getVehicle ' + e); } }
go({ name: 'splash' });
