/* ============================================================
   test/spec11.js — 1단계 기반: 장면 DSL·갤러리 · 공유 링크 왕복 · 시계열/CSV ·
                   편집 경고 · 이벤트 버스 · 느린 배속/한 스텝
   실행: node test/spec11.js
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

/* 하네스: 캔버스 800×800 → cellSize 8, 뷰 초기화 */
function app() {
  const a = loadApp();
  a.evalIn(`CONFIG.cellSize = 8; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;`);
  return a;
}
/* 헤드리스 실행: begin 후 t초 */
const RUN = `
  function _begin(){ validateAll(); startSimulation(); }
  function _run(t){ const n = Math.round(t / CONFIG.FIXED_DT); for (let i=0;i<n;i++){ simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; } }
  function _body(key, ids){ return STATE.elements.find(e => e.id === ids[key]); }
`;

/* ────────────────────────────────────────────────────────────── */
scenario('S11-1', '갤러리 8개 장면 — 모두 로드되고 3초 동안 NaN 없이 돈다', () => {
  const a = app();
  a.evalIn(RUN);
  const n = a.evalIn(`SCENES.length`);
  expect('장면 수', n, 11, 0, '개');
  for (let i = 0; i < n; i++) {
    const r = a.evalIn(`
      const sc = SCENES[${i}];
      const { ids } = buildSceneFromSpec(sc.spec, { history:false, view:false });
      _begin(); _run(3);
      let bad = 0;
      for (const e of STATE.elements) if (['rect','circle','pulley'].includes(e.type) && !(isFinite(e.physX) && isFinite(e.physY) && isFinite(e.vx) && isFinite(e.vy))) bad++;
      stopSimulation(); STATE.simMode = 'EDIT';
      ({ id: sc.id, bodies: STATE.elements.filter(e=>e.type==='rect'||e.type==='circle').length, bad, warn: STATE.warnings.length })
    `);
    truthy(`${r.id}: 물체 ${r.bodies}개, NaN 없음`, r.bad === 0 && r.bodies >= 1);
    truthy(`${r.id}: 편집 경고 없음`, r.warn === 0);
  }
});

scenario('S11-2', '자유낙하와 포물선 — 두 공이 같은 시각에 바닥에 닿는다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('freefall', { history:false, view:false });
    _begin();
    const A = _body('A', ids), B = _body('B', ids);
    let tA = null, tB = null, t = 0;
    for (let i = 0; i < 300; i++) {
      simStep(CONFIG.FIXED_DT); t += CONFIG.FIXED_DT;
      if (tA === null && A.physY <= 40 + 0.5 + 1e-3) tA = t;
      if (tB === null && B.physY <= 40 + 0.5 + 1e-3) tB = t;
      if (tA !== null && tB !== null) break;
    }
    ({ tA, tB, h: 100 - 44 - 0.5 - 40 })
  `);
  truthy('둘 다 착지', r.tA !== null && r.tB !== null);
  expect('착지 시각 차 |tA−tB|', Math.abs(r.tA - r.tB), 0, 0.02, 's');
  expect('낙하 시간 ≈ √(2h/g)', r.tA, Math.sqrt(2 * r.h / 9.8), 0.04, 's');
});

scenario('S11-3', '빗면 — placeOnFloor 가 물체를 면 위에 올리고 μ=0.3 이면 미끄러진다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('incline', { history:false, view:false });
    const A = _body('A', ids);
    const rot0 = A._snapRotation;
    _begin(); const x0 = A.physX; _run(1.5);
    ({ rot0, moved: Math.hypot(A.physX - x0, 0), vy: A.vy, vx: A.vx, y: A.physY })
  `);
  expect('빗면 각도로 회전 (atan 0.5)', Math.abs(r.rot0), Math.atan(0.5), 1e-6, 'rad');
  truthy('아래로 미끄러짐 (vx<0, vy<0)', r.vx < -0.5 && r.vy < -0.2);
  // a = g(sinθ − μk cosθ) = 9.8(0.4472 − 0.25·0.8944) = 2.19 → 1.5 s 후 |v| ≈ 3.3
  expect('속력 ≈ a·t', Math.hypot(r.vx, r.vy), 9.8 * (Math.sin(Math.atan(0.5)) - 0.25 * Math.cos(Math.atan(0.5))) * 1.5, '8%', 'm/s');
});

scenario('S11-4', '아트우드 — 가속도 g(m₂−m₁)/(m₁+m₂), 두 물체 속력 같음', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('atwood', { history:false, view:false });
    _begin(); _run(1.0);
    const A = _body('A', ids), B = _body('B', ids);
    ({ vA: A.vy, vB: B.vy })
  `);
  const aExp = 9.8 * 0.5 / 2.5;
  expect('B(1.5kg) 하강 속도 ≈ a·t', -r.vB, aExp, '6%', 'm/s');
  expect('A 상승 = B 하강', r.vA, -r.vB, 0.02, 'm/s');
});

scenario('S11-5', '움직도르래 — 1.5 kg 이 2 kg 을 들어 올린다 (속력비 2:1)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('movable-pulley', { history:false, view:false });
    _begin(); _run(1.0);
    ({ vL: _body('L', ids).vy, vM: _body('M', ids).vy })
  `);
  truthy('하중 L 이 올라간다', r.vL > 0.05);
  truthy('M 이 내려간다', r.vM < -0.05);
  expect('속력비 |vM| / |vL| ≈ 2', Math.abs(r.vM) / Math.abs(r.vL), 2, 0.15, '');
});

scenario('S11-6', '용수철 진동 — 주기 T = 2π√(m/k)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('spring', { history:false, view:false });
    _begin();
    const A = _body('A', ids);
    // vx 의 부호가 −→+ 로 바뀌는 시각 두 개 → 주기
    let prev = A.vx, t = 0; const cross = [];
    for (let i = 0; i < 600 && cross.length < 3; i++) {
      simStep(CONFIG.FIXED_DT); t += CONFIG.FIXED_DT;
      if (prev < 0 && A.vx >= 0) cross.push(t);
      prev = A.vx;
    }
    ({ cross, L0: STATE.elements.find(e=>e.type==='spring').L0 })
  `);
  truthy('영점 통과 2회 이상', r.cross.length >= 2);
  if (r.cross.length >= 2) expect('주기', r.cross[1] - r.cross[0], 2 * Math.PI * Math.sqrt(1 / 10), '4%', 's');
});

scenario('S11-7', '진자 — 최저점 속력 √(2gh), 에너지 보존', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('pendulum', { history:false, view:false });
    _begin();
    const A = _body('A', ids);
    const E0 = 0.5*A.mass*(A.vx*A.vx+A.vy*A.vy) + A.mass*9.8*A.physY;
    const y0 = A.physY;
    let vmax = 0, ymin = Infinity;
    for (let i = 0; i < 240; i++) { simStep(CONFIG.FIXED_DT); vmax = Math.max(vmax, Math.hypot(A.vx, A.vy)); ymin = Math.min(ymin, A.physY); }
    const E1 = 0.5*A.mass*(A.vx*A.vx+A.vy*A.vy) + A.mass*9.8*A.physY;
    ({ vmax, h: y0 - ymin, E0, E1 })
  `);
  expect('최저점 속력 ≈ √(2gh)', r.vmax, Math.sqrt(2 * 9.8 * r.h), '4%', 'm/s');
  expect('역학적 에너지 보존', r.E1, r.E0, '1.5%', 'J');
});

scenario('S11-8', '충돌 — 같은 질량 탄성 충돌은 속도 교환', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('collision', { history:false, view:false });
    _begin(); _run(4.0);
    ({ vA: _body('A', ids).vx, vB: _body('B', ids).vx })
  `);
  expect('A 는 멈춤', r.vA, 0, 0.05, 'm/s');
  expect('B 는 4 m/s', r.vB, 4, 0.05, 'm/s');
});

scenario('S11-9', '힘 구간 — 안에서만 감속 (a = F/m)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const { ids } = loadScene('forcezone', { history:false, view:false });
    _begin();
    const A = _body('A', ids);
    _run(1.0);                    // 아직 구간 밖 (x: 40 → 43)
    const v1 = A.vx;
    // 구간 진입까지 진행
    let t = 0; while (A.gridX + A.gridW <= 50 && t < 10) { simStep(CONFIG.FIXED_DT); t += CONFIG.FIXED_DT; }
    const v2 = A.vx; _run(0.5); const v3 = A.vx;
    ({ v1, v2, v3 })
  `);
  expect('구간 밖에서는 등속', r.v1, 3, 0.02, 'm/s');
  expect('구간 안 0.5 s 감속 Δv = (F/m)·t = 1', r.v2 - r.v3, 1.0, 0.08, 'm/s');
});

/* ────────────────────────────────────────────────────────────── */
scenario('S11-10', '공유 링크 — encode → decode 왕복이 장면을 보존한다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('movable-pulley', { history:false, view:false });
    const before = sceneToData();
    const str = encodeScene(before);
    const data = decodeScene(str);
    loadSceneData(data, { history:false });
    const after = sceneToData();
    const strip = d => ({
      g: d.g,
      e: d.elements.map(e => { const o = Object.assign({}, e); delete o.id; delete o.leftElementId; delete o.rightElementId; return o; }),
      f: d.floorSegments.map(s => { const o = Object.assign({}, s); delete o.id; return o; }),
      nr: d.ropes.length,
      ropeAnchors: d.ropes.map(r => [r.anchorA.attachPoint, r.anchorB.attachPoint].join('>')).sort().join(','),
    });
    ({ len: str.length, same: JSON.stringify(strip(before)) === JSON.stringify(strip(after)),
       nE: after.elements.length, nF: after.floorSegments.length, nR: after.ropes.length,
       pulleyRopes: after.elements.filter(e=>e.type==='pulley').length,
       valid: STATE.ropes.every(r => STATE.elements.some(e=>e.id===r.anchorA.elementId)||STATE.floorSegments.some(s=>s.id===r.anchorA.elementId)) })
  `);
  truthy('왕복 후 데이터 동일 (id 제외)', r.same);
  expect('요소 수', r.nE, 4, 0, '개');
  expect('바닥면 수', r.nF, 2, 0, '개');
  expect('실 수', r.nR, 5, 0, '개');
  truthy('실 앵커가 새 id 를 가리킨다', r.valid);
  truthy('링크가 짧다 (< 600자)', r.len < 600);
});

scenario('S11-11', '공유 링크 — 용수철 양끝 참조·복원 후 물리가 같다', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('spring', { history:false, view:false });
    _begin(); _run(1.0); const v1 = STATE.elements.find(e=>e.type==='rect').vx;
    stopSimulation(); STATE.simMode='EDIT'; restoreSnapshot();
    const str = encodeScene();
    loadSceneData(decodeScene(str), { history:false });
    const sp = STATE.elements.find(e=>e.type==='spring');
    const okRef = STATE.floorSegments.some(s=>s.id===sp.leftElementId) && STATE.elements.some(e=>e.id===sp.rightElementId);
    _begin(); _run(1.0); const v2 = STATE.elements.find(e=>e.type==='rect').vx;
    ({ okRef, v1, v2, locked: sp.leftLocked && sp.rightLocked })
  `);
  truthy('용수철 양끝이 복원된 벽·물체를 가리킨다', r.okRef);
  truthy('체결 상태 유지', r.locked);
  expect('복원 후 1 s 속도 동일', r.v2, r.v1, 1e-6, 'm/s');
});

scenario('S11-12', '공유 링크 — 해시에서 복원 (applySceneFromHash)', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('atwood', { history:false, view:false });
    const url = sceneShareURL();
    STATE.elements = []; STATE.floorSegments = []; STATE.ropes = [];
    location.hash = url.slice(url.indexOf('#'));
    const ok = applySceneFromHash();
    ({ ok, n: STATE.elements.length, hasS: /#s=/.test(url) })
  `);
  truthy('URL 에 #s= 가 있다', r.hasS);
  truthy('복원 성공', r.ok);
  expect('요소 3개 복원', r.n, 3, 0, '개');
});

/* ────────────────────────────────────────────────────────────── */
scenario('S11-13', '시계열 — 기록·가속도(Δv/dt)·에너지 열·CSV', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('freefall', { history:false, view:false });
    _begin(); _run(0.5);
    const b = [...SERIES.bodies.values()][0];
    const csv = seriesToCSV();
    const lines = csv.split('\\n');
    ({ n: SERIES.t.length, tEnd: SERIES.t[SERIES.t.length-1], ay: b.ay[10], labels: [...SERIES.bodies.values()].map(x=>x.label),
       head: lines[0], rows: lines.length - 1, cols: lines[0].split(',').length, eTot: SERIES.sys.e[0], eEnd: SERIES.sys.e[SERIES.sys.e.length-1] })
  `);
  expect('30 스텝 기록', r.n, 30, 0, '행');
  expect('마지막 시각 0.5 s', r.tEnd, 0.5, 1e-6, 's');
  expect('자유낙하 가속도 ay = −g', r.ay, -9.8, 0.05, 'm/s²');
  truthy('물체 이름 원1·원2', r.labels.join(',') === '원1,원2');
  truthy('CSV 헤더에 t[s] 와 E_total', /^t\[s\]/.test(r.head) && /E_total\[J\]$/.test(r.head));
  expect('CSV 행 수 = 기록 수', r.rows, r.n, 0, '행');
  expect('열 수 = 1 + 2×9 + 4', r.cols, 23, 0, '열');
  expect('총에너지 보존(자유낙하)', r.eEnd, r.eTot, '0.5%', 'J');
});

scenario('S11-14', '시계열 — 상한 초과 시 절반 솎아내기, 초기화 시 잔상 보관', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    loadScene('freefall', { history:false, view:false });
    _begin();
    for (let i = 0; i < SERIES_CAP + 100; i++) simStep(CONFIG.FIXED_DT);
    const n = SERIES.t.length, dec = SERIES.decim;
    keepSeriesAsGhost();
    ({ n, dec, ghost: !!SERIES.ghost, gn: SERIES.ghost.t.length })
  `);
  truthy('행 수가 상한 아래', r.n <= 12000);
  expect('기록 간격 2배', r.dec, 2, 0, '');
  truthy('잔상 보관', r.ghost && r.gn === r.n);
});

/* ────────────────────────────────────────────────────────────── */
scenario('S11-15', '편집 경고 — 규칙별 문구와 이벤트', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    let got = null; EVENTS.on('validated', w => { got = w; });
    const out = {};
    STATE.elements = []; STATE.floorSegments = []; STATE.ropes = [];
    validateAll(); out.empty = STATE.warnings.slice();
    STATE.floorSegments.push(new FloorSegment(40,60,60,60)); validateAll(); out.noBody = STATE.warnings.slice();
    const s = new Spring(); s.gridX = 50; s.gridY = 50; STATE.elements.push(s); validateAll(); out.spring = STATE.warnings.slice();
    STATE.elements = [];
    const p = new Pulley(); p.gridX = 49; p.gridY = 40; STATE.elements.push(p); validateAll(); out.pulley = STATE.warnings.slice();
    STATE.elements = [];
    const f = new ExtForce(); f.gridX = 50; f.gridY = 50; STATE.elements.push(f); validateAll(); out.ext = STATE.warnings.slice();
    STATE.elements = [];
    const r1 = new RectBody(); r1.gridX = 50; r1.gridY = 55; const r2 = new RectBody(); r2.gridX = 50.5; r2.gridY = 55;
    STATE.elements.push(r1, r2); validateAll(); out.overlap = STATE.warnings.slice();
    r2.gridX = 52; validateAll(); out.clean = STATE.warnings.slice();
    ({ out, eventOk: Array.isArray(got) })
  `);
  truthy('빈 장면: 경고 없음', r.out.empty.length === 0);
  truthy('바닥만: 움직일 물체 없음', r.out.noBody.includes('움직일 물체가 없습니다'));
  truthy('홀로 놓인 용수철', r.out.spring.includes('용수철이 아무것에도 붙어 있지 않습니다'));
  truthy('실 없는 도르래', r.out.pulley.includes('실이 걸리지 않은 도르래가 있습니다'));
  truthy('실 없는 외력', r.out.ext.includes('실이 연결되지 않은 외력이 있습니다'));
  truthy('겹친 물체', r.out.overlap.includes('물체가 서로 겹쳐 있습니다'));
  truthy('떨어뜨리면 경고 사라짐', r.out.clean.length === 0);
  truthy("'validated' 이벤트 수신", r.eventOk);
});

scenario('S11-16', '이벤트 버스 — on/off/emit, 핸들러 예외 격리, sim 이벤트', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const log = [];
    const off = EVENTS.on('x', v => log.push('a' + v));
    EVENTS.on('x', () => { throw new Error('boom'); });
    EVENTS.on('x', v => log.push('b' + v));
    const origErr = console.error; console.error = () => {};
    EVENTS.emit('x', 1); off(); EVENTS.emit('x', 2);
    console.error = origErr;
    const simLog = [];
    for (const n of ['sim:start','sim:pause','sim:resume','sim:stop']) EVENTS.on(n, () => simLog.push(n));
    STATE.elements = [new RectBody()]; startSimulation(); pauseSimulation(); resumeSimulation(); stopSimulation();
    ({ log: log.join(','), simLog: simLog.join(',') })
  `);
  truthy('예외 핸들러 뒤의 핸들러도 실행', r.log === 'a1,b1,b2');
  truthy('sim 이벤트 4종', r.simLog === 'sim:start,sim:pause,sim:resume,sim:stop');
});

scenario('S11-17', '느린 배속 · 한 스텝 버튼', () => {
  const a = app(); a.evalIn(RUN);
  const r = a.evalIn(`
    const levels = SPEED_LEVELS.slice();
    STATE.elements = [new RectBody()]; startSimulation(); pauseSimulation();
    const t0 = STATE.simTime;
    ({ levels, hasSlow: levels.includes(0.25) && levels.includes(0.5), t0 })
  `);
  truthy('0.25x·0.5x 존재', r.hasSlow);
  const stepped = a.evalIn(`
    // 버튼 핸들러를 직접 호출 (dom-harness 의 fire 는 요소 변수를 평가한다)
    __r = null;
  `);
  const n = a.fire('btnStep', 'click', {});
  const t = a.evalIn(`STATE.simTime`);
  truthy('한 스텝 핸들러 등록', n >= 1);
  expect('일시정지 중 한 스텝 = 1/60 s', t, 1 / 60, 1e-9, 's');
  const t2 = a.evalIn(`STATE.simMode = 'RUNNING'; STATE.simTime`);
  a.fire('btnStep', 'click', {});
  expect('실행 중에는 무시', a.evalIn(`STATE.simTime`), t2, 1e-12, 's');
});

scenario('S11-18', 'index.html — 캐시 버스터와 새 DOM 요소', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = html.match(/<script src="[^"]+"><\/script>/g) || [];
  const links = html.match(/<link rel="stylesheet" href="[^"]+">/g) || [];
  truthy('모든 스크립트에 ?v=', scripts.length > 0 && scripts.every(s => /\?v=\d{8}/.test(s)));
  truthy('모든 스타일시트에 ?v=', links.length > 0 && links.every(s => /\?v=\d{8}/.test(s)));
  truthy('main.css 제거됨', !/css\/main\.css/.test(html) && !fs.existsSync(path.join(__dirname, '..', 'css', 'main.css')));
  for (const id of ['start-guide', 'status-chip', 'help-panel', 'gallery-panel', 'tool-bar', 'toast', 'tb-share', 'tb-csv', 'tb-gallery', 'tb-help', 'sg-gallery']) {
    truthy(`#${id} 존재`, html.includes(`id="${id}"`));
  }
  truthy('warning-bar 제거됨', !html.includes('warning-bar'));
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
