/* ============================================================
   test/spec7.js — 수능 작도 규격 도형 + 실체면 방향 + SVG 내보내기
     · svg-shapes.js 의 path 빌더가 규격대로 기하를 만드는지
     · 실체면 회색 띠가 실제 충돌 법선의 반대쪽(막히는 쪽)을 덮는지
     · 촬영이 만들어내는 SVG 가 올바르고 흑백인지
   실행: node test/spec7.js
   ============================================================ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const { scenario, expect, note, report, loadEngine, SCENE_API } = require('./harness');
const { loadApp } = require('./dom-harness');

const ROOT = path.resolve(__dirname, '..');
const GS   = 100;

/** physics + svg-shapes + hit-test 가 올라간 컨텍스트 (격자 1칸 = 월드 1px) */
function makeCtx() {
  const c = loadEngine();
  vm.runInContext(SCENE_API, c);
  for (const f of ['js/svg-shapes.js', 'js/hit-test.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename: f });
  }
  vm.runInContext(`CONFIG.cellSize = 1; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;`, c);
  return c;
}

/** path d 문자열 → 각 명령의 **끝점** 좌표 배열
 *  (A 는 인자가 7개라 숫자를 2개씩 끊으면 안 된다) */
function pts(d) {
  const out = [];
  let cur = { x: 0, y: 0 };
  const tokens = d.match(/[MLHVAQZmlhvaqz]|-?\d+(?:\.\d+)?/g) || [];
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const c = tokens[i++];
    switch (c) {
      case 'M': case 'L': cur = { x: num(), y: num() }; out.push(cur); break;
      case 'H': cur = { x: num(), y: cur.y }; out.push(cur); break;
      case 'V': cur = { x: cur.x, y: num() }; out.push(cur); break;
      case 'Q': num(); num();                               // 제어점은 버리고
                cur = { x: num(), y: num() }; out.push(cur); break;
      case 'A': num(); num(); num(); num(); num();          // rx ry rot large sweep
                cur = { x: num(), y: num() }; out.push(cur); break;
      case 'Z': break;
      default: break;   // 숫자 연속(암묵 L) — 이 프로젝트 path 에는 없음
    }
  }
  return out;
}

/* ════════════════════════════════════════════════════════════
   A. 실체면 회색 띠가 막히는 쪽을 덮는가 (표시 ↔ 물리 일치)
   ════════════════════════════════════════════════════════════ */

/** 세그먼트의 실체면 띠를 만들어, 띠가 법선 반대쪽으로 뻗는지 확인 */
function checkBand(c, label, seg, tol) {
  const r = vm.runInContext(`{
    reset();
    const s = addFloor(${seg.x1}, ${seg.y1}, ${seg.x2}, ${seg.y2}, ${JSON.stringify(seg.o || {})});
    const pts = s._samplePath(s.x1, s.y1, s.x2, s.y2, 4);
    ({ band: svgBand(pts, 6, +1), samples: pts.map(p => ({x:p.x, y:p.y, tx:p.tx, ty:p.ty})),
       physSegs: getPhysicsSegments(s) });
  }`, c);

  if (r.samples.length < 2) { expect(label + ' — 샘플 생성', 0, 1, 0, ''); return; }

  let worst = -Infinity;
  for (const p of r.samples) {
    // 띠가 뻗는 방향 (svgBand 의 side=+1 규약)
    const d = { x: -p.ty, y: p.tx };
    // 물리 좌표로 변환 (화면 y 아래 → 물리 y 위)
    const dp = { x: d.x, y: -d.y };
    const pp = { x: p.x, y: GS - p.y };
    let best = null, bestD = Infinity;
    for (const s of r.physSegs) {
      const sx = s.x2 - s.x1, sy = s.y2 - s.y1, l2 = sx * sx + sy * sy;
      const u  = l2 > 1e-12 ? Math.max(0, Math.min(1, ((pp.x - s.x1) * sx + (pp.y - s.y1) * sy) / l2)) : 0;
      const dd = Math.hypot(pp.x - (s.x1 + u * sx), pp.y - (s.y1 + u * sy));
      if (dd < bestD) { bestD = dd; best = s; }
    }
    worst = Math.max(worst, dp.x * best.normalX + dp.y * best.normalY);
  }
  // 법선의 정반대여야 하므로 −1
  expect(label + ' — 띠가 실체면 쪽', worst, -1, tol ?? 0.02, '·n̂');
}

scenario('SN-BAND-LINE', '직선 바닥/천장/벽/경사 — 실체면 띠 방향', () => {
  const c = makeCtx();
  const CASES = [
    ['바닥 (왼→오)',   { x1: 20, y1: 60, x2: 80, y2: 60 }],
    ['천장 (오→왼)',   { x1: 80, y1: 30, x2: 20, y2: 30 }],
    ['벽 (아래→위)',   { x1: 60, y1: 70, x2: 60, y2: 30 }],
    ['벽 (위→아래)',   { x1: 40, y1: 30, x2: 40, y2: 70 }],
    ['경사 오르막',    { x1: 20, y1: 60, x2: 60, y2: 40 }],
    ['경사 내리막',    { x1: 60, y1: 40, x2: 20, y2: 60 }],
    ['마찰 바닥',      { x1: 20, y1: 60, x2: 80, y2: 60, o: { isFriction: true } }],
  ];
  for (const [l, s] of CASES) checkBand(c, l, s);
});

scenario('SN-BAND-CURVE', 'ELBOW / ARC — 실체면 띠 방향 (곡률 전 구간)', () => {
  const c = makeCtx();
  checkBand(c, 'ELBOW_H', { x1: 20, y1: 60, x2: 60, y2: 40, o: { pathType: 'ELBOW_H' } });
  checkBand(c, 'ELBOW_V', { x1: 30, y1: 40, x2: 70, y2: 60, o: { pathType: 'ELBOW_V' } });
  for (const pt of ['ARC_UP', 'ARC_DOWN']) {
    for (const cv of [0.2, 0.6, 1.0, 1.5]) {
      checkBand(c, `${pt} cv=${cv}`, { x1: 30, y1: 50, x2: 70, y2: 50, o: { pathType: pt, curvature: cv } }, 0.12);
    }
  }
});

scenario('SN-BAND-DIR', '띠가 향하는 화면 방향 (바닥=아래 / 천장=위)', () => {
  const c = makeCtx();
  const dirOf = (seg) => vm.runInContext(`{
    reset();
    const s = addFloor(${seg.x1}, ${seg.y1}, ${seg.x2}, ${seg.y2});
    const p = s._samplePath(s.x1, s.y1, s.x2, s.y2, 4)[1];
    ({ dx: -p.ty, dy: p.tx });
  }`, c);
  const floor   = dirOf({ x1: 20, y1: 60, x2: 80, y2: 60 });
  const ceiling = dirOf({ x1: 80, y1: 30, x2: 20, y2: 30 });
  const wall    = dirOf({ x1: 60, y1: 70, x2: 60, y2: 30 });
  note('바닥/천장 띠 방향', `(${floor.dx},${floor.dy}) / (${ceiling.dx},${ceiling.dy})`);
  expect('바닥 → 선 아래(+y)', Math.sign(floor.dy),   +1, 0, '');
  expect('천장 → 선 위(−y)',  Math.sign(ceiling.dy), -1, 0, '');
  expect('벽 → 오른쪽(+x)',   Math.sign(wall.dx),    +1, 0, '');
});

/* ════════════════════════════════════════════════════════════
   B. 수능 규격 도형 기하
   ════════════════════════════════════════════════════════════ */

scenario('SN-COIL', '용수철 — 나선 코일 + 급격한 수직 리드', () => {
  const c = makeCtx();
  const AMP = 8;
  const d = vm.runInContext(`svgCoil(0, 0, 100, 0, ${AMP}, 7)`, c);
  const P = pts(d);
  expect('경로 생성됨', P.length > 40 ? 1 : 0, 1, 0, '');
  expect('시작점 = A', Math.hypot(P[0].x - 0, P[0].y - 0), 0, 1e-9, 'px');
  expect('끝점 = B', Math.hypot(P[P.length - 1].x - 100, P[P.length - 1].y - 0), 0, 1e-9, 'px');

  // ── 리드(양끝) 형태 ──
  //   축 직진 → [둥근 턴] → 급상승(수직) → [둥근 턴] → 수평 조금 → 코일
  expect('모서리가 둥긂 (Q 4개)', (d.match(/Q/g) || []).length, 4, 0, '개');

  const [l0, l1, l2, l3, l4, l5] = P;
  expect('① 축을 따라 직진 (y 불변)', l1.y - l0.y, 0, 1e-9, 'px');
  expect('① 모서리 전에 멈춤 (둥근 턴 여유)', l1.x < l2.x ? 1 : 0, 1, 0, '');
  expect('② 급상승 구간은 수직 (x 불변)', l3.x - l2.x, 0, 1e-9, 'px');
  expect('② 총 상승 높이 = amp', Math.abs(l4.y - l1.y), AMP, 1e-9, 'px');
  expect('③ 수평 구간 (y 불변)', l5.y - l4.y, 0, 1e-9, 'px');
  expect('③ 수평이 앞으로 진행', l5.x > l4.x ? 1 : 0, 1, 0, '');
  note('리드 좌표', `A(${l0.x},${l0.y}) →(${l1.x},${l1.y}) ↷(${l2.x},${l2.y}) ↑(${l3.x},${l3.y}) ↷(${l4.x},${l4.y}) →코일(${l5.x},${l5.y})`);

  const n = P.length;
  const [r5, r4, r3, r2, r1] = [P[n - 6], P[n - 5], P[n - 4], P[n - 3], P[n - 2]];
  expect('반대쪽 ③ 수평 (y 불변)', r4.y - r5.y, 0, 1e-9, 'px');
  expect('반대쪽 ② 급하강은 수직 (x 불변)', r2.x - r3.x, 0, 1e-9, 'px');
  expect('반대쪽 ① 축 직진 (y 불변)', P[n - 1].y - r1.y, 0, 1e-9, 'px');

  // ── 급상승선이 코일과 겹치지 않아야 한다 ──
  const coil = P.slice(6, n - 6);
  const coilMinX = Math.min(...coil.map(p => p.x));
  note('급상승 x / 코일 최소 x', `${l3.x} / ${coilMinX.toFixed(4)}`);
  expect('코일이 코일시작 x 앞으로 넘어오지 않음', coilMinX >= l5.x - 1e-6 ? 1 : 0, 1, 0, '');
  expect('급상승선이 코일보다 앞 (겹침 없음)', l3.x < coilMinX - 1e-6 ? 1 : 0, 1, 0, '');
  expect('반대쪽 급하강선도 코일 뒤', r3.x > Math.max(...coil.map(p => p.x)) - 1e-6 ? 1 : 0, 1, 0, '');

  // ── 코일 판정: 축 방향 역행이 있어야 고리가 겹친다 (사인파는 역행 0회) ──
  let back = 0;
  for (let i = 1; i < coil.length; i++) if (coil[i].x < coil[i - 1].x - 1e-9) back++;
  note('축 역행 구간 수', back);
  expect('고리가 겹침 (역행 존재)', back > 10 ? 1 : 0, 1, 0, '');

  // 진폭이 amp 를 넘지 않아야 함
  expect('가로 진폭 = amp', Math.max(...P.map(p => Math.abs(p.y))), AMP, 0.01, 'px');
});

scenario('SN-COIL-K', '고리 개수는 용수철 상수 k 로 정해진다 (k↑ → 고리↓)', () => {
  const c = makeCtx();
  const N = (k) => vm.runInContext(`svgCoilCountForK(${k})`, c);
  const rows = [0.5, 1, 2.5, 5, 10, 20, 40, 100].map(k => `k=${k}:${N(k)}`);
  note('k → 고리 수', rows.join('  '));

  expect('기준 k=10 에서 7 고리', N(10), 7, 0, '개');
  // 물리: k = G·d⁴/(8·D³·n) → n ∝ 1/k. 단조감소여야 한다.
  let mono = 1;
  const ks = [0.5, 1, 2.5, 5, 10, 20, 40, 100];
  for (let i = 1; i < ks.length; i++) if (N(ks[i]) > N(ks[i - 1])) mono = 0;
  expect('k 가 커질수록 고리 수 단조 감소', mono, 1, 0, '');
  expect('무른 용수철(k=0.5) 이 더 많이 감김', N(0.5) > N(10) ? 1 : 0, 1, 0, '');
  expect('굳은 용수철(k=100) 이 더 적게 감김', N(100) < N(10) ? 1 : 0, 1, 0, '');
  expect('하한 4 고리', N(1e6), 4, 0, '개');
  expect('상한 14 고리', N(1e-6), 14, 0, '개');
  expect('k 가 0/음수여도 유한', isFinite(N(0)) && isFinite(N(-5)) ? 1 : 0, 1, 0, '');

  // 길이(L/L0)는 더 이상 고리 수에 영향을 주지 않는다
  const a = loadApp();
  const r = a.evalIn(`
    CONFIG.cellSize = 8;
    const s1 = new Spring(); s1.k = 12; s1.L0 = 4; s1.L = 4;
    const s2 = new Spring(); s2.k = 12; s2.L0 = 4; s2.L = 8;
    [svgCoilCountForK(s1.k), svgCoilCountForK(s2.k)];
  `);
  expect('길이가 달라도 같은 k 면 같은 고리 수', r[0], r[1], 0, '개');
});

scenario('SN-FONT', '서체 — 영문·숫자 HyhwpEQ / 한글 맑은 고딕', () => {
  const c = makeCtx();
  const f  = vm.runInContext(`SN.font`, c);
  const fk = vm.runInContext(`SN.fontKo`, c);
  note('라틴 스택', f);
  note('한글 스택', fk);
  expect('라틴 스택 첫 서체 = HyhwpEQ', /^'HyhwpEQ'/.test(f) ? 1 : 0, 1, 0, '');
  expect('라틴 스택에 맑은 고딕 폴백', /Malgun Gothic/.test(f) ? 1 : 0, 1, 0, '');
  expect('한글 스택 첫 서체 = 맑은 고딕', /^'Malgun Gothic'/.test(fk) ? 1 : 0, 1, 0, '');
  expect('두 스택 모두 sans-serif 로 끝남', (/sans-serif$/.test(f) && /sans-serif$/.test(fk)) ? 1 : 0, 1, 0, '');

  // 가독성: 라벨 최소 크기가 10px 이상
  const fs = vm.runInContext(`SN_FS`, c);
  note('라벨 크기 토큰', JSON.stringify(fs));
  expect('물체 라벨 최소 ≥ 10px', fs.bodyMin >= 10 ? 1 : 0, 1, 0, '');
  expect('용수철 라벨 최소 ≥ 10px', fs.springMin >= 10 ? 1 : 0, 1, 0, '');
  expect('지면 글자 ≥ 12px', fs.surface >= 12 ? 1 : 0, 1, 0, '');
  expect('힘 라벨 ≥ 12px', fs.force >= 12 ? 1 : 0, 1, 0, '');
});

scenario('SN-PULLEY', '도르래 — 동심원 3겹 + 요크 브래킷', () => {
  const c = makeCtx();
  const w = vm.runInContext(`svgPulleyWheel(50, 50, 10)`, c);
  const radius = (d) => {
    const P = pts(d);
    return Math.max(...P.map(p => Math.hypot(p.x - 50, p.y - 50)));
  };
  expect('외륜 r',   radius(w.rim),   10,  0.01, 'px');
  expect('내륜 0.78r', radius(w.inner), 7.8, 0.01, 'px');
  expect('허브 0.30r', radius(w.hub),   3.0, 0.01, 'px');
  expect('축핀 0.10r', radius(w.axle),  1.0, 0.01, 'px');

  const y = vm.runInContext(`svgPulleyYoke(50, 50, 10, -Math.PI/2, 15)`, c);
  const A = pts(y.arms);
  expect('요크 2줄 (점 4개)', A.length, 4, 0, '개');
  expect('요크 반폭 0.30r', Math.abs(A[0].x - 50), 3, 0.01, 'px');
  const pin = pts(y.pin);
  const pinC = { x: (Math.min(...pin.map(p=>p.x)) + Math.max(...pin.map(p=>p.x))) / 2,
                 y: (Math.min(...pin.map(p=>p.y)) + Math.max(...pin.map(p=>p.y))) / 2 };
  expect('핀이 브래킷 끝(위 15px)', pinC.y, 35, 0.05, 'px');
});

scenario('SN-ARROW', '힘 화살표 — 가는 선 + 속 찬 삼각 화살촉', () => {
  const c = makeCtx();
  const a = vm.runInContext(`svgArrow(0, 0, 100, 0, 12, 5)`, c);
  const shaft = pts(a.shaft), head = pts(a.head);
  expect('샤프트 2점', shaft.length, 2, 0, '개');
  expect('샤프트가 화살촉 앞에서 끝남', shaft[1].x, 88, 0.01, 'px');
  expect('화살촉 삼각형 3점', head.length, 3, 0, '개');
  expect('화살촉 끝 = 목표점', head[0].x, 100, 0.01, 'px');
  expect('화살촉 반폭', Math.abs(head[1].y - head[2].y) / 2, 5, 0.01, 'px');
});

/* ════════════════════════════════════════════════════════════
   C. SVG 내보내기
   ════════════════════════════════════════════════════════════ */

scenario('SN-SVG-EXPORT', '촬영 → SVG 문자열이 유효하고 흑백인가', () => {
  const a = loadApp();
  if (a.errors.length) { expect('앱 로드', 0, 1, 0, ''); return; }
  const svg = a.evalIn(`
    CONFIG.cellSize = 8; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;
    STATE.elements = []; STATE.floorSegments = []; STATE.ropes = [];
    const f  = new FloorSegment(20, 60, 80, 60); f.isFriction = true; STATE.floorSegments.push(f);
    const r  = new RectBody();   r.gridX = 30; r.gridY = 59; STATE.elements.push(r);
    const ci = new CircleBody(); ci.gridX = 50; ci.gridY = 40; STATE.elements.push(ci);
    const p  = new Pulley();     p.gridX = 60; p.gridY = 30; STATE.elements.push(p);
    const sp = new Spring();     sp.gridX = 35; sp.gridY = 50; STATE.elements.push(sp);
    const ef = new ExtForce();   ef.gridX = 70; ef.gridY = 55; STATE.elements.push(ef);
    const fz = new ForceZone();  fz.gridX = 20; fz.gridY = 20; STATE.elements.push(fz);
    buildSceneSVG();
  `);
  note('SVG 크기', svg.length + ' bytes');

  expect('XML 선언', /^<\?xml/.test(svg) ? 1 : 0, 1, 0, '');
  expect('svg 루트 + 네임스페이스', /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg) ? 1 : 0, 1, 0, '');
  expect('viewBox 존재', /viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/.test(svg) ? 1 : 0, 1, 0, '');
  expect('닫힘 태그', /<\/svg>\s*$/.test(svg) ? 1 : 0, 1, 0, '');
  expect('태그 개폐 균형', (svg.match(/</g) || []).length, (svg.match(/>/g) || []).length, 0, '개');

  const paths = (svg.match(/<path /g) || []).length;
  note('path 개수', paths);
  expect('요소들이 path 로 출력됨', paths >= 12 ? 1 : 0, 1, 0, '');
  expect('흰 바탕 배경 사각형', /<rect [^>]*fill="#ffffff"/.test(svg) ? 1 : 0, 1, 0, '');
  expect('마찰 라벨 포함', svg.includes('마찰') ? 1 : 0, 1, 0, '');

  // 흑백 검증: 유채색(빨강/파랑/초록 계열) 이 없어야 한다
  const colors = [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))"/g)].map(m => m[1]);
  const chromatic = colors.filter(v => {
    const m = /^#([0-9a-fA-F]{6})$/.exec(v);
    if (!m) return false;
    const r = parseInt(m[1].slice(0,2),16), g = parseInt(m[1].slice(2,4),16), b = parseInt(m[1].slice(4,6),16);
    return Math.max(r,g,b) - Math.min(r,g,b) > 8;   // 무채색이면 R=G=B
  });
  note('사용된 색', [...new Set(colors)].join(' '));
  expect('유채색 없음 (완전 흑백)', chromatic.length, 0, 0, '개');

  // NaN/Infinity 가 좌표에 새어나오지 않아야 함
  expect('NaN 없음', /NaN|Infinity|undefined/.test(svg) ? 1 : 0, 0, 0, '');
});

scenario('SN-SVG-GEOM', 'SVG 내보내기 기하 = 화면 기하 (물체 좌표 일치)', () => {
  const a = loadApp();
  const r = a.evalIn(`
    CONFIG.cellSize = 8; VIEWPORT.scale = 1; VIEWPORT.offsetX = 0; VIEWPORT.offsetY = 0;
    STATE.elements = []; STATE.floorSegments = []; STATE.ropes = [];
    const b = new RectBody(); b.gridX = 10; b.gridY = 20; b.gridW = 2; b.gridH = 3; STATE.elements.push(b);
    const svg = buildSceneSVG();
    ({ svg, expect: { x: 10*8, y: 20*8, w: 2*8, h: 3*8 } });
  `);
  // 사각형 path 는 M x y H x+w V y+h H x Z
  const m = /<path d="M ([\d.]+) ([\d.]+) H ([\d.]+) V ([\d.]+) H ([\d.]+) Z"/.exec(r.svg);
  expect('사각형 path 존재', m ? 1 : 0, 1, 0, '');
  if (m) {
    expect('좌상 x', +m[1], r.expect.x, 1e-9, 'px');
    expect('좌상 y', +m[2], r.expect.y, 1e-9, 'px');
    expect('우변 x', +m[3], r.expect.x + r.expect.w, 1e-9, 'px');
    expect('하변 y', +m[4], r.expect.y + r.expect.h, 1e-9, 'px');
  }
});

report();
process.exit(0);
