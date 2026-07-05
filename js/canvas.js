/* ============================================================
   canvas.js — 캔버스 초기화·리사이즈 + 격자 렌더링
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [CANVAS INIT] — 초기화 및 리사이즈
  ================================================================ */

  /** 캔버스 크기를 래퍼에 맞춰 초기화 */
  function initCanvas() {
    const w = canvasWrapper.clientWidth;
    const h = canvasWrapper.clientHeight;

    // 캔버스 크기를 래퍼에 맞춤 (정사각형 아니어도 됨)
    gridCanvas.width  = mainCanvas.width  = w;
    gridCanvas.height = mainCanvas.height = h;

    // cellSize: 짧은 쪽 기준, GRID_SIZE 칸으로 나눔
    const canvasSize = Math.min(w, h);
    CONFIG.cellSize = canvasSize / CONFIG.GRID_SIZE;

    // 최초 로드 시 뷰포트: 400% 배율, 그리드 중앙이 화면 중앙에 오도록
    if (!CONFIG._initialized) {
      CONFIG._initialized = true;
      VIEWPORT.scale = 4.0;  // 초기 배율 400%
      // 그리드 중앙(50, 50)이 화면 중앙에 오도록 offset 계산
      const gridCenter_world_x = (CONFIG.GRID_SIZE / 2) * CONFIG.cellSize;
      const gridCenter_world_y = (CONFIG.GRID_SIZE / 2) * CONFIG.cellSize;
      VIEWPORT.offsetX = w / 2 - gridCenter_world_x * VIEWPORT.scale;
      VIEWPORT.offsetY = h / 2 - gridCenter_world_y * VIEWPORT.scale;
    }

    drawGrid();
    renderLoop();
  }

  /** 캔버스를 래퍼 크기에 맞춰 재계산 (단일 사이징 권위; offset 유지) */
  function fitCanvas() {
    const w = canvasWrapper.clientWidth;
    const h = canvasWrapper.clientHeight;
    gridCanvas.width  = mainCanvas.width  = w;
    gridCanvas.height = mainCanvas.height = h;
    const canvasSize = Math.min(w, h);
    CONFIG.cellSize = canvasSize / CONFIG.GRID_SIZE;
    drawGrid();
  }

  window.addEventListener('resize', fitCanvas);

  /* ================================================================
     [GRID] — 격자 렌더링
  ================================================================ */

  /**
   * gridCanvas에 GRID_SIZE×GRID_SIZE 격자 점 렌더
   * FLOOR_DRAW 모드 시 그린 강조, pendingGridPoint 노란 강조
   */
  function drawGrid() {
    const ctx = gridCtx;
    const W = gridCanvas.width;
    const H = gridCanvas.height;

    ctx.clearRect(0, 0, W, H);
    applyViewport(ctx);

    const s  = VIEWPORT.scale;
    const GS = CONFIG.GRID_SIZE;
    const cs = CONFIG.cellSize;

    const isFloorMode = (STATE.interactionMode === 'FLOOR_DRAW');
    // 기본 점 반지름: FLOOR_DRAW 시 3/s, 평상시 1.2/s
    const r = isFloorMode ? 3 / s : 1.2 / s;

    // 화면에 보이는 범위만 렌더 (컬링)
    const topLeft     = screenToWorld(0, 0);
    const bottomRight = screenToWorld(W, H);
    const iMin = Math.max(0,  Math.floor(topLeft.x     / cs) - 1);
    const iMax = Math.min(GS, Math.ceil (bottomRight.x / cs) + 1);
    const jMin = Math.max(0,  Math.floor(topLeft.y     / cs) - 1);
    const jMax = Math.min(GS, Math.ceil (bottomRight.y / cs) + 1);

    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        // pendingGridPoint는 나중에 별도 강조
        if (STATE.pendingGridPoint &&
            STATE.pendingGridPoint.gridX === i &&
            STATE.pendingGridPoint.gridY === j) continue;

        ctx.fillStyle = isFloorMode
          ? 'rgba(16,185,129,0.75)'   // #10b981
          : 'rgba(100,100,100,0.35)';
        ctx.beginPath();
        ctx.arc(i * cs, j * cs, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 원점 강조
    if (!isFloorMode) {
      ctx.fillStyle = 'rgba(100,100,255,0.25)';
      ctx.beginPath();
      ctx.arc(0, GS * cs, r * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // pendingGridPoint 노란 강조 (5/s 반지름)
    if (STATE.pendingGridPoint) {
      const px = STATE.pendingGridPoint.gridX * cs;
      const py = STATE.pendingGridPoint.gridY * cs;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(px, py, 5 / s, 0, Math.PI * 2);
      ctx.fill();
      // 바깥 링
      ctx.strokeStyle = 'rgba(251,191,36,0.5)';
      ctx.lineWidth   = 1.5 / s;
      ctx.beginPath();
      ctx.arc(px, py, 8 / s, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
