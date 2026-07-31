/* ============================================================
   test/spec7.js — 실체면 빗금이 실제 충돌면과 같은 쪽을 가리키는가
     FloorSegment._drawSolidSideHatch 가 캔버스에 그리는 선분을 그대로 캡처해,
     각 빗금이 getPhysicsSegments 의 법선 **반대쪽**(= 막히는 쪽)으로 향하는지
     모든 pathType · 그리는 방향 · 곡률에 대해 검증한다.
   실행: node test/spec7.js
   ============================================================ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const { scenario, expect, note, report, loadEngine, SCENE_API } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const GS   = 100;

function makeCtx() {
  const c = loadEngine();
  vm.runInContext(SCENE_API, c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/hit-test.js'), 'utf8'), c, { filename: 'js/hit-test.js' });
  // 격자 1칸 = 월드 1px 로 두면 월드좌표 = 격자좌표라 검산이 단순해진다
  vm.runInContext(`CONFIG.cellSize = 1; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;`, c);
  return c;
}

/** 세그먼트를 그려 빗금 선분 목록 [{p:{x,y}, q:{x,y}}] 을 캡처 (월드=격자 좌표)
 *  method: '_drawSolidSideHatch'(기본) 또는 '_drawFrictionHatch' */
function captureHatch(c, segOpts, method) {
  const fn = method || '_drawSolidSideHatch';
  return vm.runInContext(`{
    reset();
    const seg = addFloor(${segOpts.x1}, ${segOpts.y1}, ${segOpts.x2}, ${segOpts.y2},
                         ${JSON.stringify(segOpts.o || {})});
    const ticks = [];
    let cur = null;
    const rec = {
      save(){}, restore(){}, beginPath(){ }, stroke(){},
      moveTo(x,y){ cur = {x,y}; },
      lineTo(x,y){ if (cur) { ticks.push({ p: cur, q: {x,y} }); cur = null; } },
      set strokeStyle(v){}, get strokeStyle(){ return ''; },
      set lineWidth(v){},   get lineWidth(){ return 1; },
    };
    seg.${fn}(rec, seg.x1, seg.y1, seg.x2, seg.y2, 1);
    ({ ticks, physSegs: getPhysicsSegments(seg) });
  }`, c);
}

/** 빗금이 전부 법선 반대쪽(실체면)을 향하는지 확인
 *  tol: 45° 공칭값(−1/√2)과의 허용 편차. 곡면은 빗금 샘플링(간격 8px)과
 *       물리 미세 세그먼트(20분할)의 이산화가 달라 조금 벌어지므로 넉넉히 준다.
 *       방향이 뒤집히면 부호 자체가 양수가 되므로 이 검사로도 충분히 잡힌다. */
function checkSide(label, cap, tol, expected) {
  const { ticks, physSegs } = cap;
  const nominal = expected ?? -Math.SQRT1_2;   // 45° 빗금. 마찰 해치(수직)는 −1
  const wantLen = expected === -1 ? 3.5 : 5;
  if (ticks.length === 0) { expect(label + ' — 빗금 생성됨', 0, 1, 0, ''); return; }

  let worstDot = -Infinity, minLen = Infinity, maxLen = -Infinity;
  for (const t of ticks) {
    // 월드(화면, y 아래로 증가) → 물리(y 위로 증가)
    const p = { x: t.p.x, y: GS - t.p.y };
    const d = { x: t.q.x - t.p.x, y: -(t.q.y - t.p.y) };
    const L = Math.hypot(d.x, d.y);
    minLen = Math.min(minLen, L); maxLen = Math.max(maxLen, L);

    // 빗금 시작점에 가장 가까운 물리 미세 세그먼트를 찾는다
    let best = null, bestD = Infinity;
    for (const s of physSegs) {
      const sx = s.x2 - s.x1, sy = s.y2 - s.y1;
      const l2 = sx * sx + sy * sy;
      const u  = l2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - s.x1) * sx + (p.y - s.y1) * sy) / l2)) : 0;
      const dd = Math.hypot(p.x - (s.x1 + u * sx), p.y - (s.y1 + u * sy));
      if (dd < bestD) { bestD = dd; best = s; }
    }
    // 정규화한 방향 · 법선 : 실체면이면 음수 (자유면 반대)
    worstDot = Math.max(worstDot, (d.x * best.normalX + d.y * best.normalY) / (L || 1));
  }
  // 법선 성분은 음수(실체면 쪽)여야 한다 — 방향이 뒤집히면 양수가 되어 바로 걸린다
  expect(label + ' — 모든 빗금이 실체면 쪽', worstDot, nominal, tol ?? 0.02, '·n̂');
  expect(label + ` — 길이 일정(${wantLen}px)`, minLen, wantLen, 0.01, 'px');
  expect(label + ' — 길이 편차 없음', maxLen - minLen, 0, 1e-9, 'px');
}

/* ── 1. 직선: 그리는 방향에 따라 실체면이 뒤집히는가 ── */
scenario('HATCH-LINE', '직선 바닥/천장/벽 — 그리는 방향별 실체면', () => {
  const c = makeCtx();
  const CASES = [
    ['바닥 (왼→오, 법선 위)',   { x1: 20, y1: 60, x2: 80, y2: 60 }],
    ['천장 (오→왼, 법선 아래)', { x1: 80, y1: 30, x2: 20, y2: 30 }],
    ['벽 (아래→위, 법선 왼)',   { x1: 60, y1: 70, x2: 60, y2: 30 }],
    ['벽 (위→아래, 법선 오른)', { x1: 40, y1: 30, x2: 40, y2: 70 }],
    ['경사 (왼→오 오르막)',     { x1: 20, y1: 60, x2: 60, y2: 40 }],
    ['경사 (오→왼 내리막)',     { x1: 60, y1: 40, x2: 20, y2: 60 }],
  ];
  for (const [label, o] of CASES) checkSide(label, captureHatch(c, o));
});

/* ── 2. 직선 4방향의 빗금이 실제로 기대한 화면 방향인가 (육안 대응 확인) ── */
scenario('HATCH-DIR', '빗금이 향하는 화면 방향 (아래/위/오른쪽/왼쪽)', () => {
  const c = makeCtx();
  const dirOf = (cap) => {
    const t = cap.ticks[Math.floor(cap.ticks.length / 2)];
    return { dx: t.q.x - t.p.x, dy: t.q.y - t.p.y };   // 화면 좌표 (y 아래로 +)
  };
  const floor   = dirOf(captureHatch(c, { x1: 20, y1: 60, x2: 80, y2: 60 }));
  const ceiling = dirOf(captureHatch(c, { x1: 80, y1: 30, x2: 20, y2: 30 }));
  const wallL   = dirOf(captureHatch(c, { x1: 60, y1: 70, x2: 60, y2: 30 }));
  const wallR   = dirOf(captureHatch(c, { x1: 40, y1: 30, x2: 40, y2: 70 }));
  note('바닥 빗금 방향',  `(${floor.dx.toFixed(2)}, ${floor.dy.toFixed(2)})`);
  note('천장 빗금 방향',  `(${ceiling.dx.toFixed(2)}, ${ceiling.dy.toFixed(2)})`);
  expect('바닥 → 선 아래로 (화면 +y)',      Math.sign(floor.dy),   +1, 0, '');
  expect('천장 → 선 위로 (화면 −y)',        Math.sign(ceiling.dy), -1, 0, '');
  expect('법선 왼쪽 벽 → 오른쪽에 빗금',    Math.sign(wallL.dx),   +1, 0, '');
  expect('법선 오른쪽 벽 → 왼쪽에 빗금',    Math.sign(wallR.dx),   -1, 0, '');
});

/* ── 3. 꺾인 바닥: 두 다리 각각 올바른 쪽 ── */
scenario('HATCH-ELBOW', 'ELBOW_H / ELBOW_V — 꺾인 두 구간 모두 실체면 쪽', () => {
  const c = makeCtx();
  checkSide('ELBOW_H (바닥+오른쪽 벽)', captureHatch(c, { x1: 20, y1: 60, x2: 60, y2: 40, o: { pathType: 'ELBOW_H' } }));
  checkSide('ELBOW_V (왼쪽 벽+바닥)',   captureHatch(c, { x1: 30, y1: 40, x2: 70, y2: 60, o: { pathType: 'ELBOW_V' } }));
  checkSide('ELBOW_H (반대 방향)',      captureHatch(c, { x1: 60, y1: 40, x2: 20, y2: 60, o: { pathType: 'ELBOW_H' } }));
  checkSide('ELBOW_V (반대 방향)',      captureHatch(c, { x1: 70, y1: 60, x2: 30, y2: 40, o: { pathType: 'ELBOW_V' } }));
});

/* ── 4. 곡면: 곡률 전 구간에서 법선 반대쪽 ── */
scenario('HATCH-ARC', 'ARC_UP / ARC_DOWN — 곡률 6종 전 구간 실체면 쪽', () => {
  const c = makeCtx();
  for (const pathType of ['ARC_UP', 'ARC_DOWN']) {
    for (const curvature of [0.2, 0.5, 1.0, 1.3, 1.9]) {
      checkSide(`${pathType} cv=${curvature}`,
        captureHatch(c, { x1: 30, y1: 50, x2: 70, y2: 50, o: { pathType, curvature } }), 0.12);
    }
  }
});

/* ── 5. 기울어진 현 + 역방향 곡면 ── */
scenario('HATCH-ARC-TILT', '기울어진 곡면 + 역방향으로 그린 곡면', () => {
  const c = makeCtx();
  checkSide('ARC_UP 기울어짐',   captureHatch(c, { x1: 30, y1: 70, x2: 70, y2: 35, o: { pathType: 'ARC_UP',   curvature: 0.6 } }), 0.12);
  checkSide('ARC_DOWN 기울어짐', captureHatch(c, { x1: 30, y1: 70, x2: 70, y2: 35, o: { pathType: 'ARC_DOWN', curvature: 0.6 } }), 0.12);
  checkSide('ARC_UP 역방향',     captureHatch(c, { x1: 70, y1: 35, x2: 30, y2: 70, o: { pathType: 'ARC_UP',   curvature: 0.6 } }), 0.12);
  checkSide('ARC_DOWN 역방향',   captureHatch(c, { x1: 70, y1: 35, x2: 30, y2: 70, o: { pathType: 'ARC_DOWN', curvature: 0.6 } }), 0.12);
});

/* ── 6. 마찰 해치도 실체면 쪽으로만 (자유면 침범 없음) ── */
scenario('HATCH-FRICTION', '마찰 해치 — 실체면 쪽 수직선, 자유면 침범 없음', () => {
  const c = makeCtx();
  const F = { isFriction: true, muS: 0.4, muK: 0.3 };
  const CASES = [
    ['바닥',   { x1: 20, y1: 60, x2: 80, y2: 60, o: F }],
    ['천장',   { x1: 80, y1: 30, x2: 20, y2: 30, o: F }],
    ['벽',     { x1: 60, y1: 70, x2: 60, y2: 30, o: F }],
    ['경사',   { x1: 20, y1: 60, x2: 70, y2: 35, o: F }],
    ['ELBOW_H',{ x1: 20, y1: 60, x2: 60, y2: 40, o: { ...F, pathType: 'ELBOW_H' } }],
  ];
  // 수직(perpendicular) 이므로 법선 성분 = −1
  for (const [label, o] of CASES) checkSide(label, captureHatch(c, o, '_drawFrictionHatch'), 0.02, -1);
  for (const [label, o] of [['ARC_UP', { x1: 20, y1: 60, x2: 80, y2: 60, o: { ...F, pathType: 'ARC_UP', curvature: 0.6 } }],
                            ['ARC_DOWN', { x1: 20, y1: 40, x2: 80, y2: 40, o: { ...F, pathType: 'ARC_DOWN', curvature: 0.6 } }]]) {
    checkSide(label, captureHatch(c, o, '_drawFrictionHatch'), 0.12, -1);
  }

  // 마찰 해치와 실체면 빗금이 같은 쪽인지 (부호 일치) 직접 대조
  const seg = { x1: 20, y1: 60, x2: 80, y2: 60, o: F };
  const fr = captureHatch(c, seg, '_drawFrictionHatch').ticks[0];
  const so = captureHatch(c, seg, '_drawSolidSideHatch').ticks[0];
  note('마찰 / 실체면 빗금 dy', `${(fr.q.y - fr.p.y).toFixed(2)} / ${(so.q.y - so.p.y).toFixed(2)}`);
  expect('두 표시가 같은 쪽', Math.sign(fr.q.y - fr.p.y), Math.sign(so.q.y - so.p.y), 0, '');
  expect('마찰 해치가 선 위(자유면)로 넘어가지 않음', Math.min(fr.p.y, fr.q.y) >= 60 - 1e-9 ? 1 : 0, 1, 0, '');
});

/* ── 7. 물리 거동과의 대조: 빗금이 가리키는 쪽에서 물체가 막히는가 ── */
scenario('HATCH-PHYS', '빗금 반대쪽(자유면)에서 떨어뜨린 물체는 막히고, 빗금 쪽은 통과', () => {
  const c = makeCtx();
  // 천장(오→왼, 법선 아래 = 자유면 아래). 빗금은 위쪽에 그려져야 하고,
  // 아래에서 올라오는 물체는 막히고, 위에서 떨어지는 물체는 통과해야 한다.
  const cap = captureHatch(c, { x1: 80, y1: 40, x2: 20, y2: 40 });
  const t = cap.ticks[Math.floor(cap.ticks.length / 2)];
  expect('천장 빗금은 선 위쪽', Math.sign(t.q.y - t.p.y), -1, 0, '');

  // 아래(자유면)에서 위로 던진 물체 → 천장에 막힘
  const up = vm.runInContext(`{
    reset(); CONFIG.cellSize = 1;
    addFloor(80,40,20,40);                       // phys y=60, 법선 (0,−1)
    const b = addCircle({ gridX: 49.5, gridY: 55, gridW:1, gridH:1, mass:1, e:0, vy0: 20 });
    begin();
    let mx = -1e9;
    for (let i=0;i<400;i++){ simStep(CONFIG.FIXED_DT); mx = Math.max(mx, b.physY); }
    mx;
  }`, c);
  note('아래에서 올라온 공 최고점', up.toFixed(4));
  expect('자유면(아래)에서 온 물체는 천장에 막힘', up, 59.5, 0.05);

  // 위(실체면=빗금 쪽)에서 떨어뜨린 물체 → 통과
  const down = vm.runInContext(`{
    reset(); CONFIG.cellSize = 1;
    addFloor(80,40,20,40);
    const b = addCircle({ gridX: 49.5, gridY: 20, gridW:1, gridH:1, mass:1, e:0 });
    begin();
    for (let i=0;i<300;i++) simStep(CONFIG.FIXED_DT);
    b.physY;
  }`, c);
  note('위에서 떨어뜨린 공 y', down.toFixed(4));
  expect('실체면(위, 빗금 쪽)에서 온 물체는 통과 (단면 규약)', down < 55 ? 1 : 0, 1, 0, '');
});

report();
process.exit(0);
