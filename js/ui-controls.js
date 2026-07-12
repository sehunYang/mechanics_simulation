/* ============================================================
   ui-controls.js — 팔레트/하단 버튼 + addElement + 시뮬 제어
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [UI BUTTONS] — 팔레트 + 하단 버튼
  ================================================================ */

  /* 팔레트 아이템 클릭 */
  document.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    item.addEventListener('click', (e) => {
      const type = item.dataset.type;
      const mode = item.dataset.mode;

      if (STATE.simMode === 'RUNNING') return;

      // 모드 버튼: 토글
      if (mode) {
        const targetMode = mode.toUpperCase();
        if (STATE.interactionMode === targetMode) {
          STATE.interactionMode = 'IDLE';
          item.classList.remove('active-mode');
        } else {
          STATE.interactionMode = targetMode;
          document.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active-mode'));
          item.classList.add('active-mode');
        }
        STATE.pendingGridPoint  = null;
        STATE.pendingRopeAnchor = null;
        STATE._ropePreviewWorld = null;
        drawGrid();   // FLOOR_DRAW 강조 갱신
        return;
      }

      // 요소 추가 (Sprint 2에서 구현)
      if (type) {
        // 다른 팔레트 버튼 클릭 시 모드 초기화
        STATE.interactionMode = 'IDLE';
        document.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active-mode'));
        addElement(type);
      }
    });
  });

  /** 요소 생성 팩토리 — 현재 화면 중앙 격자 좌표에 추가 */
  function addElement(type) {
    let el;
    switch (type) {
      case 'rect':      el = new RectBody();    break;
      case 'circle':    el = new CircleBody();  break;
      case 'forceZone': el = new ForceZone();   break;
      case 'pulley':    el = new Pulley();      break;
      case 'spring':    el = new Spring();      break;
      case 'extforce':  el = new ExtForce();    break;
      default: return;
    }

    // 현재 화면 중앙의 월드 좌표 → 격자 인덱스
    const screenCX = mainCanvas.width  / 2;
    const screenCY = mainCanvas.height / 2;
    const world    = screenToWorld(screenCX, screenCY);
    const cs       = CONFIG.cellSize;
    const GS       = CONFIG.GRID_SIZE;

    // 격자 스냅 + 경계 클램프 (요소가 그리드 밖으로 나가지 않도록)
    // ExtForce는 0.5칸 격자(반정수)까지 스냅 허용 — 도르래 테두리/몸체 중심과 정렬하기 위함
    const gx = el.type === 'extforce'
      ? clamp(Math.round((world.x / cs) * 2) / 2, 0, GS - el.gridW)
      : clamp(snapToGridIndex(world.x / cs * cs), 0, GS - el.gridW);
    const gy = el.type === 'extforce'
      ? clamp(Math.round((world.y / cs) * 2) / 2, 0, GS - el.gridH)
      : clamp(snapToGridIndex(world.y / cs * cs), 0, GS - el.gridH);
    el.gridX = gx;
    el.gridY = gy;

    STATE.elements.push(el);
    _selectObject(el);
    validateAll();
    if (typeof recordHistory === 'function') recordHistory();
  }

  /* 하단 버튼 */
  btnRun.addEventListener('click', () => {
    if (STATE.simMode === 'EDIT') {
      startSimulation();
    } else if (STATE.simMode === 'RUNNING') {
      pauseSimulation();
    } else if (STATE.simMode === 'PAUSED') {
      resumeSimulation();
    }
  });

  btnReset.addEventListener('click', () => {
    stopSimulation();
    restoreSnapshot();          // t=0 상태 완전 복원
    STATE.simMode = 'EDIT';
    STATE.interactionMode = 'IDLE';
    STATE.pendingGridPoint = null;
    STATE.pendingRopeAnchor = null;
    STATE._ropePreviewWorld = null;
    document.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active-mode'));
    btnRun.textContent = '▶ 실행';
    btnRun.disabled = false;
    btnRun.style.opacity = '1';
    _selectObject(null);        // 패널 닫기
    drawGrid();
    validateAll();
    if (typeof _updateUndoRedoButtons === 'function') _updateUndoRedoButtons();
  });

  btnCapture.addEventListener('click', () => {
    captureImage();
  });

  btnGravity.addEventListener('click', () => {
    STATE.gravityOn = !STATE.gravityOn;
    if (!STATE.gravityOn) {
      btnGravity.textContent = '중력 OFF';
      btnGravity.classList.add('active');
    } else {
      btnGravity.textContent = '⊙ 무중력';
      btnGravity.classList.remove('active');
    }
  });

  /* 배속 버튼: RUNNING 중에만 표시(render.js에서 토글), 1→2→5→10→100→1 순환 */
  const SPEED_LEVELS = [1, 2, 5, 10, 100];
  btnSpeed.addEventListener('click', () => {
    const idx = SPEED_LEVELS.indexOf(STATE.speedMultiplier);
    STATE.speedMultiplier = SPEED_LEVELS[(idx + 1) % SPEED_LEVELS.length];
    btnSpeed.textContent = STATE.speedMultiplier + 'x';
  });
