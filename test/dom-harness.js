/* ============================================================
   test/dom-harness.js — index.html 순서대로 전체 js/*.js 를 올리는 DOM 하네스
     addEventListener 로 등록된 실제 핸들러를 붙잡아 두고 합성 이벤트를
     흘려보낼 수 있어서, 브라우저 없이도 입력 동작을 검증할 수 있다.
   ============================================================ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.resolve(__dirname, '..');

function scriptList() {
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .split('\n')
    .map(l => (l.match(/<script src="([^"]+)"><\/script>/) || [])[1])
    .filter(Boolean);
}

function loadApp() {
  const listeners = new Map();   // el → Map(type → [fn])

  const reg = (el, type, fn) => {
    if (!listeners.has(el)) listeners.set(el, new Map());
    const m = listeners.get(el);
    if (!m.has(type)) m.set(type, []);
    m.get(type).push(fn);
  };

  function stubEl(tag) {
    const el = {
      tagName: tag, id: '', className: '', textContent: '', value: '', disabled: false,
      innerHTML: '', width: 800, height: 800, clientWidth: 800, clientHeight: 800,
      style: new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => (t[k] = v, true) }),
      _classes: new Set(),
      dataset: {}, children: [],
      appendChild(c) { this.children.push(c); return c; },
      removeChild() {}, insertBefore(c) { return c; }, remove() {},
      addEventListener(type, fn) { reg(this, type, fn); },
      removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
      querySelector() { return stubEl('span'); },
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800 }),
      getContext: () => new Proxy({
        canvas: { width: 800, height: 800 },
        // 그라데이션·패턴은 객체를 돌려줘야 하므로 명시 스텁
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => ({}),
        measureText: () => ({ width: 10 }),
      }, { get: (t, k) => (k in t ? t[k] : () => {}) }),
      toDataURL: () => 'data:,', toBlob(cb) { cb({ size: 0, type: 'image/png' }); },
      focus() {}, blur() {}, click() {},
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    };
    el.classList = {
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      toggle: (c, on) => (on === undefined ? (el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c))
                                           : (on ? el._classes.add(c) : el._classes.delete(c))),
      contains: (c) => el._classes.has(c),
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
    addEventListener(type, fn) { reg(document, type, fn); },
    removeEventListener() {},
    body: stubEl('body'), documentElement: stubEl('html'),
  };
  const windowObj = {
    addEventListener(type, fn) { reg(windowObj, type, fn); },
    removeEventListener() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  };

  const sandbox = {
    document, window: windowObj,
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    location: { href: 'http://localhost/' },
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
    Blob: class Blob {
      constructor(parts, opts) { this.parts = parts || []; this.type = (opts && opts.type) || ''; }
      get size() { return this.parts.join('').length; }
      text() { return Promise.resolve(this.parts.join('')); }
    },
    Path2D: class Path2D { constructor(d) { this.d = d; } },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    console, Math, Date, JSON, Set, Map, WeakMap, Array, Object, Number, String, Boolean,
    isNaN, isFinite, parseFloat, parseInt, Infinity, NaN, Proxy, Symbol,
    Error, TypeError, RangeError,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);

  const files = scriptList();
  const errors = [];
  for (const f of files) {
    try {
      vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    } catch (err) {
      errors.push({ file: f, err });
    }
  }

  /** 등록된 실제 핸들러로 합성 이벤트 전달 */
  function fire(elName, type, props) {
    const el = vm.runInContext(elName, ctx);
    const m = listeners.get(el);
    if (!m || !m.has(type)) return 0;
    const evt = Object.assign({
      preventDefault() {}, stopPropagation() {}, button: 0, target: el,
      pointerId: 1, pointerType: 'mouse',
    }, props);
    if (evt.clientX !== undefined && evt.offsetX === undefined) evt.offsetX = evt.clientX;
    if (evt.clientY !== undefined && evt.offsetY === undefined) evt.offsetY = evt.clientY;
    for (const fn of m.get(type)) fn(evt);
    return m.get(type).length;
  }

  const evalIn = (code) => vm.runInContext('{\n' + code + '\n}', ctx);

  return { ctx, fire, evalIn, listeners, errors, files, byId };
}

module.exports = { loadApp, scriptList };
