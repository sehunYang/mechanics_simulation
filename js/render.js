/* ============================================================
   render.js — rAF 렌더 루프 + 씬/요소/오버레이 드로잉
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [RENDER LOOP] — rAF 기반 렌더링
  ================================================================ */

  let _rafId = null;
  let _lastTs = 0;
  let _dtAccumulator = 0;   // 고정 dt 누산기 (배속 결정성 보장)

  function renderLoop(ts = 0) {
    _rafId = requestAnimationFrame(renderLoop);

    const elapsed = ts - _lastTs;
    if (elapsed < 14 && _lastTs !== 0) return;
    _lastTs = ts;

    btnSpeed.style.display = STATE.simMode === 'RUNNING' ? '' : 'none';

    // 실행취소/다시실행 바: EDIT 모드에서만 표시
    const _urBar = document.getElementById('undo-redo');
    if (_urBar) _urBar.style.display = (STATE.simMode === 'EDIT') ? 'flex' : 'none';

    if (STATE.simMode === 'RUNNING') {
      // MAX_DT는 스텝 크기가 아니라 "실제 경과시간" 배출 상한(spiral-of-death 가드)로만 사용.
      // 배속(speedMultiplier)은 상한 적용 후 곱해, 100배에서도 캡 없이 FIXED_DT 스텝을 여러 번 실행.
      const cappedRealDt = Math.min(elapsed / 1000, CONFIG.MAX_DT);
      _dtAccumulator += cappedRealDt * STATE.speedMultiplier;
      while (_dtAccumulator >= CONFIG.FIXED_DT) {
        simStep(CONFIG.FIXED_DT);
        STATE.simTime += CONFIG.FIXED_DT;
        _dtAccumulator -= CONFIG.FIXED_DT;
      }
    } else {
      _dtAccumulator = 0;   // EDIT/PAUSED 중엔 누산 부채가 쌓이지 않도록 리셋
    }

    _updateRunIndicator();
    drawScene();
  }

  /** 실행 상태 배지 갱신 — 실행 중임을 한눈에 알 수 있게 */
  function _updateRunIndicator() {
    const running = STATE.simMode === 'RUNNING';
    const paused  = STATE.simMode === 'PAUSED';
    if (!running && !paused) {
      if (runIndicator.style.display !== 'none') runIndicator.style.display = 'none';
      return;
    }
    runIndicator.style.display = 'flex';
    runIndicator.classList.toggle('is-running', running);
    runIndicator.classList.toggle('is-paused',  paused);

    const label = running
      ? (STATE.speedMultiplier > 1 ? `실행 중 ${STATE.speedMultiplier}x` : '실행 중')
      : '일시정지';
    if (riLabel.textContent !== label) riLabel.textContent = label;
    riTime.textContent = STATE.simTime.toFixed(2) + 's';
  }

  /** mainCanvas에 모든 요소 렌더 */
  function drawScene() {
    const ctx = mainCtx;
    const W = mainCanvas.width;
    const H = mainCanvas.height;

    ctx.clearRect(0, 0, W, H);
    applyViewport(ctx);

    drawElements(ctx);

    // ROPE_DRAW 모드: 앵커 포인트 오버레이
    if (STATE.interactionMode === 'ROPE_DRAW') {
      drawAttachPoints(ctx);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 줌 인디케이터 갱신
    zoomIndicator.textContent = Math.round(VIEWPORT.scale * 100) + '%';

    // RUNNING/PAUSED 표시 — 캔버스 가장자리 전체를 테두리로 감싸 상태를 알림
    // (예전엔 왼쪽 4px 띠만 그려서 눈에 잘 띄지 않았다)
    if (STATE.simMode === 'RUNNING' || STATE.simMode === 'PAUSED') {
      ctx.save();
      ctx.strokeStyle = STATE.simMode === 'RUNNING'
        ? 'rgba(5,150,105,0.75)'
        : 'rgba(217,119,6,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
      ctx.restore();
    }
  }

  /**
   * ROPE_DRAW 모드 전용: 모든 RectBody/CircleBody/Pulley 앵커 포인트 렌더
   * 반지름 6/scale, fill '#f59e0b', stroke '#fff' 1/scale
   * pendingRopeAnchor 해당 포인트: fill '#3b82f6'
   * pendingRopeAnchor → 현재 커서 예비 실선 렌더
   */
  function drawAttachPoints(ctx) {
    const s = VIEWPORT.scale;
    const r = 6 / s;

    // ── Element 앵커 포인트 (원형) ──
    for (const el of STATE.elements) {
      if (!['rect', 'circle', 'pulley', 'extforce'].includes(el.type)) continue;
      const pts = getAttachPoints(el);
      for (const pt of pts) {
        const isPending = (
          STATE.pendingRopeAnchor &&
          STATE.pendingRopeAnchor.elementId  === el.id &&
          STATE.pendingRopeAnchor.attachPoint === pt.id
        );
        ctx.save();
        ctx.fillStyle   = isPending ? '#3b82f6' : '#f59e0b';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1 / s;
        ctx.beginPath();
        ctx.arc(pt.worldX, pt.worldY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── FloorSegment 앵커 — 경로를 따라 0.5칸마다 ──
    //   개수가 많으므로 중간 앵커는 작은 점, 끝점만 다이아몬드 + '고정' 글자.
    //   화면 밖은 건너뛰고, 너무 촘촘하면(줌 아웃) 중간 앵커는 생략한다.
    const W = mainCanvas.width, H = mainCanvas.height;
    for (const seg of STATE.floorSegments) {
      const pts = getFloorSegAttachPoints(seg);
      const stepPx = (CONFIG.FLOOR_ANCHOR_STEP || 0.5) * CONFIG.cellSize * s;
      const showMid = stepPx >= 7;   // 화면상 간격이 7px 이상일 때만 중간 앵커 표시

      for (const pt of pts) {
        const isPending = (
          STATE.pendingRopeAnchor &&
          STATE.pendingRopeAnchor.elementId  === seg.id &&
          STATE.pendingRopeAnchor.attachPoint === pt.id
        );
        if (!pt.isEnd && !showMid && !isPending) continue;

        const sc = worldToScreen(pt.worldX, pt.worldY);
        if (sc.x < -20 || sc.y < -20 || sc.x > W + 20 || sc.y > H + 20) continue;

        if (!pt.isEnd && !isPending) {
          // 중간 앵커: 작은 원점
          ctx.save();
          ctx.fillStyle   = 'rgba(37,99,235,0.55)';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = 1 / s;
          ctx.beginPath();
          ctx.arc(pt.worldX, pt.worldY, 3 / s, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          continue;
        }

        const pr = isPending ? r * 1.4 : r;   // pending 시 더 크게
        ctx.save();
        ctx.fillStyle   = isPending ? '#2563eb' : '#94a3b8';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5 / s;
        ctx.beginPath();
        ctx.moveTo(pt.worldX,      pt.worldY - pr);
        ctx.lineTo(pt.worldX + pr, pt.worldY);
        ctx.lineTo(pt.worldX,      pt.worldY + pr);
        ctx.lineTo(pt.worldX - pr, pt.worldY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (pt.isEnd || isPending) {
          ctx.fillStyle    = isPending ? '#1d4ed8' : '#334155';
          ctx.font         = `${9 / s}px ${SN.fontKo}`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('고정', pt.worldX, pt.worldY - pr - 1 / s);
        }
        ctx.restore();
      }
    }

    // ── 예비 실선 ──
    if (STATE.pendingRopeAnchor && STATE._ropePreviewWorld) {
      // 앵커 월드 좌표 resolve (Element & FloorSegment 모두)
      let aWorld = null;
      const pA = STATE.pendingRopeAnchor;
      const anchorEl  = STATE.elements.find(e => e.id === pA.elementId);
      const anchorSeg = STATE.floorSegments.find(s => s.id === pA.elementId);
      if (anchorEl)  aWorld = getAttachPointWorld(anchorEl, pA.attachPoint);
      if (anchorSeg) aWorld = getFloorSegAttachWorld(anchorSeg, pA.attachPoint);

      if (aWorld) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245,158,11,0.5)';
        ctx.lineWidth   = 1.5 / s;
        ctx.setLineDash([4 / s, 4 / s]);
        ctx.beginPath();
        ctx.moveTo(aWorld.x, aWorld.y);
        ctx.lineTo(STATE._ropePreviewWorld.x, STATE._ropePreviewWorld.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  /** elements, floorSegments, ropes 렌더 */
  function drawElements(ctx) {
    for (const el of STATE.elements) {
      if (el.type === 'forceZone' && el.draw) el.draw(ctx);
    }
    for (const seg of STATE.floorSegments) {
      if (seg.draw) seg.draw(ctx);
    }
    // FloorSegment 끝점 고정 핀 — 항상 표시 (ROPE_DRAW 아닐 때도)
    if (STATE.interactionMode !== 'ROPE_DRAW') {
      _drawFloorPins(ctx);
    }
    _drawTrails(ctx);   // 궤적은 실·물체 아래에 깔아 가리지 않게
    for (const rope of STATE.ropes) {
      if (rope.draw) rope.draw(ctx);
    }
    for (const el of STATE.elements) {
      if (el.type !== 'forceZone' && el.draw) el.draw(ctx);
    }
    if (STATE.selected && STATE.selected.drawSelection) {
      STATE.selected.drawSelection(ctx);
    }
    _drawResizeHandles(ctx);    // 핸들 점 (선택 요소 위에)
    _drawDeleteZone(ctx);       // 삭제 존 (롱프레스 시)
    _drawRopeWireAnchors(ctx);  // 실 재연결 앵커 포인트
  }

  /**
   * 물체 궤적 렌더 — showTrail 이 켜진 물체만.
   * 기록은 항상 되고 있으므로(physics.recordTrails) 토글은 순수 표시 전환이다.
   * 좌표는 격자 칸 단위라 cellSize 를 곱해 월드로 옮긴다.
   * 점 수가 많아 Path2D 캐시(같은 d 재사용)가 의미 없으므로 직접 그린다.
   */
  function _drawTrails(ctx) {
    const cs = CONFIG.cellSize;
    const s  = VIEWPORT.scale;
    for (const el of STATE.elements) {
      if (!el.showTrail || !el._trail || el._trail.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.lineWidth   = 1.2 / s;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.setLineDash([5 / s, 4 / s]);
      ctx.beginPath();
      ctx.moveTo(el._trail[0].x * cs, el._trail[0].y * cs);
      for (let i = 1; i < el._trail.length; i++) {
        ctx.lineTo(el._trail[i].x * cs, el._trail[i].y * cs);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /** FloorSegment 끝점 고정 핀 렌더 (소형 회색 다이아몬드)
   *  평상시에는 **끝점만** 표시한다 — 0.5칸 앵커까지 항상 그리면
   *  지면이 점으로 뒤덮인다. 중간 앵커는 ROPE_DRAW 모드에서만 보인다. */
  function _drawFloorPins(ctx) {
    const s = VIEWPORT.scale;
    const r = 3.5 / s;
    for (const seg of STATE.floorSegments) {
      const pts = getFloorSegAttachPoints(seg).filter(p => p.isEnd);
      for (const pt of pts) {
        ctx.save();
        ctx.fillStyle   = 'rgba(0,0,0,0.35)';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth   = 1 / s;
        ctx.beginPath();
        ctx.moveTo(pt.worldX,     pt.worldY - r);
        ctx.lineTo(pt.worldX + r, pt.worldY);
        ctx.lineTo(pt.worldX,     pt.worldY + r);
        ctx.lineTo(pt.worldX - r, pt.worldY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }
