/* ============================================================
   svg-shapes.js — 수능 물리 문항 작도 규격의 요소 모양을 SVG path 로 정의
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   모든 모양을 SVG path `d` 문자열로 만들고 Path2D 로 캔버스에 그린다.
   같은 문자열을 capture.js 가 그대로 <path d="..."> 로 내보내므로
   화면·PNG·SVG 세 출력이 한 벌의 기하를 공유한다.

   작도 규격 근거 — 2022~2026 수능 물리학Ⅰ·Ⅱ 문항 그림의 공통 관례:
     · 완전 흑백. 검정 선 + 회색 채움만 사용 (컬러 없음)
     · 지형은 가는 검정 실선 한 줄, 라벨은 글자로 (`수평면`)
     · 실체면(벽·천장)은 표면에서 멀어지며 흐려지는 회색 띠
     · 마찰 구간은 표면에 덧댄 진한 회색 띠 + `마찰` 글자
     · 물체는 가는 테두리 + 연회색 채움, 라벨은 안쪽 세리프
     · 이전/초기 위치는 점선 윤곽 (채움 없음)
     · 용수철은 지그재그가 아니라 나선 코일
     · 도르래는 동심원 3겹 + 축핀 + 2줄 요크 브래킷
     · 힘은 가는 선 + 속 찬 삼각 화살촉, 라벨은 꼬리쪽
   ============================================================ */

  /* ================================================================
     [SN] — 수능 지면 스타일 토큰
  ================================================================ */
  const SN = {
    ink:       '#000000',
    bodyFill:  '#e8e8e8',   // 물체 채움 (연회색)
    wallFill:  '#c0c0c0',   // 벽 채움
    ghostDash: [4, 3],      // 점선 윤곽 (이전 위치)
    // 선 굵기 (화면 px 고정 — 그릴 때 /scale)
    lwThin:    1.0,         // 보조선·치수선
    lwGeom:    1.3,         // 물체 윤곽·도르래·용수철
    lwTerrain: 1.7,         // 지형(바닥면)
    lwData:    2.2,         // 그래프 곡선급 강조
    font:      "'Times New Roman', 'Batang', '바탕', serif",
    fontKo:    "'Batang', '바탕', 'Nanum Myeongjo', serif",
  };

  /* Path2D 캐시 — 같은 d 문자열은 재사용 (매 프레임 생성 방지) */
  const _p2dCache = new Map();
  function p2d(d) {
    let p = _p2dCache.get(d);
    if (!p) {
      p = new Path2D(d);
      if (_p2dCache.size > 4000) _p2dCache.clear();
      _p2dCache.set(d, p);
    }
    return p;
  }

  const _n = (v) => (Math.round(v * 1000) / 1000);   // path 문자열 안정화(캐시 적중률)

  /* ================================================================
     [PATH BUILDERS] — 모두 월드 픽셀 좌표계의 SVG d 문자열 반환
  ================================================================ */

  /** 사각형 */
  function svgRect(x, y, w, h) {
    return `M ${_n(x)} ${_n(y)} H ${_n(x + w)} V ${_n(y + h)} H ${_n(x)} Z`;
  }

  /** 원 (호 2개) */
  function svgCircle(cx, cy, r) {
    return `M ${_n(cx - r)} ${_n(cy)} A ${_n(r)} ${_n(r)} 0 1 0 ${_n(cx + r)} ${_n(cy)}`
         + ` A ${_n(r)} ${_n(r)} 0 1 0 ${_n(cx - r)} ${_n(cy)} Z`;
  }

  /** 점 목록 → 폴리라인 */
  function svgPolyline(pts, close) {
    if (!pts || pts.length === 0) return '';
    let d = `M ${_n(pts[0].x)} ${_n(pts[0].y)}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${_n(pts[i].x)} ${_n(pts[i].y)}`;
    return close ? d + ' Z' : d;
  }

  /**
   * 나선 코일 용수철.
   * 축을 따라 진행하는 3D 나선을 살짝 비스듬히 본 투영:
   *   p(t) = 축·(c·t + a·sin t) + 수직·(b·cos t)
   * a 가 한 바퀴 진행량(c·π)보다 크면 고리가 서로 겹쳐 보이면서
   * 지그재그가 아닌 "감긴 코일"로 읽힌다 (수능 그림과 동일한 인상).
   * 양 끝에는 곧은 리드선을 둔다.
   */
  function svgCoil(ax, ay, bx, by, amp, coils) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return '';
    const ux = dx / len, uy = dy / len;      // 축 방향
    const px = -uy, py = ux;                 // 수직 방향

    const n    = Math.max(3, coils | 0);
    const lead = Math.min(len * 0.14, amp * 1.6);   // 양끝 직선 리드
    const span = Math.max(len - 2 * lead, len * 0.3);
    const c    = span / (2 * Math.PI * n);          // 한 라디안당 축 진행
    const b    = amp;                                // 가로(수직) 반경
    const a    = Math.max(amp * 0.5, c * Math.PI * 1.25);   // 축방향 반경 → 겹침 보장

    const at = (t) => {
      const along = lead + c * t + a * Math.sin(t) - a * Math.sin(0);
      const perp  = b * Math.cos(t);
      return { x: ax + ux * along + px * perp, y: ay + uy * along + py * perp };
    };

    const steps = Math.max(48, n * 16);
    let d = `M ${_n(ax)} ${_n(ay)}`;
    const p0 = at(0);
    d += ` L ${_n(p0.x)} ${_n(p0.y)}`;
    for (let i = 1; i <= steps; i++) {
      const q = at((i / steps) * 2 * Math.PI * n);
      d += ` L ${_n(q.x)} ${_n(q.y)}`;
    }
    d += ` L ${_n(bx)} ${_n(by)}`;
    return d;
  }

  /** 도르래 — 동심원 3겹 + 중심 축점 */
  function svgPulleyWheel(cx, cy, r) {
    return {
      rim:   svgCircle(cx, cy, r),
      inner: svgCircle(cx, cy, r * 0.78),
      hub:   svgCircle(cx, cy, r * 0.30),
      axle:  svgCircle(cx, cy, r * 0.10),
    };
  }

  /**
   * 도르래 요크(브래킷) — 축에서 고정점 방향으로 뻗는 2줄 + 끝의 핀 원.
   * angle: 브래킷이 향하는 방향(라디안, 화면 좌표), len: 길이
   */
  function svgPulleyYoke(cx, cy, r, angle, len) {
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const px = -uy, py = ux;
    const w  = r * 0.30;                       // 요크 반폭
    const ex = cx + ux * len, ey = cy + uy * len;
    return {
      arms: `M ${_n(cx + px * w)} ${_n(cy + py * w)} L ${_n(ex + px * w)} ${_n(ey + py * w)}`
          + ` M ${_n(cx - px * w)} ${_n(cy - py * w)} L ${_n(ex - px * w)} ${_n(ey - py * w)}`,
      pin: svgCircle(ex, ey, r * 0.18),
    };
  }

  /** 힘 화살표 — 가는 선 + 속 찬 삼각 화살촉 */
  function svgArrow(x1, y1, x2, y2, headLen, headW) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { shaft: '', head: '' };
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const hl = Math.min(headLen, len * 0.9);
    const bx = x2 - ux * hl, by = y2 - uy * hl;
    return {
      shaft: `M ${_n(x1)} ${_n(y1)} L ${_n(bx)} ${_n(by)}`,
      head:  `M ${_n(x2)} ${_n(y2)} L ${_n(bx + px * headW)} ${_n(by + py * headW)}`
           + ` L ${_n(bx - px * headW)} ${_n(by - py * headW)} Z`,
    };
  }

  /** 양끝 화살표 치수선 (보조선은 호출측에서 점선으로) */
  function svgDimension(x1, y1, x2, y2, headLen, headW) {
    const a = svgArrow(x1, y1, x2, y2, headLen, headW);
    const b = svgArrow(x2, y2, x1, y1, headLen, headW);
    return { shaft: a.shaft + ' ' + b.shaft, heads: a.head + ' ' + b.head };
  }

  /**
   * 경로를 한쪽(offset 방향)으로 밀어 만든 띠(band) — 마찰 구간·실체면 표시용.
   * pts: [{x,y,tx,ty}] (tx,ty = 진행 방향 단위벡터)
   * side: +1 이면 (−ty, tx) 쪽, 두께 t
   */
  function svgBand(pts, t, side) {
    if (!pts || pts.length < 2) return '';
    const s = side >= 0 ? 1 : -1;
    let fwd = `M ${_n(pts[0].x)} ${_n(pts[0].y)}`;
    for (let i = 1; i < pts.length; i++) fwd += ` L ${_n(pts[i].x)} ${_n(pts[i].y)}`;
    let back = '';
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      back += ` L ${_n(p.x + s * (-p.ty) * t)} ${_n(p.y + s * (p.tx) * t)}`;
    }
    return fwd + back + ' Z';
  }

  /* ================================================================
     [DRAW HELPERS] — Path2D 로 캔버스에 그리기
  ================================================================ */

  /** 선 그리기 (굵기는 화면 px 고정) */
  function snStroke(ctx, d, lw, color, dash) {
    if (!d) return;
    const s = VIEWPORT.scale;
    ctx.save();
    ctx.strokeStyle = color || SN.ink;
    ctx.lineWidth   = (lw || SN.lwGeom) / s;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    if (dash) ctx.setLineDash(dash.map(v => v / s));
    ctx.stroke(p2d(d));
    ctx.restore();
  }

  /** 채우기 */
  function snFill(ctx, d, color) {
    if (!d) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fill(p2d(d));
    ctx.restore();
  }

  /** 채움 + 테두리 (물체 기본 표현) */
  function snShape(ctx, d, fill, lw) {
    snFill(ctx, d, fill || SN.bodyFill);
    snStroke(ctx, d, lw || SN.lwGeom, SN.ink);
  }

  /**
   * 라벨이 상자 안에 들어가는지 판정.
   * 수능은 물체 안에 짧은 기호(A, B)를 넣고 질량(m, 2m)은 밖에 쓴다.
   * 우리는 질량 숫자를 쓰므로, 안에 안 들어가면 물체 위로 빼서 겹침을 막는다.
   * 폭 추정: 세리프 숫자·영문 평균 자폭 ≈ 0.55em.
   */
  function snLabelFits(text, sizePx, boxWidthPx) {
    return (String(text).length * 0.55 * sizePx) <= boxWidthPx * 0.92;
  }

  /** 수능 지면 서체 라벨 — 화면 px 고정 크기 */
  function snLabel(ctx, text, x, y, sizePx, opt) {
    const s = VIEWPORT.scale;
    ctx.save();
    ctx.fillStyle    = (opt && opt.color) || SN.ink;
    ctx.font         = `${(opt && opt.italic) ? 'italic ' : ''}${sizePx / s}px ${(opt && opt.ko) ? SN.fontKo : SN.font}`;
    ctx.textAlign    = (opt && opt.align)    || 'center';
    ctx.textBaseline = (opt && opt.baseline) || 'middle';
    if (opt && opt.halo) {                     // 선 위에 겹칠 때 가독성 확보
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = (opt.halo) / s;
      ctx.lineJoin    = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** 표면에서 멀어지며 흐려지는 회색 띠 (실체면 표시) */
  function snSolidGradient(ctx, x0, y0, nx, ny, depth, strength) {
    const g = ctx.createLinearGradient(x0, y0, x0 + nx * depth, y0 + ny * depth);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  }
