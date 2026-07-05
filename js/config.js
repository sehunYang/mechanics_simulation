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
    FIXED_DT:   1 / 60,   // 물리 스텝 고정 간격 (배속 결정성 보장용, MAX_DT와 별개)
    GRID_SIZE:  100,
    cellSize:   null,   // initCanvas()에서 설정
    DEFAULT_E:  1.0,
    DEFAULT_MU: 0.3,
    DEFAULT_K:  10.0,
    LONG_PRESS_MS: 300,
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
    speedMultiplier:   1,      // 배속 (1/2/5/10/100), RUNNING 중에만 의미 있음
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

  /* 배속 버튼: HTML에 없으므로 동적 생성, canvas-wrapper 우측 하단에 배치
     (controls-bottom 중앙 pill과는 별개 — RUNNING 중에만 render.js가 표시) */
  const btnSpeed = document.createElement('button');
  btnSpeed.id = 'btn-speed';
  btnSpeed.className = 'ctrl-btn';
  btnSpeed.textContent = '1x';
  btnSpeed.style.cssText = 'position:absolute;bottom:40px;right:8px;z-index:20;display:none;';
  canvasWrapper.appendChild(btnSpeed);
