/* ============================================================
   render.js — rAF 렌더 루프 + 씬/요소/오버레이 드로잉
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [RENDER LOOP] — rAF 기반 렌더링
  ================================================================ */

  let _rafId = null;
  let _lastTs = 0;

  function renderLoop(ts = 0) {
    _rafId = requestAnimationFrame(renderLoop);

    const elapsed = ts - _lastTs;
    if (elapsed < 14 && _lastTs !== 0) return;
    _lastTs = ts;

    if (STATE.simMode === 'RUNNING') {
      const rawDt = Math.min(elapsed / 1000, CONFIG.MAX_DT);
      simStep(rawDt);
    }
    drawScene();
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

    // RUNNING 모드 표시
    if (STATE.simMode === 'RUNNING' || STATE.simMode === 'PAUSED') {
      ctx.fillStyle = STATE.simMode === 'RUNNING' ? 'rgba(16,185,129,0.18)' : 'rgba(251,191,36,0.12)';
      ctx.fillRect(0, 0, 4, H);
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
      if (!['rect', 'circle', 'pulley'].includes(el.type)) continue;
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

    // ── FloorSegment 끝점 앵커 (다이아몬드, 더 크게) ──
    for (const seg of STATE.floorSegments) {
      const pts = getFloorSegAttachPoints(seg);
      for (const pt of pts) {
        const isPending = (
          STATE.pendingRopeAnchor &&
          STATE.pendingRopeAnchor.elementId  === seg.id &&
          STATE.pendingRopeAnchor.attachPoint === pt.id
        );
        const pr = isPending ? r * 1.4 : r;   // pending 시 더 크게

        ctx.save();
        ctx.fillStyle   = isPending ? '#3b82f6' : '#94a3b8';
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

        // "고정" 레이블
        ctx.fillStyle    = isPending ? '#dbeafe' : '#e2e8f0';
        ctx.font         = `${7 / s}px 'Courier New', monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('고정', pt.worldX, pt.worldY - pr - 1 / s);
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

  /** FloorSegment 끝점 고정 핀 렌더 (소형 회색 다이아몬드) */
  function _drawFloorPins(ctx) {
    const s = VIEWPORT.scale;
    const r = 3.5 / s;
    for (const seg of STATE.floorSegments) {
      const pts = getFloorSegAttachPoints(seg);
      for (const pt of pts) {
        ctx.save();
        ctx.fillStyle   = 'rgba(148,163,184,0.55)';   // slate-400
        ctx.strokeStyle = 'rgba(100,116,139,0.8)';
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
