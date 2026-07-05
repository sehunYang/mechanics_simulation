/* ============================================================
   config.js — CONFIG / VIEWPORT / STATE / DOM 참조 (전역 상수·상태)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */

  /* ================================================================
     [CONFIG] — 물리/렌더링 상수
  ================================================================ */
  const CONFIG = {
    G:          9.8,
    SUBSTEPS:   4,
    MAX_DT:     0.033,
    GRID_SIZE:  100,
    cellSize:   null,   // initCanvas()에서 설정
    DEFAULT_E:  1.0,
    DEFAULT_MU: 0.3,
    DEFAULT_K:  10.0,
  };

  /* ================================================================
     [VIEWPORT] — 줌/팬 상태
  ================================================================ */
  const VIEWPORT = {
    scale:    1.0,
    offsetX:  0,
    offsetY:  0,
    minScale: 0.2,
    maxScale: 5.0,
  };

  /* ================================================================
     [STATE] — 전역 상태
  ================================================================ */
  const STATE = {
    simMode:           'EDIT',
    interactionMode:   'IDLE',
    elements:          [],
    floorSegments:     [],
    ropes:             [],
    selected:          null,
    pendingGridPoint:  null,
    pendingRopeAnchor: null,
    snapshot:          null,
    gravityOn:         true,
    dragOffset:        { x: 0, y: 0 },
    activePointers:    new Map(),
    prevPinchDist:     null,
    _ropePreviewWorld: null,   // ROPE_DRAW 커서 위치 (월드 픽셀)
  };

  /* ================================================================
     [DOM REFS]
  ================================================================ */
  const gridCanvas   = document.getElementById('gridCanvas');
  const mainCanvas   = document.getElementById('mainCanvas');
  const gridCtx      = gridCanvas.getContext('2d');
  const mainCtx      = mainCanvas.getContext('2d');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const zoomIndicator = document.getElementById('zoom-indicator');
  const btnRun       = document.getElementById('btn-run');
  const btnReset     = document.getElementById('btn-reset');
  const btnCapture   = document.getElementById('btn-capture');
  const btnGravity   = document.getElementById('btn-gravity');
  const warningBar   = document.getElementById('warning-bar');
  const panelRight   = document.getElementById('panel-right');
