/* ============================================================
   hit-test.js — 5종 히트 테스트 (요소/바닥/실/격자점/앵커)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ──────────────────────────────────────────────────────────────
     [HIT TESTS] — 5종 히트 테스트
  ────────────────────────────────────────────────────────────── */

  /** Element bbox 판정 (역순 순회) */
  function hitTestElement(worldX, worldY) {
    for (let i = STATE.elements.length - 1; i >= 0; i--) {
      const el  = STATE.elements[i];
      if (!el.getBBox) continue;
      const box = el.getBBox();
      if (worldX >= box.x && worldX <= box.x + box.w &&
          worldY >= box.y && worldY <= box.y + box.h) {
        return el;
      }
    }
    return null;
  }

  /** FloorSegment 선 근접 판정 (threshold: 8/scale px) */
  function hitTestFloorSegment(worldX, worldY) {
    const thresh = 8 / VIEWPORT.scale;
    const cs = CONFIG.cellSize;

    for (let i = STATE.floorSegments.length - 1; i >= 0; i--) {
      const seg = STATE.floorSegments[i];
      const ax = seg.x1 * cs, ay = seg.y1 * cs;
      const bx = seg.x2 * cs, by = seg.y2 * cs;

      let dist = Infinity;
      switch (seg.pathType) {
        case 'LINE':
          dist = pointToSegmentDist(worldX, worldY, ax, ay, bx, by);
          break;
        case 'ELBOW_H': {
          const mx = bx, my = ay;
          dist = Math.min(
            pointToSegmentDist(worldX, worldY, ax, ay, mx, my),
            pointToSegmentDist(worldX, worldY, mx, my, bx, by)
          );
          break;
        }
        case 'ELBOW_V': {
          const mx = ax, my = by;
          dist = Math.min(
            pointToSegmentDist(worldX, worldY, ax, ay, mx, my),
            pointToSegmentDist(worldX, worldY, mx, my, bx, by)
          );
          break;
        }
        case 'ARC_UP':
        case 'ARC_DOWN': {
          // 원호를 20개 점으로 근사
          const pts = _arcSamplePoints(seg, ax, ay, bx, by, 20);
          for (let k = 0; k < pts.length - 1; k++) {
            dist = Math.min(dist,
              pointToSegmentDist(worldX, worldY,
                pts[k].x, pts[k].y, pts[k+1].x, pts[k+1].y));
          }
          break;
        }
      }
      if (dist < thresh) return seg;
    }
    return null;
  }

  /** ARC 경로를 n개 점으로 샘플링 */
  function _arcSamplePoints(seg, ax, ay, bx, by, n) {
    const dx = bx - ax, dy = by - ay;
    const d  = Math.hypot(dx, dy);
    if (d < 1e-6) return [];
    const { R: R_px, theta, h } = _arcRadiusFromCurvature(seg.curvature, d);

    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const ux = dx / d, uy = dy / d;
    const nx = -uy, ny = ux;

    let cX, cY;
    if (seg.pathType === 'ARC_UP') { cX = mx + nx * h; cY = my + ny * h; }
    else                           { cX = mx - nx * h; cY = my - ny * h; }

    const sa = Math.atan2(ay - cY, ax - cX);
    const ea = Math.atan2(by - cY, bx - cX);
    let diff = ea - sa;
    while (diff >  Math.PI) diff -= 2*Math.PI;
    while (diff < -Math.PI) diff += 2*Math.PI;
    const shortSign = Math.sign(diff) || 1;
    // θ≤π: 짧은 호 그대로 / θ>π: 반대 방향으로 돌아 긴 호(major arc) 사용
    const sweepSign = (theta <= Math.PI) ? shortSign : -shortSign;
    const sweep = sweepSign * theta;

    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = sa + sweep * t;
      pts.push({ x: cX + R_px * Math.cos(a), y: cY + R_px * Math.sin(a) });
    }
    return pts;
  }

  /** Rope 선 근접 판정 (threshold: 6/scale px) */
  function hitTestRope(worldX, worldY) {
    const thresh = 6 / VIEWPORT.scale;
    for (let i = STATE.ropes.length - 1; i >= 0; i--) {
      const rope = STATE.ropes[i];
      const wA   = rope._getAnchorWorld(rope.anchorA);
      const wB   = rope._getAnchorWorld(rope.anchorB);
      if (!wA || !wB) continue;
      if (pointToSegmentDist(worldX, worldY, wA.x, wA.y, wB.x, wB.y) < thresh) {
        return rope;
      }
    }
    return null;
  }

  /** 격자 점 근접 판정 → {gridX, gridY} | null (10/scale px) */
  function hitTestGridPoint(worldX, worldY) {
    const thresh = 10 / VIEWPORT.scale;
    const cs = CONFIG.cellSize;
    const GS = CONFIG.GRID_SIZE;
    const gi = snapToGridIndex(worldX);
    const gj = snapToGridIndex(worldY);
    const ci = clamp(gi, 0, GS);
    const cj = clamp(gj, 0, GS);
    const wx = ci * cs, wy = cj * cs;
    if (Math.hypot(worldX - wx, worldY - wy) < thresh) {
      return { gridX: ci, gridY: cj };
    }
    return null;
  }

  /** 앵커 포인트 근접 판정 → {elementId, attachPoint} | null (10/scale px) */
  function hitTestAttachPoint(worldX, worldY) {
    const thresh = 10 / VIEWPORT.scale;
    // Element 앵커 포인트: thresh 이내 후보를 모두 모은 뒤,
    // 도르래 테두리(top/bottom/left/right)가 있으면 그것을 우선시 (ExtForce center와의 겹침 타이브레이크)
    const rimAttachPoints = new Set(['top', 'bottom', 'left', 'right']);
    let firstMatch = null;
    let pulleyRimMatch = null;
    for (const el of STATE.elements) {
      if (!['rect','circle','pulley','extforce'].includes(el.type)) continue;
      for (const pt of getAttachPoints(el)) {
        if (Math.hypot(worldX - pt.worldX, worldY - pt.worldY) < thresh) {
          const match = { elementId: el.id, attachPoint: pt.id };
          if (!firstMatch) firstMatch = match;
          if (!pulleyRimMatch && el.type === 'pulley' && rimAttachPoints.has(pt.id)) {
            pulleyRimMatch = match;
          }
        }
      }
    }
    if (pulleyRimMatch) return pulleyRimMatch;
    if (firstMatch) return firstMatch;
    // FloorSegment 끝점 앵커
    for (const seg of STATE.floorSegments) {
      for (const pt of getFloorSegAttachPoints(seg)) {
        if (Math.hypot(worldX - pt.worldX, worldY - pt.worldY) < thresh) {
          return { elementId: seg.id, attachPoint: pt.id };
        }
      }
    }
    return null;
  }

  /**
   * anchor { elementId, attachPoint } 의 월드 좌표를
   * Element와 FloorSegment 모두에서 찾아 반환
   */
  function _resolveAnchorWorld(anchor) {
    const el = STATE.elements.find(e => e.id === anchor.elementId);
    if (el) return getAttachPointWorld(el, anchor.attachPoint);
    const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
    if (seg) return getFloorSegAttachWorld(seg, anchor.attachPoint);
    return null;
  }

  /** 토스트 메시지 (2초 표시 후 validateAll로 복구) */
  let _toastTimer = null;
  function _showToast(msg) {
    warningBar.textContent   = msg;
    warningBar.style.display = 'block';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { validateAll(); }, 2000);
  }
