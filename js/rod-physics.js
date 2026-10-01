/* ============================================================
   rod-physics.js — 막대(강체)의 병진 + 회전 · 받침(핀 / 접촉) · 막대에 건 실
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 (physics.js 다음) ─

   기존 물체(네모·원)는 물리에서 회전 상태가 없다 (네모는 축정렬 상자). 돌림힘을 다루려면
   막대가 진짜 강체여야 하므로, 막대와 막대에 걸린 제약만 따로 이 파일에서 푼다.

   상태 (물리 좌표, y 위로)
     physX, physY : 질량중심        vx, vy : 질량중심 속도
     theta        : 각도 [rad] (반시계 +)   omega : 각속도 [rad/s]
     I = M·L²/12  (균일한 얇은 막대)

   한 서브스텝 안의 순서 (physics.js simStep / integrate 참조)
     ① applyForces : 중력·힘구간 → 질량중심 가속도
     ② integrate   : 모든 물체 속도 갱신 → rodVelocitySolve → 모든 물체 위치 갱신
                     위치를 옮기기 **전에** 속도 단계에서 제약을 풀기 때문에, 정지 마찰로 멈춰 있는
                     막대가 서브스텝마다 조금씩 기어가는(크리프) 일이 없다.
     ③ 바닥·물체 충돌 (네모·원)
     ④ rodPositionFix : 핀 어긋남·침투·실 늘어남을 위치만으로 되돌린다 (속도는 건드리지 않음)
     ⑤ 실 제약 (막대에 걸리지 않은 실만 — 막대에 건 실은 여기서 함께 푼다)

   제약 (속도 단계 · 반복 순차 임펄스, 누적 임펄스 클램프)
     · 핀(고정 받침)     : 꼭짓점과 막대 위 한 점이 일치 — 두 방향 양방향 행
     · 받침 접촉(미고정) : 꼭짓점이 중심선 아래 — 법선 λ ≥ 0, 마찰 |λt| ≤ μ·λn (정지 μs / 미끄러지면 μk)
     · 바닥면            : 막대 네 모서리 ↔ 바닥면 (단면) — 법선 + 마찰, 빠른 충돌만 반발 e
     · 실                : 팽팽할 때 길이가 늘지 않게 — λ ≥ 0 (밀 수 없다)
   한 행의 유효 역질량 = Σ (1/m + (r × d)² / I)  — 네모·원은 회전 항이 0.

   측정 (자유물체도)
     속도 단계에서 각 제약이 막대에 준 임펄스를 스텝 동안 모아 Δt 로 나누면 그 제약이 낸 힘이다.
     잔차로 거꾸로 푸는 네모·원과 달리, 막대는 미지수(받침 2축 + 장력 여러 개)가 식보다 많을 수
     있어 **직접 기록**한다. 작용점도 함께 남겨 돌림힘 r × F 를 계산할 수 있다.
       rod._fbd     = { forces: [{ kind, label, fx, fy, px, py }], net:[Fx,Fy], alpha }
       fulcrum._force = { fx, fy, N, f }  (받침이 막대에 준 힘)
       rope._tension  = 막대에 건 실의 장력
   ============================================================ */

  const ROD_PHYS = {
    VEL_ITERS:    30,     // 속도 단계 반복 횟수
    POS_ITERS:    8,      // 위치 보정 반복 횟수
    CONTACT_SLOP: 0.02,   // 접촉 감지 여유 [m] — 이 안이면 닿은 것으로 본다
    MAX_PEN:      0.4,    // 이보다 깊으면 접촉으로 보지 않는다 (반대편을 지나가는 중)
    POS_SLOP:     0.001,  // 위치 보정에서 남겨 두는 침투 [m] (떨림 방지)
    BOUNCE_MIN:   0.5,    // 이보다 느린 충돌은 반발하지 않는다 [m/s]
  };

  /** 균일한 얇은 막대의 관성모멘트 (질량중심) */
  function rodInertia(el) {
    const L = el.gridW;
    return (el.mass || 1) * L * L / 12;
  }

  function _rodsOf() { return STATE.elements.filter(e => e.type === 'rod'); }

  /** 막대 위, p1 에서 d 인 점 (물리 좌표). physX/Y 는 질량중심 */
  function rodPhysPoint(el, d) {
    const s = d - rodComD(el);
    return { x: el.physX + Math.cos(el.theta) * s, y: el.physY + Math.sin(el.theta) * s };
  }

  /** 질량중심 → 그림 상자 (gridX/Y = 회전 전 상자 좌상단, 상자 가운데 = 질량중심 + u·(L/2 − d_c)) */
  function _rodSyncGrid(el) {
    const o = el.gridW / 2 - rodComD(el);
    const cx = el.physX + Math.cos(el.theta) * o, cy = el.physY + Math.sin(el.theta) * o;
    el.gridX = cx - el.gridW / 2;
    el.gridY = CONFIG.GRID_SIZE - cy - el.gridH / 2;
  }

  /** 실이 막대에 걸려 있는가 — 이런 실은 실 제약 단계가 아니라 여기서 함께 푼다 */
  function ropeTouchesRod(rope) {
    for (const a of [rope.anchorA, rope.anchorB]) {
      const el = STATE.elements.find(e => e.id === a.elementId);
      if (el && el.type === 'rod') return true;
    }
    return false;
  }

  /**
   * 막대에 건 실의 상대가 지원되는 종류인가.
   *   · 고정점·네모·원·막대 — 길이 제약 (이 파일이 푼다)
   *   · 외력 — 힘의 원천 (physics.js applyExtForces 가 작용점에 힘을 준다)
   *   · 고정 도르래의 림 — 그 도르래에 림 실이 정확히 둘이면 "도르래를 지나는 한 실" (rodPulleyRuns)
   * 움직도르래·림 실이 셋 이상인 도르래는 아직 아니다.
   */
  function rodRopeSupported(rope) {
    if (_ropeIsExt(rope)) return true;
    if (rodPulleyRuns().some(run => run.ropes.includes(rope))) return true;
    for (const a of [rope.anchorA, rope.anchorB]) {
      if (STATE.floorSegments.some(s => s.id === a.elementId)) continue;
      const el = STATE.elements.find(e => e.id === a.elementId);
      if (!el || !['rod', 'rect', 'circle'].includes(el.type)) return false;
    }
    return true;
  }

  function _ropeIsExt(rope) {
    return [rope.anchorA, rope.anchorB].some(a => { const el = STATE.elements.find(e => e.id === a.elementId); return el && el.type === 'extforce'; });
  }

  /**
   * 고정 도르래를 지나 막대에 이어진 실 — [{ pulley, ropes:[r1, r2], segs:[{ rope, rim, body }] }]
   * 도르래 중심이 실로 바닥면(천장)에 매여 있고, 림에 실이 정확히 둘, 그중 하나 이상이 막대에 걸린 경우.
   * 두 구간 길이의 합이 일정한 한 줄로 푼다 (마찰 없는 도르래 → 양쪽 장력이 같다).
   */
  function rodPulleyRuns() {
    const out = [];
    for (const p of STATE.elements) {
      if (p.type !== 'pulley') continue;
      const mine = STATE.ropes.filter(r => r.anchorA.elementId === p.id || r.anchorB.elementId === p.id);
      const centerFixed = mine.some(r => {
        const pa = r.anchorA.elementId === p.id ? r.anchorA : r.anchorB, oa = pa === r.anchorA ? r.anchorB : r.anchorA;
        return pa.attachPoint === 'center' && STATE.floorSegments.some(s => s.id === oa.elementId);
      });
      if (!centerFixed) continue;
      const rim = mine.filter(r => (r.anchorA.elementId === p.id ? r.anchorA : r.anchorB).attachPoint !== 'center');
      if (rim.length !== 2) continue;
      const segs = rim.map(r => {
        const rimA = r.anchorA.elementId === p.id ? r.anchorA : r.anchorB;
        return { rope: r, rim: rimA, body: rimA === r.anchorA ? r.anchorB : r.anchorA };
      });
      const ok = segs.every(sg => STATE.floorSegments.some(f => f.id === sg.body.elementId) ||
        ['rod', 'rect', 'circle'].includes((STATE.elements.find(e => e.id === sg.body.elementId) || {}).type));
      const hasRod = segs.some(sg => (STATE.elements.find(e => e.id === sg.body.elementId) || {}).type === 'rod');
      if (ok && hasRod) out.push({ pulley: p, ropes: rim, segs });
    }
    return out;
  }

  /** 이 실을 막대 쪽(이 파일)이 푸는가 — 막대에 직접 걸렸거나 막대로 가는 도르래 줄의 한 구간 */
  function ropeInRodSystem(rope) {
    if (_ropeIsExt(rope)) return false;
    return ropeTouchesRod(rope) || rodPulleyRuns().some(run => run.ropes.includes(rope));
  }

  /* ── 실행 시작 ── */
  function initRodPhysics() {
    const GS = CONFIG.GRID_SIZE;
    for (const el of STATE.elements) {
      if (el.type !== 'rod') continue;
      if (!(el.mass > 0)) el.mass = 0.1;
      el.theta = (el.angle0 || 0) * Math.PI / 180;
      const C = rodComGrid(el);                 // 질량중심 (편집 기하, θ = θ₀)
      el.physX = C.x; el.physY = GS - C.y;
      el.vx = 0; el.vy = 0; el.omega = 0;
      el.ax = 0; el.ay = 0; el.alpha = 0;
      el._fbd = null;
    }
    // 막대에 닿은 용수철: 축이 막대의 어느 점에 닿는지 편집 기하로 한 번 정한다 (막대가 돌아도 그 점을 따라간다)
    for (const sp of STATE.elements) {
      if (sp.type !== 'spring') continue;
      sp._rodD = {};
      const L = STATE.elements.find(e => e.id === sp.leftElementId), R = STATE.elements.find(e => e.id === sp.rightElementId);
      if (L && L.type === 'rod') sp._rodD.bottom = rodSpringD(L, 'bottom', sp, true);
      if (R && R.type === 'rod') sp._rodD.top    = rodSpringD(R, 'top',    sp, true);
    }
    for (const f of STATE.elements) {
      if (f.type !== 'fulcrum') continue;
      const A = fulcrumApexGrid(f);
      f._apex = { x: A.x, y: GS - A.y };
      f._pinRod = null; f._pinD = null; f._force = null; f._contactRod = null;
      const c = fulcrumRodContact(f);
      if (f.pinned && c) {
        f._pinRod = c.rod.id; f._pinD = c.d;
        // 허용 오차(FULCRUM_TOL) 안의 틈을 없애 첫 스텝에 핀이 막대를 잡아채지 않게
        const P = rodPhysPoint(c.rod, c.d);
        c.rod.physX += f._apex.x - P.x; c.rod.physY += f._apex.y - P.y;
        _rodSyncGrid(c.rod);
      }
    }
  }

  /** 용수철 끝이 닿은 막대 위 점 (물리) — side 'bottom' = 아랫면, 'top' = 윗면. 실행 시작 때 정한 d 를 따라 돈다 */
  function rodSpringPoint(rod, side, spring) {
    const d = rodSpringD(rod, side, spring);
    const P = rodPhysPoint(rod, d), h = (side === 'bottom' ? -1 : 1) * rod.gridH / 2;
    return { x: P.x - Math.sin(rod.theta) * h, y: P.y + Math.cos(rod.theta) * h };
  }

  /** 받침 꼭짓점의 물리 좌표 (실행 전 테스트·측정에서도 쓸 수 있게 격자에서 바로) */
  function _apexOf(f) {
    if (f._apex) return f._apex;
    const A = fulcrumApexGrid(f);
    return { x: A.x, y: CONFIG.GRID_SIZE - A.y };
  }

  /**
   * 받침 빗변 두 개 (물리 선분, 법선 = 바깥) — 네모·원이 받침에 부딪히게 바닥면 충돌에 끼워 넣는다.
   * 막대는 꼭짓점으로만 받친다 (막대 끝이 꼭짓점에 걸린 경우 빗변과 겹쳐도 밀어내지 않도록).
   */
  function fulcrumPhysSegments() {
    const GS = CONFIG.GRID_SIZE, out = [];
    for (const f of STATE.elements) {
      if (f.type !== 'fulcrum') continue;
      const Ag = fulcrumApexGrid(f), A = { x: Ag.x, y: GS - Ag.y };
      const by = GS - (f.flip ? f.gridY : f.gridY + f.gridH);
      const BL = { x: f.gridX, y: by }, BR = { x: f.gridX + f.gridW, y: by };
      const G = { x: (A.x + BL.x + BR.x) / 3, y: (A.y + BL.y + BR.y) / 3 };   // 무게중심 — 바깥 법선 판정
      for (const [p0, q0] of [[BL, A], [A, BR]]) {
        // 단면 규약: 진행 방향의 왼쪽이 법선 → 법선이 바깥을 향하도록 방향을 고른다
        let p = p0, q = q0;
        let dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        if ((-dy) * ((p.x + q.x) / 2 - G.x) + dx * ((p.y + q.y) / 2 - G.y) < 0) { p = q0; q = p0; dx = -dx; dy = -dy; }
        out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, mu: f.muS, muS: f.muS ?? 0.5, muK: f.muK ?? 0.4,
                   isFriction: (f.muS ?? 0) > 0, normalX: -dy / len, normalY: dx / len, _fulcrum: f.id });
      }
    }
    return out;
  }

  /* ================================================================
     제약 행 (velocity row)
       terms : [{ rb, rx, ry, dx, dy }]  — 한 물체당 하나. r = 작용점 − 질량중심, d = 임펄스 방향
       λ 를 적용하면 각 물체가 λ·d 의 임펄스를 작용점에서 받는다.
       Jv = Σ (v·d + ω (r × d))  — 이 값이 target 이상이 되게 한다.
  ================================================================ */

  function _rb(el) {
    if (!el) return null;
    if (el.type === 'rod') return { el, im: 1 / el.mass, ii: 1 / rodInertia(el), rod: true };
    if (el.type === 'rect') return { el, im: 1 / (el.mass || 1), ii: 0, rod: false };
    // 원: 균일 원판 I = ½mr² — 막대 위에서 구를 수 있게 회전 항을 둔다 (실은 중심에 걸려 r = 0)
    if (el.type === 'circle') { const r = el.gridW / 2, m = el.mass || 1; return { el, im: 1 / m, ii: 2 / (m * r * r), rod: false }; }
    return null;   // 바닥면·받침·도르래 등 — 움직이지 않는 상대
  }

  const _cross = (rx, ry, dx, dy) => rx * dy - ry * dx;

  function _rowK(row) {
    let k = 0;
    for (const t of row.terms) { const c = _cross(t.rx, t.ry, t.dx, t.dy); k += t.rb.im + t.rb.ii * c * c; }
    return k;
  }
  function _rowJv(row) {
    let v = 0;
    for (const t of row.terms) {
      const el = t.rb.el;
      v += el.vx * t.dx + el.vy * t.dy;
      if (t.rb.ii) v += el.omega * _cross(t.rx, t.ry, t.dx, t.dy);
    }
    return v;
  }
  function _rowApply(row, dl) {
    for (const t of row.terms) {
      const el = t.rb.el;
      el.vx += t.rb.im * dl * t.dx;
      el.vy += t.rb.im * dl * t.dy;
      if (t.rb.ii) el.omega += t.rb.ii * dl * _cross(t.rx, t.ry, t.dx, t.dy);
    }
  }
  /** 위치 단계 — 같은 행 구조로 위치·각도를 직접 옮긴다 (속도 불변) */
  function _rowShift(row, dl) {
    for (const t of row.terms) {
      const el = t.rb.el;
      el.physX += t.rb.im * dl * t.dx;
      el.physY += t.rb.im * dl * t.dy;
      if (t.rb.ii) el.theta += t.rb.ii * dl * _cross(t.rx, t.ry, t.dx, t.dy);
    }
  }

  /** 받침 꼭짓점 ↔ 막대 중심선 접촉 기하 (없으면 null) */
  function _fulcrumGeom(f, rod) {
    const A = _apexOf(f);
    const c = Math.cos(rod.theta), s = Math.sin(rod.theta);
    let nx = -s, ny = c;
    if (ny < 0) { nx = -nx; ny = -ny; }       // 받침은 아래에서 받친다 → 법선은 위쪽
    if (f.flip) { nx = -nx; ny = -ny; }        // 거꾸로 단 받침은 위에서 누른다 → 법선은 아래쪽
    if (Math.abs(ny) < 0.05) return null;      // 거의 수직인 막대는 꼭짓점에 걸리지 않는다
    const dx = A.x - rod.physX, dy = A.y - rod.physY;
    const along = dx * c + dy * s;             // 질량중심 기준
    const dP1 = along + rodComD(rod);
    if (dP1 < 0 || dP1 > rod.gridW) return null;        // 끝을 넘어감 → 떨어진다
    const gap = -(dx * nx + dy * ny);          // 중심선이 꼭짓점보다 위에 있는 거리
    return { along, gap, nx, ny, ux: c, uy: s, rx: along * c, ry: along * s };
  }

  /** 막대 네 모서리 (물리) — r 은 질량중심 기준 */
  function _rodCornersPhys(rod) {
    const c = Math.cos(rod.theta), s = Math.sin(rod.theta);
    const a = rod.gridW / 2, n = rod.gridH / 2, o = a - rodComD(rod);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
      const rx = c * (o + a * i) - s * n * j, ry = s * (o + a * i) + c * n * j;
      return { rx, ry, x: rod.physX + rx, y: rod.physY + ry };
    });
  }

  /** 모서리 하나의 가장 깊은 바닥면 접촉 (단면: 법선 쪽에서만) */
  function _cornerContact(p, segs) {
    let best = null;
    for (const seg of segs) {
      const sdx = seg.x2 - seg.x1, sdy = seg.y2 - seg.y1, l2 = sdx * sdx + sdy * sdy;
      if (l2 < 1e-12) continue;
      const t = ((p.x - seg.x1) * sdx + (p.y - seg.y1) * sdy) / l2;
      if (t < 0 || t > 1) continue;
      const signed = (p.x - seg.x1) * seg.normalX + (p.y - seg.y1) * seg.normalY;
      if (signed > ROD_PHYS.CONTACT_SLOP || signed < -ROD_PHYS.MAX_PEN) continue;
      if (!best || signed < best.signed) best = { seg, signed };
    }
    return best;
  }

  function _floorSegsForRods() {
    const segs = [];
    for (const fs of STATE.floorSegments) segs.push(...getPhysicsSegments(fs));
    return segs;
  }

  /* ── 막대 ↔ 네모·원 접촉 ──
     네모는 물리에서 축정렬 상자, 막대는 회전된 직사각형. 서로의 꼭짓점이 상대 안(또는 CONTACT_SLOP 안)에
     들어오면 접점 하나 — 법선은 가장 얕은 축. 원은 막대 상자까지의 최근접점.
     반환 [{ px, py, nx, ny, pen }]  (n = 막대 → 물체 방향, pen > 0 = 겹침) */
  function _bodyCenter(b) {
    return b.type === 'rect' ? { x: b.physX + b.gridW / 2, y: b.physY + b.gridH / 2 } : { x: b.physX, y: b.physY };
  }
  function rodBodyContacts(rod, b) {
    const out = [], SL = ROD_PHYS.CONTACT_SLOP;
    const c = Math.cos(rod.theta), sn = Math.sin(rod.theta);
    const ux = c, uy = sn, nx = -sn, ny = c;
    const a = rod.gridW / 2, hb = rod.gridH / 2, o = a - rodComD(rod);
    const RC = { x: rod.physX + ux * o, y: rod.physY + uy * o };   // 그림 상자의 가운데
    const loc = (p) => { const dx = p.x - RC.x, dy = p.y - RC.y; return { s: dx * ux + dy * uy, h: dx * nx + dy * ny }; };
    if (b.type === 'circle') {
      const r = b.gridW / 2, C = { x: b.physX, y: b.physY }, L = loc(C);
      const qs = Math.max(-a, Math.min(a, L.s)), qh = Math.max(-hb, Math.min(hb, L.h));
      const Q = { x: RC.x + ux * qs + nx * qh, y: RC.y + uy * qs + ny * qh };
      let dx = C.x - Q.x, dy = C.y - Q.y, d = Math.hypot(dx, dy);
      if (d < 1e-9) { const sg = L.h >= 0 ? 1 : -1; dx = nx * sg; dy = ny * sg; d = 0; }
      else { dx /= d; dy /= d; }
      const pen = r - d;
      if (pen > -SL) out.push({ px: C.x - dx * r, py: C.y - dy * r, nx: dx, ny: dy, pen });
      return out;
    }
    // 네모
    const x0 = b.physX, y0 = b.physY, x1 = x0 + b.gridW, y1 = y0 + b.gridH;
    // ① 네모 꼭짓점 → 막대 안
    //    막대 면(법선 ±n)에 닿은 꼭짓점들은 접점 하나로 묶어 **상자 중심 바로 아래**에 둔다.
    //    물리의 네모는 회전하지 않으므로, 꼭짓점 둘을 따로 받치면 상자가 막대의 회전을 붙잡아 버린다
    //    (실제 상자는 막대와 함께 기울며 무게를 중심선으로 싣는다). 중심이 막대 끝을 넘으면 끝에 싣는다.
    let face = null;
    for (const p of [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]) {
      const L = loc(p);
      if (Math.abs(L.s) > a + SL || Math.abs(L.h) > hb + SL) continue;
      const penN = hb - Math.abs(L.h), penU = a - Math.abs(L.s);
      if (penN <= penU) { const sg = L.h >= 0 ? 1 : -1; if (!face || penN > face.pen) face = { sg, pen: penN }; }
      else { const sg = L.s >= 0 ? 1 : -1; out.push({ px: p.x, py: p.y, nx: ux * sg, ny: uy * sg, pen: penU }); }
    }
    if (face) {
      const Lc = loc(_bodyCenter(b)), sc = Math.max(-a, Math.min(a, Lc.s));
      out.push({ px: RC.x + ux * sc + nx * hb * face.sg, py: RC.y + uy * sc + ny * hb * face.sg,
                 nx: nx * face.sg, ny: ny * face.sg, pen: face.pen });
    }
    // ② 막대 꼭짓점 → 네모 안 (막대 끝이 네모 옆면·밑면을 찌르는 경우)
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      const q = { x: RC.x + ux * a * i + nx * hb * j, y: RC.y + uy * a * i + ny * hb * j };
      if (q.x < x0 - SL || q.x > x1 + SL || q.y < y0 - SL || q.y > y1 + SL) continue;
      const opts = [{ pen: q.x - x0, nx: 1, ny: 0 }, { pen: x1 - q.x, nx: -1, ny: 0 }, { pen: q.y - y0, nx: 0, ny: 1 }, { pen: y1 - q.y, nx: 0, ny: -1 }];
      const best = opts.sort((p1, p2) => p1.pen - p2.pen)[0];
      out.push({ px: q.x, py: q.y, nx: best.nx, ny: best.ny, pen: best.pen });
    }
    return out;
  }

  /** 막대 ↔ 물체 접점 하나의 법선·마찰 행 */
  function _bodyContactRows(rod, b, k, ct) {
    const rbR = _rb(rod), rbB = _rb(b), C = _bodyCenter(b);
    const rR = { x: ct.px - rod.physX, y: ct.py - rod.physY };
    const rB = rbB.ii ? { x: ct.px - C.x, y: ct.py - C.y } : { x: 0, y: 0 };
    const tx = -ct.ny, ty = ct.nx;
    const tag = 'bodyN:' + rod.id + ':' + b.id + ':' + k;
    const n = { terms: [{ rb: rbR, rx: rR.x, ry: rR.y, dx: -ct.nx, dy: -ct.ny, px: ct.px, py: ct.py },
                        { rb: rbB, rx: rB.x, ry: rB.y, dx: ct.nx, dy: ct.ny }],
                lo: 0, hi: Infinity, target: 0, tag, kind: 'N', rod, body: b, px: ct.px, py: ct.py, normal: true,
                e: Math.sqrt((rod.e || 0) * (b.e || 0)), cn: ct };
    const muS = rod.muS ?? 0.4, muK = rod.muK ?? muS * 0.8;
    const rows = [n];
    if (muS > 0) rows.push({ terms: [{ rb: rbR, rx: rR.x, ry: rR.y, dx: -tx, dy: -ty, px: ct.px, py: ct.py },
                                     { rb: rbB, rx: rB.x, ry: rB.y, dx: tx, dy: ty }],
                             fric: n, muS, muK, target: 0, tag: tag.replace('bodyN', 'bodyF'), kind: 'f', rod, body: b, px: ct.px, py: ct.py });
    return rows;
  }

  /** 막대 제약 행 모두 만들기 — 속도 단계용 (현재 위치 기준) */
  function _buildRodRows() {
    const rows = [];
    const rods = _rodsOf();
    if (!rods.length) return rows;
    const byId = (id) => STATE.elements.find(e => e.id === id);

    for (const f of STATE.elements) {
      if (f.type !== 'fulcrum') continue;
      // ① 핀
      if (f._pinRod) {
        const rod = byId(f._pinRod);
        if (!rod) continue;
        const rb = _rb(rod), P = rodPhysPoint(rod, f._pinD);
        const rx = P.x - rod.physX, ry = P.y - rod.physY;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          rows.push({ terms: [{ rb, rx, ry, dx, dy }], lo: -Infinity, hi: Infinity, target: 0,
                      tag: 'pin:' + f.id, kind: 'R', ful: f, rod, px: P.x, py: P.y });
        }
        continue;
      }
      // ② 받침 접촉 (고정하지 않은 받침 — 어느 막대든 꼭짓점에 내려앉으면 받친다)
      for (const rod of rods) {
        const g = _fulcrumGeom(f, rod);
        if (!g || g.gap > ROD_PHYS.CONTACT_SLOP || g.gap < -ROD_PHYS.MAX_PEN) continue;
        const rb = _rb(rod), px = rod.physX + g.rx, py = rod.physY + g.ry;
        const n = { terms: [{ rb, rx: g.rx, ry: g.ry, dx: g.nx, dy: g.ny }], lo: 0, hi: Infinity, target: 0,
                    tag: 'fulcN:' + f.id + ':' + rod.id, kind: 'N', ful: f, rod, px, py, normal: true, e: 0 };
        rows.push(n);
        rod._touchSub = true;
        const muS = f.muS ?? 0.5, muK = f.muK ?? muS * 0.8;
        if (muS > 0) {
          rows.push({ terms: [{ rb, rx: g.rx, ry: g.ry, dx: g.ux, dy: g.uy }], fric: n, muS, muK, target: 0,
                      tag: 'fulcF:' + f.id + ':' + rod.id, kind: 'f', ful: f, rod, px, py });
        }
        f._contactRod = rod.id;
      }
    }

    // ③ 바닥면 ↔ 막대 모서리
    if (STATE.floorSegments.length) {
      const segs = _floorSegsForRods();
      for (const rod of rods) {
        const rb = _rb(rod);
        _rodCornersPhys(rod).forEach((p, i) => {
          const hit = _cornerContact(p, segs);
          if (!hit) return;
          const s = hit.seg, tx = -s.normalY, ty = s.normalX;
          const n = { terms: [{ rb, rx: p.rx, ry: p.ry, dx: s.normalX, dy: s.normalY }], lo: 0, hi: Infinity, target: 0,
                      tag: 'floorN:' + rod.id + ':' + i, kind: 'N', rod, px: p.x, py: p.y, normal: true, e: rod.e || 0 };
          rows.push(n);
          rod._touchSub = true;
          const muS = s.isFriction ? (s.muS ?? 0) : 0, muK = s.isFriction ? (s.muK ?? muS * 0.8) : 0;
          if (muS > 0) rows.push({ terms: [{ rb, rx: p.rx, ry: p.ry, dx: tx, dy: ty }], fric: n, muS, muK, target: 0,
                                   tag: 'floorF:' + rod.id + ':' + i, kind: 'f', rod, px: p.x, py: p.y });
        });
      }
    }

    // ③-2 막대 ↔ 네모·원 (막대 위에 올린 물체, 막대에 부딪히는 물체)
    for (const rod of rods) {
      for (const b of STATE.elements) {
        if (b.type !== 'rect' && b.type !== 'circle') continue;
        const cts = rodBodyContacts(rod, b);
        cts.forEach((ct, k) => rows.push(..._bodyContactRows(rod, b, k, ct)));
        if (cts.length) { rod._touchSub = true; b._nonConservative = true; }
      }
    }

    // ④ 막대에 건 실 (팽팽할 때만) — 외력 실은 힘, 도르래 줄은 ⑤
    const runs = rodPulleyRuns(), runRopes = new Set(runs.flatMap(r => r.ropes));
    for (const rope of STATE.ropes) {
      if (!ropeTouchesRod(rope) || _ropeIsExt(rope) || runRopes.has(rope) || !rodRopeSupported(rope)) continue;
      const row = _ropeRow(rope);
      if (row && row.active) rows.push(row);
    }
    // ⑤ 고정 도르래를 지나는 줄 — 두 구간 길이 합 일정
    for (const run of runs) {
      const row = _runRow(run);
      if (row && row.active) rows.push(row);
    }
    return rows;
  }

  /** 실 하나의 행 — 양 끝을 서로 당기는 방향. active = 팽팽함 */
  function _ropeRow(rope) {
    const A = getAttachPhysPos(rope.anchorA), B = getAttachPhysPos(rope.anchorB);
    if (!A || !B) return null;
    const dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy);
    if (dist < 1e-9) return null;
    const L = rope.calibratedLength ?? rope.ropeLength;
    const ux = dx / dist, uy = dy / dist;
    const terms = [];
    const add = (anchor, P, sx, sy, side) => {
      const el = STATE.elements.find(e => e.id === anchor.elementId);
      const rb = _rb(el);
      if (!rb) return;
      const rx = rb.rod ? P.x - el.physX : 0, ry = rb.rod ? P.y - el.physY : 0;
      terms.push({ rb, rx, ry, dx: sx, dy: sy, side, px: P.x, py: P.y });
    };
    add(rope.anchorA, A, ux, uy, 'A');
    add(rope.anchorB, B, -ux, -uy, 'B');
    if (!terms.length) return null;
    return { terms, lo: 0, hi: Infinity, target: 0, tag: 'rope:' + rope.id, kind: 'T', rope,
             active: dist >= L - 1e-4, C: L - dist };
  }

  /** 도르래 줄 행 — 각 구간 끝의 물체를 림 쪽으로 당긴다. C = L − (d₁ + d₂) */
  function _runRow(run) {
    const terms = [];
    let sum = 0, L = 0;
    for (const sg of run.segs) {
      const R = getAttachPhysPos(sg.rim), P = getAttachPhysPos(sg.body);
      if (!R || !P) return null;
      const dx = R.x - P.x, dy = R.y - P.y, d = Math.hypot(dx, dy);
      if (d < 1e-9) return null;
      sum += d; L += sg.rope.calibratedLength ?? sg.rope.ropeLength;
      const el = STATE.elements.find(e => e.id === sg.body.elementId), rb = _rb(el);
      if (!rb) continue;
      terms.push({ rb, rx: rb.rod ? P.x - el.physX : 0, ry: rb.rod ? P.y - el.physY : 0, dx: dx / d, dy: dy / d,
                   px: P.x, py: P.y, side: sg.rope.id, ref: sg.rope });
    }
    if (!terms.length) return null;
    return { terms, lo: 0, hi: Infinity, target: 0, tag: 'run:' + run.pulley.id, kind: 'T', ropes: run.ropes,
             active: sum >= L - 1e-4, C: L - sum };
  }

  /* ── 스텝 시작 / 끝 — 임펄스를 모아 힘으로 ── */
  function rodBeginStep() {
    for (const el of STATE.elements) {
      if (el.type === 'rod') {
        el._imp = new Map();
        el._ext = new Map();   // 외력·용수철처럼 힘으로 적분되는 것 — 서브스텝 합 (rodAddForce)
        el._vxPre = el.vx; el._vyPre = el.vy; el._omPre = el.omega;
      } else if (el.type === 'fulcrum') {
        el._imp = { jx: 0, jy: 0, jn: 0, jt: 0 };
        el._contactRod = null;
      }
    }
    for (const rope of STATE.ropes) rope._rodImp = ropeInRodSystem(rope) ? 0 : null;
  }

  /**
   * 막대의 한 점에 힘 (물리 좌표) — 질량중심 가속도와 각가속도로 나눠 더한다.
   * physics.js 의 외력·용수철이 부른다. key 별로 서브스텝 합을 모아 자유물체도에 남긴다.
   */
  function rodAddForce(rod, fx, fy, px, py, kind, label, key, ref) {
    const M = rod.mass || 1;
    rod.ax += fx / M; rod.ay += fy / M;
    rod.alpha += _cross(px - rod.physX, py - rod.physY, fx, fy) / rodInertia(rod);
    rod._nonConservative = true;
    if (!rod._ext) return;
    let e = rod._ext.get(key);
    if (!e) { e = { kind, label, fx: 0, fy: 0, n: 0, px, py, ref }; rod._ext.set(key, e); }
    e.fx += fx; e.fy += fy; e.n++; e.px = px; e.py = py;
  }

  function _recordRow(row) {
    if (!row.acc) return;
    for (const t of row.terms) {
      if (!t.rb.rod) continue;
      const el = t.rb.el;
      const key = row.tag + (t.side ? ':' + t.side : '');
      let e = el._imp && el._imp.get(key);
      if (!e) { e = { kind: row.kind, jx: 0, jy: 0, px: 0, py: 0, ref: t.ref || row.ful || row.rope || row.body || null }; if (el._imp) el._imp.set(key, e); }
      e.jx += row.acc * t.dx; e.jy += row.acc * t.dy;
      e.px = t.px != null ? t.px : row.px; e.py = t.py != null ? t.py : row.py;
    }
    if (row.ful && row.ful._imp) {
      const t = row.terms[0];
      row.ful._imp.jx += row.acc * t.dx; row.ful._imp.jy += row.acc * t.dy;
      if (row.kind === 'N') row.ful._imp.jn += row.acc;
      if (row.kind === 'f') row.ful._imp.jt += row.acc;
    }
    if (row.rope && row.rope._rodImp != null) row.rope._rodImp += row.acc;
    if (row.ropes) for (const rp of row.ropes) if (rp._rodImp != null) rp._rodImp += row.acc;   // 도르래 줄: 양쪽 같은 장력
    // 막대 위 물체: 바닥에 닿아 있지 않으면 막대 면을 "접촉면" 으로 알려 자유물체도가 N·f 로 나누게 한다
    if (row.body && row.kind === 'N' && row.acc > 0 && !row.body._contact) {
      row.body._contact = { nx: row.cn.nx, ny: row.cn.ny, friction: (row.rod.muS ?? 0.4) > 0,
                            muK: row.rod.muK ?? (row.rod.muS ?? 0.4) * 0.8, onRod: row.rod.id };
    }
  }

  const _LABEL = { R: 'R', N: 'N', f: 'f', T: 'T' };

  function rodEndStep(dt) {
    if (!(dt > 0)) return;
    const g = STATE.gravityOn ? CONFIG.G : 0;
    for (const el of STATE.elements) {
      if (el.type === 'rod') {
        const M = el.mass || 1;
        el._axMeas = (el.vx - el._vxPre) / dt;
        el._ayMeas = (el.vy - el._vyPre) / dt;
        el._alphaMeas = (el.omega - el._omPre) / dt;
        const forces = [{ kind: 'g', label: 'mg', fx: 0, fy: -M * g, px: el.physX, py: el.physY }];
        if (el._ext) for (const e of el._ext.values()) {
          const sub = Math.max(1, CONFIG.SUBSTEPS || 1);
          forces.push({ kind: e.kind, label: e.label, fx: e.fx / sub, fy: e.fy / sub, px: e.px, py: e.py, ref: e.ref });
        }
        if (el._imp) for (const e of el._imp.values()) {
          forces.push({ kind: e.kind, label: _LABEL[e.kind] || e.kind, fx: e.jx / dt, fy: e.jy / dt, px: e.px, py: e.py, ref: e.ref });
        }
        // 같은 종류가 여럿이면 막대 왼쪽(p1)부터 번호 — T1, T2 … (측정값·화살표·POE 가 같은 이름을 쓴다)
        const c = Math.cos(el.theta), sn = Math.sin(el.theta);
        const along = (F) => (F.px - el.physX) * c + (F.py - el.physY) * sn;
        for (const kind of ['T', 'N', 'f', 'R']) {
          const same = forces.filter(F => F.kind === kind && Math.hypot(F.fx, F.fy) > 1e-9);
          if (same.length < 2) continue;
          same.sort((a, b) => along(a) - along(b)).forEach((F, i) => { F.label = kind + (i + 1); });
        }
        el._fbd = { forces, net: [M * el._axMeas, M * el._ayMeas], alpha: el._alphaMeas };
      } else if (el.type === 'fulcrum' && el._imp) {
        const i = el._imp;
        el._force = { fx: i.jx / dt, fy: i.jy / dt, N: i.jn / dt, f: i.jt / dt, touching: !!(el._pinRod || el._contactRod) };
      }
    }
    for (const rope of STATE.ropes) {
      if (rope._rodImp == null) continue;
      rope._tension = rope._rodImp / dt;
      rope._active = rope._tension > 1e-6 || rope._active;
    }
  }

  /** 막대 ↔ 어떤 점 p 에 대한 돌림힘 합 (반시계 +) — 기록된 힘에서 */
  function rodTorqueAbout(el, px, py, skipRef) {
    if (!el._fbd) return null;
    let tau = 0;
    for (const f of el._fbd.forces) {
      if (skipRef && f.ref === skipRef) continue;
      tau += (f.px - px) * f.fy - (f.py - py) * f.fx;
    }
    return tau;
  }

  /* ================================================================
     ② 속도 단계 — integrate 가 속도 갱신 직후, 위치 갱신 직전에 부른다
  ================================================================ */
  function rodVelocitySolve(dt) {
    if (!STATE.elements.some(e => e.type === 'rod')) return;
    const rows = _buildRodRows();
    if (!rows.length) return;
    for (const row of rows) {
      row.k = _rowK(row);
      row.acc = 0;
      const v0 = _rowJv(row);
      // 빠르게 부딪힐 때만 반발 (느린 접촉은 e = 0 — 놓인 막대가 떨지 않게)
      if (row.normal && v0 < -ROD_PHYS.BOUNCE_MIN) row.target = -(row.e || 0) * v0;
      // 정지/운동 마찰: 접점이 이미 미끄러지고 있으면 μk
      if (row.fric) row.mu = Math.abs(v0) > 0.01 ? row.muK : row.muS;
    }
    for (let it = 0; it < ROD_PHYS.VEL_ITERS; it++) {
      for (const row of rows) {
        if (row.k < 1e-12) continue;
        let lo = row.lo, hi = row.hi;
        if (row.fric) { hi = row.mu * row.fric.acc; lo = -hi; }
        const next = Math.min(hi, Math.max(lo, row.acc + (row.target - _rowJv(row)) / row.k));
        const dl = next - row.acc;
        if (dl !== 0) { row.acc = next; _rowApply(row, dl); }
      }
    }
    for (const row of rows) _recordRow(row);
  }

  /* ================================================================
     ④ 위치 보정 — 핀 어긋남·침투·실 늘어남 (속도 불변)
  ================================================================ */
  function rodPositionFix() {
    const rods = _rodsOf();
    if (!rods.length) return;
    const touched = new Set(rods);
    const segs = STATE.floorSegments.length ? _floorSegsForRods() : [];
    const byId = (id) => STATE.elements.find(e => e.id === id);

    for (let it = 0; it < ROD_PHYS.POS_ITERS; it++) {
      for (const f of STATE.elements) {
        if (f.type !== 'fulcrum') continue;
        if (f._pinRod) {
          // 핀: 2×2 를 바로 푼다  K λ = −e,  K = (1/M)·I + (1/I)·r⊥ r⊥ᵀ
          const rod = byId(f._pinRod);
          if (!rod) continue;
          const A = _apexOf(f), P = rodPhysPoint(rod, f._pinD);
          const ex = P.x - A.x, ey = P.y - A.y;
          if (Math.abs(ex) + Math.abs(ey) < 1e-10) continue;
          const rx = P.x - rod.physX, ry = P.y - rod.physY;
          const im = 1 / rod.mass, ii = 1 / rodInertia(rod);
          const k11 = im + ii * ry * ry, k12 = -ii * rx * ry, k22 = im + ii * rx * rx;
          const det = k11 * k22 - k12 * k12;
          if (Math.abs(det) < 1e-14) continue;
          const lx = (-ex * k22 + ey * k12) / det, ly = (-ey * k11 + ex * k12) / det;
          rod.physX += im * lx; rod.physY += im * ly;
          rod.theta += ii * _cross(rx, ry, lx, ly);
          continue;
        }
        for (const rod of rods) {
          const g = _fulcrumGeom(f, rod);
          if (!g || g.gap >= -ROD_PHYS.POS_SLOP || g.gap < -ROD_PHYS.MAX_PEN) continue;
          const row = { terms: [{ rb: _rb(rod), rx: g.rx, ry: g.ry, dx: g.nx, dy: g.ny }] };
          _rowShift(row, -(g.gap + ROD_PHYS.POS_SLOP) / _rowK(row));
          rod._touchSub = true;
        }
      }
      if (segs.length) {
        for (const rod of rods) {
          for (const p of _rodCornersPhys(rod)) {
            const hit = _cornerContact(p, segs);
            if (!hit || hit.signed >= -ROD_PHYS.POS_SLOP) continue;
            const row = { terms: [{ rb: _rb(rod), rx: p.rx, ry: p.ry, dx: hit.seg.normalX, dy: hit.seg.normalY }] };
            _rowShift(row, -(hit.signed + ROD_PHYS.POS_SLOP) / _rowK(row));
            rod._touchSub = true;
          }
        }
      }
      for (const rod of rods) {
        for (const b of STATE.elements) {
          if (b.type !== 'rect' && b.type !== 'circle') continue;
          for (const ct of rodBodyContacts(rod, b)) {
            if (ct.pen <= ROD_PHYS.POS_SLOP) continue;
            const row = _bodyContactRows(rod, b, 0, ct)[0];
            _rowShift(row, (ct.pen - ROD_PHYS.POS_SLOP) / _rowK(row));
            touched.add(b); rod._touchSub = true;
            break;   // 접점 하나씩 — 반복이 나머지를 맞춘다
          }
        }
      }
      const runs = rodPulleyRuns(), runRopes = new Set(runs.flatMap(r => r.ropes));
      for (const rope of STATE.ropes) {
        if (!ropeTouchesRod(rope) || _ropeIsExt(rope) || runRopes.has(rope) || !rodRopeSupported(rope)) continue;
        const row = _ropeRow(rope);
        if (!row || row.C >= 0) continue;
        for (const t of row.terms) touched.add(t.rb.el);
        _rowShift(row, -row.C / _rowK(row));
      }
      for (const run of runs) {
        const row = _runRow(run);
        if (!row || row.C >= 0) continue;
        for (const t of row.terms) touched.add(t.rb.el);
        _rowShift(row, -row.C / _rowK(row));
      }
    }
    for (const el of touched) {
      if (el.type === 'rod') _rodSyncGrid(el);
      else if (typeof _syncGrid === 'function') _syncGrid(el);
    }
  }

  /* ================================================================
     에너지 보정 — 핀과 팽팽한 실은 일을 하지 않는다
     반음적 오일러 + 위치 보정은 진자처럼 도는 막대에서 에너지를 조금씩 흘린다 (10 초에 수 %).
     physics.js 의 실 성분 보정과 같은 원리로, **중력·핀·팽팽한 실만** 받는 막대 계에 대해
     서브스텝 전후 역학적 에너지 차를 속도 균일 배율로 되돌린다 (J·v = 0 은 배율에 불변).
     받침·바닥 접촉, 힘 구간, 느슨한 실, 막대 밖의 실·용수철이 하나라도 끼면 보정하지 않는다.
  ================================================================ */

  /** 막대 계 성분 — 막대와, 막대에 건 실로 이어진 네모·원 */
  function _rodComponents() {
    const rods = _rodsOf();
    if (!rods.length) return [];
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
    for (const r of rods) add(r.id);
    const ropes = STATE.ropes.filter(rp => ropeInRodSystem(rp) && rodRopeSupported(rp));
    for (const rp of ropes) {
      const ids = [rp.anchorA.elementId, rp.anchorB.elementId].filter(id => STATE.elements.some(e => e.id === id && ['rod', 'rect', 'circle', 'pulley'].includes(e.type)));
      ids.forEach(add);
      if (ids.length === 2) parent.set(find(ids[0]), find(ids[1]));
    }
    const comps = new Map();
    for (const id of parent.keys()) {
      const root = find(id);
      if (!comps.has(root)) comps.set(root, { els: [], ropes: [], closed: true });
      const el = STATE.elements.find(e => e.id === id);
      if (el.type !== 'pulley') comps.get(root).els.push(el);   // 고정 도르래는 움직이지 않는 중계점
    }
    for (const rp of ropes) {
      const id = [rp.anchorA.elementId, rp.anchorB.elementId].find(i => parent.has(i));
      if (id) comps.get(find(id)).ropes.push(rp);
    }
    // 네모·원이 막대 밖의 실·용수철에도 묶여 있으면 계가 닫혀 있지 않다
    for (const c of comps.values()) {
      for (const el of c.els) {
        if (el.type === 'rod') continue;
        if (STATE.ropes.some(rp => !ropeInRodSystem(rp) && (rp.anchorA.elementId === el.id || rp.anchorB.elementId === el.id))) c.closed = false;
        if (STATE.elements.some(sp => sp.type === 'spring' && (sp.leftElementId === el.id || sp.rightElementId === el.id))) c.closed = false;
      }
    }
    return [...comps.values()].filter(c => c.closed);
  }

  function _rodCompEnergy(c) {
    const g = STATE.gravityOn ? CONFIG.G : 0;
    let e = 0;
    for (const el of c.els) {
      const m = el.mass || 1;
      e += 0.5 * m * (el.vx * el.vx + el.vy * el.vy);
      if (el.type === 'rod') e += 0.5 * rodInertia(el) * el.omega * el.omega;
      e += m * g * el.physY;   // 네모의 physY 는 좌하단이지만 차이만 쓰므로 상관없다
    }
    return e;
  }

  function rodEnergyBefore() {
    if (!STATE.elements.some(e => e.type === 'rod')) return null;
    for (const r of STATE.elements) if (r.type === 'rod') { r._touchSub = false; r._nonConservative = false; }
    return _rodComponents().map(c => ({ c, e0: _rodCompEnergy(c) }));
  }

  function rodProjectEnergy(refs) {
    if (!refs) return;
    for (const { c, e0 } of refs) {
      if (c.els.some(el => el._nonConservative || el._touchSub)) continue;
      const runsNow = rodPulleyRuns();
      if (c.ropes.some(rp => { const run = runsNow.find(x => x.ropes.includes(rp)); const r = run ? _runRow(run) : _ropeRow(rp); return !r || !r.active; })) continue;
      let ke = 0;
      for (const el of c.els) {
        ke += 0.5 * (el.mass || 1) * (el.vx * el.vx + el.vy * el.vy);
        if (el.type === 'rod') ke += 0.5 * rodInertia(el) * el.omega * el.omega;
      }
      if (ke <= 1e-12) continue;
      const sc = Math.sqrt(Math.max(0, 1 + (e0 - _rodCompEnergy(c)) / ke));
      if (!isFinite(sc) || Math.abs(sc - 1) >= 0.02) continue;
      for (const el of c.els) { el.vx *= sc; el.vy *= sc; if (el.type === 'rod') el.omega *= sc; }
    }
  }
