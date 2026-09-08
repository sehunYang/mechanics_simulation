/* ============================================================
   test/spec16.js — 클로소이드 이음 (joints.js)
     적격 판정·이유, 접선 연속(꺾임 < 10°), 날카로운 모서리는 튀고 이음은 안 튐(무충격),
     에너지 보존, 구름 유지, 오목 이음의 N 증가, 볼록 꼭대기의 접촉 유지 · 이탈 조건 v² > g(R+r),
     토글·공유 링크 왕복.
   실행: node test/spec16.js
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

const RUN = `
  function K(k){ return STATE.elements.find(e => e._key === k); }
  function F(k){ return STATE.floorSegments.find(s => s._key === k); }
  function build(spec){ buildSceneFromSpec(spec, { history:false, view:false }); }
  function load(id){ loadScene(id, { history:false, view:false }); return sceneToData(); }
  function maxTurnDeg(pts){
    let m = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = { x: pts[i].x - pts[i-1].x, y: pts[i].y - pts[i-1].y }, b = { x: pts[i+1].x - pts[i].x, y: pts[i+1].y - pts[i].y };
      const ang = Math.abs(Math.atan2(a.x*b.y - a.y*b.x, a.x*b.x + a.y*b.y)) * 180 / Math.PI;
      if (ang > m) m = ang;
    }
    return m;
  }
  var JB = { floors: [
      { key: 'S', x1: 38, y1: 62, x2: 62, y2: 50, isFriction: true, muS: 0.6, muK: 0.5 },
      { key: 'G', x1: 20, y1: 62, x2: 38, y2: 62, isFriction: true, muS: 0.6, muK: 0.5 } ],
    elements: [{ key: 'A', type: 'circle', mass: 1, e: 1, onFloor: { floor: 'S', x: 56 } }] };
  var SMOOTH = { S: { smoothP1: true }, G: { smoothP2: true } };
`;

scenario('S16-1', '적격 판정 — 언덕 장면 이음 3개 (오목 26.6° · 볼록 53.1° · 오목 26.6°), R, 접선 길이 상한', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    load('hill');
    const J = floorJoints();
    ({ n: J.length, allOn: J.every(j => j.on && j.eligible),
       deg: J.map(j => j.deg), concave: J.map(j => j.concave), R: J.map(j => j.R), T: J.map(j => j.T),
       Mtop: Math.max(...floorPathPhys(F('A')).map(p => p.y)) })
  `);
  expect('이음 3개', r.n, 3, 0, '개');
  truthy('모두 적격·ON', r.allOn);
  expect('G1–A 꺾임각', r.deg[0], Math.atan2(8, 16) * 180 / Math.PI, 0.05, '°');
  expect('A–B 꺾임각', r.deg[1], 2 * Math.atan2(8, 16) * 180 / Math.PI, 0.05, '°');
  truthy('G1–A 오목 · A–B 볼록 · B–G2 오목', r.concave[0] === true && r.concave[1] === false && r.concave[2] === true);
  truthy('접선 길이 ≤ 5칸 · ≤ 0.4×짧은 면', r.T.every(t => t <= 5 + 1e-9) && r.T[0] <= 0.4 * 8 + 1e-9);
  truthy('볼록 꼭대기 R 이 오목 이음 R 보다 작다 (같은 T, 큰 Δθ)', r.R[1] < r.R[0] && r.R[1] < r.R[2]);
  truthy('꼭대기 M 은 정점(56) 아래', r.Mtop < 56 && r.Mtop > 54.5);
});

scenario('S16-2', '부적격 — 일직선(0°) · 끝점이 닿지 않는 두 면 · 너무 큰 원(R 조건)은 이음이 없다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [
      { key: 'A', x1: 10, y1: 60, x2: 30, y2: 60 }, { key: 'B', x1: 30, y1: 60, x2: 50, y2: 60 },
      { key: 'C', x1: 60, y1: 60, x2: 70, y2: 60 }, { key: 'D', x1: 70, y1: 60, x2: 80, y2: 58 },
      { key: 'E', x1: 10, y1: 80, x2: 30, y2: 80 }, { key: 'F', x1: 31, y1: 80, x2: 50, y2: 70 } ],
      elements: [{ key: 'X', type: 'circle', mass: 1, gridX: 12, gridY: 50 }] });
    const J = floorJoints();
    const j = (k1, k2) => J.find(x => (x.a === F(k1) && x.b === F(k2)) || (x.a === F(k2) && x.b === F(k1)));
    const ab = j('A','B'), cd = j('C','D'), ef = j('E','F');
    const r1 = { abEligible: !!(ab && ab.eligible), abReason: ab ? ab.reason : '(none)', cdEligible: !!(cd && cd.eligible), efNull: !ef };
    build({ floors: [ { key: 'P', x1: 20, y1: 60, x2: 40, y2: 60 }, { key: 'Q', x1: 40, y1: 60, x2: 60, y2: 40 } ],
            elements: [{ key: 'Y', type: 'circle', gridW: 14, gridH: 14, mass: 1, gridX: 10, gridY: 30 }] });
    const q = floorJoints()[0];
    r1.big = { eligible: q.eligible, reason: q.reason, deg: q.deg };
    r1
  `);
  truthy('일직선(0°)은 부적격', !r.abEligible);
  truthy('부적격 이유 문구가 있다', typeof r.abReason === 'string' && r.abReason.length > 0);
  truthy('11.3° 는 적격', r.cdEligible);
  truthy('끝점이 떨어진 두 면은 이음 없음', r.efNull);
  truthy('큰 원(r=7) 이 있으면 R 조건으로 부적격', !r.big.eligible && r.big.reason.length > 0);
});

scenario('S16-3', '경로 — 접선 연속(꺾임 < 10°) · 이웃 경로가 M 에서 정확히 이어짐 · 토글 OFF/ON', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    load('hill');
    const pA = floorPathPhys(F('A')), pB = floorPathPhys(F('B')), pG1 = floorPathPhys(F('G1'));
    const endA = pA[pA.length - 1], startB = pB[0], endG1 = pG1[pG1.length - 1], startA = pA[0];
    const before = { nA: pA.length, turnA: maxTurnDeg(pA), turnB: maxTurnDeg(pB),
      gapAB: Math.hypot(endA.x - startB.x, endA.y - startB.y), gapG1A: Math.hypot(endG1.x - startA.x, endG1.y - startA.y),
      whole: maxTurnDeg(pG1.concat(pA.slice(1), pB.slice(1))), smoothedA: floorIsSmoothed(F('A')) };
    setJointSmooth(F('A'), 'p2', false);
    const off = { on: jointAt(F('A'), 'p2').on, bFlag: F('B').smoothP1, nA: floorPathPhys(F('A')).length, nB: floorPathPhys(F('B')).length,
                  stillG1A: jointAt(F('A'), 'p1').on };
    setJointSmooth(F('A'), 'p2', true);
    const back = { on: jointAt(F('A'), 'p2').on, nA: floorPathPhys(F('A')).length };
    ({ before, off, back })
  `);
  truthy('A 경로는 미세 선분 (점 > 2)', r.before.nA > 2 && r.before.smoothedA);
  truthy('A·B 경로 꺾임 최대 < 10°', r.before.turnA < 10 && r.before.turnB < 10);
  expect('A 끝 = B 시작 (M)', r.before.gapAB, 0, 1e-9, 'm');
  expect('G1 끝 = A 시작 (M)', r.before.gapG1A, 0, 1e-9, 'm');
  truthy('G1→A→B 전체 사슬도 꺾임 < 10°', r.before.whole < 10);
  truthy('OFF: 양쪽 플래그 함께 꺼짐', !r.off.on && r.off.bFlag === false);
  truthy('OFF 뒤 A 는 G1 쪽 이음만, B 는 G2 쪽만 남는다', r.off.stillG1A && r.off.nA > 2 && r.off.nB > 2);
  truthy('다시 ON', r.back.on && r.back.nA === r.before.nA);
});

scenario('S16-4', '무충격 — 날카로운 27° 모서리(e=1)는 튀고, 클로소이드 이음은 튀지 않는다 (POE joint-bounce)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build(JB); const d = sceneToData();
    const vyMax = (set) => measureScene(applyVariant(d, set), { body:'A', q:'vy', stat:'max', T: 4 });
    // 모서리 도달 t ≈ 3.7 s, 바닥면 G 끝(x = 20) 도달 ≈ 5.4 s → 5 s 까지 공중 체류 시간
    const airSharp  = measureScene(d, { body:'A', q:'air', stat:'sum', T: 5 });
    const airSmooth = measureScene(applyVariant(d, SMOOTH), { body:'A', q:'air', stat:'sum', T: 5 });
    const item = POE_EXAMPLES.find(i => i.id === 'joint-bounce');
    ({ sharp: vyMax(null), smooth: vyMax(SMOOTH), airSharp, airSmooth,
       poeSharp: measureScene(d, item.measure), poeSmooth: measureScene(applyVariant(d, item.variants[1].set), item.measure),
       correct: item.options.findIndex(o => o.correct) })
  `);
  truthy('날카로운 모서리: 위로 튐 (vy max > 1 m/s)', r.sharp > 1);
  expect('이음: vy max ≈ 0', r.smooth, 0, 0.05, 'm/s');
  truthy('날카로운 모서리: 공중 체류 > 0.3 s', r.airSharp > 0.3);
  expect('이음: 공중 체류 0', r.airSmooth, 0, 1e-9, 's');
  truthy('POE 측정값도 같은 결론', r.poeSharp > 1 && r.poeSmooth < 0.05);
  expect('정답 = "튀어 오른다"', r.correct, 0, 0, '');
});

scenario('S16-5', '이음 위 에너지·구름 — 이음 통과 뒤 에너지 손실 < 2%, 구름 조건 v = rω 유지, 오목 이음에서 N > mg', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build(JB); const d = applyVariant(sceneToData(), SMOOTH);
    let E0 = null, Nmax = 0, Nflat = 0;
    const res = simulateHeadless(d, { T: 5, sample(els, t) {
      const A = els[0]; const E = 0.5 * A.mass * (A.vx*A.vx + A.vy*A.vy) + 0.5 * (0.5 * A.mass * 0.25) * A.omega * A.omega + A.mass * 9.8 * A.physY;
      if (t > 0.05 && E0 === null) E0 = E;
      const N = A._fbd ? Math.hypot(A._fbd.N[0], A._fbd.N[1]) : 0;
      if (N > Nmax) Nmax = N;
      return { t, E, x: A.physX, N, slip: (-A.vx) - 0.5 * A.omega };   // 접선 (−1, 0): v_t − rω
    } });
    const onFlat = res.samples.filter(s => s.x < 33 && s.x > 22);   // 이음(접점 x = 33)을 완전히 지난 평지
    const last = onFlat[onFlat.length - 1];
    ({ E0, E1: last.E, Nmax, Nflat: onFlat.reduce((a, s) => a + s.N, 0) / onFlat.length, slipFlat: Math.max(...onFlat.map(s => Math.abs(s.slip))), nFlat: onFlat.length })
  `);
  truthy('평지 구간 표본 존재', r.nFlat > 10);
  expect('에너지 손실 < 2%', r.E1, r.E0, '2%', 'J');
  expect('평지에서 구름 조건 |v − rω| ≈ 0', r.slipFlat, 0, 0.05, 'm/s');
  expect('평지 평균 N = mg', r.Nflat, 9.8, 0.3, 'N');
  truthy('오목 이음 통과 중 N 최대 > 1.3 mg (mv²/R 추가)', r.Nmax > 9.8 * 1.3);
});

scenario('S16-6', '볼록 꼭대기 — 13 m/s 는 면을 따라감(체류 0) · 15·18 m/s 는 떠오름 · 한계 √(g(R+r)) (POE hill-leave)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('hill');
    const J = floorJoints()[1]; const R = J.R, rr = K('A').gridW / 2;
    const air = (v) => measureScene(applyVariant(d, { A: { vx0: v } }), { body:'A', q:'air', stat:'sum', T: 3.8 });
    const vTop = (v) => measureScene(applyVariant(d, { A: { vx0: v } }), { body:'A', q:'v', stat:'min', T: 3.8 });
    let sumN = 0, nN = 0;
    simulateHeadless(d, { T: 3.8, sample(els, t) { const A = els[0]; if (A.physX > 44 && A.physX < 48 && A._fbd) { sumN += Math.hypot(A._fbd.N[0], A._fbd.N[1]); nN++; } } });
    const item = POE_EXAMPLES.find(i => i.id === 'hill-leave');
    ({ R, rr, vLimit: Math.sqrt(9.8 * (R + rr)), a13: air(13), a15: air(15), a18: air(18), v13: vTop(13), v15: vTop(15),
       Nmean: sumN / nN, nN,
       poe: item.variants.map(v => measureScene(applyVariant(d, v.set || {}), item.measure)), correct: item.options.findIndex(o => o.correct) })
  `);
  expect('꼭대기 R ≈ 5.11', r.R, 5.11, 0.05, 'm');
  expect('13 m/s: 공중 체류 0', r.a13, 0, 1e-9, 's');
  truthy('15 m/s: 떠오름 (체류 > 0.5 s)', r.a15 > 0.5);
  truthy('18 m/s: 더 오래 떠 있음', r.a18 > r.a15);
  truthy('13 m/s 꼭대기 속력 < √(g(R+r))', r.v13 < r.vLimit);
  truthy('15 m/s 최저 속력 > √(g(R+r)) (떠오른 상태)', r.v15 > r.vLimit);
  const nTop = 1 * (9.8 - r.v13 * r.v13 / (r.R + r.rr));
  truthy('꼭대기 부근 평균 N: m(g − v²/(R+r)) − 0.5 ≤ N̄ < mg', r.Nmean >= nTop - 0.5 && r.Nmean < 9.8 && r.nN > 20);
  truthy('POE 비교표: 13 → 0, 15·18 → > 0', r.poe[0] === 0 && r.poe[1] > 0.5 && r.poe[2] > 0.5);
  expect('정답 = 첫 보기', r.correct, 0, 0, '');
});

scenario('S16-7', '공유 링크 왕복 — smoothP1/P2 플래그와 이음 물리가 보존된다 · DSL smooth 키', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build(JB); setJointSmooth(F('S'), 'p1', true);
    const before = sceneToData();
    const str = encodeScene(before);
    const data = decodeScene(str);
    const fs = data.floorSegments;
    const S = fs.find(s => s._key === 'S'), G = fs.find(s => s._key === 'G');
    const vyBefore = measureScene(before, { body:'A', q:'vy', stat:'max', T: 4 });
    const vyAfter  = measureScene(data,   { body:'A', q:'vy', stat:'max', T: 4 });
    load('incline'); const inc = { s1: F('S').smoothP1, s2: F('S').smoothP2, on: !!(jointAt(F('S'), 'p1') && jointAt(F('S'), 'p1').on) };
    ({ hasStr: str.length > 0, sP1: S.smoothP1, gP2: G.smoothP2, vyBefore, vyAfter, inc })
  `);
  truthy('인코딩 문자열 생성', r.hasStr);
  truthy('복원된 S.smoothP1 · G.smoothP2 = true', r.sP1 === true && r.gP2 === true);
  expect('복원 전후 물리 동일 (vy max, 좌표 1e-4 반올림)', r.vyAfter, r.vyBefore, 0.01, 'm/s');
  expect('둘 다 튀지 않음', r.vyAfter, 0, 0.05, 'm/s');
  truthy('DSL smooth:true → 양 끝 플래그 · 이음 ON', r.inc.s1 && r.inc.s2 && r.inc.on);
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
