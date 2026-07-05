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
      // 림↔림 실은 양쪽 도르래 그룹에 등록 (도르래-실 그래프 구성)
      if (aIsRim) {
        pulleyGroups.get(elA.id).push({ rope, bodyAnchor: rope.anchorB, pulleyAnchor: rope.anchorA });
        pulleyRopeIds.add(rope.id);
      }
      if (bIsRim) {
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
      resolveRopeConstraints(subDt);
    }
  }

  /* ── 힘 적용 (중력 + ForceZone + 용수철) ── */
  function applyForces(dt) {
    for (const el of STATE.elements) {
      if (!['rect', 'circle', 'pulley'].includes(el.type)) continue;

      // 중력 — 도르래는 무질량 중계점(자체 관성/무게 없음)이므로 제외
      if (STATE.gravityOn && el.type !== 'pulley') {
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
      // 도르래는 무질량 중계점 — 위치는 제약 해소가 결정하므로 자유 적분 제외
      if (!['rect', 'circle'].includes(el.type)) continue;

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

    // 공유 조인트(ELBOW/ARC 내부 연결점) 키맵 — ≥2개 미세 선분이 만나는 끝점.
    // 자유 끝단(1회 등장)은 바닥 끝 → 물체가 지나쳐 낙하해야 하므로 제외.
    const _jkey = (x, y) => (Math.round(x*1000)/1000) + ',' + (Math.round(y*1000)/1000);
    const jointCount = new Map();
    for (const seg of segs) {
      for (const p of [[seg.x1, seg.y1], [seg.x2, seg.y2]]) {
        const k = _jkey(p[0], p[1]);
        jointCount.set(k, (jointCount.get(k) || 0) + 1);
      }
    }

    const maxAllowedPen = el.gridW + el.gridH;
    for (const seg of segs) {
      const sdx = seg.x2 - seg.x1, sdy = seg.y2 - seg.y1;
      const lenSq = sdx*sdx + sdy*sdy;
      if (lenSq < 1e-12) continue;

      const snx = seg.normalX, sny = seg.normalY;

      for (const c of corners) {
        let t = ((c.x - seg.x1)*sdx + (c.y - seg.y1)*sdy) / lenSq;
        if (t < 0 || t > 1) {
          // 세그먼트 끝단: 공유 조인트일 때만 최근접점(끝점)으로 클램프.
          // 자유 끝단이면 스킵 → 바닥 끝을 지나 낙하 허용(팬텀 지지 방지).
          const tc = t < 0 ? 0 : 1;
          const jx = seg.x1 + tc*sdx, jy = seg.y1 + tc*sdy;
          if ((jointCount.get(_jkey(jx, jy)) || 0) < 2) continue;
          t = tc;
        }

        const footX = seg.x1 + t*sdx;
        const footY = seg.y1 + t*sdy;
        const fx = c.x - footX, fy = c.y - footY;
        const signed = fx*snx + fy*sny;   // 표면 법선 방향 부호 거리 → 배출도 법선 방향

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
     [ROPE & PULLEY CONSTRAINTS — 재설계 v2: 무질량 중계점 통일]
     실: 최대 길이 제한만 (이완 시 힘 없음, 팽팽 시 장력)
     도르래: 무질량 "중계점" — 자체 관성/무게 없음.
             위치는 연결 제약이 결정, 속도는 위치 갱신에서 유도(v=Δx/dt).
       · 고정 도르래(center 앵커가 고정점에 연결): 위치 불변, 물체만 제약 해소.
       · 움직 도르래: 위치가 자유 — Atwood/실 제약이 도르래 중심을 이동.
     림↔림 실은 양쪽 도르래 그룹에 등록 → 도르래-실 네트워크를
     축차(Gauss-Seidel) 위치 투영으로 해소 (무질량 노드는 큰 유효
     역질량으로 상대적 자유도를 부여, 자기 제약이 과운동을 되돌림).
  ================================================================ */

  // 무질량 도르래의 유효 역질량 — 유한 물체(1/m ~ 0.01..10)보다 훨씬 크게
  // 잡아 제약 보정을 도르래가 우선 흡수(중계점)하게 한다.
  const PULLEY_RELAY_INVMASS = 1e3;
  const _EMPTY_SET = new Set();

  /** center 앵커 실이 고정점(FloorSegment)에 연결된 도르래 = 고정 도르래 */
  function _computeFixedPulleys() {
    const fixed = new Set();
    for (const rope of STATE.ropes) {
      const mark = (pAnchor, oAnchor) => {
        const p = STATE.elements.find(e => e.id === pAnchor.elementId);
        if (!p || p.type !== 'pulley' || pAnchor.attachPoint !== 'center') return;
        if (STATE.floorSegments.find(s => s.id === oAnchor.elementId)) fixed.add(p.id);
      };
      mark(rope.anchorA, rope.anchorB);
      mark(rope.anchorB, rope.anchorA);
    }
    return fixed;
  }

  /** 노드의 위치-투영 역질량(가중치)
   * FloorSegment / 고정 도르래 → 0 (불변)
   * 움직 도르래            → PULLEY_RELAY_INVMASS (중계점)
   * 유한 물체              → 1/m
   */
  function _nodeInvMass(elementId, fixedPulleys) {
    if (STATE.floorSegments.find(s => s.id === elementId)) return 0;
    const el = STATE.elements.find(e => e.id === elementId);
    if (!el) return 0;
    if (el.type === 'pulley') return fixedPulleys.has(el.id) ? 0 : PULLEY_RELAY_INVMASS;
    const m = el.mass || 1;
    return m > 0 ? 1 / m : 0;
  }

  function resolveRopeConstraints(subDt) {
    /* ── 1. 도르래별 연결 실 그룹화 (림↔림 실은 양쪽 그룹에 등록) ── */
    const pulleyGroups = new Map();
    for (const el of STATE.elements) {
      if (el.type === 'pulley') pulleyGroups.set(el.id, []);
    }

    const pulleyRopeIds = new Set();

    for (const rope of STATE.ropes) {
      const elA = STATE.elements.find(e => e.id === rope.anchorA.elementId);
      const elB = STATE.elements.find(e => e.id === rope.anchorB.elementId);

      // center 앵커 = 도르래 고정/하중용 → 단순 실 (Atwood 그룹 아님)
      const aIsRim = elA && elA.type === 'pulley' && rope.anchorA.attachPoint !== 'center';
      const bIsRim = elB && elB.type === 'pulley' && rope.anchorB.attachPoint !== 'center';

      if (aIsRim) {
        pulleyGroups.get(elA.id).push({ rope, bodyAnchor: rope.anchorB, pulleyAnchor: rope.anchorA });
        pulleyRopeIds.add(rope.id);
      }
      if (bIsRim) {
        pulleyGroups.get(elB.id).push({ rope, bodyAnchor: rope.anchorA, pulleyAnchor: rope.anchorB });
        pulleyRopeIds.add(rope.id);
      }
    }

    const simpleRopes = STATE.ropes.filter(r => !pulleyRopeIds.has(r.id));
    const fixedPulleys = _computeFixedPulleys();

    // 무질량 노드 속도 유도용: 서브스텝 제약 해소 전 도르래 위치 기록
    const prePos = new Map();
    for (const el of STATE.elements) {
      if (el.type === 'pulley') prePos.set(el.id, { x: el.physX, y: el.physY });
    }

    /* ── 2. 반복 위치 제약 해소 (무질량 네트워크는 반복 수를 늘려 수렴 유도) ── */
    const hasMovablePulley = [...pulleyGroups.keys()].some(id => !fixedPulleys.has(id));
    const iters = hasMovablePulley ? 24 : 8;
    for (let iter = 0; iter < iters; iter++) {
      for (const rope of simpleRopes) {
        _simpleRopeConstraint(rope, fixedPulleys);
      }
      for (const [pulleyId, group] of pulleyGroups) {
        if (!fixedPulleys.has(pulleyId)) {
          // 움직 도르래(무질량): Atwood 합제약은 접선 특이 모드(한쪽 신장/한쪽
          // 이완, 합 보존)를 못 막아 도르래가 자유낙하한다. 각 림 실을 개별
          // 신축 불가 제약으로 걸어 도르래 중심을 실이 직접 붙잡게 한다.
          for (const g of group) _simpleRopeConstraint(g.rope, fixedPulleys);
        } else if (group.length >= 2) {
          // 고정 도르래: Atwood 합제약 (d0+d1=일정) — 검증된 단일 도르래 경로.
          for (let k = 1; k < group.length; k++) {
            _atwoodConstraint(pulleyId, group[k - 1], group[k], fixedPulleys);
          }
        } else if (group.length === 1) {
          // 한쪽만 연결 → 도르래를 고정점으로 하는 단순 실 (QC #12)
          _simpleRopeConstraint(group[0].rope, fixedPulleys);
        }
      }
    }

    /* ── 3. 무질량 노드 속도 = Δx / subDt (위치 갱신과 일관) ── */
    if (subDt && subDt > 0) {
      for (const el of STATE.elements) {
        if (el.type !== 'pulley') continue;
        const p0 = prePos.get(el.id);
        if (!p0) continue;
        el.vx = (el.physX - p0.x) / subDt;
        el.vy = (el.physY - p0.y) / subDt;
      }
    }
  }

  /* ── 단순 실 제약 ──
   * 거리 > ropeLength 일 때만 장력 작용 (이완 시 완전 무시)
   * vRel > 0: 두 앵커가 서로 멀어지고 있는 상황 → 속도 보정
   */
  function _simpleRopeConstraint(rope, fixedPulleys) {
    fixedPulleys = fixedPulleys || _EMPTY_SET;
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

    // 무질량 중계점 통일 규칙: 고정=0, 움직 도르래=중계(큰 역질량), 유한=1/m
    const w1 = _nodeInvMass(rope.anchorA.elementId, fixedPulleys);
    const w2 = _nodeInvMass(rope.anchorB.elementId, fixedPulleys);
    const wSum = w1 + w2;
    if (wSum < 1e-12) return;   // 양쪽 고정

    // 위치 보정 (역질량 비례 분배)
    _applyPhysDelta(rope.anchorA.elementId, +nx * excess * (w1 / wSum), +ny * excess * (w1 / wSum));
    _applyPhysDelta(rope.anchorB.elementId, -nx * excess * (w2 / wSum), -ny * excess * (w2 / wSum));

    // ── 속도 보정 (뉴턴 3법칙: 동일 충격량 J를 양쪽에 반대로 적용) ──
    // 무질량 도르래 속도는 위치 갱신에서 유도하므로 여기선 유한 물체만 갱신.
    const elAObj = STATE.elements.find(e => e.id === rope.anchorA.elementId);
    const elBObj = STATE.elements.find(e => e.id === rope.anchorB.elementId);
    const aFinite = elAObj && ['rect','circle'].includes(elAObj.type);
    const bFinite = elBObj && ['rect','circle'].includes(elBObj.type);
    const iv1 = aFinite ? (1 / (elAObj.mass || 1)) : 0;
    const iv2 = bFinite ? (1 / (elBObj.mass || 1)) : 0;
    const vAx = elAObj ? (elAObj.vx||0) : 0, vAy = elAObj ? (elAObj.vy||0) : 0;
    const vBx = elBObj ? (elBObj.vx||0) : 0, vBy = elBObj ? (elBObj.vy||0) : 0;
    const vRel = (vBx - vAx)*nx + (vBy - vAy)*ny;

    if (vRel > 1e-9) {
      const effInvSum = iv1 + iv2;
      if (effInvSum >= 1e-12) {
        const J = vRel / effInvSum;   // 충격량 크기 (scalar)
        if (aFinite) { elAObj.vx += nx * J * iv1; elAObj.vy += ny * J * iv1; }
        if (bFinite) { elBObj.vx -= nx * J * iv2; elBObj.vy -= ny * J * iv2; }
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
  function _atwoodConstraint(pulleyId, g0, g1, fixedPulleys) {
    fixedPulleys = fixedPulleys || _EMPTY_SET;
    const pulley = STATE.elements.find(e => e.id === pulleyId);
    if (!pulley) return;

    // ── 기준점: 사용자가 연결한 실제 앵커 포인트(림 위치) ──
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

    const L0 = g0.rope.calibratedLength ?? g0.rope.ropeLength;
    const L1 = g1.rope.calibratedLength ?? g1.rope.ropeLength;
    const L_total = L0 + L1;
    const excess  = (d0 + d1) - L_total;

    const el0 = STATE.elements.find(e => e.id === g0.bodyAnchor.elementId);
    const el1 = STATE.elements.find(e => e.id === g1.bodyAnchor.elementId);

    // ── 위치 보정 (팽팽 시) ──
    // C = d0 + d1 - L_total.  ∇: body0=n0, body1=n1, 도르래 중심=-(n0+n1)
    // (림 위치는 도르래 중심을 따라 이동하므로 중심에 대한 기울기에 두 항이 합쳐짐)
    if (excess > 1e-6) {
      const w0 = _nodeInvMass(g0.bodyAnchor.elementId, fixedPulleys);
      const w1 = _nodeInvMass(g1.bodyAnchor.elementId, fixedPulleys);
      const wp = fixedPulleys.has(pulleyId) ? 0 : PULLEY_RELAY_INVMASS;
      const gpx = -(n0x + n1x), gpy = -(n0y + n1y);
      const denom = w0 + w1 + wp * (gpx*gpx + gpy*gpy);
      if (denom > 1e-12) {
        const lambda = excess / denom;
        _applyPhysDelta(g0.bodyAnchor.elementId, -lambda * w0 * n0x, -lambda * w0 * n0y);
        _applyPhysDelta(g1.bodyAnchor.elementId, -lambda * w1 * n1x, -lambda * w1 * n1y);
        if (wp > 0) _applyPhysDelta(pulleyId, -lambda * wp * gpx, -lambda * wp * gpy);
      }
    }

    // ── 속도 보정: 팽팽 상태에서 ḋ0 + ḋ1 = 0 (유한 물체만; 도르래 속도는 위치 유도) ──
    if (d0 + d1 < L_total - 1e-4) return;

    const inv0 = (el0 && ['rect','circle'].includes(el0.type)) ? 1 / (el0.mass || 1) : 0;
    const inv1 = (el1 && ['rect','circle'].includes(el1.type)) ? 1 / (el1.mass || 1) : 0;
    const invSum = inv0 + inv1;
    if (invSum < 1e-12) return;

    const vpx = pulley.vx || 0, vpy = pulley.vy || 0;
    const v0x = el0 ? (el0.vx||0) : 0, v0y = el0 ? (el0.vy||0) : 0;
    const v1x = el1 ? (el1.vx||0) : 0, v1y = el1 ? (el1.vy||0) : 0;

    // ḋ_i = (v_body_i - v_pulley) · n_i
    const dDot0 = (v0x - vpx)*n0x + (v0y - vpy)*n0y;
    const dDot1 = (v1x - vpx)*n1x + (v1y - vpy)*n1y;
    const violation = dDot0 + dDot1;
    if (Math.abs(violation) < 1e-9) return;

    const lambda = violation / invSum;

    if (inv0 > 0) { el0.vx -= lambda * inv0 * n0x; el0.vy -= lambda * inv0 * n0y; }
    if (inv1 > 0) { el1.vx -= lambda * inv1 * n1x; el1.vy -= lambda * inv1 * n1y; }
  }

  /* ── 용수철 부착점(물리 좌표, y-up) ──
   * side: 'right'/'left'/'top'/'bottom' — 이 요소가 용수철을 향하는 면.
   * 부착점은 요소의 해당 면 중앙 → 물체가 2D로 움직이면 부착점도 함께 이동
   * → 용수철 축이 회전(완전 2D). floorSegment는 caller가 투영 처리(null 반환).
   */
  function _springAttachFace(el, side) {
    if (el.type === 'rect') {
      switch (side) {
        case 'right':  return { x: el.physX + el.gridW,     y: el.physY + el.gridH / 2 };
        case 'left':   return { x: el.physX,                y: el.physY + el.gridH / 2 };
        case 'bottom': return { x: el.physX + el.gridW / 2, y: el.physY };
        case 'top':    return { x: el.physX + el.gridW / 2, y: el.physY + el.gridH };
      }
    }
    if (el.type === 'circle') {
      const r = el.gridW / 2;   // physX/Y = 중심
      switch (side) {
        case 'right':  return { x: el.physX + r, y: el.physY };
        case 'left':   return { x: el.physX - r, y: el.physY };
        case 'bottom': return { x: el.physX,     y: el.physY - r };
        case 'top':    return { x: el.physX,     y: el.physY + r };
      }
    }
    return null;  // floorSegment
  }

  /* ── 7-2. 용수철 힘 applySpringForces() — 완전 2D 벡터 물리 ──
   * F = -k(|d|-L0)·d̂, 양끝 부착점 사이 벡터 d 기준. 축 분기 없음(모드는
   * 부착 면 선택에만 사용). 부착점이 2D로 움직이면 복원력 방향도 함께 회전.
   */
  function applySpringForces() {
    const GS = CONFIG.GRID_SIZE;
    const segClosest = (seg, px, py) => {
      const ax = seg.x1, ay = GS - seg.y1, bx = seg.x2, by = GS - seg.y2;  // 물리 좌표
      const dx = bx - ax, dy = by - ay, l2 = dx*dx + dy*dy;
      let t = l2 > 1e-9 ? ((px-ax)*dx + (py-ay)*dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      return { x: ax + t*dx, y: ay + t*dy };
    };

    for (const spring of STATE.elements) {
      if (spring.type !== 'spring') continue;
      if (!spring.leftElementId || !spring.rightElementId) continue;

      const leftEl  = STATE.elements.find(e => e.id === spring.leftElementId)
                   || STATE.floorSegments.find(s => s.id === spring.leftElementId);
      const rightEl = STATE.elements.find(e => e.id === spring.rightElementId)
                   || STATE.floorSegments.find(s => s.id === spring.rightElementId);
      if (!leftEl || !rightEl) continue;

      // 부착 면: 가로 → left의 오른쪽 면 / right의 왼쪽 면.
      //          세로 → 위(left)의 아래 면 / 아래(right)의 위 면.
      const leftSide  = spring.isVertical ? 'bottom' : 'right';
      const rightSide = spring.isVertical ? 'top'    : 'left';
      let A = _springAttachFace(leftEl,  leftSide);
      let B = _springAttachFace(rightEl, rightSide);
      if (!A && !B) {
        A = { x: (leftEl.x1 + leftEl.x2)/2,  y: GS - (leftEl.y1 + leftEl.y2)/2 };
        B = { x: (rightEl.x1 + rightEl.x2)/2, y: GS - (rightEl.y1 + rightEl.y2)/2 };
      } else if (!A) { A = segClosest(leftEl,  B.x, B.y); }
      else if (!B)   { B = segClosest(rightEl, A.x, A.y); }

      const dx = B.x - A.x, dy = B.y - A.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-9) continue;              // 축 미정의 → 이 프레임 건너뜀
      const ux = dx / dist, uy = dy / dist;   // A→B 단위 벡터

      // sForce > 0: 늘어남(양끝 서로 당김) / < 0: 압축(양끝 서로 밀어냄)
      const sForce = spring.k * (dist - spring.L0);

      // 체결(locked): 인장·압축 모두 전달. 미체결: 압축(밀어냄, sForce<0)만.
      const leftTransmit  = spring.leftLocked  || sForce < 0;
      const rightTransmit = spring.rightLocked || sForce < 0;
      // A(left)에는 +sForce·û(늘어나면 B쪽으로), B(right)에는 반대로.
      if (leftTransmit  && (leftEl.type  === 'rect' || leftEl.type  === 'circle')) {
        leftEl.ax  += sForce * ux / leftEl.mass;
        leftEl.ay  += sForce * uy / leftEl.mass;
      }
      if (rightTransmit && (rightEl.type === 'rect' || rightEl.type === 'circle')) {
        rightEl.ax -= sForce * ux / rightEl.mass;
        rightEl.ay -= sForce * uy / rightEl.mass;
      }
      // 미체결 + 인장(sForce>0): 미체결 쪽 분리 (당길 수 없음)
      if (!spring.leftLocked  && sForce > 0) spring.leftElementId  = null;
      if (!spring.rightLocked && sForce > 0) spring.rightElementId = null;

      spring.L = Math.max(0.01, dist);
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
        // 선분이 용수철 좌/우 면을 가로지르는 경우 — 단, 용수철 축(가로)에
        // 수직인 면(세로 벽)일 때만 체결. 평행한 바닥(가로 선분)은 오판정 제외(#7).
        const segVertical = Math.abs(seg.y2 - seg.y1) >= Math.abs(seg.x2 - seg.x1);
        if (!leftId && seg.pathType === 'LINE' && segVertical) {
          const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2), maxY = Math.max(seg.y1, seg.y2);
          if (maxX >= leftX && minX <= leftX && minY <= botY && maxY >= topY) leftId = seg.id;
        }
        if (!rightId && seg.pathType === 'LINE' && segVertical) {
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
        // 선분이 용수철 상/하 면을 가로지르는 경우 — 단, 용수철 축(세로)에
        // 수직인 면(가로 바닥)일 때만 체결. 평행한 세로 벽은 오판정 제외(#7).
        const segHorizontal = Math.abs(seg.x2 - seg.x1) >= Math.abs(seg.y2 - seg.y1);
        if (!leftId && seg.pathType === 'LINE' && segHorizontal) {
          const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2), maxY = Math.max(seg.y1, seg.y2);
          if (maxY >= topY && minY <= topY && minX <= rightX && maxX >= leftX) leftId = seg.id;
        }
        if (!rightId && seg.pathType === 'LINE' && segHorizontal) {
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

    // 1. 용수철 이웃 감지 (#5 자동 체결)
    //    autoAttach=true(기본): 접촉 감지 시 elementId + locked 자동 세팅
    //      (새로 붙는 순간 locked=true; 붙어있는 동안 사용자 토글은 보존).
    //    autoAttach=false: 접촉해도 자동 체결하지 않음(감지 스킵).
    STATE.elements.filter(e => e.type === 'spring').forEach(s => {
      if (s.autoAttach === false) return;
      const nb = detectSpringNeighbors(s);
      if (s.leftElementId !== nb.leftId) {
        s.leftElementId = nb.leftId;
        s.leftLocked    = !!nb.leftId;   // 새 체결이면 잠금, 분리면 해제
      }
      if (s.rightElementId !== nb.rightId) {
        s.rightElementId = nb.rightId;
        s.rightLocked    = !!nb.rightId;
      }
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
