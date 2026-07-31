/* ============================================================
   test/spec5.js — 화면 픽셀 단위 검증
     시뮬 결과를 실제 렌더 변환(physToWorld → worldToScreen)에 통과시켜
     캔버스 픽셀 좌표로 바꾼 뒤, 물리 공식으로 계산한 픽셀 좌표와 비교한다.

   기준 뷰포트 = 앱 최초 로드 상태 (canvas.js initCanvas)
     캔버스 800×800 → cellSize = 800/100 = 8 px/m
     VIEWPORT.scale = 4.0, 격자 중앙(50,50)이 화면 중앙
     ⇒ offset = 400 − 50·8·4 = −1200
     ⇒ screenX = 32·physX − 1200,  screenY = 32·(100 − physY) − 1200
        (1 m = 32 px, 1 px = 3.125 cm)
   실행: node test/spec5.js
   ============================================================ */
'use strict';
const { scenario, expect, note, report } = require('./harness');

const G = 9.8;
const PPM = 32;                      // px per meter
const SX = (physX) => PPM * physX - 1200;
const SY = (physY) => PPM * (100 - physY) - 1200;
const PX_TOL = 1.5;                  // 1.5 px ≈ 4.7 cm

/** 앱과 동일한 뷰포트를 컨텍스트에 설정 */
const VIEWPORT_SETUP = `
  CONFIG.cellSize = 8;
  VIEWPORT.scale = 4.0;
  VIEWPORT.offsetX = 400 - (CONFIG.GRID_SIZE/2) * CONFIG.cellSize * VIEWPORT.scale;
  VIEWPORT.offsetY = 400 - (CONFIG.GRID_SIZE/2) * CONFIG.cellSize * VIEWPORT.scale;
  /** 요소 중심의 화면 픽셀 좌표 — 렌더 파이프라인과 동일 경로 */
  function screenCenter(el) {
    const cx = (el.gridX + el.gridW/2) * CONFIG.cellSize;
    const cy = (el.gridY + el.gridH/2) * CONFIG.cellSize;
    return worldToScreen(cx, cy);
  }
`;

/* ── P1. 자유낙하: 1초 뒤 화면 픽셀 위치 ── */
scenario('PX1', '자유낙하 1.0초 — 화면 y 픽셀 = 32·(100−y_공식)−1200', ({ run }) => {
  run(VIEWPORT_SETUP);
  run(`reset(); addRect({ gridX: 50, gridY: 10, gridW:1, gridH:1, mass: 2 }); begin();`);
  const t = run(`run(1.0)`);
  const p = run(`screenCenter(STATE.elements[0])`);
  const yPhys = (100 - 10 - 0.5) - 0.5 * G * t * t;   // 중심 기준
  note('실측 픽셀', `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  note('공식 픽셀', `(${SX(50.5).toFixed(2)}, ${SY(yPhys).toFixed(2)})`);
  expect('화면 x [px]', p.x, SX(50.5), 0.01, 'px');
  expect('화면 y [px]', p.y, SY(yPhys), PX_TOL, 'px');
});

/* ── P2. 포물선: 여러 시각의 픽셀 궤적 ── */
scenario('PX2', '포물선 궤적 — 0.3/0.6/0.9/1.2초 픽셀 좌표', ({ run }) => {
  run(VIEWPORT_SETUP);
  run(`reset(); addRect({ gridX: 20, gridY: 50, gridW:1, gridH:1, mass: 1, vx0: 6, vy0: 8 }); begin();`);
  let t = 0;
  for (const step of [0.3, 0.3, 0.3, 0.3]) {
    t += run(`run(${step})`);
    const p = run(`screenCenter(STATE.elements[0])`);
    const xPhys = 20.5 + 6 * t;
    const yPhys = 49.5 + 8 * t - 0.5 * G * t * t;
    expect(`t=${t.toFixed(1)}s  x [px]`, p.x, SX(xPhys), 0.05, 'px');
    expect(`t=${t.toFixed(1)}s  y [px]`, p.y, SY(yPhys), PX_TOL, 'px');
  }
});

/* ── P3. 바닥 안착 위치 픽셀 ── */
scenario('PX3', '바닥 안착 — 물체 밑면이 바닥선과 픽셀 단위로 일치', ({ run }) => {
  run(VIEWPORT_SETUP);
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 30, gridW:1, gridH:1, mass: 1, e: 0 }); begin();`);
  run(`run(5.0)`);
  const r = run(`
    const el = STATE.elements[0];
    const bottomWorldY = (el.gridY + el.gridH) * CONFIG.cellSize;
    const floorWorldY  = STATE.floorSegments[0].y1 * CONFIG.cellSize;
    ({ bottom: worldToScreen(0, bottomWorldY).y, floor: worldToScreen(0, floorWorldY).y });`);
  note('물체 밑면 / 바닥선 [px]', `${r.bottom.toFixed(3)} / ${r.floor.toFixed(3)}`);
  expect('밑면과 바닥선 픽셀 차', r.bottom - r.floor, 0, 0.5, 'px');
  expect('바닥선 화면 y [px]', r.floor, SY(40), 0.01, 'px');
});

/* ── P4. 반발 높이 픽셀 ── */
scenario('PX4', '반발계수 e=0.5 반등 정점 — 픽셀 높이 = 0.25·낙차', ({ run }) => {
  run(VIEWPORT_SETUP);
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 39, gridW:1, gridH:1, mass: 1, e: 0.5 }); begin();`);
  const r = run(`
    const el = STATE.elements[0];
    for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (el.vy>0) break; }
    for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (el.vy<=0) break; }
    ({ topScreenY: screenCenter(el).y, y: el.physY });`);
  // 낙차 20 m → 반등 5 m → 정점에서 밑면이 바닥 위 5 m, 중심은 +0.5
  const expectedY = SY(40 + 5 + 0.5);
  note('실측 / 공식 [px]', `${r.topScreenY.toFixed(2)} / ${expectedY.toFixed(2)}`);
  expect('반등 정점 화면 y [px]', r.topScreenY, expectedY, 12, 'px');   // 12px ≈ 0.37 m (샘플링 해상도)
});

/* ── P5. 진자 주기 — 한 주기 뒤 픽셀 위치 복귀 ── */
scenario('PX5', '단진자 1주기 후 — 출발 픽셀 위치로 복귀', ({ run }) => {
  run(VIEWPORT_SETUP);
  const L = 10, A = 5 * Math.PI / 180;
  const x0 = 50 + L * Math.sin(A), y0 = 80 - L * Math.cos(A);
  run(`reset();
       const seg = addFloor(50,20,52,20);
       const b = addCircle({ gridX: ${x0 - 0.5}, gridY: ${100 - y0 - 0.5}, gridW:1, gridH:1, mass: 1 });
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  const p0 = run(`screenCenter(STATE.elements[0])`);
  run(`run(${2 * Math.PI * Math.sqrt(L / G)})`);
  const p1 = run(`screenCenter(STATE.elements[0])`);
  note('출발 / 1주기 후 [px]', `(${p0.x.toFixed(2)},${p0.y.toFixed(2)}) → (${p1.x.toFixed(2)},${p1.y.toFixed(2)})`);
  expect('x 복귀 [px]', p1.x, p0.x, 8, 'px');
  expect('y 복귀 [px]', p1.y, p0.y, 8, 'px');
});

/* ── P6. Atwood 1초 뒤 이동 픽셀 ── */
scenario('PX6', 'Atwood 3:1 — 1초 뒤 이동 픽셀 = 32·½at²', ({ run }) => {
  run(VIEWPORT_SETUP);
  run(`reset();
       const anchor = addFloor(50,16,52,16);
       const p = addPulley({ gridX: 49, gridY: 20 });
       addRope(p.id,'center', anchor.id,'p1');
       const A = addCircle({ gridX: 48.5, gridY: 30.5, gridW:1, gridH:1, mass: 3 });
       const B = addCircle({ gridX: 50.5, gridY: 30.5, gridW:1, gridH:1, mass: 1 });
       addRope(p.id,'left',  A.id,'center');
       addRope(p.id,'right', B.id,'center');
       begin();`);
  const a0 = run(`screenCenter(STATE.elements[1])`);
  const b0 = run(`screenCenter(STATE.elements[2])`);
  const t = run(`run(1.0)`);
  const a1 = run(`screenCenter(STATE.elements[1])`);
  const b1 = run(`screenCenter(STATE.elements[2])`);
  const dPx = PPM * 0.5 * ((3 - 1) * G / 4) * t * t;
  note('A 하강 / B 상승 [px]', `${(a1.y - a0.y).toFixed(2)} / ${(b0.y - b1.y).toFixed(2)}`);
  expect('무거운 쪽 하강 [px]', a1.y - a0.y, dPx, 8, 'px');
  expect('가벼운 쪽 상승 [px]', b0.y - b1.y, dPx, 8, 'px');
});

/* ── P7. 용수철 SHM 진폭 픽셀 ── */
scenario('PX7', '용수철 SHM — 진폭 1 m = 32 px', ({ run }) => {
  run(VIEWPORT_SETUP);
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);
       const b = addRect({ gridX: 43, gridY: 49, gridW:1, gridH:1, mass: 1, e: 0 });
       addSpring({ gridX: 40, gridY: 49, gridW: 3, gridH: 1,
                   k: 10, L0: 2, L: 2, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let mn=1e9, mx=-1e9;
    for (let i=0;i<3000;i++){ simStep(CONFIG.FIXED_DT); const s=screenCenter(b).x; mn=Math.min(mn,s); mx=Math.max(mx,s); }
    ({mn,mx});`);
  note('좌우 극점 [px]', `${r.mn.toFixed(2)} ~ ${r.mx.toFixed(2)}`);
  expect('전체 진폭 (2 m) [px]', r.mx - r.mn, 2 * PPM, 1.0, 'px');
  expect('오른쪽 극점 [px]', r.mx, SX(43.5), 1.0, 'px');
  expect('왼쪽 극점 [px]',   r.mn, SX(41.5), 1.0, 'px');
});

/* ── P8. 경사면 하강 픽셀 궤적이 경사선 위에 있는가 ── */
scenario('PX8', '경사면 하강 — 물체 밑면이 경사선 픽셀 위를 따라감', ({ run }) => {
  run(VIEWPORT_SETUP);
  run(`reset(); addFloor(20,60,60,40);
       addRect({ gridX: 50, gridY: 45, gridW:1, gridH:1, mass: 1, e: 0 }); begin();`);
  const r = run(`
    const el = STATE.elements[0];
    let worst = 0;
    for (let i=0;i<120;i++){
      simStep(CONFIG.FIXED_DT);
      // 경사선(화면): grid (20,60)-(60,40) → 화면 픽셀
      const A = worldToScreen(20*CONFIG.cellSize, 60*CONFIG.cellSize);
      const B = worldToScreen(60*CONFIG.cellSize, 40*CONFIG.cellSize);
      // 물체 밑변 중앙의 화면 좌표
      const px = worldToScreen((el.gridX+el.gridW/2)*CONFIG.cellSize, (el.gridY+el.gridH)*CONFIG.cellSize);
      worst = Math.max(worst, pointToSegmentDist(px.x, px.y, A.x, A.y, B.x, B.y));
    }
    worst;`);
  note('경사선까지 최대 픽셀 거리', r.toFixed(3) + ' px');
  expect('밑변 중앙이 경사선 위 (≤ 반칸 32px)', r, 0, 32, 'px');
});

report();
process.exit(0);
