/* ============================================================
   test/spec19.js — 돌림힘 3단계: 막대 실 네트워크(움직도르래 · 직렬 고정 도르래) ·
     막대 위에 탄 상자(막대와 함께 기울기, 정지/미끄러짐) · 막대 끝 가로 용수철
   실행: node test/spec19.js
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

const RUN = `
  function K(k){ return STATE.elements.find(e => e._key === k); }
  function build(spec){ buildSceneFromSpec(spec, { history:false, view:false }); return sceneToData(); }
  function load(id){ loadScene(id, { history:false, view:false }); return sceneToData(); }
  function rod(key, L, M, cx, cy, extra){ return Object.assign({ key, type:'rod', gridW:L, mass:M, gridX:cx - L/2, gridY:cy - 0.125 }, extra || {}); }
  function ful(key, ax, ay, pinned, extra){ return Object.assign({ key, type:'fulcrum', gridX:ax - 0.5, gridY:ay, pinned: !!pinned }, extra || {}); }
  function go(){ validateAll(); startSimulation(); }
  function run(t){ const n = Math.round(t / CONFIG.FIXED_DT); for (let i = 0; i < n; i++) { simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; } }
  function stop(){ stopSimulation(); STATE.simMode = 'EDIT'; restoreSnapshot(); }
`;


scenario('S19-1', '움직도르래 — 막대 끝의 줄이 움직도르래를 지나 천장으로: 양쪽 장력 = W/2, 지레 평형, R = ΣW', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const spec = (mB) => ({ floors: [{ key:'C', x1:50, y1:40, x2:60, y2:40 }],
      elements: [ rod('R', 6, 2, 50, 50), ful('F', 50, 50, true), { key:'A', type:'rect', gridX:46.5, gridY:53, mass:1 },
                  { key:'P', type:'pulley', gridX:53, gridY:53 }, { key:'B', type:'rect', gridX:53.5, gridY:57, mass:mB } ],
      ropes: [['R','p1','A','top'], ['R','p2','P','left'], ['P','right','C','s5'], ['P','center','B','top']] });
    build(spec(2)); const warn = STATE.warnings.slice();
    go(); run(3);
    const ro = STATE.ropes, out = { warn, node: K('P')._rodNode, th: K('R').theta, T1: ro[1]._tension, T2: ro[2]._tension, TB: ro[3]._tension, Rf: K('F')._force.fy, Py: K('P').physY };
    stop();
    build(spec(4)); go(); run(0.5); out.th4 = K('R').theta; out.vB = K('B').vy; out.vP = K('P').vy; stop();
    out`);
  truthy('편집 경고 없음 (움직도르래 = 막대 계의 가벼운 마디)', r.warn.length === 0 && r.node === true);
  expect('평형: 막대 수평', r.th, 0, 1e-3, 'rad');
  expect('도르래 양쪽 장력 같음', r.T1 - r.T2, 0, 1e-6, 'N');
  expect('장력 = W/2 = g', r.T1, g, '1%', 'N');
  expect('하중 실 장력 = W = 2g', r.TB, 2 * g, '1%', 'N');
  expect('받침 반작용 = 막대 + A + 막대 끝 장력 = 4g', r.Rf, 4 * g, '1%', 'N');
  expect('도르래가 제자리 (y = 100 − 54)', r.Py, 46, 1e-3, 'm');
  truthy('W = 4 kg: 막대 끝이 내려가며(시계) 하중이 내려간다', r.th4 < -0.05 && r.vB < -0.1);
  expect('하중 속도 = 도르래 속도 (같이 움직임)', r.vB - r.vP, 0, 0.02, 'm/s');
});

scenario('S19-2', '직렬 고정 도르래 — 막대 끝 → 도르래 → 도르래 → 추: 한 줄 장력 균일, 평형', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [{ key:'C', x1:50, y1:40, x2:62, y2:40 }],
      elements: [ rod('R', 6, 2, 50, 50), ful('F', 50, 50, true), { key:'A', type:'rect', gridX:52.5, gridY:53, mass:1 },
                  { key:'P1', type:'pulley', gridX:53, gridY:44 }, { key:'P2', type:'pulley', gridX:57, gridY:44 }, { key:'B', type:'rect', gridX:58.5, gridY:48, mass:1 } ],
      ropes: [['R','p2','A','top'], ['P1','center','C','s4'], ['P2','center','C','s8'], ['R','p2','P1','left'], ['P1','right','P2','left'], ['P2','right','B','top']] });
    const warn = STATE.warnings.slice(), groups = rodRopeNetwork().groups.length;
    go(); run(3);
    const ro = STATE.ropes, out = { warn, groups, th: K('R').theta, T: [ro[3]._tension, ro[4]._tension, ro[5]._tension], Rf: K('F')._force.fy };
    stop(); out`);
  truthy('편집 경고 없음', r.warn.length === 0);
  expect('막대 수평', r.th, 0, 1e-4, 'rad');
  expect('구간 1 장력 = g', r.T[0], g, '1%', 'N');
  truthy('세 구간 장력이 같다', Math.abs(r.T[0] - r.T[1]) < 1e-6 && Math.abs(r.T[1] - r.T[2]) < 1e-6);
  expect('받침 반작용 = Mg (A 와 줄이 상쇄)', r.Rf, 2 * g, '1%', 'N');
});

scenario('S19-3', '기운 막대 위의 상자 — 막대와 함께 기울어 tan 15° < μs 정지 (N = mg cos θ, f = mg sin θ), 30° 는 a = g(sin θ − μk cos θ)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const mk = (deg) => {
      const t = deg * Math.PI / 180, h = 5 * Math.sin(t), w = 5 * Math.cos(t);   // 오른쪽이 내려간 막대 (각도 −deg)
      return build({ elements: [ rod('R', 10, 5, 50, 50, { angle0: -deg }), ful('F1', 50 - w, 50 - h, true), ful('F2', 50 + w, 50 + h, true),
        { key:'B', type:'rect', mass:1, gridX: 49.5 + 0.625 * Math.sin(t), gridY: 50 - 0.625 * Math.cos(t) - 0.5 } ] });
    };
    mk(15); go(); run(2);
    const B = K('B'), out = { x: B.physX, ride: B._rideRot, N: Math.hypot(...B._fbd.N), f: Math.hypot(...B._fbd.f) };
    stop();
    mk(30); go(); run(0.5);
    const t = 30 * Math.PI / 180, B2 = K('B');
    out.a = (B2.vx * Math.cos(t) - B2.vy * Math.sin(t)) / 0.5; out.ride30 = B2._rideRot;
    stop(); out`);
  expect('15°: 미끄러지지 않음', r.x, 49.662, 2e-3, 'm');
  expect('15°: 상자가 막대 각도로 기움', r.ride, -15 * Math.PI / 180, 1e-4, 'rad');
  expect('15°: N = mg cos 15°', r.N, g * Math.cos(15 * Math.PI / 180), '1%', 'N');
  expect('15°: 정지 마찰 f = mg sin 15°', r.f, g * Math.sin(15 * Math.PI / 180), '2%', 'N');
  expect('30°: a = g(sin θ − 0.3 cos θ)', r.a, g * (Math.sin(Math.PI / 6) - 0.3 * Math.cos(Math.PI / 6)), '2%', 'm/s²');
  expect('30°: 상자도 30° 기움', r.ride30, -Math.PI / 6, 1e-3, 'rad');
});

scenario('S19-4', '막대 끝 가로 용수철 — 벽 ↔ 막대 왼쪽 끝 자동 체결, 마찰 없는 바닥 위 단진동 T = 2π√(M/k)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [{ key:'G', x1:30, y1:51, x2:70, y2:51 }, { key:'W', x1:40, y1:40, x2:40, y2:52 }],
            elements: [ rod('R', 6, 2, 47, 50.875), { key:'S', type:'spring', isVertical:false, gridW:4, gridH:1, gridX:40, gridY:50.375, k:8, L0:4.5 } ] });
    const S = K('S'), R = K('R');
    const att = { left: STATE.floorSegments.some(f => f.id === S.leftElementId), right: S.rightElementId === R.id };
    const ep = S.getEndpointsWorld(); att.bx = ep.bx / CONFIG.cellSize;
    go(); let prev = R.vx, last = null; const per = [];
    for (let i = 0; i < 600; i++) { run(1/60); if (prev < 0 && R.vx >= 0) { const t = i / 60; if (last != null) per.push(t - last); last = t; } prev = R.vx; }
    const F = R._fbd.forces.find(f => f.kind === 'S');
    stop(); Object.assign(att, { per, Fpx: F && F.px })`);
  truthy('왼쪽 끝 = 벽, 오른쪽 끝 = 막대', r.left && r.right);
  expect('그림 끝점 = 막대 왼쪽 끝 (x = 44)', r.bx, 44, 1e-9, '칸');
  truthy('주기 2번 이상 측정', r.per.length >= 1);
  if (r.per.length) expect('주기 2π√(2/8)', r.per[0], 2 * Math.PI * Math.sqrt(2 / 8), '2%', 's');
});

scenario('S19-5', '막대 계 실 네트워크 — 외력 실 제외, 림 실 셋인 도르래는 bad, 막대와 무관한 도르래 장면은 그대로', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('atwood', { history:false, view:false });
    const atw = { n: rodRopeNetwork().ropes.size };
    const d = sceneToData(); atw.T = measureScene(d, { body:'B', q:'T', at:0.5 });
    build({ elements: [ rod('R', 6, 2, 50, 50), ful('F', 50, 50, true), { key:'E', type:'extforce', gridX:52.5, gridY:53.5, forceN:5 } ], ropes: [['R','p2','E','center']] });
    const ext = rodRopeNetwork().ropes.size;
    ({ atw, ext })`);
  expect('막대 없는 아트우드: 막대 계 실 0', r.atw.n, 0, 0, '개');
  expect('아트우드 장력 그대로 2m₁m₂g/(m₁+m₂)', r.atw.T, 11.76, '1%', 'N');
  expect('외력 실은 막대 계 실이 아니다 (힘으로 처리)', r.ext, 0, 0, '개');
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
