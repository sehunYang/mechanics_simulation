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
    /* 서체
       · 영문·숫자·수식 기호: HyhwpEQ (한글 수식 서체)
       · 한글: 맑은 고딕
       브라우저는 글리프 단위로 폴백하므로 한 스택에 둘 다 넣으면
       라틴/숫자는 HyhwpEQ, 한글은 맑은 고딕이 자동으로 잡힌다. */
    font:      "'HyhwpEQ', 'HYhwpEQ', "                        // 영문·숫자·수식
             + "'Malgun Gothic', '맑은 고딕', sans-serif",      // 한글 폴백
    fontKo:    "'Malgun Gothic', '맑은 고딕', "                 // 한글 우선
             + "'HyhwpEQ', sans-serif",
  };

  /* 라벨 크기 (화면 px 고정) — 가독성 우선으로 상·하한을 잡는다 */
  const SN_FS = {
    bodyMin:  10,  bodyMax: 18,   // 물체 질량
    springMin: 10, springMax: 15, // 용수철 k
    surface:  12,                 // 마찰 등 지면 글자
    force:    13,                 // 힘 크기
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
    const lead = Math.min(len * 0.16, amp * 1.8);   // 양끝 리드 구간 전체 길이
    const span = Math.max(len - 2 * lead, len * 0.3);
    const c    = span / (2 * Math.PI * n);          // 한 라디안당 축 진행
    const b    = amp;                                // 가로(수직) 반경
    const a    = Math.max(amp * 0.5, c * Math.PI * 1.25);   // 축방향 반경 → 겹침 보장

    // 코일 좌표: along = lead + c·t + a·sin t, perp = b·cos t
    //   t=0 과 t=2πn 에서 perp = +b (같은 쪽 극단), along 은 lead / lead+span.
    //   along 의 최솟값은 t=0 (f(t)=c·t+a·sin t 는 f(0)=0 이 최소) 이므로
    //   코일은 along < lead 영역으로 절대 넘어오지 않는다 → 리드와 겹치지 않음.
    const at = (t) => {
      const along = lead + c * t + a * Math.sin(t);
      const perp  = b * Math.cos(t);
      return { x: ax + ux * along + px * perp, y: ay + uy * along + py * perp };
    };
    // 축/수직 오프셋으로 점 만들기
    const P = (along, perp) => ({ x: ax + ux * along + px * perp, y: ay + uy * along + py * perp });

    // ── 리드 형태 ──
    // 축을 따라 곧게 가다가 **살짝 둥글게 돌면서 확 치솟고**, 수평으로 조금 지나
    // 코일에 물린다. 모서리는 직각이 아니라 반지름 rf 의 이차 베지에로 굴린다.
    // 치솟는 지점을 코일 시작(along=lead)보다 hor 만큼 앞에 두므로
    // 상승선이 코일과 겹치지 않는다.
    const hor = Math.min(lead * 0.5, amp * 0.7);       // 코일 앞 수평 구간
    const riseAlong = Math.max(0, lead - hor);         // 치솟는 축 위치
    const rf = Math.min(hor * 0.55, b * 0.3, riseAlong * 0.8, (len - lead - span - hor) * 0.8);

    const L = (p) => ` L ${_n(p.x)} ${_n(p.y)}`;
    // 둥근 모서리: 코너를 제어점으로 하는 이차 베지에
    const Q = (ctrl, end) => ` Q ${_n(ctrl.x)} ${_n(ctrl.y)} ${_n(end.x)} ${_n(end.y)}`;

    let d = `M ${_n(P(0, 0).x)} ${_n(P(0, 0).y)}`;
    // 시작 리드: 축 직진 → 둥근 턴 → 급상승 → 둥근 턴 → 수평 → 코일
    d += L(P(riseAlong - rf, 0));
    d += Q(P(riseAlong, 0), P(riseAlong, rf));
    d += L(P(riseAlong, b - rf));
    d += Q(P(riseAlong, b), P(riseAlong + rf, b));
    d += L(P(lead, b));

    const steps = Math.max(48, n * 16);
    for (let i = 1; i <= steps; i++) d += L(at((i / steps) * 2 * Math.PI * n));

    // 끝 리드: 코일 → 수평 → 둥근 턴 → 급하강 → 둥근 턴 → 축 직진
    const endA = lead + span + hor;
    d += L(P(endA - rf, b));
    d += Q(P(endA, b), P(endA, b - rf));
    d += L(P(endA, rf));
    d += Q(P(endA, 0), P(endA + rf, 0));
    d += L(P(len, 0));
    return d;
  }

  /**
   * 용수철 상수 k → 고리 개수.
   * 나선 용수철은 k = G·d⁴ / (8·D³·n) 이라 **감김 수 n 이 많을수록 무르다**.
   * 즉 k 가 클수록 고리가 적어야 물리적으로 맞다.
   * 다만 1/k 를 그대로 쓰면 화면에서 변화가 과격하므로 √ 로 눌러 표현만 압축한다
   * (증감 방향은 그대로 유지).
   */
  function svgCoilCountForK(k) {
    const kRef = (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_K) || 10;
    const kk   = Math.max(0.2, k > 0 ? k : kRef);
    return Math.max(4, Math.min(14, Math.round(7 * Math.sqrt(kRef / kk))));
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
