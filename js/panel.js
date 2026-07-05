/* ============================================================
   panel.js — 속성 패널 렌더링 + 선택 삭제
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [PANEL] — 속성 패널 renderPanel()
  ================================================================ */

  /* 패널 내부에 행 하나 생성 헬퍼 */
  function _row(label, inputEl) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    const lbl = document.createElement('div');
    lbl.className   = 'panel-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function _numInput(val, min, max, step, onChange) {
    const inp = document.createElement('input');
    inp.type      = 'number';
    inp.className = 'panel-input';
    inp.value     = val;
    if (min  !== undefined) inp.min  = min;
    if (max  !== undefined) inp.max  = max;
    if (step !== undefined) inp.step = step;
    const clampVal = (v) => {
      if (min !== undefined && v < min) v = min;
      if (max !== undefined && v > max) v = max;
      return v;
    };
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v)) onChange(clampVal(v));
    });
    // 포커스 아웃 시 필드 표시값도 유효 범위로 정리 (min 속성은 직접 타이핑을 막지 못함)
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      const c = clampVal(isNaN(v) ? val : v);
      if (String(c) !== inp.value) inp.value = c;
      onChange(c);
    });
    return inp;
  }

  function _slider(val, min, max, step, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
    const sl = document.createElement('input');
    sl.type      = 'range';
    sl.className = 'panel-input';
    sl.style.flex = '1';
    sl.min   = min;  sl.max  = max;
    sl.step  = step; sl.value = val;
    const disp = document.createElement('span');
    disp.style.cssText = 'min-width:28px;color:var(--text-dim);font-size:10px;';
    disp.textContent   = val;
    sl.addEventListener('input', () => {
      disp.textContent = sl.value;
      onChange(parseFloat(sl.value));
    });
    wrap.appendChild(sl);
    wrap.appendChild(disp);
    return wrap;
  }

  function _btn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className   = 'panel-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  /* ── 메인 renderPanel() ── */
  function renderPanel() {
    const sel = STATE.selected;
    panelRight.innerHTML = '';

    if (!sel) {
      panelRight.style.display = 'none';
      return;
    }

    panelRight.style.display = 'flex';

    /* ── 공통 헤더 ── */
    const header = document.createElement('div');
    header.className   = 'panel-label';
    header.textContent = _typeLabel(sel.type || sel.constructor.name);
    header.style.cssText = 'font-size:11px;color:var(--text);text-transform:none;margin-bottom:2px;border-bottom:1px solid var(--border);padding-bottom:4px;';
    panelRight.appendChild(header);

    /* ─────────────────────────
       FloorSegment 전용 패널
    ───────────────────────── */
    if (sel.type === 'floorSegment') {
      const PATH_TYPES = ['LINE','ELBOW_H','ELBOW_V','ARC_UP','ARC_DOWN'];
      const pathBtn = _btn('변경: ' + sel.pathType, '', () => {
        const idx  = PATH_TYPES.indexOf(sel.pathType);
        sel.pathType = PATH_TYPES[(idx + 1) % PATH_TYPES.length];
        pathBtn.textContent = '변경: ' + sel.pathType;
        renderPanel();   // ARC 관련 행 표시/숨김
      });
      panelRight.appendChild(_row('경로 타입', pathBtn));

      // ARC일 때만 곡률
      if (sel.pathType.startsWith('ARC')) {
        panelRight.appendChild(_row('곡률 (θ=curvature×π)',
          _numInput(sel.curvature, 0.02, 1.98, 0.02, v => {
            sel.curvature = clamp(v, 0.02, 1.98);
          })));
        const curvHint = document.createElement('div');
        curvHint.style.cssText = 'color:var(--text-dim);font-size:10px;margin-top:1px;margin-bottom:3px;';
        curvHint.textContent   = '0=직선, 1=정확히 반원, 2에 가까울수록 반원보다 더 굽은 오버행';
        panelRight.appendChild(curvHint);
      }

      // 마찰 토글
      const frBtn = _btn(sel.isFriction ? '마찰 ON' : '마찰 OFF', '', () => {
        sel.isFriction = !sel.isFriction;
        frBtn.textContent = sel.isFriction ? '마찰 ON' : '마찰 OFF';
        renderPanel();
      });
      panelRight.appendChild(_row('마찰 구간', frBtn));

      // 마찰 활성 시 μ 슬라이더
      if (sel.isFriction) {
        // 정지 마찰계수 μs
        panelRight.appendChild(_row('정지 마찰계수 μs',
          _slider(sel.muS ?? sel.mu ?? 0, 0.0, 1.5, 0.01, v => {
            sel.muS = v;
            if ((sel.muK ?? 0) > v) { sel.muK = v; renderPanel(); }
          })));
        // 운동 마찰계수 μk (μk ≤ μs 강제)
        panelRight.appendChild(_row('운동 마찰계수 μk',
          _slider(sel.muK ?? (sel.muS ?? sel.mu ?? 0) * 0.8, 0.0, 1.5, 0.01, v => {
            sel.muS = sel.muS ?? sel.mu ?? 0;
            sel.muK = Math.min(v, sel.muS);
            renderPanel();
          })));
        const muHint = document.createElement('div');
        muHint.style.cssText = 'color:var(--text-dim);font-size:10px;margin-top:1px;margin-bottom:3px;';
        muHint.textContent   = 'μk ≤ μs (운동 ≤ 정지)';
        panelRight.appendChild(muHint);
      }

      panelRight.appendChild(_btn('🗑 삭제', 'danger', () => deleteSelected()));
      return;
    }

    /* ─────────────────────────
       Rope 전용 패널
    ───────────────────────── */
    if (sel.type === 'rope') {
      const len = sel.ropeLength != null ? sel.ropeLength.toFixed(2) : '?';

      // 앵커 A 정보
      const infoA = document.createElement('div');
      infoA.style.cssText = 'color:var(--text-dim);font-size:10px;';
      const fixedA = getAnchorIsFixed(sel.anchorA);
      const nameA  = _anchorLabel(sel.anchorA);
      infoA.textContent = `A: ${nameA} ${fixedA ? '🔒고정' : ''}`;
      panelRight.appendChild(infoA);

      // 앵커 B 정보
      const infoB = document.createElement('div');
      infoB.style.cssText = 'color:var(--text-dim);font-size:10px;';
      const fixedB = getAnchorIsFixed(sel.anchorB);
      const nameB  = _anchorLabel(sel.anchorB);
      infoB.textContent = `B: ${nameB} ${fixedB ? '🔒고정' : ''}`;
      panelRight.appendChild(infoB);

      // 길이
      const infoL = document.createElement('div');
      infoL.style.cssText = 'color:var(--text-dim);font-size:10px;margin-top:2px;';
      infoL.textContent   = `길이: ${len} m`;
      panelRight.appendChild(infoL);

      panelRight.appendChild(_btn('🗑 삭제', 'danger', () => deleteSelected()));
      return;
    }

    /* ─────────────────────────
       Element 공통 속성
    ───────────────────────── */

    // 가로 칸수 — Spring·Pulley·Circle 제외
    if (sel.type !== 'spring' && sel.type !== 'pulley' && sel.type !== 'circle') {
      panelRight.appendChild(_row('가로 칸수',
        _numInput(sel.gridW, 1, 20, 1, v => {
          sel.gridW = Math.max(1, Math.round(v));
          validateAll();
        })));
    }

    // 세로 칸수 — Spring·Pulley·Circle 제외
    if (sel.type !== 'spring' && sel.type !== 'pulley' && sel.type !== 'circle') {
      panelRight.appendChild(_row('세로 칸수',
        _numInput(sel.gridH, 1, 20, 1, v => {
          sel.gridH = Math.max(1, Math.round(v));
          validateAll();
        })));
    }

    // 더블탭으로 회전 가능 안내 (spring/rect/forceZone)
    if (['spring','rect','forceZone'].includes(sel.type)) {
      const hint = document.createElement('div');
      hint.style.cssText = 'color:var(--accent);font-size:10px;margin-bottom:4px;';
      hint.textContent   = '💡 더블탭: 방향 전환';
      panelRight.appendChild(hint);
    }

    /* ─────────────────────────
       Pulley
    ───────────────────────── */
    if (sel.type === 'pulley') {
      // 한 변 길이 (가로 = 세로 항상 동일)
      panelRight.appendChild(_row('한 변 길이 (칸)',
        _numInput(sel.gridW, 1, 20, 1, v => {
          const size = Math.max(1, Math.round(v));
          sel.gridW = size;
          sel.gridH = size;   // 항상 정사각형
          syncPulleyPhys();   // physX/Y 동기화
          validateAll();
        })));

      const fixInfo = document.createElement('div');
      fixInfo.style.cssText = 'color:var(--text-dim);font-size:10px;margin-top:2px;';
      fixInfo.textContent   = '무질량 중계점 · 중심(center) 앵커로 고정 가능';
      panelRight.appendChild(fixInfo);
    }

    /* ─────────────────────────
       RectBody / CircleBody
    ───────────────────────── */
    // ── Circle: 한 변 길이 (정사각형 유지) ──
    if (sel.type === 'circle') {
      panelRight.appendChild(_row('지름 (칸)',
        _numInput(sel.gridW, 1, 20, 1, v => {
          const size = Math.max(1, Math.round(v));
          sel.gridW = size;
          sel.gridH = size;   // 항상 정사각형
          validateAll();
        })));
    }

    if (sel.type === 'rect' || sel.type === 'circle') {
      panelRight.appendChild(_row('질량 (kg)',
        _numInput(sel.mass, 0.1, undefined, 0.1, v => { sel.mass = v; })));
      panelRight.appendChild(_row('초기 vx (m/s)',
        _numInput(sel.vx0, undefined, undefined, 0.1, v => { sel.vx0 = v; })));
      panelRight.appendChild(_row('초기 vy (m/s)',
        _numInput(sel.vy0, undefined, undefined, 0.1, v => { sel.vy0 = v; })));
      panelRight.appendChild(_row('반발계수 e',
        _slider(sel.e, 0.0, 1.0, 0.01, v => { sel.e = v; })));
    }

    /* ─────────────────────────
       Spring
    ───────────────────────── */
    if (sel.type === 'spring') {
      // 방향 표시
      const dirInfo = document.createElement('div');
      dirInfo.style.cssText = 'color:var(--text-dim);font-size:10px;margin-bottom:2px;';
      dirInfo.textContent   = sel.isVertical ? '방향: 세로 (고정 2칸)' : '방향: 가로 (고정 2칸)';
      panelRight.appendChild(dirInfo);

      // 용수철 상수
      panelRight.appendChild(_row('용수철 상수 k (N/m)',
        _numInput(sel.k, 0.1, undefined, 0.1, v => { sel.k = v; })));

      // 자연 길이 L0
      panelRight.appendChild(_row('자연 길이 L₀ (m)',
        _numInput(sel.L0, 0.1, undefined, 0.1, v => { sel.L0 = v; })));

      // 현재 길이 L
      const curLenVal = sel.isVertical ? sel.gridH : sel.gridW;
      panelRight.appendChild(_row('현재 길이 L (m)',
        _numInput(curLenVal, 1, 30, 1, v => {
          const rounded = Math.max(1, Math.round(v));
          if (sel.isVertical) sel.gridH = rounded;
          else                sel.gridW = rounded;
          sel.L = rounded;
          validateAll();
        })));

      // ── 체결 체크박스 ──
      const leftLabel  = sel.isVertical ? '위쪽' : '왼쪽';
      const rightLabel = sel.isVertical ? '아래쪽' : '오른쪽';
      const leftName   = sel.leftElementId
        ? _typeLabel((STATE.elements.find(e=>e.id===sel.leftElementId)||STATE.floorSegments.find(s=>s.id===sel.leftElementId)||{type:'?'}).type)
        : '없음';
      const rightName  = sel.rightElementId
        ? _typeLabel((STATE.elements.find(e=>e.id===sel.rightElementId)||STATE.floorSegments.find(s=>s.id===sel.rightElementId)||{type:'?'}).type)
        : '없음';

      const lockSection = document.createElement('div');
      lockSection.style.cssText = 'margin-top:4px;border-top:1px solid var(--border);padding-top:4px;';

      const lockTitle = document.createElement('div');
      lockTitle.className   = 'panel-label';
      lockTitle.textContent = '체결 (힘 전달)';
      lockSection.appendChild(lockTitle);

      function _checkbox(label, checked, onChange) {
        const wrap = document.createElement('label');
        wrap.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--text);font-size:11px;margin:3px 0;';
        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = checked;
        cb.style.cssText = 'accent-color:var(--accent);width:13px;height:13px;cursor:pointer;';
        cb.addEventListener('change', () => onChange(cb.checked));
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode(label));
        return wrap;
      }

      lockSection.appendChild(_checkbox(
        leftLabel  + ': ' + leftName,
        sel.leftLocked,
        v => { sel.leftLocked = v; }
      ));
      lockSection.appendChild(_checkbox(
        rightLabel + ': ' + rightName,
        sel.rightLocked,
        v => { sel.rightLocked = v; }
      ));
      // ── 자동 체결 (#5) ──
      lockSection.appendChild(_checkbox(
        '자동 체결 (접촉 시 자동 연결)',
        sel.autoAttach !== false,
        v => { sel.autoAttach = v; validateAll(); }
      ));
      panelRight.appendChild(lockSection);
    }

    /* ─────────────────────────
       ForceZone
    ───────────────────────── */
    if (sel.type === 'forceZone') {
      panelRight.appendChild(_row('Fx (N)',
        _numInput(sel.fx, undefined, undefined, 0.1, v => { sel.fx = v; })));
      panelRight.appendChild(_row('Fy (N)',
        _numInput(sel.fy, undefined, undefined, 0.1, v => { sel.fy = v; })));
    }

    /* ── 공통: 삭제 버튼 ── */
    panelRight.appendChild(_btn('🗑 삭제', 'danger', () => deleteSelected()));
  }

  /* 타입 → 한국어 레이블 */
  function _typeLabel(type) {
    return { rect:'네모 물체', circle:'원 물체', forceZone:'힘 구간',
             pulley:'도르래', spring:'용수철',
             floorSegment:'바닥면', rope:'실' }[type] || type;
  }

  /* 앵커 → 레이블 (요소 타입 + 포인트) */
  function _anchorLabel(anchor) {
    const el  = STATE.elements.find(e => e.id === anchor.elementId);
    if (el)  return _typeLabel(el.type) + ' (' + anchor.attachPoint + ')';
    const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
    if (seg) return '바닥면 (' + (anchor.attachPoint === 'p1' ? '끝점1' : '끝점2') + ')';
    return '?';
  }

  /* ================================================================
     [DELETE] — 선택 오브젝트 삭제
  ================================================================ */

  function deleteSelected() {
    const sel = STATE.selected;
    if (!sel) return;

    if (sel.type === 'floorSegment') {
      // FloorSegment를 앵커로 삼는 Rope 제거
      STATE.ropes = STATE.ropes.filter(r =>
        r.anchorA?.elementId !== sel.id && r.anchorB?.elementId !== sel.id
      );
      STATE.floorSegments = STATE.floorSegments.filter(s => s !== sel);

    } else if (sel.type === 'rope') {
      // Rope 삭제: 연결된 Pulley.connectedRopeIds 갱신
      STATE.ropes = STATE.ropes.filter(r => r !== sel);
      STATE.elements.forEach(el => {
        if (el.type === 'pulley' && el.connectedRopeIds) {
          el.connectedRopeIds = el.connectedRopeIds.filter(id => id !== sel.id);
        }
      });

    } else {
      // Element 삭제: 참조하는 Rope, Spring 정리
      const id = sel.id;
      // 해당 요소를 참조하는 Rope 제거
      STATE.ropes = STATE.ropes.filter(r =>
        r.anchorA?.elementId !== id && r.anchorB?.elementId !== id
      );
      // Spring의 leftElementId / rightElementId 참조 초기화
      STATE.elements.forEach(el => {
        if (el.type === 'spring') {
          if (el.leftElementId  === id) el.leftElementId  = null;
          if (el.rightElementId === id) el.rightElementId = null;
        }
      });
      STATE.elements = STATE.elements.filter(e => e !== sel);
    }

    STATE.selected = null;
    renderPanel();
    validateAll();
  }
