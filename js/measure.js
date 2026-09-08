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
