/* ============================================================
   test/spec14.js — 역학 공식 대조 매트릭스 (자유물체도 힘 값 · 조합 상황)
     기대값은 모두 닫힌형 공식. 시뮬레이터 출력을 기대값으로 재사용하지 않는다.
   실행: node test/spec14.js
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
const G = 9.8;
const RUN = `
  function _begin(){ validateAll(); startSimulation(); }
  function _run(t){ const n = Math.round(t / CONFIG.FIXED_DT); for (let i=0;i<n;i++){ simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; } }
  function K(k){ return STATE.elements.find(e => e._key === k); }
  function mag(v){ return Math.hypot(v[0], v[1]); }
  function build(spec){ buildSceneFromSpec(spec, { history:false, view:false }); }
`;

/* ─────────────── 자유물체도 힘 값 ─────────────── */
scenario('S14-1', '실에 매달려 정지한 물체 — T = mg, 알짜힘 0', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'C', x1:46, y1:40, x2:54, y2:40 }], elements:[{ key:'A', type:'rect', gridX:49.5, gridY:48, mass:2 }], ropes:[['C','s4','A','top']] });
    _begin(); _run(1.0);
    const A = K('A'); ({ T: A._fbd.T.length ? A._fbd.T[0].mag : 0, net: mag(A._fbd.net), v: Math.hypot(A.vx, A.vy), ropeT: STATE.ropes[0]._tension })
  `);
  expect('장력 T = mg', r.T, 2 * G, '1%', 'N');
  expect('실 패널 장력', r.ropeT, 2 * G, '1%', 'N');
  expect('알짜힘 0', r.net, 0, 0.05, 'N');
  truthy('정지', r.v < 0.01);
});

scenario('S14-2', 'V 자 실 두 줄 매달림 — 각 장력 T = mg/(2cosθ)', () => {
  const a = app(); a.evalIn(RUN);
  // 천장 (44,40)-(56,40), 물체 중심 (50, 46): 앵커 x=47,53 → 수평 3, 수직 6 → cosθ = 6/√45
  const r = a.evalIn(`
    build({ floors:[{ key:'C', x1:44, y1:40, x2:56, y2:40 }], elements:[{ key:'A', type:'circle', gridX:49.5, gridY:45.5, mass:3 }],
            ropes:[['C','s3','A','center'], ['C','s9','A','center']] });
    _begin(); _run(1.0);
    const A = K('A'); ({ Ts: A._fbd.T.map(t => t.mag), net: mag(A._fbd.net), v: Math.hypot(A.vx, A.vy) })
  `);
  const cos = 6 / Math.sqrt(45);
  truthy('실 2개 장력 기록', r.Ts.length === 2);
  expect('T₁ = mg/(2cosθ)', r.Ts[0], 3 * G / (2 * cos), '2%', 'N');
  expect('T₂ = mg/(2cosθ)', r.Ts[1], 3 * G / (2 * cos), '2%', 'N');
  truthy('정지', r.v < 0.02);
});

scenario('S14-3', '두 물체 적층 (e=0) — 아래 물체 수직항력 = (m₁+m₂)g, 위 물체가 받는 접촉력 = m₂g', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'F', x1:40, y1:60, x2:60, y2:60 }], elements:[
      { key:'A', type:'rect', gridX:50, gridY:59, mass:2, e:0 }, { key:'B', type:'rect', gridX:50, gridY:58, mass:1, e:0 } ] });
    _begin(); _run(1.5);
    const A = K('A'), B = K('B');
    ({ NA: mag(A._fbd.N), cA: A._fbd.bodyContact ? mag(A._fbd.bodyContact) : null, cB: B._fbd.bodyContact ? mag(B._fbd.bodyContact) : null,
       otherA: mag(A._fbd.other), otherB: mag(B._fbd.other), yB: B.physY, vB: Math.abs(B.vy) })
  `);
  expect('A 수직항력 = (2+1)g', r.NA, 3 * G, '3%', 'N');
  expect('A 가 B 에게서 받는 접촉력 = m_B g', r.cA, 1 * G, '5%', 'N');
  expect('B 가 A 에게서 받는 접촉력 = m_B g', r.cB, 1 * G, '5%', 'N');
  truthy('기타 잔차 작음', r.otherA < 0.5 && r.otherB < 0.5);
  truthy('B 정지', r.vB < 0.05 && Math.abs(r.yB - 41) < 0.05);
});

scenario('S14-4', '움직도르래 — 장력 T = m(g−a), a = g(2m−M)/(2m+M/2)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('movable-pulley', { history:false, view:false });
    _begin(); _run(0.8);
    const M = K('M'), L = K('L');
    ({ aM: Math.abs(M._ayMeas), aL: Math.abs(L._ayMeas), TM: M._fbd.T[0].mag, TL: L._fbd.T[0].mag, ropeTs: STATE.ropes.filter(r=>r._tension!=null).map(r=>r._tension) })
  `);
  const m = 1.5, M = 2;
  const acc = G * (2 * m - M) / (2 * m + M / 2);
  const T = m * (G - acc);
  expect('매단 물체 가속도', r.aM, acc, '3%', 'm/s²');
  expect('하중 가속도 = a/2', r.aL, acc / 2, '4%', 'm/s²');
  expect('매단 물체 실 장력 T = m(g−a)', r.TM, T, '3%', 'N');
  expect('하중 실 장력 = 2T (움직도르래 중심 실)', r.TL, 2 * T, '4%', 'N');
});

scenario('S14-5', '빗면 구름 원판 (미끄럼 없음) — a = ⅔g sinθ, f = ⅓mg sinθ, N = mg cosθ', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'S', x1:38, y1:62, x2:62, y2:50, isFriction:true, muS:0.6, muK:0.5 }, { key:'G', x1:26, y1:62, x2:38, y2:62 }],
            elements:[{ key:'A', type:'circle', mass:2, onFloor:{ floor:'S', x:56 } }] });
    _begin(); _run(1.0);
    const A = K('A'); ({ a: Math.hypot(A._axMeas, A._ayMeas), f: mag(A._fbd.f), N: mag(A._fbd.N), slip: Math.abs(Math.hypot(A.vx, A.vy) - Math.abs(A.omega) * 0.5), v: Math.hypot(A.vx, A.vy) })
  `);
  const th = Math.atan(0.5);
  expect('가속도 ⅔ g sinθ', r.a, (2 / 3) * G * Math.sin(th), '3%', 'm/s²');
  expect('마찰력 ⅓ mg sinθ', r.f, (1 / 3) * 2 * G * Math.sin(th), '4%', 'N');
  expect('수직항력 mg cosθ', r.N, 2 * G * Math.cos(th), '2%', 'N');
  truthy('미끄럼 없음 |v − ωr| ≈ 0', r.slip < 0.05 * r.v);
});

scenario('S14-6', '수평 마찰면 미끄러짐 — N = mg, f = μk mg, a = μk g', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'F', x1:30, y1:60, x2:80, y2:60, isFriction:true, muS:0.4, muK:0.3 }], elements:[{ key:'A', type:'rect', gridX:36, gridY:59, mass:3, vx0:6 }] });
    _begin(); _run(0.5);
    const A = K('A'); ({ N: mag(A._fbd.N), f: mag(A._fbd.f), a: Math.abs(A._axMeas), slip: A._fbd.slipping })
  `);
  expect('N = mg', r.N, 3 * G, '1%', 'N');
  expect('f = μk mg', r.f, 0.3 * 3 * G, '1%', 'N');
  expect('a = μk g', r.a, 0.3 * G, '2%', 'm/s²');
  truthy('운동 마찰 판정', r.slip === true);
});

scenario('S14-7', '외력 → 도르래 경유 → 매달린 물체: F > mg 이면 a = (F − mg)/m', () => {
  const a = app(); a.evalIn(RUN);
  // 천장에 고정 도르래, 왼쪽 림에서 물체 아래로, 오른쪽 림에서 외력이 아래로 당김
  const r = a.evalIn(`
    build({ floors:[{ key:'C', x1:46, y1:37, x2:54, y2:37 }], elements:[
      { key:'P', type:'pulley', gridX:49, gridY:40 }, { key:'A', type:'rect', gridX:48.5, gridY:48, mass:1 }, { key:'E', type:'extforce', gridX:50.5, gridY:52, forceN:15 } ],
      ropes:[['P','center','C','s4'], ['A','top','P','left'], ['E','center','P','right']] });
    _begin(); _run(0.5);
    const A = K('A'); ({ a: A._ayMeas, v: A.vy })
  `);
  expect('a = (F − mg)/m', r.a, (15 - G) / 1, '5%', 'm/s²');
  truthy('위로 올라감', r.v > 0.5);
});

scenario('S14-8', '두 물체를 실로 이어 외력으로 끌기 (마찰면) — a = (F − μ(m₁+m₂)g)/(m₁+m₂), T = m₂(a + μg)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'F', x1:20, y1:60, x2:90, y2:60, isFriction:true, muS:0.3, muK:0.2 }], elements:[
      { key:'B', type:'rect', gridX:44, gridY:59, mass:1 }, { key:'A', type:'rect', gridX:48, gridY:59, mass:2 }, { key:'E', type:'extforce', gridX:53.5, gridY:59, forceN:20 } ],
      ropes:[['B','right','A','left'], ['A','right','E','center']] });
    _begin(); _run(0.6);
    const A = K('A'), B = K('B');
    ({ aA: A._axMeas, aB: B._axMeas, TB: B._fbd.T.length ? B._fbd.T[0].mag : 0, fB: mag(B._fbd.f), ext: mag(A._fbd.applied) })
  `);
  const mu = 0.2, m1 = 2, m2 = 1, F = 20;
  const acc = (F - mu * (m1 + m2) * G) / (m1 + m2);
  expect('A 가속도', r.aA, acc, '4%', 'm/s²');
  expect('B 가속도 = A 가속도', r.aB, acc, '4%', 'm/s²');
  expect('뒤 물체 장력 T = m₂(a + μg)', r.TB, m2 * (acc + mu * G), '5%', 'N');
  expect('뒤 물체 마찰 μ m₂ g', r.fB, mu * m2 * G, '3%', 'N');
  expect('외력 20 N 기록', r.ext, 20, 0.01, 'N');
});

scenario('S14-9', '공기저항 F = −bv — 종단속도 mg/b, 시간상수 m/b, 저항력 = b·v', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'F', x1:34, y1:99, x2:72, y2:99 }], elements:[{ key:'A', type:'circle', gridX:50, gridY:2, mass:2, drag:2, e:0 }] });
    _begin();
    const A = K('A'); _run(1.0); const v1 = Math.abs(A.vy), F1 = mag(A._fbd.applied);
    _run(2.0); const v3 = Math.abs(A.vy);
    _run(5.0); const vt = Math.abs(A.vy);
    ({ v1, F1, v3, vt })
  `);
  const m = 2, b = 2, tau = m / b, vT = m * G / b;
  expect('v(1 s) = v_t(1 − e^{−t/τ})', r.v1, vT * (1 - Math.exp(-1 / tau)), '2%', 'm/s');
  expect('v(3 s)', r.v3, vT * (1 - Math.exp(-3 / tau)), '2%', 'm/s');
  expect('종단속도 mg/b', r.vt, vT, '1%', 'm/s');
  expect('저항력 = b·v (1 s)', r.F1, b * r.v1, '3%', 'N');
});

scenario('S14-10', '수직 용수철 + 중력 — 평형 늘어남 mg/k, 주기 2π√(m/k), 최대 늘어남 2mg/k', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'C', x1:46, y1:40, x2:54, y2:40 }], elements:[
      { key:'S', type:'spring', gridX:49, gridY:40, gridW:1, gridH:3, isVertical:true, k:20, L0:3, left:'C', right:'A' },
      { key:'A', type:'rect', gridX:49, gridY:43, mass:1 } ] });
    _begin();
    const A = K('A'), S = K('S'); const y0 = A.physY;
    let ymin = Infinity, prev = A.vy, cross = [], t = 0;
    for (let i = 0; i < 600; i++) { simStep(CONFIG.FIXED_DT); t += CONFIG.FIXED_DT; ymin = Math.min(ymin, A.physY); if (prev < 0 && A.vy >= 0) cross.push(t); prev = A.vy; }
    let sumY = 0, n = 0; for (let i = 0; i < 240; i++) { simStep(CONFIG.FIXED_DT); sumY += A.physY; n++; }
    ({ drop: y0 - ymin, meanDrop: y0 - sumY / n, period: cross.length >= 2 ? cross[1] - cross[0] : NaN, L0: S.L0 })
  `);
  expect('최대 늘어남 2mg/k', r.drop, 2 * G / 20, '4%', 'm');
  expect('평균 위치 = 평형 mg/k', r.meanDrop, G / 20, '8%', 'm');
  expect('주기 2π√(m/k)', r.period, 2 * Math.PI * Math.sqrt(1 / 20), '3%', 's');
});

scenario('S14-11', '진자 45° — 주기 (타원적분 보정) T = 2π√(L/g)·1.0400, 장력 최저점 mg(3−2cosθ₀)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('pendulum', { history:false, view:false });
    _begin();
    const A = K('A'); let prev = A.vx, cross = [], t = 0, Tmax = 0, T0 = null;
    for (let i = 0; i < 900; i++) { simStep(CONFIG.FIXED_DT); t += CONFIG.FIXED_DT; if (T0 === null && A._fbd.T.length) T0 = A._fbd.T[0].mag; if (A._fbd.T.length) Tmax = Math.max(Tmax, A._fbd.T[0].mag); if (prev < 0 && A.vx >= 0) cross.push(t); prev = A.vx; }
    ({ period: cross.length >= 2 ? cross[1] - cross[0] : NaN, T0, Tmax })
  `);
  const T0 = 2 * Math.PI * Math.sqrt(8 / G);
  expect('주기 (45° 보정 1.0400)', r.period, T0 * 1.0400, '1.5%', 's');
  expect('놓는 순간 장력 ≈ mg cos45°', r.T0, G * Math.cos(Math.PI / 4), '6%', 'N');
  expect('최저점 장력 mg(3 − 2cos45°)', r.Tmax, G * (3 - 2 * Math.cos(Math.PI / 4)), '3%', 'N');
});

scenario('S14-12', '테이블 위 물체(마찰) + 도르래 + 매달린 물체 — a = (m₂g − μ m₁g)/(m₁+m₂), T = m₂(g − a)', () => {
  const a = app(); a.evalIn(RUN);
  // 테이블 (30,60)-(52,60) 오른쪽 끝에 고정 도르래 (rim left 가 테이블 높이 물체 옆면과 나란히)
  const r = a.evalIn(`
    build({ floors:[{ key:'T', x1:30, y1:60, x2:52, y2:60, isFriction:true, muS:0.3, muK:0.2 }, { key:'C', x1:52, y1:56, x2:58, y2:56 }],
      elements:[{ key:'P', type:'pulley', gridX:52, gridY:58.5 }, { key:'A', type:'rect', gridX:46, gridY:59, mass:2 }, { key:'B', type:'rect', gridX:53.5, gridY:64, mass:1.5 }],
      ropes:[['P','center','C','s1'], ['A','right','P','left'], ['P','right','B','top']] });
    _begin(); _run(0.6);
    const A = K('A'), B = K('B');
    ({ aA: A._axMeas, aB: -B._ayMeas, TB: B._fbd.T.length ? B._fbd.T[0].mag : 0, fA: mag(A._fbd.f), NA: mag(A._fbd.N) })
  `);
  const m1 = 2, m2 = 1.5, mu = 0.2;
  const acc = (m2 * G - mu * m1 * G) / (m1 + m2);
  expect('테이블 물체 가속도', r.aA, acc, '5%', 'm/s²');
  expect('매달린 물체 가속도 같음', r.aB, acc, '5%', 'm/s²');
  expect('장력 T = m₂(g − a)', r.TB, m2 * (G - acc), '4%', 'N');
  expect('마찰 μ m₁ g', r.fA, mu * m1 * G, '3%', 'N');
  expect('N = m₁ g', r.NA, m1 * G, '2%', 'N');
});

scenario('S14-13', '수직 벽 반발 — e = 0.5 이면 되튀는 속도 절반, 수평 성분만 바뀜', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ g:false, floors:[{ key:'W', x1:60, y1:70, x2:60, y2:50 }], elements:[{ key:'A', type:'rect', gridX:50, gridY:59, mass:1, vx0:4, vy0:1, e:0.5 }] });
    _begin(); _run(4.0);
    const A = K('A'); ({ vx: A.vx, vy: A.vy })
  `);
  expect('되튄 vx = −e·v', r.vx, -2, 0.03, 'm/s');
  expect('vy 변화 없음(마찰 없는 벽)', r.vy, 1, 0.03, 'm/s');
});

scenario('S14-14', '둘 다 움직이는 정면 탄성 충돌 — v₁′, v₂′ 일반식', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors:[{ key:'F', x1:30, y1:60, x2:80, y2:60 }], elements:[
      { key:'A', type:'circle', gridX:40, gridY:59, mass:2, vx0:3, e:1 }, { key:'B', type:'circle', gridX:60, gridY:59, mass:1, vx0:-2, e:1 } ] });
    _begin(); _run(6.0);
    ({ vA: K('A').vx, vB: K('B').vx })
  `);
  const m1 = 2, m2 = 1, u1 = 3, u2 = -2;
  const v1 = ((m1 - m2) * u1 + 2 * m2 * u2) / (m1 + m2), v2 = ((m2 - m1) * u2 + 2 * m1 * u1) / (m1 + m2);
  expect('v₁′', r.vA, v1, 0.05, 'm/s');
  expect('v₂′', r.vB, v2, 0.05, 'm/s');
});

scenario('S14-15', '무중력 + 공기저항 — 속도 지수 감쇠 v = v₀e^{−bt/m}', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ g:false, elements:[{ key:'A', type:'circle', gridX:50, gridY:50, mass:2, vx0:6, drag:0.5 }] });
    _begin(); _run(2.0); const v2 = K('A').vx; _run(2.0); const v4 = K('A').vx; ({ v2, v4 })
  `);
  expect('v(2 s)', r.v2, 6 * Math.exp(-0.5 * 2 / 2), '1%', 'm/s');
  expect('v(4 s)', r.v4, 6 * Math.exp(-0.5 * 4 / 2), '1%', 'm/s');
});

scenario('S14-16', '힘구간 수직 힘 — a = F/m − g, 자유물체도 외력 = F', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ elements:[{ key:'Z', type:'forceZone', gridX:40, gridY:20, gridW:20, gridH:60, fx:0, fy:30 }, { key:'A', type:'rect', gridX:50, gridY:50, mass:2 }] });
    _begin(); _run(0.5);
    const A = K('A'); ({ a: A._ayMeas, F: mag(A._fbd.applied), net: mag(A._fbd.net) })
  `);
  expect('a = F/m − g', r.a, 30 / 2 - G, '1%', 'm/s²');
  expect('외력 30 N', r.F, 30, 0.01, 'N');
  expect('알짜힘 = F − mg', r.net, 30 - 2 * G, '1%', 'N');
});

scenario('S14-17', '마찰 없는 빗면 — a = g sinθ, N = mg cosθ, 가속 방향 = 빗면 아래', () => {
  const a = app(); a.evalIn(RUN);
  // 빗면 오른쪽 위로 오르는 면(38,62)-(62,50), 벽(62,44)-(62,50)? 대신: 수평 용수철 대신 빗면 방향 용수철은 없음 → 평형 대신 진동 중심으로 검사
  const r = a.evalIn(`
    build({ floors:[{ key:'S', x1:38, y1:62, x2:62, y2:50 }], elements:[{ key:'A', type:'rect', mass:2, onFloor:{ floor:'S', x:50 } }] });
    _begin(); _run(0.4);
    const A = K('A'); ({ a: Math.hypot(A._axMeas, A._ayMeas), N: mag(A._fbd.N), f: mag(A._fbd.f), dir: Math.atan2(A._ayMeas, A._axMeas) })
  `);
  const th = Math.atan(0.5);
  expect('마찰 없는 빗면 a = g sinθ', r.a, G * Math.sin(th), '2%', 'm/s²');
  expect('N = mg cosθ', r.N, 2 * G * Math.cos(th), '2%', 'N');
  expect('마찰 0', r.f, 0, 0.02, 'N');
  expect('가속 방향 = 빗면 아래 (−x, −y 로 θ)', r.dir, -Math.PI + th, 0.03, 'rad');
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
