/* ============================================================
   scene.js — 장면 직렬화 · 복원 · 선언적 장면 DSL · 뷰 맞춤
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   한 장면(scene) = STATE.elements + STATE.floorSegments + STATE.ropes + 중력.
   이 파일은 그 장면을 "순수 데이터"로 내리고(sceneToData) 다시 올리는
   (loadSceneData) 단일 경로를 제공한다. 공유 링크(share.js)·갤러리·POE·
   테스트가 모두 이 경로를 쓴다.

   DSL — 사람이 손으로 적기 쉬운 장면 정의:
     buildSceneFromSpec({
       g: true,                                   // 중력 (기본 true)
       floors:   [{ key:'F', x1,y1,x2,y2, isFriction, muS, muK, pathType, curvature }],
       elements: [{ key:'A', type:'rect', gridX, gridY, mass, vx0, ...,
                    onFloor:{ floor:'F', x:50 },  // 바닥면 위에 얹기 (LINE 만)
                    left:'W', right:'A' }],       // 용수철 양끝 (키)
       ropes:    [['A','top','P','left'], ...],   // [키, 앵커, 키, 앵커]
       view:     { cx, cy, scale } | 'fit',       // 카메라
     })
   키(key)는 장면 안에서만 쓰는 이름이고 id 는 새로 발급된다.
   ============================================================ */

  /* ── 요소 타입 → 클래스 ── */
  function _sceneElementClass(type) {
    switch (type) {
      case 'rect':      return RectBody;
      case 'circle':    return CircleBody;
      case 'forceZone': return ForceZone;
      case 'pulley':    return Pulley;
      case 'spring':    return Spring;
      case 'extforce':  return ExtForce;
      default:          return null;
    }
  }

  /** 순수 데이터 → 요소 인스턴스 (알 수 없는 타입이면 null) */
  function makeElementFromData(d) {
    const Cls = _sceneElementClass(d.type);
    if (!Cls) return null;
    const el = new Cls();
    Object.assign(el, d);
    el._trail = [];
    return el;
  }

  /* ── 실행 중에만 의미 있는(휘발성) 필드 — 저장·공유에서 뺀다 ──
     _snapRotation 은 예외: 편집 상태(빗면에 얹힌 각도)라 남긴다. */
  const _SCENE_RUNTIME_KEYS = new Set([
    'physX', 'physY', 'vx', 'vy', 'ax', 'ay', 'omega', 'theta', 'alpha',
    'selected', 'calibratedLength', 'L', 'connectedRopeIds',
  ]);
  function _isRuntimeKey(k) {
    if (k === '_snapRotation' || k === '_key') return false;
    return k.startsWith('_') || _SCENE_RUNTIME_KEYS.has(k);
  }

  /** 편집 상태만 남긴 얕은 복사 (id 포함) */
  function _editFields(obj) {
    const o = {};
    for (const k of Object.keys(obj)) {
      if (_isRuntimeKey(k)) continue;
      const v = obj[k];
      if (typeof v === 'function') continue;
      o[k] = v;
    }
    return o;
  }

  /** 현재 장면 → 순수 데이터 */
  function sceneToData() {
    return {
      g:             STATE.gravityOn !== false,
      elements:      STATE.elements.map(e => _editFields(e.serialize ? e.serialize() : e)),
      floorSegments: STATE.floorSegments.map(s => _editFields(s.serialize ? s.serialize() : s)),
      ropes:         STATE.ropes.map(r => _editFields(r.serialize ? r.serialize() : r)),
    };
  }

  /**
   * 순수 데이터 → STATE 교체. 선택 해제·궤적 비움.
   *   opts.keepView   : true 면 뷰포트를 건드리지 않는다
   *   opts.history    : true 면 실행취소 기록 (기본 true)
   */
  function loadSceneData(data, opts) {
    opts = opts || {};
    if (STATE.simMode !== 'EDIT' && typeof stopSimulation === 'function') {
      stopSimulation();
      STATE.simMode = 'EDIT';
      STATE.simTime = 0;
    }
    STATE.elements = (data.elements || []).map(makeElementFromData).filter(Boolean);
    STATE.floorSegments = (data.floorSegments || []).map(d => {
      const seg = new FloorSegment(d.x1, d.y1, d.x2, d.y2);
      Object.assign(seg, d);
      seg._pathCache = null;
      return seg;
    });
    STATE.ropes = (data.ropes || []).map(d => {
      const rope = new Rope(d.anchorA, d.anchorB, d.ropeLength);
      Object.assign(rope, d);
      rope.calibratedLength = null;
      return rope;
    });
    if (typeof data.g === 'boolean') STATE.gravityOn = data.g;
    STATE.selected = null;
    STATE.interactionMode = 'IDLE';
    STATE.pendingGridPoint = null;
    STATE.pendingRopeAnchor = null;
    STATE._ropePreviewWorld = null;
    if (typeof syncPulleyPhys === 'function') syncPulleyPhys();
    if (typeof validateAll === 'function') validateAll();
    if (typeof renderPanel === 'function') renderPanel();
    if (typeof drawGrid === 'function') drawGrid();
    if (opts.history !== false && typeof recordHistory === 'function') recordHistory();
    if (typeof EVENTS !== 'undefined') EVENTS.emit('scene:changed', { source: 'load' });
  }

  /* ================================================================
     [DSL] — 선언적 장면 정의
  ================================================================ */

  /**
   * LINE 바닥면 위, 격자 x 지점에 물체를 얹는다 (물리의 단면 규약과 같은 쪽).
   * 물체 중심 = 발(foot) + 화면 법선 × 반높이, 회전 = 바닥면 기울기.
   * 물리 좌표계(y-up)에서 법선 (−dy, dx) 가 "실체가 있는 면" 이므로 그 방향으로 올린다.
   */
  function placeOnFloor(el, seg, xGrid) {
    const GS = CONFIG.GRID_SIZE;
    // 물리 좌표 (y-up)
    const ax = seg.x1, ay = GS - seg.y1, bx = seg.x2, by = GS - seg.y2;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9 || Math.abs(dx) < 1e-9) return;   // 수직 벽에는 얹을 수 없다
    const t  = Math.max(0, Math.min(1, (xGrid - ax) / dx));
    const fx = ax + t * dx, fy = ay + t * dy;         // 발 (물리)
    const nx = -dy / len, ny = dx / len;              // 실체면 법선 (물리)
    const hh = el.gridH / 2, hw = el.gridW / 2;
    const cx = fx + nx * hh, cy = fy + ny * hh;       // 중심 (물리)
    el.gridX = cx - hw;
    el.gridY = GS - cy - hh;
    // 화면 각도: 화면 y 는 아래로 증가 → 물리 dy 의 부호를 뒤집는다
    const ang = Math.atan2(-dy, dx);
    el._snapRotation = Math.abs(ang) < 1e-9 ? null : ang;
    if (el.type === 'pulley' && typeof syncPulleyPhys === 'function') syncPulleyPhys();
  }

  /**
   * spec → STATE (장면 교체). 반환: { ids: {키 → id} }
   *   opts.history : 실행취소 기록 여부 (기본 true)
   *   opts.view    : false 면 spec.view 를 무시
   */
  function buildSceneFromSpec(spec, opts) {
    opts = opts || {};
    const ids = {};
    const data = { g: spec.g !== false, elements: [], floorSegments: [], ropes: [] };

    // 1. 바닥면 (앵커 대상이 되므로 먼저)
    const floorObjs = [];
    for (const f of (spec.floors || [])) {
      const seg = new FloorSegment(f.x1, f.y1, f.x2, f.y2);
      for (const k of Object.keys(f)) {
        if (k === 'key') continue;
        if (k === 'smooth') { seg.smoothP1 = seg.smoothP2 = !!f.smooth; continue; }   // 양 끝 이음 다듬기
        seg[k] = f[k];
      }
      if (seg.isFriction && seg.muK == null) seg.muK = seg.muS * 0.8;
      if (f.key) { ids[f.key] = seg.id; seg._key = f.key; }
      floorObjs.push(seg);
    }

    // 2. 요소
    const elObjs = [];
    for (const e of (spec.elements || [])) {
      const Cls = _sceneElementClass(e.type);
      if (!Cls) continue;
      const el = new Cls();
      for (const k of Object.keys(e)) {
        if (['key', 'onFloor', 'left', 'right', 'type'].includes(k)) continue;
        el[k] = e[k];
      }
      if (e.onFloor) {
        const seg = floorObjs.find(s => s.id === ids[e.onFloor.floor]);
        if (seg) placeOnFloor(el, seg, e.onFloor.x);
      }
      if (e.key) { ids[e.key] = el.id; el._key = e.key; }
      elObjs.push({ el, spec: e });
    }
    // 용수철 양끝 키 → id (요소가 모두 생긴 뒤)
    for (const { el, spec: e } of elObjs) {
      if (el.type !== 'spring') continue;
      if (e.left  != null) { el.leftElementId  = ids[e.left]  || null; el.leftLocked  = !!el.leftElementId; }
      if (e.right != null) { el.rightElementId = ids[e.right] || null; el.rightLocked = !!el.rightElementId; }
    }

    // 3. 실 — 길이는 앵커 사이 실제 거리 (배치 상태 기준)
    STATE.elements = elObjs.map(o => o.el);
    STATE.floorSegments = floorObjs;
    STATE.ropes = [];
    for (const r of (spec.ropes || [])) {
      const a = { elementId: ids[r[0]], attachPoint: r[1] };
      const b = { elementId: ids[r[2]], attachPoint: r[3] };
      if (!a.elementId || !b.elementId) continue;
      const wA = _sceneAnchorWorld(a), wB = _sceneAnchorWorld(b);
      const cs = CONFIG.cellSize || 1;
      const len = (wA && wB) ? Math.hypot(wB.x - wA.x, wB.y - wA.y) / cs : (r[4] || 1);
      const rope = new Rope(a, b, len);
      STATE.ropes.push(rope);
      for (const eid of [a.elementId, b.elementId]) {
        const p = STATE.elements.find(x => x.id === eid);
        if (p && p.type === 'pulley' && !p.connectedRopeIds.includes(rope.id)) p.connectedRopeIds.push(rope.id);
      }
    }

    // 4. 데이터 경로로 한 번 통과시켜 저장·공유와 같은 형태로 만든다
    data.elements      = STATE.elements.map(e => _editFields(e.serialize()));
    data.floorSegments = STATE.floorSegments.map(s => _editFields(s.serialize()));
    data.ropes         = STATE.ropes.map(r => _editFields(r.serialize()));
    loadSceneData(data, { history: opts.history, keepView: true });

    // 5. 카메라
    if (opts.view !== false && spec.view) {
      if (spec.view === 'fit') fitViewToScene();
      else if (typeof focusView === 'function') focusView(spec.view.cx, spec.view.cy, spec.view.scale);
    }
    return { ids };
  }

  /** 앵커 → 월드 좌표 (DSL 내부용; 요소·바닥면 모두) */
  function _sceneAnchorWorld(anchor) {
    const el = STATE.elements.find(e => e.id === anchor.elementId);
    if (el) return getAttachPointWorld(el, anchor.attachPoint);
    const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
    if (seg) return getFloorSegAttachWorld(seg, anchor.attachPoint);
    return null;
  }

  /* ================================================================
     [VIEW] — 카메라 맞춤
  ================================================================ */

  /** 격자 (cx, cy) 가 화면 중앙에 오도록, 배율 scale 로 */
  function focusView(cx, cy, scale) {
    if (typeof mainCanvas === 'undefined' || !mainCanvas) return;
    const cs = CONFIG.cellSize;
    const W = mainCanvas.width, H = mainCanvas.height;
    const s = clamp(scale || VIEWPORT.scale, VIEWPORT.minScale, VIEWPORT.maxScale);
    VIEWPORT.scale   = s;
    VIEWPORT.offsetX = W / 2 - cx * cs * s;
    VIEWPORT.offsetY = H / 2 - cy * cs * s;
    if (typeof drawGrid === 'function') drawGrid();
    if (typeof EVENTS !== 'undefined') EVENTS.emit('view:changed');
  }

  /** 장면의 격자 bbox */
  function sceneBBoxGrid() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const el of STATE.elements) { grow(el.gridX, el.gridY); grow(el.gridX + el.gridW, el.gridY + el.gridH); }
    for (const s of STATE.floorSegments) { grow(s.x1, s.y1); grow(s.x2, s.y2); }
    if (!isFinite(x0)) return null;
    return { x0, y0, x1, y1 };
  }

  /** 장면 전체가 화면에 들어오게 (여백 포함) */
  function fitViewToScene(padCells) {
    const bb = sceneBBoxGrid();
    if (!bb || typeof mainCanvas === 'undefined' || !mainCanvas) return;
    const pad = padCells == null ? 3 : padCells;
    const w = Math.max(4, bb.x1 - bb.x0 + pad * 2);
    const h = Math.max(4, bb.y1 - bb.y0 + pad * 2);
    const cs = CONFIG.cellSize;
    const sX = mainCanvas.width  / (w * cs);
    const sY = mainCanvas.height / (h * cs);
    // 위쪽은 상태 배지·카드가 가리므로 살짝 아래로 무게를 둔다
    focusView((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2 - pad * 0.15, Math.min(sX, sY));
  }
