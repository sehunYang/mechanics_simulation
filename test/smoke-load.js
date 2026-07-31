/* ============================================================
   test/smoke-load.js — index.html 순서대로 전체 js/*.js 로드 스모크 테스트
     로드 시점 예외(오타·미정의 참조·구문 오류)를 잡는다. DOM은 스텁.
   실행: node test/smoke-load.js
   ============================================================ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT  = path.resolve(__dirname, '..');
const FILES = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .split('\n')
  .map(l => (l.match(/<script src="([^"]+)"><\/script>/) || [])[1])
  .filter(Boolean);

function stubEl(tag) {
  const el = {
    tagName: tag, id: '', className: '', textContent: '', value: '', disabled: false,
    width: 800, height: 800, clientWidth: 800, clientHeight: 800,
    style: new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => (t[k] = v, true) }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, children: [], parentNode: null,
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, insertBefore(c) { return c; }, remove() {},
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800 }),
    getContext: () => new Proxy({ canvas: { width: 800, height: 800 } },
      { get: (t, k) => (k in t ? t[k] : () => {}) }),
    toDataURL: () => 'data:,', focus() {}, blur() {}, click() {},
  };
  return el;
}

const byId = new Map();
const document = {
  getElementById(id) { if (!byId.has(id)) { const e = stubEl('div'); e.id = id; byId.set(id, e); } return byId.get(id); },
  createElement: stubEl,
  createElementNS: stubEl,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  body: stubEl('body'), documentElement: stubEl('html'),
};
const sandbox = {
  document,
  window: { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800 },
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  location: { href: 'http://localhost/' },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, Math, Date, JSON, Set, Map, WeakMap, Array, Object, Number, String, Boolean,
  isNaN, isFinite, parseFloat, parseInt, Infinity, NaN, Proxy, Symbol, Error, TypeError, RangeError,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

let fail = 0;
for (const f of FILES) {
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    console.log(` ok   ${f}`);
  } catch (err) {
    fail++;
    console.log(`FAIL  ${f}\n      ${String(err.stack || err).split('\n').slice(0, 3).join('\n      ')}`);
  }
}

/* 로드 후 핵심 심볼이 실제로 정의됐는지 확인 */
const REQUIRED = [
  'CONFIG', 'STATE', 'VIEWPORT', 'RectBody', 'CircleBody', 'FloorSegment', 'Rope',
  'Pulley', 'Spring', 'ExtForce', 'ForceZone',
  'simStep', 'initPhysics', 'resolveFloorCollisions', 'resolveRopeConstraints',
  'applySpringForces', 'applyExtForces', 'validateAll',
  '_arcPhysPoints', '_arcSamplePoints', '_arcRadiusFromCurvature',
  '_backFaceSkip', '_depenetrateInitial',
  'physToWorld', 'worldToPhys', 'worldToScreen', 'drawScene', 'drawGrid',
];
const missing = REQUIRED.filter(n => vm.runInContext(`typeof ${n}`, ctx) === 'undefined');
if (missing.length) { fail++; console.log(`\nFAIL  미정의 심볼: ${missing.join(', ')}`); }
else console.log(`\n ok   핵심 심볼 ${REQUIRED.length}개 모두 정의됨`);

/* 실제로 한 프레임 돌려보기 */
try {
  vm.runInContext(`
    CONFIG.cellSize = 8;
    STATE.floorSegments.push(new FloorSegment(0,60,100,60));
    const r = new RectBody(); r.gridX = 50; r.gridY = 40; STATE.elements.push(r);
    initPhysics();
    for (let i=0;i<120;i++) simStep(CONFIG.FIXED_DT);
    if (!isFinite(r.physY)) throw new Error('physY is not finite');
    drawScene();
  `, ctx);
  console.log(' ok   씬 구성 + 2초 시뮬 + drawScene() 정상 수행');
} catch (err) {
  fail++;
  console.log(`FAIL  런타임 스모크: ${err.message}`);
}

console.log('\n' + '='.repeat(60));
console.log(fail === 0 ? `스모크 통과 — ${FILES.length}개 파일 로드 OK` : `실패 ${fail}건`);
process.exit(fail ? 1 : 0);
