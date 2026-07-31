/* ============================================================
   test/spec.js — 역학 요소 조합 대표 케이스 × 실제 물리 공식 검증
   실행: node test/spec.js
   ============================================================ */
'use strict';
const { scenario, expect, note, report } = require('./harness');

const G = 9.8;
const D = Math.PI / 180;

/* 자주 쓰는 경사면: grid (20,60)→(60,40)  = phys (20,40)→(60,60)
   dx=40, dy=20 → 오르막(오른쪽), 법선=(-0.4472, 0.8944) (위쪽면)
   θ = atan(1/2) = 26.565°, sinθ=0.44721, cosθ=0.89443            */
const TH    = Math.atan(0.5);
const SIN   = Math.sin(TH), COS = Math.cos(TH);

/* ════════════════════════════════════════════════════════════
   A. 중력 / 관성 (요소: 물체 단독)
   ════════════════════════════════════════════════════════════ */

scenario('A1', '자유낙하 (사각형) — y=y₀-½gt², v=-gt', ({ run }) => {
  run(`reset(); addRect({ gridX: 50, gridY: 10, mass: 2 }); begin();`);
  const t = run(`run(1.0)`);
  const s = run(`snap(STATE.elements[0])`);
  const y0 = 100 - 10 - 1;
  expect('y(1s)', s.y, y0 - 0.5 * G * t * t, 0.05);
  expect('vy(1s)', s.vy, -G * t, 0.01, 'm/s');
  expect('vx(1s)', s.vx, 0, 1e-9, 'm/s');
  note('월드픽셀 y (cellSize=8)', JSON.stringify(run(`px(STATE.elements[0])`)));
});

scenario('A2', '자유낙하 (원) — 질량 무관 (갈릴레이)', ({ run }) => {
  run(`reset(); addCircle({ gridX: 50, gridY: 10, mass: 0.5 });
       addCircle({ gridX: 60, gridY: 10, mass: 50 }); begin();`);
  const t = run(`run(1.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('가벼운 물체 y', a.y, (100 - 10 - 0.5) - 0.5 * G * t * t, 0.05);
  expect('무거운 물체 y', b.y, (100 - 10 - 0.5) - 0.5 * G * t * t, 0.05);
  expect('두 물체 y 동일', a.y - b.y, 0, 1e-12);
});

scenario('A3', '포물선 운동 — x=vx₀t, y=y₀+vy₀t-½gt²', ({ run }) => {
  run(`reset(); addRect({ gridX: 20, gridY: 50, mass: 1, vx0: 6, vy0: 8 }); begin();`);
  const t = run(`run(1.2)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('x(1.2s)', s.x, 20 + 6 * t, 0.05);
  expect('y(1.2s)', s.y, (100 - 50 - 1) + 8 * t - 0.5 * G * t * t, 0.06);
  expect('vx 보존', s.vx, 6, 1e-9, 'm/s');
  expect('vy(1.2s)', s.vy, 8 - G * t, 0.01, 'm/s');
});

scenario('A4', '무중력 등속 직선운동 (뉴턴 1법칙)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect({ gridX: 20, gridY: 50, mass: 3, vx0: 5, vy0: -2 }); begin();`);
  const t = run(`run(2.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('x', s.x, 20 + 5 * t, 1e-9);
  expect('y', s.y, 49 - 2 * t, 1e-9);
  expect('vx', s.vx, 5, 1e-12, 'm/s');
  expect('vy', s.vy, -2, 1e-12, 'm/s');
});

/* ════════════════════════════════════════════════════════════
   B. 바닥(LINE) 충돌 · 반발계수  (물체 × 바닥면)
   ════════════════════════════════════════════════════════════ */

scenario('B1', '완전탄성 낙하 반발 e=1 — 반발속도 = 충돌속도', ({ run }) => {
  // 바닥 phys y=40, 사각형 밑면 초기 phys y=60 → 낙차 20 m
  run(`reset(); addFloor(0,60,100,60); addRect({ gridX: 50, gridY: 39, mass: 1, e: 1.0 }); begin();`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy>0) break; }`);
  const s = run(`snap(STATE.elements[0])`);
  const vImpact = Math.sqrt(2 * G * 20);
  expect('반발 직후 vy', s.vy, vImpact, '3%', 'm/s');
});

scenario('B2', '반발계수 e=0.5 — 반발속도 = 0.5·v, 반등높이 = 0.25·h', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60); addRect({ gridX: 50, gridY: 39, mass: 1, e: 0.5 }); begin();`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy>0) break; }`);
  const s = run(`snap(STATE.elements[0])`);
  const vImpact = Math.sqrt(2 * G * 20);
  expect('반발 직후 vy', s.vy, 0.5 * vImpact, '3%', 'm/s');
  // 반등 정점까지 계속 진행
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy<=0) break; }`);
  const top = run(`snap(STATE.elements[0])`);
  expect('반등 정점 높이(바닥 위)', top.y - 40, 0.25 * 20, '6%');
});

scenario('B3', '반발계수 e=0.25 — 반등높이 = 0.0625·h', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60); addRect({ gridX: 50, gridY: 39, mass: 1, e: 0.25 }); begin();`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy>0) break; }`);
  const s = run(`snap(STATE.elements[0])`);
  expect('반발 직후 vy', s.vy, 0.25 * Math.sqrt(2 * G * 20), '3%', 'm/s');
});

scenario('B4', '완전비탄성 e=0 — 바닥에 정지 (관통/떨림 없음)', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60); addRect({ gridX: 50, gridY: 39, mass: 1, e: 0.0 }); begin();`);
  run(`run(4.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('정지 y (바닥면)', s.y, 40, 0.02);
  expect('정지 vy', s.vy, 0, 0.2, 'm/s');
});

scenario('B5', '원 낙하 e=1 — 원-선분 충돌도 동일 반발', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60); addCircle({ gridX: 50, gridY: 39, gridW:1, gridH:1, mass: 1, e: 1.0 }); begin();`);
  run(`for (let i=0;i<4000;i++){ simStep(CONFIG.FIXED_DT); if (STATE.elements[0].vy>0) break; }`);
  const s = run(`snap(STATE.elements[0])`);
  // 원 중심 초기 phys y = 100-39-0.5 = 60.5, 접촉 시 중심 y=40.5 → 낙차 20
  expect('반발 직후 vy', s.vy, Math.sqrt(2 * G * 20), '3%', 'm/s');
});

/* ════════════════════════════════════════════════════════════
   C. 마찰 (물체 × 바닥면 마찰)
   ════════════════════════════════════════════════════════════ */

scenario('C1', '수평면 운동마찰 감속 — a = -μk·g', ({ run }) => {
  run(`reset(); addFloor(0,60,100,60,{isFriction:true, muS:0.5, muK:0.4});
       addRect({ gridX: 20, gridY: 59, mass: 2, e: 0.0, vx0: 10 }); begin();`);
  run(`run(0.2)`);                 // 접지 안정화
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(1.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  expect('Δvx 1초 (감속량)', s0.vx - s1.vx, 0.4 * G * 1.0, '8%', 'm/s');
  note('vx 시작→끝', `${s0.vx.toFixed(4)} → ${s1.vx.toFixed(4)}`);
});

scenario('C2', '마찰 없는 경사면 — a = g·sinθ (θ=26.565°)', ({ run }) => {
  // 경사 위에 정확히 얹기: 밑면 중앙이 접촉하도록 배치
  run(`reset(); addFloor(20,60,60,40);
       addRect({ gridX: 39, gridY: 50, mass: 1, e: 0.0 }); begin();`);
  run(`run(1.0)`);                 // 안착
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(1.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  const dv = Math.hypot(s1.vx - s0.vx, s1.vy - s0.vy);
  expect('1초간 속력 증가', dv, G * SIN * 1.0, '10%', 'm/s');
  note('v 벡터', `(${s1.vx.toFixed(3)}, ${s1.vy.toFixed(3)})`);
});

scenario('C3', '경사면 정지마찰 μs>tanθ — 정지 유지', ({ run }) => {
  // tanθ = 0.5 → μs=0.9 면 미끄러지지 않아야 함
  run(`reset(); addFloor(20,60,60,40,{isFriction:true, muS:0.9, muK:0.7});
       addRect({ gridX: 39, gridY: 50, mass: 1, e: 0.0 }); begin();`);
  run(`run(1.0)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(2.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  expect('2초 뒤 이동거리', Math.hypot(s1.x - s0.x, s1.y - s0.y), 0, 0.15);
  expect('2초 뒤 속력', Math.hypot(s1.vx, s1.vy), 0, 0.2, 'm/s');
});

scenario('C4', '경사면 운동마찰 μk<tanθ — a = g(sinθ − μk·cosθ)', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40,{isFriction:true, muS:0.2, muK:0.2});
       addRect({ gridX: 39, gridY: 50, mass: 1, e: 0.0 }); begin();`);
  run(`run(1.0)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(1.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  const dv = Math.hypot(s1.vx - s0.vx, s1.vy - s0.vy);
  expect('1초간 속력 증가', dv, G * (SIN - 0.2 * COS) * 1.0, '12%', 'm/s');
});

/* ════════════════════════════════════════════════════════════
   D. 회전 / 구름 (원 × 마찰 바닥)
   ════════════════════════════════════════════════════════════ */

scenario('D1', '경사면 구름운동 (미끄럼 없음) — a = (2/3)g·sinθ', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40,{isFriction:true, muS:0.8, muK:0.8});
       addCircle({ gridX: 39, gridY: 50, gridW:1, gridH:1, mass: 1, e: 0.0 }); begin();`);
  run(`run(1.0)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(1.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  const dv = Math.hypot(s1.vx - s0.vx, s1.vy - s0.vy);
  expect('1초간 속력 증가', dv, (2 / 3) * G * SIN, '12%', 'm/s');
  const v = Math.hypot(s1.vx, s1.vy);
  expect('구름조건 |v| = r|ω| (r=0.5)', Math.abs(s1.omega) * 0.5, v, '10%', 'm/s');
});

scenario('D2', '마찰 없는 경사면 — 회전 없이 미끄러짐 (ω=0)', ({ run }) => {
  run(`reset(); addFloor(20,60,60,40);
       addCircle({ gridX: 39, gridY: 50, gridW:1, gridH:1, mass: 1, e: 0.0 }); begin();`);
  run(`run(2.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('각속도 ω', s.omega, 0, 1e-9, 'rad/s');
});

/* ════════════════════════════════════════════════════════════
   E. 물체 ↔ 물체 충돌
   ════════════════════════════════════════════════════════════ */

scenario('E1', '탄성충돌 동일질량 (사각-사각) — 속도 교환', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect({ gridX: 20, gridY: 50, mass: 1, e: 1.0, vx0: 4 });
       addRect({ gridX: 30, gridY: 50, mass: 1, e: 1.0, vx0: 0 }); begin();`);
  run(`run(4.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('A 속도', a.vx, 0, 1e-6, 'm/s');
  expect('B 속도', b.vx, 4, 1e-6, 'm/s');
});

scenario('E2', '탄성충돌 질량비 1:3 — v1\'=-v/2, v2\'=+v/2', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect({ gridX: 20, gridY: 50, mass: 1, e: 1.0, vx0: 4 });
       addRect({ gridX: 30, gridY: 50, mass: 3, e: 1.0, vx0: 0 }); begin();`);
  run(`run(4.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect("v1'", a.vx, (1 - 3) / 4 * 4, 1e-6, 'm/s');
  expect("v2'", b.vx, 2 * 1 / 4 * 4, 1e-6, 'm/s');
});

scenario('E3', '완전비탄성 e=0 — 운동량 보존, 공통속도', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect({ gridX: 20, gridY: 50, mass: 1, e: 0.0, vx0: 4 });
       addRect({ gridX: 30, gridY: 50, mass: 3, e: 0.0, vx0: 0 }); begin();`);
  run(`run(4.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('공통속도', a.vx, 1.0, 1e-6, 'm/s');
  expect('운동량 보존', 1 * a.vx + 3 * b.vx, 4, 1e-6, 'kg·m/s');
});

scenario('E4', '탄성충돌 (원-원) 동일질량 — 속도 교환', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addCircle({ gridX: 20, gridY: 50, mass: 1, e: 1.0, vx0: 4 });
       addCircle({ gridX: 30, gridY: 50, mass: 1, e: 1.0, vx0: 0 }); begin();`);
  run(`run(4.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('A 속도', a.vx, 0, 1e-6, 'm/s');
  expect('B 속도', b.vx, 4, 1e-6, 'm/s');
});

scenario('E5', '탄성충돌 (사각-원) 질량 1:2', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect  ({ gridX: 20, gridY: 50, mass: 1, e: 1.0, vx0: 4 });
       addCircle({ gridX: 30, gridY: 50, mass: 2, e: 1.0, vx0: 0 }); begin();`);
  run(`run(4.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect("v1'", a.vx, (1 - 2) / 3 * 4, 1e-5, 'm/s');
  expect("v2'", b.vx, 2 * 1 / 3 * 4, 1e-5, 'm/s');
  expect('운동량 보존', 1 * a.vx + 2 * b.vx, 4, 1e-5, 'kg·m/s');
});

scenario('E6', '정면충돌 운동에너지 보존 (e=1)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addRect({ gridX: 20, gridY: 50, mass: 2, e: 1.0, vx0: 3 });
       addRect({ gridX: 34, gridY: 50, mass: 5, e: 1.0, vx0: -2 }); begin();`);
  run(`run(4.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  const K0 = 0.5 * 2 * 9 + 0.5 * 5 * 4;
  const K1 = 0.5 * 2 * a.vx * a.vx + 0.5 * 5 * b.vx * b.vx;
  expect('운동에너지', K1, K0, '0.5%', 'J');
  expect('운동량', 2 * a.vx + 5 * b.vx, 2 * 3 + 5 * -2, 1e-6, 'kg·m/s');
});

/* ════════════════════════════════════════════════════════════
   F. 힘 구간 (ForceZone)
   ════════════════════════════════════════════════════════════ */

scenario('F1', 'ForceZone 내부 — a = F/m + g', ({ run }) => {
  run(`reset(); addZone({ gridX: 40, gridY: 40, gridW: 20, gridH: 20, fx: 6, fy: 20 });
       addRect({ gridX: 49, gridY: 49, mass: 2 }); begin();`);
  const t = run(`run(0.5)`);
  const s = run(`snap(STATE.elements[1])`);
  expect('vx', s.vx, (6 / 2) * t, 1e-6, 'm/s');
  expect('vy', s.vy, (20 / 2 - G) * t, 1e-6, 'm/s');
});

scenario('F2', 'ForceZone 무중력 — 순수 F=ma', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addZone({ gridX: 30, gridY: 30, gridW: 40, gridH: 40, fx: 0, fy: 12 });
       addCircle({ gridX: 49, gridY: 49, mass: 4 }); begin();`);
  const t = run(`run(1.0)`);
  const s = run(`snap(STATE.elements[1])`);
  expect('vy = (F/m)t', s.vy, (12 / 4) * t, 1e-6, 'm/s');
  expect('Δy = ½(F/m)t²', s.y - (100 - 49 - 0.5), 0.5 * 3 * t * t, 0.02);
});

scenario('F3', 'ForceZone 이탈 후 힘 소멸', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       addZone({ gridX: 48, gridY: 40, gridW: 4, gridH: 4, fx: 10, fy: 0 });
       addRect({ gridX: 48, gridY: 41, mass: 1 }); begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[1])`);
  note('구간 이탈 후 vx (등속이어야)', s.vx.toFixed(4));
  const v1 = s.vx;
  run(`run(1.0)`);
  const s2 = run(`snap(STATE.elements[1])`);
  expect('이탈 후 등속 유지', s2.vx, v1, 1e-9, 'm/s');
});

/* ════════════════════════════════════════════════════════════
   G. 실 (Rope) — 고정점/진자/장력
   ════════════════════════════════════════════════════════════ */

scenario('G1', '실에 매달린 정지 물체 — 움직이지 않음', ({ run }) => {
  run(`reset();
       const seg = addFloor(50,20,52,20);
       const b = addCircle({ gridX: 49.5, gridY: 29.5, mass: 3 });
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  run(`run(3.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('y 유지', s.y, 70, 0.02);
  expect('x 유지', s.x, 50, 0.02);
  expect('속력', Math.hypot(s.vx, s.vy), 0, 0.05, 'm/s');
});

scenario('G2', '실 길이 제약 — 거리 = L 유지 (진자 스윙 중)', ({ run }) => {
  run(`reset();
       const seg = addFloor(50,20,52,20);
       const b = addCircle({ gridX: 59.5, gridY: 19.5, mass: 1 });  // 수평 위치, L=10
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  const d = run(`
    let maxErr = 0;
    for (let i=0;i<600;i++){
      simStep(CONFIG.FIXED_DT);
      const b = STATE.elements[0];
      const dd = Math.hypot(b.physX-50, b.physY-80);
      maxErr = Math.max(maxErr, Math.abs(dd-10));
    }
    maxErr;`);
  expect('실 길이 최대 오차', d, 0, 0.05);
});

scenario('G3', '단진자 주기 (소진폭) — T = 2π√(L/g)', ({ run }) => {
  const L = 10, A = 5 * D;
  const x0 = 50 + L * Math.sin(A), y0 = 80 - L * Math.cos(A);
  run(`reset();
       const seg = addFloor(50,20,52,20);
       const b = addCircle({ gridX: ${x0 - 0.5}, gridY: ${100 - y0 - 0.5}, mass: 1 });
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  // x가 평형(50)을 지나는 시각을 4번 기록 → 반주기 간격
  const cross = run(`
    const b = STATE.elements[0];
    const ts = []; let prev = b.physX - 50; let t = 0;
    for (let i=0;i<4000 && ts.length<3;i++){
      simStep(CONFIG.FIXED_DT); t += CONFIG.FIXED_DT;
      const cur = b.physX - 50;
      if (prev > 0 && cur <= 0 || prev < 0 && cur >= 0) ts.push(t);
      prev = cur;
    }
    ts;`);
  const halfT = cross[1] - cross[0];
  expect('주기 T', 2 * halfT, 2 * Math.PI * Math.sqrt(L / G), '3%', 's');
});

scenario('G4', '진자 에너지 보존 — 반대편 도달 높이 = 시작 높이', ({ run }) => {
  run(`reset();
       const seg = addFloor(50,20,52,20);
       const b = addCircle({ gridX: 59.5, gridY: 19.5, mass: 1 });  // 수평, y=80
       addRope(seg.id,'p1', b.id,'center'); begin();`);
  const res = run(`
    const b = STATE.elements[0];
    let minY = 1e9, maxYafter = -1e9, passedBottom = false;
    for (let i=0;i<1200;i++){
      simStep(CONFIG.FIXED_DT);
      minY = Math.min(minY, b.physY);
      if (b.physX < 50) passedBottom = true;
      if (passedBottom) maxYafter = Math.max(maxYafter, b.physY);
    }
    ({ minY, maxYafter });`);
  expect('최저점 y (=70)', res.minY, 70, 0.1);
  expect('반대편 최고점 y (=80)', res.maxYafter, 80, 0.3);
});

scenario('G5', '실 — 두 물체 연결 (무중력, 장력으로 함께 끌림)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const a = addRect  ({ gridX: 20, gridY: 50, mass: 1, vx0: 0 });
       const b = addCircle({ gridX: 30, gridY: 50, mass: 1, vx0: 4 });
       addRope(a.id,'right', b.id,'center'); begin();`);
  run(`run(3.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`);
  expect('운동량 보존', 1 * a.vx + 1 * b.vx, 4, '2%', 'kg·m/s');
  expect('두 물체 같은 속도(팽팽)', a.vx - b.vx, 0, 0.05, 'm/s');
});

/* ════════════════════════════════════════════════════════════
   H. 도르래 (Pulley)
   ════════════════════════════════════════════════════════════ */

/** 고정 도르래 씬: 도르래 중심(50,79), 좌측 림(49,79) 우측 림(51,79) */
const ATWOOD = (m1, m2) => `
  reset();
  const anchor = addFloor(50,16,52,16);                 // p1 = phys (50,84)
  const p = addPulley({ gridX: 49, gridY: 20 });        // 중심 phys (50,79)
  addRope(p.id,'center', anchor.id,'p1');               // 고정 도르래로 지정
  const A = addCircle({ gridX: 48.5, gridY: 30.5, mass: ${m1} });  // phys (49,69)
  const B = addCircle({ gridX: 50.5, gridY: 30.5, mass: ${m2} });  // phys (51,69)
  addRope(p.id,'left',  A.id,'center');
  addRope(p.id,'right', B.id,'center');
  begin();`;

scenario('H1', 'Atwood 기계 3:1 — a = (m₁−m₂)g/(m₁+m₂)', ({ run }) => {
  run(ATWOOD(3, 1));
  run(`run(0.5)`);
  const a0 = run(`snap(STATE.elements[1])`), b0 = run(`snap(STATE.elements[2])`);
  run(`run(0.5)`);
  const a1 = run(`snap(STATE.elements[1])`), b1 = run(`snap(STATE.elements[2])`);
  const aExp = (3 - 1) * G / (3 + 1);
  expect('무거운 쪽 가속도 (하강)', (a1.vy - a0.vy) / 0.5, -aExp, '5%', 'm/s²');
  expect('가벼운 쪽 가속도 (상승)', (b1.vy - b0.vy) / 0.5, +aExp, '5%', 'm/s²');
  expect('속도 크기 동일 (실 비신축)', a1.vy + b1.vy, 0, 0.05, 'm/s');
});

scenario('H2', 'Atwood 균형 1:1 — 정지 유지', ({ run }) => {
  run(ATWOOD(2, 2));
  run(`run(2.0)`);
  const a = run(`snap(STATE.elements[1])`), b = run(`snap(STATE.elements[2])`);
  expect('A 속도', a.vy, 0, 0.05, 'm/s');
  expect('B 속도', b.vy, 0, 0.05, 'm/s');
  expect('A 위치 유지', a.y, 69, 0.05);
});

scenario('H3', 'Atwood 5:2 — 가속도 공식', ({ run }) => {
  run(ATWOOD(5, 2));
  run(`run(0.5)`);
  const a0 = run(`snap(STATE.elements[1])`);
  run(`run(0.5)`);
  const a1 = run(`snap(STATE.elements[1])`);
  expect('가속도', Math.abs(a1.vy - a0.vy) / 0.5, (5 - 2) * G / 7, '5%', 'm/s²');
});

scenario('H4', '고정 도르래 한쪽만 연결 — 도르래를 고정점으로 하는 진자', ({ run }) => {
  run(`reset();
       const anchor = addFloor(50,16,52,16);
       const p = addPulley({ gridX: 49, gridY: 20 });
       addRope(p.id,'center', anchor.id,'p1');
       const A = addCircle({ gridX: 48.5, gridY: 30.5, mass: 1 });
       addRope(p.id,'left', A.id,'center');
       begin();`);
  run(`run(2.0)`);
  const a = run(`snap(STATE.elements[1])`);
  expect('정지 유지 y', a.y, 69, 0.05);
  expect('속력', Math.hypot(a.vx, a.vy), 0, 0.05, 'm/s');
});

/* 움직도르래 씬 (교과서 배치)
     고정점(46,85) ─실A(수직)─ 움직도르래 Pm 좌림(46,70)
     Pm 우림(48,70) ─실B(수직)─ 고정도르래 Pf 하단림(48,84)
     Pf 우림(49,85) ─실C(수직)─ 물체 M(49,75)
     Pm 중심(47,70) ─실D─ 하중 W(47,60)
   실 A+B+C = 하나의 런 → L = (85−y_Pm) + (84−y_Pm) + (85−y_M) 일정
   → ẏ_M = −2·ẏ_Pm  (2:1 속도비)
   평형: T=Mg, 하중측 2T=Wg → M = W/2                                   */
const MOVPULLEY = (W, M) => `
  reset();
  const a0 = addFloor(46,15,48,15);                  // p1 = phys (46,85)
  const Pm = addPulley({ gridX: 46, gridY: 29 });    // 중심 phys (47,70)
  addRope(a0.id,'p1', Pm.id,'left');                 // 실A (46,85)-(46,70)
  const af = addFloor(48,10,50,10);                  // p1 = phys (48,90) 고정용
  const Pf = addPulley({ gridX: 47, gridY: 14 });    // 중심 phys (48,85)
  addRope(Pf.id,'center', af.id,'p1');               // Pf = 고정 도르래
  addRope(Pm.id,'right', Pf.id,'bottom');            // 실B (48,70)-(48,84)
  const Mb = addCircle({ gridX: 48.5, gridY: 24.5, mass: ${M}, e: 0 });  // phys (49,75)
  addRope(Pf.id,'right', Mb.id,'center');            // 실C (49,85)-(49,75)
  const Wb = addCircle({ gridX: 46.5, gridY: 39.5, mass: ${W}, e: 0 });  // phys (47,60)
  addRope(Pm.id,'center', Wb.id,'center');           // 실D
  begin();`;

scenario('H5', '움직도르래 정적 평형 — M = W/2 이면 정지', ({ run }) => {
  run(MOVPULLEY(4, 2));
  run(`run(1.5)`);
  const r = run(`
    ({ Pm: STATE.elements[0].physY, Wy: STATE.elements[3].physY, My: STATE.elements[2].physY,
       Wv: STATE.elements[3].vy,   Mv: STATE.elements[2].vy });`);
  note('위치 Pm/W/M', `${r.Pm.toFixed(3)} / ${r.Wy.toFixed(3)} / ${r.My.toFixed(3)}`);
  expect('하중 W 정지', r.Wv, 0, 0.15, 'm/s');
  expect('물체 M 정지', r.Mv, 0, 0.15, 'm/s');
  expect('하중 위치 유지', r.Wy, 60, 0.2);
});

scenario('H6', '움직도르래 2:1 속도비 + 가속도 a = g(W−2M)/(W+4M)', ({ run }) => {
  run(MOVPULLEY(4, 1));
  run(`run(0.3)`);
  const s0 = run(`({ Wv: STATE.elements[3].vy, Mv: STATE.elements[2].vy, Pv: STATE.elements[0].vy })`);
  run(`run(0.3)`);
  const s1 = run(`({ Wv: STATE.elements[3].vy, Mv: STATE.elements[2].vy, Pv: STATE.elements[0].vy })`);
  note('속도 W/M/Pm', `${s1.Wv.toFixed(4)} / ${s1.Mv.toFixed(4)} / ${s1.Pv.toFixed(4)}`);
  const aExp = G * (4 - 2 * 1) / (4 + 4 * 1);
  expect('하중 가속도 (하강)', (s1.Wv - s0.Wv) / 0.3, -aExp, '12%', 'm/s²');
  expect('2:1 속도비 v_M = −2·v_W', s1.Mv, -2 * s1.Wv, '12%', 'm/s');
});

/* ════════════════════════════════════════════════════════════
   I. 용수철 (Spring)
   ════════════════════════════════════════════════════════════ */

scenario('I1', '수평 용수철 SHM (무중력) — T = 2π√(m/k)', ({ run }) => {
  // 왼쪽 벽(세로 바닥면) ─ 용수철 ─ 사각형
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);           // 세로 벽
       const b = addRect({ gridX: 43, gridY: 49, mass: 1, e: 0 });   // 왼면 phys x=43
       const s = addSpring({ gridX: 40, gridY: 49, gridW: 3, gridH: 1,
                             k: 10, L0: 2, L: 2, autoAttach: false,
                             leftElementId: wall.id, rightElementId: b.id,
                             leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const b = STATE.elements[0];
    const ts=[]; let prev=b.physX-42; let t=0;   // 평형: 벽(40)+L0(2)=42
    for (let i=0;i<6000 && ts.length<3;i++){
      simStep(CONFIG.FIXED_DT); t+=CONFIG.FIXED_DT;
      const cur=b.physX-42;
      if (prev>0&&cur<=0 || prev<0&&cur>=0) ts.push(t);
      prev=cur;
    }
    ({ts, x:b.physX});`);
  note('평형 통과 시각', JSON.stringify(r.ts.map(v => +v.toFixed(4))));
  if (r.ts.length >= 2) {
    expect('주기 T', 2 * (r.ts[1] - r.ts[0]), 2 * Math.PI * Math.sqrt(1 / 10), '3%', 's');
  } else {
    expect('진동 발생(평형 2회 통과)', r.ts.length, 2, 0);
  }
});

scenario('I2', '수평 용수철 진폭 보존 (에너지 보존)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);
       const b = addRect({ gridX: 43, gridY: 49, mass: 1, e: 0 });
       addSpring({ gridX: 40, gridY: 49, gridW: 3, gridH: 1,
                   k: 10, L0: 2, L: 2, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let mn=1e9, mx=-1e9;
    for (let i=0;i<3000;i++){ simStep(CONFIG.FIXED_DT); mn=Math.min(mn,b.physX); mx=Math.max(mx,b.physX); }
    ({mn,mx});`);
  expect('최대 신장 위치', r.mx, 43, 0.05);
  expect('최대 압축 위치', r.mn, 41, 0.05);
});

scenario('I3', '수직 용수철 정적 평형 — 늘어남 x = mg/k', ({ run }) => {
  // 천장(가로 바닥면) ─ 세로 용수철 ─ 물체
  // 천장은 오른→왼 방향으로 그려 법선이 아래(-y)를 향하게 함 (아래쪽이 실체면)
  run(`reset();
       const ceil = addFloor(60,30,40,30);          // phys y=70, 법선 (0,-1)
       const b = addRect({ gridX: 49, gridY: 32, gridW:1, gridH:1, mass: 2, e: 0 });
       addSpring({ gridX: 49, gridY: 30, gridW: 1, gridH: 2, isVertical: true,
                   k: 40, L0: 2, L: 2, autoAttach: false,
                   leftElementId: ceil.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let mn=1e9, mx=-1e9, sum=0, n=0;
    for (let i=0;i<6000;i++){ simStep(CONFIG.FIXED_DT); mn=Math.min(mn,b.physY); mx=Math.max(mx,b.physY); sum+=b.physY; n++; }
    ({mn,mx,avg:sum/n});`);
  // 물체 윗면이 부착점. 자연길이일 때 윗면 phys y = 70-2 = 68 → 평형은 mg/k=0.49 아래
  expect('평균 위치(평형) 물체 윗면 y', r.avg + 1, 68 - 2 * G / 40, '0.5%');
  expect('진폭 = mg/k', (r.mx - r.mn) / 2, 2 * G / 40, '5%');
});

scenario('I4', '용수철 힘 크기 — F = k·(L−L₀)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const wall = addFloor(40,45,40,55);
       const b = addRect({ gridX: 44, gridY: 49, mass: 1, e: 0 });   // 신장 2 m
       addSpring({ gridX: 40, gridY: 49, gridW: 4, gridH: 1,
                   k: 7, L0: 2, L: 2, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const t = run(`run(0.01)`);
  const s = run(`snap(STATE.elements[0])`);
  // 초기 가속도 a = -k·x/m = -7*2/1 = -14
  expect('초기 가속도', s.vx / t, -14, '2%', 'm/s²');
});

scenario('I5', '용수철 한쪽만 연결 — 자유단은 고정 핀 (진동)', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const b = addRect({ gridX: 43, gridY: 49, mass: 1, e: 0 });
       addSpring({ gridX: 40, gridY: 49, gridW: 3, gridH: 1,
                   k: 10, L0: 2, L: 2, autoAttach: false,
                   leftElementId: null, rightElementId: b.id,
                   leftLocked: false, rightLocked: true });
       begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let mn=1e9, mx=-1e9;
    for (let i=0;i<3000;i++){ simStep(CONFIG.FIXED_DT); mn=Math.min(mn,b.physX); mx=Math.max(mx,b.physX); }
    ({mn,mx});`);
  expect('최대 신장 위치', r.mx, 43, 0.05);
  expect('최대 압축 위치', r.mn, 41, 0.05);
});

/* ════════════════════════════════════════════════════════════
   J. 외력 (ExtForce)
   ════════════════════════════════════════════════════════════ */

scenario('J1', '외력 직접 부착 (무중력) — a = F/m', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const b = addRect({ gridX: 40, gridY: 49, mass: 4, e: 0 });
       const f = addExtF({ gridX: 45, gridY: 49, forceN: 12 });   // 물체 오른쪽
       addRope(f.id,'center', b.id,'right');
       begin();`);
  const t = run(`run(1.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('vx = (F/m)t', s.vx, (12 / 4) * t, '1%', 'm/s');
  expect('vy', s.vy, 0, 1e-9, 'm/s');
});

scenario('J2', '외력 + 중력 — 위로 F>mg 이면 상승', ({ run }) => {
  run(`reset();
       const b = addRect({ gridX: 50, gridY: 50, mass: 1, e: 0 });
       const f = addExtF({ gridX: 50, gridY: 45, forceN: 15 });   // 물체 위쪽
       addRope(f.id,'center', b.id,'top');
       begin();`);
  const t = run(`run(1.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('vy = (F/m − g)t', s.vy, (15 / 1 - G) * t, '2%', 'm/s');
});

scenario('J3', '외력 = mg (무중력 평형) — 정지 유지', ({ run }) => {
  run(`reset();
       const b = addRect({ gridX: 50, gridY: 50, mass: 2, e: 0 });
       const f = addExtF({ gridX: 50, gridY: 45, forceN: ${2 * G} });
       addRope(f.id,'center', b.id,'top');
       begin();`);
  run(`run(2.0)`);
  const s = run(`snap(STATE.elements[0])`);
  expect('정지 vy', s.vy, 0, 1e-6, 'm/s');
  expect('위치 유지', s.y, 49, 1e-6);
});

/* ════════════════════════════════════════════════════════════
   K. 조합 케이스
   ════════════════════════════════════════════════════════════ */

scenario('K1', '도르래 + 마찰 없는 수평면 — a = m₂g/(m₁+m₂)', ({ run }) => {
  // 테이블 위 m1 ─(수평 실)─ 도르래(테이블 끝, 림 높이 = 물체 중심) ─ 매달린 m2
  // 도르래 중심 phys (61, 40.5) → 좌림 (60,40.5) = 물체 오른쪽 앵커와 같은 높이
  run(`reset();
       const table = addFloor(20,60,60,60);              // phys y=40
       const anchor = addFloor(61,50,63,50);             // p1 = phys (61,50) 고정점
       const p = addPulley({ gridX: 60, gridY: 58.5 });  // 중심 phys (61,40.5)
       addRope(p.id,'center', anchor.id,'p1');
       const A = addRect  ({ gridX: 40, gridY: 59, mass: 3, e: 0 });   // 오른쪽 앵커 phys (41,40.5)
       const B = addCircle({ gridX: 61.5, gridY: 69.5, mass: 2, e: 0 });// phys (62,30)
       addRope(p.id,'left',  A.id,'right');
       addRope(p.id,'right', B.id,'center');
       begin();`);
  run(`run(0.3)`);
  const a0 = run(`snap(STATE.elements[1])`);
  run(`run(0.3)`);
  const a1 = run(`snap(STATE.elements[1])`);
  expect('수평 가속도', (a1.vx - a0.vx) / 0.3, 2 * G / 5, '10%', 'm/s²');
});

scenario('K2', '경사면 + 바닥 연결 (ELBOW) — 관통 없이 이동', ({ run }) => {
  run(`reset(); addFloor(20,40,60,60,{pathType:'ELBOW_V'});
       addRect({ gridX: 21, gridY: 39, mass: 1, e: 0 }); begin();`);
  run(`run(4.0)`);
  const s = run(`snap(STATE.elements[0])`);
  note('최종 위치', `(${s.x.toFixed(3)}, ${s.y.toFixed(3)})`);
  expect('바닥(phys y=40) 아래로 관통하지 않음', s.y >= 39.9 ? 1 : 0, 1, 0);
});

scenario('K3', 'ARC_DOWN 골짜기 — 관통 없이 진자처럼 왕복', ({ run }) => {
  run(`reset(); addFloor(30,50,70,50,{pathType:'ARC_DOWN', curvature:1.0});
       addCircle({ gridX: 32, gridY: 47, gridW:1, gridH:1, mass:1, e:0 }); begin();`);
  const r = run(`
    const b = STATE.elements[0];
    let minY = 1e9;
    for (let i=0;i<900;i++){ simStep(CONFIG.FIXED_DT); minY = Math.min(minY, b.physY); }
    ({ minY, x:b.physX, y:b.physY, v:Math.hypot(b.vx,b.vy) });`);
  // ARC_DOWN(curvature 1.0) = 반원 골짜기, 현 y=50(phys), 반지름 20 → 최저점 phys y=30
  expect('최저점(원 중심) ≥ 바닥 최저 + r', r.minY, 30.5, 0.6);
  note('최종 상태', `x=${r.x.toFixed(3)} y=${r.y.toFixed(3)} |v|=${r.v.toFixed(3)}`);
});

scenario('K3b', 'ARC_DOWN 곡률 0.6 골짜기 — 관통 없음', ({ run }) => {
  run(`reset(); addFloor(30,50,70,50,{pathType:'ARC_DOWN', curvature:0.6});
       addCircle({ gridX: 34, gridY: 46, gridW:1, gridH:1, mass:1, e:0 }); begin();`);
  const r = run(`
    const b0 = STATE.elements[0];
    let minY = 1e9;
    for (let i=0;i<900;i++){ simStep(CONFIG.FIXED_DT); minY = Math.min(minY, b0.physY); }
    ({ minY, x:b0.physX, y:b0.physY });`);
  // curvature 0.6 → θ=0.6π, R=20/sin(0.3π)=24.7, h=R·cos(0.3π)=14.5 → 최저점 phys y = 50+14.5-24.7 = 39.8
  expect('최저점 (중심, r=0.5)', r.minY, 39.8 + 0.5, 0.7);
});

scenario('K3c', 'ARC_UP 언덕 곡률 1.0 — 정상 위 물체가 굴러 떨어짐 (관통 없음)', ({ run }) => {
  run(`reset(); addFloor(30,50,70,50,{pathType:'ARC_UP', curvature:1.0});
       addCircle({ gridX: 49.5, gridY: 29.4, gridW:1, gridH:1, mass:1, e:0 }); begin();`);
  // 언덕 정점 = phys (50,70), 원 중심 초기 phys y = 70.1
  const r = run(`
    const b0 = STATE.elements[0];
    let minR = 1e9;
    for (let i=0;i<200;i++){
      simStep(CONFIG.FIXED_DT);
      minR = Math.min(minR, Math.hypot(b0.physX-50, b0.physY-50));
    }
    ({ minR, x:b0.physX, y:b0.physY });`);
  note('최종 위치', `(${r.x.toFixed(3)}, ${r.y.toFixed(3)})`);
  expect('언덕 표면(R=20) 안으로 관통하지 않음', r.minR, 20.5, 0.15);
});

scenario('K4', '무중력 + 실 + 충돌 — 운동량 보존', ({ run }) => {
  run(`reset(); STATE.gravityOn = false;
       const a = addRect  ({ gridX: 20, gridY: 50, mass: 2, e: 1, vx0: 3 });
       const b = addCircle({ gridX: 40, gridY: 50, mass: 1, e: 1, vx0: 0 });
       const c = addRect  ({ gridX: 60, gridY: 50, mass: 3, e: 1, vx0: -1 });
       begin();`);
  run(`run(30.0)`);
  const a = run(`snap(STATE.elements[0])`), b = run(`snap(STATE.elements[1])`), c = run(`snap(STATE.elements[2])`);
  expect('총 운동량', 2 * a.vx + 1 * b.vx + 3 * c.vx, 2 * 3 + 3 * -1, 1e-6, 'kg·m/s');
  const K0 = 0.5 * 2 * 9 + 0.5 * 3 * 1;
  expect('총 운동에너지 (e=1)', 0.5 * 2 * a.vx ** 2 + 0.5 * 1 * b.vx ** 2 + 0.5 * 3 * c.vx ** 2, K0, '1%', 'J');
});

scenario('K5', '용수철 + 마찰 바닥 — 진동 감쇠 후 정지', ({ run }) => {
  run(`reset();
       const floor = addFloor(20,60,80,60,{isFriction:true, muS:0.5, muK:0.4});
       const wall  = addFloor(40,50,40,60);
       const b = addRect({ gridX: 44, gridY: 59, mass: 1, e: 0 });
       addSpring({ gridX: 40, gridY: 59, gridW: 4, gridH: 1,
                   k: 20, L0: 2, L: 2, autoAttach: false,
                   leftElementId: wall.id, rightElementId: b.id,
                   leftLocked: true, rightLocked: true });
       begin();`);
  const r = run(`
    const b = STATE.elements[0];
    for (let i=0;i<3000;i++) simStep(CONFIG.FIXED_DT);
    ({ x:b.physX, v:Math.hypot(b.vx,b.vy) });`);
  note('최종 위치/속력', `x=${r.x.toFixed(4)} |v|=${r.v.toFixed(4)}`);
  expect('감쇠하여 저속', r.v, 0, 0.5, 'm/s');
  expect('정지 위치는 |x-42| ≤ μs·mg/k', Math.abs(r.x - 42) <= 0.5 * G / 20 + 0.1 ? 1 : 0, 1, 0);
});

scenario('K6', '외력 + 마찰 — a = (F − μk·mg)/m', ({ run }) => {
  run(`reset();
       const fl = addFloor(0,60,100,60,{isFriction:true, muS:0.3, muK:0.3});
       const b = addRect({ gridX: 30, gridY: 59, mass: 2, e: 0 });
       const f = addExtF({ gridX: 35, gridY: 59, forceN: 20 });
       addRope(f.id,'center', b.id,'right');
       begin();`);
  run(`run(0.5)`);
  const s0 = run(`snap(STATE.elements[0])`);
  run(`run(1.0)`);
  const s1 = run(`snap(STATE.elements[0])`);
  expect('가속도', s1.vx - s0.vx, (20 - 0.3 * 2 * G) / 2, '10%', 'm/s²');
});

report();
process.exit(0);
