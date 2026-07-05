/* ============================================================
   elements.js — Element 기반 클래스 + 요소/Connection 클래스
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [ELEMENTS] — 기반 클래스 + 7종 요소/Connection 클래스
  ================================================================ */

  /* ── 공통 헬퍼 ── */
  function makeId() {
    return Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  /* ── 선택 외곽선 (파란 점선) 그리기 헬퍼 ── */
  function drawSelectionBox(ctx, wx, wy, ww, wh) {
    const s = VIEWPORT.scale;
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth   = 2 / s;
    ctx.setLineDash([4 / s, 3 / s]);
    ctx.strokeRect(wx - 2 / s, wy - 2 / s, ww + 4 / s, wh + 4 / s);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ── 화살표 그리기 헬퍼 ── */
  function drawArrow(ctx, x1, y1, x2, y2, color) {
    const s  = VIEWPORT.scale;
    const lw = 1.5 / s;
    const hw = 5  / s;  // 화살촉 크기
    const hl = 8  / s;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux; // 수직

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = lw;

    // 선
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * hl, y2 - uy * hl);
    ctx.stroke();

    // 화살촉
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * hl + px * hw, y2 - uy * hl + py * hw);
    ctx.lineTo(x2 - ux * hl - px * hw, y2 - uy * hl - py * hw);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ──────────────────────────────────────────────────────────────
     기반 클래스 Element
  ────────────────────────────────────────────────────────────── */
  class Element {
    constructor() {
      this.id       = makeId();
      this.type     = '';
      this.gridX    = 49;
      this.gridY    = 49;
      this.gridW    = 1;
      this.gridH    = 1;
      this.rotation = 0;         // 디스플레이 회전 (degree)
      this._snapRotation = null;  // 바닥면 스냅 임시 회전 (radian)
      this.selected = false;
    }

    /** 월드 픽셀 bounding box { x, y, w, h } */
    getBBox() {
      const cs = CONFIG.cellSize;
      return {
        x: this.gridX * cs,
        y: this.gridY * cs,
        w: this.gridW * cs,
        h: this.gridH * cs,
      };
    }

    /** 순수 데이터 객체 */
    serialize() {
      return { ...this };
    }

    /** 깊은 복사 */
    clone() {
      const C = Object.create(Object.getPrototypeOf(this));
      Object.assign(C, JSON.parse(JSON.stringify(this)));
      C.id = makeId();
      return C;
    }

    draw(ctx) {}

    /** 선택 외곽선 — 기본 bbox 기준 */
    drawSelection(ctx) {
      const b = this.getBBox();
      drawSelectionBox(ctx, b.x, b.y, b.w, b.h);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     RectBody — 네모 물체
  ────────────────────────────────────────────────────────────── */
  class RectBody extends Element {
    constructor() {
      super();
      this.type  = 'rect';
      this.gridW = 1;
      this.gridH = 1;
      this.mass  = 1.0;
      this.vx0   = 0;
      this.vy0   = 0;
      this.e     = CONFIG.DEFAULT_E;
      // 런타임 (시뮬레이션)
      this.vx = 0; this.vy = 0;
      this.ax = 0; this.ay = 0;
      this.physX = 0; this.physY = 0;
    }

    draw(ctx) {
      const cs = CONFIG.cellSize;
      const s  = VIEWPORT.scale;
      const bx = this.gridX * cs;
      const by = this.gridY * cs;
      const bw = this.gridW * cs;
      const bh = this.gridH * cs;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;

      ctx.save();
      // 스냅 회전(임시, radian) 또는 일반 회전(degree) 적용
      const _rotRad = (this._snapRotation !== null)
        ? this._snapRotation
        : this.rotation * Math.PI / 180;
      if (_rotRad !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(_rotRad);
        ctx.translate(-cx, -cy);
      }

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth   = 2 / s;
      ctx.fillStyle   = 'rgba(226,232,240,0.08)';
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();

      // 질량 레이블
      const fontSize = Math.max(8, Math.min(14, bh * 0.35));
      ctx.fillStyle  = '#94a3b8';
      ctx.font       = `${fontSize / s}px 'Courier New', monospace`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.mass + 'kg', cx, cy);

      ctx.restore();

      if (STATE.selected === this) this.drawSelection(ctx);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     CircleBody — 원 물체
  ────────────────────────────────────────────────────────────── */
  class CircleBody extends Element {
    constructor() {
      super();
      this.type  = 'circle';
      this.gridW = 1;
      this.gridH = 1;
      this.mass  = 1.0;
      this.vx0   = 0;
      this.vy0   = 0;
      this.e     = CONFIG.DEFAULT_E;
      this.vx = 0; this.vy = 0;
      this.ax = 0; this.ay = 0;
      this.physX = 0; this.physY = 0;
      // 회전 물리량 (균일 원판: I = 1/2 m r²)
      this.omega  = 0;   // 각속도 [rad/s] (반시계=양수)
      this.theta  = 0;   // 누적 회전각 [rad] (렌더용)
      this.alpha  = 0;   // 각가속도 [rad/s²]
    }

    draw(ctx) {
      const cs = CONFIG.cellSize;
      const s  = VIEWPORT.scale;
      const bx = this.gridX * cs;
      const by = this.gridY * cs;
      const bw = this.gridW * cs;
      const bh = this.gridH * cs;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const r  = bw / 2;

      ctx.save();
      if (this.rotation !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth   = 2 / s;
      ctx.fillStyle   = 'rgba(226,232,240,0.08)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 질량 레이블 — theta만큼 회전하여 굴림 운동 시각화
      const thetaRender = this.theta || 0;
      const fontSize = Math.max(8, Math.min(14, r * 0.7));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-thetaRender);   // 화면 y반전 보정: 물리 반시계 = 화면 시계
      ctx.fillStyle    = '#94a3b8';
      ctx.font         = `bold ${fontSize / s}px 'Courier New', monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.mass + 'kg', 0, 0);
      ctx.restore();

      ctx.restore();

      if (STATE.selected === this) this.drawSelection(ctx);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     ForceZone — 힘 구간 (회전 없음)
  ────────────────────────────────────────────────────────────── */
  class ForceZone extends Element {
    constructor() {
      super();
      this.type  = 'forceZone';
      this.gridW = 2;
      this.gridH = 2;
      this.fx    = 0;
      this.fy    = 10;  // 기본: 위쪽 힘
    }

    draw(ctx) {
      const cs = CONFIG.cellSize;
      const s  = VIEWPORT.scale;
      const bx = this.gridX * cs;
      const by = this.gridY * cs;
      const bw = this.gridW * cs;
      const bh = this.gridH * cs;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;

      // 반투명 파란 채우기
      ctx.save();
      ctx.fillStyle   = 'rgba(59,130,246,0.12)';
      ctx.strokeStyle = 'rgba(59,130,246,0.5)';
      ctx.lineWidth   = 1.5 / s;
      ctx.setLineDash([4 / s, 3 / s]);
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // "F" 레이블
      ctx.fillStyle    = 'rgba(147,197,253,0.8)';
      ctx.font         = `bold ${Math.max(10, bh * 0.25) / s}px 'Courier New', monospace`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('F', bx + 3 / s, by + 3 / s);

      // 힘 화살표 (fx, fy 방향)
      const fxN = this.fx, fyN = this.fy;
      const mag = Math.hypot(fxN, fyN);
      if (mag > 0) {
        const arrowLen = Math.min(bw, bh) * 0.35;
        const ux = fxN / mag;
        const uy = -fyN / mag;  // 화면 y축 반전 (fy 양수 = 위쪽 = 화면 -y)
        drawArrow(ctx,
          cx - ux * arrowLen * 0.3,
          cy - uy * arrowLen * 0.3,
          cx + ux * arrowLen * 0.7,
          cy + uy * arrowLen * 0.7,
          'rgba(147,197,253,0.9)'
        );
      }
      ctx.restore();

      if (STATE.selected === this) this.drawSelection(ctx);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     Pulley — 도르래
  ────────────────────────────────────────────────────────────── */
  class Pulley extends Element {
    constructor() {
      super();
      this.type             = 'pulley';
      this.gridW            = 2;   // 항상 정사각형 (gridW === gridH)
      this.gridH            = 2;
      this.mass             = 1.0;   // 도르래 질량 (중력 적용)
      this.vx0              = 0;
      this.vy0              = 0;
      this.vx = 0; this.vy = 0;
      this.ax = 0; this.ay = 0;
      this.physX = 0; this.physY = 0;
      this.connectedRopeIds = [];
    }

    draw(ctx) {
      const cs = CONFIG.cellSize;
      const s  = VIEWPORT.scale;
      const bx = this.gridX * cs;
      const by = this.gridY * cs;
      const bw = this.gridW * cs;
      const bh = this.gridH * cs;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const r  = Math.min(bw, bh) * 0.45;

      ctx.save();
      if (this.rotation !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }

      // 외곽 원
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth   = 2 / s;
      ctx.fillStyle   = 'rgba(251,191,36,0.1)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 내부 링
      ctx.strokeStyle = 'rgba(251,191,36,0.5)';
      ctx.lineWidth   = 1 / s;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();

      // 중심 핀
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5 / s, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      if (STATE.selected === this) this.drawSelection(ctx);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     Spring — 용수철
  ────────────────────────────────────────────────────────────── */
  class Spring extends Element {
    constructor() {
      super();
      this.type           = 'spring';
      this.isVertical     = false;  // false=가로, true=세로
      this.gridW          = 2;     // 가로 모드: 2칸 고정 / 세로 모드: 폭(1칸)
      this.gridH          = 1;     // 가로 모드: 높이(1칸) / 세로 모드: 2칸 고정
      this.k              = CONFIG.DEFAULT_K;
      this.L0             = 2.0;
      this.L              = 2.0;
      this.leftElementId  = null;  // 가로: 왼쪽 / 세로: 위쪽
      this.rightElementId = null;  // 가로: 오른쪽 / 세로: 아래쪽
      this.leftLocked     = false; // 왼쪽/위쪽 물체와 체결 여부
      this.rightLocked    = false; // 오른쪽/아래쪽 물체와 체결 여부
    }

    /**
     * 연결된 물체의 현재 위치에서 렌더 영역을 동적 계산.
     * 물체가 없으면 편집 시 배치된 gridX/Y/W/H 사용 (edit-time fallback).
     */
    _getRenderBounds() {
      const cs = CONFIG.cellSize;

      const topEl  = this.leftElementId
        ? (STATE.elements.find(e => e.id === this.leftElementId)
           || STATE.floorSegments.find(s => s.id === this.leftElementId))
        : null;
      const botEl  = this.rightElementId
        ? (STATE.elements.find(e => e.id === this.rightElementId)
           || STATE.floorSegments.find(s => s.id === this.rightElementId))
        : null;

      // ── fallback (연결 없음 or 편집 모드) ──
      if (!topEl || !botEl) {
        return {
          x: this.gridX * cs,
          y: this.gridY * cs,
          w: this.gridW * cs,
          h: this.gridH * cs,
        };
      }

      // FloorSegment 접촉면 월드 좌표 헬퍼
      const _segRightX = (seg) => Math.max(seg.x1, seg.x2) * cs;
      const _segLeftX  = (seg) => Math.min(seg.x1, seg.x2) * cs;
      const _segTopY   = (seg) => Math.min(seg.y1, seg.y2) * cs;  // world y: 작은값=위
      const _segBotY   = (seg) => Math.max(seg.y1, seg.y2) * cs;
      const _segMidY   = (seg) => ((seg.y1 + seg.y2) / 2) * cs;
      const _segMidX   = (seg) => ((seg.x1 + seg.x2) / 2) * cs;

      if (!this.isVertical) {
        // ── 가로 모드 ──
        const lAttachX = (topEl.type !== 'floorSegment')
          ? (topEl.gridX + topEl.gridW) * cs
          : _segRightX(topEl);   // 바닥면 오른쪽 끝 X
        const rAttachX = (botEl.type !== 'floorSegment')
          ? botEl.gridX * cs
          : _segLeftX(botEl);    // 바닥면 왼쪽 끝 X

        const w = Math.max(cs * 0.5, rAttachX - lAttachX);

        // Y 중심: rect/circle은 그 중심, FloorSegment는 spring 자체 Y 중심 사용
        const springCY = (this.gridY + this.gridH / 2) * cs;
        const leftCY  = (topEl.type !== 'floorSegment')
          ? (topEl.gridY + (topEl.gridH || this.gridH) / 2) * cs
          : springCY;
        const rightCY = (botEl.type !== 'floorSegment')
          ? (botEl.gridY + (botEl.gridH || this.gridH) / 2) * cs
          : springCY;
        const cy = (leftCY + rightCY) / 2;
        const h  = this.gridH * cs;
        return { x: lAttachX, y: cy - h / 2, w, h };

      } else {
        // ── 세로 모드 ──
        const tAttachY = (topEl.type !== 'floorSegment')
          ? (topEl.gridY + topEl.gridH) * cs
          : _segBotY(topEl);     // 바닥면 아래쪽 Y
        const bAttachY = (botEl.type !== 'floorSegment')
          ? botEl.gridY * cs
          : _segTopY(botEl);     // 바닥면 위쪽 Y

        const h = Math.max(cs * 0.5, bAttachY - tAttachY);

        // X 중심: rect/circle은 그 중심, FloorSegment는 spring 자체 중심 사용
        // (긴 바닥면의 midX를 쓰면 용수철이 옆으로 밀리는 버그 발생)
        const springCX = (this.gridX + this.gridW / 2) * cs;
        const topCX = (topEl.type !== 'floorSegment')
          ? (topEl.gridX + (topEl.gridW || this.gridW) / 2) * cs
          : springCX;
        const botCX = (botEl.type !== 'floorSegment')
          ? (botEl.gridX + (botEl.gridW || this.gridW) / 2) * cs
          : springCX;
        const cx = (topCX + botCX) / 2;
        const w  = this.gridW * cs;
        return { x: cx - w / 2, y: tAttachY, w, h };
      }
    }

    draw(ctx) {
      const cs  = CONFIG.cellSize;
      const s   = VIEWPORT.scale;
      const b   = this._getRenderBounds();
      const bx  = b.x, by = b.y, bw = b.w, bh = b.h;
      const cx  = bx + bw / 2;
      const cy  = by + bh / 2;

      // 압축/신장 색상
      const stretched  = this.L > this.L0 * 1.05;
      const compressed = this.L < this.L0 * 0.95;
      const color = stretched  ? 'rgba(252,165,165,0.85)'
                  : compressed ? 'rgba(134,239,172,0.85)'
                  : '#a78bfa';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2 / s;

      const coils = 6;

      if (!this.isVertical) {
        // ── 가로 지그재그 ──
        const margin = Math.min(bw * 0.1, cs * 0.3);
        const x0   = bx + margin;
        const x1   = bx + bw - margin;
        const span = Math.max(x1 - x0, 1);
        const amp  = Math.max(bh * 0.30, 2 / s);
        const step = span / (coils * 2);

        ctx.beginPath();
        ctx.moveTo(bx, cy); ctx.lineTo(x0, cy);
        for (let i = 0; i < coils * 2; i++) {
          ctx.lineTo(x0 + step * (i + 0.5), cy + (i % 2 === 0 ? -amp : amp));
        }
        ctx.lineTo(x1, cy); ctx.lineTo(bx + bw, cy);
        ctx.stroke();

        // k 레이블 (위쪽)
        ctx.fillStyle    = color;
        ctx.font         = `${Math.max(7, bh * 0.28) / s}px 'Courier New', monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`k=${this.k}`, cx, cy - Math.max(bh * 0.30, 2/s) - 4/s);
      } else {
        // ── 세로 지그재그 ──
        const margin = Math.min(bh * 0.1, cs * 0.3);
        const y0   = by + margin;
        const y1   = by + bh - margin;
        const span = Math.max(y1 - y0, 1);
        const amp  = Math.max(bw * 0.30, 2 / s);
        const step = span / (coils * 2);

        ctx.beginPath();
        ctx.moveTo(cx, by); ctx.lineTo(cx, y0);
        for (let i = 0; i < coils * 2; i++) {
          ctx.lineTo(cx + (i % 2 === 0 ? -amp : amp), y0 + step * (i + 0.5));
        }
        ctx.lineTo(cx, y1); ctx.lineTo(cx, by + bh);
        ctx.stroke();

        // k 레이블 (오른쪽)
        ctx.fillStyle    = color;
        ctx.font         = `${Math.max(7, bw * 0.28) / s}px 'Courier New', monospace`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`k=${this.k}`, cx + Math.max(bw * 0.30, 2/s) + 4/s, cy);
      }

      ctx.restore();

      if (STATE.selected === this) {
        drawSelectionBox(ctx, bx, by, bw, bh);
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────
     FloorSegment — 바닥면 (Connection)
  ────────────────────────────────────────────────────────────── */
  /**
   * 곡률(수학적 정의 기반) → 원호의 반지름 R, 부채꼴 스윕 각도 θ
   *
   * curvature 값 = θ / π  (즉 θ = curvature * π, 라디안)
   *   curvature → 0   : θ → 0     (거의 직선, R → ∞)
   *   curvature = 1   : θ = π     (정확히 반원, R = d/2)
   *   curvature → 2   : θ → 2π    (거의 닫힌 원, 반원보다 훨씬 굽은 오버행)
   *
   * 두 점 A,B(거리 d)를 지나는 원에서 반-현 c=d/2, 스윕각 θ일 때:
   *   c = R sin(θ/2)  →  R = c / sin(θ/2)   (항상 R ≥ c, 등호는 θ=π일 때)
   *   중심까지의 부호 있는 수직거리 h = R cos(θ/2)
   *     θ<π → h>0 (중심이 돌출 반대쪽)
   *     θ>π → h<0 (중심이 돌출 쪽으로 넘어감 → "major arc"/오버행)
   */
  function _arcRadiusFromCurvature(curvature, d) {
    const c     = d / 2;
    const t     = Math.max(0.01, Math.min(1.98, curvature));  // 0,2 근처 특이점 방지
    const theta = t * Math.PI;
    const R     = c / Math.sin(theta / 2);
    const h     = R * Math.cos(theta / 2);   // 부호 있음
    return { R, theta, h };
  }

  class FloorSegment {
    constructor(x1, y1, x2, y2) {
      this.id         = makeId();
      this.type       = 'floorSegment';
      this.isFixed    = true;    // 절대 고정 — 시뮬레이션 중 위치 불변
      this.x1         = x1;
      this.y1         = y1;
      this.x2         = x2;
      this.y2         = y2;
      this.pathType   = 'LINE';
      this.curvature  = 0.3;   // 굽음 정도 (0~1, 1=완전 반원)
      this.isFriction = false;
      this.muS        = CONFIG.DEFAULT_MU;   // 정지 마찰계수
      this.muK        = CONFIG.DEFAULT_MU * 0.8;  // 운동 마찰계수 (≤ muS)
      this.selected   = false;
    }

    draw(ctx) {
      const cs = CONFIG.cellSize;
      const s  = VIEWPORT.scale;
      const isSelected = (STATE.selected === this);

      const ax = this.x1 * cs, ay = this.y1 * cs;
      const bx = this.x2 * cs, by = this.y2 * cs;

      ctx.save();

      // ── 본선 ──
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#555555';
      ctx.lineWidth   = (isSelected ? 3 : 2.5) / s;

      ctx.beginPath();
      this._tracePath(ctx, ax, ay, bx, by);
      ctx.stroke();

      // ── 마찰 해치 오버레이 ──
      if (this.isFriction) {
        this._drawFrictionHatch(ctx, ax, ay, bx, by, s);
      }

      ctx.restore();
    }

    /** 경로 타입에 따라 ctx에 path를 쌓는 헬퍼 (beginPath/stroke 없음) */
    _tracePath(ctx, ax, ay, bx, by) {
      switch (this.pathType) {
        case 'LINE':
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          break;
        case 'ELBOW_H':
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, ay);
          ctx.lineTo(bx, by);
          break;
        case 'ELBOW_V':
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax, by);
          ctx.lineTo(bx, by);
          break;
        case 'ARC_UP':
        case 'ARC_DOWN':
          this._drawArc(ctx, ax, ay, bx, by);
          break;
      }
    }

    /**
     * 마찰 해치: 경로를 따라 5/scale px 간격으로 수직 단선 (길이 4/scale px)
     * strokeStyle '#ef4444', lineWidth 1/scale
     */
    _drawFrictionHatch(ctx, ax, ay, bx, by, s) {
      const spacing = 5 / s;
      const halfLen = 2 / s;   // 단선 절반 길이 (총 4/s)

      // 경로 샘플 포인트 생성
      const pts = this._samplePath(ax, ay, bx, by, spacing);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth   = 1 / s;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // 진행 방향 tangent
        const tx = p.tx, ty = p.ty;
        // 수직 벡터
        const nx = -ty, ny = tx;

        ctx.beginPath();
        ctx.moveTo(p.x + nx * halfLen, p.y + ny * halfLen);
        ctx.lineTo(p.x - nx * halfLen, p.y - ny * halfLen);
        ctx.stroke();
      }
    }

    /**
     * 경로를 spacing 간격으로 샘플링 → [{x, y, tx, ty}]
     * tx/ty: 진행 방향 단위벡터
     */
    _samplePath(ax, ay, bx, by, spacing) {
      const pts = [];

      if (this.pathType === 'LINE') {
        const dx = bx - ax, dy = by - ay;
        const d  = Math.hypot(dx, dy);
        if (d < 1e-6) return pts;
        const ux = dx / d, uy = dy / d;
        let t = spacing;
        while (t < d) {
          pts.push({ x: ax + ux * t, y: ay + uy * t, tx: ux, ty: uy });
          t += spacing;
        }
      } else if (this.pathType === 'ELBOW_H') {
        // 세그먼트1: (ax,ay)→(bx,ay)
        const d1 = Math.abs(bx - ax);
        const sx1 = bx > ax ? 1 : -1;
        let t = spacing;
        while (t < d1) {
          pts.push({ x: ax + sx1 * t, y: ay, tx: sx1, ty: 0 });
          t += spacing;
        }
        // 세그먼트2: (bx,ay)→(bx,by)
        const d2 = Math.abs(by - ay);
        const sy2 = by > ay ? 1 : -1;
        t = spacing;
        while (t < d2) {
          pts.push({ x: bx, y: ay + sy2 * t, tx: 0, ty: sy2 });
          t += spacing;
        }
      } else if (this.pathType === 'ELBOW_V') {
        const d1 = Math.abs(by - ay);
        const sy1 = by > ay ? 1 : -1;
        let t = spacing;
        while (t < d1) {
          pts.push({ x: ax, y: ay + sy1 * t, tx: 0, ty: sy1 });
          t += spacing;
        }
        const d2 = Math.abs(bx - ax);
        const sx2 = bx > ax ? 1 : -1;
        t = spacing;
        while (t < d2) {
          pts.push({ x: ax + sx2 * t, y: by, tx: sx2, ty: 0 });
          t += spacing;
        }
      } else {
        // ARC: _arcSamplePoints 재사용
        const raw = _arcSamplePoints(this, ax, ay, bx, by, 40);
        if (raw.length < 2) return pts;
        // 총 호 길이 계산
        let arcLen = 0;
        for (let i = 1; i < raw.length; i++) {
          arcLen += Math.hypot(raw[i].x - raw[i-1].x, raw[i].y - raw[i-1].y);
        }
        // spacing 간격으로 재샘플
        let accumulated = 0;
        let nextMark = spacing;
        for (let i = 1; i < raw.length; i++) {
          const dx = raw[i].x - raw[i-1].x;
          const dy = raw[i].y - raw[i-1].y;
          const seg = Math.hypot(dx, dy);
          if (seg < 1e-8) continue;
          const ux = dx / seg, uy = dy / seg;
          while (nextMark <= accumulated + seg) {
            const dt = nextMark - accumulated;
            pts.push({
              x: raw[i-1].x + ux * dt,
              y: raw[i-1].y + uy * dt,
              tx: ux, ty: uy,
            });
            nextMark += spacing;
          }
          accumulated += seg;
        }
      }
      return pts;
    }

    _drawArc(ctx, ax, ay, bx, by) {
      const dx  = bx - ax, dy = by - ay;
      const d   = Math.hypot(dx, dy);
      if (d < 1e-6) return;
      const { R: R_px, h } = _arcRadiusFromCurvature(this.curvature, d);  // h: 부호 있음

      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const ux = dx / d, uy = dy / d;
      const nx = -uy, ny = ux;  // 수직 단위벡터

      let cX, cY;
      if (this.pathType === 'ARC_UP') {
        cX = mx + nx * h; cY = my + ny * h;
      } else {
        cX = mx - nx * h; cY = my - ny * h;
      }

      const startAngle = Math.atan2(ay - cY, ax - cX);
      const endAngle   = Math.atan2(by - cY, bx - cX);
      // ARC_UP = hill (chord 위로 돌출) → 단호(cw, ccw=false)
      // ARC_DOWN = valley (chord 아래로 돌출) → 장호(ccw=true)
      // 기존에 반전되어 있던 버그 수정
      const ccw = this.pathType !== 'ARC_UP';

      // 캔버스 네이티브 arc()가 ccw 방향으로 startAngle→endAngle까지 자동 스윕
      // (theta>π인 major arc도 h의 부호 반전으로 center가 이동하여 자동으로 긴 호를 그림)
      ctx.arc(cX, cY, R_px, startAngle, endAngle, ccw);
    }

    drawSelection(ctx) {
      // FloorSegment 선택은 draw()에서 색으로 처리
    }

    serialize() { return { ...this }; }
  }

  /* ──────────────────────────────────────────────────────────────
     Rope — 실 (Connection)
  ────────────────────────────────────────────────────────────── */
  class Rope {
    constructor(anchorA, anchorB, ropeLength) {
      this.id              = makeId();
      this.type            = 'rope';
      this.anchorA         = anchorA;  // { elementId, attachPoint }
      this.anchorB         = anchorB;
      this.ropeLength      = ropeLength;
      this.calibratedLength = null;  // 시뮬 시작 시 실제 물리 거리로 보정
      this.selected        = false;
    }

    /** 앵커 월드 좌표 반환 (Element & FloorSegment 모두 지원) */
    _getAnchorWorld(anchor) {
      // Element에서 먼저 검색
      const el = STATE.elements.find(e => e.id === anchor.elementId);
      if (el) return getAttachPointWorld(el, anchor.attachPoint);
      // FloorSegment에서 검색
      const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
      if (seg) return getFloorSegAttachWorld(seg, anchor.attachPoint);
      return null;
    }

    draw(ctx) {
      const wA = this._getAnchorWorld(this.anchorA);
      const wB = this._getAnchorWorld(this.anchorB);
      if (!wA || !wB) return;

      const s = VIEWPORT.scale;
      ctx.save();
      ctx.strokeStyle = this.selected ? '#3b82f6' : '#f59e0b';
      ctx.lineWidth   = 1.5 / s;
      ctx.beginPath();
      ctx.moveTo(wA.x, wA.y);
      ctx.lineTo(wB.x, wB.y);
      ctx.stroke();
      ctx.restore();
    }

    drawSelection(ctx) {}
    serialize() { return { ...this }; }
  }

  /* ──────────────────────────────────────────────────────────────
     앵커 포인트 헬퍼
  ────────────────────────────────────────────────────────────── */
  function getAttachPointWorld(el, pointId) {
    const cs = CONFIG.cellSize;
    const bx = el.gridX * cs, by = el.gridY * cs;
    const bw = el.gridW * cs, bh = el.gridH * cs;
    switch (pointId) {
      case 'top':    return { x: bx + bw / 2, y: by };
      case 'bottom': return { x: bx + bw / 2, y: by + bh };
      case 'left':   return { x: bx,           y: by + bh / 2 };
      case 'right':  return { x: bx + bw,      y: by + bh / 2 };
      case 'center': return { x: bx + bw / 2,  y: by + bh / 2 };
      default:       return { x: bx + bw / 2,  y: by + bh / 2 };
    }
  }

  function getAttachPoints(el) {
    const cs = CONFIG.cellSize;
    const bx = el.gridX * cs, by = el.gridY * cs;
    const bw = el.gridW * cs, bh = el.gridH * cs;
    const cx = bx + bw / 2, cy = by + bh / 2;
    if (el.type === 'circle') {
      return [{ id: 'center', worldX: cx, worldY: cy }];
    }
    if (el.type === 'pulley') {
      // center: 도르래를 바닥/천장/물체에 고정하는 앵커
      // top/bottom/left/right: 실 연결용 앵커 (도르래 가장자리)
      return [
        { id: 'center', worldX: cx,      worldY: cy },
        { id: 'top',    worldX: cx,      worldY: by },
        { id: 'bottom', worldX: cx,      worldY: by + bh },
        { id: 'left',   worldX: bx,      worldY: cy },
        { id: 'right',  worldX: bx + bw, worldY: cy },
      ];
    }
    // Spring: 방향에 따라 양 끝단에만 앵커 (가로=left/right, 세로=top/bottom)
    if (el.type === 'spring') {
      if (!el.isVertical) {
        // 가로 모드: 왼쪽 끝 / 오른쪽 끝
        return [
          { id: 'left',  worldX: bx,      worldY: cy },
          { id: 'right', worldX: bx + bw, worldY: cy },
        ];
      } else {
        // 세로 모드: 위쪽 끝 / 아래쪽 끝
        return [
          { id: 'top',    worldX: cx, worldY: by },
          { id: 'bottom', worldX: cx, worldY: by + bh },
        ];
      }
    }
    return [
      { id: 'top',    worldX: cx,      worldY: by },
      { id: 'bottom', worldX: cx,      worldY: by + bh },
      { id: 'left',   worldX: bx,      worldY: cy },
      { id: 'right',  worldX: bx + bw, worldY: cy },
    ];
  }

  /** FloorSegment 끝점 월드 좌표 반환 */
  function getFloorSegAttachWorld(seg, pointId) {
    const cs = CONFIG.cellSize;
    if (pointId === 'p1') return { x: seg.x1 * cs, y: seg.y1 * cs };
    if (pointId === 'p2') return { x: seg.x2 * cs, y: seg.y2 * cs };
    return { x: seg.x1 * cs, y: seg.y1 * cs };
  }

  /** FloorSegment의 앵커 포인트 목록 [{id, worldX, worldY}] */
  function getFloorSegAttachPoints(seg) {
    const cs = CONFIG.cellSize;
    return [
      { id: 'p1', worldX: seg.x1 * cs, worldY: seg.y1 * cs },
      { id: 'p2', worldX: seg.x2 * cs, worldY: seg.y2 * cs },
    ];
  }

  /**
   * 앵커가 고정점인지 반환
   * - FloorSegment 끝점: true (절대 고정)
   * - Element 앵커: false (시뮬레이션에 따라 이동)
   */
  function getAnchorIsFixed(anchor) {
    const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
    return !!(seg && seg.isFixed);
  }

  /**
   * 앵커의 물리 상태 반환 — Sprint 6 로프 제약 연산에서 사용
   * 고정 앵커: { worldX, worldY, vx:0, vy:0, isFixed:true, mass:Infinity }
   * 이동 앵커: { worldX, worldY, vx, vy, isFixed:false, mass, body }
   */
  function getAnchorPhysState(anchor) {
    // FloorSegment 고정 앵커
    const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
    if (seg) {
      const w = getFloorSegAttachWorld(seg, anchor.attachPoint);
      return { worldX: w.x, worldY: w.y, vx: 0, vy: 0, isFixed: true, mass: Infinity };
    }
    // Element 이동 앵커
    const el = STATE.elements.find(e => e.id === anchor.elementId);
    if (el) {
      const w = getAttachPointWorld(el, anchor.attachPoint);
      return {
        worldX:  w.x,
        worldY:  w.y,
        vx:      el.vx  || 0,
        vy:      el.vy  || 0,
        isFixed: false,
        mass:    el.mass || 1,
        body:    el,
      };
    }
    return null;
  }
