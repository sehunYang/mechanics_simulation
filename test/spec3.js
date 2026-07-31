/* ============================================================
   test/spec3.js — 조합 매트릭스 3차: 경사/곡면 반발, 벽마찰, 2체 용수철,
                   비스듬한 충돌, 스핀, 극단 질량비, 실+충돌 복합
   실행: node test/spec3.js
   ============================================================ */
'use strict';
const { scenario, expect, note, report } = require('./harness');

const G = 9.8;
const TH  = Math.atan(0.5);
const SIN = Math.sin(TH), COS = Math.cos(TH);

/* ════════════════════════════════════════════════════════════
   U. 경사면·벽에서의 반발과 마찰
   ════════════════════════════════════════════════════════════ */

scenario('U1', '경사면 탄성 반사 (e=1) — 입사각 = 반사각', ({ run }) => {
  // 45° 경사: grid (30,70)→(70,30) → phys (30,30)→(70,70), 법선 (−0.7071, 0.7071)
  run(`reset(); addFloor(30,70,70,30);
       addCircle({ gridX: 49.5, gridY: 20, gridW:1, gridH:1, mass: 1, e: 1.0 }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let before = null;
    for (let i=0;i<3000;i++){
      const pv = { vx: b.vx, vy: b.vy };
      simStep(CONFIG.FIXED_DT);
      if (!before && (b.vx !== pv.vx || Math.abs(b.vy - pv.vy) > 0.2)) { before = pv; break; }
    }
    ({ before, after: { vx: b.vx, vy: b.vy } });`);
  const n = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
  const vnB = r.before.vx * n.x + r.before.vy * n.y;
  const vnA = r.after.vx * n.x + r.after.vy * n.y;
  const vtB = r.before.vx * -n.y + r.before.vy * n.x;
  const vtA = r.after.vx * -n.y + r.after.vy * n.x;
  note('충돌 전/후 v', `(${r.before.vx.toFixed(3)},${r.before.vy.toFixed(3)}) → (${r.after.vx.toFixed(3)},${r.after.vy.toFixed(3)})`);
  expect('법선속도 반전 (e=1)', vnA, -vnB, '3%', 'm/s');
  expect('접선속도 보존 (마찰 없음)', vtA, vtB, '3%', 'm/s');
});

scenario('U2', '경사면 반발 e=0.5 — 법선속도만 절반', ({ run }) => {
  run(`reset(); addFloor(30,70,70,30);
       addCircle({ gridX: 49.5, gridY: 20, gridW:1, gridH:1, mass: 1, e: 0.5 }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let before = null;
    for (let i=0;i<3000;i++){
      const pv = { vx: b.vx, vy: b.vy };
      simStep(CONFIG.FIXED_DT);
      if (!before && (b.vx !== pv.vx || Math.abs(b.vy - pv.vy) > 0.2)) { before = pv; break; }
    }
    ({ before, after: { vx: b.vx, vy: b.vy } });`);
  const n = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
  const vnB = r.before.vx * n.x + r.before.vy * n.y;
  const vnA = r.after.vx * n.x + r.after.vy * n.y;
  expect('법선속도 = −0.5·v', vnA, -0.5 * vnB, '4%', 'm/s');
});

scenario('U3', '수직 벽 마찰 — 눌러붙은 물체의 낙하 감속 a = g − μk·F/m', ({ run }) => {
  // 벽: grid (60,30)→(60,70) → phys (60,70)→(60,30), dy=−40 → 법선 (+1,0) (왼쪽이 벽 실체)
  //   ⇒ 물체는 벽 오른쪽(자유면)에 있어야 하므로 반대로 그린다: grid (60,70)→(60,30)
  //     → phys (60,30)→(60,70), dy=+40 → 법선 (−1,0) → 왼쪽이 자유면
  run(`reset(); addFloor(60,70,60,30,{isFriction:true, muS:0.4, muK:0.4});
       addZone({ gridX: 50, gridY: 30, gridW: 12, gridH: 40, fx: 20, fy: 0 });
       addRect({ gridX: 59, gridY: 49, mass: 1, e: 0 }); begin();`);
  run(`run(0.3)`);
  const s0 = run(`snap(STATE.elements[1])`);
  run(`run(0.5)`);
  const s1 = run(`snap(STATE.elements[1])`);
  note('벽 접촉 x / vy', `${s1.x.toFixed(4)} / ${s1.vy.toFixed(4)}`);
  expect('벽에 붙어있음 (오른쪽 면 = 60)', s1.x + 1, 60, 0.05);
  expect('낙하 가속도 = g − μk·F/m', (s0.vy - s1.vy) / 0.5, G - 0.4 * 20 / 1, '6%', 'm/s²');
});

scenario('U4', '벽 정지마찰이 충분하면 매달려 정지', ({ run }) => {
  // μs·F = 0.9·200 = 180 N > mg = 9.8 N → 정지
  run(`reset(); addFloor(60,70,60,30,{isFriction:true, muS:0.9, muK:0.9});
       addZone({ gridX: 50, gridY: 30, gridW: 12, gridH: 40, fx: 200, fy: 0 });
       addRect({ gridX: 59, gridY: 49, mass: 1, e: 0 }); begin();`);
  run(`run(0.5)`);
  const s0 = run(`snap(STATE.elements[1])`);
  run(`run(2.0)`);
  const s1 = run(`snap(STATE.elements[1])`);
  expect('2초간 낙하 없음', s0.y - s1.y, 0, 0.05);
  expect('정지', Math.abs(s1.vy), 0, 0.05, 'm/s');
});

/* ════════════════════════════════════════════════════════════
   V. 비스듬한 충돌 · 스핀
   ════════════════════════════════════════════════════════════ */

scenario('V1', '원-원 비스듬한 탄성충돌 (동질량) — 충돌 후 속도 직교', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addCircle({ gridX: 20, gridY: 50,   gridW:1, gridH:1, mass: 1, e: 1, vx0: 4 });
       addCircle({ gridX: 40, gridY: 49.5, gridW:1, gridH:1, mass: 1, e: 1 }); begin();`);
  run(`run(10.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  note('v1 / v2', `(${a.vx.toFixed(3)},${a.vy.toFixed(3)}) / (${b.vx.toFixed(3)},${b.vy.toFixed(3)})`);
  expect('운동량 x', a.vx + b.vx, 4, 1e-6, 'kg·m/s');
  expect('운동량 y', a.vy + b.vy, 0, 1e-6, 'kg·m/s');
  expect('운동에너지 보존', a.vx ** 2 + a.vy ** 2 + b.vx ** 2 + b.vy ** 2, 16, '0.5%', 'J·2/m');
  expect('충돌 후 속도 직교 (동질량 e=1)', a.vx * b.vx + a.vy * b.vy, 0, 1e-5, '');
});

scenario('V2', '역회전(백스핀) 공 — 마찰 바닥에서 진행 방향이 역전', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60,{isFriction:true, muS:0.8, muK:0.8});
       addCircle({ gridX: 20, gridY: 59, gridW:1, gridH:1, mass: 1, e: 0, vx0: 3 }); begin();`);
  run(`STATE.elements[0].omega = 30;`);   // +ω = 반시계 = 진행(+x)에 대한 백스핀
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[0])`);
  note('최종 vx / ω', `${s.vx.toFixed(4)} / ${s.omega.toFixed(4)}`);
  expect('백스핀으로 −x 방향 역전', Math.sign(s.vx), -1, 0, '');
  expect('최종 구름조건 v = −rω', s.vx, -0.5 * s.omega, '3%', 'm/s');
  // 접촉선 기준 각운동량 보존 (마찰은 접촉점에 작용 → 토크 0)
  //   L_z = I·ω + (r⃗_center→축 × m v⃗)_z = ½mr²·ω − m·r·vx     (중심은 접촉점 위 +r)
  const L = (v, w) => 0.5 * 1 * 0.25 * w - 1 * 0.5 * v;
  expect('접촉점 각운동량 보존', L(s.vx, s.omega), L(3, 30), '3%', 'kg·m²/s');
});

scenario('V3', '탑스핀 없는 공이 마찰면에서 구름 시작 — ω 부호 정합', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60,{isFriction:true, muS:0.5, muK:0.5});
       addCircle({ gridX: 80, gridY: 59, gridW:1, gridH:1, mass: 1, e: 0, vx0: -5 }); begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('−x 진행 = 반시계 = ω > 0', Math.sign(s.omega), +1, 0, '');
  expect('v_f = ⅔v₀', s.vx, -(2 / 3) * 5, '3%', 'm/s');
});

/* ════════════════════════════════════════════════════════════
   W. 두 자유물체 사이의 용수철
   ════════════════════════════════════════════════════════════ */

scenario('W1', '자유 2체 용수철 진동 — T = 2π√(μ/k), μ = m₁m₂/(m₁+m₂)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const a = addRect({ gridX: 38, gridY: 49, mass: 2, e: 0 });   // 오른면 phys 39
       const b = addRect({ gridX: 42, gridY: 49, mass: 3, e: 0 });   // 왼면  phys 42
       addSpring({ gridX: 39, gridY: 49, gridW: 3, gridH: 1, k: 10, L0: 2, L: 2,
                   autoAttach: false,
                   leftElementId: a.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const ts = run(`
    const A = STATE.elements[0], B = STATE.elements[1];
    const gap = () => (B.physX) - (A.physX + 1);
    const out=[]; let prev=gap()-2; let t=0;
    for (let i=0;i<9000 && out.length<3;i++){
      simStep(CONFIG.FIXED_DT); t+=CONFIG.FIXED_DT;
      const cur=gap()-2;
      if (prev>0&&cur<=0 || prev<0&&cur>=0) out.push(t);
      prev=cur;
    }
    out;`);
  const mu = 2 * 3 / 5;
  expect('평형 통과 2회', ts.length >= 2 ? 1 : 0, 1, 0, '');
  if (ts.length >= 2) expect('주기 T', 2 * (ts[1] - ts[0]), 2 * Math.PI * Math.sqrt(mu / 10), '3%', 's');
});

scenario('W2', '자유 2체 용수철 — 질량중심 정지 유지 (운동량 보존)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const a = addRect({ gridX: 38, gridY: 49, mass: 2, e: 0 });
       const b = addRect({ gridX: 42, gridY: 49, mass: 3, e: 0 });
       addSpring({ gridX: 39, gridY: 49, gridW: 3, gridH: 1, k: 10, L0: 2, L: 2,
                   autoAttach: false,
                   leftElementId: a.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const A = STATE.elements[0], B = STATE.elements[1];
    const cm0 = (2*A.physX + 3*B.physX) / 5;
    let maxDev = 0, maxP = 0;
    for (let i=0;i<3000;i++){
      simStep(CONFIG.FIXED_DT);
      maxDev = Math.max(maxDev, Math.abs((2*A.physX + 3*B.physX)/5 - cm0));
      maxP   = Math.max(maxP, Math.abs(2*A.vx + 3*B.vx));
    }
    ({maxDev, maxP});`);
  expect('질량중심 이동 없음', r.maxDev, 0, 0.01);
  expect('총 운동량 0 유지', r.maxP, 0, 1e-9, 'kg·m/s');
});

scenario('W3', '용수철 + 중력, 두 물체 자유낙하 — 상대진동 유지 & 함께 낙하', ({ run }) => {
  run(`reset();
       const a = addRect({ gridX: 49, gridY: 40, gridW:1, gridH:1, mass: 1, e: 0 });
       const b = addRect({ gridX: 49, gridY: 43, gridW:1, gridH:1, mass: 1, e: 0 });
       addSpring({ gridX: 49, gridY: 41, gridW: 1, gridH: 2, isVertical: true,
                   k: 30, L0: 2, L: 2, autoAttach: false,
                   leftElementId: a.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const t = run(`run(1.0)`);
  const r = run(`({ ay: STATE.elements[0].physY, by: STATE.elements[1].physY,
                    avy: STATE.elements[0].vy, bvy: STATE.elements[1].vy })`);
  // 내부력은 질량중심 운동에 영향 없음 → 질량중심은 자유낙하
  const cm = (r.ay + r.by) / 2;
  const cm0 = ((100 - 40 - 1) + (100 - 43 - 1)) / 2;
  expect('질량중심 자유낙하', cm, cm0 - 0.5 * G * t * t, 0.05);
  expect('질량중심 속도', (r.avy + r.bvy) / 2, -G * t, 0.01, 'm/s');
});

/* ════════════════════════════════════════════════════════════
   X. 실 + 충돌 · 실 + 힘 복합
   ════════════════════════════════════════════════════════════ */

scenario('X1', '진자 충돌 (뉴턴 진자 1:1) — 최하점에서 속도 전달', ({ run }) => {
  // 피벗 phys (50,50), 실 길이 9 → 최하점 (50,41). 바닥 phys y=40.5 위에 B가 정지.
  // A는 수평(41,50)에서 출발 → 최하점 속력 v=√(2g·9)=13.28 로 B와 탄성충돌(동질량).
  run(`reset();
       addFloor(20,59.5,80,59.5);                                   // phys y=40.5
       const piv = addFloor(50,50,52,50);                           // p1 = phys (50,50)
       const A = addCircle({ gridX: 40.5, gridY: 49.5, gridW:1, gridH:1, mass: 1, e: 1 });
       addRope(piv.id,'p1', A.id,'center');
       addCircle({ gridX: 51.5, gridY: 58.5, gridW:1, gridH:1, mass: 1, e: 1 });
       begin();`);
  const r = run(`
    const A = STATE.elements[0], B = STATE.elements[1];
    let pre = null;
    for (let i=0;i<3000;i++){
      const pv = A.vx;
      simStep(CONFIG.FIXED_DT);
      if (B.vx > 0.1) { pre = pv; break; }
    }
    ({ pre, aAfter: A.vx, bAfter: B.vx });`);
  note('충돌 전 vA / 후 vA,vB', `${r.pre.toFixed(3)} / ${r.aAfter.toFixed(3)}, ${r.bAfter.toFixed(3)}`);
  expect('최하점 속력 √(2g·9)', r.pre, Math.sqrt(2 * G * 9), '3%', 'm/s');
  expect('B가 A의 속도를 받음', r.bAfter, r.pre, '5%', 'm/s');
  expect('A 정지 (동질량 탄성)', r.aAfter, 0, 0.35, 'm/s');
});

scenario('X2', 'ForceZone + 실 제약 — 힘이 있어도 실 길이 유지', ({ run }) => {
  run(`reset();
       const seg = addFloor(50,20,52,20);                          // phys (50,80)
       const b = addCircle({ gridX: 49.5, gridY: 29.5, mass: 1 }); // phys (50,70), L=10
       addRope(seg.id,'p1', b.id,'center');
       addZone({ gridX: 20, gridY: 20, gridW: 60, gridH: 60, fx: 30, fy: 0 });
       begin();`);
  const d = run(`
    const bb = STATE.elements[0];
    let maxD = 0;
    for (let i=0;i<1800;i++){
      simStep(CONFIG.FIXED_DT);
      maxD = Math.max(maxD, Math.hypot(bb.physX-50, bb.physY-80));
    }
    maxD;`);
  expect('실 길이 상한 유지', d, 10, 0.05);
});

scenario('X3', '외력 + 실 + 도르래 (Atwood 한쪽을 손으로 당김)', ({ run }) => {
  // 고정 도르래, 좌 m=2 우 m=2 (균형) + 우측을 아래로 F=10N 으로 당김
  // → 계 전체 질량 4kg, 순수 구동력 10N → a = 2.5 m/s²
  run(`reset();
       const anchor = addFloor(50,16,52,16);
       const p = addPulley({ gridX: 49, gridY: 20 });
       addRope(p.id,'center', anchor.id,'p1');
       const A = addCircle({ gridX: 48.5, gridY: 30.5, mass: 2, e: 0 });
       const B = addCircle({ gridX: 50.5, gridY: 30.5, mass: 2, e: 0 });
       addRope(p.id,'left',  A.id,'center');
       addRope(p.id,'right', B.id,'center');
       const f = addExtF({ gridX: 50.5, gridY: 35, forceN: 10 });   // B 아래쪽
       addRope(f.id,'center', B.id,'center');
       begin();`);
  run(`run(0.3)`);
  const b0 = run(`snap(STATE.elements[2])`);
  run(`run(0.3)`);
  const b1 = run(`snap(STATE.elements[2])`);
  note('B vy', `${b0.vy.toFixed(4)} → ${b1.vy.toFixed(4)}`);
  expect('B 하강 가속도 = F/(m₁+m₂)', -(b1.vy - b0.vy) / 0.3, 10 / 4, '8%', 'm/s²');
});

scenario('X4', '실로 연결된 두 물체 — 하나가 테이블 밖으로 떨어지며 끌고 감', ({ run }) => {
  // 테이블 위 A(3kg) — 실 — 테이블 밖 B(2kg) 낙하. 도르래 없이 실만.
  run(`reset();
       addFloor(20,60,50,60);                                       // phys y=40, x 20..50
       const A = addRect  ({ gridX: 45, gridY: 59, mass: 3, e: 0 }); // phys (45..46, 40..41)
       const B = addCircle({ gridX: 50.5, gridY: 58.5, gridW:1, gridH:1, mass: 2, e: 0 });
       addRope(A.id,'right', B.id,'center');
       begin();`);
  const r = run(`
    const A = STATE.elements[0], B = STATE.elements[1];
    let maxErr = 0, minBy = 1e9, d0 = Math.hypot(B.physX-(A.physX+1), B.physY-(A.physY+0.5));
    for (let i=0;i<600;i++){
      simStep(CONFIG.FIXED_DT);
      const d = Math.hypot(B.physX-(A.physX+1), B.physY-(A.physY+0.5));
      maxErr = Math.max(maxErr, d - d0);
      minBy  = Math.min(minBy, B.physY);
    }
    ({ maxErr, Ax: A.physX, By: B.physY, Avx: A.vx, minBy });`);
  note('A x / B 최저 y', `${r.Ax.toFixed(3)} / ${r.minBy.toFixed(3)}`);
  expect('실이 늘어나지 않음', r.maxErr, 0, 0.05);
  expect('A가 실에 끌려 +x로 이동', r.Ax > 45.5 ? 1 : 0, 1, 0, '');
  // B는 테이블 오른쪽 끝(x=50) 밖에서 낙하 → 테이블 위로 솟구쳐 오르면 안 됨
  expect('B가 테이블 위로 튀어오르지 않음', r.By <= 41 ? 1 : 0, 1, 0, '');
});

/* ════════════════════════════════════════════════════════════
   Y. 극단값 · 수치 안정성
   ════════════════════════════════════════════════════════════ */

scenario('Y1', '극단 질량비 1000:1 충돌 — 운동량/에너지 보존', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect({ gridX: 20, gridY: 50, mass: 1000, e: 1, vx0: 2 });
       addRect({ gridX: 30, gridY: 50, mass: 1,    e: 1, vx0: 0 }); begin();`);
  run(`run(10.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('운동량 보존', 1000 * a.vx + 1 * b.vx, 2000, '0.01%', 'kg·m/s');
  expect('가벼운 쪽 ≈ 2v (벽 반사 극한)', b.vx, 2 * 2 * 1000 / 1001, '1%', 'm/s');
  expect('에너지 보존', 1000 * a.vx ** 2 + b.vx ** 2, 1000 * 4, '0.1%', 'J·2');
});

scenario('Y2', '극단 질량비 Atwood 1000:1 — a → g', ({ run }) => {
  run(`reset();
       const anchor = addFloor(50,16,52,16);
       const p = addPulley({ gridX: 49, gridY: 20 });
       addRope(p.id,'center', anchor.id,'p1');
       const A = addCircle({ gridX: 48.5, gridY: 30.5, mass: 1000 });
       const B = addCircle({ gridX: 50.5, gridY: 30.5, mass: 1 });
       addRope(p.id,'left',  A.id,'center');
       addRope(p.id,'right', B.id,'center');
       begin();`);
  run(`run(0.3)`);
  const a0 = run(`snap(STATE.elements[1])`);
  run(`run(0.3)`);
  const a1 = run(`snap(STATE.elements[1])`);
  expect('가속도 → g', -(a1.vy - a0.vy) / 0.3, 999 * G / 1001, '3%', 'm/s²');
});

scenario('Y3', '용수철 k=0 — 힘 없음 (자유낙하)', ({ run }) => {
  run(`reset();
       const b = addRect({ gridX: 49, gridY: 49, gridW:1, gridH:1, mass: 1, e: 0 });
       addSpring({ gridX: 49, gridY: 47, gridW: 1, gridH: 2, isVertical: true,
                   k: 0, L0: 2, L: 2, autoAttach: false,
                   leftElementId: null, rightElementId: b.id,
                   leftLocked: false, rightLocked: true });
       begin();`);
  const t = run(`run(1.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('자유낙하 vy', s.vy, -G * t, 0.01, 'm/s');
});

scenario('Y4', '매우 딱딱한 용수철 k=500 — 발산하지 않음', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);
       const b = addRect({ gridX: 43, gridY: 49, mass: 1, e: 0 });
       addSpring({ gridX: 40, gridY: 49, gridW: 3, gridH: 1,
                   k: 500, L0: 2, L: 2, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const bb = STATE.elements[0];
    let mx = -1e9;
    for (let i=0;i<3000;i++){ simStep(CONFIG.FIXED_DT); mx = Math.max(mx, Math.abs(bb.physX-42)); }
    ({ mx, ok: isFinite(bb.physX) });`);
  expect('유한값 유지', r.ok ? 1 : 0, 1, 0, '');
  expect('진폭 발산 없음 (≈1m 유지)', r.mx, 1, '10%');
});

scenario('Y5', '기본 반발계수 e=1 물체가 바닥에 놓임 — 에너지 증가 없음', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 59, mass: 1, e: 1.0 }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let maxY = -1e9, maxV = 0;
    for (let i=0;i<3600;i++){ simStep(CONFIG.FIXED_DT); maxY=Math.max(maxY,b.physY); maxV=Math.max(maxV,Math.abs(b.vy)); }
    ({maxY, maxV, y:b.physY});`);
  note('최고점 / 최대속력', `${r.maxY.toFixed(6)} / ${r.maxV.toFixed(6)}`);
  expect('튀어오르지 않음 (60초)', r.maxY - 40, 0, 0.01);
  expect('속도 발산 없음', r.maxV, 0, 0.2, 'm/s');
});

scenario('Y6', '연속 반발 감쇠 (e=0.5) — 결국 바닥에 정지', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 50, mass: 1, e: 0.5 }); begin();`);
  run(`run(30.0)`);
  const s = run(`snap(STATE.elements[0])`);
  note('최종 y / vy', `${s.y.toFixed(5)} / ${s.vy.toFixed(5)}`);
  expect('바닥에 안착', s.y, 40, 0.05);
  expect('거의 정지', Math.abs(s.vy), 0, 0.3, 'm/s');
});

/* ════════════════════════════════════════════════════════════
   Z. 포물선 사거리 · 종합 에너지
   ════════════════════════════════════════════════════════════ */

scenario('Z1', '포물선 사거리 — R = v₀²sin(2θ)/g (θ=45°)', ({ run }) => {
  const v0 = 14, th = Math.PI / 4;
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 20, gridY: 59, mass: 1, e: 0,
                 vx0: ${v0 * Math.cos(th)}, vy0: ${v0 * Math.sin(th)} }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let landed = null;
    for (let i=0;i<4000;i++){
      simStep(CONFIG.FIXED_DT);
      if (b.physY <= 40.0001 && b.vy <= 0 && i > 60) { landed = b.physX; break; }
    }
    landed;`);
  expect('사거리 R', r - 20, v0 * v0 * Math.sin(2 * th) / G, '2%');
});

scenario('Z2', '포물선 최고점 — H = (v₀sinθ)²/(2g)', ({ run }) => {
  const v0 = 14, th = Math.PI / 3;
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 20, gridY: 59, mass: 1, e: 0,
                 vx0: ${v0 * Math.cos(th)}, vy0: ${v0 * Math.sin(th)} }); begin();`);
  const h = run(`
    const b = STATE.elements[0];
    let mx = -1e9;
    for (let i=0;i<1200;i++){ simStep(CONFIG.FIXED_DT); mx = Math.max(mx, b.physY); }
    mx;`);
  expect('최고점 H', h - 40, (v0 * Math.sin(th)) ** 2 / (2 * G), '2%');
});

scenario('Z3', '경사면 하강 에너지 보존 (마찰 없음) — ½v² = g·Δh', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40);
       addRect({ gridX: 55, gridY: 42, mass: 1, e: 0 }); begin();`);
  run(`run(0.5)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(1.2)`);
  const s1 = run(`snap(STATE.elements[0])`);
  const dh = s0.y - s1.y;
  const dK = 0.5 * (s1.vx ** 2 + s1.vy ** 2) - 0.5 * (s0.vx ** 2 + s0.vy ** 2);
  expect('ΔK = g·Δh', dK, G * dh, '2%', 'J/kg');
});

scenario('Z4', '마찰 경사면 — 열손실 = μk·mg·cosθ·거리', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40,{isFriction:true, muS:0.2, muK:0.2});
       addRect({ gridX: 55, gridY: 42, mass: 2, e: 0 }); begin();`);
  run(`run(0.5)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(1.2)`);
  const s1 = run(`snap(STATE.elements[0])`);
  const dist = Math.hypot(s1.x - s0.x, s1.y - s0.y);
  const dh   = s0.y - s1.y;
  const dK   = 0.5 * 2 * (s1.vx ** 2 + s1.vy ** 2) - 0.5 * 2 * (s0.vx ** 2 + s0.vy ** 2);
  const Q    = 2 * G * dh - dK;
  expect('마찰 열 = μk·mg·cosθ·s', Q, 0.2 * 2 * G * COS * dist, '4%', 'J');
});

report();
process.exit(0);
