/* ============================================================
   joints.js — 바닥면 이음의 클로소이드(완화 곡선) 다듬기
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   두 직선 바닥면이 끝점을 공유하면 그 자리는 접선이 꺾이는 모서리다.
   물체가 지나면 법선 속도 성분이 순간에 사라져야 하므로 충격력(임펄스)이
   생기고, 반발계수 1 이면 튀어 오른다. 실제 문항의 "매끄럽게 이어진 면" 은
   접선뿐 아니라 곡률까지 연속(G²)인 면 — 그 표준 곡선이 클로소이드다.

   여기서는 대칭 클로소이드 두 개(곡률 0 → 1/R → 0)로 모서리를 잇는다.
     · 성립 조건: 둘 다 LINE · 꺾임각 5°~150° · 접선 길이 T 가 짧은 바닥면의
       40 % 이하 · 최소 곡률 반지름 R 이 장면의 가장 큰 원 물체 반지름 이상.
       (R < r 이면 공이 곡선에 닿지 못하거나(오목) 중심 궤적에 꺾임이 남는다(볼록))
     · 오목(골짜기)·볼록(언덕) 모두 다듬는다. 부호만 다르다.
     · 이음은 양쪽 세그먼트의 끝점 플래그(smoothP1/smoothP2)가 모두 켜졌을 때 성립.
     · 곡선은 두 절반으로 나누어 각 세그먼트의 경로에 붙인다 — 두 절반은 곡률
       최대점 M 에서 같은 접선으로 만나므로 어느 쪽이 그려도 이어진다.
     · 실 앵커는 원래 직선 기하에 그대로 둔다(토글해도 앵커가 움직이지 않게).

   API
     floorJoints()              → [{ a, endA, b, endB, J, deg, concave, eligible, reason, on, T, R, pathA, pathB }]
     jointAt(seg, 'p1'|'p2')    → 그 끝점의 이음 | null
     floorPathPhys(seg)         → 물리 좌표(y 위) 점열 (다듬어진 경로)  — physics
     floorPathGrid(seg)         → 격자 좌표(y 아래) 점열                  — render · hit-test · capture
     setJointSmooth(seg, end, on) → 양쪽 플래그를 함께 바꾼다
   ============================================================ */

  const JOINT = {
    MIN_DEG: 5, MAX_DEG: 150,
    T_FRAC: 0.4,      // 접선 길이 상한 = 짧은 바닥면 길이 × 이 값
    T_MAX: 5,         // 접선 길이 상한 [칸]
    N_HALF: 16,       // 반쪽 클로소이드 점 개수
  };

  let _jointCache = { key: '', joints: [], paths: new Map() };

  function _floorKey() {
    let k = '';
    for (const s of STATE.floorSegments) k += `${s.id}:${s.x1},${s.y1},${s.x2},${s.y2},${s.pathType},${s.smoothP1 ? 1 : 0}${s.smoothP2 ? 1 : 0}|`;
    k += 'r' + _maxCircleRadius();
    return k;
  }
  function _maxCircleRadius() {
    let r = 0.5;
    for (const e of STATE.elements) if (e.type === 'circle') r = Math.max(r, e.gridW / 2);
    return r;
  }
  function _endPhys(seg, end) {
    const GS = CONFIG.GRID_SIZE;
    return end === 'p1' ? { x: seg.x1, y: GS - seg.y1 } : { x: seg.x2, y: GS - seg.y2 };
  }
  function _otherEndPhys(seg, end) { return _endPhys(seg, end === 'p1' ? 'p2' : 'p1'); }
  /** 실체면 법선 (물리 좌표, 그린 방향의 왼쪽) */
  function _normalPhys(seg) {
    const GS = CONFIG.GRID_SIZE;
    const dx = seg.x2 - seg.x1, dy = (GS - seg.y2) - (GS - seg.y1);
    const L = Math.hypot(dx, dy) || 1;
    return { x: -dy / L, y: dx / L };
  }

  /**
   * 단위 대칭 클로소이드 (반쪽 길이 1, 총 꺾임 dth>0, 왼쪽 회전).
   *   φ(s) = α s²  (0≤s≤1),  φ(s) = 2α − α(2−s)²  (1≤s≤2),  α = dth/2
   * 반환 { pts:[{x,y}] (2N+1 개), T: 시작점→모서리 접선 길이, Rmin: 최소 곡률 반지름 }
   */
  function _unitClothoid(dth) {
    const N = JOINT.N_HALF, alpha = dth / 2;
    const pts = [{ x: 0, y: 0 }];
    let x = 0, y = 0;
    const phi = s => (s <= 1) ? alpha * s * s : 2 * alpha - alpha * (2 - s) * (2 - s);
    const M = 8;   // 점 사이 세분 (적분 정확도)
    for (let i = 0; i < 2 * N; i++) {
      const s0 = i / N, s1 = (i + 1) / N;
      for (let j = 0; j < M; j++) {
        const sa = s0 + (s1 - s0) * j / M, sb = s0 + (s1 - s0) * (j + 1) / M;
        const pa = phi(sa), pb = phi(sb), pm = phi((sa + sb) / 2);
        const h = sb - sa;
        x += h * (Math.cos(pa) + 4 * Math.cos(pm) + Math.cos(pb)) / 6;
        y += h * (Math.sin(pa) + 4 * Math.sin(pm) + Math.sin(pb)) / 6;
      }
      pts.push({ x, y });
    }
    const E = pts[pts.length - 1];
    const T = Math.abs(dth) > 1e-9 ? E.y / Math.sin(dth) : Infinity;   // 대칭이라 시작·끝 접선 길이가 같다
    return { pts, T, Rmin: 1 / dth };
  }

  /** 모든 이음을 찾아 조건을 판정하고 곡선을 만든다 (캐시) */
  function floorJoints() {
    const key = _floorKey();
    if (_jointCache.key === key) return _jointCache.joints;
    const segs = STATE.floorSegments;
    const joints = [];
    const paths = new Map();
    const rMax = _maxCircleRadius();
    const used = new Set();   // "segId:end" — 한 끝점에 이음 하나만

    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i], B = segs[j];
        for (const endA of ['p1', 'p2']) for (const endB of ['p1', 'p2']) {
          const PA = _endPhys(A, endA), PB = _endPhys(B, endB);
          if (Math.hypot(PA.x - PB.x, PA.y - PB.y) > 1e-6) continue;
          if (used.has(A.id + ':' + endA) || used.has(B.id + ':' + endB)) continue;
          used.add(A.id + ':' + endA); used.add(B.id + ':' + endB);
          const jt = _makeJoint(A, endA, B, endB, PA, rMax);
          joints.push(jt);
        }
      }
    }
    // 세그먼트 경로 (다듬어진 끝 반영)
    for (const s of segs) {
      if (s.pathType !== 'LINE') continue;
      const j1 = joints.find(j => j.on && ((j.a === s && j.endA === 'p1') || (j.b === s && j.endB === 'p1')));
      const j2 = joints.find(j => j.on && ((j.a === s && j.endA === 'p2') || (j.b === s && j.endB === 'p2')));
      if (!j1 && !j2) continue;
      const P1 = _endPhys(s, 'p1'), P2 = _endPhys(s, 'p2');
      // 반쪽 곡선을 "이 세그먼트의 접점 → 곡률 최대점 M" 방향으로 맞춘다
      //   (pathA 는 A 의 접점 → M, pathB 는 M → B 의 접점 이므로 B 쪽은 뒤집는다)
      const halfToM = (j) => (j.a === s) ? j.pathA : j.pathB.slice().reverse();
      let pts = [];
      if (j1) pts = pts.concat(halfToM(j1).slice().reverse());   // p1 끝: M → 접점
      else pts.push(P1);
      if (j2) pts = pts.concat(halfToM(j2));                     // p2 끝: 접점 → M
      else pts.push(P2);
      paths.set(s.id, pts);
    }
    _jointCache = { key, joints, paths };
    return joints;
  }

  function _makeJoint(A, endA, B, endB, J, rMax) {
    const jt = { a: A, endA, b: B, endB, J, deg: 0, concave: true, eligible: false, reason: '', on: false, T: 0, R: 0, pathA: null, pathB: null };
    if (A.pathType !== 'LINE' || B.pathType !== 'LINE') { jt.reason = '곡선·꺾임 바닥면과는 이을 수 없음'; return jt; }
    const QA = _otherEndPhys(A, endA), QB = _otherEndPhys(B, endB);
    const lenA = Math.hypot(QA.x - J.x, QA.y - J.y), lenB = Math.hypot(QB.x - J.x, QB.y - J.y);
    if (lenA < 1e-9 || lenB < 1e-9) { jt.reason = '길이 0'; return jt; }
    const dA = { x: (QA.x - J.x) / lenA, y: (QA.y - J.y) / lenA };   // 모서리에서 멀어지는 방향
    const dB = { x: (QB.x - J.x) / lenB, y: (QB.y - J.y) / lenB };
    const u0 = { x: -dA.x, y: -dA.y };                                  // A 를 따라 모서리로 들어오는 방향
    const cross = u0.x * dB.y - u0.y * dB.x, dot = u0.x * dB.x + u0.y * dB.y;
    const dth = Math.atan2(Math.abs(cross), dot);                        // 꺾임각 (0..π)
    jt.deg = dth * 180 / Math.PI;
    const nA = _normalPhys(A), nB = _normalPhys(B);
    jt.concave = ((dA.x + dB.x) * (nA.x + nB.x) + (dA.y + dB.y) * (nA.y + nB.y)) > 0;
    if (jt.deg < JOINT.MIN_DEG) { jt.reason = '거의 직선 — 다듬을 필요 없음'; return jt; }
    if (jt.deg > JOINT.MAX_DEG) { jt.reason = '꺾임이 너무 큼 (150° 초과)'; return jt; }
    const unit = _unitClothoid(dth);
    const T = Math.min(JOINT.T_FRAC * Math.min(lenA, lenB), JOINT.T_MAX);
    const scale = T / unit.T;
    const R = scale * unit.Rmin;
    jt.T = T; jt.R = R;
    if (R < rMax * 1.02) { jt.reason = `이음 반지름 ${R.toFixed(2)} m 이 원 물체 반지름 ${rMax.toFixed(2)} m 보다 작음 — 바닥면이 더 길어야 함`; return jt; }
    jt.eligible = true;
    jt.on = !!(A[endA === 'p1' ? 'smoothP1' : 'smoothP2'] && B[endB === 'p1' ? 'smoothP1' : 'smoothP2']);
    if (!jt.on) return jt;
    // 월드(물리) 좌표로 배치: 시작 = 모서리 + dA·T, 프레임 e1 = u0, e2 = 회전 방향
    const sgn = cross >= 0 ? 1 : -1;
    const e1 = u0, e2 = { x: -sgn * u0.y, y: sgn * u0.x };
    const S = { x: J.x + dA.x * T, y: J.y + dA.y * T };
    const world = unit.pts.map(p => ({ x: S.x + scale * (p.x * e1.x + p.y * e2.x), y: S.y + scale * (p.x * e1.y + p.y * e2.y) }));
    const mid = JOINT.N_HALF;
    jt.pathA = world.slice(0, mid + 1);      // 접점(A) → M
    jt.pathB = world.slice(mid);            // M → 접점(B)
    return jt;
  }

  function jointAt(seg, end) {
    return floorJoints().find(j => (j.a === seg && j.endA === end) || (j.b === seg && j.endB === end)) || null;
  }

  /** 다듬어진 물리 경로 (없으면 원래 두 끝점) */
  function floorPathPhys(seg) {
    floorJoints();
    const p = _jointCache.paths.get(seg.id);
    if (p) return p;
    return [_endPhys(seg, 'p1'), _endPhys(seg, 'p2')];
  }
  /** 격자 좌표 경로 (렌더·히트·촬영) */
  function floorPathGrid(seg) {
    const GS = CONFIG.GRID_SIZE;
    return floorPathPhys(seg).map(p => ({ x: p.x, y: GS - p.y }));
  }
  /** 이 세그먼트가 다듬어진 끝을 가지는가 */
  function floorIsSmoothed(seg) { floorJoints(); return _jointCache.paths.has(seg.id); }

  /** 토글 — 양쪽 세그먼트 플래그를 함께 */
  function setJointSmooth(seg, end, on) {
    const j = jointAt(seg, end);
    if (!j) return false;
    j.a[j.endA === 'p1' ? 'smoothP1' : 'smoothP2'] = !!on;
    j.b[j.endB === 'p1' ? 'smoothP1' : 'smoothP2'] = !!on;
    _jointCache.key = '';
    return true;
  }
