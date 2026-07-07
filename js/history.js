/* ============================================================
   history.js — 편집 히스토리 (실행취소 / 다시실행)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [HISTORY] — 씬 스냅샷 스택 기반 undo/redo
       · EDIT 모드에서 발생한 이산적 편집마다 recordHistory() 호출.
       · stack[index] == 현재 상태. undo=index--, redo=index++.
       · 시뮬레이션(RUNNING/PAUSED) 중에는 기록/복원하지 않음.
  ================================================================ */

  const HISTORY = {
    stack:     [],
    index:     -1,
    limit:     80,
    restoring: false,   // 복원 중 recordHistory 재진입 방지
  };

  /** 현재 씬을 직렬화 (saveSnapshot과 동일 포맷) */
  function _serializeScene() {
    return JSON.stringify({
      elements:      STATE.elements.map(e => e.serialize()),
      floorSegments: STATE.floorSegments.map(s => s.serialize()),
      ropes:         STATE.ropes.map(r => r.serialize()),
    });
  }

  /** 직렬화 문자열 → STATE 재구성 (restoreSnapshot과 동일 재생성 로직) */
  function _deserializeScene(json) {
    const data = JSON.parse(json);

    STATE.elements = data.elements.map(d => {
      let el;
      switch (d.type) {
        case 'rect':      el = new RectBody();    break;
        case 'circle':    el = new CircleBody();  break;
        case 'forceZone': el = new ForceZone();   break;
        case 'pulley':    el = new Pulley();      break;
        case 'spring':    el = new Spring();      break;
        case 'extforce':  el = new ExtForce();    break;
        default: return null;
      }
      Object.assign(el, d);
      return el;
    }).filter(Boolean);

    STATE.floorSegments = data.floorSegments.map(d => {
      const seg = new FloorSegment(d.x1, d.y1, d.x2, d.y2);
      Object.assign(seg, d);
      return seg;
    });

    STATE.ropes = data.ropes.map(d => {
      const rope = new Rope(d.anchorA, d.anchorB, d.ropeLength);
      Object.assign(rope, d);
      return rope;
    });

    STATE.selected = null;
  }

  /** 편집 완료 시 호출 — 현재 상태를 히스토리에 커밋 */
  function recordHistory() {
    if (HISTORY.restoring) return;
    if (STATE.simMode !== 'EDIT') return;   // 시뮬 중엔 기록 안 함

    const snap = _serializeScene();
    // 직전 상태와 동일하면 스킵 (중복 방지)
    if (HISTORY.index >= 0 && HISTORY.stack[HISTORY.index] === snap) return;

    // redo 분기 제거 후 push
    HISTORY.stack = HISTORY.stack.slice(0, HISTORY.index + 1);
    HISTORY.stack.push(snap);

    // 상한 초과 시 가장 오래된 항목 제거
    if (HISTORY.stack.length > HISTORY.limit) HISTORY.stack.shift();

    HISTORY.index = HISTORY.stack.length - 1;
    _updateUndoRedoButtons();
  }

  function _applyHistoryState() {
    HISTORY.restoring = true;
    _deserializeScene(HISTORY.stack[HISTORY.index]);
    HISTORY.restoring = false;
    renderPanel();
    drawGrid();
    validateAll();
    _updateUndoRedoButtons();
  }

  function undo() {
    if (STATE.simMode !== 'EDIT') return;
    if (HISTORY.index <= 0) return;
    HISTORY.index--;
    _applyHistoryState();
  }

  function redo() {
    if (STATE.simMode !== 'EDIT') return;
    if (HISTORY.index >= HISTORY.stack.length - 1) return;
    HISTORY.index++;
    _applyHistoryState();
  }

  /** 버튼 활성/비활성 상태 갱신 */
  function _updateUndoRedoButtons() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = (STATE.simMode !== 'EDIT') || HISTORY.index <= 0;
    if (r) r.disabled = (STATE.simMode !== 'EDIT') || HISTORY.index >= HISTORY.stack.length - 1;
  }

  /** 최초 상태를 히스토리 베이스로 기록 (boot에서 1회 호출) */
  function initHistory() {
    HISTORY.stack = [_serializeScene()];
    HISTORY.index = 0;
    _updateUndoRedoButtons();
  }

  /* ── 버튼/단축키 바인딩 ── */
  (function _bindHistoryControls() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) {
      u.addEventListener('pointerdown', (e) => e.stopPropagation());
      u.addEventListener('click', undo);
    }
    if (r) {
      r.addEventListener('pointerdown', (e) => e.stopPropagation());
      r.addEventListener('click', redo);
    }
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo();
      } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault(); redo();
      }
    });
  })();
