/* ============================================================
   overlay.js — 캔버스 위 교육용 오버레이: 속도 벡터 · 자유물체도 · 잔상 궤적
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   render.js 의 drawElements 끝에서 drawOverlays(ctx) 로 불린다.
   표시 여부는 STATE.showVectors / STATE.showForces (툴바 토글).
   수능 지면은 흑백이지만 오버레이는 "학습용 덧그림" 이므로 최소한의 색을 쓴다:
     속도 = 파랑, 힘 = 진한 빨강(중력·수직항력·마찰·장력·외력), 알짜힘 = 보라 점선.
   촬영(capture.js)에는 들어가지 않는다 — 시험지 그림은 그대로 흑백으로 남는다.
   ============================================================ */

  const OV = {
    vColor:   '#1d4ed8',
    fColor:   '#b91c1c',
    netColor: '#7c3aed',
    ghost:    'rgba(0,0,0,0.22)',
    vMaxCells: 4,     // 가장 빠른 물체의 속도 화살표 길이 [칸]
    fMaxCells: 3,     // 가장 큰 힘의 화살표 길이 [칸]
    minCells:  0.35,  // 이보다 짧으면 그리지 않음
  };

  /** 물체 중심 (월드 픽셀) */
  function _bodyCenterWorld(el) {
    const cs = CONFIG.cellSize;
    return { x: (el.gridX + el.gridW / 2) * cs, y: (el.gridY + el.gridH / 2) * cs };
  }

  /** 화살표 한 개 (월드 좌표, 물리 방향 벡터 → 화면 y 반전) */
  function _arrow(ctx, x, y, fx, fy, lenWorld, color, label, opt) {
    const s = VIEWPORT.scale;
    const mag = Math.hypot(fx, fy);
    if (mag < 1e-9 || lenWorld < 1e-6) return;
    const ux = fx / mag, uy = -fy / mag;            // 화면 y 는 아래로
    const tipX = x + ux * lenWorld, tipY = y + uy * lenWorld;
    const a = svgArrow(x, y, tipX, tipY, Math.min(10 / s, lenWorld * 0.45), 4 / s);
    snStroke(ctx, a.shaft, (opt && opt.lw) || 1.8, color, opt && opt.dash);
    snFill(ctx, a.head, color);
    if (label) {
      const px = -uy, py = ux;
      const side = (opt && opt.side) || 1;
      snLabel(ctx, label, tipX + ux * (9 / s) + px * side * (9 / s), tipY + uy * (9 / s) + py * side * (9 / s),
              11, { italic: true, halo: 3, color });
    }
  }

  function _fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString(); }

  /** 모든 물체 중 최대 속력·최대 힘 (화살표 배율 공통 기준) */
  function _overlayScales() {
    let vMax = 0, fMax = 0;
    for (const el of STATE.elements) {
      if (el.type !== 'rect' && el.type !== 'circle') continue;
      vMax = Math.max(vMax, Math.hypot(el.vx || 0, el.vy || 0));
      const f = el._fbd;
      if (f) {
        for (const v of [f.g, f.N, f.f, f.applied, f.spring, f.other, f.net, f.bodyContact || [0, 0]]) fMax = Math.max(fMax, Math.hypot(v[0], v[1]));
        for (const t of f.T) fMax = Math.max(fMax, t.mag);
      } else {
        fMax = Math.max(fMax, (el.mass || 1) * CONFIG.G);
      }
    }
    return { vMax, fMax };
  }

  function drawOverlays(ctx) {
    _drawGhostTrails(ctx);
    if (!STATE.showVectors && !STATE.showForces) return;
    const cs = CONFIG.cellSize;
    const live = STATE.simMode !== 'EDIT';
    const { vMax, fMax } = _overlayScales();

    for (const el of STATE.elements) {
      if (el.type !== 'rect' && el.type !== 'circle') continue;
      const c = _bodyCenterWorld(el);

      // ── 힘 (자유물체도) ──
      if (STATE.showForces && fMax > 1e-9) {
        const k = OV.fMaxCells * cs / fMax;
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

      // ── 속도 ──
      if (STATE.showVectors) {
        const vx = live ? (el.vx || 0) : (el.vx0 || 0), vy = live ? (el.vy || 0) : (el.vy0 || 0);
        const v = Math.hypot(vx, vy);
        const ref = live ? vMax : Math.max(vMax, v);
        if (v > 1e-6 && ref > 1e-9) {
          const len = Math.max(OV.minCells * cs, OV.vMaxCells * cs * v / ref);
          _arrow(ctx, c.x, c.y, vx, vy, len, OV.vColor, `v ${_fmt(v, 2)} m/s`, { side: 1, lw: 2 });
        }
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
