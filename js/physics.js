/* ============================================================
   physics.js — 시뮬레이션 스텝·중력·충돌·실/도르래/용수철·검증
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [SIMULATION] — Sprint 6 완성
  ================================================================ */

  /* ── 시뮬 제어 ── */
  function startSimulation() {
    saveSnapshot();
    initPhysics();
    STATE.simMode = 'RUNNING';
    btnRun.textContent = '⏸ 일시정지';
    document.getElementById('sidebar-left').style.pointerEvents = 'none';
    document.getElementById('sidebar-left').style.opacity = '0.4';
    _selectObject(null);
  }

  function pauseSimulation() {
    STATE.simMode = 'PAUSED';
    btnRun.textContent = '▶ 재개';
  }

  function resumeSimulation() {
    STATE.simMode = 'RUNNING';
    btnRun.textContent = '⏸ 일시정지';
  }

  function stopSimulation() {
    // rAF는 renderLoop에서 계속 돌아야 하므로 취소하지 않음
    document.getElementById('sidebar-left').style.pointerEvents = '';
    document.getElementById('sidebar-left').style.opacity = '';
  }

  /* ── 스냅샷 ── */
  function saveSnapshot() {
    STATE.snapshot = JSON.stringify({
      elements:      STATE.elements.map(e => e.serialize()),
      floorSegments: STATE.floorSegments.map(s => s.serialize()),
      ropes:         STATE.ropes.map(r => r.serialize()),
    });
  }

  function restoreSnapshot() {
    if (!STATE.snapshot) return;
    const data = JSON.parse(STATE.snapshot);

    // elements 재생성
    STATE.elements = data.elements.map(d => {
      let el;
      switch (d.type) {
        case 'rect':      el = new RectBody();    break;
        case 'circle':    el = new CircleBody();  break;
        case 'forceZone': el = new ForceZone();   break;
        case 'pulley':    el = new Pulley();      break;
        case 'spring':    el = new Spring();      break;
        default: return null;
      }
      Object.assign(el, d);
      return el;
    }).filter(Boolean);

    // floorSegments 재생성
    STATE.floorSegments = data.floorSegments.map(d => {
      const seg = new FloorSegment(d.x1, d.y1, d.x2, d.y2);
      Object.assign(seg, d);
      return seg;
    });

    // ropes 재생성
    STATE.ropes = data.ropes.map(d => {
      const rope = new Rope(d.anchorA, d.anchorB, d.ropeLength);
      Object.assign(rope, d);
      return rope;
    });

    STATE.selected = null;
    validateAll();
  }

  /* ================================================================
     [PHYSICS] — Sprint 6: 중력 + 바닥 충돌
  ================================================================ */

  /* ── 6-2. 물리 초기화 ── */
  function initPhysics() {
    const GS = CONFIG.GRID_SIZE;
    for (const el of STATE.elements) {
      // 질량 가드: 0/음수/NaN 질량은 충돌 해소식(1/m)에서 NaN을 만들어
      // 연결된 모든 물체로 전파되므로 시뮬 시작 시점에 최소값으로 보정
      if ((el.type === 'rect' || el.type === 'circle') && !(el.mass > 0)) el.mass = 0.1;
      if (el.type === 'rect') {
        el.physX = el.gridX;                          // 좌하단 x [m]
        el.physY = GS - el.gridY - el.gridH;          // 좌하단 y [m] (y축 반전)
        el.vx = el.vx0 || 0;
        el.vy = el.vy0 || 0;
        el.ax = 0; el.ay = 0;
      }
      if (el.type === 'circle') {
        el.physX = el.gridX + el.gridW / 2;
        el.physY = GS - el.gridY - el.gridH / 2;
        el.vx = el.vx0 || 0;
        el.vy = el.vy0 || 0;
        el.ax = 0; el.ay = 0;
        el.omega = 0;   // 각속도 초기화
        el.theta = 0;   // 회전각 초기화
        el.alpha = 0;
      }
      if (el.type === 'pulley') {
        el.physX = el.gridX + el.gridW / 2;
        el.physY = GS - el.gridY - el.gridH / 2;
        el.vx = el.vx0 || 0;
        el.vy = el.vy0 || 0;
        el.ax = 0; el.ay = 0;
      }
    }
    // 시뮬 시작 시점 실제 물리 거리로 보정
    calibrateRopeLengths();
  }

  /**
   * calibrateRopeLengths
   * 시뮬 시작 직후 각 Rope의 calibratedLength를 실제 물리 거리로 고정.
   * Atwood: 두 실의 거리 합을 L_total로 저장.
   * 단순 실: 현재 물리 거리를 저장.
   */
  function calibrateRopeLengths() {
    const cs = CONFIG.cellSize;
    const GS = CONFIG.GRID_SIZE;

    // 도르래 그룹 파악
    const pulleyGroups = new Map();
    for (const el of STATE.elements) {
      if (el.type === 'pulley') pulleyGroups.set(el.id, []);
    }
    const pulleyRopeIds = new Set();
    for (const rope of STATE.ropes) {
      const elA = STATE.elements.find(e => e.id === rope.anchorA.elementId);
      const elB = STATE.elements.find(e => e.id === rope.anchorB.elementId);
      const aIsRim = elA && elA.type === 'pulley' && rope.anchorA.attachPoint !== 'center';
      const bIsRim = elB && elB.type === 'pulley' && rope.anchorB.attachPoint !== 'center';
      if (aIsRim) {
        pulleyGroups.get(elA.id).push({ rope, bodyAnchor: rope.anchorB, pulleyAnchor: rope.anchorA });
        pulleyRopeIds.add(rope.id);
      } else if (bIsRim) {
        pulleyGroups.get(elB.id).push({ rope, bodyAnchor: rope.anchorA, pulleyAnchor: rope.anchorB });
        pulleyRopeIds.add(rope.id);
      }
    }

    // 도르래 그룹: 각 실의 실제 물리 거리(림→body)를 calibratedLength로 저장
    for (const [pulleyId, group] of pulleyGroups) {
      const pulley = STATE.elements.find(e => e.id === pulleyId);
      if (!pulley) continue;
      for (const g of group) {
        const rim = getAttachPhysPos(g.pulleyAnchor);
        const pos = getAttachPhysPos(g.bodyAnchor);
        if (!rim || !pos) continue;
        g.rope.calibratedLength = Math.hypot(pos.x - rim.x, pos.y - rim.y);
      }
    }

    // 단순 실: 현재 물리 거리를 calibratedLength로 저장
    for (const rope of STATE.ropes) {
      if (pulleyRopeIds.has(rope.id)) continue;
      const A = getAttachPhysPos(rope.anchorA);
      const B = getAttachPhysPos(rope.anchorB);
      if (!A || !B) continue;
      rope.calibratedLength = Math.hypot(B.x - A.x, B.y - A.y);
    }
  }

  /* ── 6-3. 시뮬 스텝 (4 서브스텝) ── */
  function simStep(dt) {
    const sub = CONFIG.SUBSTEPS;
    const subDt = dt / sub;
    for (let i = 0; i < sub; i++) {
      applyForces(subDt);
      integrate(subDt);
      resolveFloorCollisions();
      resolveBodyCollisions();
      resolveRopeConstraints();
    }
  }

  /* ── 힘 적용 (중력 + ForceZone + 용수철) ── */
  function applyForces(dt) {
    for (const el of STATE.elements) {
      if (!['rect', 'circle', 'pulley'].includes(el.type)) continue;

      // 중력 (Pulley도 중력 받음 — 고정 실이 없으면 자유낙하)
      if (STATE.gravityOn) {
        el.ay -= CONFIG.G;
      }

      // ForceZone
      if (el.type !== 'pulley') {
        for (const zone of STATE.elements) {
          if (zone.type !== 'forceZone') continue;
          if (_bboxOverlap(el, zone)) {
            el.ax += zone.fx / el.mass;
            el.ay += zone.fy / el.mass;
          }
        }
      }
    }

    // 용수철 힘
    applySpringForces();
  }

  /* bbox 겹침 (격자 인덱스 기준) */
  function _bboxOverlap(a, b) {
    return a.gridX < b.gridX + b.gridW && a.gridX + a.gridW > b.gridX &&
           a.gridY < b.gridY + b.gridH && a.gridY + a.gridH > b.gridY;
  }

  /* ── 6-4. Semi-implicit Euler 적분 ── */
  function integrate(dt) {
    const GS = CONFIG.GRID_SIZE;
    for (const el of STATE.elements) {
      if (!['rect', 'circle', 'pulley'].includes(el.type)) continue;

      el.vx += el.ax * dt;
      el.vy += el.ay * dt;
      el.physX += el.vx * dt;
      el.physY += el.vy * dt;
      el.ax = 0;
      el.ay = 0;

      if (el.type === 'rect') {
        el.gridX = el.physX;
        el.gridY = GS - el.physY - el.gridH;
      } else {
        el.gridX = el.physX - el.gridW / 2;
        el.gridY = GS - el.physY - el.gridH / 2;
      }
      // 원형 물체 회전 적분
      if (el.type === 'circle') {
        el.omega += el.alpha * dt;
        el.theta += el.omega * dt;
        el.alpha  = 0;
      }
    }
  }

  /* ── 6-5. FloorSegment 물리 선분 추출 ── */
  /**
   * 격자 좌표 → 물리 좌표(m)
   * gridX → physX = gridX
   * gridY → physY = GRID_SIZE - gridY  (y 반전)
   */
  function getPhysicsSegments(seg) {
    const GS = CONFIG.GRID_SIZE;
    const gToP = (gx, gy) => ({ x: gx, y: GS - gy });  // 격자→물리

    const A = gToP(seg.x1, seg.y1);
    const B = gToP(seg.x2, seg.y2);
    const mu = seg.isFriction ? seg.mu : 0;

    const segs = [];

    const _makeSeg = (ax,ay,bx,by) => {
      const dx = bx-ax, dy = by-ay;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return null;
      // 법선: 반시계 90° (왼쪽 수직)
      // 강제 뒤집기 없음 - 단면 충돌 (물체가 법선 방향 위에 있을 때만 충돌)
      const nx = -dy/len, ny = dx/len;
      const muS = seg.isFriction ? (seg.muS ?? seg.mu ?? 0) : 0;
      const muK = seg.isFriction ? (seg.muK ?? muS * 0.8) : 0;
      return { x1:ax, y1:ay, x2:bx, y2:by, mu: muS, muS, muK, isFriction: seg.isFriction, normalX:nx, normalY:ny };
    };

    switch (seg.pathType) {
      case 'LINE': {
        const s = _makeSeg(A.x,A.y,B.x,B.y);
        if (s) segs.push(s);
        break;
      }
      case 'ELBOW_H': {
        const M = { x: B.x, y: A.y };
        const s1 = _makeSeg(A.x,A.y,M.x,M.y);
        const s2 = _makeSeg(M.x,M.y,B.x,B.y);
        if (s1) segs.push(s1);
        if (s2) segs.push(s2);
        break;
      }
      case 'ELBOW_V': {
        const M = { x: A.x, y: B.y };
        const s1 = _makeSeg(A.x,A.y,M.x,M.y);
        const s2 = _makeSeg(M.x,M.y,B.x,B.y);
        if (s1) segs.push(s1);
        if (s2) segs.push(s2);
        break;
      }
      case 'ARC_UP':
      case 'ARC_DOWN': {
        // 원호를 20개 미세 선분으로 근사 (물리 좌표계)
        const pts = _arcPhysPoints(seg, A, B, 20);
        for (let i = 0; i < pts.length - 1; i++) {
          const s = _makeSeg(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
          if (s) segs.push(s);
        }
        break;
      }
    }
    return segs;
  }

  /** 물리 좌표계에서 ARC를 n+1 개 점으로 샘플링 */
  function _arcPhysPoints(seg, A, B, n) {
    // 물리 좌표계에서는 y가 위쪽이 양수 → ARC_UP/DOWN 의미가 화면과 반대
    const dx = B.x - A.x, dy = B.y - A.y;
    const d  = Math.hypot(dx, dy);
    const { R, theta, h } = _arcRadiusFromCurvature(seg.curvature, d);

    const mx = (A.x + B.x)/2, my = (A.y + B.y)/2;
    const ux = dx/d, uy = dy/d;
    const nx = -uy, ny = ux;

    let cX, cY;
    // 물리 좌표계 y 반전 보정: ARC_DOWN 화면 = 물리 ARC_UP
    if (seg.pathType === 'ARC_DOWN') { cX = mx + nx*h; cY = my + ny*h; }
    else                             { cX = mx - nx*h; cY = my - ny*h; }

    const sa = Math.atan2(A.y - cY, A.x - cX);
    const ea = Math.atan2(B.y - cY, B.x - cX);
    let diff = ea - sa;
    while (diff >  Math.PI) diff -= 2*Math.PI;
    while (diff < -Math.PI) diff += 2*Math.PI;
    const shortSign = Math.sign(diff) || 1;
    // θ≤π: 짧은 호 그대로 / θ>π: 반대 방향으로 돌아 긴 호(major arc) 사용
    const sweepSign = (theta <= Math.PI) ? shortSign : -shortSign;
    const sweep = sweepSign * theta;

    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = sa + sweep * t;
      pts.push({ x: cX + R*Math.cos(a), y: cY + R*Math.sin(a) });
    }
    return pts;
  }

  /* ── 6-5. FloorSegment 충돌 처리 ── */
  function resolveFloorCollisions() {
    const allSegs = [];
    for (const fseg of STATE.floorSegments) {
      allSegs.push(...getPhysicsSegments(fseg));
    }
    if (allSegs.length === 0) return;

    for (const el of STATE.elements) {
      if (el.type === 'circle') _resolveCircleFloor(el, allSegs);
      if (el.type === 'rect')   _resolveRectFloor(el, allSegs);
    }
  }

  /** CircleBody — 원-선분 최근접점 거리 충돌 */
  function _resolveCircleFloor(el, segs) {
    const r   = el.gridW / 2;
    const m   = el.mass;
    const I   = 0.5 * m * r * r;   // 균일 원판 관성 모멘트

    // ── 1단계: 모든 세그먼트 중 가장 깊은 침투 1건만 탐색 ──
    //   ⚠ 법선은 (dx/dist,dy/dist)가 아닌 세그먼트의 고정 법선(seg.normalX/Y)을
    //     사용해야 함. 인접 미세 세그먼트의 경계(joint)에서 원의 중심이
    //     표면 반대쪽으로 살짝 넘어가면 (dx,dy) 기반 방향이 뒤집혀
    //     반대 방향으로 밀어버리는 버그가 있었음.
    let maxPen = -Infinity, bestNx = 0, bestNy = 0, bestSeg = null;

    for (const seg of segs) {
      const sdx = seg.x2 - seg.x1, sdy = seg.y2 - seg.y1;
      const lenSq = sdx*sdx + sdy*sdy;
      if (lenSq < 1e-12) continue;

      const t = ((el.physX - seg.x1)*sdx + (el.physY - seg.y1)*sdy) / lenSq;
      if (t < 0 || t > 1) continue;

      const footX = seg.x1 + t*sdx;
      const footY = seg.y1 + t*sdy;
      const dx = el.physX - footX;
      const dy = el.physY - footY;
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;   // 원의 반지름보다 멀면 무관

      // 세그먼트의 고정 법선 방향으로의 부호 있는 거리
      const signedDist = dx*seg.normalX + dy*seg.normalY;
      if (signedDist < -(el.gridW + el.gridH)) continue;  // 너무 깊은 반대쪽(처음부터 반대편)

      // 침투 깊이: 법선 방향 성분이 r보다 작으면(혹은 음수) 침투
      const pen = r - signedDist;
      if (pen > maxPen) {
        maxPen = pen;
        bestNx = seg.normalX;
        bestNy = seg.normalY;
        bestSeg = seg;
      }
    }

    // ── 1-2단계: 정점(미세 선분들의 연결점) 보정 ──
    //   ARC는 여러 미세 선분으로 나뉘는데, 원의 중심이 정확히 두 선분의
    //   경계(joint)에 위치하면 위의 엣지 검사가 불안정해질 수 있음
    //   (인접 두 선분의 법선이 서로 다른 방향이라 매 프레임 다른 쪽이
    //   선택되며 미세하게 새는 현상 방지). 정점 자체는 "둥근 모서리"처럼
    //   원-점 거리로 처리하고, 방향은 점→중심(라디얼)을 사용 — 정점은
    //   엣지와 달리 고정 법선이 없으므로 이 방식이 기하학적으로 올바름.
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const candidates = (i === 0) ? [{x:seg.x1,y:seg.y1}, {x:seg.x2,y:seg.y2}] : [{x:seg.x2,y:seg.y2}];
      for (const v of candidates) {
        const dx = el.physX - v.x, dy = el.physY - v.y;
        const dist = Math.hypot(dx, dy);
        if (dist > r || dist < 1e-9) continue;
        const pen = r - dist;
        if (pen > maxPen) {
          maxPen = pen;
          bestNx = dx / dist;
          bestNy = dy / dist;
          bestSeg = seg;
        }
      }
    }

    if (!bestSeg || maxPen <= 0) return;

    // ── 2단계: 단 한 번만 위치/속도 보정 적용 ──
    const nx = bestNx, ny = bestNy;
    el.physX += nx * maxPen;
    el.physY += ny * maxPen;
    el.gridX  = el.physX - el.gridW/2;
    el.gridY  = CONFIG.GRID_SIZE - el.physY - el.gridH/2;

    const tx = -ny, ty = nx;

    const vn = el.vx*nx + el.vy*ny;
    if (vn >= 0) return;

    const e_c = Math.sqrt(el.e);
    const jn  = -(1 + e_c) * vn / (1/m);

    el.vx += jn/m * nx;
    el.vy += jn/m * ny;

    const mu_s = bestSeg.isFriction ? (bestSeg.muS ?? (bestSeg.mu > 0 ? bestSeg.mu : 0.4)) : 0;
    const mu_k = bestSeg.isFriction ? (bestSeg.muK ?? mu_s * 0.8)                          : 0;

    if (mu_s <= 0) {
      // 마찰 없음: 각속도 변화 없음
    } else {
      const vt     = el.vx*tx + el.vy*ty;
      const v_slip = vt - r * el.omega;

      const denom   = 1/m + r*r/I;
      const jt_roll = -v_slip / denom;
      const jt_max  = mu_s * Math.abs(jn);

      let jt;
      if (Math.abs(jt_roll) <= jt_max) {
        jt = jt_roll;
      } else {
        jt = -Math.sign(v_slip) * mu_k * Math.abs(jn);
      }

      el.vx    += jt/m * tx;
      el.vy    += jt/m * ty;
      el.omega -= r * jt / I;
    }
  }

  /** RectBody — 단면 충돌: 법선 방향 위의 물체만 처리 */
  function _resolveRectFloor(el, segs) {
    const corners = [
      { x: el.physX,           y: el.physY },
      { x: el.physX+el.gridW,  y: el.physY },
      { x: el.physX,           y: el.physY+el.gridH },
      { x: el.physX+el.gridW,  y: el.physY+el.gridH },
    ];

    // ── 1단계: 모든 세그먼트(ARC는 20개 미세 선분)를 스캔하여
    //          가장 깊은 침투 1건만 찾는다.
    //          (per-segment 즉시보정 시 ARC의 인접 미세선분들이
    //           중복 보정을 일으켜 물체가 튕겨나가는 버그 방지) ──
    let maxPen = 0, bestNx = 0, bestNy = 0, bestSeg = null;

    for (const seg of segs) {
      const sdx = seg.x2 - seg.x1, sdy = seg.y2 - seg.y1;
      const lenSq = sdx*sdx + sdy*sdy;
      if (lenSq < 1e-12) continue;

      const snx = seg.normalX, sny = seg.normalY;

      for (const c of corners) {
        const t = ((c.x - seg.x1)*sdx + (c.y - seg.y1)*sdy) / lenSq;
        if (t < 0 || t > 1) continue;

        const footX = seg.x1 + t*sdx;
        const footY = seg.y1 + t*sdy;
        const fx = c.x - footX, fy = c.y - footY;
        const signed = fx*snx + fy*sny;

        const maxAllowedPen = el.gridW + el.gridH;
        if (signed < 0 && Math.abs(signed) > maxPen && Math.abs(signed) < maxAllowedPen) {
          maxPen = Math.abs(signed);
          bestNx = snx;
          bestNy = sny;
          bestSeg = seg;
        }
      }
    }

    // ── 1-2단계: 정점(미세 선분 연결점) 보정 ──
    //   원형(_resolveCircleFloor)과 같은 이유: ARC/ELBOW의 볼록한 연결점에서는
    //   모서리-선분 검사가 t∈[0,1] 밖으로 벗어나 실패하고, 정점이 사각형의
    //   변/내부를 뚫고 들어와도 감지되지 않아 관통이 발생함.
    //   정점이 사각형 내부에 있으면 최소 이동 축(MTV)으로 밀어내되,
    //   방향은 해당 세그먼트 법선과 같은 쪽만 허용(표면 반대편으로 배출 방지).
    const rx0 = el.physX, ry0 = el.physY;
    const rx1 = rx0 + el.gridW, ry1 = ry0 + el.gridH;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const candidates = (i === 0) ? [{x:seg.x1,y:seg.y1}, {x:seg.x2,y:seg.y2}] : [{x:seg.x2,y:seg.y2}];
      for (const v of candidates) {
        if (v.x <= rx0 || v.x >= rx1 || v.y <= ry0 || v.y >= ry1) continue;
        const opts = [
          { pen: v.y - ry0, nx: 0,  ny: 1  },
          { pen: ry1 - v.y, nx: 0,  ny: -1 },
          { pen: v.x - rx0, nx: 1,  ny: 0  },
          { pen: rx1 - v.x, nx: -1, ny: 0  },
        ].filter(o => o.nx*seg.normalX + o.ny*seg.normalY > 0.1)
         .sort((a, b) => a.pen - b.pen)[0];
        if (opts && opts.pen > maxPen && opts.pen < el.gridW + el.gridH) {
          maxPen  = opts.pen;
          bestNx  = opts.nx;
          bestNy  = opts.ny;
          bestSeg = seg;
        }
      }
    }

    if (maxPen < 1e-9 || !bestSeg) return;

    // ── 2단계: 단 한 번만 위치/속도 보정 적용 ──
    el.physX += bestNx * maxPen;
    el.physY += bestNy * maxPen;
    el.gridX  = el.physX;
    el.gridY  = CONFIG.GRID_SIZE - el.physY - el.gridH;

    const e_c = Math.sqrt(el.e * 1.0);
    const vn  = el.vx*bestNx + el.vy*bestNy;
    if (vn < 0) {
      const jn = -(1 + e_c) * vn * el.mass;
      el.vx += (jn / el.mass) * bestNx;
      el.vy += (jn / el.mass) * bestNy;

      const vn2  = el.vx*bestNx + el.vy*bestNy;
      const vt_x = el.vx - vn2*bestNx;
      const vt_y = el.vy - vn2*bestNy;
      const vt_mag = Math.hypot(vt_x, vt_y);
      const muS  = bestSeg.isFriction ? (bestSeg.muS ?? bestSeg.mu ?? 0) : 0;
      const muK  = bestSeg.isFriction ? (bestSeg.muK ?? muS * 0.8)     : 0;

      if (muS > 0 && vt_mag > 1e-9) {
        const jt_stop   = el.mass * vt_mag;
        const jt_static = muS * jn;
        let jt;
        if (jt_stop <= jt_static) {
          jt = jt_stop;
        } else {
          jt = muK * jn;
        }
        el.vx -= jt / el.mass * (vt_x / vt_mag);
        el.vy -= jt / el.mass * (vt_y / vt_mag);
      }
    }
  }

  /** 물리 좌표계 점 → 선분 최근접점 */
  function _closestPointOnSegPhys(px, py, seg) {
    const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
    const lenSq = dx*dx + dy*dy;
    if (lenSq < 1e-12) return { x: seg.x1, y: seg.y1 };
    const t = Math.max(0, Math.min(1, ((px-seg.x1)*dx + (py-seg.y1)*dy)/lenSq));
    return { x: seg.x1+t*dx, y: seg.y1+t*dy };
  }

  /* ================================================================
     [PHYSICS Sprint 7] — 물체 충돌 + 용수철 힘 + 실 제약
  ================================================================ */

  /* ── 헬퍼: 앵커 물리 위치 (m) ── */
  function getAttachPhysPos(anchor) {
    // FloorSegment 고정 앵커
    const seg = STATE.floorSegments.find(s => s.id === anchor.elementId);
    if (seg) {
      const GS = CONFIG.GRID_SIZE;
      if (anchor.attachPoint === 'p1') return { x: seg.x1, y: GS - seg.y1 };
      if (anchor.attachPoint === 'p2') return { x: seg.x2, y: GS - seg.y2 };
      return { x: seg.x1, y: GS - seg.y1 };
    }
    // Element
    const el = STATE.elements.find(e => e.id === anchor.elementId);
    if (!el) return null;
    return _getElPhysAnchor(el, anchor.attachPoint);
  }

  /** 요소의 특정 앵커 포인트 물리 좌표 */
  function _getElPhysAnchor(el, pt) {
    if (el.type === 'rect') {
      // physX/Y = 좌하단 기준
      switch (pt) {
        case 'top':    return { x: el.physX + el.gridW/2, y: el.physY + el.gridH };
        case 'bottom': return { x: el.physX + el.gridW/2, y: el.physY };
        case 'left':   return { x: el.physX,              y: el.physY + el.gridH/2 };
        case 'right':  return { x: el.physX + el.gridW,   y: el.physY + el.gridH/2 };
        default:       return { x: el.physX + el.gridW/2, y: el.physY + el.gridH/2 };
      }
    }
    if (el.type === 'circle') {
      // physX/Y = 중심 기준
      return { x: el.physX, y: el.physY };
    }
    if (el.type === 'pulley') {
      const r = Math.min(el.gridW, el.gridH) / 2;
      switch (pt) {
        case 'top':    return { x: el.physX,     y: el.physY + r };
        case 'bottom': return { x: el.physX,     y: el.physY - r };
        case 'left':   return { x: el.physX - r, y: el.physY };
        case 'right':  return { x: el.physX + r, y: el.physY };
        default:       return { x: el.physX,     y: el.physY };
      }
    }
    if (el.type === 'spring') {
      // Spring은 물리 적분 없음 → gridX/Y 기반으로 끝점 좌표 반환
      const GS = CONFIG.GRID_SIZE;
      const cx = el.gridX + el.gridW / 2;
      const cy_phys = GS - el.gridY - el.gridH / 2;  // 중심 y (y-up)
      if (!el.isVertical) {
        // 가로: 왼쪽 끝=gridX, 오른쪽 끝=gridX+gridW
        if (pt === 'left')  return { x: el.gridX,            y: cy_phys };
        if (pt === 'right') return { x: el.gridX + el.gridW, y: cy_phys };
      } else {
        // 세로: 위쪽=y-up 큰 값, 아래쪽=작은 값
        if (pt === 'top')    return { x: cx, y: GS - el.gridY };
        if (pt === 'bottom') return { x: cx, y: GS - el.gridY - el.gridH };
      }
      return { x: cx, y: cy_phys };  // fallback: 중심
    }
    return null;
  }

  /** 앵커의 질량
   * FloorSegment → Infinity (고정)
   * Pulley       → 0 (massless: 실 제약이 100% 이동시킴)
   * 기타         → el.mass
   */
  function getMass(elementId) {
    const seg = STATE.floorSegments.find(s => s.id === elementId);
    if (seg) return Infinity;
    const el = STATE.elements.find(e => e.id === elementId);
    if (!el) return Infinity;
    if (el.type === 'pulley') return 0;  // massless: inv = Infinity
    return el.mass || 1;
  }

  /** 물리 좌표로 요소 위치를 직접 이동 (Rope 제약 후 역산) */
  function _applyPhysDelta(elementId, dx, dy) {
    const el = STATE.elements.find(e => e.id === elementId);
    if (!el) return;
    if (!['rect','circle','pulley'].includes(el.type)) return;
    el.physX += dx;
    el.physY += dy;
    const GS = CONFIG.GRID_SIZE;
    if (el.type === 'rect') {
      el.gridX = el.physX;
      el.gridY = GS - el.physY - el.gridH;
    } else {
      // circle & pulley: 중심 기준
      el.gridX = el.physX - el.gridW / 2;
      el.gridY = GS - el.physY - el.gridH / 2;
    }
  }

  /* ================================================================
     [ROPE & PULLEY CONSTRAINTS — 재설계]
     실: 최대 길이 제한만 (이완 시 힘 없음, 팽팽 시 장력)
     도르래: 연결된 두 실의 길이 합 = 상수 (Atwood 제약)
  ================================================================ */

  function resolveRopeConstraints() {
    /* ── 1. 도르래별 연결 실 그룹화 ── */
    // pulleyId → [ { rope, bodyAnchor } ]
    const pulleyGroups = new Map();
    for (const el of STATE.elements) {
      if (el.type === 'pulley') pulleyGroups.set(el.id, []);
    }

    const pulleyRopeIds = new Set();

    for (const rope of STATE.ropes) {
      const elA = STATE.elements.find(e => e.id === rope.anchorA.elementId);
      const elB = STATE.elements.find(e => e.id === rope.anchorB.elementId);

      // center 앵커 = 도르래 고정용 → 단순 실로 처리 (Atwood 그룹에 넣지 않음)
      const aIsPulleyRim = elA && elA.type === 'pulley' && rope.anchorA.attachPoint !== 'center';
      const bIsPulleyRim = elB && elB.type === 'pulley' && rope.anchorB.attachPoint !== 'center';

      if (aIsPulleyRim) {
        // pulleyAnchor: 도르래 쪽 앵커 (실제 연결 포인트 저장)
        pulleyGroups.get(elA.id).push({ rope, bodyAnchor: rope.anchorB, pulleyAnchor: rope.anchorA });
        pulleyRopeIds.add(rope.id);
      } else if (bIsPulleyRim) {
        pulleyGroups.get(elB.id).push({ rope, bodyAnchor: rope.anchorA, pulleyAnchor: rope.anchorB });
        pulleyRopeIds.add(rope.id);
      }
      // center 앵커 실: pulleyRopeIds에 추가 안 함 → simpleRopes로 자동 분류
    }

    const simpleRopes = STATE.ropes.filter(r => !pulleyRopeIds.has(r.id));

    /* ── 2. 반복 제약 해소 ── */
    for (let iter = 0; iter < 8; iter++) {
      // 단순 실
      for (const rope of simpleRopes) {
        _simpleRopeConstraint(rope);
      }
      // 도르래 Atwood 제약
      for (const [pulleyId, group] of pulleyGroups) {
        if (group.length === 2) {
          _atwoodConstraint(pulleyId, group[0], group[1]);
        } else if (group.length === 1) {
          // 도르래 한쪽만 연결 → 도르래를 고정점으로 하는 단순 실
          _simpleRopeConstraint(group[0].rope);
        }
      }
    }
  }

  /* ── 단순 실 제약 ──
   * 거리 > ropeLength 일 때만 장력 작용 (이완 시 완전 무시)
   * vRel > 0: 두 앵커가 서로 멀어지고 있는 상황 → 속도 보정
   */
  function _simpleRopeConstraint(rope) {
    const A = getAttachPhysPos(rope.anchorA);
    const B = getAttachPhysPos(rope.anchorB);
    if (!A || !B) return;

    const dx = B.x - A.x, dy = B.y - A.y;
    const dist = Math.hypot(dx, dy);
    // calibratedLength: 시뮬 시작 시 실측된 거리 (없으면 ropeLength 폴백)
    const maxLen = rope.calibratedLength ?? rope.ropeLength;
    if (dist <= maxLen + 1e-6 || dist < 1e-9) return;

    const excess = dist - maxLen;
    const nx = dx / dist, ny = dy / dist;

    const m1 = getMass(rope.anchorA.elementId);
    const m2 = getMass(rope.anchorB.elementId);

    // mass=0 (pulley) → inv=Infinity, 해당 끝이 100% 이동
    const inv1 = (m1 === 0) ? Infinity : (isFinite(m1) ? 1/m1 : 0);
    const inv2 = (m2 === 0) ? Infinity : (isFinite(m2) ? 1/m2 : 0);

    // 양쪽 모두 Infinity인 경우는 없어야 하지만 방어
    const bothInf = !isFinite(inv1) && !isFinite(inv2);
    if (bothInf) return;

    let w1, w2;
    if (!isFinite(inv1)) { w1 = 1; w2 = 0; }
    else if (!isFinite(inv2)) { w1 = 0; w2 = 1; }
    else {
      const invSum = inv1 + inv2;
      if (invSum < 1e-12) return;
      w1 = inv1 / invSum;
      w2 = inv2 / invSum;
    }

    // 위치 보정
    _applyPhysDelta(rope.anchorA.elementId, +nx * excess * w1, +ny * excess * w1);
    _applyPhysDelta(rope.anchorB.elementId, -nx * excess * w2, -ny * excess * w2);

    // ── 속도 보정 (뉴턴 3법칙: 동일 충격량 J를 양쪽에 등방향 적용) ──
    const elAObj = STATE.elements.find(e => e.id === rope.anchorA.elementId);
    const elBObj = STATE.elements.find(e => e.id === rope.anchorB.elementId);
    const vAx = elAObj ? (elAObj.vx||0) : 0, vAy = elAObj ? (elAObj.vy||0) : 0;
    const vBx = elBObj ? (elBObj.vx||0) : 0, vBy = elBObj ? (elBObj.vy||0) : 0;
    const vRel = (vBx - vAx)*nx + (vBy - vAy)*ny;

    if (vRel > 1e-9) {
      // 충격량: J = vRel / (1/mA + 1/mB) — 뉴턴 3법칙으로 양쪽 동일 크기
      const effInvSum = (isFinite(inv1) ? inv1 : 0) + (isFinite(inv2) ? inv2 : 0);
      if (effInvSum < 1e-12) { /* 양쪽 고정: 보정 불필요 */ }
      else {
        const J = vRel / effInvSum;   // 충격량 크기 (scalar)

        // A: +n 방향으로 J/mA 만큼 속도 변화
        if (elAObj && ['rect','circle','pulley'].includes(elAObj.type) && isFinite(inv1)) {
          elAObj.vx += nx * J * inv1;
          elAObj.vy += ny * J * inv1;
        }
        // B: -n 방향으로 J/mB 만큼 속도 변화 (작용-반작용)
        if (elBObj && ['rect','circle','pulley'].includes(elBObj.type) && isFinite(inv2)) {
          elBObj.vx -= nx * J * inv2;
          elBObj.vy -= ny * J * inv2;
        }
      }
    }
  }

  /* ── Atwood 도르래 제약 ──
   * d1 + d2 = L1 + L2 (일정)
   * 마찰 없는 도르래: 양쪽 장력 T 동일
   * ḋ1 + ḋ2 = 0 (한쪽이 늘어나면 다른쪽이 줄어듦)
   *
   * group0/1: { rope, bodyAnchor }
   *   bodyAnchor: 도르래가 아닌 쪽 앵커
   */
  /**
   * _atwoodConstraint — 실제 연결 앵커 포인트 기반 Atwood 제약
   *
   * 핵심: 사용자가 연결한 도르래의 앵커 포인트(left/right/top/bottom)를
   *       그대로 실의 기준점으로 사용.
   * 예: 왼쪽 앵커에 연결 → 기준점 = 도르래 왼쪽 림 → 물체가 정확히 아래면 n=(0,-1)
   */
  function _atwoodConstraint(pulleyId, g0, g1) {
    const pulley = STATE.elements.find(e => e.id === pulleyId);
    if (!pulley) return;

    const vpx = pulley.vx || 0, vpy = pulley.vy || 0;

    // ── 기준점: 사용자가 연결한 실제 앵커 포인트(림 위치) ──
    // g0/g1.pulleyAnchor = { elementId: pulleyId, attachPoint: 'left'/'right'/... }
    // getAttachPhysPos가 physX/Y 기준 실제 림 좌표를 반환
    const anchor0 = g0.pulleyAnchor || { elementId: pulleyId, attachPoint: 'center' };
    const anchor1 = g1.pulleyAnchor || { elementId: pulleyId, attachPoint: 'center' };
    const rim0 = getAttachPhysPos(anchor0);
    const rim1 = getAttachPhysPos(anchor1);
    if (!rim0 || !rim1) return;

    const pos0 = getAttachPhysPos(g0.bodyAnchor);
    const pos1 = getAttachPhysPos(g1.bodyAnchor);
    if (!pos0 || !pos1) return;

    // 장력 방향: 림 포인트 → body 방향
    const d0  = Math.hypot(pos0.x - rim0.x, pos0.y - rim0.y);
    const d1  = Math.hypot(pos1.x - rim1.x, pos1.y - rim1.y);
    if (d0 < 1e-9 || d1 < 1e-9) return;

    const n0x = (pos0.x - rim0.x) / d0, n0y = (pos0.y - rim0.y) / d0;
    const n1x = (pos1.x - rim1.x) / d1, n1y = (pos1.y - rim1.y) / d1;

    // calibratedLength: 시뮬 시작 시 실제 물리 거리로 보정된 값 (없으면 ropeLength 폴백)
    const L0 = g0.rope.calibratedLength ?? g0.rope.ropeLength;
    const L1 = g1.rope.calibratedLength ?? g1.rope.ropeLength;
    const L_total = L0 + L1;
    const excess  = (d0 + d1) - L_total;

    const el0 = STATE.elements.find(e => e.id === g0.bodyAnchor.elementId);
    const el1 = STATE.elements.find(e => e.id === g1.bodyAnchor.elementId);

    const m0  = getMass(g0.bodyAnchor.elementId);
    const m1m = getMass(g1.bodyAnchor.elementId);
    const inv0 = isFinite(m0)  && m0 > 0 ? 1 / m0  : 0;
    const inv1 = isFinite(m1m) && m1m > 0 ? 1 / m1m : 0;
    const invSum = inv0 + inv1;
    if (invSum < 1e-12) return;

    // ── 위치 보정 ──
    if (excess > 1e-6) {
      const share0 = excess * inv0 / invSum;
      const share1 = excess * inv1 / invSum;
      _applyPhysDelta(g0.bodyAnchor.elementId, -n0x * share0, -n0y * share0);
      _applyPhysDelta(g1.bodyAnchor.elementId, -n1x * share1, -n1y * share1);
    }

    // ── 속도 보정: 팽팽 상태에서 ḋ0 + ḋ1 = 0 ──
    if (d0 + d1 < L_total - 1e-4) return;

    const v0x = el0 ? (el0.vx||0) : 0, v0y = el0 ? (el0.vy||0) : 0;
    const v1x = el1 ? (el1.vx||0) : 0, v1y = el1 ? (el1.vy||0) : 0;

    // ḋ_i = (v_body_i - v_pulley) · n_i
    const dDot0 = (v0x - vpx)*n0x + (v0y - vpy)*n0y;
    const dDot1 = (v1x - vpx)*n1x + (v1y - vpy)*n1y;
    const violation = dDot0 + dDot1;
    if (Math.abs(violation) < 1e-9) return;

    const lambda = violation / invSum;

    if (el0 && ['rect','circle'].includes(el0.type)) {
      el0.vx -= lambda * inv0 * n0x;
      el0.vy -= lambda * inv0 * n0y;
    }
    if (el1 && ['rect','circle'].includes(el1.type)) {
      el1.vx -= lambda * inv1 * n1x;
      el1.vy -= lambda * inv1 * n1y;
    }
  }

  /* ── 7-2. 용수철 힘 applySpringForces() ── */
  function applySpringForces() {
    for (const spring of STATE.elements) {
      if (spring.type !== 'spring') continue;
      if (!spring.leftElementId || !spring.rightElementId) continue;

      const leftEl  = STATE.elements.find(e => e.id === spring.leftElementId)
                   || STATE.floorSegments.find(s => s.id === spring.leftElementId);
      const rightEl = STATE.elements.find(e => e.id === spring.rightElementId)
                   || STATE.floorSegments.find(s => s.id === spring.rightElementId);
      if (!leftEl || !rightEl) continue;

      if (!spring.isVertical) {
        // ── 가로 모드: X축 방향 ──
        let leftEdgeX, rightEdgeX;
        if      (leftEl.type === 'rect')           leftEdgeX = leftEl.physX + leftEl.gridW;
        else if (leftEl.type === 'circle')         leftEdgeX = leftEl.physX + leftEl.gridW / 2;
        else if (leftEl.type === 'floorSegment')   leftEdgeX = Math.max(leftEl.x1, leftEl.x2);  // 바닥면 오른쪽 끝
        else                                        leftEdgeX = spring.gridX;

        if      (rightEl.type === 'rect')           rightEdgeX = rightEl.physX;
        else if (rightEl.type === 'circle')         rightEdgeX = rightEl.physX - rightEl.gridW / 2;
        else if (rightEl.type === 'floorSegment')   rightEdgeX = Math.min(rightEl.x1, rightEl.x2);  // 바닥면 왼쪽 끝
        else                                         rightEdgeX = spring.gridX + spring.gridW;

        const L_current = rightEdgeX - leftEdgeX;
        const F = -spring.k * (L_current - spring.L0);

        // 체결 여부에 따른 힘 적용:
        // locked=true:  인장/압축 모두 전달 (체결)
        // locked=false: 압축(밀어내는 힘)만 전달, 인장 시(F<0 = 늘어남) 분리
        const pushLeft  = spring.leftLocked  ? true : F > 0;  // F>0: 압축 = 밀어냄
        const pushRight = spring.rightLocked ? true : F > 0;
        if (pushLeft  && (leftEl.type  === 'rect' || leftEl.type  === 'circle')) leftEl.ax  -= F / leftEl.mass;
        if (pushRight && (rightEl.type === 'rect' || rightEl.type === 'circle')) rightEl.ax += F / rightEl.mass;
        // 미체결 + 인장(F<0): 미체결 쪽만 분리 (체결된 쪽 leftLocked/rightLocked=true는 조건에서 제외)
        if (!spring.leftLocked  && F < 0) spring.leftElementId  = null;
        if (!spring.rightLocked && F < 0) spring.rightElementId = null;

        spring.L = Math.max(0.01, L_current);

        // gridX/W 동기화 (렌더 fallback용)
        if (leftEl.type !== 'floorSegment' || rightEl.type !== 'floorSegment') {
          spring.gridX = leftEdgeX;
          spring.gridW = Math.max(0.5, L_current);
          const lCY = leftEl.gridY  != null ? leftEl.gridY  + (leftEl.gridH  || 1) / 2 : spring.gridY + spring.gridH / 2;
          const rCY = rightEl.gridY != null ? rightEl.gridY + (rightEl.gridH || 1) / 2 : spring.gridY + spring.gridH / 2;
          spring.gridY = (lCY + rCY) / 2 - spring.gridH / 2;
        }
      } else {
        // ── 세로 모드: Y축 방향 (물리 좌표 y: 위=양수) ──
        // 위쪽(leftEl): 아래쪽 끝 physY (rect: physY 자체, circle: physY - r)
        let topEdgeY, botEdgeY;
        const GS = CONFIG.GRID_SIZE;

        if      (leftEl.type === 'rect')           topEdgeY = leftEl.physY;
        else if (leftEl.type === 'circle')         topEdgeY = leftEl.physY - leftEl.gridH / 2;
        else if (leftEl.type === 'floorSegment')   topEdgeY = GS - Math.max(leftEl.y1, leftEl.y2);  // 물리 y (y-up)
        else                                        topEdgeY = GS - spring.gridY - spring.gridH;

        if      (rightEl.type === 'rect')           botEdgeY = rightEl.physY + rightEl.gridH;
        else if (rightEl.type === 'circle')         botEdgeY = rightEl.physY + rightEl.gridH / 2;
        else if (rightEl.type === 'floorSegment')   botEdgeY = GS - Math.min(rightEl.y1, rightEl.y2);  // 물리 y (y-up)
        else                                         botEdgeY = GS - spring.gridY;

        // 물리 Y: 위쪽이 큰 값. 위쪽 물체 하단 - 아래쪽 물체 상단 = gap
        // L_current = 두 물체 사이의 간격 (물리 y-up 좌표계)
        // topEdgeY = 위 물체의 하단(physY), botEdgeY = 아래 물체의 상단(physY + gridH)
        const L_current = topEdgeY - botEdgeY;
        // F_restore > 0: 늘어남 → 서로 당김 / F_restore < 0: 압축 → 서로 밀어냄
        const F_restore = spring.k * (L_current - spring.L0);

        // 위 물체(leftEl): 늘어나면 아래로(ay -=), 압축이면 위로(ay +=)
        // F_restore > 0: 늘어남(당김) / F_restore < 0: 압축(밀어냄)
        // 세로: 위 물체는 F_restore>0이면 아래로 당겨짐, F_restore<0이면 위로 밀려남
        // 압축(F_restore<0) = 밀어내는 힘 → 미체결에도 전달
        const pushUp   = spring.leftLocked  ? true : F_restore < 0;  // 압축: 위 물체를 위로 밀어냄
        const pushDown = spring.rightLocked ? true : F_restore < 0;  // 압축: 아래 물체를 아래로 밀어냄
        if (pushUp   && (leftEl.type  === 'rect' || leftEl.type  === 'circle')) leftEl.ay  -= F_restore / leftEl.mass;
        if (pushDown && (rightEl.type === 'rect' || rightEl.type === 'circle')) rightEl.ay += F_restore / rightEl.mass;
        // 미체결 + 인장(F_restore>0): 미체결 쪽만 분리 (체결된 쪽은 !locked 조건에서 제외)
        if (!spring.leftLocked  && F_restore > 0) spring.leftElementId  = null;
        if (!spring.rightLocked && F_restore > 0) spring.rightElementId = null;

        spring.L = Math.max(0.01, L_current);

        // gridY/H 동기화
        if (leftEl.type !== 'floorSegment' || rightEl.type !== 'floorSegment') {
          // 위쪽 물체의 아래쪽 gridY
          const tGridY = (leftEl.gridY != null)  ? leftEl.gridY  + leftEl.gridH  : spring.gridY;
          const bGridY = (rightEl.gridY != null) ? rightEl.gridY                 : spring.gridY + spring.gridH;
          spring.gridY = tGridY;
          spring.gridH = Math.max(0.5, bGridY - tGridY);
          const lCX = leftEl.gridX  != null ? leftEl.gridX  + (leftEl.gridW  || 1) / 2 : spring.gridX + spring.gridW / 2;
          const rCX = rightEl.gridX != null ? rightEl.gridX + (rightEl.gridW || 1) / 2 : spring.gridX + spring.gridW / 2;
          spring.gridX = (lCX + rCX) / 2 - spring.gridW / 2;
        }
      }
    }
  }

  /* ── 7-1. 물체 간 충돌 resolveBodyCollisions() ── */
  function resolveBodyCollisions() {
    const bodies = STATE.elements.filter(e => e.type === 'rect' || e.type === 'circle');
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (a.type === 'rect'   && b.type === 'rect')   _resolveRectRect(a, b);
        if (a.type === 'circle' && b.type === 'circle') _resolveCircleCircle(a, b);
        if (a.type === 'rect'   && b.type === 'circle') _resolveRectCircle(a, b);
        if (a.type === 'circle' && b.type === 'rect')   _resolveRectCircle(b, a);
      }
    }
  }

  const GS_PHYS = () => CONFIG.GRID_SIZE;

  /** RectBody ↔ RectBody AABB */
  function _resolveRectRect(a, b) {
    // AABB 겹침 검사 (물리 좌표)
    const ox = Math.min(a.physX+a.gridW, b.physX+b.gridW) - Math.max(a.physX, b.physX);
    const oy = Math.min(a.physY+a.gridH, b.physY+b.gridH) - Math.max(a.physY, b.physY);
    if (ox <= 0 || oy <= 0) return;

    // 최소 관통축 (MTV): 법선은 a → b 방향
    // a_cx < b_cx 이면 a가 왼쪽 → a→b 는 +x (nx=+1)
    let nx, ny, pen;
    if (ox < oy) {
      pen = ox;
      nx  = (a.physX + a.gridW/2 < b.physX + b.gridW/2) ? 1 : -1;
      ny  = 0;
    } else {
      pen = oy;
      nx  = 0;
      ny  = (a.physY + a.gridH/2 < b.physY + b.gridH/2) ? 1 : -1;
    }

    const e_c  = Math.sqrt(a.e * b.e);
    const m1   = a.mass, m2 = b.mass;
    const invM = 1/m1 + 1/m2;

    // 위치 분리: a는 -nx 방향(b의 반대쪽), b는 +nx 방향(a의 반대쪽)
    a.physX -= nx * pen * (1/m1)/invM;
    a.physY -= ny * pen * (1/m1)/invM;
    b.physX += nx * pen * (1/m2)/invM;
    b.physY += ny * pen * (1/m2)/invM;
    _syncGrid(a); _syncGrid(b);

    // 충격량: vRel < 0 이면 서로 접근 중
    const vRel = (b.vx-a.vx)*nx + (b.vy-a.vy)*ny;
    if (vRel >= 0) return;
    const J = -(1 + e_c) * vRel / invM;
    a.vx -= J/m1 * nx;  a.vy -= J/m1 * ny;
    b.vx += J/m2 * nx;  b.vy += J/m2 * ny;
  }

  /** CircleBody ↔ CircleBody */
  function _resolveCircleCircle(a, b) {
    const dx   = b.physX - a.physX, dy = b.physY - a.physY;
    const dist = Math.hypot(dx, dy);
    const rSum = a.gridW/2 + b.gridW/2;
    if (dist >= rSum || dist < 1e-9) return;

    const nx = dx/dist, ny = dy/dist;
    const pen = rSum - dist;
    const e_c = Math.sqrt(a.e * b.e);
    const m1  = a.mass, m2 = b.mass;
    const invM = 1/m1 + 1/m2;

    a.physX -= nx * pen * (1/m1)/invM;
    a.physY -= ny * pen * (1/m1)/invM;
    b.physX += nx * pen * (1/m2)/invM;
    b.physY += ny * pen * (1/m2)/invM;
    _syncGrid(a); _syncGrid(b);

    const vRel = (b.vx-a.vx)*nx + (b.vy-a.vy)*ny;
    if (vRel >= 0) return;
    const J = -(1 + e_c) * vRel / invM;
    a.vx -= J/m1 * nx;  a.vy -= J/m1 * ny;
    b.vx += J/m2 * nx;  b.vy += J/m2 * ny;
  }

  /** RectBody ↔ CircleBody (원-AABB) */
  function _resolveRectCircle(rect, circ) {
    const cx = circ.physX, cy = circ.physY;
    const r  = circ.gridW / 2;
    // AABB 최근접점
    const clampedX = Math.max(rect.physX, Math.min(cx, rect.physX + rect.gridW));
    const clampedY = Math.max(rect.physY, Math.min(cy, rect.physY + rect.gridH));
    const dx = cx - clampedX, dy = cy - clampedY;
    const dist = Math.hypot(dx, dy);
    if (dist >= r || dist < 1e-9) return;

    const nx  = dx/dist, ny = dy/dist;
    const pen = r - dist;
    const e_c = Math.sqrt(rect.e * circ.e);
    const m1  = rect.mass, m2 = circ.mass;
    const invM = 1/m1 + 1/m2;

    rect.physX -= nx * pen * (1/m1)/invM;
    rect.physY -= ny * pen * (1/m1)/invM;
    circ.physX += nx * pen * (1/m2)/invM;
    circ.physY += ny * pen * (1/m2)/invM;
    _syncGrid(rect); _syncGrid(circ);

    const vRel = (circ.vx-rect.vx)*nx + (circ.vy-rect.vy)*ny;
    if (vRel >= 0) return;
    const J = -(1 + e_c) * vRel / invM;
    rect.vx -= J/m1 * nx;  rect.vy -= J/m1 * ny;
    circ.vx += J/m2 * nx;  circ.vy += J/m2 * ny;
  }

  /** physX/Y → gridX/Y 역산 헬퍼 */
  function _syncGrid(el) {
    const GS = CONFIG.GRID_SIZE;
    if (el.type === 'rect') {
      el.gridX = el.physX;
      el.gridY = GS - el.physY - el.gridH;
    } else if (el.type === 'circle') {
      el.gridX = el.physX - el.gridW / 2;
      el.gridY = GS - el.physY - el.gridH / 2;
    }
  }

  /* ================================================================
     [SPRING NEIGHBOR DETECTION] — 용수철 이웃 감지
  ================================================================ */

  /**
   * Spring 양단에 인접한 요소/FloorSegment를 감지
   * 반환: { leftId: string|null, rightId: string|null }
   */
  function detectSpringNeighbors(spring) {
    const leftX  = spring.gridX;
    const rightX = spring.gridX + spring.gridW;
    const topY   = spring.gridY;
    const botY   = spring.gridY + spring.gridH;

    let leftId  = null;
    let rightId = null;

    if (!spring.isVertical) {
      // ── 가로 모드: 왼쪽/오른쪽 이웃 ──
      for (const el of STATE.elements) {
        if (el === spring) continue;
        if (!['rect', 'circle'].includes(el.type)) continue;
        if (el.gridX + el.gridW === leftX && el.gridY < botY && el.gridY + el.gridH > topY)
          leftId = el.id;
        if (el.gridX === rightX && el.gridY < botY && el.gridY + el.gridH > topY)
          rightId = el.id;
      }
      for (const seg of STATE.floorSegments) {
        // 끝점 기준
        if (!leftId  && ((seg.x1 === leftX  && seg.y1 >= topY && seg.y1 <= botY) || (seg.x2 === leftX  && seg.y2 >= topY && seg.y2 <= botY))) leftId  = seg.id;
        if (!rightId && ((seg.x1 === rightX && seg.y1 >= topY && seg.y1 <= botY) || (seg.x2 === rightX && seg.y2 >= topY && seg.y2 <= botY))) rightId = seg.id;
        // 수평 선분이 용수철 좌측/우측 면에 걸쳐 있는 경우
        if (!leftId && seg.pathType === 'LINE') {
          const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2), maxY = Math.max(seg.y1, seg.y2);
          if (maxX >= leftX && minX <= leftX && minY <= botY && maxY >= topY) leftId = seg.id;
        }
        if (!rightId && seg.pathType === 'LINE') {
          const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2), maxY = Math.max(seg.y1, seg.y2);
          if (maxX >= rightX && minX <= rightX && minY <= botY && maxY >= topY) rightId = seg.id;
        }
      }
    } else {
      // ── 세로 모드: 위/아래 이웃 ──
      for (const el of STATE.elements) {
        if (el === spring) continue;
        if (!['rect', 'circle'].includes(el.type)) continue;
        if (el.gridY + el.gridH === topY && el.gridX < rightX && el.gridX + el.gridW > leftX)
          leftId = el.id;
        if (el.gridY === botY && el.gridX < rightX && el.gridX + el.gridW > leftX)
          rightId = el.id;
      }
      for (const seg of STATE.floorSegments) {
        // 끝점 기준
        if (!leftId  && ((seg.y1 === topY && seg.x1 >= leftX && seg.x1 <= rightX) || (seg.y2 === topY && seg.x2 >= leftX && seg.x2 <= rightX))) leftId  = seg.id;
        if (!rightId && ((seg.y1 === botY && seg.x1 >= leftX && seg.x1 <= rightX) || (seg.y2 === botY && seg.x2 >= leftX && seg.x2 <= rightX))) rightId = seg.id;
        // 수평 선분이 용수철 위쪽/아래쪽 면에 걸쳐 있는 경우
        if (!leftId && seg.pathType === 'LINE') {
          const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2), maxY = Math.max(seg.y1, seg.y2);
          if (maxY >= topY && minY <= topY && minX <= rightX && maxX >= leftX) leftId = seg.id;
        }
        if (!rightId && seg.pathType === 'LINE') {
          const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2), maxY = Math.max(seg.y1, seg.y2);
          if (maxY >= botY && minY <= botY && minX <= rightX && maxX >= leftX) rightId = seg.id;
        }
      }
    }

    return { leftId, rightId };
  }

  /* ================================================================
     [VALIDATION] — 유효성 검사 (섹션 12-2 전체)
  ================================================================ */

  function validateAll() {
    const warnings = [];

    // 1. 용수철 이웃 감지 (경고 없음 — 체결 여부는 패널에서 사용자가 설정)
    STATE.elements.filter(e => e.type === 'spring').forEach(s => {
      const nb = detectSpringNeighbors(s);
      s.leftElementId  = nb.leftId;
      s.rightElementId = nb.rightId;
    });

    // 2. 도르래 한쪽만 연결 = 도르래를 고정점으로 하는 단순 실 (경고 없이 허용, QC #12)

    const unique = [...new Set(warnings)];
    if (unique.length > 0) {
      warningBar.textContent = unique.join('  |  ');
      warningBar.style.display = 'block';
    } else {
      warningBar.style.display = 'none';
    }
    btnRun.disabled = false;
    btnRun.style.opacity = '1';

    // 패널도 갱신 (Spring 연결 상태 변화 반영)
    if (STATE.selected && STATE.selected.type === 'spring') renderPanel();
  }

  /** Pulley physX/Y 동기화 (편집 모드에서 격자 이동 시 반영) */
  function syncPulleyPhys() {
    const GS = CONFIG.GRID_SIZE;
    for (const el of STATE.elements) {
      if (el.type !== 'pulley') continue;
      el.physX = el.gridX + el.gridW / 2;
      el.physY = GS - el.gridY - el.gridH / 2;
    }
  }
