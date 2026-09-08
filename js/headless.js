/* ============================================================
   headless.js — 화면 없이 장면을 돌려 측정값을 얻는 경로
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   회로 앱은 정상상태 해가 있어 solve() 한 번으로 관찰값을 얻지만, 역학은
   시간 진화다. POE 의 비교표·수치 정답, 파라미터 스윕은 "장면 X 를 T 초
   돌렸을 때(또는 사건이 일어났을 때) 물리량 Q" 가 필요하다. 이 파일이 그
   질문에 답한다. 물리 함수는 STATE 전역을 읽으므로, 현재 장면을 잠시 떼어
   두고 대상 장면을 STATE 에 올려 돌린 뒤 되돌린다. 렌더·시계열·이벤트는
   HEADLESS.active 플래그로 막는다 (simStep 이 확인한다).

     simulateHeadless(sceneData, { T, until, sample })  → { t, samples, final }
     measureScene(sceneData, measureSpec)               → 값 (수치)
     applyVariant(sceneData, set)                       → 새 sceneData (키 → 속성 변경)

   measureSpec = { body:'키|라벨|인덱스', q:'v'|'vx'|'vy'|'x'|'y'|'a'|'ke'|'pe'|'E'|'T'|'N'|'f'|'period',
                   at:초 | when:'floor'|'stop'|'rest', stat:'final'|'max'|'min'|'time' }
   ============================================================ */

  const HEADLESS = { active: false, maxT: 60 };

  /** STATE 의 장면 부분만 떼어 둔다 */
  function _stashState() {
    return {
      elements: STATE.elements, floorSegments: STATE.floorSegments, ropes: STATE.ropes,
      selected: STATE.selected, simMode: STATE.simMode, simTime: STATE.simTime, gravityOn: STATE.gravityOn,
      warnings: STATE.warnings, snapshot: STATE.snapshot,
    };
  }
  function _restoreState(s) {
    STATE.elements = s.elements; STATE.floorSegments = s.floorSegments; STATE.ropes = s.ropes;
    STATE.selected = s.selected; STATE.simMode = s.simMode; STATE.simTime = s.simTime; STATE.gravityOn = s.gravityOn;
    STATE.warnings = s.warnings; STATE.snapshot = s.snapshot;
  }

  /** 순수 데이터 → 인스턴스 (loadSceneData 와 같은 규칙, STATE 는 건드리지 않음) */
  function _instantiateScene(data) {
    const elements = (data.elements || []).map(makeElementFromData).filter(Boolean);
    const floorSegments = (data.floorSegments || []).map(d => { const s = new FloorSegment(d.x1, d.y1, d.x2, d.y2); Object.assign(s, d); s._pathCache = null; return s; });
    const ropes = (data.ropes || []).map(d => { const r = new Rope(d.anchorA, d.anchorB, d.ropeLength); Object.assign(r, d); r.calibratedLength = null; return r; });
    return { elements, floorSegments, ropes, g: data.g !== false };
  }

  /** 물체 찾기: 키(spec 의 key → 요소의 _key), 라벨, 인덱스, id */
  function _findBody(elements, ref) {
    const bodies = elements.filter(e => e.type === 'rect' || e.type === 'circle');
    if (typeof ref === 'number') return bodies[ref] || null;
    if (!ref) return bodies[0] || null;
    return elements.find(e => e._key === ref) || elements.find(e => e.id === ref) || elements.find(e => e.label === ref) || null;
  }

  /** 물체의 즉시 물리량 */
  function _quantity(el, q, ctx) {
    const GS = CONFIG.GRID_SIZE;
    const cx = el.type === 'rect' ? el.physX + el.gridW / 2 : el.physX;
    const cy = el.type === 'rect' ? el.physY + el.gridH / 2 : el.physY;
    const m = el.mass || 1, g = STATE.gravityOn ? CONFIG.G : 0;
    const f = el._fbd;
    switch (q) {
      case 'x': return cx;
      case 'y': return cy;
      case 'h': return cy - (ctx.y0 || 0);
      case 'vx': return el.vx;
      case 'vy': return el.vy;
      case 'v': return Math.hypot(el.vx, el.vy);
      case 'ax': return el._axMeas || 0;
      case 'ay': return el._ayMeas || 0;
      case 'a': return Math.hypot(el._axMeas || 0, el._ayMeas || 0);
      case 'ke': return 0.5 * m * (el.vx * el.vx + el.vy * el.vy);
      case 'pe': return m * g * (cy - (ctx.y0 || 0));
      case 'E': return 0.5 * m * (el.vx * el.vx + el.vy * el.vy) + m * g * (cy - (ctx.y0 || 0));
      case 'p': return m * el.vx;
      case 'T': return f && f.T.length ? f.T.reduce((s, t) => s + t.mag, 0) / f.T.length : 0;
      case 'N': return f ? Math.hypot(f.N[0], f.N[1]) : 0;
      case 'f': return f ? Math.hypot(f.f[0], f.f[1]) : 0;
      case 'net': return f ? Math.hypot(f.net[0], f.net[1]) : 0;
      default: return NaN;
    }
  }

  /**
   * 장면을 헤드리스로 돌린다.
   *   opts.T      : 총 시간 [s] (기본 5, 상한 HEADLESS.maxT)
   *   opts.until  : (elements, t) => bool — true 가 되면 멈춤
   *   opts.sample : (elements, t) => any — 매 스텝 기록 (samples 배열)
   * 반환 { t, samples, elements(마지막 상태 인스턴스), stopped:'until'|'T' }
   */
  function simulateHeadless(sceneData, opts) {
    opts = opts || {};
    const saved = _stashState();
    const inst = _instantiateScene(sceneData);
    const samples = [];
    let t = 0, stopped = 'T';
    HEADLESS.active = true;
    try {
      STATE.elements = inst.elements; STATE.floorSegments = inst.floorSegments; STATE.ropes = inst.ropes;
      STATE.gravityOn = inst.g; STATE.selected = null; STATE.simMode = 'RUNNING'; STATE.simTime = 0;
      // 용수철 이웃 체결 등 편집 검증 (경고는 임시 STATE 에만 남고 되돌린다)
      _headlessValidate();
      initPhysics();
      const dt = CONFIG.FIXED_DT;
      const T = Math.min(opts.T != null ? opts.T : 5, HEADLESS.maxT);
      const n = Math.round(T / dt);
      for (let i = 0; i < n; i++) {
        simStep(dt); t += dt;
        if (opts.sample) samples.push(opts.sample(STATE.elements, t));
        if (opts.until && opts.until(STATE.elements, t)) { stopped = 'until'; break; }
      }
    } finally {
      HEADLESS.active = false;
      _restoreState(saved);
    }
    return { t, samples, elements: inst.elements, ropes: inst.ropes, floorSegments: inst.floorSegments, stopped };
  }

  /** validateAll 의 부수효과(이벤트·버튼) 없이 용수철 체결만 */
  function _headlessValidate() {
    for (const s of STATE.elements) {
      if (s.type !== 'spring' || s.autoAttach === false) continue;
      const nb = detectSpringNeighbors(s);
      if (s.leftElementId !== nb.leftId)   { s.leftElementId = nb.leftId;   s.leftLocked  = !!nb.leftId; }
      if (s.rightElementId !== nb.rightId) { s.rightElementId = nb.rightId; s.rightLocked = !!nb.rightId; }
    }
    if (typeof syncPulleyPhys === 'function') syncPulleyPhys();
  }

  /** 물리 y 기준(가장 낮은 바닥면) — 임시 장면용 */
  function _baselineOf(floors) {
    const GS = CONFIG.GRID_SIZE;
    let y = Infinity;
    for (const s of floors) y = Math.min(y, GS - s.y1, GS - s.y2);
    return isFinite(y) ? y : 0;
  }

  /**
   * 측정 — measureScene(sceneData, spec) → 수치 (없으면 NaN)
   *   spec.q     : 물리량 ('period' 는 vx 부호 전환 간격으로 주기)
   *   spec.at    : 그 시각의 값 (기본 stat 'final')
   *   spec.when  : 'floor' (첫 바닥 접촉) | 'stop' (속력 < 0.02) | 'rest' (0.5 s 이상 정지)
   *   spec.stat  : 'final' | 'max' | 'min' | 'time' (사건 시각) | 'dist' (이동 거리)
   *   spec.T     : 최대 시간
   */
  function measureScene(sceneData, spec) {
    const q = spec.q || 'v';
    const inst0 = _instantiateScene(sceneData);
    const y0 = _baselineOf(inst0.floorSegments);
    const ctx = { y0 };
    let start = null, contactAt = null, stopAt = null, restSince = null;
    let maxV = -Infinity, minV = Infinity, lastV = NaN, prevV = NaN, eventV = NaN, eventT = NaN;
    let crossings = [];
    let prevVx = null;
    const targetId = () => {
      const b = _findBody(STATE.elements, spec.body);
      return b ? b.id : null;
    };
    let bid = null;
    const T = spec.T != null ? spec.T : (spec.at != null ? spec.at : 6);
    const res = simulateHeadless(sceneData, {
      T,
      sample(elements, t) {
        if (bid == null) bid = targetId();
        const el = elements.find(e => e.id === bid);
        if (!el) return;
        if (start === null) start = { x: el.type === 'rect' ? el.physX + el.gridW / 2 : el.physX, y: el.type === 'rect' ? el.physY + el.gridH / 2 : el.physY };
        const v = _quantity(el, q, ctx);
        prevV = lastV; lastV = v;
        if (isFinite(v)) { if (v > maxV) maxV = v; if (v < minV) minV = v; }
        // 주기: vx 부호 −→+ 전환 시각
        if (q === 'period') {
          if (prevVx !== null && prevVx < 0 && el.vx >= 0) crossings.push(t);
          prevVx = el.vx;
        }
        // 사건
        const speed = Math.hypot(el.vx, el.vy);
        if (spec.when === 'floor' && contactAt === null && el._contact) { contactAt = t; eventV = isFinite(prevV) ? prevV : v; eventT = t; }
        if (spec.when === 'stop' && stopAt === null && t > 0.1 && speed < 0.02) { stopAt = t; eventV = v; eventT = t; }
        if (spec.when === 'rest') {
          if (speed < 0.02) { if (restSince === null) restSince = t; if (t - restSince > 0.5 && stopAt === null) { stopAt = restSince; eventV = v; eventT = restSince; } }
          else restSince = null;
        }
        if (spec.at != null && Math.abs(t - spec.at) < CONFIG.FIXED_DT * 0.51) { eventV = v; eventT = t; }
      },
      until(elements, t) {
        if (spec.when === 'floor' && contactAt !== null) return true;
        if ((spec.when === 'stop' || spec.when === 'rest') && stopAt !== null) return true;
        if (spec.at != null && t >= spec.at - 1e-9) return true;
        return false;
      },
    });
    if (q === 'period') return crossings.length >= 2 ? crossings[1] - crossings[0] : NaN;
    const stat = spec.stat || (spec.when || spec.at != null ? 'event' : 'final');
    if (stat === 'time') return isFinite(eventT) ? eventT : NaN;
    if (stat === 'max') return maxV;
    if (stat === 'min') return minV;
    if (stat === 'dist') {
      const el = res.elements.find(e => e.id === bid);
      if (!el || !start) return NaN;
      const cx = el.type === 'rect' ? el.physX + el.gridW / 2 : el.physX, cy = el.type === 'rect' ? el.physY + el.gridH / 2 : el.physY;
      return Math.hypot(cx - start.x, cy - start.y);
    }
    if (stat === 'event') return isFinite(eventV) ? eventV : lastV;
    return lastV;
  }

  /**
   * 변형 적용 — set = { 키: { 속성: 값 } } ; 키는 요소 _key(DSL 키) 또는 라벨.
   * 원본은 건드리지 않고 깊은 복사를 돌려준다. 바닥면 키도 된다.
   */
  function applyVariant(sceneData, set) {
    const d = JSON.parse(JSON.stringify(sceneData));
    if (!set) return d;
    for (const key of Object.keys(set)) {
      const target = d.elements.find(e => e._key === key || e.label === key) || d.floorSegments.find(s => s._key === key);
      if (!target) continue;
      Object.assign(target, set[key]);
    }
    return d;
  }
