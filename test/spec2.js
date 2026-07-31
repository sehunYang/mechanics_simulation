/* ============================================================
   test/spec2.js — 조합 매트릭스 2차: 요소 쌍/삼중 조합 + 경계 케이스
   실행: node test/spec2.js
   ============================================================ */
'use strict';
const { scenario, expect, note, report } = require('./harness');

const G = 9.8;
const TH  = Math.atan(0.5);           // 경사면 26.565°
const SIN = Math.sin(TH), COS = Math.cos(TH);

/* ════════════════════════════════════════════════════════════
   L. 회전 · 구름 (원 × 마찰 평면)
   ════════════════════════════════════════════════════════════ */

scenario('L1', '미끄럼→구름 전이 (균일 원판) — v_f = ⅔v₀, ω_f = v_f/r', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60,{isFriction:true, muS:0.4, muK:0.4});
       addCircle({ gridX: 10, gridY: 59, gridW:1, gridH:1, mass: 2, e: 0, vx0: 6 }); begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('전이 후 vx', s.vx, (2 / 3) * 6, '3%', 'm/s');
  expect('구름조건 |ω|·r = v', Math.abs(s.omega) * 0.5, Math.abs(s.vx), '3%', 'm/s');
  expect('ω 부호 (+x 진행 = 시계방향 = 음수)', Math.sign(s.omega), -1, 0, '');
});

scenario('L2', '구름 후 등속 유지 (구름마찰 없음)', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60,{isFriction:true, muS:0.4, muK:0.4});
       addCircle({ gridX: 10, gridY: 59, gridW:1, gridH:1, mass: 2, e: 0, vx0: 6 }); begin();`);
  run(`run(3.0)`);
  const a = run(`snap(STATE.elements[0])`);
  run(`run(2.0)`);
  const b = run(`snap(STATE.elements[0])`);
  expect('속도 변화 없음', b.vx - a.vx, 0, 0.02, 'm/s');
});

scenario('L3', '경사면 μk<필요마찰 — 미끄러지며 회전 (v > rω)', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40,{isFriction:true, muS:0.05, muK:0.05});
       addCircle({ gridX: 39, gridY: 50, gridW:1, gridH:1, mass: 1, e: 0 }); begin();`);
  run(`run(1.5)`);
  const s = run(`snap(STATE.elements[0])`);
  const v = Math.hypot(s.vx, s.vy);
  expect('미끄러짐 존재 (v > rω)', v > Math.abs(s.omega) * 0.5 + 0.1 ? 1 : 0, 1, 0, '');
  // 미끄러질 때 a = g(sinθ − μk cosθ)
  note('|v| / rω', `${v.toFixed(3)} / ${(Math.abs(s.omega) * 0.5).toFixed(3)}`);
});

/* ════════════════════════════════════════════════════════════
   M. 적층 · 다물체 정적 평형
   ════════════════════════════════════════════════════════════ */

scenario('M1', '사각형 2단 적층 — 두 물체 모두 정지', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 59, mass: 2, e: 0 });
       addRect({ gridX: 50, gridY: 58, mass: 1, e: 0 }); begin();`);
  run(`run(3.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('아래 물체 y', a.y, 40, 0.02);
  expect('위 물체 y', b.y, 41, 0.02);
  expect('아래 물체 정지', Math.hypot(a.vx, a.vy), 0, 0.05, 'm/s');
  expect('위 물체 정지', Math.hypot(b.vx, b.vy), 0, 0.05, 'm/s');
});

scenario('M2', '원이 사각형 위에 정지', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect  ({ gridX: 50, gridY: 59, gridW: 4, gridH: 1, mass: 5, e: 0 });
       addCircle({ gridX: 51.5, gridY: 58, gridW: 1, gridH: 1, mass: 1, e: 0 }); begin();`);
  run(`run(3.0)`);
  const r = run(`snap(STATE.elements[0])`), c = run(`snap(STATE.elements[1])`);
  expect('사각형 y', r.y, 40, 0.02);
  expect('원 중심 y (사각형 위 + r)', c.y, 41.5, 0.03);
  expect('원 정지', Math.hypot(c.vx, c.vy), 0, 0.05, 'm/s');
});

scenario('M3', '3단 적층 — 최하단이 눌려 내려가지 않음', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 59, mass: 1, e: 0 });
       addRect({ gridX: 50, gridY: 58, mass: 1, e: 0 });
       addRect({ gridX: 50, gridY: 57, mass: 1, e: 0 }); begin();`);
  run(`run(3.0)`);
  const y = run(`STATE.elements.map(e => e.physY)`);
  expect('1단 y', y[0], 40, 0.03);
  expect('2단 y', y[1], 41, 0.03);
  expect('3단 y', y[2], 42, 0.03);
});

/* ════════════════════════════════════════════════════════════
   N. 반발계수 조합 (물체 e₁ ↔ 물체 e₂)
   ════════════════════════════════════════════════════════════ */

scenario('N1', '서로 다른 e 충돌 — e_pair = √(e₁·e₂)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect({ gridX: 20, gridY: 50, mass: 1, e: 1.00, vx0: 4 });
       addRect({ gridX: 30, gridY: 50, mass: 1, e: 0.25, vx0: 0 }); begin();`);
  run(`run(4.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  const e = Math.sqrt(1 * 0.25);   // 0.5
  expect("v1'", a.vx, ((1 - e * 1) * 4) / 2, 1e-6, 'm/s');
  expect("v2'", b.vx, ((1 + e) * 1 * 4) / 2, 1e-6, 'm/s');
  expect('운동량 보존', a.vx + b.vx, 4, 1e-9, 'kg·m/s');
});

scenario('N2', '반발계수 e=0.8 낙하 — 반등높이 = 0.64·h', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60); addRect({ gridX: 50, gridY: 39, mass: 1, e: 0.8 }); begin();`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy>0) break; }`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy<=0) break; }`);
  const s = run(`snap(STATE.elements[0])`);
  expect('반등 정점 높이', s.y - 40, 0.64 * 20, '4%');
});

scenario('N3', '원 낙하 e=0.6 — 반등높이 = 0.36·h', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addCircle({ gridX: 50, gridY: 39, gridW:1, gridH:1, mass: 1, e: 0.6 }); begin();`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy>0) break; }`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy<=0) break; }`);
  const s = run(`snap(STATE.elements[0])`);
  expect('반등 정점 (중심 높이 − r)', (s.y - 0.5) - 40, 0.36 * 20, '5%');
});

/* ════════════════════════════════════════════════════════════
   O. 힘 구간 조합
   ════════════════════════════════════════════════════════════ */

scenario('O1', 'ForceZone 2개 중첩 — 힘 중첩(벡터합)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addZone({ gridX: 30, gridY: 30, gridW: 40, gridH: 40, fx: 6, fy: 0 });
       addZone({ gridX: 30, gridY: 30, gridW: 40, gridH: 40, fx: 0, fy: 8 });
       addRect({ gridX: 49, gridY: 49, mass: 2 }); begin();`);
  const t = run(`run(0.5)`);
  const s = run(`snap(STATE.elements[2])`);
  expect('vx', s.vx, (6 / 2) * t, 1e-9, 'm/s');
  expect('vy', s.vy, (8 / 2) * t, 1e-9, 'm/s');
});

scenario('O2', 'ForceZone은 도르래에 작용하지 않음 (무질량 중계점)', ({ run }) => {
  run(`reset();
       const anchor = addFloor(50,16,52,16);
       const p = addPulley({ gridX: 49, gridY: 20 });
       addRope(p.id,'center', anchor.id,'p1');
       addZone({ gridX: 40, gridY: 15, gridW: 20, gridH: 20, fx: 500, fy: 0 });
       const A = addCircle({ gridX: 48.5, gridY: 30.5, mass: 1 });
       addRope(p.id,'left', A.id,'center');
       begin();`);
  run(`run(1.0)`);
  const p = run(`({ x: STATE.elements[0].physX, y: STATE.elements[0].physY })`);
  expect('도르래 x 불변', p.x, 50, 0.02);
  expect('도르래 y 불변', p.y, 79, 0.02);
});

scenario('O3', 'ForceZone + 마찰 바닥 — 정지마찰이 힘을 이기면 정지', ({ run }) => {
  // F=4N, m=2kg, μs=0.5 → 최대 정지마찰 = 0.5·2·9.8 = 9.8N > 4N → 정지
  run(`reset(); addFloor(0,60,100,60,{isFriction:true, muS:0.5, muK:0.4});
       addZone({ gridX: 40, gridY: 55, gridW: 20, gridH: 6, fx: 4, fy: 0 });
       addRect({ gridX: 50, gridY: 59, mass: 2, e: 0 }); begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[1])`);
  expect('정지 유지 (이동 없음)', s.x, 50, 0.05);
  expect('속도 0', s.vx, 0, 0.05, 'm/s');
});

scenario('O4', 'ForceZone + 마찰 바닥 — 힘이 이기면 a=(F−μk·mg)/m', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60,{isFriction:true, muS:0.2, muK:0.2});
       addZone({ gridX: 20, gridY: 50, gridW: 60, gridH: 11, fx: 20, fy: 0 });
       addRect({ gridX: 30, gridY: 59, mass: 2, e: 0 }); begin();`);
  run(`run(0.5)`);
  const s0 = run(`snap(STATE.elements[1])`);
  run(`run(1.0)`);
  const s1 = run(`snap(STATE.elements[1])`);
  expect('가속도', s1.vx - s0.vx, (20 - 0.2 * 2 * G) / 2, '5%', 'm/s²');
});

/* ════════════════════════════════════════════════════════════
   P. 실 조합
   ════════════════════════════════════════════════════════════ */

scenario('P1', '실 이완 시 힘 없음 — 자유 포물선 후 팽팽해지면 제약', ({ run }) => {
  // 고정점 (50,80), 물체를 바로 아래 (50,72)에 두고 위로 던짐 → 실 이완
  run(`reset();
       const seg = addFloor(50,20,52,20);
       const b = addCircle({ gridX: 49.5, gridY: 27.5, mass: 1, vy0: 4 });
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  const t = run(`run(0.2)`);
  const s = run(`snap(STATE.elements[0])`);
  // 이완 구간에서는 순수 자유운동 (실 길이 8 > 현재 거리)
  expect('이완 중 vy = v₀ − gt', s.vy, 4 - G * t, 0.01, 'm/s');
  expect('이완 중 y', s.y, 72 + 4 * t - 0.5 * G * t * t, 0.02);
  // 충분히 진행하면 다시 팽팽 → 거리 ≤ 8
  run(`run(3.0)`);
  const d = run(`Math.hypot(STATE.elements[0].physX-50, STATE.elements[0].physY-80)`);
  expect('실 길이 상한 준수', d, 8, 0.05);
});

scenario('P2', '실 2줄 V자 매달림 — 정적 평형', ({ run }) => {
  run(`reset();
       const s1 = addFloor(44,20,46,20);   // p1 phys (44,80)
       const s2 = addFloor(56,20,58,20);   // p1 phys (56,80)
       const b = addCircle({ gridX: 49.5, gridY: 29.5, mass: 2 });  // phys (50,70)
       addRope(s1.id,'p1', b.id,'center');
       addRope(s2.id,'p1', b.id,'center');
       begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('x 유지', s.x, 50, 0.05);
  expect('y 유지', s.y, 70, 0.05);
  expect('정지', Math.hypot(s.vx, s.vy), 0, 0.05, 'm/s');
});

scenario('P3', '실 직렬 2단 (고정점−A−B) — 정적 평형, 길이 유지', ({ run }) => {
  run(`reset();
       const seg = addFloor(50,20,52,20);                            // phys (50,80)
       const A = addCircle({ gridX: 49.5, gridY: 34.5, mass: 3 });   // phys (50,65)
       const B = addCircle({ gridX: 49.5, gridY: 44.5, mass: 2 });   // phys (50,55)
       addRope(seg.id,'p1', A.id,'center');
       addRope(A.id,'center', B.id,'center');
       begin();`);
  run(`run(3.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('A y 유지', a.y, 65, 0.05);
  expect('B y 유지', b.y, 55, 0.05);
  expect('A−B 거리 유지', Math.abs(a.y - b.y), 10, 0.05);
  expect('정지', Math.hypot(a.vy, b.vy), 0, 0.05, 'm/s');
});

scenario('P4', '무중력 실 회전 — 원운동 (실 길이·속력 일정)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const seg = addFloor(50,50,52,50);                            // phys (50,50)
       const b = addCircle({ gridX: 59.5, gridY: 49.5, mass: 1, vy0: 5 });  // phys (60,50), L=10
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  const r = run(`
    const bb = STATE.elements[0];
    let dmin=1e9, dmax=-1e9, vmin=1e9, vmax=-1e9;
    for (let i=0;i<1800;i++){
      simStep(CONFIG.FIXED_DT);
      const d = Math.hypot(bb.physX-50, bb.physY-50);
      const v = Math.hypot(bb.vx, bb.vy);
      dmin=Math.min(dmin,d); dmax=Math.max(dmax,d);
      vmin=Math.min(vmin,v); vmax=Math.max(vmax,v);
    }
    ({dmin,dmax,vmin,vmax});`);
  expect('반지름 하한', r.dmin, 10, 0.05);
  expect('반지름 상한', r.dmax, 10, 0.05);
  expect('속력 일정(하한)', r.vmin, 5, '2%', 'm/s');
  expect('속력 일정(상한)', r.vmax, 5, '2%', 'm/s');
});

/* ════════════════════════════════════════════════════════════
   Q. 외력 조합
   ════════════════════════════════════════════════════════════ */

scenario('Q1', '외력 — 도르래 경유로 물체를 림 방향으로 당김', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const anchor = addFloor(50,26,52,26);              // phys (50,74)
       const p = addPulley({ gridX: 49, gridY: 29 });     // 중심 phys (50,70)
       addRope(p.id,'center', anchor.id,'p1');
       const b = addRect({ gridX: 49.5, gridY: 39, gridW:1, gridH:1, mass: 2, e: 0 });  // top 앵커 phys (50,61)
       addRope(p.id,'bottom', b.id,'top');                // 도르래 하단림 (50,69)
       const f = addExtF({ gridX: 49.5, gridY: 24.5, forceN: 10 });
       addRope(f.id,'center', p.id,'top');                // 손 ─ 도르래 상단림
       begin();`);
  const t = run(`run(0.2)`);
  const s = run(`snap(STATE.elements[1])`);
  expect('물체가 림 방향(위)으로 가속 a=F/m', s.vy, (10 / 2) * t, '3%', 'm/s');
});

scenario('Q2', '외력 방향 동결 — 물체가 움직여도 힘 방향 일정', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const b = addRect({ gridX: 40, gridY: 49, mass: 1, e: 0, vy0: 5 });
       const f = addExtF({ gridX: 45, gridY: 49, forceN: 8 });
       addRope(f.id,'center', b.id,'right');
       begin();`);
  const t = run(`run(2.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('vx = (F/m)t (동결된 +x 방향)', s.vx, 8 * t, '1%', 'm/s');
  expect('vy 불변 (힘의 y성분 없음)', s.vy, 5, 1e-9, 'm/s');
});

scenario('Q3', '외력 0N — 아무 영향 없음', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const b = addRect({ gridX: 40, gridY: 49, mass: 1, e: 0 });
       const f = addExtF({ gridX: 45, gridY: 49, forceN: 0 });
       addRope(f.id,'center', b.id,'right');
       begin();`);
  run(`run(2.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('정지 유지', s.x, 40, 1e-9);
});

/* ════════════════════════════════════════════════════════════
   R. 용수철 조합
   ════════════════════════════════════════════════════════════ */

scenario('R1', '용수철 + 원 물체 SHM — T = 2π√(m/k)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);
       const b = addCircle({ gridX: 43, gridY: 49, gridW:1, gridH:1, mass: 2, e: 0 });
       addSpring({ gridX: 40, gridY: 49, gridW: 3, gridH: 1,
                   k: 8, L0: 2.5, L: 2.5, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const bb = STATE.elements[0];
    const eqX = 40 + 2.5 + 0.5;        // 벽 + L0 + 반지름 = 원 중심 평형 x
    const ts=[]; let prev=bb.physX-eqX; let t=0;
    for (let i=0;i<9000 && ts.length<3;i++){
      simStep(CONFIG.FIXED_DT); t+=CONFIG.FIXED_DT;
      const cur=bb.physX-eqX;
      if (prev>0&&cur<=0 || prev<0&&cur>=0) ts.push(t);
      prev=cur;
    }
    ts;`);
  expect('평형 통과 2회 이상', r.length >= 2 ? 1 : 0, 1, 0, '');
  if (r.length >= 2) expect('주기 T', 2 * (r[1] - r[0]), 2 * Math.PI * Math.sqrt(2 / 8), '3%', 's');
});

scenario('R2', '용수철 자동 체결 (autoAttach) — 접촉 시 양끝 감지', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const a = addRect({ gridX: 38, gridY: 49, mass: 1, e: 0 });   // 오른면 grid x=39
       const b = addRect({ gridX: 42, gridY: 49, mass: 1, e: 0 });   // 왼면  grid x=42
       addSpring({ gridX: 39, gridY: 49, gridW: 3, gridH: 1, k: 10, L0: 3, L: 3 });
       validateAll();`);
  const s = run(`({ l: STATE.elements[2].leftElementId, r: STATE.elements[2].rightElementId,
                    ll: STATE.elements[2].leftLocked,   rl: STATE.elements[2].rightLocked,
                    aId: STATE.elements[0].id, bId: STATE.elements[1].id })`);
  expect('왼쪽 자동 체결', s.l === s.aId ? 1 : 0, 1, 0, '');
  expect('오른쪽 자동 체결', s.r === s.bId ? 1 : 0, 1, 0, '');
  expect('양끝 locked', (s.ll && s.rl) ? 1 : 0, 1, 0, '');
});

scenario('R3', '압축된 용수철 — 두 물체를 반대로 밀어냄 (운동량 보존)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const a = addRect({ gridX: 39, gridY: 49, mass: 1, e: 0 });   // 오른면 phys 40
       const b = addRect({ gridX: 42, gridY: 49, mass: 3, e: 0 });   // 왼면  phys 42
       addSpring({ gridX: 40, gridY: 49, gridW: 2, gridH: 1, k: 20, L0: 4, L: 2,
                   autoAttach: false,
                   leftElementId: a.id, rightElementId: b.id,
                   leftLocked: false, rightLocked: false });
       begin();`);
  const t = run(`run(0.05)`);
  const s = run(`({ av: STATE.elements[0].vx, bv: STATE.elements[1].vx })`);
  note('속도 A/B', `${s.av.toFixed(4)} / ${s.bv.toFixed(4)}`);
  expect('A는 왼쪽(−)으로 밀림', Math.sign(s.av), -1, 0, '');
  expect('B는 오른쪽(+)으로 밀림', Math.sign(s.bv), +1, 0, '');
  expect('운동량 보존 (총합 0)', 1 * s.av + 3 * s.bv, 0, 1e-9, 'kg·m/s');
});

scenario('R4', '미체결 용수철 + 인장 — 분리되고 힘 전달 없음', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const a = addRect({ gridX: 38, gridY: 49, mass: 1, e: 0 });
       const b = addRect({ gridX: 44, gridY: 49, mass: 1, e: 0 });
       addSpring({ gridX: 39, gridY: 49, gridW: 5, gridH: 1, k: 20, L0: 2, L: 2,
                   autoAttach: false,
                   leftElementId: a.id, rightElementId: b.id,
                   leftLocked: false, rightLocked: false });
       begin();`);
  run(`run(1.0)`);
  const s = run(`({ av: STATE.elements[0].vx, bv: STATE.elements[1].vx,
                    ld: STATE.elements[2]._leftDetached, rd: STATE.elements[2]._rightDetached,
                    L: STATE.elements[2].L, L0: STATE.elements[2].L0 })`);
  expect('분리 플래그', (s.ld || s.rd) ? 1 : 0, 1, 0, '');
  expect('A 정지 (힘 전달 없음)', s.av, 0, 1e-9, 'm/s');
  expect('B 정지 (힘 전달 없음)', s.bv, 0, 1e-9, 'm/s');
  expect('용수철 자연길이 복귀', s.L, s.L0, 1e-9);
});

scenario('R5', '용수철 에너지 보존 — ½kA² = ½mv²_max', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);
       const b = addRect({ gridX: 43, gridY: 49, mass: 1, e: 0 });   // 신장 A=1
       addSpring({ gridX: 40, gridY: 49, gridW: 3, gridH: 1,
                   k: 10, L0: 2, L: 2, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const vmax = run(`
    const bb = STATE.elements[0];
    let vm = 0;
    for (let i=0;i<3000;i++){ simStep(CONFIG.FIXED_DT); vm = Math.max(vm, Math.abs(bb.vx)); }
    vm;`);
  expect('v_max = A√(k/m)', vmax, 1 * Math.sqrt(10 / 1), '1%', 'm/s');
});

scenario('R6', '수직 용수철 + 중력 — 에너지 보존 (최저점 = 2mg/k 아래)', ({ run }) => {
  run(`reset();
       const ceil = addFloor(60,30,40,30);          // phys y=70, 법선 아래
       const b = addRect({ gridX: 49, gridY: 32, gridW:1, gridH:1, mass: 1, e: 0 });
       addSpring({ gridX: 49, gridY: 30, gridW: 1, gridH: 2, isVertical: true,
                   k: 20, L0: 2, L: 2, autoAttach: false,
                   leftElementId: ceil.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const bb = STATE.elements[0];
    let mn = 1e9;
    for (let i=0;i<3000;i++){ simStep(CONFIG.FIXED_DT); mn = Math.min(mn, bb.physY); }
    mn;`);
  // 자연길이에서 정지 출발 → 최저점 신장 = 2mg/k, 물체 윗면 초기 y=68
  expect('최저점 (물체 윗면)', r + 1, 68 - 2 * 1 * G / 20, '2%');
});

/* ════════════════════════════════════════════════════════════
   S. 곡면 · 꺾인 바닥
   ════════════════════════════════════════════════════════════ */

scenario('S1', 'ELBOW_H (바닥+오른쪽 벽) — 벽에 막혀 정지, 관통 없음', ({ run }) => {
  // grid (20,60)→(60,40) ELBOW_H → phys (20,40)→(60,40) 수평[법선 위] + (60,40)→(60,60) 수직[법선 −x]
  run(`reset(); addFloor(20,60,60,40,{pathType:'ELBOW_H'});
       addRect({ gridX: 30, gridY: 59, mass: 1, e: 0, vx0: 8 }); begin();`);
  run(`run(5.0)`);
  const s = run(`snap(STATE.elements[0])`);
  note('최종 위치', `(${s.x.toFixed(3)}, ${s.y.toFixed(3)})`);
  expect('바닥 위 유지 (phys y=40)', s.y, 40, 0.05);
  expect('벽(x=60)을 통과하지 않음 — 오른쪽 면', s.x + 1, 60, 0.05);
  expect('정지', s.vx, 0, 0.05, 'm/s');
});

scenario('S1b', 'ELBOW_V (왼쪽 벽+바닥) — 벽에 막혀 정지', ({ run }) => {
  // grid (30,40)→(70,60) ELBOW_V → phys A=(30,60), M=(30,40), B=(70,40)
  //   수직 (30,60)→(30,40): 법선 (+1,0) → 오른쪽이 자유면 (왼쪽 벽)
  //   수평 (30,40)→(70,40): 법선 (0,1) → 위가 자유면 (바닥)
  run(`reset(); addFloor(30,40,70,60,{pathType:'ELBOW_V'});
       addRect({ gridX: 50, gridY: 59, mass: 1, e: 0, vx0: -8 }); begin();`);
  run(`run(5.0)`);
  const s = run(`snap(STATE.elements[0])`);
  note('최종 위치', `(${s.x.toFixed(3)}, ${s.y.toFixed(3)})`);
  expect('바닥 위 유지', s.y, 40, 0.05);
  expect('벽(x=30) 통과 없음 — 왼쪽 면', s.x, 30, 0.05);
  expect('정지', s.vx, 0, 0.05, 'm/s');
});

scenario('S2', 'ARC_DOWN 마찰없는 골짜기 — 반대편 같은 높이까지 상승 (에너지 보존)', ({ run }) => {
  // curvature 0.5: R=28.284, h=20, 중심 phys (50,70), 최저점 y=70−28.284=41.716
  run(`reset(); addFloor(30,50,70,50,{pathType:'ARC_DOWN', curvature:0.5});
       addCircle({ gridX: 29.5, gridY: 49.5, gridW:1, gridH:1, mass:1, e:0 }); begin();`);
  const r = run(`
    const b0 = STATE.elements[0];
    let minY=1e9, maxAfter=-1e9, passed=false;
    for (let i=0;i<2400;i++){
      simStep(CONFIG.FIXED_DT);
      minY = Math.min(minY, b0.physY);
      if (b0.physX > 50) passed = true;
      if (passed) maxAfter = Math.max(maxAfter, b0.physY);
    }
    ({minY, maxAfter, x:b0.physX});`);
  note('최저점 / 반대편 최고점', `${r.minY.toFixed(3)} / ${r.maxAfter.toFixed(3)}`);
  expect('최저점 (곡면 최저 + r)', r.minY, 41.716 + 0.5, 0.35);
  expect('반대편 도달 높이 ≈ 출발 높이', r.maxAfter, 50, 1.0);
});

scenario('S3', 'ARC_UP 언덕 곡률 0.4 — 표면을 따라 미끄러짐', ({ run }) => {
  run(`reset(); addFloor(30,50,70,50,{pathType:'ARC_UP', curvature:0.4});
       addCircle({ gridX: 39.5, gridY: 40, gridW:1, gridH:1, mass:1, e:0 }); begin();`);
  // curvature 0.4 → θ=0.4π, R=20/sin(0.2π)=34.03, h=R·cos(0.2π)=27.53 → 중심 phys (50, 50−27.53)=(50,22.47)
  const r = run(`
    const b0 = STATE.elements[0];
    let minR = 1e9;
    for (let i=0;i<600;i++){
      simStep(CONFIG.FIXED_DT);
      const d = Math.hypot(b0.physX-50, b0.physY-22.47);
      if (b0.physX > 31 && b0.physX < 69) minR = Math.min(minR, d);
    }
    ({minR, x:b0.physX, y:b0.physY});`);
  note('최종 위치', `(${r.x.toFixed(3)}, ${r.y.toFixed(3)})`);
  expect('언덕 표면(R=34.03) 관통 없음', r.minR, 34.53, 0.2);
});

scenario('S4', 'ARC_DOWN 곡률 1.5 (오버행 골짜기) — 관통 없음', ({ run }) => {
  run(`reset(); addFloor(30,50,70,50,{pathType:'ARC_DOWN', curvature:1.5});
       addCircle({ gridX: 49.5, gridY: 45, gridW:1, gridH:1, mass:1, e:0 }); begin();`);
  // θ=1.5π, R=28.284, h=−20 → 중심 phys (50, 50−20)=(50,30), 최저점 y=30−28.284=1.716
  const r = run(`
    const b0 = STATE.elements[0];
    let minD = 1e9;
    for (let i=0;i<1200;i++){
      simStep(CONFIG.FIXED_DT);
      minD = Math.min(minD, Math.hypot(b0.physX-50, b0.physY-30));
    }
    ({minD, y:b0.physY});`);
  note('최종 y / 중심까지 최소거리', `${r.y.toFixed(3)} / ${r.minD.toFixed(3)}`);
  expect('곡면(R=28.284) 안쪽에 머무름', r.minD <= 28.3 ? 1 : 0, 1, 0, '');
  expect('아래로 관통하지 않음 (y > 0)', r.y > 0 ? 1 : 0, 1, 0, '');
});

/* ════════════════════════════════════════════════════════════
   T. 경계 · 방어 케이스
   ════════════════════════════════════════════════════════════ */

scenario('T1', '질량 0 가드 — 최소질량으로 보정되고 NaN 없음', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 50, mass: 0, e: 0 });
       addRect({ gridX: 55, gridY: 50, mass: -3, e: 0 }); begin();`);
  run(`run(2.0)`);
  const s = run(`STATE.elements.map(e => ({ m: e.mass, x: e.physX, y: e.physY, vx: e.vx, vy: e.vy }))`);
  expect('질량 보정 (0 → 0.1)', s[0].m, 0.1, 1e-12, 'kg');
  expect('질량 보정 (−3 → 0.1)', s[1].m, 0.1, 1e-12, 'kg');
  expect('NaN 없음', s.every(e => isFinite(e.x) && isFinite(e.y) && isFinite(e.vx) && isFinite(e.vy)) ? 1 : 0, 1, 0, '');
});

scenario('T2', '무중력 + Atwood — 움직이지 않음', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const anchor = addFloor(50,16,52,16);
       const p = addPulley({ gridX: 49, gridY: 20 });
       addRope(p.id,'center', anchor.id,'p1');
       const A = addCircle({ gridX: 48.5, gridY: 30.5, mass: 5 });
       const B = addCircle({ gridX: 50.5, gridY: 30.5, mass: 1 });
       addRope(p.id,'left',  A.id,'center');
       addRope(p.id,'right', B.id,'center');
       begin();`);
  run(`run(2.0)`);
  const v = run(`[STATE.elements[1].vy, STATE.elements[2].vy]`);
  expect('A 정지', v[0], 0, 1e-9, 'm/s');
  expect('B 정지', v[1], 0, 1e-9, 'm/s');
});

scenario('T3', '요소 없이 실행 — 예외 없음', ({ run }) => {
  run(`reset(); begin(); run(1.0);`);
  expect('정상 종료', 1, 1, 0, '');
});

scenario('T4', '장시간 안정성 — 정지 물체가 떨거나 가라앉지 않음 (60초)', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 59, mass: 1, e: 0 }); begin();`);
  run(`run(60.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('60초 후 y', s.y, 40, 1e-6);
  expect('60초 후 속도', Math.abs(s.vy), 0, 1e-9, 'm/s');
});

/* 진자의 장시간 에너지 감소는 "위치 투영 제약 + 1차 적분"의 이산화 소산이며
   dt에 정확히 비례해 0으로 수렴한다(SUBSTEPS 1→32 에서 5.77%→0.25%, 매번 절반).
   즉 물리 모델의 오류가 아니라 적분 정밀도 문제 → 30초 드리프트 상한만 검증. */
scenario('T5', '진자 장시간 에너지 드리프트 (30초) — 이산화 소산 상한 이내', ({ run }) => {
  run(`reset();
       const seg = addFloor(50,20,52,20);
       const b = addCircle({ gridX: 59.5, gridY: 19.5, mass: 1 });   // 수평 출발, y=80
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  const r = run(`
    const bb = STATE.elements[0];
    const E = () => 0.5*(bb.vx*bb.vx + bb.vy*bb.vy) + 9.8*bb.physY;
    const E0 = E();
    for (let i=0;i<1800;i++) simStep(CONFIG.FIXED_DT);   // 30초
    ({ loss: (E0 - E()) / E0 });`);
  note('30초 에너지 손실', (r.loss * 100).toFixed(3) + ' %');
  expect('에너지 증가 없음 (발산하지 않음)', r.loss >= 0 ? 1 : 0, 1, 0, '');
  expect('30초 드리프트 ≤ 2.5%', r.loss <= 0.025 ? 1 : 0, 1, 0, '');
});

scenario('T7', '에너지 드리프트가 dt에 비례 (1차 수렴) — 모델 오류가 아님', ({ ctx }) => {
  const vm = require('vm');
  const losses = [];
  for (const sub of [4, 8, 16]) {
    vm.runInContext(`CONFIG.SUBSTEPS = ${sub};`, ctx);
    losses.push(vm.runInContext(`{
      reset();
      const seg = addFloor(50,20,52,20);
      const b = addCircle({ gridX: 59.5, gridY: 19.5, mass: 1 });
      addRope(seg.id,'p1', b.id,'center'); begin();
      const E = () => 0.5*(b.vx*b.vx + b.vy*b.vy) + 9.8*b.physY;
      const E0 = E();
      for (let i=0;i<1800;i++) simStep(CONFIG.FIXED_DT);
      (E0 - E()) / E0;
    }`, ctx));
  }
  vm.runInContext(`CONFIG.SUBSTEPS = 4;`, ctx);
  note('손실 (SUBSTEPS 4/8/16)', losses.map(l => (l * 100).toFixed(3) + '%').join(' → '));
  expect('dt 절반 → 손실 절반 (4→8)', losses[0] / losses[1], 2, '10%', '배');
  expect('dt 절반 → 손실 절반 (8→16)', losses[1] / losses[2], 2, '10%', '배');
});

scenario('T6', '높은 속도 관통 방지 — 빠른 물체가 바닥을 통과하지 않음', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60);
       addRect({ gridX: 50, gridY: 20, mass: 1, e: 0, vy0: -60 }); begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[0])`);
  note('최종 y', s.y.toFixed(4));
  expect('바닥 위에 정지', s.y, 40, 0.05);
});

report();
process.exit(0);
