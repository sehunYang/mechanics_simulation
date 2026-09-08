/* ============================================================
   series.js — 실행 중 물리량 시계열 기록 + CSV 내보내기
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   simStep 이 한 스텝을 끝낼 때마다 recordSeries(dt) 가 불려 물체별
   (t, x, y, vx, vy, |v|, ax, ay, KE, PE) 와 계 전체 (KE, PE, 탄성E, 총E)
   를 쌓는다. 그래프 패널(graph.js)과 CSV 내보내기가 같은 데이터를 쓴다.

   · 위치는 물체 중심, 물리 좌표(m, y 위로 증가). 격자 맨 아래가 y = 0.
   · 가속도는 힘 합산값이 아니라 한 스텝의 Δv/dt — 실·충돌·마찰처럼
     힘으로 적분되지 않는 제약(임펄스)까지 모두 포함한 "실제 가속도"다.
   · 위치에너지 기준: 격자 맨 아래(y = 0). 절대값보다 변화량을 읽는 용도.
   · 상한(SERIES_CAP)을 넘으면 앞쪽을 반씩 솎아 낸다 (오래 돌려도 안전).
   ============================================================ */

  const SERIES_CAP = 12000;   // 60 Hz × 200 s

  const SERIES = {
    t: [],            // 시각 [s]
    bodies: new Map(),// id → { label, x[], y[], vx[], vy[], v[], ax[], ay[], ke[], pe[] }
    sys: { ke: [], pe: [], es: [], e: [] },
    time: 0,          // 누적 시각 (renderLoop 의 simTime 과 무관하게 스스로 센다)
    decim: 1,         // 현재 기록 간격 (스텝 수)
    _skip: 0,
    ghost: null,      // 직전 실행의 스냅샷 (실행 겹쳐 보기용, 2단계)
  };

  /** 물체 이름 — label 이 있으면 그것, 없으면 종류+번호 */
  function bodyLabel(el) {
    if (el.label) return el.label;
    let n = 0;
    for (const e of STATE.elements) {
      if (e.type !== el.type) continue;
      n++;
      if (e === el) break;
    }
    const kind = el.type === 'rect' ? '네모' : el.type === 'circle' ? '원' : el.type;
    return kind + n;
  }

  function clearSeries() {
    SERIES.t = [];
    SERIES.bodies = new Map();
    SERIES.sys = { ke: [], pe: [], es: [], e: [] };
    SERIES.time = 0;
    SERIES.decim = 1;
    SERIES._skip = 0;
  }

  /** 직전 실행을 잔상으로 보관 (초기화 직전에 호출) */
  function keepSeriesAsGhost() {
    if (!SERIES.t.length) return;
    const bodies = {};
    for (const [id, b] of SERIES.bodies) {
      bodies[id] = { label: b.label, x: b.x.slice(), y: b.y.slice(), v: b.v.slice(), ke: b.ke.slice(), pe: b.pe.slice() };
    }
    SERIES.ghost = { t: SERIES.t.slice(), bodies, sys: { e: SERIES.sys.e.slice(), ke: SERIES.sys.ke.slice(), pe: SERIES.sys.pe.slice() } };
  }
  function clearGhost() { SERIES.ghost = null; }

  /**
   * 위치에너지 기준 높이 [m, 물리 y] — 바닥면이 있으면 그 끝점 중 가장 낮은 점, 없으면 0.
   * 기준을 어디에 두어도 역학은 같지만, 격자 맨 아래(y=0)를 쓰면 PE 가 수백 J 로
   * 커져 그래프에서 KE 변화가 보이지 않는다. 장면의 가장 낮은 지면을 0 으로 잡는다.
   */
  function energyBaselineY() {
    const GS = CONFIG.GRID_SIZE;
    let y = Infinity;
    for (const s of STATE.floorSegments) {
      y = Math.min(y, GS - s.y1, GS - s.y2);
      if (s.pathType && s.pathType.startsWith('ARC') && typeof _arcPhysPoints === 'function') {
        const A = { x: s.x1, y: GS - s.y1 }, B = { x: s.x2, y: GS - s.y2 };
        for (const p of _arcPhysPoints(s, A, B, 12)) y = Math.min(y, p.y);
      }
    }
    return isFinite(y) ? y : 0;
  }

  /** 용수철 탄성에너지 합 (양끝이 모두 붙어 있거나 한쪽 고정핀인 것) */
  function springEnergyTotal() {
    let e = 0;
    for (const s of STATE.elements) {
      if (s.type !== 'spring') continue;
      if (!s.leftElementId && !s.rightElementId) continue;
      if (s._leftDetached || s._rightDetached) continue;
      const x = (s.L || s.L0) - s.L0;
      e += 0.5 * s.k * x * x;
    }
    return e;
  }

  /** 한 스텝 기록 — physics.simStep 끝에서 호출 */
  function recordSeries(dt) {
    SERIES.time += dt;
    if (SERIES._skip > 0) { SERIES._skip--; return; }
    SERIES._skip = SERIES.decim - 1;

    const t = SERIES.time;
    SERIES.t.push(t);
    let KE = 0, PE = 0;
    const g = STATE.gravityOn ? CONFIG.G : 0;
    const y0 = energyBaselineY();
    for (const el of STATE.elements) {
      if (el.type !== 'rect' && el.type !== 'circle') continue;
      let b = SERIES.bodies.get(el.id);
      if (!b) {
        b = { label: bodyLabel(el), x: [], y: [], vx: [], vy: [], v: [], ax: [], ay: [], ke: [], pe: [] };
        // 중간에 나타난 물체는 앞을 NaN 으로 채워 길이를 맞춘다
        for (let i = 0; i < SERIES.t.length - 1; i++) for (const k of ['x','y','vx','vy','v','ax','ay','ke','pe']) b[k].push(NaN);
        SERIES.bodies.set(el.id, b);
      }
      const cx = el.type === 'rect' ? el.physX + el.gridW / 2 : el.physX;
      const cy = el.type === 'rect' ? el.physY + el.gridH / 2 : el.physY;
      const m = el.mass || 1;
      const ke = 0.5 * m * (el.vx * el.vx + el.vy * el.vy);
      const pe = m * g * (cy - y0);
      b.x.push(cx); b.y.push(cy);
      b.vx.push(el.vx); b.vy.push(el.vy); b.v.push(Math.hypot(el.vx, el.vy));
      b.ax.push(el._axMeas || 0); b.ay.push(el._ayMeas || 0);
      b.ke.push(ke); b.pe.push(pe);
      KE += ke; PE += pe;
    }
    const ES = springEnergyTotal();
    SERIES.sys.ke.push(KE); SERIES.sys.pe.push(PE); SERIES.sys.es.push(ES); SERIES.sys.e.push(KE + PE + ES);

    if (SERIES.t.length > SERIES_CAP) _decimateSeries();
    if (typeof EVENTS !== 'undefined') EVENTS.emit('series:sample', t);
  }

  /** 앞뒤 모두 반씩 솎아 낸다 — 이후 기록 간격도 2배 */
  function _decimateSeries() {
    const half = arr => arr.filter((_, i) => i % 2 === 0);
    SERIES.t = half(SERIES.t);
    for (const b of SERIES.bodies.values()) for (const k of ['x','y','vx','vy','v','ax','ay','ke','pe']) b[k] = half(b[k]);
    for (const k of ['ke','pe','es','e']) SERIES.sys[k] = half(SERIES.sys[k]);
    SERIES.decim *= 2;
  }

  /* ================================================================
     CSV
  ================================================================ */

  function _csvNum(v) {
    if (v === undefined || v === null || Number.isNaN(v)) return '';
    return (Math.round(v * 1e5) / 1e5).toString();
  }

  /** 시계열 → CSV 문자열 (BOM 없이; 저장 함수가 붙인다) */
  function seriesToCSV() {
    const heads = ['t[s]'];
    const cols = [SERIES.t];
    for (const b of SERIES.bodies.values()) {
      const L = b.label;
      heads.push(`${L}_x[m]`, `${L}_y[m]`, `${L}_vx[m/s]`, `${L}_vy[m/s]`, `${L}_v[m/s]`,
                 `${L}_ax[m/s2]`, `${L}_ay[m/s2]`, `${L}_KE[J]`, `${L}_PE[J]`);
      cols.push(b.x, b.y, b.vx, b.vy, b.v, b.ax, b.ay, b.ke, b.pe);
    }
    heads.push('KE_total[J]', 'PE_total[J]', 'E_spring[J]', 'E_total[J]');
    cols.push(SERIES.sys.ke, SERIES.sys.pe, SERIES.sys.es, SERIES.sys.e);

    const lines = [heads.join(',')];
    for (let i = 0; i < SERIES.t.length; i++) {
      lines.push(cols.map(c => _csvNum(c[i])).join(','));
    }
    return lines.join('\n');
  }

  /** CSV 파일 저장 (UTF-8 BOM — 한글 헤더가 스프레드시트에서 깨지지 않게) */
  function exportSeriesCSV() {
    if (!SERIES.t.length) {
      if (typeof showToast === 'function') showToast('기록된 데이터가 없습니다 — 먼저 실행하세요', 'warn', 2000);
      return false;
    }
    const csv = seriesToCSV();
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = `mechanics_series_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    if (typeof showToast === 'function') showToast(`시계열 ${SERIES.t.length}행을 CSV 로 저장했습니다`, 'ok', 2200);
    return true;
  }

  /* 장면을 새로 불러오면 이전 실행의 시계열·잔상은 의미가 없다 */
  if (typeof EVENTS !== 'undefined') {
    EVENTS.on('scene:changed', (info) => { if (info && info.source === 'load') { clearSeries(); clearGhost(); } });
  }
