/* ============================================================
   test/spec9.js — 회전 인식 앵커 (렌더 ↔ 히트테스트 ↔ 물리 일치)

   빗면에 스냅된 물체는 draw() 가 _snapRotation 만큼 돌려 그린다. 앵커도 같은
   규칙으로 돌아야 실이 회전한 면의 중점에 걸린다. 이때 편집 좌표(getAttachPointWorld)
   와 물리 좌표(_getElPhysAnchor)가 어긋나면 시뮬 시작 순간 실이 튀므로,
   "같은 점을 가리키는가" 를 좌표계를 넘나들며 직접 대조한다.

   ※ 하네스는 코드를 블록 { } 으로 감싸 실행한다 — return 을 쓸 수 없고,
     마지막 표현식문의 값이 그대로 반환값이 된다.
   실행: node test/spec9.js
============================================================ */
'use strict';

const { scenario, expect, note, report } = require('./harness');

/** 물리 좌표 → 월드 픽셀 좌표 (y 뒤집기 + cellSize 배율) */
const PHYS_TO_WORLD = `
  function physToWorldPt(p) {
    return { x: p.x * CONFIG.cellSize, y: (CONFIG.GRID_SIZE - p.y) * CONFIG.cellSize };
  }
`;

/* ── 9-1. 회전 없으면 기존 좌표 그대로 ────────────────────── */
scenario('9-1', '회전 0: 앵커는 종전과 동일 (AABB 면 중점)', (S) => {
  const r = S.eval(`
    reset();
    const b = addRect({ gridX: 10, gridY: 20, gridW: 2, gridH: 4, mass: 1 });
    const cs = CONFIG.cellSize;
    const g = (pt) => { const w = getAttachPointWorld(b, pt); return { x: w.x/cs, y: w.y/cs }; };
    ({ rot: elementRotRad(b), top: g('top'), bottom: g('bottom'), left: g('left'), right: g('right') })
  `);
  expect('회전각', r.rot, 0, 1e-12, 'rad');
  expect('top.x',    r.top.x,    11, 1e-9, 'cell');
  expect('top.y',    r.top.y,    20, 1e-9, 'cell');
  expect('bottom.y', r.bottom.y, 24, 1e-9, 'cell');
  expect('left.x',   r.left.x,   10, 1e-9, 'cell');
  expect('left.y',   r.left.y,   22, 1e-9, 'cell');
  expect('right.x',  r.right.x,  12, 1e-9, 'cell');
});

/* ── 9-2. 빗면 회전: 앵커가 회전한 면의 중점으로 간다 ──────── */
scenario('9-2', '빗면 스냅: 앵커가 회전한 면 중점 (중심에서 반높이, 면에 수직)', (S) => {
  const r = S.eval(`
    reset();
    const th = Math.atan2(17, 45);                 // 빗면 기울기
    const b = addRect({ gridX: 10, gridY: 20, gridW: 1, gridH: 1, mass: 1 });
    b._snapRotation = th;
    const cs = CONFIG.cellSize;
    const c  = { x: b.gridX + 0.5, y: b.gridY + 0.5 };
    const w  = getAttachPointWorld(b, 'top');
    const t  = { x: w.x/cs, y: w.y/cs };
    const v  = { x: t.x - c.x, y: t.y - c.y };     // 중심 → top 앵커
    const d  = { x: Math.cos(th), y: Math.sin(th) };  // 빗면 방향 단위벡터
    ({
      th,
      dist: Math.hypot(v.x, v.y),                  // 반높이(0.5)여야 함
      alongSurface: v.x*d.x + v.y*d.y,             // 면 방향 성분 = 0 (면에 수직)
      vx: v.x, vy: v.y,
      expectVx: 0.5*Math.sin(th), expectVy: -0.5*Math.cos(th)
    })
  `);
  note('빗면각', (r.th * 180 / Math.PI).toFixed(4) + '°');
  expect('중심~앵커 거리 = 반높이', r.dist, 0.5, 1e-9, 'cell');
  expect('면 방향 성분 = 0 (면에 수직)', r.alongSurface, 0, 1e-9, 'cell');
  expect('오프셋 x = ½sinθ', r.vx, r.expectVx, 1e-9, 'cell');
  expect('오프셋 y = −½cosθ', r.vy, r.expectVy, 1e-9, 'cell');
});

/* ── 9-3. 편집 좌표 ↔ 물리 좌표 일치 (핵심 회귀 방지) ──────── */
scenario('9-3', '회전한 물체: getAttachPointWorld 와 _getElPhysAnchor 가 같은 점', (S) => {
  const r = S.eval(PHYS_TO_WORLD + `
    reset();
    const th = Math.atan2(17, 45);
    addFloor(50, 40, 95, 57);
    const b = addRect({ gridX: 73, gridY: 47, gridW: 1, gridH: 2, mass: 1 });
    b._snapRotation = th;
    begin();                                   // initPhysics: physX/Y 채움
    const cs = CONFIG.cellSize;
    const out = {};
    for (const pt of ['top','bottom','left','right','center']) {
      const ed = getAttachPointWorld(b, pt);                 // 편집(월드 픽셀)
      const ph = physToWorldPt(_getElPhysAnchor(b, pt));     // 물리 → 월드 픽셀
      out[pt] = { dx: (ed.x - ph.x)/cs, dy: (ed.y - ph.y)/cs };
    }
    out
  `);
  for (const pt of ['top', 'bottom', 'left', 'right', 'center']) {
    expect(`${pt} Δx`, r[pt].dx, 0, 1e-9, 'cell');
    expect(`${pt} Δy`, r[pt].dy, 0, 1e-9, 'cell');
  }
});

/* ── 9-4. 180° 대칭 접기: 역방향 바닥면에서 top 이 뒤집히지 않는다 ── */
scenario('9-4', '역방향 바닥면(angle=π): top 앵커가 아래로 뒤집히지 않는다', (S) => {
  const r = S.eval(`
    reset();
    const cs = CONFIG.cellSize;
    // 같은 수평면을 왼→오 / 오→왼 두 방향으로 그린 경우
    const fwd = addRect({ gridX: 10, gridY: 39, gridW: 1, gridH: 1, mass: 1 });
    fwd._snapRotation = Math.atan2(0, +1);        // 0
    const rev = addRect({ gridX: 10, gridY: 39, gridW: 1, gridH: 1, mass: 1 });
    rev._snapRotation = Math.atan2(0, -1);        // π
    // 같은 빗면을 반대 방향으로 그린 경우
    const inc  = addRect({ gridX: 20, gridY: 39, gridW: 1, gridH: 1, mass: 1 });
    inc._snapRotation  = Math.atan2( 17,  45);
    const incR = addRect({ gridX: 20, gridY: 39, gridW: 1, gridH: 1, mass: 1 });
    incR._snapRotation = Math.atan2(-17, -45);    // π 만큼 반대
    const topY = (e) => getAttachPointWorld(e, 'top').y / cs;
    const topX = (e) => getAttachPointWorld(e, 'top').x / cs;
    ({
      fwdTopY: topY(fwd), revTopY: topY(rev),
      incTopX: topX(inc), incRTopX: topX(incR),
      incTopY: topY(inc), incRTopY: topY(incR),
      revRot: elementRotRad(rev), incRRot: elementRotRad(incR), incRot: elementRotRad(inc)
    })
  `);
  expect('역방향 수평면 회전각 → 0', r.revRot, 0, 1e-12, 'rad');
  expect('top.y 동일 (뒤집힘 없음)', r.revTopY, r.fwdTopY, 1e-9, 'cell');
  expect('역방향 빗면 회전각 = 정방향', r.incRRot, r.incRot, 1e-12, 'rad');
  expect('빗면 top.x 동일', r.incRTopX, r.incTopX, 1e-9, 'cell');
  expect('빗면 top.y 동일', r.incRTopY, r.incTopY, 1e-9, 'cell');
});

/* ── 9-5. 앵커 점 목록이 getAttachPointWorld 와 어긋나지 않는다 ── */
scenario('9-5', '앵커 점 목록(렌더·히트테스트) = getAttachPointWorld', (S) => {
  const r = S.eval(`
    reset();
    const th = Math.atan2(17, 45);
    const b = addRect({ gridX: 30, gridY: 30, gridW: 2, gridH: 1, mass: 1 });
    b._snapRotation = th;
    const p = addPulley({ gridX: 40, gridY: 30 });
    let worst = 0, n = 0;
    for (const el of [b, p]) {
      for (const a of getAttachPoints(el)) {
        const w = getAttachPointWorld(el, a.id);
        worst = Math.max(worst, Math.abs(a.worldX - w.x), Math.abs(a.worldY - w.y));
        n++;
      }
    }
    ({ worst, n })
  `);
  note('대조한 앵커 수', r.n);
  expect('최대 불일치', r.worst, 0, 1e-12, 'px');
});

/* ── 9-6. 시뮬 시작 순간 실 끝점이 튀지 않는다 ────────────── */
scenario('9-6', '빗면 위 물체: EDIT → RUNNING 전환에 실 끝점 불연속 없음', (S) => {
  const r = S.eval(PHYS_TO_WORLD + `
    reset();
    const th = Math.atan2(17, 45);
    addFloor(50, 40, 95, 57);
    const b = addRect({ gridX: 73, gridY: 47, gridW: 1, gridH: 1, mass: 1 });
    b._snapRotation = th;
    const p = addPulley({ gridX: 49, gridY: 38.5 });
    addRope(p.id, 'right', b.id, 'top');
    const cs = CONFIG.cellSize;
    const before = getAttachPointWorld(b, 'top');       // 편집 상태
    begin();                                            // 물리 초기화
    const after  = physToWorldPt(getAttachPhysPos({ elementId: b.id, attachPoint: 'top' }));
    ({ dx: (after.x - before.x)/cs, dy: (after.y - before.y)/cs })
  `);
  expect('실 끝점 이동 Δx', r.dx, 0, 1e-9, 'cell');
  expect('실 끝점 이동 Δy', r.dy, 0, 1e-9, 'cell');
});

report();
process.exit(0);
