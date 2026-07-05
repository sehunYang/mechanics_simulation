/* ============================================================
   interaction.js — 포인터 이벤트 (줌·팬·드래그·선택·리와이어)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
    /* ================================================================
     [UI EVENTS] — 포인터 이벤트 (줌 + 팬 + 드래그 + 선택)
  ================================================================ */

  let _panStart = null;   // { screenX, screenY, offsetX, offsetY }
  let _dragEl   = null;   // 드래그 중인 Element 참조

  /* ── 더블탭 감지 변수 ── */
  let _lastTapTime = 0;
  let _lastTapEl   = null;

  /* ── 리사이즈 핸들 상태 ── */
  let _resizeHandle   = null;   // { type: 'br'|'right'|'bottom'|'p1'|'p2', target }
  let _longPressTimer = null;   // 롱프레스 타이머
  let _longPressEl    = null;   // 롱프레스 중인 요소
  let _ropeRewireMode = null;   // { rope, side:'p1'|'p2' } — 실 앵커 재연결 모드
  let _deleteZoneVis  = false;  // 삭제 존 표시 여부
  let _contextMenu    = null;   // 컨텍스트 메뉴 DOM 요소
  let _lastClickPos   = null;   // 레이어 순환용 마지막 클릭 위치
  let _layerCycleIdx  = 0;      // 레이어 순환 인덱스

  /** 실 앵커 재연결 모드: 연결 가능한 모든 포인트 시각화 */
  function _drawRopeWireAnchors(ctx) {
    if (!_ropeRewireMode) return;
    const cs = CONFIG.cellSize, s = VIEWPORT.scale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const el of STATE.elements) {
      if (el.type === 'rope') continue;
      const pts = getAttachPoints(el);
      for (const pt of pts) {
        const sx = pt.worldX * s + VIEWPORT.offsetX;
        const sy = pt.worldY * s + VIEWPORT.offsetY;
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI*2);
        ctx.fillStyle   = 'rgba(34,197,94,0.85)';   // 초록
        ctx.fill();
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }
    for (const seg of STATE.floorSegments) {
      const pts = getFloorSegAttachPoints(seg);
      for (const pt of pts) {
        const sx = pt.worldX * s + VIEWPORT.offsetX;
        const sy = pt.worldY * s + VIEWPORT.offsetY;
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI*2);
        ctx.fillStyle   = 'rgba(34,197,94,0.85)';
        ctx.fill();
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** 선택된 요소의 핸들 화면 위치 목록을 반환
   *  반환: [{ type, screenX, screenY, worldX, worldY }, ...]
   */
  function _getHandlePositions(sel) {
    if (!sel) return [];
    const cs = CONFIG.cellSize;
    const s  = VIEWPORT.scale;

    function ws(wx, wy) {   // world → screen
      return { sx: wx * s + VIEWPORT.offsetX, sy: wy * s + VIEWPORT.offsetY };
    }

    // FloorSegment
    if (sel.type === 'floorSegment') {
      const p1s = ws(sel.x1 * cs, sel.y1 * cs);
      const p2s = ws(sel.x2 * cs, sel.y2 * cs);
      return [
        { type: 'p1', sx: p1s.sx, sy: p1s.sy },
        { type: 'p2', sx: p2s.sx, sy: p2s.sy },
      ];
    }
    // Rope: 앵커 위치에 핸들 (시각화만, 이동은 앵커 연결 변경 필요)
    if (sel.type === 'rope') {
      const wA = _resolveAnchorWorld(sel.anchorA);
      const wB = _resolveAnchorWorld(sel.anchorB);
      if (!wA || !wB) return [];
      const sA = ws(wA.x, wA.y), sB = ws(wB.x, wB.y);
      return [
        { type: 'p1', sx: sA.sx, sy: sA.sy },
        { type: 'p2', sx: sB.sx, sy: sB.sy },
      ];
    }
    // Spring: 방향에 따라 한쪽 끝만
    if (sel.type === 'spring') {
      if (!sel.isVertical) {
        // 가로: 오른쪽 끝 (gridX+gridW, gridY+gridH/2)
        const p = ws((sel.gridX + sel.gridW) * cs, (sel.gridY + sel.gridH / 2) * cs);
        return [{ type: 'right', sx: p.sx, sy: p.sy }];
      } else {
        // 세로: 아래쪽 끝 (gridX+gridW/2, gridY+gridH)
        const p = ws((sel.gridX + sel.gridW / 2) * cs, (sel.gridY + sel.gridH) * cs);
        return [{ type: 'bottom', sx: p.sx, sy: p.sy }];
      }
    }
    // 나머지 (rect, circle, pulley, forceZone): 우측 하단
    if (['rect','circle','pulley','forceZone'].includes(sel.type)) {
      const p = ws((sel.gridX + sel.gridW) * cs, (sel.gridY + sel.gridH) * cs);
      return [{ type: 'br', sx: p.sx, sy: p.sy }];
    }
    return [];
  }

  /** 핸들 점 렌더 */
  function _drawResizeHandles(ctx) {
    const sel = STATE.selected;
    if (!sel || STATE.simMode !== 'EDIT') return;
    const handles = _getHandlePositions(sel);
    const s = VIEWPORT.scale;
    for (const h of handles) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);  // 스크린 좌표계 직접 사용
      ctx.beginPath();
      ctx.arc(h.sx, h.sy, 7, 0, Math.PI * 2);
      ctx.fillStyle   = '#4f8ef7';
      ctx.fill();
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ══════════════════════════════════════
     컨텍스트 메뉴 / 클론 / 삭제존 유틸
  ══════════════════════════════════════ */

  /** 컨텍스트 메뉴 닫기 */
  function _closeContextMenu() {
    if (_contextMenu) { _contextMenu.remove(); _contextMenu = null; }
  }

  /** 요소 복제 */
  function _cloneElement(el) {
    const data = JSON.parse(JSON.stringify(el));   // deep copy
    data.id = makeId();
    data.gridX = (data.gridX || 0) + 1;
    data.gridY = (data.gridY || 0) + 1;
    let clone;
    switch (el.type) {
      case 'rect':      clone = Object.assign(new RectBody(),    data); break;
      case 'circle':    clone = Object.assign(new CircleBody(),  data); break;
      case 'forceZone': clone = Object.assign(new ForceZone(),   data); break;
      case 'pulley':    clone = Object.assign(new Pulley(),      data); break;
      case 'spring':    clone = Object.assign(new Spring(),      data); break;
      case 'extforce':  clone = Object.assign(new ExtForce(),    data); break;
      default: return null;
    }
    STATE.elements.push(clone);
    _selectObject(clone);
    validateAll();
    return clone;
  }

  /** 컨텍스트 메뉴 표시 */
  function _showContextMenu(el, screenX, screenY) {
    _closeContextMenu();
    const menu = document.createElement('div');
    menu.style.cssText = `
      position:fixed;left:${screenX}px;top:${screenY}px;
      background:var(--bg-ctx);border:1px solid var(--border-active);border-radius:8px;
      padding:4px 0;z-index:9999;min-width:110px;box-shadow:0 4px 16px rgba(0,0,0,.5);
    `;
    const items = [];
    // 복제: FloorSegment/Rope 제외
    if (el.type && el.type !== 'floorSegment' && el.type !== 'rope')
      items.push(['복제', () => { _cloneElement(el); _closeContextMenu(); }]);
    // 회전: spring·rect·forceZone
    if (['spring','rect','forceZone'].includes(el.type))
      items.push(['방향 전환', () => { _handleDoubleTap(el); _closeContextMenu(); }]);
    // 삭제: 항상
    items.push(['삭제', () => { _deleteSelected(el); _closeContextMenu(); }]);

    for (const [label, cb] of items) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        display:block;width:100%;padding:8px 16px;background:none;border:none;
        color:${label==='삭제'?'var(--danger-text)':'var(--text)'};font-size:13px;text-align:left;
        cursor:pointer;
      `;
      btn.onmouseover = () => btn.style.background = 'rgba(60,100,160,0.35)';
      btn.onmouseleave = () => btn.style.background = 'none';
      btn.onclick = cb;
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    _contextMenu = menu;
  }

  /** 선택 요소 삭제 헬퍼 */
  function _deleteSelected(target) {
    if (!target) return;
    if (target.type === 'floorSegment') {
      STATE.floorSegments = STATE.floorSegments.filter(s => s !== target);
    } else if (target.type === 'rope') {
      STATE.ropes = STATE.ropes.filter(r => r !== target);
    } else {
      STATE.elements = STATE.elements.filter(e => e !== target);
    }
    _selectObject(null);
    validateAll();
  }

  /** 삭제 존 렌더 */
  function _drawDeleteZone(ctx) {
    if (!_deleteZoneVis) return;
    const W = mainCanvas.width, H = mainCanvas.height;
    const zW = 120, zH = 60, pad = 14;
    const zx = pad, zy = H - zH - pad;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle   = 'rgba(239,68,68,0.85)';
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(zx, zy, zW, zH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 15px sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🗑  삭제', zx + zW/2, zy + zH/2);
    ctx.restore();
  }

  /** 스크린 좌표가 삭제 존 위에 있는지 */
  function _isOnDeleteZone(sx, sy) {
    const H = mainCanvas.height, pad = 14, zW = 120, zH = 60;
    return sx >= pad && sx <= pad+zW && sy >= H-zH-pad && sy <= H-pad;
  }

  /** 주어진 world 좌표에 겹치는 모든 요소 목록 */
  function _hitAllAtWorld(wx, wy) {
    const hits = [];
    for (let i = STATE.elements.length - 1; i >= 0; i--) {
      const el = STATE.elements[i];
      const box = el.getBBox ? el.getBBox() : null;
      if (!box) continue;
      const cs = CONFIG.cellSize;
      if (wx >= box.x && wx <= box.x+box.w && wy >= box.y && wy <= box.y+box.h) hits.push(el);
    }
    // FloorSegment와 Rope도 포함
    const cs = CONFIG.cellSize;
    // FloorSegment/Rope는 별도 hitTest 핸들러(hitTestFloorSegment, hitTestRope)에서 처리
    // 레이어 순환은 STATE.elements(getBBox 있는 물체)만 대상
    return hits;
  }

  /* ════════════════════════════════
     바닥면 스냅 유틸
  ════════════════════════════════ */
  const SNAP_DIST_CELLS = 1.5;   // 스냅 활성화 거리 (격자 단위)

  /** 점(px,py)에서 선분[(x1,y1)-(x2,y2)]까지 수직 거리 및 발(foot) */
  function _distPointToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2-x1, dy = y2-y1, lenSq = dx*dx+dy*dy;
    if (lenSq < 1e-12) return { dist: Math.hypot(px-x1,py-y1), t:0, fx:x1, fy:y1 };
    const t  = Math.max(0, Math.min(1, ((px-x1)*dx+(py-y1)*dy)/lenSq));
    const fx = x1+t*dx, fy = y1+t*dy;
    return { dist: Math.hypot(px-fx,py-fy), t, fx, fy };
  }

  /** 드래그 중 가장 가까운 바닥면 스냅 정보 반환 */
  function _computeFloorSnap(el, worldX, worldY) {
    const cs       = CONFIG.cellSize;
    const snapDist = SNAP_DIST_CELLS * cs;
    const hh       = el.gridH / 2;
    let best = null;
    for (const seg of STATE.floorSegments) {
      const x1 = seg.x1*cs, y1 = seg.y1*cs, x2 = seg.x2*cs, y2 = seg.y2*cs;
      const { dist, t, fx, fy } = _distPointToSeg(worldX, worldY, x1, y1, x2, y2);
      if (dist < snapDist && (!best || dist < best.dist)) {
        const dx = x2-x1, dy = y2-y1, len = Math.hypot(dx,dy);
        if (len < 1e-9) continue;
        const tx = dx/len, ty = dy/len;
        let nx = -ty, ny = tx;
        if ((worldX-fx)*nx+(worldY-fy)*ny < 0) { nx=-nx; ny=-ny; }
        best = { dist, seg, angle: Math.atan2(dy,dx), nx, ny };
      }
    }
    if (!best) return { snapped: false };
    return { snapped: true, ...best, rotRad: best.angle };
  }

  /** 더블탭 → 요소별 방향 전환
   * spring    : 가로↔세로 (isVertical 토글 + gridW↔gridH 교환)
   * rect      : 90° 회전 (gridW↔gridH 교환)
   * forceZone : 힘 방향 반시계 90° 회전 (fx,fy) → (-fy, fx)
   * circle/pulley: 무시 (대칭)
   */
  function _handleDoubleTap(el) {
    if (!el) return;
    if (el.type === 'spring') {
      el.isVertical = !el.isVertical;
      const tmp = el.gridW; el.gridW = el.gridH; el.gridH = tmp;
      validateAll();
      renderPanel();
    } else if (el.type === 'rect') {
      // gridW ↔ gridH (좌상단 고정, 우하단 이동)
      const tmp = el.gridW; el.gridW = el.gridH; el.gridH = tmp;
      validateAll();
      renderPanel();
    } else if (el.type === 'forceZone') {
      // 힘 방향 반시계 90° 회전: (fx, fy) → (-fy, fx)
      const tmpFx = el.fx;
      el.fx = -el.fy;
      el.fy =  tmpFx;
      renderPanel();
    }
    // circle, pulley: 대칭이므로 동작 없음
  }

  /** 실 재연결 완료: 가장 가까운 앵커에 스냅 */
  function _finishRopeRewire(worldX, worldY) {
    if (!_ropeRewireMode) return;
    const { rope, side } = _ropeRewireMode;
    const cs = CONFIG.cellSize;
    let best = null, bestDist = Infinity;

    // 모든 요소 앵커 탐색
    for (const el of STATE.elements) {
      if (el.type === 'rope') continue;
      for (const pt of getAttachPoints(el)) {
        const d = Math.hypot(worldX - pt.worldX, worldY - pt.worldY);
        if (d < cs * 1.2 && d < bestDist) {
          bestDist = d;
          best = { elementId: el.id, attachPoint: pt.id };
        }
      }
    }
    for (const seg of STATE.floorSegments) {
      for (const pt of getFloorSegAttachPoints(seg)) {
        const d = Math.hypot(worldX - pt.worldX, worldY - pt.worldY);
        if (d < cs * 1.2 && d < bestDist) {
          bestDist = d;
          best = { elementId: seg.id, attachPoint: pt.id };
        }
      }
    }

    if (best) {
      if (side === 'p1') rope.anchorA = best;
      else               rope.anchorB = best;
      // ropeLength 재계산
      const wA = _resolveAnchorWorld(rope.anchorA);
      const wB = _resolveAnchorWorld(rope.anchorB);
      if (wA && wB) {
        rope.ropeLength = Math.hypot(wB.x-wA.x, wB.y-wA.y) / CONFIG.cellSize;
        rope.calibratedLength = null;
      }
      validateAll();
    }
    _ropeRewireMode = null;
    STATE.interactionMode = 'IDLE';
  }

  /* ── pointerdown ── */
  // 우클릭 컨텍스트 메뉴
  mainCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (STATE.simMode !== 'EDIT') return;
    const world = screenToWorld(e.offsetX, e.offsetY);
    const allHits = _hitAllAtWorld(world.x, world.y);
    const target = allHits.length > 0 ? allHits[0] : STATE.selected;
    if (target) {
      _selectObject(target);
      _showContextMenu(target, e.clientX, e.clientY);
    }
  });

  // 다른 곳 클릭 시 컨텍스트 메뉴 닫기
  document.addEventListener('pointerdown', (e) => {
    if (_contextMenu && !_contextMenu.contains(e.target)) _closeContextMenu();
  }, { capture: true });

  mainCanvas.addEventListener('pointerdown', (e) => {
    mainCanvas.setPointerCapture(e.pointerId);
    STATE.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 2포인터 핀치: 드래그/팬 취소
    if (STATE.activePointers.size === 2) {
      _panStart = null;
      _dragEl   = null;
      STATE.interactionMode = 'IDLE';
      STATE.prevPinchDist   = getPinchDist();
      return;
    }

    if (STATE.simMode !== 'EDIT') return;

    // 1포인터 처리
    if (STATE.activePointers.size === 1 && STATE.interactionMode === 'IDLE') {
      const world = screenToWorld(e.offsetX, e.offsetY);

      // ① 핸들 히트 검사 (가장 우선)
      if (STATE.selected) {
        const handles = _getHandlePositions(STATE.selected);
        for (const h of handles) {
          const dx = e.clientX - (mainCanvas.getBoundingClientRect().left + h.sx);
          const dy = e.clientY - (mainCanvas.getBoundingClientRect().top  + h.sy);
          if (Math.hypot(dx, dy) <= 10) {   // 10px 이내 히트
            const tgt = STATE.selected;
            if (tgt.type === 'rope') {
              // 실 앵커 재연결 모드
              _ropeRewireMode = { rope: tgt, side: h.type };
              STATE.interactionMode = 'ROPE_REWIRE';
            } else {
              _resizeHandle = { type: h.type, target: tgt };
              STATE.interactionMode = 'RESIZING';
            }
            return;
          }
        }
      }

      // ② 레이어 순환: 같은 위치 반복 클릭 시 다음 요소 선택
      const allHits = _hitAllAtWorld(world.x, world.y);
      let elHit = null;
      if (allHits.length > 0) {
        const SAME_R = CONFIG.cellSize * 1.5;
        const isSamePos = _lastClickPos &&
          Math.hypot(world.x - _lastClickPos.x, world.y - _lastClickPos.y) < SAME_R;
        if (isSamePos && allHits.length > 1) {
          _layerCycleIdx = (_layerCycleIdx + 1) % allHits.length;
        } else {
          _layerCycleIdx = 0;
        }
        _lastClickPos = { x: world.x, y: world.y };
        elHit = allHits[_layerCycleIdx];
      } else {
        _lastClickPos = null;
        _layerCycleIdx = 0;
      }

      if (elHit) {
        // 더블탭
        const now = Date.now();
        if (now - _lastTapTime < 300 && _lastTapEl === elHit) {
          _handleDoubleTap(elHit);
          _lastTapTime = 0;
          _lastTapEl   = null;
          return;
        }
        _lastTapTime = now;
        _lastTapEl   = elHit;
        _selectObject(elHit);

        // 롱프레스 타이머 시작
        _longPressEl = elHit;
        _longPressTimer = setTimeout(() => {
          _deleteZoneVis = true;
          _longPressEl   = elHit;
        }, CONFIG.LONG_PRESS_MS);
        // dragOffset: 클릭 위치 - 요소 좌상단 월드 좌표
        if (!elHit.getBBox) return;   // getBBox 없는 요소(FloorSeg 등)는 드래그 불가
        const box = elHit.getBBox();
        STATE.dragOffset.x = world.x - box.x;
        STATE.dragOffset.y = world.y - box.y;
        _dragEl = elHit;
        STATE.interactionMode = 'DRAGGING';
        return;
      }

      // ② FloorSegment 히트 → 선택
      const segHit = hitTestFloorSegment(world.x, world.y);
      if (segHit) {
        _selectObject(segHit);
        return;
      }

      // ③ Rope 히트 → 선택
      const ropeHit = hitTestRope(world.x, world.y);
      if (ropeHit) {
        _selectObject(ropeHit);
        return;
      }

      // ④ 빈 공간 → 선택 해제 + PANNING
      _selectObject(null);
      STATE.interactionMode = 'PANNING';
      _panStart = {
        screenX: e.clientX,
        screenY: e.clientY,
        offsetX: VIEWPORT.offsetX,
        offsetY: VIEWPORT.offsetY,
      };
    }

    // ── FLOOR_DRAW 모드 ──
    if (STATE.activePointers.size === 1 && STATE.interactionMode === 'FLOOR_DRAW') {
      const world = screenToWorld(e.offsetX, e.offsetY);
      const gp    = hitTestGridPoint(world.x, world.y);
      if (!gp) return;

      if (!STATE.pendingGridPoint) {
        STATE.pendingGridPoint = { gridX: gp.gridX, gridY: gp.gridY };
        drawGrid();
      } else {
        const px = STATE.pendingGridPoint.gridX;
        const py = STATE.pendingGridPoint.gridY;
        if (gp.gridX === px && gp.gridY === py) {
          STATE.pendingGridPoint = null;
          drawGrid();
        } else {
          const seg = new FloorSegment(px, py, gp.gridX, gp.gridY);
          STATE.floorSegments.push(seg);
          STATE.pendingGridPoint = null;
          drawGrid();
          validateAll();
        }
      }
    }

    // ── ROPE_DRAW 모드 ──
    if (STATE.activePointers.size === 1 && STATE.interactionMode === 'ROPE_DRAW') {
      const world = screenToWorld(e.offsetX, e.offsetY);
      const ap    = hitTestAttachPoint(world.x, world.y);

      if (!ap) {
        // 빈 공간 클릭 → pending 초기화
        STATE.pendingRopeAnchor = null;
        STATE._ropePreviewWorld = null;
        return;
      }

      if (!STATE.pendingRopeAnchor) {
        // 첫 번째 앵커 저장
        STATE.pendingRopeAnchor = { elementId: ap.elementId, attachPoint: ap.attachPoint };
        STATE._ropePreviewWorld = { x: world.x, y: world.y };
        return;
      }

      const pA = STATE.pendingRopeAnchor;

      // 같은 앵커 포인트 재클릭 → 취소
      if (pA.elementId === ap.elementId && pA.attachPoint === ap.attachPoint) {
        STATE.pendingRopeAnchor = null;
        STATE._ropePreviewWorld = null;
        return;
      }

      // 같은 물체(element)의 다른 앵커 → 불가
      if (pA.elementId === ap.elementId) {
        _showToast('같은 물체의 앵커끼리는 실로 연결할 수 없습니다.');
        return;
      }

      // 양쪽 앵커의 월드 좌표 resolve (Element & FloorSegment 통합)
      const wA = _resolveAnchorWorld(pA);
      const wB = _resolveAnchorWorld(ap);

      if (!wA || !wB) {
        STATE.pendingRopeAnchor = null;
        STATE._ropePreviewWorld = null;
        return;
      }

      // Rope 생성
      const dist        = Math.hypot(wB.x - wA.x, wB.y - wA.y);
      const ropeLengthM = dist / CONFIG.cellSize;

      const rope = new Rope(
        { elementId: pA.elementId, attachPoint: pA.attachPoint },
        { elementId: ap.elementId, attachPoint: ap.attachPoint },
        ropeLengthM
      );
      STATE.ropes.push(rope);

      // Pulley.connectedRopeIds 갱신
      [pA.elementId, ap.elementId].forEach(eid => {
        const el = STATE.elements.find(e => e.id === eid);
        if (el && el.type === 'pulley') {
          if (!el.connectedRopeIds.includes(rope.id)) {
            el.connectedRopeIds.push(rope.id);
          }
        }
      });

      STATE.pendingRopeAnchor = null;
      STATE._ropePreviewWorld = null;
      validateAll();
    }
  });

  /* ── pointermove ── */
  mainCanvas.addEventListener('pointermove', (e) => {
    STATE.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 2포인터 핀치 줌
    if (STATE.activePointers.size === 2) {
      const currDist = getPinchDist();
      if (STATE.prevPinchDist === null || STATE.prevPinchDist === 0) {
        STATE.prevPinchDist = currDist;
        return;
      }
      const factor = currDist / STATE.prevPinchDist;
      STATE.prevPinchDist = currDist;

      const pointers    = [...STATE.activePointers.values()];
      const pivotScreenX = (pointers[0].x + pointers[1].x) / 2;
      const pivotScreenY = (pointers[0].y + pointers[1].y) / 2;
      const rect   = mainCanvas.getBoundingClientRect();
      const pivotSX = pivotScreenX - rect.left;
      const pivotSY = pivotScreenY - rect.top;
      const pivot   = screenToWorld(pivotSX, pivotSY);

      const newScale    = clamp(VIEWPORT.scale * factor, VIEWPORT.minScale, VIEWPORT.maxScale);
      VIEWPORT.offsetX  = pivotSX - pivot.x * newScale;
      VIEWPORT.offsetY  = pivotSY - pivot.y * newScale;
      VIEWPORT.scale    = newScale;
      drawGrid();
      return;
    }

    // 롱프레스 취소 (손가락이 움직이면 취소)
    if (_longPressTimer) {
      const p0 = STATE.activePointers.get(e.pointerId);
      if (p0 && Math.hypot(e.clientX-p0.x, e.clientY-p0.y) > 8) {
        clearTimeout(_longPressTimer); _longPressTimer = null;
      }
    }

    // ROPE_REWIRE: 드래그 중 아무것도 안 해도 됨 (렌더에서 앵커 점 표시)
    if (STATE.interactionMode === 'ROPE_REWIRE') return;

    // RESIZING: 핸들 드래그로 크기 조절
    if (STATE.interactionMode === 'RESIZING' && _resizeHandle) {
      const world = screenToWorld(e.offsetX, e.offsetY);
      const cs  = CONFIG.cellSize;
      const GS  = CONFIG.GRID_SIZE;
      const tgt = _resizeHandle.target;
      const ht  = _resizeHandle.type;
      const gx  = Math.round(world.x / cs);  // 격자 좌표
      const gy  = Math.round(world.y / cs);

      if (tgt.type === 'floorSegment' || tgt.type === 'rope') {
        // FloorSegment / Rope: 끝점 이동
        if (tgt.type === 'floorSegment') {
          if (ht === 'p1') { tgt.x1 = clamp(gx,0,GS); tgt.y1 = clamp(gy,0,GS); }
          else             { tgt.x2 = clamp(gx,0,GS); tgt.y2 = clamp(gy,0,GS); }
          validateAll();
        }
        // Rope의 경우 앵커는 element에 붙어 있어 직접 이동 불가 → 무시
      } else if (tgt.type === 'spring') {
        if (ht === 'right') {
          // 가로: 너비만 조절
          const newW = clamp(Math.round(gx - tgt.gridX), 1, GS - tgt.gridX);
          tgt.gridW  = newW;
          validateAll();
        } else if (ht === 'bottom') {
          // 세로: 높이만 조절
          const newH = clamp(Math.round(gy - tgt.gridY), 1, GS - tgt.gridY);
          tgt.gridH  = newH;
          validateAll();
        }
      } else if (tgt.type === 'circle' || tgt.type === 'pulley') {
        // 정사각형 유지: 가로 세로 중 더 큰 값으로 동일하게
        const newW = clamp(Math.round(gx - tgt.gridX), 1, GS - tgt.gridX);
        const newH = clamp(Math.round(gy - tgt.gridY), 1, GS - tgt.gridY);
        const size = Math.max(newW, newH);
        tgt.gridW  = size;
        tgt.gridH  = size;
        if (tgt.type === 'pulley') syncPulleyPhys();
        validateAll();
      } else {
        // rect, forceZone: 자유 크기
        tgt.gridW = clamp(Math.round(gx - tgt.gridX), 1, GS - tgt.gridX);
        tgt.gridH = clamp(Math.round(gy - tgt.gridY), 1, GS - tgt.gridY);
        validateAll();
      }
      renderPanel();
      return;
    }

    // 드래그: 요소 격자 스냅 이동 (바닥면 스냅 포함)
    if (STATE.interactionMode === 'DRAGGING' && _dragEl) {
      const world = screenToWorld(e.offsetX, e.offsetY);
      const cs    = CONFIG.cellSize;
      const GS    = CONFIG.GRID_SIZE;

      // ── 바닥면 스냅 (rect·circle·forceZone 대상) ──
      if (['rect','circle','forceZone'].includes(_dragEl.type)) {
        const snap = _computeFloorSnap(_dragEl, world.x, world.y);
        if (snap.snapped) {
          // 마우스 위치를 바닥면에 투영하여 평행 방향 슬라이드
          const { seg, nx, ny, rotRad } = snap;
          const x1 = seg.x1*cs, y1 = seg.y1*cs;
          const x2 = seg.x2*cs, y2 = seg.y2*cs;
          const { fx, fy } = _distPointToSeg(world.x, world.y, x1, y1, x2, y2);
          const hh = _dragEl.gridH / 2, hw = _dragEl.gridW / 2;
          // 스냅 중심 위치 = 발 + 법선방향 * 반높이
          const snapCX = fx + nx * hh * cs;
          const snapCY = fy + ny * hh * cs;
          _dragEl.gridX = clamp(snapCX/cs - hw, 0, GS - _dragEl.gridW);
          _dragEl.gridY = clamp(snapCY/cs - hh, 0, GS - _dragEl.gridH);
          _dragEl._snapRotation = rotRad;   // 바닥면 각도로 회전
          if (_dragEl.type === 'pulley') syncPulleyPhys();
          validateAll();
          return;
        }
      }

      // ── 일반 드래그 (스냅 해제) ──
      if (_dragEl._snapRotation !== null) _dragEl._snapRotation = null;

      const newWX = world.x - STATE.dragOffset.x;
      const newWY = world.y - STATE.dragOffset.y;
      const newGX = clamp(snapToGridIndex(newWX / cs * cs), 0, GS - _dragEl.gridW);
      const newGY = clamp(snapToGridIndex(newWY / cs * cs), 0, GS - _dragEl.gridH);
      _dragEl.gridX = newGX;
      _dragEl.gridY = newGY;
      if (_dragEl.type === 'pulley') syncPulleyPhys();
      validateAll();
      return;
    }

    // ROPE_DRAW: 커서 위치 갱신 (예비 실선 렌더용)
    if (STATE.interactionMode === 'ROPE_DRAW' && STATE.pendingRopeAnchor) {
      const world = screenToWorld(e.offsetX, e.offsetY);
      STATE._ropePreviewWorld = { x: world.x, y: world.y };
    }

    // 팬
    if (STATE.interactionMode === 'PANNING' && _panStart) {
      VIEWPORT.offsetX = _panStart.offsetX + (e.clientX - _panStart.screenX);
      VIEWPORT.offsetY = _panStart.offsetY + (e.clientY - _panStart.screenY);
      drawGrid();
    }
  });

  /* ── pointerup / pointercancel ── */
  function onPointerEnd(e) {
    STATE.activePointers.delete(e.pointerId);

    if (STATE.activePointers.size < 2) STATE.prevPinchDist = null;

    if (STATE.activePointers.size === 0) {
      // 롱프레스 타이머 취소
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }

      // 삭제 존 드롭 처리
      if (_deleteZoneVis) {
        if (_isOnDeleteZone(e.offsetX, e.offsetY) && _longPressEl) {
          _deleteSelected(_longPressEl);
        }
        _deleteZoneVis = false;
        _longPressEl   = null;
      }

      if (STATE.interactionMode === 'DRAGGING') { _dragEl = null; }
      if (STATE.interactionMode === 'RESIZING') { _resizeHandle = null; }

      // 실 재연결 모드 종료: 앵커에 스냅
      if (_ropeRewireMode) {
        const world = screenToWorld(e.offsetX, e.offsetY);
        _finishRopeRewire(world.x, world.y);
      }

      if (['PANNING','DRAGGING','RESIZING','ROPE_REWIRE'].includes(STATE.interactionMode)) {
        STATE.interactionMode = 'IDLE';
      }
      _panStart = null;
    }
  }
  mainCanvas.addEventListener('pointerup',     onPointerEnd);
  mainCanvas.addEventListener('pointercancel', onPointerEnd);

  /* ── 데스크톱 마우스 휠 줌 ── */
  mainCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor  = e.deltaY < 0 ? 1.1 : 0.9;
    const pivot   = screenToWorld(e.offsetX, e.offsetY);
    const newScale = clamp(VIEWPORT.scale * factor, VIEWPORT.minScale, VIEWPORT.maxScale);
    VIEWPORT.offsetX = e.offsetX - pivot.x * newScale;
    VIEWPORT.offsetY = e.offsetY - pivot.y * newScale;
    VIEWPORT.scale   = newScale;
    drawGrid();
  }, { passive: false });

  /* ── 핀치 거리 계산 헬퍼 ── */
  function getPinchDist() {
    const pts = [...STATE.activePointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  /* 캔버스 기본 터치 스크롤 차단 */
  mainCanvas.style.touchAction = 'none';
  gridCanvas.style.touchAction = 'none';

  /* ── ESC: 모드 초기화 ── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      STATE.interactionMode   = 'IDLE';
      STATE.pendingGridPoint  = null;
      STATE.pendingRopeAnchor = null;
      STATE._ropePreviewWorld = null;
      _dragEl = null;
      document.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active-mode'));
      drawGrid();
    }
  });

  /* ── 선택 오브젝트 설정 + 패널 표시/숨김 ── */
  function _selectObject(obj) {
    STATE.selected = obj;
    renderPanel();
  }
