/* ============================================================
   test/harness.js — 실제 js/*.js 를 그대로 로드해 물리만 돌리는 검증 하네스
   ─ 브라우저 DOM은 최소 스텁으로 대체. 물리 코드는 한 글자도 수정하지 않음 ─
   ============================================================ */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ── 최소 DOM 스텁 ────────────────────────────────────────── */
function makeStubEl(id) {
  const el = {
    id,
    style: new Proxy({ cssText: '' }, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => (t[k] = v, true) }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {},
    textContent: '',
    disabled: false,
    width: 800, height: 800,
    clientWidth: 800, clientHeight: 800,
    appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: () => () => {} }),
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
  };
  return el;
}

function makeContext() {
  const els = new Map();
  const document = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeStubEl(id));
      return els.get(id);
    },
    createElement: (tag) => makeStubEl('_' + tag),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    body: makeStubEl('body'),
  };
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const sandbox = {
    document, window,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    console,
    Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    isNaN, isFinite, parseFloat, parseInt, Infinity, NaN, undefined,
    Proxy, Symbol, Error, TypeError,
  };
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

/** 실제 소스 파일들을 순서대로 로드한 컨텍스트 반환 */
function loadEngine() {
  const ctx = makeContext();
  const files = ['js/config.js', 'js/coords.js', 'js/elements.js', 'js/physics.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  // physics.js가 참조하는 렌더/UI 함수 스텁 (물리와 무관)
  vm.runInContext(`
    function _selectObject() {}
    function renderPanel() {}
    function drawGrid() {}
    function recordHistory() {}
    CONFIG.cellSize = 8;   // 800px 캔버스 / 100칸 (렌더 전용 값)
  `, ctx);
  return ctx;
}

/* ── 씬 빌더 API (컨텍스트 안에서 실행되는 헬퍼) ───────────── */
const SCENE_API = `
  function reset() {
    STATE.elements = []; STATE.floorSegments = []; STATE.ropes = [];
    STATE.selected = null; STATE.simMode = 'EDIT'; STATE.gravityOn = true;
  }
  function addRect(o) {
    const e = new RectBody();
    Object.assign(e, o);
    STATE.elements.push(e); return e;
  }
  function addCircle(o) {
    const e = new CircleBody();
    Object.assign(e, o);
    STATE.elements.push(e); return e;
  }
  function addZone(o)  { const e = new ForceZone(); Object.assign(e, o); STATE.elements.push(e); return e; }
  function addPulley(o){ const e = new Pulley();    Object.assign(e, o); STATE.elements.push(e); return e; }
  function addSpring(o){ const e = new Spring();    Object.assign(e, o); STATE.elements.push(e); return e; }
  function addExtF(o)  { const e = new ExtForce();  Object.assign(e, o); STATE.elements.push(e); return e; }
  function addFloor(x1, y1, x2, y2, o) {
    const s = new FloorSegment(x1, y1, x2, y2);
    if (o) Object.assign(s, o);
    STATE.floorSegments.push(s); return s;
  }
  function addRope(aId, aPt, bId, bPt) {
    const r = new Rope({ elementId: aId, attachPoint: aPt }, { elementId: bId, attachPoint: bPt }, 0);
    STATE.ropes.push(r); return r;
  }
  /** 시뮬 시작 (실제 startSimulation의 물리 부분만) */
  function begin() { validateAll(); initPhysics(); STATE.simMode = 'RUNNING'; }
  /** t초만큼 FIXED_DT 스텝으로 진행 */
  function run(t) {
    const n = Math.round(t / CONFIG.FIXED_DT);
    for (let i = 0; i < n; i++) simStep(CONFIG.FIXED_DT);
    return n * CONFIG.FIXED_DT;
  }
  /** 요소 상태 스냅 */
  function snap(e) {
    return { x: e.physX, y: e.physY, vx: e.vx, vy: e.vy,
             omega: e.omega, gridX: e.gridX, gridY: e.gridY,
             L: e.L, k: e.k };
  }
  /** 물리좌표 → 화면 픽셀(월드) — 렌더와 동일 변환 */
  function px(e) {
    const w = physToWorld(e.physX, e.physY);
    return { wx: w.x, wy: w.y };
  }
`;

/* ── 테스트 러너 ──────────────────────────────────────────── */
const results = [];
let CURRENT = null;

function scenario(id, title, fn) {
  const ctx = loadEngine();
  vm.runInContext(SCENE_API, ctx);
  // 블록으로 감싸 각 run() 호출의 const/let 가 컨텍스트 전역을 오염시키지 않게 함
  // (블록의 완성값 = 마지막 표현식문 값 → 기존 반환 규약 그대로 유지)
  const run = (code) => vm.runInContext('{\n' + code + '\n}', ctx);
  CURRENT = { id, title, checks: [], error: null };
  try {
    fn({ ctx, run, eval: run });
  } catch (err) {
    CURRENT.error = err.stack || String(err);
  }
  results.push(CURRENT);
  CURRENT = null;
}

/** 수치 비교: |actual-expected| <= tol (tol이 문자열 '2%'면 상대오차) */
function expect(label, actual, expected, tol, unit) {
  let ok, tolAbs;
  if (typeof tol === 'string' && tol.endsWith('%')) {
    const p = parseFloat(tol) / 100;
    tolAbs = Math.abs(expected) * p;
    if (tolAbs < 1e-9) tolAbs = 1e-6;
  } else {
    tolAbs = tol;
  }
  ok = Math.abs(actual - expected) <= tolAbs;
  CURRENT.checks.push({ label, actual, expected, tol: tolAbs, ok, unit: unit || 'm' });
  return ok;
}

function note(label, value) {
  CURRENT.checks.push({ label, note: String(value) });
}

function report() {
  let pass = 0, fail = 0, err = 0;
  const lines = [];
  for (const r of results) {
    const bad = r.checks.filter(c => c.ok === false);
    const status = r.error ? 'ERROR' : (bad.length ? 'FAIL' : 'PASS');
    if (r.error) err++; else if (bad.length) fail++; else pass++;
    lines.push(`\n[${status}] ${r.id} — ${r.title}`);
    if (r.error) lines.push('   ' + r.error.split('\n').slice(0, 4).join('\n   '));
    for (const c of r.checks) {
      if (c.note !== undefined) { lines.push(`   · ${c.label}: ${c.note}`); continue; }
      const mark = c.ok ? 'ok  ' : 'XX  ';
      const diff = c.actual - c.expected;
      lines.push(`   ${mark}${c.label}: actual=${fmt(c.actual)} expected=${fmt(c.expected)} diff=${fmt(diff)} tol=${fmt(c.tol)} [${c.unit}]`);
    }
  }
  lines.push(`\n=============================================`);
  lines.push(`PASS ${pass} / FAIL ${fail} / ERROR ${err}  (total ${results.length})`);
  console.log(lines.join('\n'));
  return { pass, fail, err };
}

function fmt(v) {
  if (v === undefined || v === null) return String(v);
  if (!isFinite(v)) return String(v);
  return (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-4 && v !== 0)) ? v.toExponential(3) : v.toFixed(5);
}

module.exports = { scenario, expect, note, report, loadEngine, SCENE_API, results };
