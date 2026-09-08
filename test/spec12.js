/* ============================================================
   test/spec12.js — 2단계 측정·시각화: 자유물체도 분해 · 측정값 행 · 라벨 토글 ·
                   그래프 시리즈 · 실행 중 선택 패널
   실행: node test/spec12.js
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
  const ok = Math.abs(actual - expected) <= tolAbs;
  CUR.checks.push({ label, actual, expected, tol: tolAbs, ok, unit: unit || '' });
}
function truthy(label, v) { CUR.checks.push({ label, actual: v ? 1 : 0, expected: 1, tol: 0, ok: !!v, unit: '' }); }

function app() {
  const a = loadApp();
  a.evalIn(`CONFIG.cellSize = 8; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;`);
  return a;
}
const RUN = `
  function _begin(){ validateAll(); startSimulation(); }
  function _run(t){ const n = Math.round(t / CONFIG.FIXED_DT); for (let i=0;i<n;i++){ simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; } }
  function _body(key, ids){ return STATE.elements.find(e => e.id === ids[key]); }
  function mag(v){ return Math.hypot(v[0], v[1]); }
`;

/* ────────────────────────────────────────────────────────────── */
scenario('S12-1', '자유물체도 — 아트우드 장력 T = 2m₁m₂g/(m₁+m₂), 실에도 같은 값', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('atwood', { history:false, view:false });
    _begin(); _run(0.5);
    const A = _body('A', ids), B = _body('B', ids);
    ({ TA: A._fbd.T[0].mag, TB: B._fbd.T[0].mag, nT: A._fbd.T.length, gA: A._fbd.g[1], N: mag(A._fbd.N), other: mag(A._fbd.other),
       ropeT: STATE.ropes.filter(x => x._tension != null).map(x => x._tension),
       netA: A._fbd.net[1], aA: A._ayMeas })
  `);
  const T = 2 * 1 * 1.5 * 9.8 / 2.5;
  expect('A 장력', r.TA, T, '0.5%', 'N');
  expect('B 장력', r.TB, T, '0.5%', 'N');
  truthy('실 하나씩', r.nT === 1);
  expect('중력 성분 −mg', r.gA, -9.8, 1e-9, 'N');
  expect('수직항력 0 (공중)', r.N, 0, 1e-6, 'N');
  expect('기타 잔차 0', r.other, 0, 1e-3, 'N');
  truthy('두 실(림)에 장력 기록', r.ropeT.length === 2 && r.ropeT.every(t => Math.abs(t - T) < 0.06));
  expect('알짜힘 = m·a', r.netA, 1 * r.aA, 1e-9, 'N');
});

scenario('S12-2', '자유물체도 — 빗면: N = mg cosθ, f = μk mg cosθ, 운동 마찰 배지', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('incline', { history:false, view:false });
    _begin(); _run(0.5);
    const A = _body('A', ids);
    ({ N: mag(A._fbd.N), f: mag(A._fbd.f), slip: A._fbd.slipping, contact: !!A._fbd.contact, T: A._fbd.T.length,
       rows: measureRows(A).map(x => x.k + '=' + x.v + (x.badge ? '[' + x.badge + ']' : '')) })
  `);
  const th = Math.atan(0.5);
  expect('수직항력', r.N, 2 * 9.8 * Math.cos(th), '0.5%', 'N');
  expect('운동 마찰력', r.f, 0.25 * 2 * 9.8 * Math.cos(th), '0.5%', 'N');
  truthy('미끄러짐 판정', r.slip === true && r.contact);
  truthy('장력 없음', r.T === 0);
  truthy('측정 행에 수직항력·마찰력(운동 마찰)', r.rows.some(x => x.startsWith('수직항력 N=17.5')) && r.rows.some(x => /마찰력 f=4\.38 N\[운동 마찰\]/.test(x)));
});

scenario('S12-3', '자유물체도 — 정지 마찰: 완만한 빗면(μ=0.6)에서 물체가 멈춰 있고 f = mg sinθ', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    buildSceneFromSpec({
      floors: [{ key:'S', x1: 38, y1: 62, x2: 62, y2: 50, isFriction: true, muS: 0.6, muK: 0.5 }],
      elements: [{ key:'A', type:'rect', mass: 2, onFloor: { floor:'S', x: 52 } }],
    }, { history:false, view:false });
    const A = STATE.elements[0];
    _begin(); const x0 = A.physX, y0 = A.physY; _run(1.0);
    ({ v: Math.hypot(A.vx, A.vy), drift: Math.hypot(A.physX - x0, A.physY - y0), f: mag(A._fbd.f), N: mag(A._fbd.N), slip: A._fbd.slipping, net: mag(A._fbd.net) })
  `);
  const th = Math.atan(0.5);
  truthy('정지 — 1 s 동안 이동 < 2 cm', r.drift < 0.02);
  expect('정지 마찰력 = mg sinθ', r.f, 2 * 9.8 * Math.sin(th), '1%', 'N');
  expect('수직항력 = mg cosθ', r.N, 2 * 9.8 * Math.cos(th), '1%', 'N');
  truthy('정지 마찰 배지 (slipping=false)', r.slip === false);
  expect('알짜힘 ≈ 0 (평형)', r.net, 0, 0.05, 'N');
});

scenario('S12-4', '자유물체도 — 용수철힘·힘구간은 "알려진 힘" 으로 분류', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    let { ids } = loadScene('spring', { history:false, view:false });
    _begin(); _run(0.4);
    const A = _body('A', ids); const sp = STATE.elements.find(e => e.type === 'spring');
    const s1 = { spring: mag(A._fbd.spring), expect: sp.k * Math.abs(sp.L - sp.L0), N: mag(A._fbd.N), rows: measureRows(sp).map(x => x.k) };
    stopSimulation(); STATE.simMode = 'EDIT';
    ({ ids } = loadScene('forcezone', { history:false, view:false }));
    _begin(); _run(3.6);
    const B = _body('A', ids);
    ({ s1, zone: mag(B._fbd.applied), inZone: B.gridX + B.gridW > 50 && B.gridX < 58 })
  `);
  expect('탄성력 = k|L−L₀|', r.s1.spring, r.s1.expect, '1%', 'N');
  expect('바닥 수직항력 = mg', r.s1.N, 9.8, '1%', 'N');
  truthy('용수철 측정 행: 변형·탄성력·탄성에너지·주기', ['변형 x = L − L₀', '탄성력 kx', '탄성에너지 ½kx²', '주기 2π√(m/k)'].every(k => r.s1.rows.includes(k)));
  truthy('힘구간 안', r.inZone);
  expect('힘구간 힘 4 N', r.zone, 4, 1e-6, 'N');
});

scenario('S12-5', '측정값 행 — 편집 상태(초기값)와 실행 중, 실·바닥면·도르래', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('atwood', { history:false, view:false });
    const A = _body('A', ids), P = _body('P', ids), rope = STATE.ropes[1], seg = STATE.floorSegments[0];
    const edit = measureRows(A).map(x => x.k);
    const editRope = measureRows(rope).map(x => x.k + '=' + x.v);
    const editP = measureRows(P).map(x => x.k + '=' + x.v);
    _begin(); _run(0.5);
    const run = measureRows(A).map(x => x.k);
    const runRope = measureRows(rope).map(x => x.k + '=' + x.v + (x.badge||''));
    const floor = measureRows(seg).map(x => x.k);
    ({ edit, editRope, editP, run, runRope, floor })
  `);
  truthy('편집: 위치·속도·에너지·중력 행', ['위치 (x, y)', '속력 |v|', '역학적 에너지', '중력 mg'].every(k => r.edit.includes(k)));
  truthy('편집: 가속도 행 없음, 접촉력은 안내', !r.edit.includes('가속도 (ax, ay)') && r.edit.includes('수직항력·마찰·장력'));
  truthy('실행: 가속도·장력·알짜힘 행', ['가속도 (ax, ay)', '장력 T', '알짜힘 ΣF = ma'].every(k => r.run.includes(k)));
  truthy('실(편집): 장력은 실행하면 표시', r.editRope.some(x => x.startsWith('장력 T=실행하면')));
  truthy('실(실행): 팽팽함 + 장력 11.76', r.runRope.some(x => x.startsWith('상태=팽팽함')) && r.runRope.some(x => /장력 T=11\.7[56]/.test(x)));
  truthy('도르래: 고정 도르래 · 걸린 실 2개', r.editP.includes('종류=고정 도르래') && r.editP.includes('걸린 실=2개'));
  truthy('바닥면: 길이·기울기', r.floor.includes('길이') && r.floor.includes('기울기 각'));
});

scenario('S12-6', '값 라벨 토글 — 끄면 촬영 SVG 에서 질량·k·힘 글자가 빠진다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('spring', { history:false, view:false });
    const z = new ForceZone(); z.gridX = 50; z.gridY = 40; STATE.elements.push(z);
    STATE.showLabels = true;  const on  = buildSceneSVG();
    STATE.showLabels = false; const off = buildSceneSVG();
    STATE.showLabels = true;
    ({ onKg: /kg</.test(on), offKg: /kg</.test(off), onK: />k = /.test(on) || /k = 10/.test(on), offN: /N</.test(off),
       onPaths: (on.match(/<path/g)||[]).length, offPaths: (off.match(/<path/g)||[]).length })
  `);
  truthy('켜짐: kg 라벨 있음', r.onKg);
  truthy('꺼짐: kg 라벨 없음', !r.offKg);
  truthy('꺼짐: 힘 N 라벨 없음', !r.offN);
  expect('도형(path) 수는 같다', r.offPaths, r.onPaths, 0, '개');
});

scenario('S12-7', '그래프 — 탭별 시리즈 선택과 잔상 겹침', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('freefall', { history:false, view:false });
    _begin(); _run(0.5);
    GRAPH.tab = 'y'; const y = _graphSeries();
    GRAPH.tab = 'E'; const E = _graphSeries();
    keepSeriesAsGhost();
    GRAPH.tab = 'v'; const v = _graphSeries();
    ({ yN: y.list.length, yLabels: y.list.map(s => s.label), eLabels: E.list.map(s => s.label), vN: v.list.length, ghosts: v.list.filter(s => s.ghost).length,
       yFirst: y.list[0].y[0], yLast: y.list[0].y[y.list[0].y.length-1] })
  `);
  truthy('y 탭: 물체 2개', r.yN === 2 && r.yLabels.join(',') === '원1,원2');
  truthy('E 탭: KE·PE·총합', r.eLabels.includes('운동 KE') && r.eLabels.includes('위치 PE') && r.eLabels.includes('총합 E'));
  truthy('잔상 시리즈 2개 추가', r.vN === 4 && r.ghosts === 2);
  truthy('y 가 내려간다', r.yLast < r.yFirst);
});

scenario('S12-8', 'index.html — 2단계 DOM (토글·그래프 패널) 과 스크립트 순서', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['tb-vectors', 'tb-forces', 'tb-labels', 'tb-graph', 'graph-panel', 'graph-canvas', 'graph-tabs', 'graph-legend']) truthy(`#${id} 존재`, html.includes(`id="${id}"`));
  const order = (html.match(/<script src="js\/([a-z-]+)\.js/g) || []).map(s => s.replace(/.*js\//, '').replace(/\.js$/, ''));
  const idx = n => order.indexOf(n);
  truthy('measure.js 가 panel.js 앞', idx('measure') < idx('panel') && idx('measure') > 0);
  truthy('overlay.js 가 render.js 뒤', idx('overlay') > idx('render'));
  truthy('graph/toolbar 가 boot.js 앞', idx('graph') < idx('boot') && idx('toolbar') < idx('boot'));
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
