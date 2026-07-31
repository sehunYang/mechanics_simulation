/* ============================================================
   test/spec10.js — 실 길이 보존: 물체가 도르래 림에 닿은 뒤

   실은 늘어나지 않고 음의 길이도 가질 수 없다. 한쪽 물체가 도르래에 닿아
   그 세그먼트가 0이 되면, 남은 실 길이가 반대쪽의 상한이 되어 반대쪽도
   멈춰야 한다.

   과거 결함: _atwoodConstraint 가 `d0 < 1e-9 || d1 < 1e-9` 이면 제약을 통째로
   포기했다. 그래서 왼쪽 물체가 도르래에 닿아 멈춘 뒤 오른쪽 빗면 물체가
   실을 늘리며 계속 미끄러졌다.

   ※ 하네스는 코드를 블록 { } 으로 감싸 실행한다 — return 을 쓸 수 없고,
     마지막 표현식문의 값이 반환값이 된다.
   실행: node test/spec10.js
============================================================ */
'use strict';

const { scenario, expect, note, report } = require('./harness');

/* 수평면 위 b1 ─실─ 고정도르래 ─실─ 빗면 위 b2.
   b1 이 도르래에 먼저 닿도록 가까이 둔다. */
const SCENE = `
  reset();
  const th = Math.atan2(17, 45);
  const f1 = addFloor(10, 40, 50, 40);
  addFloor(50, 40, 95, 57);
  const b1 = addRect({ gridX: 44, gridY: 39, gridW: 1, gridH: 1, mass: 1 });
  const b2 = addRect({ gridX: 60.6, gridY: 44.0, gridW: 1, gridH: 1, mass: 1 });
  b2._snapRotation = th;
  const p = addPulley({ gridX: 49.4148, gridY: 38.5 });
  addRope(b1.id, 'right', p.id, 'left');
  addRope(p.id, 'right', b2.id, 'top');
  addRope(p.id, 'center', f1.id, 'p2');
  const d0 = () => { const A = getAttachPhysPos({elementId:b1.id,attachPoint:'right'});
                     const B = getAttachPhysPos({elementId:p.id,attachPoint:'left'});
                     return Math.hypot(A.x-B.x, A.y-B.y); };
  const d1 = () => { const A = getAttachPhysPos({elementId:p.id,attachPoint:'right'});
                     const B = getAttachPhysPos({elementId:b2.id,attachPoint:'top'});
                     return Math.hypot(A.x-B.x, A.y-B.y); };
  begin();
  const TOTAL0 = d0() + d1();
`;

/* ── 10-1. 닿은 뒤 실 총길이 보존 + 반대쪽 정지 ────────────── */
scenario('10-1', '왼쪽이 도르래에 닿아 멈추면 빗면 물체도 멈춘다 (실 길이 보존)', (S) => {
  const r = S.eval(SCENE + `
    // b1 이 도르래에 닿을 때까지
    let hit = -1;
    for (let i = 0; i < 600 && hit < 0; i++) { simStep(1/60); if (d0() < 0.01) hit = i; }
    const atHit = { x: b2.physX, y: b2.physY, total: d0() + d1() };
    for (let i = 0; i < 300; i++) simStep(1/60);   // 5초 더
    ({
      hitStep: hit,
      totalAtHit: atHit.total, total0: TOTAL0,
      totalAfter: d0() + d1(),
      driftAfter: (d0() + d1()) - TOTAL0,
      b2MovedAfterStop: Math.hypot(b2.physX - atHit.x, b2.physY - atHit.y),
      b2SpeedAfter: Math.hypot(b2.vx, b2.vy),
      d0After: d0(),
      nan: [b1.physX,b1.vx,b2.physX,b2.physY,b2.vx,b2.vy].some(v => !isFinite(v)) ? 1 : 0
    })
  `);
  note('닿은 스텝', r.hitStep);
  expect('닿는 사건 발생', r.hitStep >= 0 ? 1 : 0, 1, 0, '');
  expect('닿은 직후 총길이 = 초기', r.totalAtHit, r.total0, 1e-3, 'cell');
  expect('5초 뒤 총길이 드리프트', r.driftAfter, 0, 1e-3, 'cell');
  expect('정지 후 빗면 물체 이동', r.b2MovedAfterStop, 0, 1e-2, 'cell');
  expect('정지 후 빗면 물체 속력', r.b2SpeedAfter, 0, 0.05, 'm/s');
  expect('NaN 없음', r.nan, 0, 0, '');
});

/* ── 10-2. 60초 장시간 — 드리프트가 누적되지 않는다 ────────── */
scenario('10-2', '60초 방치: 실 길이 드리프트 누적 없음', (S) => {
  const r = S.eval(SCENE + `
    for (let i = 0; i < 3600; i++) simStep(1/60);
    ({ drift: (d0() + d1()) - TOTAL0, d0: d0(),
       b2Speed: Math.hypot(b2.vx, b2.vy),
       nan: [b1.physX,b2.physX,b2.physY,b2.vx,b2.vy].some(v => !isFinite(v)) ? 1 : 0 })
  `);
  note('60초 뒤 d0', r.d0.toFixed(6));
  expect('60초 뒤 드리프트', r.drift, 0, 1e-3, 'cell');
  expect('세그먼트 길이 ≥ 0 (역전 없음)', r.d0 >= -1e-9 ? 1 : 0, 1, 0, '');
  expect('NaN 없음', r.nan, 0, 0, '');
});

/* ── 10-3. 느슨해지는 방향은 막지 않는다 ──────────────────── */
scenario('10-3', '닿은 뒤에도 실이 느슨해지는 방향 운동은 자유', (S) => {
  const r = S.eval(SCENE + `
    let hit = -1;
    for (let i = 0; i < 600 && hit < 0; i++) { simStep(1/60); if (d0() < 0.01) hit = i; }
    const before = d1();
    // 빗면 물체를 도르래 쪽(위쪽)으로 밀어 준다 → 실이 느슨해지는 방향
    // (th 는 SCENE 에서 이미 선언됨)
    b2.vx = -3 * Math.cos(th); b2.vy = 3 * Math.sin(th);
    for (let i = 0; i < 6; i++) simStep(1/60);
    ({ before, after: d1(), shrank: (before - d1()) })
  `);
  note('d1 변화', `${r.before.toFixed(4)} → ${r.after.toFixed(4)}`);
  expect('도르래 쪽으로 움직일 수 있다 (d1 감소)', r.shrank > 0.05 ? 1 : 0, 1, 0, '');
});

/* ── 10-4. 정상 Atwood 는 영향 없음 (과잉 구속 방지) ───────── */
scenario('10-4', '정상 Atwood 가속도 — 하한 처리가 개입하지 않는다', (S) => {
  const mk = (m1, m2) => `
    reset();
    const anchor = addFloor(50,16,52,16);
    const p = addPulley({ gridX: 49, gridY: 20 });
    addRope(p.id,'center', anchor.id,'p1');
    const A = addCircle({ gridX: 48.5, gridY: 30.5, mass: ${m1} });
    const B = addCircle({ gridX: 50.5, gridY: 30.5, mass: ${m2} });
    addRope(p.id,'left',  A.id,'center');
    addRope(p.id,'right', B.id,'center');
    begin();
    let v0 = 0;
    for (let i = 0; i < 30; i++) simStep(1/60);
    v0 = A.vy;
    for (let i = 0; i < 30; i++) simStep(1/60);
    ({ a: Math.abs(A.vy - v0) / 0.5 })
  `;
  const G = 9.8;
  for (const [m1, m2] of [[3, 1], [5, 2]]) {
    const r = S.eval(mk(m1, m2));
    expect(`${m1}:${m2} 가속도`, r.a, Math.abs(m1 - m2) * G / (m1 + m2), '1%', 'm/s²');
  }
});

report();
process.exit(0);
