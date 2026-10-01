/* ============================================================
   test/spec17.js — 돌림힘: 막대(강체) · 받침(핀 / 접촉) · 막대에 건 실
     닫힌형 공식과 대조 (지레 평형, 초기 각가속도 Στ/I, 끝 고정 3g/2L, 진자 에너지,
     두 받침 반작용, 넘어짐 경계, 매단 막대 장력, 기운 막대의 정지 마찰),
     렌더 ↔ 물리 기하 일치, 수능 규격 SVG, 공유 링크 왕복, 편집 스냅, 편집 경고, POE 정합성.
   실행: node test/spec17.js
   ============================================================ */
'use strict';
const { loadApp } = require('./dom-harness');

const results = [];
let CUR = null;
function scenario(id, title, fn) {
  CUR = { id, title, checks: [], error: null };
  try { fn(); } catch (err) { CUR.error = err.stack || String(err); }
  results.push(CUR); CUR = null;
}
function expect(label, actual, expected, tol, unit) {
  let tolAbs = tol;
  if (typeof tol === 'string' && tol.endsWith('%')) { tolAbs = Math.abs(expected) * parseFloat(tol) / 100; if (tolAbs < 1e-9) tolAbs = 1e-6; }
  const ok = typeof actual === 'number' && isFinite(actual) && Math.abs(actual - expected) <= tolAbs;
  CUR.checks.push({ label, actual, expected, tol: tolAbs, ok, unit: unit || '' });
}
function truthy(label, v) { CUR.checks.push({ label, actual: v ? 1 : 0, expected: 1, tol: 0, ok: !!v, unit: '' }); }
function app() { const a = loadApp(); a.evalIn(`CONFIG.cellSize = 8; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;`); return a; }

const g = 9.8;

/* 장면 헬퍼 — 막대 중심선 높이 cy, 받침 꼭짓점 (ax, ay) 로 적는다 (격자, y 아래로) */
const RUN = `
  function K(k){ return STATE.elements.find(e => e._key === k); }
  function build(spec){ buildSceneFromSpec(spec, { history:false, view:false }); return sceneToData(); }
  function load(id){ loadScene(id, { history:false, view:false }); return sceneToData(); }
  function rod(key, L, M, cx, cy, extra){ return Object.assign({ key, type:'rod', gridW:L, mass:M, gridX:cx - L/2, gridY:cy - 0.125 }, extra || {}); }
  function ful(key, ax, ay, pinned){ return { key, type:'fulcrum', gridX:ax - 0.5, gridY:ay, pinned: !!pinned }; }
  function go(){ validateAll(); startSimulation(); }
  function run(t){ const n = Math.round(t / CONFIG.FIXED_DT); for (let i = 0; i < n; i++) { simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; } }
  function stop(){ stopSimulation(); STATE.simMode = 'EDIT'; restoreSnapshot(); }
`;

scenario('S17-1', '지레의 평형 — 2 kg × 3 m = 1.5 kg × 4 m: 3 s 동안 정지, R = ΣW, 장력 = 무게, Στ = 0', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    load('lever'); go(); run(3);
    const R = K('R'), F = K('F');
    const A = F._apex;
    const T = R._fbd.forces.filter(f => f.kind === 'T').map(f => Math.hypot(f.fx, f.fy));
    const out = { th: R.theta, om: R.omega, R: F._force.fy, T, tau: rodTorqueAbout(R, A.x, A.y, F) };
    stop(); out`);
  expect('각도 θ', r.th, 0, 1e-6, 'rad');
  expect('각속도 ω', r.om, 0, 1e-6, 'rad/s');
  expect('받침 반작용 = (2 + 2 + 1.5)g', r.R, 5.5 * g, '0.5%', 'N');
  expect('장력 T1 = 2g', r.T[0], 2 * g, '0.5%', 'N');
  expect('장력 T2 = 1.5g', r.T[1], 1.5 * g, '0.5%', 'N');
  expect('받침 기준 Στ', r.tau, 0, 1e-6, 'N·m');
});

scenario('S17-2', '평형이 깨진 지레 — 초기 α = Στ / I_받침 (매단 추 포함, 평행축)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    load('lever'); K('B').mass = 2; go(); run(1/60);
    const out = { alpha: K('R')._alphaMeas }; stop(); out`);
  // I = ML²/12 + m_A·3² + m_B·4² (실이 팽팽해 추가 받침점 둘레를 함께 돈다), Στ = g(2·3 − 2·4)
  const I = 2 * 64 / 12 + 2 * 9 + 2 * 16;
  expect('α = g(2·3 − 2·4) / (ML²/12 + 18 + 32)', r.alpha, g * (6 - 8) / I, '1%', 'rad/s²');
});

scenario('S17-3', '끝을 고정한 수평 막대 — α₀ = −3g/(2L), 끝 가속도 1.5g, 처음 받침 반작용 Mg/4', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const out = {};
    for (const L of [6, 3]) {
      build({ elements: [ ful('F', 47, 50, true), rod('R', L, 2, 47 + L/2, 50) ] });
      go(); run(1/60);
      out['a' + L] = K('R')._alphaMeas; out['R' + L] = K('F')._force.fy;
      stop();
    }
    out`);
  expect('L = 6 m: α₀ = −3g/12', r.a6, -3 * g / 12, '1%', 'rad/s²');
  expect('L = 3 m: α₀ = −3g/6', r.a3, -3 * g / 6, '1%', 'rad/s²');
  expect('끝 가속도 |α|L = 1.5g (L 무관)', Math.abs(r.a6) * 6, 1.5 * g, '1%', 'm/s²');
  expect('처음 받침 반작용 = Mg/4', r.R6, 2 * g / 4, '3%', 'N');
});

scenario('S17-4', '물리 진자(끝 고정 막대) — 최저점 ω = √(3g/L), 역학적 에너지 보존 0.5 %', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ elements: [ ful('F', 47, 50, true), rod('R', 6, 2, 50, 50) ] });
    go();
    const R = K('R'), I = 2 * 36 / 3, E = () => 0.5 * I * R.omega * R.omega + 2 * 9.8 * R.physY;
    const e0 = E(); let maxOm = 0, maxDE = 0, pinErr = 0;
    for (let i = 0; i < 600; i++) {
      run(1/60);
      maxOm = Math.max(maxOm, Math.abs(R.omega)); maxDE = Math.max(maxDE, Math.abs(E() - e0));
      const P = rodPhysPoint(R, 0); pinErr = Math.max(pinErr, Math.hypot(P.x - 47, P.y - 50));
    }
    stop(); ({ maxOm, maxDE, pinErr })`);
  expect('최저점 각속도 √(3g/L)', r.maxOm, Math.sqrt(3 * g / 6), '0.5%', 'rad/s');
  expect('에너지 변화 / (MgL/2)', r.maxDE / (2 * g * 3), 0, 0.005, '');
  expect('핀 어긋남', r.pinErr, 0, 1e-6, 'm');
});

scenario('S17-5', '두 받침 위 막대 — N₁·N₂ 돌림힘 평형 해, 넘어짐 경계 m = 1 kg', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('two-supports');
    ({ N1: measureScene(d, { body:'F1', q:'N', at:1 }), N2: measureScene(d, { body:'F2', q:'N', at:1 }),
       th: measureScene(d, { body:'R', q:'theta', at:2 }),
       N1b: measureScene(applyVariant(d, { W: { mass: 0.9 } }), { body:'F1', q:'N', at:1 }),
       thb: measureScene(applyVariant(d, { W: { mass: 0.9 } }), { body:'R', q:'theta', at:2 }),
       N1c: measureScene(applyVariant(d, { W: { mass: 1.5 } }), { body:'F1', q:'N', at:0.5 }),
       thc: measureScene(applyVariant(d, { W: { mass: 1.5 } }), { body:'R', q:'theta', at:1 }) })`);
  // 오른쪽 받침(x=51) 기준: N₁·4 + 0.5g·3 = 3g·1
  expect('N₁ = (3g − 1.5g)/4', r.N1, (3 * g - 1.5 * g) / 4, '1%', 'N');
  expect('N₂ = 3.5g − N₁', r.N2, 3.5 * g - (3 * g - 1.5 * g) / 4, '1%', 'N');
  expect('기울지 않음', r.th, 0, 1e-3, '°');
  expect('0.9 kg: N₁ = (3g − 2.7g)/4 > 0', r.N1b, (3 * g - 2.7 * g) / 4, '3%', 'N');
  expect('0.9 kg: 기울지 않음', r.thb, 0, 1e-3, '°');
  expect('1.5 kg: 왼쪽 받침에서 뜬다 (N₁ = 0)', r.N1c, 0, 1e-6, 'N');
  truthy('1.5 kg: 오른쪽 받침을 축으로 넘어간다 (θ < −5°)', r.thc < -5);
});

scenario('S17-6', '실에 매단 막대 — T₁ = 2g, T₂ = g (왼쪽 실 기준 돌림힘)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('hung-rod');
    ({ T1: measureScene(d, { body:'R', q:'T1', at:1 }), T2: measureScene(d, { body:'R', q:'T2', at:1 }),
       th: measureScene(d, { body:'R', q:'theta', at:3 }), tA: measureScene(d, { body:'A', q:'T', at:1 }) })`);
  expect('T₁ (x = 48)', r.T1, 2 * g, '0.5%', 'N');
  expect('T₂ (x = 53)', r.T2, g, '0.5%', 'N');
  expect('수평 유지', r.th, 0, 1e-4, '°');
  expect('추를 매단 실 장력 = 추 무게 (네모 쪽 자유물체도)', r.tA, g, '1%', 'N');
});

scenario('S17-7', '받치기만 하는 받침 — 질량중심이 꼭짓점 위면 중립 평형, 1 m 벗어나면 α₀ = −Mg·1/(ML²/12 + M)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ elements: [ ful('F', 50, 50), rod('R', 6, 2, 50, 50) ] }); go(); run(3);
    const out = { th: K('R').theta, y: K('R').physY, N: K('F')._force.N }; stop();
    build({ elements: [ ful('F', 49, 50), rod('R', 6, 2, 50, 50) ] }); go(); run(1/60);
    out.alpha = K('R')._alphaMeas; stop(); out`);
  expect('중립: 각도', r.th, 0, 1e-6, 'rad');
  expect('중립: 높이 유지', r.y, 50, 1e-3, 'm');
  expect('중립: N = Mg', r.N, 2 * g, '0.5%', 'N');
  expect('α₀ = −g / (36/12 + 1)', r.alpha, -g / 4, '1%', 'rad/s²');
});

scenario('S17-8', '기운 막대의 정지 마찰 — tan 20° < μs 정지, tan 30° > μs 미끄러짐 (질량중심이 꼭짓점 위)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const out = {};
    for (const deg of [20, 30]) {
      build({ elements: [ ful('F', 50, 50), rod('R', 6, 2, 50, 50, { angle0: deg }) ] }); go(); run(2);
      out['x' + deg] = K('R').physX; out['f' + deg] = Math.abs(K('F')._force.f); stop();
    }
    out`);
  expect('20°: 질량중심 x 그대로', r.x20, 50, 1e-4, 'm');
  expect('20°: 정지 마찰력 = Mg sin 20°', r.f20, 2 * g * Math.sin(20 * Math.PI / 180), '1%', 'N');
  truthy('30°: 미끄러져 내려감 (x 가 0.1 m 이상 이동)', Math.abs(r.x30 - 50) > 0.1);
});

scenario('S17-9', '바닥에 누운 막대 — 두 모서리 수직항력 합 = Mg, 기어가지 않음 / 끝이 바닥에 닿으면 멈춤', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [{ key:'G', x1:30, y1:51, x2:70, y2:51, isFriction:true, muS:0.5, muK:0.4 }], elements: [ rod('R', 6, 2, 50, 50.875) ] });
    go(); run(3);
    const R = K('R');
    const out = { y: R.physY, x: R.physX, v: Math.hypot(R.vx, R.vy), N: R._fbd.forces.filter(f => f.kind === 'N').reduce((s, f) => s + f.fy, 0) };
    stop();
    build({ floors: [{ key:'G', x1:30, y1:52, x2:70, y2:52 }], elements: [ ful('F', 48, 50, true), rod('R', 6, 2, 50, 50) ] });
    go(); run(4); out.th = K('R').theta; out.om = K('R').omega; stop(); out`);
  expect('바닥 위 높이 (중심선 = 바닥 + 두께/2)', r.y, 49.125, 1e-3, 'm');
  expect('기어가지 않음', r.x, 50, 1e-6, 'm');
  expect('정지', r.v, 0, 1e-6, 'm/s');
  expect('수직항력 합 = Mg', r.N, 2 * g, '0.5%', 'N');
  // 오른쪽 끝 아래 모서리가 바닥(2 m 아래)에 닿는 각: 5 sinθ + 0.125 cosθ = 2
  const th = (() => { let t = 0.4; for (let i = 0; i < 30; i++) t -= (5 * Math.sin(t) + 0.125 * Math.cos(t) - 2) / (5 * Math.cos(t) - 0.125 * Math.sin(t)); return t; })();
  expect('끝이 바닥에 닿아 멈춘 각도', r.th, -th, 0.002, 'rad');
  expect('멈춤', r.om, 0, 1e-3, 'rad/s');
});

scenario('S17-10', '기하 일치 — 렌더·히트테스트·실 앵커·물리가 같은 막대를 가리킨다 (편집 · 실행 중 기운 막대)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const a15 = 15 * Math.PI / 180;   // 왼쪽 끝(p1)이 꼭짓점 (47, 50) 에 오도록 중심을 둔다
    build({ elements: [ ful('F', 47, 50, true), rod('R', 6, 2, 47 + 3 * Math.cos(a15), 50 - 3 * Math.sin(a15), { angle0: 15 }) ] });
    const R = K('R'), cs = CONFIG.cellSize, GS = CONFIG.GRID_SIZE;
    const out = {};
    // 편집: rodGeometry 끝점 ↔ 실 앵커 월드 좌표 ↔ 받침 접점
    const g0 = rodGeometry(R), wP2 = getAttachPointWorld(R, 'p2');
    out.e1 = Math.hypot(wP2.x / cs - g0.p2.x, wP2.y / cs - g0.p2.y);
    out.c = fulcrumRodContact(K('F'));
    out.hitIn  = R.hitTest(((g0.p1.x + g0.p2.x) / 2) * cs, ((g0.p1.y + g0.p2.y) / 2) * cs);
    out.hitOut = R.hitTest((g0.cx + g0.nx * 1) * cs, (g0.cy + g0.ny * 1) * cs);
    go(); run(0.5);
    // 실행 중: 물리 점 (y 위) ↔ 렌더 기하 (y 아래)
    const g1 = rodGeometry(R);
    let e2 = 0;
    for (const d of [0, 1.5, 3, 6]) {
      const P = rodPhysPoint(R, d), Q = rodPointGrid(R, d);
      e2 = Math.max(e2, Math.hypot(P.x - Q.x, (GS - P.y) - Q.y));
      const W = getAttachPointWorld(R, d === 0 ? 'p1' : d === 6 ? 'p2' : d === 3 ? 'c' : 's1.5');
      e2 = Math.max(e2, Math.hypot(W.x / cs - Q.x, W.y / cs - Q.y));
    }
    out.e2 = e2;
    // 렌더 모서리 ↔ 물리 충돌 모서리
    const rc = rodCorners(g1), pc = _rodCornersPhys(R);
    out.e3 = Math.max(...rc.map(p => Math.min(...pc.map(q => Math.hypot(p.x - q.x, p.y - (GS - q.y))))));
    out.angle = g1.angle; out.theta = R.theta;
    stop(); out`);
  expect('편집: 실 앵커 p2 = 막대 끝', r.e1, 0, 1e-9, '칸');
  truthy('편집: 받침이 막대 왼쪽 끝(d = 0)에 닿음', r.c && Math.abs(r.c.d) < 1e-9);
  truthy('히트테스트: 막대 위 안 / 법선 1칸 밖', r.hitIn === true && r.hitOut === false);
  expect('실행 중: 물리 점 = 렌더 점 = 실 앵커', r.e2, 0, 1e-9, '칸');
  expect('실행 중: 렌더 모서리 = 충돌 모서리', r.e3, 0, 1e-9, '칸');
  expect('렌더 각도 = 물리 θ', r.angle, r.theta, 1e-12, 'rad');
});

scenario('S17-11', '수능 규격 SVG — 막대·받침·고정 핀·치수선(L 배수)·질량 라벨, 흑백, NaN 없음, 받침이 막대 아래', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    load('lever');
    const svg = buildSceneSVG();
    ({ svg, labels: [...svg.matchAll(/>([^<]+)<\\/text>/g)].map(m => m[1]) })`);
  const svg = r.svg;
  truthy('NaN 없음', !/NaN/.test(svg));
  for (const t of ['L', '3L', '4L', '2 kg', '1.5 kg']) truthy(`라벨 "${t}"`, r.labels.includes(t));
  const colors = [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))"/g)].map(m => m[1]);
  const chromatic = colors.filter(v => {
    const m = /^#([0-9a-fA-F]{6})$/.exec(v);
    if (!m) return false;
    const R = parseInt(m[1].slice(0, 2), 16), G = parseInt(m[1].slice(2, 4), 16), B = parseInt(m[1].slice(4, 6), 16);
    return Math.max(R, G, B) - Math.min(R, G, B) > 8;
  });
  expect('유채색 없음', chromatic.length, 0, 0, '개');
  // 받침 삼각형(꼭짓점 400,400) 이 막대 사각형보다 먼저, 고정 핀 원이 막대보다 나중에
  const iTri = svg.indexOf('M 400 400 L 404 408 L 396 408 Z');
  const iRod = svg.indexOf('M 368 401 L 432 401');
  const iPin = svg.lastIndexOf('A 3.4 3.4');
  truthy('받침 → 막대 → 핀 순서 (꼭짓점이 막대에 가려지고 핀은 위에)', iTri >= 0 && iRod > iTri && iPin > iRod);
});

scenario('S17-12', '공유 링크·실행취소 왕복 — 막대(길이·질량·각도·치수·눈금) · 받침(고정) · 막대 위 실 앵커', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [{ key:'C', x1:44, y1:45, x2:56, y2:45 }],
            elements: [ ful('F', 49, 50, true), rod('R', 7, 3.5, 50.5, 50, { angle0: 0, dims:'L', ticks:7, e:0.3 }),
                        { key:'A', type:'rect', gridX:52.5, gridY:52, mass:1 } ],
            ropes: [['C','s6','R','s5'], ['R','p2','A','top']] });
    const before = measureScene(sceneToData(), { body:'R', q:'theta', at:1 });
    const dec = decodeScene(encodeScene());
    loadSceneData(dec, { history:false });
    const R = STATE.elements.find(e => e.type === 'rod'), F = STATE.elements.find(e => e.type === 'fulcrum');
    ({ L: R.gridW, M: R.mass, dims: R.dims, ticks: R.ticks, e: R.e, pinned: F.pinned,
       contact: fulcrumRodContact(F) && fulcrumRodContact(F).d,
       anchors: STATE.ropes.map(rp => [rp.anchorA.attachPoint, rp.anchorB.attachPoint].join('-')),
       before, after: measureScene(sceneToData(), { body: 'R', q:'theta', at:1 }) })`);
  expect('길이', r.L, 7, 0, 'm'); expect('질량', r.M, 3.5, 0, 'kg'); expect('반발계수', r.e, 0.3, 0, '');
  truthy('치수선 L · 눈금 7', r.dims === 'L' && r.ticks === 7);
  truthy('받침 고정 유지', r.pinned === true);
  expect('받침 접점 다시 감지 (왼쪽 끝에서 2 m)', r.contact, 2, 1e-9, 'm');
  truthy('실 앵커 s6-s5 · p2-top', r.anchors.join(',') === 's6-s5,p2-top');
  expect('복원 전후 물리 동일 (1 s 뒤 각도)', r.after, r.before, 1e-6, '°');
});

scenario('S17-13', '편집 스냅 — 막대 끝 핸들(길이 0.5 m · 각도 5°, 반대 끝 고정) · 막대 → 받침 꼭짓점 · 받침 → 바닥면', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [{ key:'G', x1:30, y1:56, x2:70, y2:56 }], elements: [ rod('R', 6, 2, 50, 50), ful('F', 60, 40) ] });
    const R = K('R'), F = K('F'), out = {};
    const p1 = rodGeometry(R).p1;
    const h = { type: 'p2' };
    _resizeRodEnd(R, h, 47 + 4.1 * Math.cos(0.5), 50 - 4.1 * Math.sin(0.5));   // 약 28.6°, 4.1 m
    const g1 = rodGeometry(R);
    out.L = R.gridW; out.deg = R.angle0; out.p1 = Math.hypot(g1.p1.x - p1.x, g1.p1.y - p1.y);
    _resizeRodEnd(R, h, 47 - 3, 50);                                             // 반대편으로 넘김 → 각도 0, p1·p2 바뀜
    out.flipDeg = R.angle0; out.flipL = R.gridW;
    const g2 = rodGeometry(R); out.fixedKept = Math.min(Math.hypot(g2.p1.x - p1.x, g2.p1.y - p1.y), Math.hypot(g2.p2.x - p1.x, g2.p2.y - p1.y));
    // 받침을 바닥 근처로 → 밑변이 바닥에
    _dragFulcrum(F, 49.6, 55.5 - F.gridH);   // 밑변이 바닥 0.5칸 위 → 자석
    out.fBase = F.gridY + F.gridH;
    // 막대를 받침 꼭짓점 근처로 → 중심선이 꼭짓점을 지나게
    R.angle0 = 0; R.gridW = 6;
    _dragRod(R, 50.1 - 3, (F.gridY - 0.3) - 0.125);
    out.c = fulcrumRodContact(F);
    out.cH = out.c ? Math.abs(out.c.h) : 99;
    out;`);
  expect('끝 핸들: 길이 0.5 단위', r.L, 4, 0, 'm');
  expect('끝 핸들: 각도 5° 단위', r.deg, 30, 0, '°');
  expect('끝 핸들: 반대 끝 고정', r.p1, 0, 1e-9, '칸');
  expect('넘겨도 각도 [−90°, 90°]', r.flipDeg, 0, 0, '°');
  expect('넘겨도 고정 끝 유지', r.fixedKept, 0, 1e-9, '칸');
  expect('받침 밑변 = 바닥면', r.fBase, 56, 1e-9, '칸');
  truthy('막대 중심선이 받침 꼭짓점을 지난다', r.cH < 1e-9);
});

scenario('S17-14', '편집 경고 — 받침·실 없는 막대 / 막대 ↔ 도르래 실 / 받침 위 막대는 경고 없음', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const out = {};
    build({ elements: [ rod('R', 6, 2, 50, 50) ] }); out.lone = STATE.warnings.slice();
    build({ elements: [ rod('R', 6, 2, 50, 50), ful('F', 50, 50) ] }); out.ok = STATE.warnings.slice();
    build({ elements: [ rod('R', 6, 2, 50, 50), ful('F', 50, 50), { key:'P', type:'pulley', gridX:55, gridY:44 } ],
            ropes: [['R','p2','P','left']] }); out.pul = STATE.warnings.slice();
    out`);
  truthy('혼자인 막대 경고', r.lone.includes('막대가 받침에도 실에도 걸려 있지 않습니다'));
  truthy('받침 위 막대: 경고 없음', r.ok.length === 0);
  truthy('막대 ↔ 도르래 실 경고', r.pul.includes('막대에 이은 실은 고정점·물체·막대에만 걸 수 있습니다'));
});

scenario('S17-15', 'POE 돌림힘 문항 — 정답이 시뮬레이션과 맞는다 (6문항)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const ex = id => POE_EXAMPLES.find(e => e.id === id);
    const loadEx = (e) => { if (typeof e.scene === 'string') loadScene(e.scene, { history:false, view:false }); else buildSceneFromSpec(e.scene, { history:false, view:false });
                            if (e.set) for (const k of Object.keys(e.set)) Object.assign(K(k), e.set[k]); return sceneToData(); };
    const out = {};
    let d = loadEx(ex('lever-balance')); out.bal = measureScene(d, { body:'R', q:'theta', at:2 });
    d = loadEx(ex('lever-N')); out.N = measureScene(d, ex('lever-N').answer.measure);
    d = loadEx(ex('supports-N')); out.N1 = measureScene(d, { body:'F1', q:'N', at:1 }); out.N2 = measureScene(d, { body:'F2', q:'N', at:1 });
    d = loadEx(ex('supports-tip')); out.tip = measureScene(d, { body:'R', q:'theta', at:1 });
    d = loadEx(ex('hung-T')); out.T1 = measureScene(d, { body:'R', q:'T1', at:1 }); out.T2 = measureScene(d, { body:'R', q:'T2', at:1 });
    d = loadEx(ex('pivot-end')); out.al = measureScene(d, { body:'R', q:'alpha', at:0.02 }); out.L = K('R').gridW;
    out.cat = POE_EXAMPLES.filter(e => e.cat === 'torque').length;
    out`);
  expect('돌림힘 문항 수', r.cat, 6, 0, '개');
  expect('지레: 기울지 않음', r.bal, 0, 1e-3, '°');
  expect('받침의 힘 = 5.5g', r.N, 5.5 * g, '1%', 'N');
  truthy('두 받침: 오른쪽이 훨씬 크다', r.N2 > 5 * r.N1 && r.N1 > 0);
  truthy('1.5 kg: 넘어간다', r.tip < -5);
  expect('매단 막대: T1 = 2·T2', r.T1 / r.T2, 2, 0.01, '');
  expect('끝 고정: 끝 가속도 = 1.5g', Math.abs(r.al) * r.L, 1.5 * g, '1%', 'm/s²');
});

/* ── 보고 ── */
let pass = 0, fail = 0, err = 0;
const lines = [];
for (const r of results) {
  const bad = r.checks.filter(c => c.ok === false);
  const status = r.error ? 'ERROR' : (bad.length ? 'FAIL' : 'PASS');
  if (r.error) err++; else if (bad.length) fail++; else pass++;
  lines.push(`\n[${status}] ${r.id} — ${r.title}`);
  if (r.error) lines.push('   ' + r.error.split('\n').slice(0, 5).join('\n   '));
  for (const c of r.checks) {
    const fmt = v => (typeof v === 'number' && isFinite(v)) ? (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(3) : v.toFixed(5)) : String(v);
    lines.push(`   ${c.ok ? 'ok  ' : 'XX  '}${c.label}: actual=${fmt(c.actual)} expected=${fmt(c.expected)} tol=${fmt(c.tol)} ${c.unit}`);
  }
}
lines.push('\n=============================================');
lines.push(`PASS ${pass} / FAIL ${fail} / ERROR ${err}  (total ${results.length})`);
console.log(lines.join('\n'));
process.exit(fail + err > 0 ? 1 : 0);
