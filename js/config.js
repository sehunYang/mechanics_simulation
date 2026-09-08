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
    LONG_PRESS_MS: 150,  // QC#2: 삭제 버튼 활성화 지연 단축(기존 300)
    FLOOR_ANCHOR_STEP: 0.5,   // 바닥면 위 실 앵커 간격 [격자 칸] — 경로 호길이 기준
    TRAIL_MIN_STEP:    0.04,  // 궤적 점 최소 간격 [격자 칸] — 정지 물체가 점을 쌓지 않게
    TRAIL_MAX_POINTS:  4000,  // 물체당 궤적 점 상한 (초과 시 앞쪽부터 버림)
  };

  /* ================================================================
     [HALF_SNAP_TYPES] — 0.5칸 격자 배치를 허용하는 요소 타입
  ================================================================
     정수 격자만 쓰면 "패리티 불일치"로 실이 절대 수평이 되지 않는다:

       · 도르래는 2×2(짝수) → rim 앵커(left/right) y = gridY + 1  → 항상 정수
       · 물체가 홀수 높이(1×1 등) → 옆면 앵커 y = gridY + h/2     → 항상 반정수

     따라서 둘의 높이차는 아무리 맞춰도 최소 0.5칸이 남고, 바닥면과 평행한
     실을 그릴 수 없다. 도르래를 반칸 격자에 놓을 수 있게 하면 정확히 정렬된다.
     (외력 ExtForce도 같은 이유로 반칸 배치가 필요하다) */
  const HALF_SNAP_TYPES = ['extforce', 'pulley'];

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
    speedMultiplier:   1,      // 배속 (0.25 … 100), RUNNING 중에만 의미 있음
    simTime:           0,      // 누적 시뮬레이션 시간 [s] (배속 반영, 실행 표시용)
    warnings:          [],     // validateAll 이 채우는 편집 상태 경고 (guide.js 가 표시)
    currentSceneId:    null,   // 갤러리에서 불러온 장면 id (직접 편집하면 null)
    // 표시 토글 (2단계 — render.js 오버레이가 읽는다)
    showVectors:       false,  // 속도·힘 벡터
    showLabels:        true,   // 질량·k 등 값 라벨
    showForces:        false,  // 자유물체도 (힘 성분 분해)
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
  const panelRight   = document.getElementById('panel-right');

  /* 배속 버튼: HTML에 없으므로 동적 생성, canvas-wrapper 우측 하단에 배치
     (controls-bottom 중앙 pill과는 별개 — RUNNING 중에만 render.js가 표시) */
  /* 실행 상태 표시 배지: canvas-wrapper 상단 중앙.
     render.js가 매 프레임 표시/문구를 갱신 (EDIT에서는 숨김) */
  const runIndicator = document.createElement('div');
  runIndicator.id = 'run-indicator';
  runIndicator.innerHTML = '<span class="ri-dot"></span><span class="ri-label"></span><span class="ri-time"></span>';
  canvasWrapper.appendChild(runIndicator);
  const riDot   = runIndicator.querySelector('.ri-dot');
  const riLabel = runIndicator.querySelector('.ri-label');
  const riTime  = runIndicator.querySelector('.ri-time');

  /* 배속·한 스텝 버튼: 실행/일시정지 중에만 보인다 (render.js 가 토글).
     배속은 느린 쪽(0.25x·0.5x)도 있어 충돌·실이 팽팽해지는 순간을 볼 수 있다. */
  const btnSpeed = document.createElement('button');
  btnSpeed.id = 'btn-speed';
  btnSpeed.className = 'ctrl-btn float-btn';
  btnSpeed.textContent = '1x';
  btnSpeed.title = '배속 — 눌러서 0.25x → 0.5x → 1x → 2x → 5x → 10x → 100x 순환';
  btnSpeed.style.display = 'none';
  canvasWrapper.appendChild(btnSpeed);

  const btnStep = document.createElement('button');
  btnStep.id = 'btn-step';
  btnStep.className = 'ctrl-btn float-btn';
  btnStep.textContent = '⏭ 1/60 s';
  btnStep.title = '한 스텝(1/60 s)만 진행 — 일시정지 중에만';
  btnStep.style.display = 'none';
  canvasWrapper.appendChild(btnStep);
