/* ============================================================
   test/spec15.js — 포물선 · 원운동 · 수직 원운동 · 회전 낙하 (스핀 → 병진)
     기대값은 닫힌형 공식. 새 장면(projectile · circular · spin-drop)과 POE 문항의 정합도 검사.
   실행: node test/spec15.js
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
  function K(k){ return STATE.elements.find(e => e._key === k); }
  function mag(v){ return Math.hypot(v[0], v[1]); }
  function build(spec){ buildSceneFromSpec(spec, { history:false, view:false }); }
  function load(id){ loadScene(id, { history:false, view:false }); return sceneToData(); }
`;

scenario('S15-1', '포물선 (8, 8) m/s — 사거리 v²sin2θ/g · 최고점 (vy₀)²/2g · 체공 2vy₀/g · 최고점 vx 불변', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('projectile');
    ({ R: measureScene(d, { body:'A', q:'x', when:'floor', stat:'dist', T: 4 }),
       H: measureScene(d, { body:'A', q:'y', stat:'max', T: 3 }) - (100 - 69.5),
       tf: measureScene(d, { body:'A', q:'v', when:'floor', stat:'time', T: 4 }),
       vxApex: measureScene(d, { body:'A', q:'vx', at: 8 / 9.8 }),
       vyApex: measureScene(d, { body:'A', q:'vy', at: 8 / 9.8 }) })
  `);
  expect('사거리 R = 2vx vy/g', r.R, 2 * 8 * 8 / G, '2%', 'm');
  expect('최고점 높이 vy²/2g', r.H, 64 / (2 * G), '2%', 'm');
  expect('체공 시간 2vy/g', r.tf, 16 / G, 0.02, 's');
  expect('최고점 vx = 8 (불변)', r.vxApex, 8, 1e-6, 'm/s');
  expect('최고점 vy ≈ 0', r.vyApex, 0, 0.1, 'm/s');
});

scenario('S15-2', '30° / 45° / 60° 사거리 — 같은 속력이면 30° = 60° < 45°', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('projectile');
    const R = (vx, vy) => measureScene(applyVariant(d, { A: { vx0: vx, vy0: vy } }), { body:'A', q:'x', when:'floor', stat:'dist', T: 4 });
    ({ r30: R(9.8, 5.66), r45: R(8, 8), r60: R(5.66, 9.8) })
  `);
  expect('30° 사거리', r.r30, 2 * 9.8 * 5.66 / G, '2.5%', 'm');
  expect('60° 사거리 = 30°', r.r60, r.r30, '2%', 'm');
  truthy('45° 가 최대', r.r45 > r.r30 && r.r45 > r.r60);
});

scenario('S15-3', '무중력 원운동 — 장력 mv²/r, 속력 일정, 반지름 유지, 주기 2πr/v', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('circular');
    const res = simulateHeadless(d, { T: 11, sample(els, t) { const A = els[0]; return [t, Math.hypot(A.physX - 50, A.physY - 50), Math.hypot(A.vx, A.vy), A.vy, A._fbd && A._fbd.T.length ? A._fbd.T[0].mag : 0]; } });
    const s = res.samples;
    const cross = []; for (let i = 1; i < s.length; i++) if (s[i-1][3] < 0 && s[i][3] >= 0) cross.push(s[i][0]);
    ({ rMin: Math.min(...s.map(x => x[1])), rMax: Math.max(...s.map(x => x[1])), vMin: Math.min(...s.map(x => x[2])), vMax: Math.max(...s.map(x => x[2])),
       T: s[Math.round(s.length/2)][4], T10: measureScene(applyVariant(d, { A: { vy0: 10 } }), { body:'A', q:'T', at: 2 }), period: cross.length >= 2 ? cross[1] - cross[0] : NaN })
  `);
  expect('반지름 4 유지 (최소)', r.rMin, 4, 0.01, 'm');
  expect('반지름 4 유지 (최대)', r.rMax, 4, 0.01, 'm');
  expect('속력 일정 (최소)', r.vMin, 5, 0.01, 'm/s');
  expect('속력 일정 (최대)', r.vMax, 5, 0.01, 'm/s');
  expect('장력 = mv²/r', r.T, 25 / 4, '1%', 'N');
  expect('속력 2배 → 장력 4배', r.T10, 100 / 4, '1%', 'N');
  expect('주기 2πr/v', r.period, 2 * Math.PI * 4 / 5, '1.5%', 's');
});

scenario('S15-4', '수직 원운동 L=4 — 15 m/s 완주(장력 최저점 mv²/L+mg, 꼭대기 mv_t²/L−mg) · 12 m/s 는 느슨', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const ex = POE_EXAMPLES.find(e => e.id === 'circ-vertical');
    build(ex.scene); const d = sceneToData();
    const run = (v) => { const res = simulateHeadless(applyVariant(d, { A: { vx0: v } }), { T: 2.2, sample(els, t) { const A = els[0]; return [t, Math.hypot(A.physX - 50, A.physY - 60), A.physY - 56, A._fbd && A._fbd.T.length ? A._fbd.T[0].mag : 0, Math.hypot(A.vx, A.vy)]; } });
      const s = res.samples; const top = s.reduce((m, x) => x[2] > m[2] ? x : m);
      return { minR: Math.min(...s.map(x => x[1])), hTop: top[2], Ttop: top[3], vTop: top[4], T0: s[0][3] }; };
    ({ v15: run(15), v12: run(12), v14: run(14) })
  `);
  truthy('15 m/s: 실이 늘 팽팽 (최소 거리 ≈ 4)', r.v15.minR > 3.98);
  expect('15 m/s: 꼭대기 도달 (높이 8)', r.v15.hTop, 8, 0.05, 'm');
  expect('최저점 장력 mv²/L + mg', r.v15.T0, 225 / 4 + G, '2%', 'N');
  expect('꼭대기 속력 √(v² − 4gL)', r.v15.vTop, Math.sqrt(225 - 4 * G * 4), '3%', 'm/s');
  expect('꼭대기 장력 mv_t²/L − mg', r.v15.Ttop, (225 - 4 * G * 4) / 4 - G, '12%', 'N');
  truthy('12 m/s: 실이 느슨해짐', r.v12.minR < 3.5);
  truthy('12 m/s: 꼭대기 못 미침', r.v12.hTop < 7.9);
  truthy('14 m/s(=√(5gL)): 거의 꼭대기까지', r.v14.hTop > 7.7);
});

scenario('S15-5', '회전 낙하 — 접촉점 각운동량 보존: v = rω₀/3 (방향 = 스핀 반대), ω = ω₀/3, μ·질량·반발 무관', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('spin-drop');
    const fin = (set, T) => { const res = simulateHeadless(applyVariant(d, set), { T: T || 4 }); const A = res.elements[0]; return { vx: A.vx, w: A.omega, roll: Math.abs(A.vx + 0.5 * A.omega * (-1)) }; };
    ({ base: fin({ A: { e: 0 } }), bounce: fin({}, 8), cw: fin({ A: { omega0: -12, e: 0 } }), fast: fin({ A: { omega0: 24, e: 0 } }), lowMu: fin({ F: { muS: 0.15, muK: 0.1 }, A: { e: 0 } }, 8), heavy: fin({ A: { mass: 5, e: 0 } }) })
  `);
  expect('반시계 ω₀=12 → vx = −rω₀/3 = −2', r.base.vx, -2, 0.03, 'm/s');
  expect('최종 각속도 ω₀/3', r.base.w, 4, 0.05, 'rad/s');
  expect('반발 e=0.5 라도 최종 속도 같음', r.bounce.vx, -2, 0.05, 'm/s');
  expect('시계 ω₀=−12 → 오른쪽 +2', r.cw.vx, 2, 0.03, 'm/s');
  expect('ω₀ 2배 → 속력 2배', r.fast.vx, -4, 0.05, 'm/s');
  expect('마찰계수 무관', r.lowMu.vx, -2, 0.05, 'm/s');
  expect('질량 무관', r.heavy.vx, -2, 0.03, 'm/s');
});

scenario('S15-6', '새 장면·문항 — 갤러리 11, POE 31/7분류, 원운동 문항 정답 = 시뮬', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const ids = SCENES.map(s => s.id);
    const ex = id => POE_EXAMPLES.find(e => e.id === id);
    // 수치 문항 정답 계산
    const ans = (id) => { const e = ex(id); if (typeof e.scene === 'string') load(e.scene); else build(e.scene); if (e.set) _applySetToState(e.set); return measureScene(sceneToData(), e.answer.measure); };
    // 공유 링크에 omega0 보존
    load('spin-drop'); const back = decodeScene(encodeScene(sceneToData()));
    ({ n: ids.length, has: ['projectile','circular','spin-drop'].every(i => ids.includes(i)), cats: new Set(POE_EXAMPLES.map(e => e.cat)).size, poe: POE_EXAMPLES.length,
       circ: POE_EXAMPLES.filter(e => e.cat === 'circular').length, range: ans('proj-range'), tens: ans('circ-tension'), spin: ans('spin-speed'),
       omega0: back.elements[0].omega0, guides: POE_GUIDES.length })
  `);
  expect('갤러리 11', r.n, 11, 0, '개');
  truthy('새 장면 3개 존재', r.has);
  expect('POE 32 문항', r.poe, 32, 0, '개');
  expect('분류 7', r.cats, 7, 0, '개');
  expect('원운동·회전 5 문항', r.circ, 5, 0, '개');
  expect('사거리 정답 ≈ 13.06', r.range, 13.06, '2%', 'm');
  expect('구심력 정답 6.25', r.tens, 6.25, '1%', 'N');
  expect('스핀 속력 정답 2', r.spin, 2, '2%', 'm/s');
  expect('공유 링크에 ω₀ 보존', r.omega0, 12, 0, 'rad/s');
  expect('해설 11', r.guides, 11, 0, '개');
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
