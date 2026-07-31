/* ============================================================
   test/spec4.js — "보이는 것 = 부딪히는 것" 기하 일치 검증
     렌더(ctx.arc) ↔ 히트테스트(_arcSamplePoints) ↔ 물리(_arcPhysPoints)
     세 구현이 모든 pathType × 곡률에서 같은 곡선을 그리는지 확인.
   실행: node test/spec4.js
   ============================================================ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const { scenario, expect, note, report, loadEngine, SCENE_API } = require('./harness');

const ROOT = path.resolve(__dirname, '..');

/** physics/elements 에 더해 hit-test.js 까지 올린 컨텍스트 */
function loadWithHitTest() {
  const ctx = loadEngine();
  vm.runInContext(SCENE_API, ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/hit-test.js'), 'utf8'), ctx, { filename: 'js/hit-test.js' });
  return ctx;
}

/**
 * 캔버스 ctx.arc(cx,cy,R,sa,ea,ccw) 의미를 그대로 재현한 참조 구현.
 * ccw=false → 각도 증가 방향으로 ea 까지, ccw=true → 감소 방향으로 ea 까지.
 * elements.js의 _drawArc 가 실제로 그리는 곡선이 바로 이것이다.
 */
function renderArcPoints(seg, ax, ay, bx, by, n, arcRadius) {
  const dx = bx - ax, dy = by - ay;
  const d  = Math.hypot(dx, dy);
  const { R, h } = arcRadius(seg.curvature, d);
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const ux = dx / d, uy = dy / d;
  const nx = -uy, ny = ux;
  let cX, cY;
  if (seg.pathType === 'ARC_UP') { cX = mx + nx * h; cY = my + ny * h; }
  else                           { cX = mx - nx * h; cY = my - ny * h; }

  const sa = Math.atan2(ay - cY, ax - cX);
  const ea = Math.atan2(by - cY, bx - cX);
  const ccw = seg.pathType !== 'ARC_UP';

  let sweep;
  if (!ccw) { sweep = ea - sa; while (sweep < 0) sweep += 2 * Math.PI; }
  else      { sweep = ea - sa; while (sweep > 0) sweep -= 2 * Math.PI; }

  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = sa + sweep * (i / n);
    pts.push({ x: cX + R * Math.cos(a), y: cY + R * Math.sin(a) });
  }
  return pts;
}

const CURVATURES = [0.1, 0.3, 0.5, 0.8, 0.98, 1.0, 1.02, 1.3, 1.6, 1.9];
const PATHS = ['ARC_UP', 'ARC_DOWN'];

/* ── 1. 렌더 ↔ 히트테스트 (둘 다 화면 좌표) ── */
for (const pt of PATHS) {
  scenario(`GEO-HT-${pt}`, `${pt}: 렌더 곡선 ↔ 히트테스트 샘플 일치 (곡률 10종)`, () => {
    const ctx = loadWithHitTest();
    for (const cv of CURVATURES) {
      const seg = { pathType: pt, curvature: cv };
      const A = { x: 30, y: 50 }, B = { x: 70, y: 50 };
      const hit = vm.runInContext(
        `_arcSamplePoints(${JSON.stringify(seg)}, ${A.x}, ${A.y}, ${B.x}, ${B.y}, 24)`, ctx);
      const ref = renderArcPoints(seg, A.x, A.y, B.x, B.y, 24,
        (c, d) => vm.runInContext(`_arcRadiusFromCurvature(${c}, ${d})`, ctx));
      let maxD = 0;
      for (let i = 0; i < ref.length; i++) {
        maxD = Math.max(maxD, Math.hypot(hit[i].x - ref[i].x, hit[i].y - ref[i].y));
      }
      expect(`curvature=${cv} 최대 편차`, maxD, 0, 1e-9);
    }
  });
}

/* ── 2. 렌더 ↔ 물리 (y 반전 후 비교) ── */
for (const pt of PATHS) {
  scenario(`GEO-PH-${pt}`, `${pt}: 렌더 곡선 ↔ 물리 충돌면 일치 (곡률 10종)`, () => {
    const ctx = loadWithHitTest();
    const GS = 100;
    for (const cv of CURVATURES) {
      const seg = { pathType: pt, curvature: cv };
      // 격자(화면) 좌표 A,B → 물리 좌표는 y 반전
      const Ag = { x: 30, y: 50 }, Bg = { x: 70, y: 50 };
      const Ap = { x: Ag.x, y: GS - Ag.y }, Bp = { x: Bg.x, y: GS - Bg.y };
      const phys = vm.runInContext(
        `_arcPhysPoints(${JSON.stringify(seg)}, ${JSON.stringify(Ap)}, ${JSON.stringify(Bp)}, 24)`, ctx);
      const ref = renderArcPoints(seg, Ag.x, Ag.y, Bg.x, Bg.y, 24,
        (c, d) => vm.runInContext(`_arcRadiusFromCurvature(${c}, ${d})`, ctx));
      let maxD = 0;
      for (let i = 0; i < ref.length; i++) {
        // 렌더 점을 물리 좌표로 변환 후 비교
        maxD = Math.max(maxD, Math.hypot(phys[i].x - ref[i].x, phys[i].y - (GS - ref[i].y)));
      }
      expect(`curvature=${cv} 최대 편차`, maxD, 0, 1e-9);
    }
  });
}

/* ── 3. 기울어진 현에서도 일치 ── */
scenario('GEO-TILT', '기울어진 현 (30,70)→(70,35) 에서도 세 구현 일치', () => {
  const ctx = loadWithHitTest();
  const GS = 100;
  for (const pt of PATHS) {
    for (const cv of [0.4, 1.0, 1.5]) {
      const seg = { pathType: pt, curvature: cv };
      const Ag = { x: 30, y: 70 }, Bg = { x: 70, y: 35 };
      const Ap = { x: Ag.x, y: GS - Ag.y }, Bp = { x: Bg.x, y: GS - Bg.y };
      const ref  = renderArcPoints(seg, Ag.x, Ag.y, Bg.x, Bg.y, 24,
        (c, d) => vm.runInContext(`_arcRadiusFromCurvature(${c}, ${d})`, ctx));
      const hit  = vm.runInContext(
        `_arcSamplePoints(${JSON.stringify(seg)}, ${Ag.x}, ${Ag.y}, ${Bg.x}, ${Bg.y}, 24)`, ctx);
      const phys = vm.runInContext(
        `_arcPhysPoints(${JSON.stringify(seg)}, ${JSON.stringify(Ap)}, ${JSON.stringify(Bp)}, 24)`, ctx);
      let dh = 0, dp = 0;
      for (let i = 0; i < ref.length; i++) {
        dh = Math.max(dh, Math.hypot(hit[i].x - ref[i].x, hit[i].y - ref[i].y));
        dp = Math.max(dp, Math.hypot(phys[i].x - ref[i].x, phys[i].y - (GS - ref[i].y)));
      }
      expect(`${pt} cv=${cv} 히트테스트`, dh, 0, 1e-9);
      expect(`${pt} cv=${cv} 물리`,      dp, 0, 1e-9);
    }
  }
});

/* ── 4. 볼록 방향이 pathType과 맞는가 (화면 기준) ── */
scenario('GEO-BULGE', 'ARC_UP=위로 볼록 / ARC_DOWN=아래로 볼록 (화면 기준)', () => {
  const ctx = loadWithHitTest();
  const GS = 100;
  for (const cv of CURVATURES) {
    for (const pt of PATHS) {
      const seg = { pathType: pt, curvature: cv };
      const Ap = { x: 30, y: 50 }, Bp = { x: 70, y: 50 };   // 물리 좌표
      const phys = vm.runInContext(
        `_arcPhysPoints(${JSON.stringify(seg)}, ${JSON.stringify(Ap)}, ${JSON.stringify(Bp)}, 24)`, ctx);
      const midPt = phys[12];
      // 물리 y가 크다 = 화면 위쪽
      const sign = Math.sign(midPt.y - 50);
      expect(`${pt} cv=${cv} 볼록 방향`, sign, pt === 'ARC_UP' ? 1 : -1, 0, '');
    }
  }
});

report();
process.exit(0);
