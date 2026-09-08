/* ============================================================
   test/spec13.js — 3단계 교육 활동: 헤드리스 측정 · POE 예제 정합성(정답 = 시뮬) ·
                   비교표 · 수치 문항 · 해설 카드 · 파라미터 스윕
   실행: node test/spec13.js
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
function app() { const a = loadApp(); a.evalIn(`CONFIG.cellSize = 8; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;`); return a; }

/* ────────────────────────────────────────────────────────────── */
scenario('S13-1', '헤드리스 — 장면을 돌려도 현재 STATE 는 그대로', () => {
  const a = app();
  const r = a.evalIn(`
    loadScene('spring', { history:false, view:false });
    const before = JSON.stringify(sceneToData());
    const mode = STATE.simMode;
    const T = measureScene(sceneToData(), { body:'A', q:'period', T: 6 });
    const after = JSON.stringify(sceneToData());
    ({ same: before === after, mode2: STATE.simMode, mode, T, active: HEADLESS.active, series: SERIES.t.length })
  `);
  truthy('장면 데이터 불변', r.same);
  truthy('모드 EDIT 유지', r.mode === 'EDIT' && r.mode2 === 'EDIT');
  expect('주기 측정', r.T, 2 * Math.PI * Math.sqrt(0.1), '3%', 's');
  truthy('플래그 해제·시계열 미기록', r.active === false && r.series === 0);
});

scenario('S13-2', '헤드리스 측정 규격 — at / when:floor / stat:time / stat:dist / stat:max / variant', () => {
  const a = app();
  const r = a.evalIn(`
    loadScene('atwood', { history:false, view:false });
    const d = sceneToData();
    const T = measureScene(d, { body:'B', q:'T', at: 0.5 });
    const a3 = measureScene(applyVariant(d, { B: { mass: 3 } }), { body:'B', q:'a', at: 0.5 });
    loadScene('freefall', { history:false, view:false });
    const tf = measureScene(sceneToData(), { body:'A', q:'v', when:'floor', stat:'time' });
    const vf = measureScene(sceneToData(), { body:'A', q:'v', when:'floor' });
    loadScene('pendulum', { history:false, view:false });
    const vmax = measureScene(sceneToData(), { body:'A', q:'v', stat:'max', T: 3 });
    const Tmax = measureScene(sceneToData(), { body:'A', q:'T', stat:'max', T: 3 });
    buildSceneFromSpec({ floors:[{ key:'F', x1:30, y1:60, x2:80, y2:60, isFriction:true, muS:0.3, muK:0.25 }], elements:[{ key:'A', type:'rect', gridX:36, gridY:59, mass:1, vx0:4 }] }, { history:false, view:false });
    const dist = measureScene(sceneToData(), { body:'A', q:'x', when:'stop', stat:'dist', T: 8 });
    ({ T, a3, tf, vf, vmax, Tmax, dist })
  `);
  expect('아트우드 장력', r.T, 11.76, '1%', 'N');
  expect('변형(3 kg) 가속도 g(3−1)/4', r.a3, 4.9, '2%', 'm/s²');
  expect('자유낙하 도달 시각 √(2h/g), h=15.5', r.tf, Math.sqrt(2 * 15.5 / 9.8), 0.03, 's');
  expect('도달 속력 √(2gh)', r.vf, Math.sqrt(2 * 9.8 * 15.5), '3%', 'm/s');
  expect('진자 최대 속력', r.vmax, Math.sqrt(2 * 9.8 * 8 * (1 - Math.cos(Math.PI / 4))), '4%', 'm/s');
  expect('진자 최대 장력 mg(3−2cos45°)', r.Tmax, 9.8 * (3 - 2 * Math.cos(Math.PI / 4)), '4%', 'N');
  expect('마찰 정지 거리 v²/(2μg)', r.dist, 16 / (2 * 0.25 * 9.8), '6%', 'm');
});

scenario('S13-3', 'POE 데이터 — 24문항 · 6분류 · 정답 하나 · 필수 필드 · 장면 로드', () => {
  const a = app();
  const r = a.evalIn(`
    const out = { n: POE_EXAMPLES.length, cats: new Set(POE_EXAMPLES.map(e => e.cat)).size, bad: [], loadFail: [], guides: POE_GUIDES.length };
    for (const ex of POE_EXAMPLES) {
      const req = ['id','cat','title','level','misconception','scene','question','observe','explain'];
      for (const k of req) if (!ex[k]) out.bad.push(ex.id + ':' + k);
      if (ex.options) { if (ex.options.filter(o => o.correct).length !== 1) out.bad.push(ex.id + ':correct'); if (ex.options.some(o => !o.correct && !o.tag)) out.bad.push(ex.id + ':tag'); }
      else if (!ex.answer) out.bad.push(ex.id + ':answer');
      if (ex.variants && !ex.measure) out.bad.push(ex.id + ':measure');
      try {
        if (typeof ex.scene === 'string') { if (!loadScene(ex.scene, { history:false, view:false })) out.loadFail.push(ex.id); }
        else buildSceneFromSpec(ex.scene, { history:false, view:false });
        if (STATE.warnings.length) out.loadFail.push(ex.id + ':warn:' + STATE.warnings[0]);
        if (ex.select && !STATE.elements.some(e => e._key === ex.select)) out.bad.push(ex.id + ':select');
      } catch (e) { out.loadFail.push(ex.id + ':' + e.message); }
    }
    for (const g of POE_GUIDES) if (!findScene(g.scene) || !g.steps || g.steps.length < 2 || !g.why) out.bad.push('guide:' + g.scene);
    out
  `);
  expect('문항 수 32', r.n, 32, 0, '개');
  expect('분류 7', r.cats, 7, 0, '개');
  expect('해설 11', r.guides, 11, 0, '개');
  truthy('필드·정답·태그 누락 없음: ' + r.bad.join(' '), r.bad.length === 0);
  truthy('모든 장면 로드, 경고 없음: ' + r.loadFail.join(' '), r.loadFail.length === 0);
});

scenario('S13-4', 'POE 정합성 — 선택지 정답이 시뮬레이션 결과와 맞는다 (핵심 문항 7개)', () => {
  const a = app();
  const r = a.evalIn(`
    const ex = id => POE_EXAMPLES.find(e => e.id === id);
    const load = (e) => { if (typeof e.scene === 'string') loadScene(e.scene, { history:false, view:false }); else buildSceneFromSpec(e.scene, { history:false, view:false }); return sceneToData(); };
    const out = {};
    // 1) 질량 다른 두 공 — 도달 시각 같음
    let d = load(ex('ff-mass'));
    out.ffA = measureScene(d, { body:'A', q:'v', when:'floor', stat:'time' }); out.ffB = measureScene(d, { body:'B', q:'v', when:'floor', stat:'time' });
    // 2) 관성 — 4 s 후 속력 3
    d = load(ex('inertia')); out.inertia = measureScene(d, { body:'A', q:'v', at: 4 });
    // 3) 정지 마찰 빗면 — 1 s 후 정지, f ≈ 8.77
    d = load(ex('incline-static')); out.stA = measureScene(d, { body:'A', q:'v', at: 1 }); out.stF = measureScene(d, { body:'A', q:'f', at: 1 });
    // 4) 6 N 당김 — 정지, 마찰 6 N ; 12 N — 움직임
    d = load(ex('pull-static')); out.pullV = measureScene(d, { body:'A', q:'v', at: 1 }); out.pullF = measureScene(d, { body:'A', q:'f', at: 1 });
    out.pull12 = measureScene(applyVariant(d, { E: { forceN: 12 } }), { body:'A', q:'a', at: 1 });
    // 5) 무거운 공 → 가벼운 공 : 2, 6
    d = load(ex('coll-heavy')); out.hA = measureScene(d, { body:'A', q:'vx', at: 4 }); out.hB = measureScene(d, { body:'B', q:'vx', at: 4 });
    // 6) 가벼운 공 → 무거운 공 : A −2
    d = load(ex('coll-light')); out.lA = measureScene(d, { body:'A', q:'vx', at: 4 });
    // 7) 급한·완만한 빗면 — 바닥 속력 같음 (S1 은 x 감소 없이 오른쪽, S2 왼쪽)
    d = load(ex('slide-path')); out.pA = measureScene(d, { body:'A', q:'v', stat:'max', T: 4.5 }); out.pB = measureScene(d, { body:'B', q:'v', stat:'max', T: 4.5 });
    out.tA = measureScene(d, { body:'A', q:'v', when:'floor', stat:'time', T: 6 });
    out
  `);
  expect('두 공 도달 시각 차', Math.abs(r.ffA - r.ffB), 0, 0.02, 's');
  expect('관성: 4 s 후 3 m/s', r.inertia, 3, 0.02, 'm/s');
  truthy('정지 마찰 빗면: 정지', r.stA < 0.02);
  expect('정지 마찰력 = mg sinθ', r.stF, 2 * 9.8 * Math.sin(Math.atan(0.5)), '2%', 'N');
  truthy('6 N 당김: 정지', r.pullV < 0.02);
  expect('마찰력 = 6 N (μN 아님)', r.pullF, 6, 0.1, 'N');
  expect('12 N: a = (12 − 0.4·19.6)/2', r.pull12, (12 - 0.4 * 19.6) / 2, '5%', 'm/s²');
  expect('무거운→가벼운: A 2 m/s', r.hA, 2, 0.05, 'm/s');
  expect('무거운→가벼운: B 6 m/s', r.hB, 6, 0.05, 'm/s');
  expect('가벼운→무거운: A −2 m/s', r.lA, -2, 0.05, 'm/s');
  expect('두 빗면 바닥 속력 같음 √(2g·11)', r.pA, Math.sqrt(2 * 9.8 * 11), '4%', 'm/s');
  expect('완만한 빗면도 같은 속력', r.pB, r.pA, '3%', 'm/s');
});

scenario('S13-5', 'POE 수치 문항 — 정답 계산·허용 오차 판정', () => {
  const a = app();
  const r = a.evalIn(`
    const ex = POE_EXAMPLES.find(e => e.id === 'atwood-a');
    POE.cur = ex; POE.step = 0; POE.picked = null; POE.numeric = null; POE.answerValue = null;
    loadScene(ex.scene, { history:false, view:false }); POE.sceneData = sceneToData();
    const ans = _answerValue(ex);
    POE.numeric = 1.9; const ok1 = isPOECorrect(ex);
    POE.numeric = 4.9; const ok2 = isPOECorrect(ex);
    const ex2 = POE_EXAMPLES.find(e => e.id === 'friction-stop');
    POE.cur = ex2; POE.answerValue = null; buildSceneFromSpec(ex2.scene, { history:false, view:false }); POE.sceneData = sceneToData();
    const ans2 = _answerValue(ex2);
    ({ ans, ok1, ok2, ans2 })
  `);
  expect('아트우드 가속도 정답', r.ans, 1.96, '3%', 'm/s²');
  truthy('1.9 는 허용(8%)', r.ok1);
  truthy('4.9 는 오답', !r.ok2);
  expect('마찰 정지 거리 정답', r.ans2, 3.27, '6%', 'm');
});

scenario('S13-6', 'POE 비교표 — 질량이 달라도 가속도 같음(빗면) · 진폭 달라도 주기 같음(용수철)', () => {
  const a = app();
  const r = a.evalIn(`
    const run = (id) => { const ex = POE_EXAMPLES.find(e => e.id === id); if (typeof ex.scene === 'string') loadScene(ex.scene, { history:false, view:false }); else buildSceneFromSpec(ex.scene, { history:false, view:false });
      const d = sceneToData(); return ex.variants.map(v => measureScene(applyVariant(d, v.set), ex.measure)); };
    ({ inc: run('incline-mass'), amp: run('spring-amp'), mass: run('spring-mass'), dist: run('friction-dist') })
  `);
  truthy('빗면 가속도 3개 모두 같다', Math.max(...r.inc) - Math.min(...r.inc) < 0.03);
  truthy('진폭 3개 주기 같다', Math.max(...r.amp) - Math.min(...r.amp) < 0.04);
  expect('질량 4배 → 주기 2배', r.mass[1] / r.mass[0], 2, 0.06, '');
  expect('질량 9배 → 주기 3배', r.mass[2] / r.mass[0], 3, 0.08, '');
  truthy('마찰 정지 거리 질량 무관', Math.max(...r.dist) - Math.min(...r.dist) < 0.08);
});

scenario('S13-7', 'POE 흐름 — 시작 → 예측(선택) → 관찰(표시 토글·선택) → 설명(기록·CSV)', () => {
  const a = app();
  const r = a.evalIn(`
    const ex = POE_EXAMPLES.find(e => e.id === 'atwood-T');
    startPOE(ex);
    const s0 = { step: POE.step, scene: STATE.elements.length, forces: STATE.showForces };
    const order = _optionOrder(ex);
    POE.picked = ex.options.findIndex(o => o.correct);
    POE.step = 1; _applyVis(ex);
    const s1 = { forces: STATE.showForces, sel: STATE.selected && STATE.selected._key };
    _record(ex);
    const csv = poeResultsCSV();
    const s2 = { n: POE.results.length, ok: POE.results[0].correct, csvRows: csv.split('\\n').length, order: order.join(',') };
    ({ s0, s1, s2, sameOrder: _optionOrder(ex).join(',') === order.join(',') })
  `);
  truthy('예측 단계에서 시작, 장면 로드(3요소), 힘 표시 꺼짐', r.s0.step === 0 && r.s0.scene === 3 && r.s0.forces === false);
  truthy('관찰: 힘 표시 켜짐, B 선택', r.s1.forces === true && r.s1.sel === 'B');
  truthy('기록 1건 정답, CSV 헤더+1행', r.s2.n === 1 && r.s2.ok === true && r.s2.csvRows === 2);
  truthy('선택지 순서 결정적', r.sameOrder);
});

scenario('S13-8', '파라미터 스윕 — 질량 스윕 → 빗면 가속도 일정 / 초기 속력 스윕 → 정지 거리 ∝ v²', () => {
  const a = app();
  const r = a.evalIn(`
    loadScene('incline', { history:false, view:false });
    const d = sceneToData();
    const A = d.elements.find(e => e._key === 'A');
    const acc = [1, 2, 4].map(m => { const dd = JSON.parse(JSON.stringify(d)); dd.elements.find(e => e._key === 'A').mass = m; return measureScene(dd, { body: A.id, q:'a', at: 1 }); });
    buildSceneFromSpec({ floors:[{ key:'F', x1:30, y1:60, x2:80, y2:60, isFriction:true, muS:0.3, muK:0.25 }], elements:[{ key:'A', type:'rect', gridX:34, gridY:59, mass:1, vx0:2 }] }, { history:false, view:false });
    const d2 = sceneToData();
    const dist = [2, 4, 6].map(v => { const dd = JSON.parse(JSON.stringify(d2)); dd.elements[0].vx0 = v; return measureScene(dd, { body: dd.elements[0].id, q:'x', when:'stop', stat:'dist', T: 10 }); });
    ({ acc, dist })
  `);
  truthy('가속도 일정', Math.max(...r.acc) - Math.min(...r.acc) < 0.03);
  expect('거리 비 (4/2)² = 4', r.dist[1] / r.dist[0], 4, 0.3, '');
  expect('거리 비 (6/2)² = 9', r.dist[2] / r.dist[0], 9, 0.7, '');
});

scenario('S13-9', 'index.html — POE·스윕 DOM, 스크립트 순서', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['poe-panel', 'poe-body', 'tb-poe', 'sg-poe', 'sweep-panel', 'tb-sweep', 'sweep-run', 'sweep-canvas', 'sweep-table']) truthy(`#${id} 존재`, html.includes(`id="${id}"`));
  const order = (html.match(/<script src="js\/([a-z-]+)\.js/g) || []).map(s => s.replace(/.*js\//, '').replace(/\.js$/, ''));
  const idx = n => order.indexOf(n);
  truthy('headless → poe-data → poe → sweep 순서, boot 앞', idx('headless') < idx('poe-data') && idx('poe-data') < idx('poe') && idx('poe') < idx('sweep') && idx('sweep') < idx('boot'));
  truthy('headless 가 scene/scenes 뒤', idx('headless') > idx('scenes'));
});


scenario('S13-10', '탐구 카드 10개 — 장면·스윕 프리셋 유효 / 공기저항 종단속도 mg/b', () => {
  const a = app();
  const r = a.evalIn(`
    const bad = [];
    for (const it of POE_IDEAS) {
      if (!it.title || !it.question || !it.vary || !it.expect || !it.sweep) bad.push(it.id + ':field');
      if (it.spec) buildSceneFromSpec(it.spec, { history:false, view:false }); else if (!loadScene(it.scene, { history:false, view:false })) bad.push(it.id + ':scene');
      if (it.set) _applySetToState(it.set);
      const t = STATE.elements.find(e => e._key === it.sweep.targetKey) || STATE.floorSegments.find(s => s._key === it.sweep.targetKey);
      const b = STATE.elements.find(e => e._key === it.sweep.bodyKey);
      if (!t) bad.push(it.id + ':target'); if (!b) bad.push(it.id + ':body');
      const props = SWEEP_PROPS[t ? t.type : ''] || [];
      if (t && !props.some(pp => pp[0] === it.sweep.prop)) bad.push(it.id + ':prop');
    }
    // 공기저항: b = 2, m = 1 → 종단속도 4.9 m/s
    buildSceneFromSpec({ floors:[{ key:'F', x1:34, y1:95, x2:72, y2:95 }], elements:[{ key:'A', type:'circle', gridX:50, gridY:5, mass:1, drag:2, e:0 }] }, { history:false, view:false });
    const vt = measureScene(sceneToData(), { body:'A', q:'v', at: 6 });
    const noDrag = measureScene(applyVariant(sceneToData(), { A: { drag: 0 } }), { body:'A', q:'v', at: 2 });
    ({ n: POE_IDEAS.length, bad, vt, noDrag })
  `);
  expect('탐구 카드 10개', r.n, 10, 0, '개');
  truthy('카드 필드·장면·프리셋 유효: ' + r.bad.join(' '), r.bad.length === 0);
  expect('종단속도 mg/b = 4.9', r.vt, 4.9, '2%', 'm/s');
  expect('저항 없으면 2 s 후 19.6', r.noDrag, 19.6, '1%', 'm/s');
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
