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

  /* 탭하면 숫자 키패드 모달이 열리는 읽기전용 입력 (모바일 네이티브 키보드 대체) */
  function _numInput(val, min, max, step, onChange) {
    const inp = document.createElement('input');
    inp.type      = 'text';
    inp.inputMode = 'none';
    inp.readOnly  = true;
    inp.className = 'panel-input';
    inp.value     = val;
    const clampVal = (v) => {
      if (min !== undefined && v < min) v = min;
      if (max !== undefined && v > max) v = max;
      return v;
    };
    inp.addEventListener('click', () => {
      openNumericKeypad({
        initialValue: parseFloat(inp.value),
        min, max, step,
        onConfirm: (v) => {
          const c = clampVal(isNaN(v) ? val : v);
          inp.value = c;
          onChange(c);
          if (typeof recordHistory === 'function') recordHistory();
        }
      });
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
    // 슬라이더 조작 종료 시점(release)에 1회 히스토리 기록
    sl.addEventListener('change', () => {
      if (typeof recordHistory === 'function') recordHistory();
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

    /* ── 실행·일시정지 중: 값 편집은 막고 측정값만 보여 준다 ── */
    if (STATE.simMode !== 'EDIT') {
      if (typeof buildMeasureSection === 'function') panelRight.appendChild(buildMeasureSection(sel));
      const tip = document.createElement('div');
      tip.className = 'pp-note';
      tip.textContent = '값을 바꾸려면 ↺ 초기화 뒤 편집하세요. 일시정지 중에는 ⏭ 한 스텝으로 순간을 볼 수 있습니다.';
      panelRight.appendChild(tip);
      return;
    }

    /* ─────────────────────────
       FloorSegment 전용 패널
    ───────────────────────── */
    if (sel.type === 'floorSegment') {
      const PATH_TYPES = ['LINE','ELBOW_H','ELBOW_V','ARC_UP','ARC_DOWN'];
      const pathBtn = _btn('변경: ' + sel.pathType, '', () => {
        const idx  = PATH_TYPES.indexOf(sel.pathType);
        sel.pathType = PATH_TYPES[(idx + 1) % PATH_TYPES.length];
        pathBtn.textContent = '변경: ' + sel.pathType;
        if (typeof recordHistory === 'function') recordHistory();
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

      // 이음 다듬기 (클로소이드) — 다른 직선 바닥면과 끝점을 공유할 때만
      if (sel.pathType === 'LINE' && typeof jointAt === 'function') {
        for (const end of ['p1', 'p2']) {
          const j = jointAt(sel, end);
          if (!j) continue;
          const name = (end === 'p1' ? '끝점1' : '끝점2') + ` 이음 — ${Math.round(j.deg)}° ${j.concave ? '오목' : '볼록'}`;
          if (j.eligible) {
            const jb = _btn(j.on ? '매끄럽게 ON (클로소이드)' : '매끄럽게 OFF (모서리)', '', () => {
              setJointSmooth(sel, end, !j.on);
              validateAll();
              if (typeof recordHistory === 'function') recordHistory();
              renderPanel();
            });
            panelRight.appendChild(_row(name, jb));
            const jInfo = document.createElement('div');
            jInfo.className = 'pp-note';
            jInfo.textContent = j.on
              ? `완화 곡선: 접선 길이 ${j.T.toFixed(2)} m, 최소 곡률 반지름 R = ${j.R.toFixed(2)} m. 접선·곡률이 연속이라 충격력이 없습니다.`
              : '켜면 두 바닥면 사이에 곡률이 0 → 1/R → 0 으로 변하는 완화 곡선(클로소이드)이 들어가 물체가 튀지 않습니다.';
            panelRight.appendChild(jInfo);
          } else {
            const jInfo = document.createElement('div');
            jInfo.className = 'pp-note';
            jInfo.textContent = `${name}: 매끄럽게 할 수 없음 — ${j.reason}`;
            panelRight.appendChild(jInfo);
          }
        }
      }

      // 마찰 토글
      const frBtn = _btn(sel.isFriction ? '마찰 ON' : '마찰 OFF', '', () => {
        sel.isFriction = !sel.isFriction;
        frBtn.textContent = sel.isFriction ? '마찰 ON' : '마찰 OFF';
        if (typeof recordHistory === 'function') recordHistory();
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

      if (typeof buildMeasureSection === 'function') panelRight.appendChild(buildMeasureSection(sel));
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

      if (typeof buildMeasureSection === 'function') panelRight.appendChild(buildMeasureSection(sel));
      panelRight.appendChild(_btn('🗑 삭제', 'danger', () => deleteSelected()));
      return;
    }

    /* ─────────────────────────
       Element 공통 속성
    ───────────────────────── */

    // 가로 칸수 — Spring·Pulley·Circle·ExtForce·막대·받침 제외 (각자 전용 행)
    if (!['spring','pulley','circle','extforce','rod','fulcrum'].includes(sel.type)) {
      panelRight.appendChild(_row('가로 칸수',
        _numInput(sel.gridW, 1, 20, 1, v => {
          sel.gridW = Math.max(1, Math.round(v));
          validateAll();
        })));
    }

    // 세로 칸수 — Spring·Pulley·Circle·ExtForce·막대·받침 제외
    if (!['spring','pulley','circle','extforce','rod','fulcrum'].includes(sel.type)) {
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
      // 이름 — 그래프·CSV 범례와 POE 문항에서 이 물체를 가리키는 데 쓴다
      const nameInp = document.createElement('input');
      nameInp.type = 'text'; nameInp.className = 'panel-input'; nameInp.maxLength = 12;
      nameInp.placeholder = (typeof bodyLabel === 'function') ? bodyLabel(sel) : '이름';
      nameInp.value = sel.label || '';
      nameInp.addEventListener('pointerdown', e => e.stopPropagation());
      nameInp.addEventListener('change', () => { sel.label = nameInp.value.trim(); if (typeof recordHistory === 'function') recordHistory(); });
      panelRight.appendChild(_row('이름', nameInp));
      panelRight.appendChild(_row('질량 (kg)',
        _numInput(sel.mass, 0.1, undefined, 0.1, v => { sel.mass = v; })));
      panelRight.appendChild(_row('초기 vx (m/s)',
        _numInput(sel.vx0, undefined, undefined, 0.1, v => { sel.vx0 = v; })));
      panelRight.appendChild(_row('초기 vy (m/s)',
        _numInput(sel.vy0, undefined, undefined, 0.1, v => { sel.vy0 = v; })));
      panelRight.appendChild(_row('반발계수 e',
        _slider(sel.e, 0.0, 1.0, 0.01, v => { sel.e = v; })));
      if (sel.type === 'circle') {
        panelRight.appendChild(_row('초기 각속도 ω₀ (rad/s)',
          _numInput(sel.omega0 || 0, undefined, undefined, 1, v => { sel.omega0 = v; })));
        const wInfo = document.createElement('div');
        wInfo.className = 'pp-note';
        wInfo.textContent = '양수 = 반시계 회전. 마찰 바닥에 닿으면 스핀이 진행 속도로 바뀝니다 (v = rω₀/3).';
        panelRight.appendChild(wInfo);
      }
      // 공기저항 (선형 F = −bv). 0 이면 없음 — 종단속도 탐구용
      panelRight.appendChild(_row('공기저항 b (N·s/m)',
        _numInput(sel.drag || 0, 0, 50, 0.1, v => { sel.drag = Math.max(0, v); })));
      if (sel.drag > 0) {
        const dInfo = document.createElement('div');
        dInfo.className = 'pp-note';
        dInfo.textContent = `F = −b·v. 종단속도 mg/b ≈ ${(sel.mass * CONFIG.G / sel.drag).toFixed(2)} m/s`;
        panelRight.appendChild(dInfo);
      }

      // ── 궤적 표시 (물체별 토글) ──
      //   끄면 기록도 하지 않는다. 실행 중에는 물체를 선택할 수 없어
      //   다시 켤 방법이 없으므로, 실행 전에 켜 둔 물체만 기록하면 된다.
      const n = (sel._trail && sel._trail.length) || 0;
      panelRight.appendChild(_row('궤적',
        _btn(sel.showTrail ? '● 표시 중 — 끄기' : '○ 숨김 — 켜기', '', () => {
          sel.showTrail = !sel.showTrail;
          renderPanel();
        })));
      const trailInfo = document.createElement('div');
      trailInfo.style.cssText = 'color:var(--text-dim);font-size:10px;margin-top:-2px;margin-bottom:3px;';
      trailInfo.textContent = !sel.showTrail
        ? '꺼두면 기록하지 않습니다 (실행 전에 켜 두세요)'
        : (n > 1 ? `기록된 점 ${n}개 — 실행 중 계속 쌓입니다`
                 : '실행하면 이 물체가 지나간 길이 기록됩니다');
      panelRight.appendChild(trailInfo);
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
        cb.addEventListener('change', () => {
          onChange(cb.checked);
          if (typeof recordHistory === 'function') recordHistory();
        });
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
       RodBody (막대)
    ───────────────────────── */
    if (sel.type === 'rod') _rodPanel(sel);

    /* ─────────────────────────
       Fulcrum (받침)
    ───────────────────────── */
    if (sel.type === 'fulcrum') _fulcrumPanel(sel);

    /* ─────────────────────────
       ForceZone
    ───────────────────────── */
    if (sel.type === 'forceZone') {
      panelRight.appendChild(_row('Fx (N)',
        _numInput(sel.fx, undefined, undefined, 0.1, v => { sel.fx = v; })));
      panelRight.appendChild(_row('Fy (N)',
        _numInput(sel.fy, undefined, undefined, 0.1, v => { sel.fy = v; })));
    }

    /* ─────────────────────────
       ExtForce (외력)
    ───────────────────────── */
    if (sel.type === 'extforce') {
      panelRight.appendChild(_row('힘 크기 (N)',
        _numInput(sel.forceN, 0, undefined, 0.1, v => { sel.forceN = Math.max(0, v); })));
      const info = document.createElement('div');
      info.style.cssText = 'color:var(--text-dim);font-size:10px;margin-top:2px;';
      info.textContent   = '실을 연결하면 실 방향으로 힘이 작용합니다 (실이 팽팽할 때만).';
      panelRight.appendChild(info);
    }

    /* ── 측정값 (물체·용수철·도르래) ── */
    if (typeof buildMeasureSection === 'function' && ['rect', 'circle', 'spring', 'pulley', 'rod', 'fulcrum'].includes(sel.type))
      panelRight.appendChild(buildMeasureSection(sel));

    /* ── 공통: 삭제 버튼 ── */
    panelRight.appendChild(_btn('🗑 삭제', 'danger', () => deleteSelected()));
  }

  /* 타입 → 한국어 레이블 */
  function _typeLabel(type) {
    return { rect:'네모 물체', circle:'원 물체', forceZone:'힘 구간',
             pulley:'도르래', spring:'용수철', extforce:'외력', rod:'막대', fulcrum:'받침',
             floorSegment:'바닥면', rope:'실' }[type] || type;
  }

  /* 체크박스 행 */
  function _check(label, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--text);font-size:11px;margin:3px 0;';
    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = checked;
    cb.style.cssText = 'accent-color:var(--accent);width:13px;height:13px;cursor:pointer;';
    cb.addEventListener('change', () => {
      onChange(cb.checked);
      if (typeof recordHistory === 'function') recordHistory();
    });
    const txt = document.createElement('span');
    txt.textContent = label;
    wrap.appendChild(cb);
    wrap.appendChild(txt);
    return wrap;
  }

  function _note(text) {
    const n = document.createElement('div');
    n.className = 'pp-note';
    n.textContent = text;
    return n;
  }

  /* 막대 속성 — 길이·각도를 바꿀 때 받침에 얹혀 있으면 그 접점을 축으로 (받침에서 떨어지지 않게) */
  function _rodPanel(sel) {
    const pivotOf = () => {
      for (const f of STATE.elements) {
        if (f.type !== 'fulcrum') continue;
        const c = fulcrumRodContact(f);
        if (c && c.rod === sel) return { d: c.d, p: fulcrumApexGrid(f) };
      }
      return null;
    };
    // 막대 위 p1 로부터 d 인 점이 P 에 오도록 중심을 옮긴다
    const placeAt = (d, P) => {
      const g = rodGeometry(sel);
      const s = d - sel.gridW / 2;
      sel.gridX = P.x - g.ux * s - sel.gridW / 2;
      sel.gridY = P.y - g.uy * s - sel.gridH / 2;
    };

    const nameInp = document.createElement('input');
    nameInp.type = 'text'; nameInp.className = 'panel-input'; nameInp.maxLength = 12;
    nameInp.placeholder = (typeof bodyLabel === 'function') ? bodyLabel(sel) : '이름';
    nameInp.value = sel.label || '';
    nameInp.addEventListener('pointerdown', e => e.stopPropagation());
    nameInp.addEventListener('change', () => { sel.label = nameInp.value.trim(); if (typeof recordHistory === 'function') recordHistory(); });
    panelRight.appendChild(_row('이름', nameInp));

    panelRight.appendChild(_row('길이 L (m)',
      _numInput(sel.gridW, 1, 30, 0.5, v => {
        const pv = pivotOf();
        const keep = pv ? pv : { d: 0, p: rodGeometry(sel).p1 };   // 받침 접점(없으면 왼쪽 끝)을 그대로
        const ratio = pv ? pv.d / sel.gridW : 0;
        sel.gridW = clamp(Math.round(v * 2) / 2, 1, 30);
        placeAt(pv ? ratio * sel.gridW : 0, keep.p);
        validateAll(); renderPanel();
      })));
    panelRight.appendChild(_row('질량 M (kg)',
      _numInput(sel.mass, 0.1, undefined, 0.1, v => { sel.mass = v; renderPanel(); })));
    panelRight.appendChild(_row('초기 각도 θ₀ (°, 반시계 +)',
      _numInput(sel.angle0 || 0, -90, 90, 5, v => {
        const pv = pivotOf();
        const d = pv ? pv.d : sel.gridW / 2;
        const P = pv ? pv.p : rodPointGrid(sel, d);
        sel.angle0 = clamp(v, -90, 90);
        placeAt(d, P);
        validateAll();
      })));
    panelRight.appendChild(_row('반발계수 e (바닥)',
      _slider(sel.e ?? 0, 0.0, 1.0, 0.01, v => { sel.e = v; })));
    panelRight.appendChild(_row('눈금 (등분 수, 0 = 없음)',
      _numInput(sel.ticks || 0, 0, 20, 1, v => { sel.ticks = Math.max(0, Math.round(v)); })));
    const DIMS = ['off', 'm', 'L'], DIM_NAME = { off: '끔', m: '길이 (m)', L: 'L 의 배수' };
    panelRight.appendChild(_row('치수선 (수능 그림)', _btn(DIM_NAME[sel.dims || 'off'], '', () => {
      sel.dims = DIMS[(DIMS.indexOf(sel.dims || 'off') + 1) % DIMS.length];
      if (typeof recordHistory === 'function') recordHistory();
      renderPanel();
    })));
    const I = sel.mass * sel.gridW * sel.gridW / 12;
    panelRight.appendChild(_note(`균일한 얇은 막대 — 질량중심은 가운데, I = ML²/12 = ${fmtNum(I, 3)} kg·m². 양 끝 핸들을 끌면 길이·각도가 바뀝니다.`));
    panelRight.appendChild(_note('실은 막대 위 0.5 m 마다 걸 수 있습니다 (실 도구로 막대 위 점을 클릭).'));
  }

  /* 받침 속성 — 막대가 꼭짓점에 닿아 있을 때만 "고정" 체크박스 */
  function _fulcrumPanel(sel) {
    panelRight.appendChild(_row('크기 (칸)',
      _numInput(sel.gridW, 0.5, 4, 0.5, v => {
        const ax = sel.gridX + sel.gridW / 2, baseY = sel.gridY + sel.gridH;   // 밑변 가운데를 그대로
        const size = clamp(Math.round(v * 2) / 2, 0.5, 4);
        sel.gridW = sel.gridH = size;
        sel.gridX = ax - size / 2; sel.gridY = baseY - size;
        validateAll(); renderPanel();
      })));
    const c = fulcrumRodContact(sel);
    if (c) {
      panelRight.appendChild(_note(`막대에 닿음 — 왼쪽 끝에서 ${fmtNum(c.d, 2)} m, 오른쪽 끝에서 ${fmtNum(c.rod.gridW - c.d, 2)} m`));
      panelRight.appendChild(_check('막대를 받침에 고정 (회전축)', !!sel.pinned, v => { sel.pinned = v; renderPanel(); }));
      panelRight.appendChild(_note(sel.pinned
        ? '고정: 막대가 꼭짓점을 축으로 돌기만 합니다 (들리거나 미끄러지지 않음).'
        : '받치기만: 막대가 들리거나, 마찰을 이기면 미끄러지거나, 끝을 넘어가면 떨어집니다.'));
    } else {
      panelRight.appendChild(_note('막대에 닿지 않음 — 꼭짓점을 막대 아래에 대거나 막대를 꼭짓점 위로 끌어 오면 붙습니다.'));
    }
    if (!(c && sel.pinned)) {
      panelRight.appendChild(_row('정지 마찰계수 μs (접점)',
        _slider(sel.muS ?? 0.5, 0.0, 1.5, 0.01, v => { sel.muS = v; if ((sel.muK ?? 0) > v) { sel.muK = v; renderPanel(); } })));
      panelRight.appendChild(_row('운동 마찰계수 μk (접점)',
        _slider(sel.muK ?? 0.4, 0.0, 1.5, 0.01, v => { sel.muK = Math.min(v, sel.muS ?? 0.5); renderPanel(); })));
    }
  }

  /* 앵커 → 레이블 (요소 타입 + 포인트) */
  function _anchorLabel(anchor) {
    const el  = STATE.elements.find(e => e.id === anchor.elementId);
    if (el && el.type === 'rod') return `막대 (왼쪽 끝에서 ${fmtNum(rodAnchorDist(el, anchor.attachPoint), 2)} m)`;
    if (el)  return _typeLabel(el.type) + ' (' + anchor.attachPoint + ')';
    const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
    if (seg) {
      const pt = anchor.attachPoint;
      if (pt === 'p1') return '바닥면 (끝점1)';
      if (pt === 'p2') return '바닥면 (끝점2)';
      const m = /^s(-?\d+(?:\.\d+)?)$/.exec(pt || '');
      return m ? `바닥면 (${m[1]}칸 지점)` : '바닥면';
    }
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
    if (typeof recordHistory === 'function') recordHistory();
  }

  /* ================================================================
     [전체 삭제] — 사이드바 하단 버튼: 배치된 모든 객체 제거
     (하단 pill의 "↺ 초기화"=스냅샷 복원과는 무관한 별개 동작)
  ================================================================ */
  const btnClearAll = document.getElementById('btn-clear-all');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      if (STATE.simMode === 'RUNNING') return;
      openConfirmDialog({
        message: '정말 초기화하시겠습니까?\n모든 물체·바닥면·실이 삭제됩니다.',
        confirmLabel: '삭제',
        cancelLabel: '취소',
        danger: true,
        onConfirm: () => {
          STATE.elements = [];
          STATE.floorSegments = [];
          STATE.ropes = [];
          STATE.selected = null;
          renderPanel();
          drawGrid();
          validateAll();
          if (typeof recordHistory === 'function') recordHistory();
        }
      });
    });
  }
