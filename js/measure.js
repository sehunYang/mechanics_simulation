/* ============================================================
   measure.js — 선택 대상의 측정값 (속성 패널 하단 · 실행 중 갱신)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   panel.js 가 renderPanel() 안에서 buildMeasureSection(sel) 을 붙이고,
   실행 중에는 'sim:step' 마다(몇 스텝에 한 번) refreshMeasureSection() 이
   값만 다시 채운다. 물리 계산은 하지 않고 STATE·_fbd·SERIES 를 읽기만 한다.

   물체:  위치 · 속도(성분·속력) · 가속도 · 운동/위치/역학적 에너지
          중력 · 수직항력 · 마찰력(정지/운동) · 장력 · 용수철힘 · 외력 · 알짜힘
   실:    장력 · 팽팽/느슨 · 길이
   용수철: 늘어난 길이 · 탄성력 · 탄성에너지 · 주기(두 물체면 환산질량)
   ============================================================ */

  let _measSection = null;   // 현재 패널에 붙어 있는 측정 섹션
  let _measTarget  = null;

  function fmtNum(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a < 1e-9) return '0';
    const dd = d != null ? d : (a >= 100 ? 1 : a >= 10 ? 2 : 3);
    return (Math.round(v * Math.pow(10, dd)) / Math.pow(10, dd)).toString();
  }
  const _u = (v, unit, d) => fmtNum(v, d) + ' ' + unit;

  /** 측정 행 목록 [{k, v, badge?, cls?, note?}] */
  function measureRows(sel) {
    const rows = [];
    if (!sel) return rows;
    const live = STATE.simMode !== 'EDIT';
    const GS = CONFIG.GRID_SIZE;

    if (sel.type === 'rect' || sel.type === 'circle') {
      const m = sel.mass || 1;
      const cx = live ? (sel.type === 'rect' ? sel.physX + sel.gridW / 2 : sel.physX) : sel.gridX + sel.gridW / 2;
      const cy = live ? (sel.type === 'rect' ? sel.physY + sel.gridH / 2 : sel.physY) : GS - sel.gridY - sel.gridH / 2;
      const vx = live ? sel.vx : (sel.vx0 || 0), vy = live ? sel.vy : (sel.vy0 || 0);
      const v = Math.hypot(vx, vy);
      const ax = live ? (sel._axMeas || 0) : null, ay = live ? (sel._ayMeas || 0) : null;
      const g = STATE.gravityOn ? CONFIG.G : 0;
      const y0 = (typeof energyBaselineY === 'function') ? energyBaselineY() : 0;
      const ke = 0.5 * m * v * v, pe = m * g * (cy - y0);

      rows.push({ k: '위치 (x, y)', v: `(${fmtNum(cx, 2)}, ${fmtNum(cy, 2)}) m` });
      rows.push({ k: '속도 (vx, vy)', v: `(${fmtNum(vx, 2)}, ${fmtNum(vy, 2)}) m/s` });
      rows.push({ k: '속력 |v|', v: _u(v, 'm/s', 2) });
      if (live) rows.push({ k: '가속도 (ax, ay)', v: `(${fmtNum(ax, 2)}, ${fmtNum(ay, 2)}) m/s²` });
      rows.push({ k: '운동에너지 ½mv²', v: _u(ke, 'J', 2) });
      rows.push({ k: '위치에너지 mgh', v: _u(pe, 'J', 2), note: y0 > 0 ? `h 기준: 가장 낮은 바닥면 (y = ${fmtNum(y0, 1)} m)` : 'h 기준: 격자 맨 아래 (y = 0)' });
      rows.push({ k: '역학적 에너지', v: _u(ke + pe, 'J', 2) });

      const f = live ? sel._fbd : null;
      rows.push({ k: '중력 mg', v: _u(m * g, 'N', 2) });
      if (f) {
        const N = Math.hypot(f.N[0], f.N[1]);
        const fr = Math.hypot(f.f[0], f.f[1]);
        if (f.contact) {
          rows.push({ k: '수직항력 N', v: _u(N, 'N', 2) });
          if (f.contact.friction) rows.push({ k: '마찰력 f', v: _u(fr, 'N', 2), badge: f.slipping ? '운동 마찰' : (sel.type === 'circle' && Math.hypot(sel.vx, sel.vy) > 0.02 ? '정지 마찰 (구름)' : '정지 마찰'), cls: f.slipping ? 'warn' : 'ok' });
        } else {
          rows.push({ k: '수직항력 N', v: '0 N', cls: 'dim', badge: '접촉 없음' });
        }
        f.T.forEach((t, i) => rows.push({ k: f.T.length > 1 ? `장력 T${i + 1}` : '장력 T', v: _u(t.mag, 'N', 2) }));
        const sp = Math.hypot(f.spring[0], f.spring[1]);
        if (sp > 1e-6) rows.push({ k: '탄성력', v: _u(sp, 'N', 2) });
        const ap = Math.hypot(f.applied[0], f.applied[1]);
        if (ap > 1e-6) rows.push({ k: sel.drag > 0 ? '외력·힘구간·공기저항' : '외력·힘구간', v: _u(ap, 'N', 2) });
        const bc = f.bodyContact ? Math.hypot(f.bodyContact[0], f.bodyContact[1]) : 0;
        if (bc > 0.05) rows.push({ k: '물체 접촉력', v: _u(bc, 'N', 2) });
        const ot = Math.hypot(f.other[0], f.other[1]);
        if (ot > 0.05) rows.push({ k: '기타 접촉력', v: _u(ot, 'N', 2), cls: 'dim' });
        const net = Math.hypot(f.net[0], f.net[1]);
        rows.push({ k: '알짜힘 ΣF = ma', v: _u(net, 'N', 2), badge: net < 0.05 ? '평형' : null, cls: net < 0.05 ? 'ok' : null });
      } else {
        rows.push({ k: '수직항력·마찰·장력', v: '실행하면 표시', cls: 'dim' });
      }
      return rows;
    }

    if (sel.type === 'rod') return _rodRows(sel, live);
    if (sel.type === 'fulcrum') return _fulcrumRows(sel, live);

    if (sel.type === 'rope') {
      const A = _resolveAnchorWorld(sel.anchorA), B = _resolveAnchorWorld(sel.anchorB);
      const len = (A && B) ? Math.hypot(B.x - A.x, B.y - A.y) / CONFIG.cellSize : null;
      rows.push({ k: '길이', v: _u(len, 'm', 2) });
      if (live) {
        // 팽팽함 = 장력이 잡혔거나(도르래를 지나는 실은 개별 길이가 아니라 묶음으로 팽팽하다)
        //          단순 실의 길이 판정이 활성인 경우
        const hasT = sel._tension != null && sel._tension > 1e-6;
        const taut = hasT || sel._active === true;
        rows.push({ k: '상태', v: taut ? '팽팽함' : '느슨함', badge: taut ? null : '장력 0', cls: taut ? 'ok' : 'dim' });
        rows.push({ k: '장력 T', v: hasT ? _u(sel._tension, 'N', 2) : (taut ? '— (고정점 사이)' : '0 N') });
      } else {
        rows.push({ k: '장력 T', v: '실행하면 표시', cls: 'dim' });
      }
      return rows;
    }

    if (sel.type === 'spring') {
      const L = live ? (sel.L || sel.L0) : (sel.isVertical ? sel.gridH : sel.gridW);
      const x = L - sel.L0;
      rows.push({ k: '길이 L', v: _u(L, 'm', 3) });
      rows.push({ k: '변형 x = L − L₀', v: _u(x, 'm', 3), badge: x > 1e-3 ? '늘어남' : x < -1e-3 ? '압축' : '자연 길이', cls: Math.abs(x) < 1e-3 ? 'ok' : null });
      rows.push({ k: '탄성력 kx', v: _u(sel.k * Math.abs(x), 'N', 2) });
      rows.push({ k: '탄성에너지 ½kx²', v: _u(0.5 * sel.k * x * x, 'J', 3) });
      // 주기 — 한쪽이 고정이면 T = 2π√(m/k), 두 물체면 환산질량
      const bodyOf = (id) => STATE.elements.find(e => e.id === id && (e.type === 'rect' || e.type === 'circle'));
      const bL = bodyOf(sel.leftElementId), bR = bodyOf(sel.rightElementId);
      let meff = null;
      if (bL && bR) meff = (bL.mass * bR.mass) / (bL.mass + bR.mass);
      else if (bL || bR) meff = (bL || bR).mass;
      if (meff) rows.push({ k: '주기 2π√(m/k)', v: _u(2 * Math.PI * Math.sqrt(meff / sel.k), 's', 3), note: bL && bR ? '두 물체: 환산질량 사용' : null });
      return rows;
    }

    if (sel.type === 'floorSegment') {
      const dx = sel.x2 - sel.x1, dy = -(sel.y2 - sel.y1);
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      rows.push({ k: '길이', v: _u(Math.hypot(dx, dy), 'm', 2) });
      if (sel.pathType === 'LINE') rows.push({ k: '기울기 각', v: _u(ang, '°', 1) });
      if (sel.isFriction && sel.pathType === 'LINE') {
        const th = Math.abs(ang) * Math.PI / 180;
        rows.push({ k: 'tan θ vs μs', v: `${fmtNum(Math.tan(th), 3)} vs ${fmtNum(sel.muS, 2)}`, badge: Math.tan(th) > sel.muS ? '미끄러짐' : '정지 가능', cls: Math.tan(th) > sel.muS ? 'warn' : 'ok' });
      }
      return rows;
    }

    if (sel.type === 'pulley') {
      const mine = STATE.ropes.filter(r => r.anchorA.elementId === sel.id || r.anchorB.elementId === sel.id);
      const center = mine.filter(r => (r.anchorA.elementId === sel.id ? r.anchorA : r.anchorB).attachPoint === 'center');
      const fixed = center.some(r => STATE.floorSegments.some(s => s.id === (r.anchorA.elementId === sel.id ? r.anchorB : r.anchorA).elementId));
      rows.push({ k: '종류', v: fixed ? '고정 도르래' : (center.length ? '움직도르래' : '미고정'), cls: fixed || center.length ? null : 'dim' });
      rows.push({ k: '걸린 실', v: (mine.length - center.length) + '개' });
      if (live) {
        const ts = mine.filter(r => r._tension != null).map(r => r._tension);
        if (ts.length) rows.push({ k: '실 장력', v: ts.map(t => fmtNum(t, 2)).join(' / ') + ' N' });
        rows.push({ k: '속도', v: `(${fmtNum(sel.vx, 2)}, ${fmtNum(sel.vy, 2)}) m/s` });
      }
      return rows;
    }
    return rows;
  }

  /** 막대를 받치는 받침 (실행 중: 핀·접촉 기록 / 편집 중: 꼭짓점 기하) */
  function rodPivotFulcrum(rod) {
    const live = STATE.simMode !== 'EDIT';
    for (const f of STATE.elements) {
      if (f.type !== 'fulcrum') continue;
      if (live ? (f._pinRod === rod.id || f._contactRod === rod.id) : ((fulcrumRodContact(f) || {}).rod === rod)) return f;
    }
    return null;
  }
  const _rotWord = (tau) => Math.abs(tau) < 1e-6 ? null : (tau > 0 ? '반시계' : '시계');

  function _rodRows(sel, live) {
    const rows = [];
    const M = sel.mass || 1, L = sel.gridW, I = M * L * L / 12;
    const g = STATE.gravityOn ? CONFIG.G : 0;
    const GS = CONFIG.GRID_SIZE;
    const piv = rodPivotFulcrum(sel);
    rows.push({ k: '길이 L · 질량 M', v: `${fmtNum(L, 2)} m · ${fmtNum(M, 2)} kg` });
    rows.push({ k: '관성모멘트 I = ML²/12', v: _u(I, 'kg·m²', 3), note: '질량중심(가운데)을 지나는 축 기준' });

    if (!live) {
      rows.push({ k: '초기 각도 θ₀', v: _u(sel.angle0 || 0, '°', 1) });
      if (piv) {
        const A = fulcrumApexGrid(piv), c = rodGeometry(sel);
        const arm = A.x - c.cx;                      // 받침 → 질량중심 수평 거리 (격자 x 는 오른쪽 +)
        const tau = arm * M * g;                     // r × (0, −Mg) = −(cx − Ax)·Mg
        rows.push({ k: '받침', v: piv.pinned ? '고정 (회전축)' : '받치기만', badge: `왼쪽 끝에서 ${fmtNum(fulcrumRodContact(piv).d, 2)} m` });
        rows.push({ k: '무게의 돌림힘 (받침 기준)', v: _u(tau, 'N·m', 2), badge: _rotWord(tau), note: '질량중심과 받침 사이의 수평 거리 × Mg — 실·물체의 돌림힘은 실행하면 표시' });
      } else {
        rows.push({ k: '받침', v: '없음', cls: 'dim' });
      }
      return rows;
    }

    const th = sel.theta * 180 / Math.PI;
    const v = Math.hypot(sel.vx, sel.vy);
    const y0 = (typeof energyBaselineY === 'function') ? energyBaselineY() : 0;
    const ke = 0.5 * M * v * v, kr = 0.5 * I * sel.omega * sel.omega, pe = M * g * (sel.physY - y0);
    rows.push({ k: '각도 θ', v: _u(th, '°', 2) });
    rows.push({ k: '각속도 ω', v: _u(sel.omega, 'rad/s', 3), badge: Math.abs(sel.omega) < 1e-3 ? '회전 없음' : _rotWord(sel.omega) });
    rows.push({ k: '각가속도 α', v: _u(sel._alphaMeas || 0, 'rad/s²', 3) });
    rows.push({ k: '질량중심 (x, y)', v: `(${fmtNum(sel.physX, 2)}, ${fmtNum(sel.physY, 2)}) m` });
    rows.push({ k: '질량중심 속력', v: _u(v, 'm/s', 2) });
    rows.push({ k: '운동에너지 (병진 + 회전)', v: `${fmtNum(ke, 2)} + ${fmtNum(kr, 2)} J` });
    rows.push({ k: '위치에너지 Mgh', v: _u(pe, 'J', 2) });

    const f = sel._fbd;
    if (f) {
      for (const F of f.forces) {
        if (F.kind === 'g') continue;
        const mag = Math.hypot(F.fx, F.fy);
        if (mag < 1e-6) continue;
        const name = F.kind === 'T' ? '장력' : F.kind === 'R' ? '받침 반작용' : F.kind === 'N' ? (F.ref ? '받침 수직항력' : '바닥 수직항력') : '마찰력';
        rows.push({ k: `${name} ${F.label}`, v: _u(mag, 'N', 2) });
      }
      if (piv) {
        const A = piv._apex || { x: fulcrumApexGrid(piv).x, y: GS - fulcrumApexGrid(piv).y };
        // 받침 기준 — 받침 자신의 힘은 팔 길이 0 이라 빠진다
        for (const F of f.forces) {
          if (F.ref === piv) continue;
          const tau = (F.px - A.x) * F.fy - (F.py - A.y) * F.fx;
          if (Math.abs(tau) < 1e-4) continue;
          rows.push({ k: `돌림힘 τ(${F.label})`, v: _u(tau, 'N·m', 2), badge: _rotWord(tau) });
        }
        const sum = rodTorqueAbout(sel, A.x, A.y, piv);
        const still = Math.abs(sel.omega) < 1e-3;
        rows.push({ k: '돌림힘 합 Στ (받침 기준)', v: _u(sum, 'N·m', 2),
                    badge: Math.abs(sum) < 0.05 ? (still ? '회전 평형' : 'Στ = 0') : _rotWord(sum), cls: Math.abs(sum) < 0.05 ? 'ok' : null,
                    note: 'Στ = I_받침·α. 0 이면 각속도가 변하지 않는다 (멈춰 있으면 계속 멈춤).' });
      }
      const net = Math.hypot(f.net[0], f.net[1]);
      rows.push({ k: '알짜힘 ΣF = Ma', v: _u(net, 'N', 2), badge: net < 0.05 ? '힘 평형' : null, cls: net < 0.05 ? 'ok' : null });
    }
    return rows;
  }

  function _fulcrumRows(sel, live) {
    const rows = [];
    const c = fulcrumRodContact(sel);
    if (!live) {
      rows.push({ k: '막대', v: c ? (sel.pinned ? '고정 (회전축)' : '받치기만') : '닿지 않음', cls: c ? null : 'dim' });
      if (c) rows.push({ k: '접점 위치', v: `왼쪽 끝에서 ${fmtNum(c.d, 2)} m` });
      rows.push({ k: '받치는 힘', v: '실행하면 표시', cls: 'dim' });
      return rows;
    }
    const F = sel._force;
    if (!F || !F.touching) { rows.push({ k: '막대', v: '닿아 있지 않음', cls: 'dim', badge: '힘 0' }); return rows; }
    const mag = Math.hypot(F.fx, F.fy);
    if (sel._pinRod) {
      rows.push({ k: '받침 반작용 R', v: _u(mag, 'N', 2) });
      rows.push({ k: '성분 (Rx, Ry)', v: `(${fmtNum(F.fx, 2)}, ${fmtNum(F.fy, 2)}) N` });
    } else {
      rows.push({ k: '수직항력 N', v: _u(F.N, 'N', 2) });
      rows.push({ k: '마찰력 f', v: _u(Math.abs(F.f), 'N', 2) });
      rows.push({ k: '받치는 힘 (합)', v: _u(mag, 'N', 2) });
    }
    return rows;
  }

  /** 측정 섹션 DOM 생성 (renderPanel 이 붙인다) */
  function buildMeasureSection(sel) {
    const sec = document.createElement('div');
    sec.className = 'pp-meas';
    const title = document.createElement('div');
    title.className = 'panel-label';
    title.textContent = STATE.simMode === 'EDIT' ? '측정값 (초기 상태)' : '측정값 (실행 중)';
    sec.appendChild(title);
    _measSection = sec; _measTarget = sel;
    _fillMeasure(sec, sel);
    return sec;
  }

  function _fillMeasure(sec, sel) {
    // 제목은 두고 행만 교체
    while (sec.children.length > 1) sec.removeChild(sec.lastChild);
    for (const r of measureRows(sel)) {
      const row = document.createElement('div'); row.className = 'pp-row';
      const k = document.createElement('span'); k.className = 'pp-k'; k.textContent = r.k;
      const v = document.createElement('span'); v.className = 'pp-v' + (r.cls === 'dim' ? ' dim' : ''); v.textContent = r.v;
      if (r.badge) { const b = document.createElement('span'); b.className = 'pp-badge' + (r.cls && r.cls !== 'dim' ? ' ' + r.cls : ''); b.textContent = r.badge; v.appendChild(b); }
      row.appendChild(k); row.appendChild(v); sec.appendChild(row);
      if (r.note) { const n = document.createElement('div'); n.className = 'pp-note'; n.textContent = r.note; sec.appendChild(n); }
    }
  }

  /** 실행 중 값 갱신 — 패널이 열려 있고 같은 대상일 때만 */
  function refreshMeasureSection() {
    if (!_measSection || !_measSection.isConnected || !_measTarget || STATE.selected !== _measTarget) return;
    _fillMeasure(_measSection, _measTarget);
  }

  /* 몇 스텝에 한 번 (60 Hz 로 DOM 을 갈면 낭비) */
  let _measTick = 0;
  if (typeof EVENTS !== 'undefined') {
    EVENTS.on('sim:step', () => { if ((++_measTick % 4) === 0) refreshMeasureSection(); });
    EVENTS.on('sim:pause', refreshMeasureSection);
    EVENTS.on('sim:stop', () => { if (typeof renderPanel === 'function') renderPanel(); });
  }
