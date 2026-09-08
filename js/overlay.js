/* ============================================================
   overlay.js — 캔버스 위 교육용 오버레이: 속도 벡터 · 자유물체도 · 잔상 궤적
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   render.js 의 drawElements 끝에서 drawOverlays(ctx) 로 불린다.
   표시 여부는 STATE.showVectors / STATE.showForces (툴바 토글).
   수능 지면은 흑백이지만 오버레이는 "학습용 덧그림" 이므로 최소한의 색을 쓴다:
     속도 = 파랑, 힘 = 진한 빨강(중력·수직항력·마찰·장력·외력), 알짜힘 = 보라 점선.
   촬영(capture.js)에는 들어가지 않는다 — 시험지 그림은 그대로 흑백으로 남는다.

   화살표 길이 = 크기 (자유물체도의 약속):
     · 힘: 한 장면에서 눈금이 하나다. 가장 무거운 물체의 무게 mg 가 OV.fRefCells 칸이 되게 잡고,
       실행 중에는 그 눈금을 고정한다(프레임마다 최대값으로 다시 맞추면 mg 가 늘었다 줄었다 하며
       "길이 = 크기" 가 깨진다). 편집 중에는 질량을 바꾸는 즉시 눈금을 다시 잡는다.
     · 속도: 절대 눈금 — 1칸 = OV.vPerCell m/s. 빨라지면 화살표가 실제로 길어진다.
     · 아주 큰 값(충돌 순간의 N 등)은 OV.maxCells 에서 잘라 그리고 자루에 끊김 표시(//)를 넣는다.
     · 눈금은 화면 왼쪽 위에 "힘 1칸 = ○ N · 속도 1칸 = ○ m/s" 로 적어 둔다.
   ============================================================ */

  const OV = {
    vColor:   '#1d4ed8',
    fColor:   '#b91c1c',
    netColor: '#7c3aed',
    ghost:    'rgba(0,0,0,0.22)',
    fRefCells: 3,     // 가장 무거운 물체의 무게 mg 화살표 길이 [칸] — 장면마다 한 번 정해지는 힘 눈금
    vPerCell:  2.5,   // 속도 눈금 [m/s per 칸] (절대)
    maxCells:  8,     // 이보다 길면 잘라 그리고 끊김 표시
    minCells:  0.08,  // 이보다 짧으면 그리지 않음 (0 에 가까운 힘)
    _kF: null,        // 현재 힘 눈금 [월드 px per N] — 실행 중 고정
  };

  /** 물체 중심 (월드 픽셀) */
  function _bodyCenterWorld(el) {
    const cs = CONFIG.cellSize;
    return { x: (el.gridX + el.gridW / 2) * cs, y: (el.gridY + el.gridH / 2) * cs };
  }

  /**
   * 화살표 한 개 (월드 좌표, 물리 방향 벡터 → 화면 y 반전).
   *   lenWorld 가 OV.maxCells 칸을 넘으면 그 길이에서 잘라 그리고 자루 중간에 끊김 표시(//)를 넣는다.
   */
  function _arrow(ctx, x, y, fx, fy, lenWorld, color, label, opt) {
    const s = VIEWPORT.scale;
    const mag = Math.hypot(fx, fy);
    if (mag < 1e-9 || lenWorld < 1e-6) return;
    const maxLen = OV.maxCells * CONFIG.cellSize;
    const cut = lenWorld > maxLen;
    if (cut) lenWorld = maxLen;
    const ux = fx / mag, uy = -fy / mag;            // 화면 y 는 아래로
    const tipX = x + ux * lenWorld, tipY = y + uy * lenWorld;
    const a = svgArrow(x, y, tipX, tipY, Math.min(10 / s, lenWorld * 0.45), 4 / s);
    snStroke(ctx, a.shaft, (opt && opt.lw) || 1.8, color, opt && opt.dash);
    snFill(ctx, a.head, color);
    if (cut) {
      // 끊김 표시: 자루 60% 지점에 짧은 빗금 두 개
      const px = -uy, py = ux, h = 5 / s, g = 3 / s;
      for (const d of [-g, g]) {
        const cx = x + ux * (lenWorld * 0.6 + d), cy = y + uy * (lenWorld * 0.6 + d);
        const path = new Path2D(); path.moveTo(cx - px * h - ux * h * 0.6, cy - py * h - uy * h * 0.6); path.lineTo(cx + px * h + ux * h * 0.6, cy + py * h + uy * h * 0.6);
        snStroke(ctx, path, 1.8, '#ffffff'); snStroke(ctx, path, 1.2, color);
      }
    }
    if (label) {
      const px = -uy, py = ux;
      const side = (opt && opt.side) || 1;
      snLabel(ctx, label, tipX + ux * (9 / s) + px * side * (9 / s), tipY + uy * (9 / s) + py * side * (9 / s),
              11, { italic: true, halo: 3, color });
    }
  }

  function _fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString(); }

  /**
   * 힘 눈금 [월드 px per N] — 가장 무거운 물체의 무게가 OV.fRefCells 칸.
   *   편집 중에는 매 프레임 다시 잡고(질량을 바꾸면 곧바로 반영), 실행 중에는 시작 때 값을 고정한다.
   */
  function _forceScale() {
    if (STATE.simMode !== 'EDIT' && OV._kF) return OV._kF;
    let mRef = 0;
    for (const el of STATE.elements) {
      if (el.type !== 'rect' && el.type !== 'circle') continue;
      mRef = Math.max(mRef, el.mass || 0);
    }
    if (mRef <= 0) mRef = 1;
    OV._kF = OV.fRefCells * CONFIG.cellSize / (mRef * CONFIG.G);
    return OV._kF;
  }
  /** 속도 눈금 [월드 px per m/s] — 절대 */
  function _velScale() { return CONFIG.cellSize / OV.vPerCell; }

  /** 눈금 안내 (화면 왼쪽 위, 화면 px 고정) */
  function _drawScaleLegend(ctx, kF, kV) {
    const cv = ctx.canvas;
    const w = cv.clientWidth || cv.width, s = VIEWPORT.scale;
    const parts = [];
    if (STATE.showForces)  parts.push(`힘 1칸 = ${_fmt(CONFIG.cellSize / kF, 1)} N`);
    if (STATE.showVectors) parts.push(`속도 1칸 = ${_fmt(OV.vPerCell, 1)} m/s`);
    if (!parts.length) return;
    const pos = screenToWorld(Math.min(14, w), 16);
    snLabel(ctx, '눈금  ' + parts.join('  ·  ') + '  (화살표 길이 = 크기)', pos.x, pos.y, 11, { align: 'left', ko: true, halo: 3, color: '#57534e' });
  }

  function drawOverlays(ctx) {
    _drawGhostTrails(ctx);
    if (!STATE.showVectors && !STATE.showForces) return;
    const cs = CONFIG.cellSize;
    const live = STATE.simMode !== 'EDIT';
    const kF = _forceScale(), kV = _velScale();
    _drawScaleLegend(ctx, kF, kV);

    for (const el of STATE.elements) {
      if (el.type !== 'rect' && el.type !== 'circle') continue;
      const c = _bodyCenterWorld(el);

      // ── 힘 (자유물체도) — 길이 = 크기 × 고정 눈금 ──
      if (STATE.showForces) {
        const k = kF;
        const f = live && el._fbd ? el._fbd
          : { g: [0, STATE.gravityOn ? -(el.mass || 1) * CONFIG.G : 0], N: [0, 0], f: [0, 0], T: [], applied: [0, 0], spring: [0, 0], other: [0, 0], bodyContact: [0, 0], net: null };
        const draw = (v, label, side) => {
          const m = Math.hypot(v[0], v[1]);
          if (m * k < OV.minCells * cs) return;
          _arrow(ctx, c.x, c.y, v[0], v[1], m * k, OV.fColor, `${label} ${_fmt(m, 1)} N`, { side });
        };
        draw(f.g, 'mg', 1);
        draw(f.N, 'N', -1);
        draw(f.f, 'f', 1);
        draw(f.applied, 'F', -1);
        draw(f.spring, 'F탄', 1);
        for (const t of f.T) draw([t.mag * t.ux, t.mag * t.uy], 'T', -1);
        if (f.bodyContact && Math.hypot(...f.bodyContact) * k >= OV.minCells * cs) draw(f.bodyContact, 'F접촉', 1);
        if (Math.hypot(...f.other) * k >= OV.minCells * cs) draw(f.other, 'F기타', 1);
        if (f.net) {
          const m = Math.hypot(f.net[0], f.net[1]);
          if (m * k >= OV.minCells * cs) _arrow(ctx, c.x, c.y, f.net[0], f.net[1], m * k, OV.netColor, `ΣF ${_fmt(m, 1)} N`, { dash: [5 / VIEWPORT.scale, 4 / VIEWPORT.scale], side: -1, lw: 1.4 });
        }
      }

      // ── 속도 — 길이 = 속력 × 절대 눈금 ──
      if (STATE.showVectors) {
        const vx = live ? (el.vx || 0) : (el.vx0 || 0), vy = live ? (el.vy || 0) : (el.vy0 || 0);
        const v = Math.hypot(vx, vy);
        const len = v * kV;
        if (len >= OV.minCells * cs) _arrow(ctx, c.x, c.y, vx, vy, len, OV.vColor, `v ${_fmt(v, 2)} m/s`, { side: 1, lw: 2 });
      }
    }
  }

  /** 직전 실행의 궤적 (초기화 뒤 잔상) — 회색 점선 */
  function _drawGhostTrails(ctx) {
    const g = (typeof SERIES !== 'undefined') && SERIES.ghost;
    if (!g) return;
    const cs = CONFIG.cellSize, s = VIEWPORT.scale, GS = CONFIG.GRID_SIZE;
    ctx.save();
    ctx.strokeStyle = OV.ghost;
    ctx.lineWidth = 1 / s;
    ctx.setLineDash([2 / s, 3 / s]);
    for (const id of Object.keys(g.bodies)) {
      const b = g.bodies[id];
      if (!b.x || b.x.length < 2) continue;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < b.x.length; i++) {
        if (!isFinite(b.x[i])) continue;
        const wx = b.x[i] * cs, wy = (GS - b.y[i]) * cs;
        if (!started) { ctx.moveTo(wx, wy); started = true; } else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
