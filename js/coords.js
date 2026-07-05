/* ============================================================
   coords.js — 좌표 변환 유틸 (월드/화면/물리/격자) + 기하 헬퍼
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [VIEWPORT UTILS] — 좌표 변환
  ================================================================ */

  /** 월드 픽셀 → 화면 픽셀 */
  function worldToScreen(wx, wy) {
    return {
      x: wx * VIEWPORT.scale + VIEWPORT.offsetX,
      y: wy * VIEWPORT.scale + VIEWPORT.offsetY,
    };
  }

  /** 화면 픽셀 → 월드 픽셀 */
  function screenToWorld(sx, sy) {
    return {
      x: (sx - VIEWPORT.offsetX) / VIEWPORT.scale,
      y: (sy - VIEWPORT.offsetY) / VIEWPORT.scale,
    };
  }

  /** ctx에 뷰포트 변환 행렬 적용 */
  function applyViewport(ctx) {
    ctx.setTransform(
      VIEWPORT.scale, 0,
      0, VIEWPORT.scale,
      VIEWPORT.offsetX, VIEWPORT.offsetY
    );
  }

  /** 물리 좌표(m) → 월드 픽셀 좌표 (y 반전) */
  function physToWorld(physX, physY) {
    return {
      x: physX * CONFIG.cellSize,
      y: (CONFIG.GRID_SIZE - physY) * CONFIG.cellSize,
    };
  }

  /** 월드 픽셀 → 물리 좌표(m) */
  function worldToPhys(worldX, worldY) {
    return {
      x: worldX / CONFIG.cellSize,
      y: CONFIG.GRID_SIZE - (worldY / CONFIG.cellSize),
    };
  }

  /** 월드 픽셀값 → 가장 가까운 격자 픽셀 좌표 */
  function snapToGrid(worldVal) {
    return Math.round(worldVal / CONFIG.cellSize) * CONFIG.cellSize;
  }

  /** 월드 픽셀값 → 격자 인덱스 (0–99) */
  function snapToGridIndex(worldVal) {
    return Math.round(worldVal / CONFIG.cellSize);
  }

  /** 격자 인덱스 → 월드 픽셀 */
  function gridToWorld(index) {
    return index * CONFIG.cellSize;
  }

  /** 범위 클램프 */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /** 점 (px,py) → 선분 (ax,ay)-(bx,by) 최근접 거리 */
  function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return Math.hypot(px - ax, py - ay);
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
