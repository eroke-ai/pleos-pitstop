// 핏스톱 부품 3D 모델 모음. 전부 직접 만든 형상(사진·타사 자료 없음)
import * as THREE from './three.module.js';
const M = o => new THREE.MeshStandardMaterial(o), MP = o => new THREE.MeshPhysicalMaterial(o);
const CY = (a, b, h, n = 48, open = false) => new THREE.CylinderGeometry(a, b, h, n, 1, open);
const lathe = (pts, n = 96) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), n);
const add = (g, geo, mat, pos = [0, 0, 0], rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); g.add(m); return m; };
function rbox(w, h, d, r = .04) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); const b = Math.min(r * .6, d * .3); const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 4, curveSegments: 10 }); g.translate(0, 0, -(d - 2 * b) / 2); return g; }
function label(lines, { w = 512, h = 512, bg = '#f3f4f6', band = '#f97316', fg = '#111827' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h); if (band) { x.fillStyle = band; x.fillRect(0, 0, w, h * .16); x.fillRect(0, h * .93, w, h * .07); }
  x.textAlign = 'center'; x.fillStyle = fg; let y = h * .16;
  for (const [t, size, weight = 700, col] of lines) { y += size * 1.25; x.font = `${weight} ${size}px "Noto Sans KR","Noto Sans CJK KR",Arial,sans-serif`; x.fillStyle = col || fg; x.fillText(t, w / 2, y); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const helix = (r, h, turns, tube, mat, g, y0 = 0) => { const pts = []; const n = turns * 24; for (let i = 0; i <= n; i++) { const a = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, y0 + h * i / n, Math.sin(a) * r)); } const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, tube, 6), mat); g.add(m); return m; };

export const mats = {
  steel: M({ color: 0xc9ced4, metalness: 1, roughness: .25 }), zinc: M({ color: 0xbfc6cc, metalness: 1, roughness: .34 }), dark: M({ color: 0x23272d, metalness: .6, roughness: .5 }),
  rubber: M({ color: 0x0c0c0d, roughness: .9 }), cast: M({ color: 0xa9afb6, metalness: .9, roughness: .48 }), copper: M({ color: 0xc27a3e, metalness: 1, roughness: .28 }),
  plast: MP({ color: 0x17191d, roughness: .5, clearcoat: .3, clearcoatRoughness: .5 }), paper: M({ color: 0xf2efe6, roughness: 1 }), cer: M({ color: 0xd9d6cc, roughness: .3 }), nick: M({ color: 0xd5d8dc, metalness: 1, roughness: .22 }),
};
const T = mats;

// 4L 통(손잡이가 뚫린 말통 모양). 바닥 y=0, 높이 약 2.5
export function jug({ color = 0x2b3038, lines = [['ENGINE OIL', 70, 800], ['0W-20', 120, 800], ['4L', 76, 700], ['순정 · 예시', 40, 500, '#6b7280']], band = '#f97316', cap = 0xe5e7eb, clear = false } = {}) {
  const g = new THREE.Group(), s = new THREE.Shape();
  s.moveTo(-.72, 0.08); s.quadraticCurveTo(-.72, 0, -.64, 0); s.lineTo(.64, 0); s.quadraticCurveTo(.72, 0, .72, .08); s.lineTo(.72, 1.55); s.quadraticCurveTo(.72, 1.95, .34, 2.12); s.lineTo(.02, 2.2); s.lineTo(-.5, 2.2); s.quadraticCurveTo(-.72, 2.2, -.72, 1.98); s.lineTo(-.72, .08);
  const hole = new THREE.Path(); hole.moveTo(.2, 1.42); hole.quadraticCurveTo(.5, 1.42, .5, 1.6); hole.quadraticCurveTo(.5, 1.86, .2, 1.96); hole.lineTo(.02, 2.0); hole.quadraticCurveTo(-.1, 1.98, -.1, 1.86); hole.lineTo(-.1, 1.56); hole.quadraticCurveTo(-.1, 1.42, .2, 1.42); s.holes.push(hole);
  const body = clear ? MP({ color, roughness: .25, transmission: .55, thickness: .6, clearcoat: .6, attenuationDistance: 1.2, attenuationColor: new THREE.Color(color) }) : MP({ color, roughness: .42, clearcoat: .5, clearcoatRoughness: .35 });
  const geo = new THREE.ExtrudeGeometry(s, { depth: .62, bevelEnabled: true, bevelSize: .09, bevelThickness: .09, bevelSegments: 6, curveSegments: 20 }); geo.translate(0, 0, -.31); g.add(new THREE.Mesh(geo, body));
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.24), MP({ map: label(lines, { band }), roughness: .35, clearcoat: .5 })); lab.position.set(0, .72, .405); g.add(lab);
  const capM = MP({ color: cap, roughness: .45, clearcoat: .3 }); add(g, CY(.2, .2, .1, 40), body, [-.36, 2.3, 0]); add(g, CY(.24, .24, .2, 40), capM, [-.36, 2.42, 0]);
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; add(g, new THREE.BoxGeometry(.025, .17, .03), capM, [-.36 + Math.cos(a) * .245, 2.42, Math.sin(a) * .245], [0, -a, 0]); }
  add(g, CY(.25, .25, .03, 40), capM, [-.36, 2.3, 0]); g.position.x = 0; return g;
}
// 스핀온 오일 필터. 바닥(개스킷 쪽) y=0, 높이 1.2
export function oilFilter() {
  const g = new THREE.Group(), can = MP({ color: 0x1b3352, metalness: .55, roughness: .3, clearcoat: 1, clearcoatRoughness: .12 });
  g.add(new THREE.Mesh(lathe([[0, 1.2], [.3, 1.2], [.4, 1.175], [.455, 1.11], [.48, 1.02], [.48, .16], [.5, .14], [.5, .07], [.47, .05], [0, .05]]), can));
  const fl = new THREE.Mesh(CY(.468, .485, .2, 14), can); fl.position.y = 1.0; fl.material = can.clone(); fl.material.flatShading = true; g.add(fl);
  const lt = label([['OIL FILTER', 74, 800, '#ffffff'], ['순정 · 예시', 40, 500, '#cbd5e1']], { w: 768, h: 300, bg: '#16294a', band: null });
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(.483, .483, .5, 96, 1, true, -1.0, 2.0), MP({ map: lt, metalness: .3, roughness: .3, clearcoat: 1 })); lb.position.y = .56; g.add(lb);
  add(g, CY(.502, .502, .07, 96), T.steel, [0, .105, 0]); add(g, CY(.46, .46, .03, 64), T.zinc, [0, .04, 0]);
  add(g, new THREE.TorusGeometry(.37, .04, 16, 64), T.rubber, [0, .03, 0], [Math.PI / 2, 0, 0]); add(g, CY(.13, .13, .04, 32), M({ color: 0x050506, roughness: 1 }), [0, .022, 0]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(g, CY(.04, .04, .04, 16), M({ color: 0x050506, roughness: 1 }), [Math.cos(a) * .24, .022, Math.sin(a) * .24]); }
  return g;
}
// 드레인 플러그(플랜지 볼트). 머리가 위, 나사 끝 y=0
export function drainPlug() {
  const g = new THREE.Group();
  add(g, CY(.105, .115, .3, 32), T.zinc, [0, .15, 0]); helix(.118, .26, 8, .013, T.zinc, g, .01);
  add(g, CY(.27, .27, .045, 48), T.zinc, [0, .3, 0]); add(g, CY(.2, .27, .03, 48), T.zinc, [0, .335, 0]);
  add(g, CY(.2, .2, .15, 6), T.zinc, [0, .42, 0]); add(g, CY(.17, .2, .025, 6), T.zinc, [0, .505, 0]);
  return g;
}
export function crushWasher() { const g = new THREE.Group(); g.add(new THREE.Mesh(lathe([[.14, 0], [.26, 0], [.27, .012], [.27, .038], [.26, .05], [.14, .05], [.13, .038], [.13, .012], [.14, 0]], 64), T.copper)); return g; }
// 주름 필터(에어컨·에어클리너)
export function pleatFilter({ w = 2.2, d = 1.5, h = .3, frame = 0x2a2f36, media = 0xf2efe6, n = 24 } = {}) {
  const g = new THREE.Group(), fm = M({ color: frame, roughness: .85 }), s = new THREE.Shape(), pw = (w - .12) / n, x0 = -(w - .12) / 2;
  s.moveTo(x0, .04); for (let i = 0; i < n; i++) { s.lineTo(x0 + (i + .5) * pw, h - .01); s.lineTo(x0 + (i + 1) * pw, .04); } s.lineTo(x0 + n * pw, 0); for (let i = n - 1; i >= 0; i--) { s.lineTo(x0 + (i + .5) * pw, h - .05); s.lineTo(x0 + i * pw, 0); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: d - .12, bevelEnabled: false }); geo.translate(0, 0, -(d - .12) / 2); g.add(new THREE.Mesh(geo, M({ color: media, roughness: 1, side: THREE.DoubleSide })));
  add(g, new THREE.BoxGeometry(w, h, .06), fm, [0, h / 2, d / 2 - .03]); add(g, new THREE.BoxGeometry(w, h, .06), fm, [0, h / 2, -d / 2 + .03]); add(g, new THREE.BoxGeometry(.06, h, d), fm, [w / 2 - .03, h / 2, 0]); add(g, new THREE.BoxGeometry(.06, h, d), fm, [-w / 2 + .03, h / 2, 0]);
  return g;
}
// 플랫 와이퍼 블레이드
export function wiper() {
  const g = new THREE.Group(), L = 3.0, curve = new THREE.CatmullRomCurve3([-1, -.75, -.5, -.25, 0, .25, .5, .75, 1].map(t => new THREE.Vector3(t * L / 2, -.2 * t * t, 0)));
  const sec = (pts) => { const s = new THREE.Shape(); s.moveTo(...pts[0]); pts.slice(1).forEach(p => s.lineTo(...p)); return s; };
  const ex = (pts, mat) => { const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sec(pts), { steps: 120, extrudePath: curve, bevelEnabled: false }), mat); g.add(m); return m; };
  ex([[-.02, -.11], [.02, -.1], [.06, -.04], [.085, .03], [.06, .06], [-.02, .11], [-.045, 0]], MP({ color: 0x1b1d21, roughness: .38, clearcoat: .4, clearcoatRoughness: .3 }));   // 스포일러 달린 몸통
  ex([[-.045, -.03], [-.075, -.03], [-.075, .03], [-.045, .03]], T.plast);            // 고무를 무는 레일
  ex([[-.075, -.014], [-.2, -.005], [-.2, .005], [-.075, .014]], T.rubber);         // 닦는 고무날
  for (const z of [-.085, .085]) ex([[-.03, z - .006], [-.012, z - .006], [-.012, z + .006], [-.03, z + .006]], T.steel); // 양옆 스프링 강
  add(g, rbox(.62, .16, .27, .05), T.plast, [0, .085, 0]); add(g, rbox(.34, .13, .17, .04), M({ color: 0x3f444c, roughness: .45 }), [0, .2, 0]); add(g, CY(.035, .035, .23, 16), T.steel, [0, .2, 0], [Math.PI / 2, 0, 0]);
  add(g, rbox(.12, .05, .1, .02), M({ color: 0x5b616a, roughness: .5 }), [.1, .27, 0]);
  for (const sx of [-1, 1]) add(g, rbox(.16, .1, .26, .035), T.plast, [sx * (L / 2 - .06), -.2 + .01, 0]);
  return g;
}
// 브레이크 디스크(벤틸레이티드)
export function disc() {
  const g = new THREE.Group(), iron = M({ color: 0xc0c5cb, metalness: 1, roughness: .36 }), hat = M({ color: 0x6b7178, metalness: .8, roughness: .5 }), blk = M({ color: 0x050506, roughness: 1 });
  for (const y of [0, .13]) g.add(new THREE.Mesh(lathe([[.52, y], [1.0, y], [1.0, y + .07], [.52, y + .07], [.52, y]], 128), iron));
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; add(g, new THREE.BoxGeometry(.44, .07, .03), hat, [Math.cos(a) * .77, .1, Math.sin(a) * .77], [0, -a + .35, 0]); }
  g.add(new THREE.Mesh(lathe([[.2, .36], [.42, .36], [.46, .33], [.5, .2], [.54, .2], [.54, .13], [.46, .13], [.42, .3], [.2, .3], [.2, .36]], 96), hat));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(g, CY(.045, .045, .08, 20), blk, [Math.cos(a) * .32, .335, Math.sin(a) * .32]); }
  for (const r of [.62, .74, .86, .95]) add(g, new THREE.TorusGeometry(r, .004, 4, 128), M({ color: 0x7d838a, metalness: 1, roughness: .2 }), [0, .2, 0], [Math.PI / 2, 0, 0]);
  return g;
}
// 브레이크 패드 한 장
export function pad() {
  const g = new THREE.Group(), A = .6, st = M({ color: 0x565b62, metalness: .85, roughness: .45 });
  const bp = new THREE.Shape(), pt = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];
  bp.moveTo(...pt(.55, -A)); bp.absarc(0, 0, .55, Math.PI / 2 + A, Math.PI / 2 - A, true);
  bp.lineTo(...pt(.72, A + .02)); bp.lineTo(...pt(.74, A + .2)); bp.lineTo(...pt(.9, A + .2)); bp.lineTo(...pt(.92, A + .03)); bp.lineTo(...pt(1.05, A));
  bp.absarc(0, 0, 1.05, Math.PI / 2 - A, Math.PI / 2 + A, false);
  bp.lineTo(...pt(.92, -A - .03)); bp.lineTo(...pt(.9, -A - .2)); bp.lineTo(...pt(.74, -A - .2)); bp.lineTo(...pt(.72, -A - .02)); bp.lineTo(...pt(.55, -A));
  g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(bp, { depth: .05, bevelEnabled: true, bevelSize: .008, bevelThickness: .008, bevelSegments: 2, curveSegments: 48 }), st));
  const fr = M({ color: 0x6a645b, roughness: .95 });
  for (const [a0, a1] of [[-A + .06, -.018], [.018, A - .06]]) { const sh = new THREE.Shape(); sh.absarc(0, 0, 1.01, Math.PI / 2 - a1, Math.PI / 2 - a0, false); sh.absarc(0, 0, .6, Math.PI / 2 - a0, Math.PI / 2 - a1, true); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .1, bevelEnabled: true, bevelSize: .03, bevelThickness: .035, bevelSegments: 3, curveSegments: 32 }), fr); m.position.z = .065; g.add(m); }
  g.children.forEach(c => c.position.y -= .8); return g;
}
export function padSet() { const g = new THREE.Group(); const a = pad(); a.rotation.set(-1.32, 0, .15); a.position.set(0, .06, .35); const b = pad(); b.rotation.set(-.3, .45, 0); b.position.set(.2, .62, -.6); g.add(a, b); return g; }
// 타이어+휠
export function tire({ wheel = true, rubber = true } = {}) {
  const g = new THREE.Group(), tr = M({ color: 0x101113, roughness: .88 }), al = M({ color: 0xe2e5e9, metalness: 1, roughness: .2 }), dk = M({ color: 0x2a2d32, metalness: .8, roughness: .35 });
  if (rubber) { const pp = [[.6, -.3], [.66, -.325], [.8, -.345], [.9, -.335], [.955, -.3], [.97, -.26], [.97, .26], [.955, .3], [.9, .335], [.8, .345], [.66, .325], [.6, .3]];
    const m = new THREE.Mesh(lathe(pp, 160), tr); m.rotation.x = Math.PI / 2; g.add(m);
    // 트레드: 세로 홈 4줄 사이의 리브 5줄, 리브마다 비스듬한 블록
    const ribs = [[-.215, .078, .16], [-.108, .09, -.1], [0, .09, 0], [.108, .09, .1], [.215, .078, -.16]], N = 96;
    for (const [z, w, sk] of ribs) for (let i = 0; i < N; i++) { const a = (i + (z > 0 ? .5 : 0)) / N * Math.PI * 2, bl = new THREE.Mesh(rbox(.03, 2 * Math.PI * .985 / N * .9, w, .006), tr); bl.position.set(Math.cos(a) * .972, Math.sin(a) * .972, z); bl.rotation.z = a; bl.rotateX(sk); g.add(bl); }
    for (const zz of [-.345, .345]) for (const r of [.86, .7]) add(g, new THREE.TorusGeometry(r, .006, 6, 128), tr, [0, 0, zz * (r > .8 ? .985 : .96)]);
  }
  if (wheel) { const rim = new THREE.Mesh(lathe([[.56, -.3], [.63, -.3], [.63, -.27], [.6, -.25], [.57, 0], [.6, .25], [.63, .27], [.63, .3], [.56, .3], [.53, .2], [.53, -.2], [.56, -.3]], 96), al); rim.rotation.x = Math.PI / 2; g.add(rim);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + (i % 2 ? .12 : -.12); const sp = add(g, rbox(.46, .11, .07, .025), al, [Math.cos(a) * .36, Math.sin(a) * .36, .2], [0, 0, a]); sp.rotateY(-.18); }
    add(g, CY(.17, .2, .1, 40), al, [0, 0, .22], [Math.PI / 2, 0, 0]); add(g, CY(.1, .1, .03, 32), dk, [0, 0, .285], [Math.PI / 2, 0, 0]); add(g, CY(.55, .55, .05, 64), M({ color: 0x0a0b0c, roughness: .9 }), [0, 0, -.05], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(g, CY(.03, .03, .05, 6), T.steel, [Math.cos(a) * .12, Math.sin(a) * .12, .27], [Math.PI / 2, 0, 0]); } }
  return g;
}
// 배터리
export function battery() {
  const g = new THREE.Group(), bx = MP({ color: 0x15171a, roughness: .5, clearcoat: .3 }), lead = M({ color: 0x9a9da1, metalness: 1, roughness: .45 });
  add(g, rbox(2.4, 1.3, 1.4, .06), bx, [0, .65, 0]); add(g, rbox(2.46, .22, 1.46, .05), MP({ color: 0x1e2126, roughness: .45, clearcoat: .4 }), [0, 1.36, 0]);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .95), MP({ map: label([['AGM 80Ah', 96, 800], ['12V · 순정 · 예시', 44, 500, '#6b7280']], { w: 768, h: 384 }), roughness: .4, clearcoat: .4 })); lab.position.set(0, .64, .705); g.add(lab);
  for (const [x, c] of [[-.85, 0xdc2626], [.85, 0x111111]]) { add(g, CY(.11, .13, .2, 24), lead, [x, 1.56, .35]); add(g, rbox(.34, .05, .34, .02), M({ color: c, roughness: .6 }), [x, 1.48, .35]); }
  for (let i = 0; i < 6; i++) add(g, CY(.09, .09, .04, 20), M({ color: 0x2c3036, roughness: .6 }), [-.75 + i * .3, 1.48, -.3]);
  add(g, new THREE.TorusGeometry(.5, .035, 10, 32, Math.PI), M({ color: 0x0c0c0d, roughness: .8 }), [0, 1.46, 0], [-.5, 0, 0]);
  return g;
}
// 점화 플러그, 점화 코일
export function sparkPlug() {
  const g = new THREE.Group(), cer = T.cer, nick = T.nick;
  add(g, lathe([[0, 0], [.03, 0], [.03, .05], [.05, .07], [.05, .13], [.035, .15], [.045, .17], [.045, .2], [.06, .22], [.075, .5], [.075, .56], [0, .56]], 48), cer, [0, .42, 0]);
  for (let k = 0; k < 4; k++) add(g, new THREE.TorusGeometry(.066 + k * .002, .008, 8, 32), cer, [0, .72 + k * .045, 0], [Math.PI / 2, 0, 0]);
  add(g, CY(.115, .115, .12, 6), nick, [0, .4, 0]); add(g, CY(.125, .1, .05, 32), nick, [0, .315, 0]); add(g, CY(.082, .082, .3, 32), nick, [0, .15, 0]); helix(.086, .27, 10, .009, nick, g, .01);
  add(g, CY(.018, .018, .05, 12), nick, [0, -.02, 0]); add(g, new THREE.TorusGeometry(.05, .012, 8, 16, Math.PI * .6), nick, [.03, -.02, 0], [0, 0, Math.PI * 1.25]); add(g, CY(.03, .035, .07, 16), nick, [0, 1.0, 0]);
  return g;
}
export function coil() {
  const g = new THREE.Group();
  add(g, rbox(.34, .1, .22, .03), T.plast, [.04, .64, 0]); add(g, CY(.085, .085, .14, 24), T.plast, [0, .54, 0]); add(g, CY(.05, .045, .5, 20), T.rubber, [0, .24, 0]); add(g, CY(.058, .05, .08, 20), T.rubber, [0, .03, 0]);
  add(g, rbox(.16, .08, .15, .02), M({ color: 0x6a7078, roughness: .6 }), [.27, .64, 0]); add(g, CY(.025, .025, .03, 6), T.steel, [-.1, .7, 0]);
  return g;
}
// 엔진 마운트, 롤로드
export function mount() {
  const g = new THREE.Group(), al = M({ color: 0xb4b9bf, metalness: .9, roughness: .46 }), stl = M({ color: 0x24272c, metalness: .7, roughness: .45 });
  const plate = (pts, holes, d, mat, y) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); pts.slice(1).forEach(p => p.length === 4 ? sh.quadraticCurveTo(...p) : sh.lineTo(...p)); sh.closePath(); holes.forEach(([x, z, r]) => { const h = new THREE.Path(); h.absarc(x, z, r, 0, Math.PI * 2, true); sh.holes.push(h); }); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 3, curveSegments: 24 }), mat); m.rotation.x = Math.PI / 2; m.position.y = y + d; g.add(m); return m; };
  // 차체 쪽 강판 받침(볼트 구멍 2개)
  plate([[-.42, -.2], [.42, -.2], [.5, -.2, .5, -.12], [.5, .12], [.5, .2, .42, .2], [-.42, .2], [-.5, .2, -.5, .12], [-.5, -.12], [-.5, -.2, -.42, -.2]], [[-.38, 0, .045], [.38, 0, .045]], .035, stl, 0);
  g.add(new THREE.Mesh(lathe([[.0, .035], [.27, .035], [.27, .05], [.235, .07], [.235, .2], [.25, .215], [.25, .235], [.21, .235], [.21, .08], [0, .08]], 96), stl));
  g.add(new THREE.Mesh(lathe([[0, .08], [.2, .08], [.205, .22], [.19, .27], [.13, .315], [.09, .33], [0, .33]], 96), T.rubber));
  for (let i = 0; i < 3; i++) add(g, new THREE.TorusGeometry(.2 - i * .035, .008, 8, 64), T.rubber, [0, .262 + i * .022, 0], [Math.PI / 2, 0, 0]);
  add(g, CY(.085, .095, .05, 32), al, [0, .35, 0]);
  // 엔진 쪽 알루미늄 브래킷(볼트 구멍 3개)
  plate([[-.13, -.14], [.13, -.14], [.2, -.1, .22, -.02], [.62, .05], [.7, .06, .7, .16], [.7, .27, .6, .28], [.2, .2], [.1, .26, -.02, .24], [-.13, .14], [-.2, .08, -.2, 0], [-.2, -.1, -.13, -.14]], [[0, 0, .035], [.42, .14, .04], [.6, .17, .04]], .07, al, .375);
  add(g, CY(.03, .03, .1, 20), T.zinc, [0, .47, 0]); add(g, CY(.06, .06, .045, 6), T.zinc, [0, .47, 0]); add(g, CY(.075, .075, .012, 24), T.zinc, [0, .448, 0]);
  for (const x of [-.38, .38]) { add(g, CY(.05, .05, .035, 6), T.zinc, [x, .055, 0]); add(g, CY(.065, .065, .01, 24), T.zinc, [x, .04, 0]); }
  return g;
}
export function rollRod() {
  const g = new THREE.Group(), brk = M({ color: 0xb9bec5, metalness: .9, roughness: .4 });
  for (const [x, rr] of [[0, .15], [.62, .11]]) { add(g, CY(rr, rr, .14, 36), brk, [x, 0, 0], [Math.PI / 2, 0, 0]); add(g, CY(rr * .78, rr * .78, .15, 36), T.rubber, [x, 0, 0], [Math.PI / 2, 0, 0]); add(g, CY(rr * .3, rr * .3, .18, 20), T.steel, [x, 0, 0], [Math.PI / 2, 0, 0]); }
  add(g, rbox(.4, .11, .05, .02), brk, [.31, 0, 0]); add(g, rbox(.4, .03, .12, .012), brk, [.31, .055, 0]); add(g, rbox(.4, .03, .12, .012), brk, [.31, -.055, 0]); return g;
}
// 쇼크업소버(스트럿), 벨트, 전구는 분류 그림용
export function shock() {
  const g = new THREE.Group(); add(g, CY(.16, .16, 1.1, 32), M({ color: 0x1a1c20, metalness: .5, roughness: .4 }), [0, .55, 0]); add(g, CY(.06, .06, 1.0, 20), T.steel, [0, 1.5, 0]);
  helix(.3, 1.2, 6, .045, M({ color: 0x23272d, metalness: .6, roughness: .4 }), g, .95); add(g, CY(.36, .36, .05, 40), T.dark, [0, .95, 0]); add(g, CY(.36, .3, .12, 40), T.dark, [0, 2.2, 0]); add(g, CY(.12, .12, .2, 24), T.rubber, [0, -.02, 0], [Math.PI / 2, 0, 0]); return g;
}
export function belt() {
  const g = new THREE.Group(), s = new THREE.Shape(); s.absellipse(0, 0, 1.0, .62, 0, Math.PI * 2); const h = new THREE.Path(); h.absellipse(0, 0, .95, .57, 0, Math.PI * 2, true); s.holes.push(h);
  g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .3, bevelEnabled: false, curveSegments: 96 }), T.rubber));
  for (let k = 0; k < 6; k++) { const s2 = new THREE.Shape(); s2.absellipse(0, 0, .95, .57, 0, Math.PI * 2); const h2 = new THREE.Path(); h2.absellipse(0, 0, .93, .55, 0, Math.PI * 2, true); s2.holes.push(h2); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s2, { depth: .025, bevelEnabled: false, curveSegments: 96 }), M({ color: 0x1b1b1d, roughness: .8 })); m.position.z = .02 + k * .05; g.add(m); }
  g.rotation.x = -1.1; return g;
}
export function bulb() {
  const g = new THREE.Group(); add(g, new THREE.SphereGeometry(.3, 40, 24), MP({ color: 0xffb347, roughness: .05, transmission: .85, thickness: .3, ior: 1.5, attenuationDistance: 2, attenuationColor: new THREE.Color(0xffb347) }), [0, .75, 0]).scale.set(1, 1.25, 1);
  add(g, CY(.2, .22, .3, 32), T.nick, [0, .25, 0]); helix(.215, .22, 4, .015, T.nick, g, .13); add(g, CY(.1, .16, .1, 24), M({ color: 0x111111, roughness: .7 }), [0, .05, 0]); return g;
}
export const shadow = g => { g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };
