/* ============================================================
   test/spec8.js — 실행 중 UI 동작 검증
     실제 등록된 포인터/휠 핸들러에 합성 이벤트를 흘려보내
       · 실행 중 카메라 조작(휠 줌 / 핀치 줌 / 1포인터 팬)이 되는지
       · 실행 중 편집(선택·이동)은 여전히 막히는지
       · 실행 상태 배지가 올바르게 갱신되는지
     를 확인한다.
   실행: node test/spec8.js
   ============================================================ */
'use strict';
const { scenario, expect, note, report } = require('./harness');
const { loadApp } = require('./dom-harness');

/** 기본 씬이 올라간 앱 하네스 */
function app() {
  const a = loadApp();
  if (a.errors.length) throw new Error('로드 실패: ' + a.errors.map(e => e.file).join(', '));
  a.evalIn(`
    CONFIG.cellSize = 8;
    VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;
    STATE.elements = []; STATE.floorSegments = []; STATE.ropes = [];
    STATE.selected = null; STATE.simMode = 'EDIT'; STATE.interactionMode = 'IDLE';
    STATE.activePointers.clear();
    const f = new FloorSegment(0, 60, 100, 60); STATE.floorSegments.push(f);
    const r = new RectBody(); r.gridX = 50; r.gridY = 30; STATE.elements.push(r);
  `);
  return a;
}

/** 시뮬 시작 (버튼 클릭과 동일 경로) */
const START = `startSimulation();`;

/* ════════════════════════════════════════════════════════════
   실행 중 카메라 조작
   ════════════════════════════════════════════════════════════ */

scenario('RUN-PAN', '실행 중 1포인터 드래그로 카메라 팬', () => {
  const a = app();
  a.evalIn(START);
  expect('실행 상태', a.evalIn(`STATE.simMode`) === 'RUNNING' ? 1 : 0, 1, 0, '');

  const before = a.evalIn(`({ x: VIEWPORT.offsetX, y: VIEWPORT.offsetY })`);
  a.fire('mainCanvas', 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  expect('PANNING 진입', a.evalIn(`STATE.interactionMode`) === 'PANNING' ? 1 : 0, 1, 0, '');
  a.fire('mainCanvas', 'pointermove', { pointerId: 1, clientX: 150, clientY: 130 });
  const after = a.evalIn(`({ x: VIEWPORT.offsetX, y: VIEWPORT.offsetY })`);
  note('offset 변화', `(${before.x},${before.y}) → (${after.x},${after.y})`);
  expect('offsetX 이동량', after.x - before.x, 50, 1e-9, 'px');
  expect('offsetY 이동량', after.y - before.y, 30, 1e-9, 'px');

  a.fire('mainCanvas', 'pointerup', { pointerId: 1, clientX: 150, clientY: 130 });
  expect('종료 후 IDLE 복귀', a.evalIn(`STATE.interactionMode`) === 'IDLE' ? 1 : 0, 1, 0, '');
  expect('시뮬은 계속 RUNNING', a.evalIn(`STATE.simMode`) === 'RUNNING' ? 1 : 0, 1, 0, '');
});

scenario('RUN-WHEEL', '실행 중 휠 줌 — 커서 위치를 기준점으로 확대/축소', () => {
  const a = app();
  a.evalIn(START);
  const s0 = a.evalIn(`VIEWPORT.scale`);
  // 커서 아래 월드 좌표는 줌 전후로 화면상 같은 위치에 있어야 한다
  const w0 = a.evalIn(`screenToWorld(300, 200)`);
  a.fire('mainCanvas', 'wheel', { deltaY: -100, clientX: 300, clientY: 200 });
  const s1 = a.evalIn(`VIEWPORT.scale`);
  const w1 = a.evalIn(`screenToWorld(300, 200)`);
  note('scale', `${s0} → ${s1}`);
  expect('확대됨 (×1.1)', s1, s0 * 1.1, 1e-9, '배');
  expect('기준점 월드 x 고정', w1.x, w0.x, 1e-9);
  expect('기준점 월드 y 고정', w1.y, w0.y, 1e-9);

  a.fire('mainCanvas', 'wheel', { deltaY: +100, clientX: 300, clientY: 200 });
  expect('축소됨 (×0.9)', a.evalIn(`VIEWPORT.scale`), s1 * 0.9, 1e-9, '배');
  expect('시뮬은 계속 RUNNING', a.evalIn(`STATE.simMode`) === 'RUNNING' ? 1 : 0, 1, 0, '');
});

scenario('RUN-PINCH', '실행 중 2포인터 핀치 줌', () => {
  const a = app();
  a.evalIn(START);
  const s0 = a.evalIn(`VIEWPORT.scale`);
  a.fire('mainCanvas', 'pointerdown', { pointerId: 1, clientX: 200, clientY: 200 });
  a.fire('mainCanvas', 'pointerdown', { pointerId: 2, clientX: 300, clientY: 200 });
  expect('핀치 기준거리 기록', a.evalIn(`STATE.prevPinchDist`), 100, 1e-9, 'px');
  // 두 손가락을 2배로 벌림
  a.fire('mainCanvas', 'pointermove', { pointerId: 2, clientX: 400, clientY: 200 });
  const s1 = a.evalIn(`VIEWPORT.scale`);
  note('scale', `${s0} → ${s1}`);
  expect('배율 2배', s1, s0 * 2, 1e-9, '배');
  a.fire('mainCanvas', 'pointerup', { pointerId: 2, clientX: 400, clientY: 200 });
  a.fire('mainCanvas', 'pointerup', { pointerId: 1, clientX: 200, clientY: 200 });
  expect('핀치 상태 해제', a.evalIn(`STATE.prevPinchDist === null`) ? 1 : 0, 1, 0, '');
});

scenario('RUN-PAN-PAUSED', '일시정지 중에도 카메라 조작 가능', () => {
  const a = app();
  a.evalIn(START);
  a.evalIn(`pauseSimulation();`);
  expect('PAUSED 상태', a.evalIn(`STATE.simMode`) === 'PAUSED' ? 1 : 0, 1, 0, '');
  const before = a.evalIn(`VIEWPORT.offsetX`);
  a.fire('mainCanvas', 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  a.fire('mainCanvas', 'pointermove', { pointerId: 1, clientX: 60, clientY: 100 });
  expect('팬 동작', a.evalIn(`VIEWPORT.offsetX`) - before, -40, 1e-9, 'px');
  a.fire('mainCanvas', 'pointerup', { pointerId: 1, clientX: 60, clientY: 100 });
  const s0 = a.evalIn(`VIEWPORT.scale`);
  a.fire('mainCanvas', 'wheel', { deltaY: -100, clientX: 300, clientY: 200 });
  expect('휠 줌 동작', a.evalIn(`VIEWPORT.scale`), s0 * 1.1, 1e-9, '배');
});

/* ════════════════════════════════════════════════════════════
   실행 중 편집은 여전히 차단
   ════════════════════════════════════════════════════════════ */

scenario('RUN-NOEDIT', '실행 중 편집 차단 — 선택·이동·리사이즈 불가', () => {
  const a = app();
  // 편집 모드에서는 물체를 집어 드래그할 수 있어야 한다 (대조군)
  const pos = a.evalIn(`
    const r = STATE.elements[0];
    ({ sx: (r.gridX + 0.5) * CONFIG.cellSize * VIEWPORT.scale + VIEWPORT.offsetX,
       sy: (r.gridY + 0.5) * CONFIG.cellSize * VIEWPORT.scale + VIEWPORT.offsetY });`);
  a.fire('mainCanvas', 'pointerdown', { pointerId: 1, clientX: pos.sx, clientY: pos.sy });
  const editMode = a.evalIn(`STATE.interactionMode`);
  const editSel  = a.evalIn(`STATE.selected !== null`);
  a.fire('mainCanvas', 'pointerup', { pointerId: 1, clientX: pos.sx, clientY: pos.sy });
  note('EDIT 모드에서 클릭 결과', `interactionMode=${editMode}, selected=${editSel}`);
  expect('대조군: EDIT 에서는 선택됨', editSel ? 1 : 0, 1, 0, '');

  // 실행 중에는 같은 클릭이 선택/드래그가 아니라 팬이어야 한다
  a.evalIn(`_selectObject(null); STATE.interactionMode = 'IDLE'; STATE.activePointers.clear();`);
  a.evalIn(START);
  const gridBefore = a.evalIn(`({ x: STATE.elements[0].gridX, y: STATE.elements[0].gridY })`);
  a.fire('mainCanvas', 'pointerdown', { pointerId: 1, clientX: pos.sx, clientY: pos.sy });
  expect('선택되지 않음', a.evalIn(`STATE.selected === null`) ? 1 : 0, 1, 0, '');
  expect('DRAGGING 아님 (PANNING)', a.evalIn(`STATE.interactionMode`) === 'PANNING' ? 1 : 0, 1, 0, '');
  a.fire('mainCanvas', 'pointermove', { pointerId: 1, clientX: pos.sx + 80, clientY: pos.sy + 80 });
  a.fire('mainCanvas', 'pointerup',   { pointerId: 1, clientX: pos.sx + 80, clientY: pos.sy + 80 });
  const gridAfter = a.evalIn(`({ x: STATE.elements[0].gridX, y: STATE.elements[0].gridY })`);
  note('물체 격자 위치', `(${gridBefore.x},${gridBefore.y}) → (${gridAfter.x},${gridAfter.y})`);
  // 시뮬레이션 자체는 아직 스텝을 돌리지 않았으므로 위치가 그대로여야 한다
  expect('드래그로 물체가 끌려가지 않음', gridAfter.x, gridBefore.x, 1e-9);
});

scenario('RUN-NOEDIT-CTX', '실행 중 우클릭 컨텍스트 메뉴 열리지 않음', () => {
  const a = app();
  a.evalIn(START);
  a.fire('mainCanvas', 'contextmenu', { clientX: 200, clientY: 200 });
  expect('선택되지 않음', a.evalIn(`STATE.selected === null`) ? 1 : 0, 1, 0, '');
});

/* ════════════════════════════════════════════════════════════
   실행 상태 배지
   ════════════════════════════════════════════════════════════ */

scenario('RUN-BADGE', '실행 상태 배지 — 표시/문구/시간/색상', () => {
  const a = app();
  const badge = () => a.evalIn(`({
    display: runIndicator.style.display,
    running: runIndicator.classList.contains('is-running'),
    paused:  runIndicator.classList.contains('is-paused'),
    label:   riLabel.textContent,
    time:    riTime.textContent,
  })`);

  a.evalIn(`_updateRunIndicator();`);
  expect('EDIT 에서는 숨김', badge().display === 'none' ? 1 : 0, 1, 0, '');

  a.evalIn(START);
  a.evalIn(`_updateRunIndicator();`);
  let b = badge();
  note('실행 중 배지', JSON.stringify(b));
  expect('표시됨',        b.display === 'flex' ? 1 : 0, 1, 0, '');
  expect('is-running',    b.running ? 1 : 0, 1, 0, '');
  expect('is-paused 아님', b.paused ? 1 : 0, 0, 0, '');
  expect('문구 = 실행 중', b.label === '실행 중' ? 1 : 0, 1, 0, '');
  expect('시간 0.00s',    b.time === '0.00s' ? 1 : 0, 1, 0, '');

  // 시뮬 시간 누적 표시
  a.evalIn(`for (let i=0;i<120;i++){ simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; } _updateRunIndicator();`);
  expect('2초 경과 표시', badge().time === '2.00s' ? 1 : 0, 1, 0, '');

  // 배속 표시
  a.evalIn(`STATE.speedMultiplier = 10; _updateRunIndicator();`);
  expect('배속 문구', badge().label === '실행 중 10x' ? 1 : 0, 1, 0, '');
  a.evalIn(`STATE.speedMultiplier = 1;`);

  // 일시정지
  a.evalIn(`pauseSimulation(); _updateRunIndicator();`);
  b = badge();
  note('일시정지 배지', JSON.stringify(b));
  expect('is-paused',      b.paused ? 1 : 0, 1, 0, '');
  expect('is-running 아님', b.running ? 1 : 0, 0, 0, '');
  expect('문구 = 일시정지', b.label === '일시정지' ? 1 : 0, 1, 0, '');
  expect('정지 중 시간 고정', b.time === '2.00s' ? 1 : 0, 1, 0, '');

  // 초기화 → 숨김 + 시간 리셋
  a.evalIn(`STATE.simMode = 'EDIT'; STATE.simTime = 0; _updateRunIndicator();`);
  expect('초기화 후 숨김', badge().display === 'none' ? 1 : 0, 1, 0, '');
});

scenario('RUN-BADGE-RESTART', '재실행 시 시뮬 시간이 0부터 다시 시작', () => {
  const a = app();
  a.evalIn(START);
  a.evalIn(`for (let i=0;i<60;i++){ simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; }`);
  expect('1초 경과', a.evalIn(`STATE.simTime`), 1, 1e-9, 's');
  a.evalIn(`startSimulation();`);
  expect('재실행 시 0으로 리셋', a.evalIn(`STATE.simTime`), 0, 1e-12, 's');
});

/* ════════════════════════════════════════════════════════════
   물체 궤적 (물체별 표시 토글)
   ════════════════════════════════════════════════════════════ */

scenario('TRAIL-RECORD', '실행하면 물체마다 궤적이 쌓인다', () => {
  const a = app();
  const r = a.evalIn(`
    STATE.elements = [];
    const b = new RectBody();   b.gridX = 50; b.gridY = 20; b.mass = 1; STATE.elements.push(b);
    const c = new CircleBody(); c.gridX = 30; c.gridY = 20; c.mass = 1; c.vx0 = 4; STATE.elements.push(c);
    startSimulation();
    const before = b._trail.length;
    for (let i = 0; i < 120; i++) simStep(CONFIG.FIXED_DT);   // 2초 자유낙하
    ({ before, rect: b._trail.length, circ: c._trail.length,
       first: b._trail[0], last: b._trail[b._trail.length - 1],
       cx: b.gridX + b.gridW/2, cy: b.gridY + b.gridH/2 });`);
  note('점 개수 (사각/원)', `${r.rect} / ${r.circ}`);
  expect('시작 시 비어 있음', r.before, 0, 0, '개');
  expect('사각형 궤적 기록됨', r.rect > 10 ? 1 : 0, 1, 0, '');
  expect('원 궤적도 기록됨',   r.circ > 10 ? 1 : 0, 1, 0, '');
  expect('마지막 점 = 현재 중심 x', r.last.x, r.cx, 1e-9, '칸');
  expect('마지막 점 = 현재 중심 y', r.last.y, r.cy, 1e-9, '칸');
  expect('자유낙하라 아래로 진행', r.last.y > r.first.y ? 1 : 0, 1, 0, '');
});

scenario('TRAIL-TOGGLE', '표시를 끄면 기록도 멈추고 기존 궤적도 비운다', () => {
  const a = app();
  const r = a.evalIn(`
    STATE.elements = [];
    const b = new RectBody(); b.gridX = 50; b.gridY = 20; STATE.elements.push(b);
    startSimulation();
    for (let i = 0; i < 60; i++) simStep(CONFIG.FIXED_DT);
    const onCount = b._trail.length;
    b.showTrail = false;                                   // 끔
    simStep(CONFIG.FIXED_DT);
    const rightAfterOff = b._trail.length;
    for (let i = 0; i < 60; i++) simStep(CONFIG.FIXED_DT);
    const offCount = b._trail.length;
    b.showTrail = true;                                    // 다시 켬
    for (let i = 0; i < 30; i++) simStep(CONFIG.FIXED_DT);
    ({ onCount, rightAfterOff, offCount, backOn: b._trail.length,
       defaultOn: (new RectBody()).showTrail });`);
  note('켬 → 끈 직후 → 꺼둔 채 → 다시 켬', `${r.onCount} → ${r.rightAfterOff} → ${r.offCount} → ${r.backOn}`);
  expect('기본값은 표시 ON', r.defaultOn ? 1 : 0, 1, 0, '');
  expect('켜 두면 기록됨', r.onCount > 10 ? 1 : 0, 1, 0, '');
  expect('끄면 기존 궤적도 비워짐', r.rightAfterOff, 0, 0, '개');
  expect('꺼둔 동안 쌓이지 않음', r.offCount, 0, 0, '개');
  expect('다시 켜면 그 시점부터 새로 기록', r.backOn > 0 ? 1 : 0, 1, 0, '');
});

scenario('TRAIL-DRAW', '표시 여부에 따라 그려지거나 빠진다', () => {
  const a = app();
  // drawScene 이 실제로 그리는 선분 수를 세어 확인
  const count = (showA, showB) => a.evalIn(`
    STATE.elements = [];
    const b1 = new RectBody(); b1.gridX = 40; b1.gridY = 20; STATE.elements.push(b1);
    const b2 = new RectBody(); b2.gridX = 60; b2.gridY = 20; STATE.elements.push(b2);
    startSimulation();
    for (let i = 0; i < 60; i++) simStep(CONFIG.FIXED_DT);
    b1.showTrail = ${showA}; b2.showTrail = ${showB};
    let strokes = 0, moves = 0;
    const real = mainCtx.beginPath;
    const rec = { n: 0 };
    // _drawTrails 만 따로 호출해 moveTo 횟수로 궤적 개수를 센다
    const probe = new Proxy({}, { get: (t, k) => {
      if (k === 'moveTo') return () => { rec.n++; };
      if (k === 'setLineDash') return () => {};
      return () => {};
    }});
    _drawTrails(probe);
    rec.n;`);
  const both = count('true', 'true');
  const one  = count('true', 'false');
  const none = count('false', 'false');
  note('그려진 궤적 수 (둘/하나/없음)', `${both} / ${one} / ${none}`);
  expect('둘 다 켜면 2개', both, 2, 0, '개');
  expect('하나만 켜면 1개', one, 1, 0, '개');
  expect('둘 다 끄면 0개', none, 0, 0, '개');
});

scenario('TRAIL-RESET', '재실행·초기화 시 궤적이 지워진다', () => {
  const a = app();
  const r = a.evalIn(`
    STATE.elements = [];
    const b = new RectBody(); b.gridX = 50; b.gridY = 20; STATE.elements.push(b);
    startSimulation();
    for (let i = 0; i < 60; i++) simStep(CONFIG.FIXED_DT);
    const grew = b._trail.length;
    startSimulation();                       // 재실행
    const afterRestart = b._trail.length;
    for (let i = 0; i < 60; i++) simStep(CONFIG.FIXED_DT);
    restoreSnapshot();                       // 초기화 버튼 경로
    const afterReset = STATE.elements[0]._trail ? STATE.elements[0]._trail.length : 0;
    ({ grew, afterRestart, afterReset });`);
  note('쌓임 / 재실행 후 / 초기화 후', `${r.grew} / ${r.afterRestart} / ${r.afterReset}`);
  expect('실행 중 쌓임', r.grew > 10 ? 1 : 0, 1, 0, '');
  expect('재실행 시 0', r.afterRestart, 0, 0, '개');
  expect('초기화 시 0', r.afterReset, 0, 0, '개');
});

scenario('TRAIL-SERIALIZE', '궤적은 스냅샷·실행취소 기록에 들어가지 않는다', () => {
  const a = app();
  const r = a.evalIn(`
    STATE.elements = [];
    const b = new RectBody(); b.gridX = 50; b.gridY = 20; STATE.elements.push(b);
    startSimulation();
    for (let i = 0; i < 300; i++) simStep(CONFIG.FIXED_DT);
    const n = b._trail.length;
    const ser = b.serialize();
    saveSnapshot();
    ({ n, hasTrail: '_trail' in ser, snapLen: STATE.snapshot.length,
       snapHasTrail: STATE.snapshot.includes('_trail'),
       keepsShowTrail: 'showTrail' in ser });`);
  note('점 개수 / 스냅샷 크기', `${r.n} / ${r.snapLen} bytes`);
  expect('궤적 점이 충분히 쌓임', r.n > 50 ? 1 : 0, 1, 0, '');
  expect('serialize 에 _trail 없음', r.hasTrail ? 1 : 0, 0, 0, '');
  expect('스냅샷에도 _trail 없음', r.snapHasTrail ? 1 : 0, 0, 0, '');
  expect('표시 설정(showTrail)은 보존', r.keepsShowTrail ? 1 : 0, 1, 0, '');
});

scenario('TRAIL-STATIONARY', '정지 물체는 점을 무한히 쌓지 않는다', () => {
  const a = app();
  const r = a.evalIn(`
    STATE.elements = []; STATE.floorSegments = [];
    STATE.floorSegments.push(new FloorSegment(0, 60, 100, 60));
    const b = new RectBody(); b.gridX = 50; b.gridY = 59; b.e = 0; STATE.elements.push(b);
    startSimulation();
    for (let i = 0; i < 60; i++) simStep(CONFIG.FIXED_DT);
    const settled = b._trail.length;
    for (let i = 0; i < 1800; i++) simStep(CONFIG.FIXED_DT);   // 30초 더
    ({ settled, after: b._trail.length, cap: CONFIG.TRAIL_MAX_POINTS });`);
  note('안정 후 / 30초 뒤', `${r.settled} / ${r.after}`);
  expect('정지 후 점이 늘지 않음', r.after - r.settled, 0, 0, '개');
  expect('상한 이하', r.after <= r.cap ? 1 : 0, 1, 0, '');
});

scenario('TRAIL-SVG', 'SVG 내보내기에 궤적이 포함된다 (표시 중인 것만)', () => {
  const a = app();
  const r = a.evalIn(`
    CONFIG.cellSize = 8; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;
    STATE.elements = []; STATE.floorSegments = []; STATE.ropes = [];
    const b1 = new RectBody(); b1.gridX = 40; b1.gridY = 20; STATE.elements.push(b1);
    const b2 = new RectBody(); b2.gridX = 60; b2.gridY = 20; STATE.elements.push(b2);
    startSimulation();
    for (let i = 0; i < 60; i++) simStep(CONFIG.FIXED_DT);
    b2.showTrail = false;
    const svg = buildSceneSVG();
    ({ dashed: (svg.match(/stroke-dasharray/g) || []).length,
       chromatic: /stroke="#(?!000000)[0-9a-f]{6}"/i.test(svg),
       hasNaN: /NaN|undefined/.test(svg) });`);
  note('점선 path 수', r.dashed);
  expect('표시 중인 1개만 점선 궤적으로 출력', r.dashed, 1, 0, '개');
  expect('여전히 흑백', r.chromatic ? 1 : 0, 0, 0, '');
  expect('NaN 없음', r.hasNaN ? 1 : 0, 0, 0, '');
});

report();
process.exit(0);
