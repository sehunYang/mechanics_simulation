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

      // 수능 규격: 가는 검정 테두리 + 연회색 채움
      snShape(ctx, svgRect(bx, by, bw, bh), SN.bodyFill, SN.lwGeom);
      // 라벨: 안에 들어가면 안쪽, 아니면 물체 위 (수능도 좁으면 밖에 쓴다)
      const _t = this.mass + ' kg';
      const _fs = Math.max(SN_FS.bodyMin, Math.min(SN_FS.bodyMax, bh * 0.34 * s));
      if (snLabelFits(_t, _fs, bw * s)) {
        snLabel(ctx, _t, cx, cy, _fs, { italic: true });
      } else {
        snLabel(ctx, _t, cx, by - 4 / s, _fs, { italic: true, baseline: 'bottom', halo: 3 });
      }

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

      // 수능 규격: 가는 검정 테두리 + 연회색 채움
      snShape(ctx, svgCircle(cx, cy, r), SN.bodyFill, SN.lwGeom);

      // 굴림 표시: 반지름 하나를 그어 회전각을 보이게 (수능은 정지 그림이라
      // 회전 표시가 없지만, 시뮬에서는 구름/미끄러짐 구분에 필요)
      const thetaRender = this.theta || 0;
      if (Math.abs(thetaRender) > 1e-9) {
        snStroke(ctx, `M ${cx} ${cy} L ${cx + r * Math.cos(-thetaRender)} ${cy + r * Math.sin(-thetaRender)}`,
                 SN.lwThin, 'rgba(0,0,0,0.45)');
      }
      const _t = this.mass + ' kg';
      const _fs = Math.max(SN_FS.bodyMin, Math.min(SN_FS.bodyMax, r * 0.66 * s));
      if (snLabelFits(_t, _fs, 2 * r * s * 0.85)) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-thetaRender);   // 화면 y반전 보정: 물리 반시계 = 화면 시계
        snLabel(ctx, _t, 0, 0, _fs, { italic: true, halo: 2.5 });
        ctx.restore();
      } else {
        snLabel(ctx, _t, cx, cy - r - 4 / s, _fs, { italic: true, baseline: 'bottom', halo: 3 });
      }

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

      // ── 수능 규격: 연회색 영역 + 가는 점선 테두리 (자기장 영역 표기와 같은 계열) ──
      const box = svgRect(bx, by, bw, bh);
      snFill(ctx, box, 'rgba(0,0,0,0.07)');
      snStroke(ctx, box, SN.lwThin, 'rgba(0,0,0,0.55)', SN.ghostDash);

      // 힘 화살표 (fx, fy 방향) — 속 찬 삼각 화살촉
      const fxN = this.fx, fyN = this.fy;
      const mag = Math.hypot(fxN, fyN);
      if (mag > 0) {
        const arrowLen = Math.min(bw, bh) * 0.4;
        const ux = fxN / mag;
        const uy = -fyN / mag;  // 화면 y축 반전 (fy 양수 = 위쪽 = 화면 -y)
        const a = svgArrow(cx - ux * arrowLen * 0.35, cy - uy * arrowLen * 0.35,
                           cx + ux * arrowLen * 0.75, cy + uy * arrowLen * 0.75,
                           8 / s, 3.4 / s);
        snStroke(ctx, a.shaft, SN.lwGeom, SN.ink);
        snFill(ctx, a.head, SN.ink);
      }

      // 크기 라벨 — 이탤릭 세리프 (F = …N)
      snLabel(ctx, `F = ${(+mag.toFixed(3))} N`, cx, by + 10 / s, SN_FS.force,
              { italic: true, halo: 3.5 });

      if (STATE.selected === this) this.drawSelection(ctx);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     ExtForce — 외력 (손으로 실을 잡고 물체를 따라 이동하며 끄는 방식)
       · 시작 시점의 실 방향을 고정 방향으로 동결.
       · 실행 내내 그 방향으로 부착 물체에 크기 N의 힘을 지속 적용
         (팽팽/이완 무관, 위치가 바뀌어도 같은 방향으로 계속 작용).
       · 앵커는 물체를 같은 오프셋으로 따라 이동(손이 함께 이동).
       · 렌더는 벡터 화살표만 (아이콘/이미지 없음).
  ────────────────────────────────────────────────────────────── */
  class ExtForce extends Element {
    constructor() {
      super();
      this.type   = 'extforce';
      this.gridW  = 1;
      this.gridH  = 1;
      this.forceN = 10;   // 힘 크기 [N]
    }

    /** 연결된 실 + 반대편(물체) 앵커 조회 (없으면 null) */
    _getAttached() {
      const rope = STATE.ropes.find(r =>
        r.anchorA.elementId === this.id || r.anchorB.elementId === this.id);
      if (!rope) return null;
      const bodyAnchor = rope.anchorA.elementId === this.id ? rope.anchorB : rope.anchorA;
      const body = STATE.elements.find(e => e.id === bodyAnchor.elementId);
      return { rope, bodyAnchor, body };
    }

    draw(ctx) {
      const cs = CONFIG.cellSize;
      const s  = VIEWPORT.scale;
      const bx = this.gridX * cs, by = this.gridY * cs;
      const bw = this.gridW * cs, bh = this.gridH * cs;
      const cx = bx + bw / 2, cy = by + bh / 2;

      // 화살표 방향: 부착 물체 → 앵커(바깥 방향, 실 따라). 실 없으면 위쪽 기본.
      let ux = 0, uy = -1;
      const att = this._getAttached();
      if (att && att.body) {
        const bw2 = getAttachPointWorld(att.body, att.bodyAnchor.attachPoint);
        const dx = cx - bw2.x, dy = cy - bw2.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-6) { ux = dx / len; uy = dy / len; }
      }

      const arrowLen = cs * 1.4;
      const tipX = cx + ux * arrowLen, tipY = cy + uy * arrowLen;

      // ── 수능 규격: 가는 검정 선 + 속 찬 삼각 화살촉, 라벨은 꼬리쪽 ──
      const a = svgArrow(cx, cy, tipX, tipY, 10 / s, 4 / s);
      snStroke(ctx, a.shaft, SN.lwGeom, SN.ink);
      snFill(ctx, a.head, SN.ink);
      snFill(ctx, svgCircle(cx, cy, 2.2 / s), SN.ink);   // 부착점 표시

      // 크기 라벨 — 화살표 옆(수직으로 비켜) 이탤릭 세리프
      const px = -uy, py = ux;
      snLabel(ctx, `${this.forceN} N`,
              cx + ux * arrowLen * 0.55 + px * (12 / s),
              cy + uy * arrowLen * 0.55 + py * (12 / s),
              SN_FS.force, { italic: true, halo: 3.5 });

      if (STATE.selected === this) this.drawSelection(ctx);
    }

    serialize() { return { ...this }; }
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
      // 도르래는 무질량 중계점 — 질량 속성 없음 (getMass()가 0 반환)
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

      // ── 수능 규격 도르래: 동심원 3겹 + 축핀, 고정점 쪽으로 2줄 요크 브래킷 ──
      // 요크 방향: center 앵커 실이 연결된 상대 쪽. 없으면 위쪽.
      let yokeAngle = -Math.PI / 2;
      const cRope = STATE.ropes.find(rp =>
        (rp.anchorA.elementId === this.id && rp.anchorA.attachPoint === 'center') ||
        (rp.anchorB.elementId === this.id && rp.anchorB.attachPoint === 'center'));
      if (cRope) {
        const other = cRope.anchorA.elementId === this.id ? cRope.anchorB : cRope.anchorA;
        const w = cRope._getAnchorWorld(other);
        if (w) {
          const dx = w.x - cx, dy = w.y - cy;
          if (Math.hypot(dx, dy) > 1e-6) yokeAngle = Math.atan2(dy, dx);
        }
      }
      const yoke = svgPulleyYoke(cx, cy, r, yokeAngle, r * 1.5);
      snStroke(ctx, yoke.arms, SN.lwGeom, SN.ink);
      snShape(ctx, yoke.pin, '#ffffff', SN.lwThin);

      const wheel = svgPulleyWheel(cx, cy, r);
      snShape(ctx, wheel.rim, '#ffffff', SN.lwGeom);
      snStroke(ctx, wheel.inner, SN.lwThin, SN.ink);
      snShape(ctx, wheel.hub, SN.bodyFill, SN.lwThin);
      snFill(ctx, wheel.axle, SN.ink);

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
      this.autoAttach     = true;  // #5: 접촉 시 자동 체결 여부
      // 실행 중 물체가 밀려나며 분리된 끝단 표시 (배치 때부터 미연결인 끝단과 구분).
      // 분리된 끝단 = 진짜 자유단 → 무질량 용수철이라 힘 전달 없음 + 자연길이 복귀.
      this._leftDetached  = false;
      this._rightDetached = false;
    }

    /**
     * 두 부착점의 월드 픽셀 좌표 { ax, ay, bx, by } (2D 회전 렌더용).
     * 양끝이 연결돼 있지 않으면 null → draw()는 편집용 bbox 폴백 사용.
     */
    getEndpointsWorld() {
      const cs = CONFIG.cellSize;
      const L = this.leftElementId
        ? (STATE.elements.find(e => e.id === this.leftElementId) || STATE.floorSegments.find(s => s.id === this.leftElementId))
        : null;
      const R = this.rightElementId
        ? (STATE.elements.find(e => e.id === this.rightElementId) || STATE.floorSegments.find(s => s.id === this.rightElementId))
        : null;
      if (!L && !R) return null;   // 양쪽 미연결 → 편집 bbox 폴백

      const face = (el, side) => {
        if (el.type === 'floorSegment') return null;
        const x = el.gridX * cs, y = el.gridY * cs, w = (el.gridW || 1) * cs, h = (el.gridH || 1) * cs;
        switch (side) {
          case 'right':  return { x: x + w,     y: y + h / 2 };
          case 'left':   return { x: x,         y: y + h / 2 };
          case 'bottom': return { x: x + w / 2, y: y + h };   // 화면 아래 = gridY+gridH
          case 'top':    return { x: x + w / 2, y: y };
        }
      };
      const segClosest = (seg, px, py) => {
        const ax = seg.x1 * cs, ay = seg.y1 * cs, bx = seg.x2 * cs, by = seg.y2 * cs;
        const dx = bx - ax, dy = by - ay, l2 = dx*dx + dy*dy;
        let t = l2 > 1e-9 ? ((px-ax)*dx + (py-ay)*dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        return { x: ax + t*dx, y: ay + t*dy };
      };
      // 미연결단(자유 핀) 월드 좌표 — 용수철 배치 위치 기준 (#3)
      const cxW = (this.gridX + this.gridW / 2) * cs;
      const cyW = (this.gridY + this.gridH / 2) * cs;
      const freeEnd = (slot) => {
        if (!this.isVertical) {
          return slot === 'left'
            ? { x: this.gridX * cs,                  y: cyW }
            : { x: (this.gridX + this.gridW) * cs,   y: cyW };
        }
        return slot === 'left'
          ? { x: cxW, y: this.gridY * cs }
          : { x: cxW, y: (this.gridY + this.gridH) * cs };
      };

      // 실행 중 분리된 끝단: 배치 위치의 핀이 아니라, 남은 물체 부착면에서
      // 자연길이(L0)만큼 떨어진 자유단으로 그린다 (용수철이 자연길이로 복귀).
      // slot 'left' = 가로 왼쪽 / 세로 위쪽 → 축 방향(A→B)은 +x / +y(화면).
      const natural = (slot, other) => {
        const d = this.L0 * cs;
        if (!this.isVertical) return { x: other.x + (slot === 'left' ? -d : d), y: other.y };
        return { x: other.x, y: other.y + (slot === 'left' ? -d : d) };
      };

      const leftSide  = this.isVertical ? 'bottom' : 'right';
      const rightSide = this.isVertical ? 'top'    : 'left';
      let A = !L ? freeEnd('left')  : face(L, leftSide);
      let B = !R ? freeEnd('right') : face(R, rightSide);
      if (!L && this._leftDetached  && B) A = natural('left',  B);
      if (!R && this._rightDetached && A) B = natural('right', A);
      if (A === null && B === null) {
        A = { x: ((L.x1 + L.x2) / 2) * cs, y: ((L.y1 + L.y2) / 2) * cs };
        B = { x: ((R.x1 + R.x2) / 2) * cs, y: ((R.y1 + R.y2) / 2) * cs };
      } else if (A === null) { A = segClosest(L, B.x, B.y); }
      else if (B === null)   { B = segClosest(R, A.x, A.y); }
      return { ax: A.x, ay: A.y, bx: B.x, by: B.y };
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

      // 수능 지면은 흑백 — 압축/신장은 색이 아니라 코일 간격(감김 수)으로 드러난다

      // ── 부착점 기반 2D 축 (양끝 연결 시) / 편집용 bbox 폴백 ──
      const ep = this.getEndpointsWorld();
      let ax, ay, bx2, by2;
      const b = this._getRenderBounds();
      if (ep) {
        ax = ep.ax; ay = ep.ay; bx2 = ep.bx; by2 = ep.by;
      } else if (!this.isVertical) {
        ax = b.x;         ay = b.y + b.h / 2; bx2 = b.x + b.w; by2 = b.y + b.h / 2;
      } else {
        ax = b.x + b.w/2; ay = b.y;           bx2 = b.x + b.w/2; by2 = b.y + b.h;
      }

      const dx = bx2 - ax, dy = by2 - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;   // 축 방향
      const px = -uy, py = ux;              // 수직 방향
      // 코일 진폭: 용수철 두께(min 변) 기준
      const thick = Math.min(this.gridW, this.gridH) * cs;
      const amp   = Math.max(thick * 0.38, 3.5 / s);

      // ── 수능 규격: 나선 코일 ──
      // 고리 개수는 용수철 상수 k 로 정한다 (k↑ → 고리 적음, svgCoilCountForK 참조)
      snStroke(ctx, svgCoil(ax, ay, bx2, by2, amp, svgCoilCountForK(this.k)), SN.lwGeom, SN.ink);

      // k 레이블 — 축 중앙에서 수직으로 살짝 띄움 (이탤릭 세리프)
      const mid = { x: ax + ux * len / 2, y: ay + uy * len / 2 };
      // 라벨은 코일 반대쪽(−수직)에 둔다 — 가로 용수철이면 위쪽.
      // 바닥에 놓인 용수철은 아래가 지면이라, 아래에 쓰면 바닥선과 겹친다.
      snLabel(ctx, `k = ${this.k}`,
              mid.x - px * (amp + 12 / VIEWPORT.scale),
              mid.y - py * (amp + 12 / VIEWPORT.scale),
              Math.max(SN_FS.springMin, Math.min(SN_FS.springMax, thick * 0.32 * VIEWPORT.scale)),
              { italic: true, halo: 3.5 });

      if (STATE.selected === this) {
        drawSelectionBox(ctx, b.x, b.y, b.w, b.h);
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

      // ── 실체면 표시 (수능 규격) ──
      //    빗금이 아니라, 표면에서 멀어지며 흐려지는 회색 띠.
      //    마찰면이면 표면에 덧댄 진한 회색 띠 + `마찰` 글자.
      this._drawSurfaceShading(ctx, ax, ay, bx, by, s);

      // ── 본선 ──
      ctx.beginPath();
      this._tracePath(ctx, ax, ay, bx, by);
      ctx.strokeStyle = isSelected ? '#1d4ed8' : SN.ink;
      ctx.lineWidth   = (isSelected ? SN.lwTerrain + 1.4 : SN.lwTerrain) / s;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.stroke();

      ctx.restore();
    }

    /**
     * 실체면·마찰 표시 — 수능 작도 규격.
     *   · 실체면(막히는 쪽): 표면에서 멀어지며 흐려지는 회색 그라데이션 띠
     *     (2026 물리학Ⅰ 9번 천장, 2022 20번 벽과 같은 표현)
     *   · 마찰 구간: 표면에 덧댄 진한 회색 띠 + `마찰` 글자
     *     (2022 20번 "마찰 구간" 과 같은 표현)
     * 방향 규약은 이전과 동일: 화면 좌표 실체면 = (−ty, tx).
     */
    _drawSurfaceShading(ctx, ax, ay, bx, by, s) {
      const chord    = Math.hypot(bx - ax, by - ay);
      const roughLen = chord * (this.pathType.startsWith('ARC') ? 2.5 : 2);
      const spacing  = Math.max(3 / s, roughLen / 900);
      const pts = this._samplePath(ax, ay, bx, by, spacing);
      if (pts.length < 2) return;

      const depth = 13 / s;    // 실체면 띠 깊이 (화면 px 고정)
      const fricT = 4.5 / s;   // 마찰 띠 두께

      // 실체면 그라데이션 — 세그먼트를 따라가며 조각별로 칠한다
      ctx.save();
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const nx = -p.ty, ny = p.tx;                    // 실체면 방향
        const g = snSolidGradient(ctx, p.x, p.y, nx, ny, depth, 0.17);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.lineTo(q.x + (-q.ty) * depth, q.y + (q.tx) * depth);
        ctx.lineTo(p.x + nx * depth,      p.y + ny * depth);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 마찰 구간 — 표면에 덧댄 진한 회색 띠
      if (this.isFriction) {
        snFill(ctx, svgBand(pts, fricT, +1), 'rgba(0,0,0,0.30)');
        const m = pts[Math.floor(pts.length / 2)];
        if (m) {
          snLabel(ctx, '마찰',
                  m.x + (-m.ty) * (depth + 10 / s),
                  m.y + ( m.tx) * (depth + 10 / s),
                  SN_FS.surface, { ko: true, halo: 3.5, color: 'rgba(0,0,0,0.78)' });
        }
      }
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

      // 수능 규격: 가는 검정 실선 한 줄 (늘어짐·두께 없음)
      snStroke(ctx, `M ${wA.x} ${wA.y} L ${wB.x} ${wB.y}`,
               SN.lwGeom, this.selected ? '#1d4ed8' : SN.ink);
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
    if (el.type === 'extforce') {
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
