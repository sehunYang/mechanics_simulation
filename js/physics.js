/* ============================================================
   physics.js — 시뮬레이션 스텝·중력·충돌·실/도르래/용수철·검증
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [SIMULATION] — Sprint 6 완성
  ================================================================ */

  /* ── 시뮬 제어 ── */
  function startSimulation() {
    clearTrails();          // saveSnapshot 이전에 비워 스냅샷이 깨끗하도록
    saveSnapshot();
    initPhysics();
    STATE.simTime = 0;
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
        case 'extforce':  el = new ExtForce();    break;
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
    clearTrails();
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
      if (el.type === 'spring') {
        // 지난 실행에서 분리된 흔적 초기화 (분리 = 실행 중에만 생기는 상태)
        el._leftDetached  = false;
        el._rightDetached = false;
        el.L = el.L0;
      }
    }
    // 바닥면과 이미 겹쳐 배치된 물체를 표면 밖으로 1회 밀어냄 (단면 판정 기준 정렬)
    _depenetrateInitial();
    // 시뮬 시작 시점 실제 물리 거리로 보정
    calibrateRopeLengths();
  }

  /**
   * calibrateRopeLengths
   * 시뮬 시작 직후 각 Rope의 calibratedLength를 실제 물리 거리로 고정.
   * Atwood: 두 실의 거리 합을 L_total로 저장.
   * 단순 실: 현재 물리 거리를 저장.
   */
  /** 실이 외력(ExtForce)에 연결돼 있는지 — 외력 실은 길이 제약이 아니라
   *  힘의 원천/시각 요소이므로 로프/도르래 제약 그래프에서 제외한다 (#2). */
  function _ropeHasExtForce(rope) {
    const a = STATE.elements.find(e => e.id === rope.anchorA.elementId);
    const b = STATE.elements.find(e => e.id === rope.anchorB.elementId);
    return (a && a.type === 'extforce') || (b && b.type === 'extforce');
  }

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
      if (_ropeHasExtForce(rope)) continue;   // 외력 실은 제약 제외 (#2)
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
        const d = Math.hypot(pos.x - rim.x, pos.y - rim.y);
        g.rope.calibratedLength = d;
        // 하한(0) 판정용 기준 방향 초기화 — _simpleRopeConstraint의 터널링 방지에 사용
        if (d > 1e-9) { g.rope._refDirX = (pos.x - rim.x) / d; g.rope._refDirY = (pos.y - rim.y) / d; }
      }
    }

    // 단순 실: 현재 물리 거리를 calibratedLength로 저장
    for (const rope of STATE.ropes) {
      if (pulleyRopeIds.has(rope.id)) continue;
      if (_ropeHasExtForce(rope)) continue;   // 외력 실 제외 (#2)
      const A = getAttachPhysPos(rope.anchorA);
      const B = getAttachPhysPos(rope.anchorB);
      if (!A || !B) continue;
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      rope.calibratedLength = d;
      if (d > 1e-9) { rope._refDirX = (B.x - A.x) / d; rope._refDirY = (B.y - A.y) / d; }
    }

    // 외력(ExtForce): 시작 시점의 실 방향을 고정 방향으로 동결.
    //   · 물체 직접 부착: 물체→앵커 방향으로 힘 N, 앵커는 물체를 따라 이동.
    //   · 도르래 경유(#2): 도르래의 다른 실이 연결된 물체를, 그 실이 도르래에
    //     닿는 지점(rim/center) 방향으로 당김 (이상적 마찰無 도르래 = 장력 전달).
    for (const ef of STATE.elements) {
      if (ef.type !== 'extforce') continue;
      ef._targets = [];   // [{ bodyId, fdx, fdy, pAnchor, bAnchor, dist0 }]
      ef._offX = ef._offY = ef._followAnchor = null;   // 직접 부착 추종용
      ef._selfRimAnchor = ef._selfDir0 = ef._selfDist0 = null;   // 도르래 경유 손 이동용
      if (!(ef.forceN > 0)) continue;
      const rope = STATE.ropes.find(r =>
        r.anchorA.elementId === ef.id || r.anchorB.elementId === ef.id);
      if (!rope) continue;
      const efAnchor    = rope.anchorA.elementId === ef.id ? rope.anchorA : rope.anchorB;
      const otherAnchor = rope.anchorA.elementId === ef.id ? rope.anchorB : rope.anchorA;
      const otherEl = STATE.elements.find(e => e.id === otherAnchor.elementId);
      if (!otherEl) continue;
      const efPos = getAttachPhysPos(efAnchor);
      if (!efPos) continue;

      if (otherEl.type === 'rect' || otherEl.type === 'circle') {
        // ── 직접 부착 ──
        const bodyPos = getAttachPhysPos(otherAnchor);
        if (!bodyPos) continue;
        const offX = efPos.x - bodyPos.x, offY = efPos.y - bodyPos.y;
        const dist = Math.hypot(offX, offY);
        if (dist < 1e-9) continue;
        ef._targets.push({ bodyId: otherEl.id, fdx: offX / dist, fdy: offY / dist });
        ef._offX = offX; ef._offY = offY;      // 앵커 추종 오프셋
        ef._followAnchor = otherAnchor;
      } else if (otherEl.type === 'pulley') {
        // ── 도르래 경유 (#2) ── 도르래에 연결된 다른 실의 물체들을 당김
        // 손(외력 자신) 쪽 실이 도르래에 닿는 지점 — 대상 물체의 이동량만큼
        // 반대로 움직여 손이 물체를 따라가는 것처럼 보이게 하는 기준점 (아래 updateExtForceAnchors 참조).
        const selfRimPos = getAttachPhysPos(otherAnchor);
        if (selfRimPos) {
          const selfDX = efPos.x - selfRimPos.x, selfDY = efPos.y - selfRimPos.y;
          const selfDist0 = Math.hypot(selfDX, selfDY);
          if (selfDist0 > 1e-9) {
            ef._selfRimAnchor = otherAnchor;
            ef._selfDir0 = { x: selfDX / selfDist0, y: selfDY / selfDist0 };
            ef._selfDist0 = selfDist0;
          }
        }
        for (const r2 of STATE.ropes) {
          if (r2 === rope || _ropeHasExtForce(r2)) continue;
          let pAnchor = null, bAnchor = null;
          if (r2.anchorA.elementId === otherEl.id)      { pAnchor = r2.anchorA; bAnchor = r2.anchorB; }
          else if (r2.anchorB.elementId === otherEl.id) { pAnchor = r2.anchorB; bAnchor = r2.anchorA; }
          else continue;
          const body = STATE.elements.find(e => e.id === bAnchor.elementId);
          if (!body || !['rect', 'circle'].includes(body.type)) continue;
          const rimPos  = getAttachPhysPos(pAnchor);
          const bodyPos = getAttachPhysPos(bAnchor);
          if (!rimPos || !bodyPos) continue;
          const offX = rimPos.x - bodyPos.x, offY = rimPos.y - bodyPos.y;
          const dist = Math.hypot(offX, offY);
          if (dist < 1e-9) continue;
          ef._targets.push({ bodyId: body.id, fdx: offX / dist, fdy: offY / dist, pAnchor, bAnchor, dist0: dist });
        }
      }
    }
  }

  /* ── 6-3. 시뮬 스텝 (4 서브스텝) ── */
  function simStep(dt) {
    const sub = CONFIG.SUBSTEPS;
    const subDt = dt / sub;
    for (let i = 0; i < sub; i++) {
      _clearStepFlags();
      const _e0 = _stepEnergyBefore();
      applyForces(subDt);
      integrate(subDt);
      updateExtForceAnchors();   // 외력 앵커가 물체를 따라 이동 (실 방향 유지)
      resolveFloorCollisions(subDt);
      resolveBodyCollisions();
      resolveRopeConstraints(subDt);
      _projectStepEnergy(_e0);
    }
    recordTrails();
  }

  /* ================================================================
     [TRAILS] — 물체별 궤적
     showTrail 이 켜진 물체만 기록한다 (꺼두면 메모리도 쓰지 않는다).
     좌표는 격자 칸 단위(중심) — 줌·리사이즈로 cellSize 가 바뀌어도 유효하다.
  ================================================================ */

  function recordTrails() {
    const minStep2 = Math.pow(CONFIG.TRAIL_MIN_STEP || 0.04, 2);
    const cap      = CONFIG.TRAIL_MAX_POINTS || 4000;
    for (const el of STATE.elements) {
      if (el.type !== 'rect' && el.type !== 'circle') continue;
      if (!el._trail) el._trail = [];
      // 표시를 끈 물체는 기록하지 않는다.
      //   실행 중에는 물체를 선택할 수 없어(편집 차단) 궤적을 다시 켤 방법이 없다.
      //   즉 토글은 실행 전에만 정해지므로, 꺼둔 물체의 좌표를 쌓아 둘 이유가 없다.
      //   (끄면 그때까지의 궤적도 지운다 — 다시 켜면 그 시점부터 새로 그린다)
      if (!el.showTrail) { if (el._trail.length) el._trail.length = 0; continue; }
      const t  = el._trail;
      const cx = el.gridX + el.gridW / 2;
      const cy = el.gridY + el.gridH / 2;
      if (t.length) {
        const last = t[t.length - 1];
        const dx = cx - last.x, dy = cy - last.y;
        if (dx * dx + dy * dy < minStep2) continue;   // 정지·미세 진동은 쌓지 않음
      }
      t.push({ x: cx, y: cy });
      if (t.length > cap) t.splice(0, Math.floor(cap * 0.25));   // 앞쪽부터 버림
    }
  }

  /** 모든 물체의 궤적 비우기 (실행 시작 / 초기화) */
  function clearTrails() {
    for (const el of STATE.elements) if (el._trail) el._trail.length = 0;
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
            el._nonConservative = true;   // 보존력 아님 → 에너지 보정 대상 제외
          }
        }
      }
    }

    // 용수철 힘
    applySpringForces();

    // 외력 (실 팽팽 시 실 방향으로 부착 물체에 힘 N)
    applyExtForces();
  }

  /* ── 외력(ExtForce) 힘 적용 ──
   * 손으로 실을 잡고 물체를 따라 이동하며 끄는 방식.
   * 시작 시점에 동결한 실 방향(물체→앵커)으로 부착 물체에 크기 N의 힘을
   * 실행 내내 지속 적용한다. 물체 위치가 바뀌어도 힘은 끊기지 않고 항상
   * 같은 방향으로 작용한다 (팽팽/이완과 무관). 방향 동결은 calibrateRopeLengths,
   * 앵커의 물체 추종은 updateExtForceAnchors 참조.
   */
  function applyExtForces() {
    for (const ef of STATE.elements) {
      if (ef.type !== 'extforce') continue;
      if (!(ef.forceN > 0)) continue;
      if (!ef._targets || ef._targets.length === 0) continue;   // 미연결/방향 미확정

      // 고정 방향(시작 시점 실 방향)으로 지속적 힘 N — 위치가 바뀌어도 같은 방향.
      // 도르래 경유 시 여러 물체가 대상일 수 있음.
      for (const t of ef._targets) {
        const body = STATE.elements.find(e => e.id === t.bodyId);
        if (!body || !['rect', 'circle'].includes(body.type)) continue;
        body.ax += (ef.forceN * t.fdx) / body.mass;
        body.ay += (ef.forceN * t.fdy) / body.mass;
        body._nonConservative = true;
      }
    }
  }

  /* ── 외력 앵커 추종 ──
   * 부착 물체의 이동만큼 앵커를 같은 오프셋으로 함께 이동시켜, 실 방향과 길이를
   * 시작 시점 그대로 유지한다(손이 물체를 따라 이동하며 끄는 모습). 이로써 실
   * 자체 제약과 충돌하지 않고 힘 방향도 일정하게 유지된다. integrate 직후 호출.
   */
  function updateExtForceAnchors() {
    const GS = CONFIG.GRID_SIZE;
    for (const ef of STATE.elements) {
      if (ef.type !== 'extforce') continue;

      if (ef._offX != null && ef._followAnchor) {
        // 직접 부착: 손(앵커)이 물체를 따라 이동 (고정 오프셋 유지)
        const bodyPos = getAttachPhysPos(ef._followAnchor);
        if (!bodyPos) continue;
        const cx = bodyPos.x + ef._offX;
        const cy = bodyPos.y + ef._offY;
        ef.gridX = cx - ef.gridW / 2;
        ef.gridY = GS - cy - ef.gridH / 2;
        continue;
      }

      // 도르래 경유: 실 총길이 보존 — 대상 물체가 도르래 쪽으로 다가간(멀어진)
      // 만큼 손도 반대로 멀어지며(다가가며) 실을 계속 풀어주는(당기는) 모습으로 이동.
      if (!ef._selfDir0 || !ef._targets || ef._targets.length === 0) continue;
      const t = ef._targets[0];
      if (!t.pAnchor || !t.bAnchor || t.dist0 == null) continue;
      const rimPosNow  = getAttachPhysPos(t.pAnchor);
      const bodyPosNow = getAttachPhysPos(t.bAnchor);
      const selfRimPosNow = getAttachPhysPos(ef._selfRimAnchor);
      if (!rimPosNow || !bodyPosNow || !selfRimPosNow) continue;

      const distNow = Math.hypot(bodyPosNow.x - rimPosNow.x, bodyPosNow.y - rimPosNow.y);
      const delta = distNow - t.dist0;   // 양수: 물체가 도르래에서 멀어짐, 음수: 가까워짐
      const newSelfDist = Math.max(0, ef._selfDist0 - delta);   // 실 총길이 보존

      const cx = selfRimPosNow.x + ef._selfDir0.x * newSelfDist;
      const cy = selfRimPosNow.y + ef._selfDir0.y * newSelfDist;
      ef.gridX = cx - ef.gridW / 2;
      ef.gridY = GS - cy - ef.gridH / 2;
    }
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

    // ── 스윕 방향: 호의 "볼록한 쪽(apex)"으로 직접 판정 ──
    //   apex = mid + wantSign·n·(R − h)  — h의 부호나 0 여부와 무관하게 항상 정의됨.
    //     (h>0: 중심이 반대쪽 → apex는 +wantSign·n 쪽 / h<0: major arc라 더 멀리)
    //   ⚠ 예전에는 끝점 각도차의 부호(shortSign)로 방향을 정했는데, curvature=1.0
    //     (반원)에서는 h=R·cos(π/2)≈1e-15 가 배정밀도에서 흡수돼 중심이 현의 중점과
    //     정확히 일치하고, 그러면 각도차가 ±π가 되어 부호가 임의로 정해졌다.
    //     그 결과 ARC_DOWN(골짜기)이 물리에서만 언덕으로 뒤집혀, 골짜기 위에 놓인
    //     물체가 지형 내부로 판정돼 그대로 낙하했다 (렌더는 골짜기로 그려짐).
    const wantSign = (seg.pathType === 'ARC_UP') ? 1 : -1;
    const apexX = mx + wantSign * nx * (R - h);
    const apexY = my + wantSign * ny * (R - h);
    let dApex = Math.atan2(apexY - cY, apexX - cX) - sa;
    while (dApex >  Math.PI) dApex -= 2*Math.PI;
    while (dApex < -Math.PI) dApex += 2*Math.PI;
    const sweep = (Math.sign(dApex) || 1) * theta;

    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = sa + sweep * t;
      pts.push({ x: cX + R*Math.cos(a), y: cY + R*Math.sin(a) });
    }
    return pts;
  }

  /* ── 6-5. FloorSegment 충돌 처리 ── */
  function resolveFloorCollisions(dt) {
    const allSegs = [];
    for (const fseg of STATE.floorSegments) {
      allSegs.push(...getPhysicsSegments(fseg));
    }
    if (allSegs.length === 0) return;

    for (const el of STATE.elements) {
      if (el.type === 'circle') _resolveCircleFloor(el, allSegs, dt);
      if (el.type === 'rect')   _resolveRectFloor(el, allSegs, dt);
    }
  }

  /* 시뮬 시작 시 겹침 해소 패스에서만 true — 아래 _depenetrateInitial 참조 */
  let _ALLOW_BACKFACE = false;

  /**
   * 단면(single-sided) 바닥의 "뒷면 통과" 판정 — true면 이 세그먼트는 무시.
   *
   * 바닥면은 법선 쪽(앞면)에서만 실체다. 판정 기준은 **이번 서브스텝이 시작될 때**
   * 물체 중심이 앞면에 있었는가: integrate()가 방금 v·dt 만큼 옮겼으므로
   * 이전 위치 = 현재 − v·dt 로 정확히 복원된다.
   *   · 이전에 앞면  → 처리 (접촉 침투는 물론, 한 스텝에 뚫고 지나간 고속 관통도 배출)
   *   · 이전에 뒷면  → 무시 (뒤에서 온 물체는 그대로 통과)
   *
   * ⚠ 이 가드가 없으면 바닥 "아래"를 지나가는 물체가 표면 반지름 안에 들어오는
   *   순간 침투로 오판돼 바닥 위로 솟구친다 (도달하지도 못한 천장을 뚫고 올라감).
   * ⚠ 속도 부호(법선 방향으로 나가는 중인가)로 판정하면 최고점(v≈0)에서 부호가
   *   무너져 그대로 솟구친다 — 그래서 위치 기준으로 판정한다.
   */
  function _backFaceSkip(el, seg, dt) {
    if (_ALLOW_BACKFACE) return false;
    const d = dt || 0;
    const sgn = (x, y) => (x - seg.x1) * seg.normalX + (y - seg.y1) * seg.normalY;

    if (el.type === 'circle') {
      // 원: 접촉 판정 기준점이 중심이므로 중심의 앞/뒤로 판정.
      //   (중심이 계속 뒷면에 머무는 동안은 표면 반지름 안에 들어와도 통과)
      const now  = sgn(el.physX, el.physY);
      const prev = sgn(el.physX - (el.vx || 0) * d, el.physY - (el.vy || 0) * d);
      return now < 0 && prev < 0;
    }

    // 사각형: 접촉 판정 기준점이 네 모서리 → 모서리 중 하나라도 앞면이면 접촉 대상.
    //   (경사면에 얹힌 사각형은 중심이 면 아래라도 위쪽 모서리가 앞면이다)
    const maxSigned = (ox, oy) => {
      const x0 = el.physX + ox, y0 = el.physY + oy;
      return Math.max(
        sgn(x0,             y0),
        sgn(x0 + el.gridW,  y0),
        sgn(x0,             y0 + el.gridH),
        sgn(x0 + el.gridW,  y0 + el.gridH));
    };
    if (maxSigned(0, 0) >= 0) return false;
    return maxSigned(-(el.vx || 0) * d, -(el.vy || 0) * d) < 0;
  }

  /**
   * 시뮬 시작 시 1회: 바닥면과 이미 겹쳐 배치된 물체를 표면 밖으로 밀어낸다.
   * (격자 스냅 때문에 경사·곡면 위 물체는 조금 파묻힌 채 배치되기 쉽다)
   * 단면 가드를 끄고 속도를 0으로 둔 채 위치만 보정하므로 반발/마찰은 발생하지 않는다.
   * 이 과정을 거쳐야 이후 매 스텝의 "뒷면 통과" 판정이 올바른 쪽에서 시작한다.
   */
  function _depenetrateInitial() {
    const saved = STATE.elements.map(e => ({ e, vx: e.vx, vy: e.vy }));
    for (const s of saved) { s.e.vx = 0; s.e.vy = 0; }
    _ALLOW_BACKFACE = true;
    for (let i = 0; i < 4; i++) resolveFloorCollisions(0);
    _ALLOW_BACKFACE = false;
    for (const s of saved) { s.e.vx = s.vx; s.e.vy = s.vy; }
  }

  /** CircleBody — 원-선분 최근접점 거리 충돌 */
  function _resolveCircleFloor(el, segs, dt) {
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
      if (_backFaceSkip(el, seg, dt)) continue;   // 뒷면 통과

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
      if (_backFaceSkip(el, seg, dt)) continue;   // 뒷면 통과
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
    el._nonConservative = true;   // 접촉 = 반발·마찰로 에너지 변화 가능

    // ── 2단계: 단 한 번만 위치/속도 보정 적용 ──
    const nx = bestNx, ny = bestNy;
    el.physX += nx * maxPen;
    el.physY += ny * maxPen;
    el.gridX  = el.physX - el.gridW/2;
    el.gridY  = CONFIG.GRID_SIZE - el.physY - el.gridH/2;

    const tx = -ny, ty = nx;

    const vn = el.vx*nx + el.vy*ny;
    if (vn >= 0) return;

    // 반발계수: 패널의 e는 "물체 ↔ 바닥" 쌍의 반발계수 그 자체.
    //   v' = e·v, 반등 높이 = e²·h  (교과서 정의)
    //   ⚠ 예전에는 바닥을 e=1인 물체로 보고 sqrt(e·1)을 썼는데, 그러면 e=0.25에서
    //     반등 높이가 0.0625h가 아니라 0.25h가 되어 물리 공식과 어긋났다.
    const e_c = el.e;
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
  function _resolveRectFloor(el, segs, dt) {
    const cxEl = el.physX + el.gridW / 2, cyEl = el.physY + el.gridH / 2;
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

    const maxAllowedPen = el.gridW + el.gridH;
    for (const seg of segs) {
      const sdx = seg.x2 - seg.x1, sdy = seg.y2 - seg.y1;
      const lenSq = sdx*sdx + sdy*sdy;
      if (lenSq < 1e-12) continue;
      if (_backFaceSkip(el, seg, dt)) continue;   // 뒷면 통과

      const snx = seg.normalX, sny = seg.normalY;

      for (const c of corners) {
        const t = ((c.x - seg.x1)*sdx + (c.y - seg.y1)*sdy) / lenSq;
        // t∈[0,1] 밖 = 이 미세 선분의 수직 띠(slab) 밖 → 접촉 아님.
        //   ⚠ 예전에는 "공유 조인트면 끝점으로 클램프"했으나, 그러면 아래의
        //     signed(법선 투영)가 그 선분의 접평면을 무한 반평면처럼 취급하게 된다.
        //     ARC_UP(위로 볼록)처럼 볼록한 바닥은 양 끝 미세 선분의 접평면이
        //     비스듬히 누워 있어, 호 위쪽 멀리 떨어진(=실제로는 공중인) 모서리도
        //     signed<0(≈0)으로 잡혀 "보이지 않는 아래로 볼록한 면"이 생겼다.
        //     볼록 이음매의 solid 내부는 어차피 인접 선분들의 slab이 모두 덮으므로
        //     (덮이지 않는 쐐기 영역은 표면 바깥 = 접촉 없음) 그냥 스킵하면 된다.
        //     이음매 정점이 사각형 안으로 파고든 경우는 아래 1-2단계가 처리한다.
        if (t < 0 || t > 1) continue;

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
      if (_backFaceSkip(el, seg, dt)) continue;   // 뒷면 통과
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
    el._nonConservative = true;   // 접촉 = 반발·마찰로 에너지 변화 가능

    // ── 2단계: 단 한 번만 위치/속도 보정 적용 ──
    el.physX += bestNx * maxPen;
    el.physY += bestNy * maxPen;
    el.gridX  = el.physX;
    el.gridY  = CONFIG.GRID_SIZE - el.physY - el.gridH;

    // 반발계수: 물체 ↔ 바닥 쌍의 반발계수 = el.e (원형과 동일 규약)
    const e_c = el.e;
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
          // ── 정지마찰 위치 고정 ──
          // 접선속도를 완전히 없앤다 = 미끄러지지 않는다는 뜻. 그런데 이 서브스텝의
          // integrate()는 이미 v_t·dt 만큼 물체를 접선 방향으로 옮겨 놓았으므로,
          // 그 변위를 되돌려야 진짜로 "정지"한다.
          //   ⚠ 이 보정이 없으면 경사면·벽에 정지해 있어야 할 물체가 매 서브스텝
          //     v_t·dt 씩 기어간다 (g_t·dt ≈ 4cm/s, 눈에 보이는 크리프).
          //     속도는 0으로 보이는데 위치만 계속 흐르는 형태라 더 이상하다.
          if (dt > 0) {
            el.physX -= vt_x * dt;
            el.physY -= vt_y * dt;
            el.gridX  = el.physX;
            el.gridY  = CONFIG.GRID_SIZE - el.physY - el.gridH;
          }
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
      // 끝점뿐 아니라 경로 위 0.5칸 앵커('s<d>')도 지원 —
      // 렌더와 같은 헬퍼를 써서 보이는 지점과 물리 지점이 어긋나지 않게 한다.
      const GS = CONFIG.GRID_SIZE, cs = CONFIG.cellSize;
      const w = getFloorSegAttachWorld(seg, anchor.attachPoint);
      return { x: w.x / cs, y: GS - w.y / cs };
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
    if (el.type === 'extforce') {
      // 고정 앵커 — 물리 적분 없음. 격자 좌표에서 중심 물리 좌표 산출.
      const GS = CONFIG.GRID_SIZE;
      return { x: el.gridX + el.gridW / 2, y: GS - el.gridY - el.gridH / 2 };
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
    if (el.type === 'extforce') return Infinity;  // 고정 외력 앵커 (불변)
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
    if (el.type === 'extforce') return 0;  // 고정 외력 앵커 (실 제약에서 불변)
    const m = el.mass || 1;
    return m > 0 ? 1 / m : 0;
  }

  /* ================================================================
     [MOVABLE-PULLEY NETWORK SOLVER — 국소 KKT 선형해]
     무질량 움직도르래 네트워크는 도르래별 Atwood 합제약(d0+d1=일정)으로는
     풀 수 없다: 여러 도르래를 지나는 하나의 실을 도르래마다 쪼개 합산하면
     공유 세그먼트가 이중 계상되고, 무질량 노드의 접선 자유모드가 남아
     자유낙하한다. 올바른 모델:
       · "실 런(run)": 도르래 림을 통해 연결된 실 세그먼트 체인 = 총길이
         일정 단일 제약(Σd_seg = L). 마찰無 도르래 → 장력 균일.
       · 무질량 도르래: 위치는 힘평형(순 제약 임펄스=0)이 결정 → KKT 계에서
         질량 0 행으로 처리(Bᵀλ=0). 유한 물체는 1/m 임펄스.
     각 연결 성분에 대해 (nc + 2·np)×(nc + 2·np) 선형계를 위치/속도 각각
     1회 풀어 정확한 역학(예: 움직도르래 2:1 속도비)을 재현한다.
  ================================================================ */

  /** 작은 밀집 선형계 M x = b 를 부분 피벗 가우스 소거로 해. 특이면 null. */
  function _solveLinear(M, b) {
    const n = b.length;
    const A = M.map((row, i) => row.slice().concat(b[i]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-12) return null;
      if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
      const d = A[col][col];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col] / d;
        if (f === 0) continue;
        for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
      }
    }
    const x = new Array(n);
    for (let i = 0; i < n; i++) x[i] = A[i][n] / A[i][i];
    return x;
  }

  /** 노드의 자유도 종류: 'body'(유한) / 'pulley'(움직 무질량) / null(고정) */
  function _dofKind(elementId, fixedPulleys) {
    if (STATE.floorSegments.find(s => s.id === elementId)) return null;
    const el = STATE.elements.find(e => e.id === elementId);
    if (!el) return null;
    if (el.type === 'pulley') return fixedPulleys.has(el.id) ? null : 'pulley';
    if (el.type === 'rect' || el.type === 'circle') return 'body';
    return null;
  }

  /** union-find로 실 런(도르래 림을 통해 연결된 세그먼트 체인) 구성 */
  function _buildRuns(pulleyGroups, fixedPulleys) {
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { parent.set(find(a), find(b)); };
    for (const [, group] of pulleyGroups) for (const g of group) if (!parent.has(g.rope.id)) parent.set(g.rope.id, g.rope.id);
    for (const [, group] of pulleyGroups) for (let i = 1; i < group.length; i++) union(group[0].rope.id, group[i].rope.id);

    const runMap = new Map();
    for (const [pid, group] of pulleyGroups) {
      for (const g of group) {
        const r = find(g.rope.id);
        if (!runMap.has(r)) runMap.set(r, { ropes: new Map(), pulleys: new Set() });
        const run = runMap.get(r);
        run.ropes.set(g.rope.id, g.rope);
        run.pulleys.add(pid);
      }
    }
    const runs = [];
    for (const [, run] of runMap) {
      const ropes = [...run.ropes.values()];
      const totalLen = ropes.reduce((s, rp) => s + (rp.calibratedLength ?? rp.ropeLength), 0);
      const hasMovable = [...run.pulleys].some(p => !fixedPulleys.has(p));
      runs.push({ ropes, pulleys: [...run.pulleys], totalLen, hasMovable });
    }
    return runs;
  }

  /** 제약 c의 야코비안 J(node→[gx,gy])와 위반량 C, 팽팽 여부 계산 */
  function _computeConstraintJC(c, fixedPulleys) {
    const J = new Map();
    let sumd = 0;
    for (const rope of c.ropes) {
      const A = getAttachPhysPos(rope.anchorA), B = getAttachPhysPos(rope.anchorB);
      if (!A || !B) return null;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d < 1e-9) return null;
      sumd += d;
      const nx = dx / d, ny = dy / d;
      const add = (anchor, sx, sy) => {
        if (!_dofKind(anchor.elementId, fixedPulleys)) return;
        const cur = J.get(anchor.elementId) || [0, 0];
        cur[0] += sx; cur[1] += sy; J.set(anchor.elementId, cur);
      };
      add(rope.anchorA, -nx, -ny);
      add(rope.anchorB, +nx, +ny);
    }
    return { J, C: sumd - c.L, taut: sumd >= c.L - 1e-6 };
  }

  // 움직도르래를 "매우 가벼운 유한 노드"로 취급해 제약행렬 A에 접는다.
  // 순수 무질량 힘평형(Bᵀλ=0) 행은 완전 수직 배치에서 도르래 횡DOF가
  // 미약하게만 제약돼(연 스티프) 위치 투영이 발산한다. 유한 물체가 A의
  // 기저(+1/m 대각)를 제공하므로 도르래를 큰-유한 역질량으로 넣으면 계가
  // 어떤 기하에서도 잘 조건화되고(det>0), 질량이 아주 작아(1/W) 사실상
  // 무질량 역학(2:1 등)을 ~0.1% 오차로 재현한다.
  const PULLEY_KKT_INVMASS = 1e3;

  /** 움직도르래 성분의 위치('pos')/속도('vel') 제약 선형해를 1회 풀어 적용 */
  function _solveDynamicComponent(comp, level, fixedPulleys) {
    const active = [];
    for (const c of comp.constraints) {
      const jc = _computeConstraintJC(c, fixedPulleys);
      if (jc && jc.taut) active.push({ J: jc.J, C: jc.C });
    }
    const nc = active.length;
    if (nc === 0) return;

    // 노드 = 유한 물체(1/m) + 움직도르래(큰 유한 역질량). 동시 선형해로 풀어
    // (Gauss-Seidel과 달리) 무질량 노드가 보정을 독식하지 않는다.
    const nodes = [];
    for (const bid of comp.bodies) { const el = STATE.elements.find(e => e.id === bid); nodes.push({ el, w: 1 / (el.mass || 1) }); }
    for (const pid of comp.pulleys) { const el = STATE.elements.find(e => e.id === pid); nodes.push({ el, w: PULLEY_KKT_INVMASS }); }

    const A = Array.from({ length: nc }, () => new Array(nc).fill(0));
    const rhs = new Array(nc).fill(0);
    for (let k = 0; k < nc; k++) {
      for (let m = 0; m < nc; m++) {
        let a = 0;
        for (const nd of nodes) {
          const Jk = active[k].J.get(nd.el.id), Jm = active[m].J.get(nd.el.id);
          if (Jk && Jm) a += nd.w * (Jk[0] * Jm[0] + Jk[1] * Jm[1]);
        }
        A[k][m] = a;
      }
      if (level === 'pos') {
        rhs[k] = -active[k].C;
      } else {
        let jv = 0;   // -J·v_free (모든 노드의 현재 속도)
        for (const nd of nodes) {
          const Jk = active[k].J.get(nd.el.id);
          if (Jk) jv += Jk[0] * (nd.el.vx || 0) + Jk[1] * (nd.el.vy || 0);
        }
        rhs[k] = -jv;
      }
    }

    const sol = _solveLinear(A, rhs);
    if (!sol) return;

    for (const nd of nodes) {
      let dx = 0, dy = 0;
      for (let k = 0; k < nc; k++) { const Jk = active[k].J.get(nd.el.id); if (Jk) { dx += sol[k] * Jk[0]; dy += sol[k] * Jk[1]; } }
      if (level === 'pos') { _applyPhysDelta(nd.el.id, nd.w * dx, nd.w * dy); }
      else { nd.el.vx += nd.w * dx; nd.el.vy += nd.w * dy; }
    }
  }

  /** 움직도르래 네트워크 성분(동적 런 + 움직도르래 하중 실) 구성 */
  function _buildDynamicComponent(runs, pulleyRopeIds, fixedPulleys) {
    const constraints = [];
    const bodies = new Set(), pulleys = new Set();
    const dynamicRopeIds = new Set();

    for (const run of runs) {
      // 총길이 제약(Σd = L)으로 풀어야 하는 런:
      //   · 움직도르래를 포함하거나
      //   · 도르래를 2개 이상 거치는 경우(직렬 도르래)
      // ⚠ 도르래별 쌍 Atwood(d_i + d_j = 일정)는 도르래가 하나일 때만 옳다.
      //   실이 도르래 2개를 거치면 가운데 구간이 각 도르래에서 이중 계상되고,
      //   그 구간이 고정도르래 사이라 길이가 상수이므로 양쪽 물체가 각각
      //   "거리 일정"으로 묶여 계 전체가 얼어붙는다(가속도 0). 실제로는
      //   |d1|+|d2|+|d3| = L 하나뿐이라 평범한 Atwood처럼 움직여야 한다.
      if (!run.hasMovable && run.pulleys.length < 2) continue;
      constraints.push({ ropes: run.ropes, L: run.totalLen });
      for (const rope of run.ropes) {
        dynamicRopeIds.add(rope.id);
        for (const a of [rope.anchorA, rope.anchorB]) {
          const k = _dofKind(a.elementId, fixedPulleys);
          if (k === 'body') bodies.add(a.elementId);
          else if (k === 'pulley') pulleys.add(a.elementId);
        }
      }
    }
    // 움직도르래 center 하중 실 (단순 실이지만 성분에 포함해야 무질량 힘평형이 성립)
    for (const rope of STATE.ropes) {
      if (pulleyRopeIds.has(rope.id)) continue;
      for (const [a, o] of [[rope.anchorA, rope.anchorB], [rope.anchorB, rope.anchorA]]) {
        const el = STATE.elements.find(e => e.id === a.elementId);
        if (el && el.type === 'pulley' && !fixedPulleys.has(el.id) && a.attachPoint === 'center') {
          constraints.push({ ropes: [rope], L: (rope.calibratedLength ?? rope.ropeLength) });
          dynamicRopeIds.add(rope.id);
          pulleys.add(el.id);
          const k2 = _dofKind(o.elementId, fixedPulleys);
          if (k2 === 'body') bodies.add(o.elementId);
          else if (k2 === 'pulley') pulleys.add(o.elementId);
        }
      }
    }
    if (constraints.length === 0) return { component: null, dynamicRopeIds };
    return { component: { constraints, bodies: [...bodies], pulleys: [...pulleys] }, dynamicRopeIds };
  }

  /* ================================================================
     [ROPE ENERGY PROJECTION] — 실 제약의 수치 에너지 드리프트 보정

     팽팽한 이상적인 실의 장력은 실 방향에 수직인 운동에 대해 일을 하지 않으며,
     계 전체로 보면 **무일(no net work)** 이다 (Atwood 처럼 한쪽에 +, 다른쪽에
     −로 일해도 총합은 0). 따라서 resolveRopeConstraints 앞뒤로 계의 역학적
     에너지는 같아야 한다. 차이가 난다면 그건 물리가 아니라 이산화 오차다.

     제약면은 J·v = 0 이라는 선형 조건이므로 v 를 **균일 배율**로 늘리거나 줄여도
     제약은 그대로 만족된다. 그래서 그 유일한 자유도로 잃어버린 에너지를 되돌린다.

     ⚠ 느슨하던 실이 이 스텝에 팽팽해지는 순간(스냅)은 다르다. 그때 실이 흡수하는
       에너지는 비탄성 충격으로 **실제로** 사라져야 하므로 보정하지 않는다.
       (rope._wasViolated 로 "이미 팽팽했는지"를 보고 구분한다)
  ================================================================ */

  /* ── 서브스텝 단위 에너지 보정 (2단계) ──
     1단계(resolveRopeConstraints 내부)는 "실 제약 해소"가 무일임을 이용해
     그 단계에서 샌 에너지를 되돌린다 — 접촉·마찰이 있어도 항상 안전하다.
     2단계(여기)는 한 걸음 더 나아가, **중력과 실 장력만 받는** 물체에 대해
     서브스텝 전체(힘·적분·제약)의 에너지 보존을 강제한다. 이상적인 진자·
     Atwood 는 역학적 에너지가 정확히 보존되어야 하므로, 남은 차이는 전부
     반음적 오일러가 곡선 경로를 접선으로 근사해 생긴 이산화 오차다.

     _nonConservative 플래그가 하나라도 켜졌으면(접촉·마찰·용수철·외력·힘구간)
     에너지가 실제로 변할 수 있으므로 보정하지 않는다. */

  function _clearStepFlags() {
    for (const el of STATE.elements) {
      if (el.type === 'rect' || el.type === 'circle') el._nonConservative = false;
    }
  }

  /** 서브스텝 시작 시점의 성분별 기준 에너지 */
  function _stepEnergyBefore() {
    return STATE.ropes.length ? _componentRefs() : null;
  }

  /** 서브스텝 전체(힘·적분·제약)의 이산화 오차를 성분 단위로 되돌린다 */
  function _projectStepEnergy(refs) {
    if (refs) _projectComponents(refs);
  }

  /**
   * 실 네트워크의 **연결 성분**을 구한다.
   *   [{ bodies: [유한 물체...], allTaut: 모든 실이 팽팽한가 }]
   *
   * ⚠ "장력은 일을 하지 않는다"는 **연결된 계 전체**에서만 성립한다.
   *   Atwood 처럼 한쪽에 +일, 다른쪽에 −일을 하는 계에서 물체 하나만 떼어
   *   에너지를 보존시키면 계에 에너지를 펌프질하게 된다(가속도가 2배로 튐).
   *   그래서 반드시 성분 단위로 묶어서 본다.
   */
  function _ropeComponents() {
    if (STATE.ropes.length === 0) return [];
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const add  = (x) => { if (!parent.has(x)) parent.set(x, x); };
    for (const rope of STATE.ropes) {
      add(rope.anchorA.elementId); add(rope.anchorB.elementId);
      parent.set(find(rope.anchorA.elementId), find(rope.anchorB.elementId));
    }
    const comps = new Map();
    const get = (root) => {
      if (!comps.has(root)) comps.set(root, { bodies: [], seen: new Set(), allTaut: true });
      return comps.get(root);
    };
    for (const rope of STATE.ropes) {
      const c = get(find(rope.anchorA.elementId));
      if (!rope._wasActive) c.allTaut = false;
      for (const a of [rope.anchorA, rope.anchorB]) {
        if (c.seen.has(a.elementId)) continue;
        c.seen.add(a.elementId);
        const el = STATE.elements.find(e => e.id === a.elementId);
        if (el && (el.type === 'rect' || el.type === 'circle')) c.bodies.push(el);
      }
    }
    return [...comps.values()].filter(c => c.bodies.length > 0);
  }

  /** 역학적 에너지 (운동 + 중력 퍼텐셜) */
  function _ropeSystemEnergy(bodies) {
    let e = 0;
    for (const b of bodies) {
      const m = b.mass || 1;
      e += 0.5 * m * (b.vx * b.vx + b.vy * b.vy);
      if (STATE.gravityOn) e += m * CONFIG.G * b.physY;
    }
    return e;
  }

  /**
   * 각 실의 팽팽/느슨 상태를 갱신하고, 이번 서브스텝에 느슨→팽팽으로 바뀐
   * 실이 있는지(스냅) 반환. 스냅은 비탄성 흡수라 에너지가 실제로 줄어야 한다.
   */
  function _ropeUpdateTautness() {
    let snap = false;
    for (const rope of STATE.ropes) {
      const A = getAttachPhysPos(rope.anchorA);
      const B = getAttachPhysPos(rope.anchorB);
      if (!A || !B) { rope._wasActive = rope._active = false; continue; }
      const maxLen = rope.calibratedLength ?? rope.ropeLength;
      const active = Math.hypot(B.x - A.x, B.y - A.y) >= maxLen - 1e-4;
      rope._wasActive = rope._active;      // 들어올 때 상태
      rope._active    = active;
      if (active && !rope._wasActive) snap = true;
      rope._wasActive = active;            // 다음 서브스텝 기준
    }
    return snap;
  }

  /** 성분별 에너지 투영 — dEmap: Map(comp → 기준 에너지) */
  function _projectComponents(refs) {
    if (_ropeSnapFlag) return;
    for (const { comp, e0 } of refs) {
      if (!comp.allTaut) continue;
      if (comp.bodies.some(b => b._nonConservative)) continue;
      let ke = 0;
      for (const b of comp.bodies) ke += 0.5 * (b.mass || 1) * (b.vx * b.vx + b.vy * b.vy);
      if (ke <= 1e-12) continue;
      const dE = e0 - _ropeSystemEnergy(comp.bodies);   // 양수 = 잃음
      const s  = Math.sqrt(Math.max(0, 1 + dE / ke));
      if (isFinite(s) && Math.abs(s - 1) < 0.02) {
        for (const b of comp.bodies) { b.vx *= s; b.vy *= s; }
      }
    }
  }

  /** 성분별 기준 에너지 스냅샷 */
  function _componentRefs() {
    return _ropeComponents().map(comp => ({ comp, e0: _ropeSystemEnergy(comp.bodies) }));
  }

  let _ropeSnapFlag = false;   // 이번 서브스텝에 느슨→팽팽 전이가 있었는가

  function resolveRopeConstraints(subDt) {
    // 1단계: "실 제약 해소는 무일" — 이 단계에서 샌 에너지만 되돌린다.
    //        접촉·마찰이 함께 있어도 안전하다 (다른 단계는 건드리지 않으므로).
    _ropeSnapFlag = _ropeUpdateTautness();
    const refs = _componentRefs();
    const r = _resolveRopeConstraintsCore(subDt);
    _projectComponents(refs);
    return r;
  }

  function _resolveRopeConstraintsCore(subDt) {
    /* ── 1. 도르래별 연결 실 그룹화 (림↔림 실은 양쪽 그룹에 등록) ── */
    const pulleyGroups = new Map();
    for (const el of STATE.elements) {
      if (el.type === 'pulley') pulleyGroups.set(el.id, []);
    }

    const pulleyRopeIds = new Set();

    for (const rope of STATE.ropes) {
      if (_ropeHasExtForce(rope)) continue;   // 외력 실은 제약 제외 (#2)
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

    const fixedPulleys = _computeFixedPulleys();

    // 실 런 구성 → 움직도르래 포함 성분은 KKT 선형해로, 나머지는 기존 경로로.
    const runs = _buildRuns(pulleyGroups, fixedPulleys);
    const { component, dynamicRopeIds } = _buildDynamicComponent(runs, pulleyRopeIds, fixedPulleys);

    const simpleRopes = STATE.ropes.filter(r => !pulleyRopeIds.has(r.id) && !dynamicRopeIds.has(r.id) && !_ropeHasExtForce(r));

    // 무질량 노드 속도 유도용: 서브스텝 제약 해소 전 도르래 위치 기록
    const prePos = new Map();
    for (const el of STATE.elements) {
      if (el.type === 'pulley') prePos.set(el.id, { x: el.physX, y: el.physY });
    }

    /* ── 2. 반복 위치 제약 해소 ── */
    const iters = component ? 24 : 8;
    for (let iter = 0; iter < iters; iter++) {
      for (const rope of simpleRopes) {
        _simpleRopeConstraint(rope, fixedPulleys);
      }
      for (const [pulleyId, group] of pulleyGroups) {
        // 움직도르래 및 동적 런에 속한 고정도르래는 KKT 성분이 처리 → 스킵
        if (!fixedPulleys.has(pulleyId)) continue;
        if (group.some(g => dynamicRopeIds.has(g.rope.id))) continue;
        if (group.length >= 2) {
          // 고정 도르래: Atwood 합제약 (d0+d1=일정) — 검증된 단일 도르래 경로.
          for (let k = 1; k < group.length; k++) {
            _atwoodConstraint(pulleyId, group[k - 1], group[k], fixedPulleys);
          }
        } else if (group.length === 1) {
          // 한쪽만 연결 → 도르래를 고정점으로 하는 단순 실 (QC #12)
          _simpleRopeConstraint(group[0].rope, fixedPulleys);
        }
      }
      // 움직도르래 네트워크: 위치 제약 선형해 (총길이 런 + 하중 실)
      if (component) _solveDynamicComponent(component, 'pos', fixedPulleys);
    }

    /* ── 3. 움직도르래 네트워크 속도 KKT (정확한 역학: 2:1 속도비 등) ── */
    if (component) _solveDynamicComponent(component, 'vel', fixedPulleys);

    /* ── 4. 성분 밖 무질량 도르래 속도 = Δx / subDt (위치 갱신과 일관) ── */
    if (subDt && subDt > 0) {
      const compPulleySet = new Set(component ? component.pulleys : []);
      for (const el of STATE.elements) {
        if (el.type !== 'pulley' || compPulleySet.has(el.id)) continue;
        const p0 = prePos.get(el.id);
        if (!p0) continue;
        el.vx = (el.physX - p0.x) / subDt;
        el.vy = (el.physY - p0.y) / subDt;
      }
    }
  }

  // 실 길이 하한 — 실은 음의 길이를 가질 수 없으므로 앵커가 서로를 통과해
  // 반대편으로 역전(뒤집힘)하지 못하도록 거리 0 근방에서 걸어 멈춘다.
  const _ROPE_MIN_LEN = 1e-3;

  /** excess(위반량)를 방향(nx,ny)을 따라 위치+속도로 보정.
   *  excess>0: 상한 초과(당겨서 줄임, 분리 속도 제거) / excess<0: 하한 미달(밀어서 늘림, 접근 속도 제거) */
  function _resolveRopeExcess(rope, fixedPulleys, nx, ny, excess) {
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

    if ((excess > 0 && vRel > 1e-9) || (excess < 0 && vRel < -1e-9)) {
      const effInvSum = iv1 + iv2;
      if (effInvSum >= 1e-12) {
        const J = vRel / effInvSum;   // 충격량 크기 (scalar)
        if (aFinite) { elAObj.vx += nx * J * iv1; elAObj.vy += ny * J * iv1; }
        if (bFinite) { elBObj.vx -= nx * J * iv2; elBObj.vy -= ny * J * iv2; }
      }
    }
  }

  /* ── 단순 실 제약 ──
   * 상한(늘어남): 거리 > ropeLength 일 때만 장력 작용, 현재 방향 기준(스윙 등 정상
   *   방향 변화 반영). 하한(0): 실이 반대편 앵커를 통과해 뒤집히지 못하도록,
   *   서브스텝 사이 안정 구간에서만 갱신되는 기준 방향(rope._refDirX/Y)에 대한
   *   "부호 있는 투영 거리"로 판정한다. 한 서브스텝에 반대편으로 순간 이동
   *   (터널링)해도 투영값이 크게 음수가 되어 반드시 걸린다 — 항상 양수인
   *   Math.hypot 거리만으로는 통과 여부를 알 수 없기 때문.
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

    if (dist > maxLen + 1e-6) {
      if (dist < 1e-9) return;
      const nx = dx / dist, ny = dy / dist;
      _resolveRopeExcess(rope, fixedPulleys, nx, ny, dist - maxLen);
      return;
    }

    if (rope._refDirX == null) return;   // 기준 방향 미보정 — 하한 판정 불가

    const signedDist = dx * rope._refDirX + dy * rope._refDirY;
    if (signedDist < _ROPE_MIN_LEN - 1e-6) {
      _resolveRopeExcess(rope, fixedPulleys, rope._refDirX, rope._refDirY, signedDist - _ROPE_MIN_LEN);
      return;
    }

    // 안정 구간(하한에서 충분히 떨어짐): 다음 판정을 위해 기준 방향 갱신
    if (dist > _ROPE_MIN_LEN * 4) {
      rope._refDirX = dx / dist; rope._refDirY = dy / dist;
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

  /* 한쪽만 연결된 용수철의 자유단(고정 핀) 물리 좌표 (#3).
   * 용수철은 시뮬 중 이동하지 않으므로 gridX/Y로부터 직접 산출.
   * slot: 'left'=가로 왼쪽/세로 위, 'right'=가로 오른쪽/세로 아래. */
  function _springFreeEnd(spring, slot) {
    const GS = CONFIG.GRID_SIZE;
    const cx     = spring.gridX + spring.gridW / 2;
    const cyPhys = GS - spring.gridY - spring.gridH / 2;
    if (!spring.isVertical) {
      return slot === 'left'
        ? { x: spring.gridX,                y: cyPhys }
        : { x: spring.gridX + spring.gridW, y: cyPhys };
    }
    return slot === 'left'
      ? { x: cx, y: GS - spring.gridY }
      : { x: cx, y: GS - spring.gridY - spring.gridH };
  }

  /* ── 7-2. 용수철 힘 applySpringForces() — 완전 2D 벡터 물리 ──
   * F = -k(|d|-L0)·d̂, 양끝 부착점 사이 벡터 d 기준. 축 분기 없음(모드는
   * 부착 면 선택에만 사용). 부착점이 2D로 움직이면 복원력 방향도 함께 회전.
   * 한쪽만 연결된 경우(#3): 미연결단을 용수철 배치 위치의 고정 핀으로 보고
   * 연결된 물체가 거기에 매달려 진동하도록 한다.
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
      // 최소 한쪽은 연결돼 있어야 힘 존재 (#3: 한쪽만 연결이면 자유단=고정 핀)
      if (!spring.leftElementId && !spring.rightElementId) continue;

      const leftEl  = spring.leftElementId
        ? (STATE.elements.find(e => e.id === spring.leftElementId)
           || STATE.floorSegments.find(s => s.id === spring.leftElementId) || null)
        : null;
      const rightEl = spring.rightElementId
        ? (STATE.elements.find(e => e.id === spring.rightElementId)
           || STATE.floorSegments.find(s => s.id === spring.rightElementId) || null)
        : null;
      if (!leftEl && !rightEl) continue;   // id는 있으나 대상 소실

      // 시뮬 중 한쪽이 밀려나 분리된 용수철: 그 끝단은 아무것도 붙어있지 않은
      // 자유단 → 질량 0인 용수철은 힘을 전달할 수 없다. 자연길이로 복귀만 하고
      // 남은 물체는 분리 시점의 운동량을 그대로 유지한다.
      if (spring._leftDetached || spring._rightDetached) { spring.L = spring.L0; continue; }

      // 부착 면: 가로 → left의 오른쪽 면 / right의 왼쪽 면.
      //          세로 → 위(left)의 아래 면 / 아래(right)의 위 면.
      const leftSide  = spring.isVertical ? 'bottom' : 'right';
      const rightSide = spring.isVertical ? 'top'    : 'left';

      // 각 끝단 좌표: 물체=부착면 / 미연결=자유단(고정 핀) / 바닥면=null(아래서 보정)
      let A = !leftEl  ? _springFreeEnd(spring, 'left')
                       : _springAttachFace(leftEl,  leftSide);   // 바닥면이면 null
      let B = !rightEl ? _springFreeEnd(spring, 'right')
                       : _springAttachFace(rightEl, rightSide);
      if (A === null && B === null) {
        A = { x: (leftEl.x1 + leftEl.x2)/2,  y: GS - (leftEl.y1 + leftEl.y2)/2 };
        B = { x: (rightEl.x1 + rightEl.x2)/2, y: GS - (rightEl.y1 + rightEl.y2)/2 };
      } else if (A === null) { A = segClosest(leftEl,  B.x, B.y); }
      else if (B === null)   { B = segClosest(rightEl, A.x, A.y); }

      const dx = B.x - A.x, dy = B.y - A.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-9) continue;              // 축 미정의 → 이 프레임 건너뜀
      const ux = dx / dist, uy = dy / dist;   // A→B 단위 벡터

      // sForce > 0: 늘어남(양끝 서로 당김) / < 0: 압축(양끝 서로 밀어냄)
      const sForce = spring.k * (dist - spring.L0);

      // ── 미체결 + 인장(sForce>0): 미체결(접촉만 하던) 쪽이 이 순간 분리 ──
      //   분리 = 그 끝단이 "진짜 자유단"이 된다는 뜻. 이 시뮬의 용수철은 질량 0
      //   이므로 자유단에는 힘이 걸릴 수 없고(F=ma=0), 따라서 용수철은 그 즉시
      //   자연길이로 돌아가며 남은 물체에 아무 힘도 주지 못한다. 분리 순간의
      //   운동량 그대로 남은 물체가 진행해야 하므로, 이번 서브스텝의 힘 적용도
      //   건너뛴다. (미연결로 배치된 끝단 = 벽에 고정된 핀으로 보는 #3 규칙과
      //   구분하기 위해 별도 플래그를 쓴다.)
      if (leftEl  && !spring.leftLocked  && sForce > 0) { spring.leftElementId  = null; spring._leftDetached  = true; }
      if (rightEl && !spring.rightLocked && sForce > 0) { spring.rightElementId = null; spring._rightDetached = true; }
      if (spring._leftDetached || spring._rightDetached) { spring.L = spring.L0; continue; }

      // 체결(locked): 인장·압축 모두 전달. 미체결: 압축(밀어냄, sForce<0)만.
      const leftTransmit  = spring.leftLocked  || sForce < 0;
      const rightTransmit = spring.rightLocked || sForce < 0;
      // A(left)에는 +sForce·û(늘어나면 B쪽으로), B(right)에는 반대로.
      if (leftTransmit  && leftEl  && (leftEl.type  === 'rect' || leftEl.type  === 'circle')) {
        leftEl.ax  += sForce * ux / leftEl.mass;
        leftEl.ay  += sForce * uy / leftEl.mass;
        leftEl._nonConservative = true;   // 용수철 퍼텐셜은 E 계산에 없음 → 제외
      }
      if (rightTransmit && rightEl && (rightEl.type === 'rect' || rightEl.type === 'circle')) {
        rightEl.ax -= sForce * ux / rightEl.mass;
        rightEl.ay -= sForce * uy / rightEl.mass;
        rightEl._nonConservative = true;
      }

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
    a._nonConservative = b._nonConservative = true;

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
    a._nonConservative = b._nonConservative = true;

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
    rect._nonConservative = circ._nonConservative = true;

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

    // 바닥면 스냅으로 물체가 비정수 좌표에 놓일 수 있으므로 근접 허용(#6)
    const SNAP_TOL = 0.4;   // 격자 단위 근접 허용치

    if (!spring.isVertical) {
      // ── 가로 모드: 왼쪽/오른쪽 이웃 ──
      for (const el of STATE.elements) {
        if (el === spring) continue;
        if (!['rect', 'circle'].includes(el.type)) continue;
        if (Math.abs((el.gridX + el.gridW) - leftX) <= SNAP_TOL && el.gridY < botY && el.gridY + el.gridH > topY)
          leftId = el.id;
        if (Math.abs(el.gridX - rightX) <= SNAP_TOL && el.gridY < botY && el.gridY + el.gridH > topY)
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
        if (Math.abs((el.gridY + el.gridH) - topY) <= SNAP_TOL && el.gridX < rightX && el.gridX + el.gridW > leftX)
          leftId = el.id;
        if (Math.abs(el.gridY - botY) <= SNAP_TOL && el.gridX < rightX && el.gridX + el.gridW > leftX)
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
