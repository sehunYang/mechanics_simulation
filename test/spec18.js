/* ============================================================
   test/spec18.js — 돌림힘 2단계: 막대 위 물체 · 막대에 건 외력 · 용수철 ↔ 막대 · 고정 도르래 줄 ·
     거꾸로 단 받침(매단 막대 진자) · 질량중심 지정 · 기운 네모 촬영 · 편집 스냅 · POE 정합
   실행: node test/spec18.js
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

scenario('S18-1', '시소 위의 두 상자 — 3 kg × 2 m = 2 kg × 3 m 정지, 상자 N = 무게, R = ΣW / 상자를 4 m 로 옮기면 기운다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const d = load('seesaw-boxes');
    ({ warn: STATE.warnings.length,
       th: measureScene(d, { body:'R', q:'theta', at:3 }), NA: measureScene(d, { body:'A', q:'N', at:1 }), NB: measureScene(d, { body:'B', q:'N', at:1 }),
       R: measureScene(d, { body:'F', q:'N', at:1 }),
       th4: measureScene(applyVariant(d, { B: { gridX: 53.5 } }), { body:'R', q:'theta', at:1 }),
       th2: measureScene(applyVariant(d, { B: { gridX: 51.5 } }), { body:'R', q:'theta', at:1 }) })`);
  expect('편집 경고 없음', r.warn, 0, 0, '개');
  expect('3 s 동안 기울지 않음', r.th, 0, 1e-3, '°');
  expect('3 kg 상자의 수직항력 = 3g', r.NA, 3 * g, '0.5%', 'N');
  expect('2 kg 상자의 수직항력 = 2g', r.NB, 2 * g, '0.5%', 'N');
  expect('받침 반작용 = (2 + 3 + 2)g', r.R, 7 * g, '0.5%', 'N');
  truthy('2 kg 을 4 m 로: 시계 방향으로 기운다 (θ < −5°)', r.th4 < -5);
  truthy('2 kg 을 2 m 로: 반시계 방향으로 기운다 (θ > 5°)', r.th2 > 5);
});

scenario('S18-2', '막대 위의 원 — 미끄러지며 굴러 v = ⅔ v₀ 로 순수 구름 (막대 윗면 마찰)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ elements: [ rod('R', 12, 5, 50, 50), ful('F1', 45, 50, true), ful('F2', 55, 50, true),
                        { key:'C', type:'circle', gridX:46.5, gridY:48.875, mass:1, vx0:3, e:0 } ] });
    go(); run(1.5);
    const C = K('C'), r0 = C.gridW / 2;
    const out = { v: C.vx, slip: C.vx + C.omega * r0, y: C.physY, th: K('R').theta }; stop(); out`);
  expect('구름 속력 ⅔ v₀', r.v, 2, '1%', 'm/s');
  expect('접점 미끄러짐 v − rω·(−1)', r.slip, 0, 0.01, 'm/s');
  expect('막대 윗면 위 (중심 높이 = 50 + 0.125 + 0.5)', r.y, 50.625, 2e-3, 'm');
  expect('두 핀으로 고정된 막대는 그대로', r.th, 0, 1e-6, 'rad');
});

scenario('S18-3', '막대에 건 외력 — 작용점의 힘: α₀ = −F·3/(ML²/12), 자유물체도·측정값에 외력', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ elements: [ rod('R', 6, 2, 50, 50), ful('F', 50, 50, true), { key:'E', type:'extforce', gridX:52.5, gridY:53.5, forceN:20 } ],
            ropes: [['R','p2','E','center']] });
    const warn = STATE.warnings.slice();
    go(); run(1/60);
    const R = K('R'), F = R._fbd.forces.find(f => f.kind === 'F');
    const out = { warn, alpha: R._alphaMeas, Fy: F && F.fy, px: F && F.px, rows: measureRows(R).map(x => x.k) };
    stop(); out`);
  truthy('편집 경고 없음', r.warn.length === 0);
  expect('α₀ = −20·3/6', r.alpha, -10, '1%', 'rad/s²');
  expect('자유물체도: 외력 20 N 아래로', r.Fy, -20, '0.5%', 'N');
  expect('외력 작용점 = 막대 끝 x = 53 (한 스텝 회전 오차)', r.px, 53, 1e-3, 'm');
  truthy('측정값에 "외력 F" 행', r.rows.some(k => /외력 F/.test(k)));
});

scenario('S18-4', '용수철 ↔ 막대 — 아랫면·윗면 자동 체결, 끝 고정 막대를 kx = Mg/2 로 받쳐 수평 유지', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    // 끝(47, 50)을 고정한 6 m · 2 kg 막대의 오른쪽 끝 아래 용수철 — 막대 아랫면(50.125) → 바닥(56): 길이 5.875
    // 평형에서 kx = Mg/2 = 9.8 이 되게 L₀ = 5.875 + 9.8/k
    build({ floors: [{ key:'G', x1:30, y1:56, x2:70, y2:56 }],
            elements: [ rod('R', 6, 2, 50, 50), ful('F', 47, 50, true),
                        { key:'S', type:'spring', isVertical:true, gridW:1, gridH:6, gridX:52.5, gridY:50, k:19.6, L0:5.875 + 0.5 } ] });
    const S = K('S'), R = K('R');
    const att = { top: S.leftElementId === R.id, bottomFloor: STATE.floorSegments.some(f => f.id === S.rightElementId) };
    const ep = S.getEndpointsWorld(), cs = CONFIG.cellSize;
    att.ax = ep.ax / cs; att.ay = ep.ay / cs;
    go(); let maxTh = 0; for (let i = 0; i < 180; i++) { run(1/60); maxTh = Math.max(maxTh, Math.abs(R.theta)); }
    const Fs = R._fbd.forces.find(f => f.kind === 'S'), Rf = K('F')._force;
    const out = Object.assign(att, { maxTh, Fs: Fs && Fs.fy, R: Rf.fy }); stop();
    // 용수철이 막대 위에 있으면 막대 윗면에 체결 (오른쪽 = 아래 끝)
    build({ elements: [ rod('R', 6, 2, 50, 50), ful('F', 47, 50, true),
                        { key:'S', type:'spring', isVertical:true, gridW:1, gridH:4, gridX:52.5, gridY:46, k:10, L0:4 } ] });
    out.above = K('S').rightElementId === K('R').id;
    out`);
  truthy('용수철 위 끝 = 막대 (아랫면)', r.top);
  truthy('용수철 아래 끝 = 바닥면', r.bottomFloor);
  expect('그림 끝점 x = 용수철 축 (53)', r.ax, 53, 1e-9, '칸');
  expect('그림 끝점 y = 막대 아랫면 (50.125)', r.ay, 50.125, 1e-9, '칸');
  expect('3 s 동안 수평 유지', r.maxTh, 0, 1e-4, 'rad');
  expect('탄성력 = Mg/2 (위로)', r.Fs, g, '1%', 'N');
  expect('핀 반작용 = Mg/2', r.R, g, '1%', 'N');
  truthy('막대 위의 용수철 = 막대 윗면에 체결', r.above);
});

scenario('S18-5', '고정 도르래를 지나는 막대 실 — 양쪽 장력 같음, 평형: T = mg, R = Mg / 무거우면 끌어올린다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    // 막대 끝(53, 50) 바로 위 도르래 왼쪽 림(53, 44) — 실이 수직. 오른쪽 림(55)에 B, 막대 끝에 A
    const spec = (mB) => ({ floors: [{ key:'C', x1:52, y1:40, x2:56, y2:40 }],
      elements: [ rod('R', 6, 2, 50, 50), ful('F', 50, 50, true), { key:'P', type:'pulley', gridX:53, gridY:43 },
                  { key:'B', type:'rect', gridX:54.5, gridY:47, mass:mB }, { key:'A', type:'rect', gridX:52.5, gridY:53, mass:1 } ],
      ropes: [['P','center','C','s2'], ['R','p2','P','left'], ['P','right','B','top'], ['R','p2','A','top']] });
    build(spec(1)); const warn = STATE.warnings.slice();
    go(); run(3);
    const ropes = STATE.ropes, R = K('R');
    const out = { warn, th: R.theta, T1: ropes[1]._tension, T2: ropes[2]._tension, TA: ropes[3]._tension, Rf: K('F')._force.fy };
    stop();
    build(spec(2)); go(); run(1); out.th2 = K('R').theta; out.By2 = K('B').vy; stop();
    out`);
  truthy('편집 경고 없음', r.warn.length === 0);
  expect('평형: 막대 수평', r.th, 0, 1e-4, 'rad');
  expect('도르래 양쪽 장력 같음', r.T1 - r.T2, 0, 1e-6, 'N');
  expect('장력 = B 의 무게', r.T1, g, '1%', 'N');
  expect('A 를 매단 실 = A 의 무게', r.TA, g, '1%', 'N');
  expect('받침 반작용 = Mg (실 둘이 상쇄)', r.Rf, 2 * g, '1%', 'N');
  truthy('B 2 kg: 막대 끝이 들린다 (반시계)', r.th2 > 0.05);
  truthy('B 2 kg: B 는 내려간다', r.By2 < -0.1);
});

scenario('S18-6', '거꾸로 단 받침 — 매단 막대 진자 T = 2π√(2L/3g), 매달린 채 정지하면 핀 반작용 = Mg', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const mk = (deg) => { const t = deg * Math.PI / 180; return build({ floors: [{ key:'C', x1:44, y1:44, x2:56, y2:44 }],
      elements: [ ful('F', 50, 45, true, { flip: true, gridY: 44 }),
                  { key:'R', type:'rod', gridW:6, mass:2, angle0:deg, gridX: 50 - 3 * Math.cos(t) - 3, gridY: 45 + 3 * Math.sin(t) - 0.125 } ] }); };
    let d = mk(80);
    const apex = fulcrumApexGrid(K('F')), c = fulcrumRodContact(K('F'));
    const T = measureScene(d, { body:'R', q:'period', T: 14 });
    d = mk(90); go(); run(2); const Ry = K('F')._force.fy, om = K('R').omega; stop();
    ({ apexY: apex.y, d: c && c.d, T, Ry, om, warn: STATE.warnings.length })`);
  expect('꼭짓점이 아래 (밑변 44 + 높이 1)', r.apexY, 45, 1e-9, '칸');
  expect('막대 끝(p2)에 고정', r.d, 6, 1e-9, 'm');
  expect('주기 (10° 진폭) 2π√(2L/3g)', r.T, 2 * Math.PI * Math.sqrt(2 * 6 / (3 * g)), '1.5%', 's');
  expect('수직으로 매달려 정지: 핀 반작용 = Mg (위로)', r.Ry, 2 * g, '0.5%', 'N');
  expect('수직으로 매달려 정지: ω', r.om, 0, 1e-6, 'rad/s');
  expect('편집 경고 없음', r.warn, 0, 0, '개');
});

scenario('S18-7', '질량중심 지정 — 받침 위면 중립, 1 m 벗어나면 α₀ = −Mg·1/(ML²/12 + M), 렌더·SVG 점, 공유 왕복', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ elements: [ rod('R', 6, 2, 50, 50, { com: 1 }), ful('F', 48, 50) ] });
    go(); run(2); const out = { th: K('R').theta, x: K('R').physX, N: K('F')._force.N }; stop();
    build({ elements: [ rod('R', 6, 2, 50, 50, { com: 2 }), ful('F', 48, 50) ] });
    go(); run(1/60); out.alpha = K('R')._alphaMeas; stop();
    const svg = buildSceneSVG(); out.dot = /A 2\\.4 2\\.4/.test(svg);
    const dec = decodeScene(encodeScene()); loadSceneData(dec, { history:false });
    out.com = STATE.elements.find(e => e.type === 'rod').com;
    // 중심 지정 막대가 돌 때 그림 상자 ↔ 물리 질량중심 일치
    build({ elements: [ rod('R', 6, 2, 50, 50, { com: 1.5 }), ful('F', 48.5, 50, true) ] });
    go(); run(0.7);
    const R = K('R'), C = rodComGrid(R), GS = CONFIG.GRID_SIZE;
    out.comErr = Math.hypot(C.x - R.physX, C.y - (GS - R.physY)); stop();
    out`);
  expect('질량중심이 꼭짓점 위: 각도', r.th, 0, 1e-6, 'rad');
  expect('질량중심이 꼭짓점 위: x 그대로', r.x, 48, 1e-6, 'm');
  expect('N = Mg', r.N, 2 * g, '0.5%', 'N');
  expect('α₀ = −g/(3 + 1)', r.alpha, -g / 4, '1%', 'rad/s²');
  truthy('SVG 에 질량중심 점', r.dot);
  expect('공유 링크에 질량중심 보존', r.com, 2, 0, 'm');
  expect('실행 중: 렌더 질량중심 = 물리 질량중심', r.comErr, 0, 1e-9, '칸');
});

scenario('S18-8', '촬영 SVG — 빗면에 얹혀 기운 네모가 화면처럼 회전된 사각형으로 나온다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [{ key:'S', x1:38, y1:62, x2:62, y2:50 }], elements: [{ key:'A', type:'rect', gridW:2, gridH:1, mass:1, onFloor:{ floor:'S', x:50 } }] });
    const A = K('A'), cs = CONFIG.cellSize, rot = A._snapRotation;
    const cx = (A.gridX + 1) * cs, cy = (A.gridY + 0.5) * cs;
    // 화면 draw 와 같은 회전: 왼쪽 위 꼭짓점
    const x = A.gridX * cs, y = A.gridY * cs, c = Math.cos(rot), s = Math.sin(rot);
    const want = { x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c };
    const svg = buildSceneSVG();
    const m = svg.match(/<path d="M (-?[\\d.]+) (-?[\\d.]+) L [^"]*Z" fill="#e8e8e8"/);
    ({ rot, got: m ? { x: +m[1], y: +m[2] } : null, want })`);
  truthy('기운 네모 (회전각 ≠ 0)', Math.abs(r.rot) > 0.1);
  truthy('SVG 에 회전된 사각형 path', !!r.got);
  if (r.got) { expect('꼭짓점 x', r.got.x, r.want.x, 0.01, 'px'); expect('꼭짓점 y', r.got.y, r.want.y, 0.01, 'px'); }
});

scenario('S18-9', '편집 — 네모를 수평 막대 윗면에 얹기, 받침 거꾸로 켜면 꼭짓점 자리 유지, 거꾸로 받침 → 천장 스냅', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    build({ floors: [{ key:'C', x1:40, y1:40, x2:60, y2:40 }], elements: [ rod('R', 6, 2, 50, 50), ful('F', 60, 45), { key:'A', type:'rect', gridX:20, gridY:20, mass:1 } ] });
    const top = _rodTopSnap(K('A'), 48.2, 48.6);
    const out = { top };
    out.none = _rodTopSnap(K('A'), 60, 48.6);
    const F = K('F'); F.flip = true; F.gridY = 45 - F.gridH;
    _dragFulcrum(F, 49.6, 40.3);
    out.flipTop = F.gridY; out.apex = fulcrumApexGrid(F).y;
    out`);
  truthy('막대 윗면 스냅: 밑면 = 49.875, 반칸 격자', r.top && Math.abs(r.top.gy + 1 - 49.875) < 1e-9 && r.top.gx === 48);
  truthy('막대 밖이면 스냅 없음', r.none === null);
  expect('거꾸로 받침의 밑변 = 천장', r.flipTop, 40, 1e-9, '칸');
  expect('꼭짓점은 밑변 아래', r.apex, 41, 1e-9, '칸');
});

scenario('S18-10', 'POE — 시소 위 상자 · 막대 진자 문항이 시뮬레이션과 맞는다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const out = {};
    for (const id of ['seesaw-box', 'rod-period']) {
      const ex = POE_EXAMPLES.find(e => e.id === id);
      loadScene(ex.scene, { history:false, view:false });
      const d = sceneToData();
      out[id] = ex.variants.map(v => measureScene(applyVariant(d, v.set), ex.measure));
    }
    out`);
  const sb = r['seesaw-box'], rp = r['rod-period'];
  expect('시소: 기준은 기울지 않음', sb[0], 0, 1e-3, '°');
  truthy('시소: 4 m 는 시계, 2 m 는 반시계', sb[1] < -5 && sb[2] > 5);
  truthy('막대 진자 6 m: 단진자 2π√(6/g) 보다 짧다', rp[0] < 2 * Math.PI * Math.sqrt(6 / g) - 0.5);
  expect('막대 진자 6 m (30°) ≈ 2π√(2L/3g)·1.017', rp[0], 2 * Math.PI * Math.sqrt(4 / g) * 1.017, '2%', 's');
  expect('길이 4배 → 주기 2배 (12 m / 3 m)', rp[2] / rp[1], 2, '2%', '');
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
