/* ============================================================
   test/spec6.js — 남은 조합 + 수정된 결함의 회귀 잠금
   실행: node test/spec6.js
   ============================================================ */
'use strict';
const { scenario, expect, note, report } = require('./harness');

const G = 9.8;

/* ════════════════════════════════════════════════════════════
   AA. 단면(single-sided) 바닥 규약 — 수정 회귀 잠금
   ════════════════════════════════════════════════════════════ */

scenario('AA1', '바닥 아래에서 접근했다가 못 닿는 물체 — 위로 순간이동 없음', ({ run }) => {
  // 바닥 phys y=50. 공은 y=40에서 위로 13.86 m/s → 이론 최고점 49.80 (바닥 미달)
  run(`reset(); addFloor(20,50,80,50);
       addCircle({ gridX: 49.5, gridY: 59.5, gridW:1, gridH:1, mass:1, e:0, vy0: 13.86 }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let mx = -1e9;
    for (let i=0;i<600;i++){ simStep(CONFIG.FIXED_DT); mx = Math.max(mx, b.physY); }
    mx;`);
  note('최고점 phys y', r.toFixed(4));
  expect('최고점 = v²/2g 공식값', r, 40 + 13.86 ** 2 / (2 * G), 0.05);
  expect('바닥(50)을 넘지 않음', r < 49.95 ? 1 : 0, 1, 0, '');
});

scenario('AA2', '바닥 아래를 지나가는 물체 — 표면 근처에서 튕겨 오르지 않음', ({ run }) => {
  // 천장(법선 위) 바로 아래를 수평으로 통과 — 관통 판정에 걸리면 안 됨
  run(`reset(); STATE.gravityOn = false;
       addFloor(20,50,80,50);                                  // phys y=50
       addCircle({ gridX: 24.5, gridY: 50.3, gridW:1, gridH:1, mass:1, e:0, vx0: 10 }); begin();`);
  // 원 중심 phys y = 100−50.3−0.5 = 49.2 (바닥면 0.8 아래, 반지름 0.5)
  const r = run(`
    const b = STATE.elements[0];
    let mx = -1e9;
    for (let i=0;i<300;i++){ simStep(CONFIG.FIXED_DT); mx = Math.max(mx, b.physY); }
    ({ mx, y: b.physY, x: b.physX });`);
  note('최종 위치', `(${r.x.toFixed(3)}, ${r.y.toFixed(3)})`);
  expect('y 변화 없음 (직진 통과)', r.mx, 49.2, 0.01);
});

scenario('AA3', '앞면에서 고속으로 뚫고 들어온 물체는 여전히 배출됨', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 10, gridW:1, gridH:1, mass: 1, e: 0, vy0: -80 }); begin();`);
  run(`run(4.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('바닥 위 정지 (관통 없음)', s.y, 40, 0.05);
});

scenario('AA4', '경사면에 파묻혀 배치된 물체 — 시작 시 표면 위로 정렬', ({ run }) => {
  // 격자 스냅(정수 칸) 배치. 경사면 표면은 x=39.5 에서 y=49.75 인데
  // 원 중심은 49.5 → 0.224 파묻힌 상태로 놓인다 (실제 UI에서 흔한 상황).
  run(`reset(); addFloor(20,60,60,40);
       addCircle({ gridX: 39, gridY: 50, gridW:1, gridH:1, mass: 1, e: 0 }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    // 경사면 phys (20,40)→(60,60), 법선 (−0.4472, 0.8944)
    const sgn = () => (b.physX-20)*(-0.4472136) + (b.physY-40)*(0.8944272);
    const s0 = sgn();
    for (let i=0;i<60;i++) simStep(CONFIG.FIXED_DT);
    ({ s0, s1: sgn() });`);
  note('시작 직후 / 1초 후 표면거리', `${r.s0.toFixed(4)} / ${r.s1.toFixed(4)}`);
  expect('시작 시점에 표면 위(≥ r=0.5)로 정렬', r.s0, 0.5, 0.02);
  expect('경사면을 따라 유지 (뚫고 떨어지지 않음)', r.s1, 0.5, 0.05);
});

/* ════════════════════════════════════════════════════════════
   AB. 정지마찰 크리프 — 수정 회귀 잠금
   ════════════════════════════════════════════════════════════ */

scenario('AB1', '경사면 정지마찰 — 60초간 위치 완전 고정 (크리프 없음)', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40,{isFriction:true, muS:0.9, muK:0.7});
       addRect({ gridX: 39, gridY: 50, gridW:1, gridH:1, mass: 1, e: 0 }); begin();`);
  run(`run(1.0)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(60.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  note('60초 이동거리', Math.hypot(s1.x - s0.x, s1.y - s0.y).toFixed(6) + ' m');
  expect('60초간 이동 없음', Math.hypot(s1.x - s0.x, s1.y - s0.y), 0, 1e-9);
});

scenario('AB2', '수직 벽 정지마찰 — 60초간 미끄러짐 없음', ({ run }) => {
  run(`reset(); addFloor(60,70,60,30,{isFriction:true, muS:0.9, muK:0.9});
       addZone({ gridX: 50, gridY: 30, gridW: 12, gridH: 40, fx: 200, fy: 0 });
       addRect({ gridX: 59, gridY: 49, gridW:1, gridH:1, mass: 1, e: 0 }); begin();`);
  run(`run(1.0)`);
  const s0 = run(`snap(STATE.elements[1])`);
  run(`run(60.0)`);
  const s1 = run(`snap(STATE.elements[1])`);
  note('60초 낙하량', (s0.y - s1.y).toFixed(6) + ' m');
  expect('60초간 낙하 없음', s0.y - s1.y, 0, 1e-9);
});

scenario('AB3', '미끄러지다 멈춘 뒤 그 자리에 고정', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40,{isFriction:true, muS:0.9, muK:0.7});
       addRect({ gridX: 55, gridY: 42, gridW:1, gridH:1, mass: 1, e: 0, vx0: -6, vy0: -3 }); begin();`);
  // 초기 속력 6.71 m/s, 감속 g(μk·cosθ − sinθ)=1.75 m/s² → 약 3.8초 뒤 정지.
  // 완전히 멈춘 뒤부터 측정한다.
  run(`run(8.0)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(30.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  note('정지 위치', `(${s1.x.toFixed(4)}, ${s1.y.toFixed(4)})`);
  expect('정지 후 30초간 이동 없음', Math.hypot(s1.x - s0.x, s1.y - s0.y), 0, 1e-9);
  expect('정지 상태', Math.hypot(s1.vx, s1.vy), 0, 1e-9, 'm/s');
});

/* ════════════════════════════════════════════════════════════
   AC. 남은 연결 조합
   ════════════════════════════════════════════════════════════ */

scenario('AC1', '실 ↔ 용수철 끝단 앵커 — 용수철 끝이 고정점 역할', ({ run }) => {
  run(`reset();
       const sp = addSpring({ gridX: 48, gridY: 20, gridW: 2, gridH: 1, k: 10, L0: 2, L: 2,
                              autoAttach: false });
       const b = addCircle({ gridX: 47.5, gridY: 29.5, gridW:1, gridH:1, mass: 2 });
       addRope(sp.id,'left', b.id,'center');
       begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[1])`);
  // 용수철 왼쪽 끝 phys (48, 79.5), 공 중심 phys (48, 70) → 실 길이 9.5 유지
  const d = run(`Math.hypot(STATE.elements[1].physX-48, STATE.elements[1].physY-79.5)`);
  note('공 위치', `(${s.x.toFixed(3)}, ${s.y.toFixed(3)})`);
  expect('실 길이 유지', d, 9.5, 0.05);
  expect('정지', Math.hypot(s.vx, s.vy), 0, 0.05, 'm/s');
});

scenario('AC2', '실을 사각형 좌측 앵커에 연결 — 정적 평형', ({ run }) => {
  run(`reset();
       const seg = addFloor(50,20,52,20);                            // phys (50,80)
       const b = addRect({ gridX: 50, gridY: 39, gridW: 2, gridH: 2, mass: 3 });
       addRope(seg.id,'p1', b.id,'left');                            // 좌측면 중앙 phys (50,60)
       begin();`);
  run(`run(4.0)`);
  const r = run(`
    const b = STATE.elements[0];
    ({ d: Math.hypot(b.physX-50, (b.physY+1)-80), v: Math.hypot(b.vx,b.vy), x: b.physX, y: b.physY });`);
  note('위치', `(${r.x.toFixed(3)}, ${r.y.toFixed(3)})`);
  expect('실 길이 20 유지', r.d, 20, 0.05);
  expect('진자처럼 흔들리다 안정 (발산 없음)', r.v < 20 ? 1 : 0, 1, 0, '');
});

scenario('AC3', '고정 도르래 2개 직렬 — Atwood 공식 성립', ({ run }) => {
  // A(4kg) ─수직─ P1좌림 | P1우림 ─수평─ P2좌림 | P2우림 ─수직─ B(1kg)
  //   |A| + |수평(고정)| + |C| = 일정 → |A| + |C| = 일정 → a=(m1−m2)g/(m1+m2)
  run(`reset();
       const f1 = addFloor(45,16,47,16);   // phys (45,84)
       const f2 = addFloor(55,16,57,16);   // phys (55,84)
       const P1 = addPulley({ gridX: 44, gridY: 20 });   // 중심 phys (45,79)
       const P2 = addPulley({ gridX: 54, gridY: 20 });   // 중심 phys (55,79)
       addRope(P1.id,'center', f1.id,'p1');
       addRope(P2.id,'center', f2.id,'p1');
       const A = addCircle({ gridX: 43.5, gridY: 30.5, gridW:1, gridH:1, mass: 4 });  // phys (44,69)
       const B = addCircle({ gridX: 55.5, gridY: 30.5, gridW:1, gridH:1, mass: 1 });  // phys (56,69)
       addRope(P1.id,'left',  A.id,'center');       // (44,79)-(44,69)
       addRope(P1.id,'right', P2.id,'left');        // (46,79)-(54,79)
       addRope(P2.id,'right', B.id,'center');       // (56,79)-(56,69)
       begin();`);
  run(`run(0.3)`);
  const a0 = run(`({ a: STATE.elements[2].vy, b: STATE.elements[3].vy })`);
  run(`run(0.3)`);
  const a1 = run(`({ a: STATE.elements[2].vy, b: STATE.elements[3].vy })`);
  note('A vy / B vy', `${a1.a.toFixed(4)} / ${a1.b.toFixed(4)}`);
  const aExp = (4 - 1) * G / 5;
  expect('A 하강 가속도', -(a1.a - a0.a) / 0.3, aExp, '8%', 'm/s²');
  expect('B 상승 가속도', (a1.b - a0.b) / 0.3, aExp, '8%', 'm/s²');
});

scenario('AC4', '용수철 + 실 동시 부착 — 이완 구간은 SHM, 팽팽해지면 정지', ({ run }) => {
  // 무중력. 벽─용수철─물체(평형 physX=42)에서 왼쪽으로 v=5 로 출발.
  //   왼쪽 고정점(34, 50.5) ─ 실 ─ 물체 좌측 앵커(42, 50.5), 실 길이 8.
  //   왼쪽으로 갈 때는 거리가 줄어 이완 → 자유 SHM (진폭 A = v/ω = 5/√10 = 1.581)
  //   오른쪽으로 돌아와 physX = 42 를 넘으려는 순간 실이 팽팽 → 제지
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);
       const b = addRect({ gridX: 42, gridY: 49, gridW:1, gridH:1, mass: 1, e: 0, vx0: -5 });
       addSpring({ gridX: 40, gridY: 49, gridW: 2, gridH: 1,
                   k: 10, L0: 2, L: 2, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       const anchor = addFloor(34,49.5,36,49.5);      // p1 = phys (34, 50.5)
       addRope(anchor.id,'p1', b.id,'left');
       begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let mn=1e9, mx=-1e9, dmax=0;
    for (let i=0;i<3000;i++){
      simStep(CONFIG.FIXED_DT);
      mn=Math.min(mn,b.physX); mx=Math.max(mx,b.physX);
      dmax=Math.max(dmax, Math.hypot(b.physX-34, (b.physY+0.5)-50.5));
    }
    ({mn,mx,dmax});`);
  note('이동 범위 / 실 최대 길이', `${r.mn.toFixed(3)} ~ ${r.mx.toFixed(3)} / ${r.dmax.toFixed(4)}`);
  expect('이완 구간 자유 SHM 진폭 (A = v/ω)', 42 - r.mn, 5 / Math.sqrt(10), '2%');
  expect('실 길이 상한 8 준수', r.dmax, 8, 0.02);
  expect('실에 걸려 오른쪽으로 못 감', r.mx, 42, 0.02);
});

scenario('AC5', 'ARC 골짜기 + 마찰 — 구르며 감쇠, 에너지 증가 없음', ({ run }) => {
  run(`reset(); addFloor(30,50,70,50,{pathType:'ARC_DOWN', curvature:0.5, isFriction:true, muS:0.5, muK:0.5});
       addCircle({ gridX: 31, gridY: 48, gridW:1, gridH:1, mass:1, e:0 }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    const E = () => 0.5*(b.vx*b.vx + b.vy*b.vy) + 9.8*b.physY + 0.25*0.5*0.25*b.omega*b.omega;
    const E0 = E();
    let worst = -1e9;
    for (let i=0;i<1800;i++){ simStep(CONFIG.FIXED_DT); worst = Math.max(worst, E() - E0); }
    ({ worst, y: b.physY, v: Math.hypot(b.vx,b.vy) });`);
  note('최종 y / 속력', `${r.y.toFixed(3)} / ${r.v.toFixed(3)}`);
  expect('에너지 증가 없음', r.worst <= 0.05 ? 1 : 0, 1, 0, '');
  expect('곡면 안에 머무름 (관통 없음)', r.y > 41 ? 1 : 0, 1, 0, '');
});

scenario('AC6', '고속 수평 발사체 vs 얇은 벽 — 관통 없음', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addFloor(60,70,60,30);                                  // 세로 벽, 법선 −x
       addRect({ gridX: 30, gridY: 49, gridW:1, gridH:1, mass: 1, e: 0, vx0: 40 }); begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[0])`);
  note('최종 x', s.x.toFixed(4));
  expect('벽(x=60)을 넘지 않음', s.x + 1, 60, 0.05);
});

report();
process.exit(0);
