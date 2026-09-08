/* ============================================================
   graph.js — 시간 그래프 패널 (x·y·v·a·E – t)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   series.js 가 쌓은 SERIES 를 그린다. 계산은 하지 않는다.
     · 탭: y(t) · x(t) · v(t) · vx · vy · a(t) · E(t)
     · 물체 토글 (색은 순서대로), E 탭은 계 전체 (KE · PE · 탄성 · 총합)
     · 직전 실행(SERIES.ghost)은 회색으로 겹쳐 — 조건을 바꾼 두 실행 비교
     · 세로 커서 = 현재 시각 (실행 중이면 오른쫁 끝)
   실행이 시작되면 자동으로 열리고, 사용자가 닫으면 그 세션에서는 다시 열지 않는다.
   ============================================================ */

  const GRAPH_TABS = [
    { id: 'y',  label: 'y–t',  unit: 'm',    pick: b => b.y },
    { id: 'x',  label: 'x–t',  unit: 'm',    pick: b => b.x },
    { id: 'v',  label: 'v–t',  unit: 'm/s',  pick: b => b.v },
    { id: 'vx', label: 'vx',   unit: 'm/s',  pick: b => b.vx },
    { id: 'vy', label: 'vy',   unit: 'm/s',  pick: b => b.vy },
    { id: 'a',  label: 'a–t',  unit: 'm/s²', pick: b => b.ay.map((ay, i) => Math.hypot(b.ax[i], ay)) },
    { id: 'E',  label: 'E–t',  unit: 'J',    sys: true },
  ];
  const GRAPH_COLORS = ['#1d4ed8', '#b45309', '#15803d', '#a21caf', '#0e7490', '#b91c1c'];

  const GRAPH = { tab: 'y', hidden: new Set(), userClosed: false, _raf: 0, _dirty: true };

  function _gEl(id) { return document.getElementById(id); }

  function initGraph() {
    const panel = _gEl('graph-panel');
    if (!panel) return;
    const tabs = _gEl('graph-tabs');
    for (const t of GRAPH_TABS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'g-tab' + (t.id === GRAPH.tab ? ' on' : ''); b.textContent = t.label; b.dataset.tab = t.id;
      b.addEventListener('click', (e) => { e.stopPropagation(); GRAPH.tab = t.id; tabs.querySelectorAll('.g-tab').forEach(x => x.classList.toggle('on', x.dataset.tab === t.id)); scheduleGraph(); });
      tabs.appendChild(b);
    }
    _gEl('graph-close-btn').addEventListener('click', () => { toggleGraph(false); GRAPH.userClosed = true; });
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) panel.addEventListener(ev, e => e.stopPropagation());

    EVENTS.on('series:sample', scheduleGraph);
    // 좁은 화면(모바일)에서는 그래프가 장면을 가리므로 자동으로 열지 않는다 — 📈 버튼으로 연다
    EVENTS.on('sim:start', () => { if (!GRAPH.userClosed && window.innerWidth > 640) toggleGraph(true); scheduleGraph(); });
    for (const ev of ['sim:pause', 'sim:resume', 'sim:stop', 'scene:changed']) EVENTS.on(ev, scheduleGraph);
    scheduleGraph();
  }

  function toggleGraph(force) {
    const p = _gEl('graph-panel');
    if (!p) return;
    const on = force == null ? !p.classList.contains('visible') : !!force;
    p.classList.toggle('visible', on);
    const tb = _gEl('tb-graph'); if (tb) tb.classList.toggle('active', on);
    if (on) { GRAPH.userClosed = false; scheduleGraph(); }
  }

  function scheduleGraph() {
    if (GRAPH._raf) return;
    GRAPH._raf = requestAnimationFrame(() => { GRAPH._raf = 0; drawGraph(); });
  }

  /** 그릴 시리즈 목록 [{label, color, t, y, ghost}] */
  function _graphSeries() {
    const tab = GRAPH_TABS.find(t => t.id === GRAPH.tab) || GRAPH_TABS[0];
    const out = [];
    if (tab.sys) {
      const S = SERIES.sys;
      out.push({ label: '운동 KE', color: GRAPH_COLORS[0], t: SERIES.t, y: S.ke });
      out.push({ label: '위치 PE', color: GRAPH_COLORS[1], t: SERIES.t, y: S.pe });
      if (S.es.some(v => v > 1e-9)) out.push({ label: '탄성', color: GRAPH_COLORS[2], t: SERIES.t, y: S.es });
      out.push({ label: '총합 E', color: '#111318', t: SERIES.t, y: S.e, bold: true });
      if (SERIES.ghost) out.push({ label: '이전 E', color: '#9aa1ab', t: SERIES.ghost.t, y: SERIES.ghost.sys.e, ghost: true });
      return { tab, list: out };
    }
    let i = 0;
    for (const [id, b] of SERIES.bodies) {
      const color = GRAPH_COLORS[i++ % GRAPH_COLORS.length];
      if (GRAPH.hidden.has(b.label)) continue;
      out.push({ label: b.label, color, t: SERIES.t, y: tab.pick(b) });
    }
    if (SERIES.ghost) {
      for (const id of Object.keys(SERIES.ghost.bodies)) {
        const g = SERIES.ghost.bodies[id];
        if (GRAPH.hidden.has(g.label)) continue;
        const gy = tab.id === 'y' ? g.y : tab.id === 'x' ? g.x : tab.id === 'v' ? g.v : null;
        if (gy) out.push({ label: '이전 ' + g.label, color: '#9aa1ab', t: SERIES.ghost.t, y: gy, ghost: true });
      }
    }
    return { tab, list: out };
  }

  function _niceStep(range, target) {
    const raw = range / Math.max(1, target);
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }

  function drawGraph() {
    const cv = _gEl('graph-canvas');
    const panel = _gEl('graph-panel');
    if (!cv || !panel || !panel.classList.contains('visible')) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 340, H = 190;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { tab, list } = _graphSeries();
    const padL = 44, padR = 10, padT = 10, padB = 22;
    const pw = W - padL - padR, ph = H - padT - padB;

    // 범위
    let tMax = 0, yMin = Infinity, yMax = -Infinity;
    for (const s of list) {
      if (s.t.length) tMax = Math.max(tMax, s.t[s.t.length - 1]);
      for (const v of s.y) if (isFinite(v)) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
    }
    const empty = !isFinite(yMin);
    if (empty) { yMin = 0; yMax = 1; }
    if (yMax - yMin < 1e-9) { yMax += 1; yMin -= 1; }
    const pad = (yMax - yMin) * 0.08; yMin -= pad; yMax += pad;
    if (tMax <= 0) tMax = 1;

    const X = t => padL + (t / tMax) * pw;
    const Y = v => padT + (1 - (v - yMin) / (yMax - yMin)) * ph;

    // 축·격자
    ctx.font = `10px ${SN.font}`;
    ctx.fillStyle = '#6b7482'; ctx.strokeStyle = '#dde1e7'; ctx.lineWidth = 1;
    const ys = _niceStep(yMax - yMin, 4);
    for (let v = Math.ceil(yMin / ys) * ys; v <= yMax; v += ys) {
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((Math.round(v * 1000) / 1000).toString(), padL - 4, y);
    }
    const ts = _niceStep(tMax, 5);
    for (let t = 0; t <= tMax + 1e-9; t += ts) {
      const x = X(t);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText((Math.round(t * 100) / 100) + '', x, H - padB + 4);
    }
    // 0 선
    if (yMin < 0 && yMax > 0) { ctx.strokeStyle = '#9aa1ab'; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke(); }
    ctx.strokeStyle = '#c9ced6'; ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
    ctx.fillStyle = '#6b7482'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(tab.unit, padL + 3, padT - 2);
    ctx.textAlign = 'right'; ctx.fillText('t [s]', W - padR, H - padB + 4);

    if (empty) {
      ctx.fillStyle = '#5a6270'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `11px ${SN.fontKo}`;
      ctx.fillText('▶ 실행하면 그래프가 그려집니다', W / 2, H / 2);
      _graphLegend(list);
      return;
    }

    // 곡선
    for (const s of list) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.t.length; i++) {
        const v = s.y[i];
        if (!isFinite(v)) { started = false; continue; }
        const x = X(s.t[i]), y = Y(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s.color; ctx.lineWidth = s.bold ? 2.2 : (s.ghost ? 1.2 : 1.6);
      ctx.setLineDash(s.ghost ? [3, 3] : []);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // 시간 커서
    if (SERIES.t.length && STATE.simMode !== 'EDIT') {
      const x = X(SERIES.t[SERIES.t.length - 1]);
      ctx.strokeStyle = 'rgba(29,78,216,0.55)'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke(); ctx.setLineDash([]);
    }
    _graphLegend(list);
  }

  function _graphLegend(list) {
    const lg = _gEl('graph-legend');
    if (!lg) return;
    lg.innerHTML = '';
    const tab = GRAPH_TABS.find(t => t.id === GRAPH.tab);
    // 물체 토글 (E 탭은 계 전체라 토글 없음)
    if (!tab.sys) {
      let i = 0;
      for (const [, b] of SERIES.bodies) {
        const color = GRAPH_COLORS[i++ % GRAPH_COLORS.length];
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'g-tog' + (GRAPH.hidden.has(b.label) ? '' : ' on');
        btn.style.setProperty('--c', color);
        btn.textContent = b.label;
        btn.addEventListener('click', (e) => { e.stopPropagation(); if (GRAPH.hidden.has(b.label)) GRAPH.hidden.delete(b.label); else GRAPH.hidden.add(b.label); scheduleGraph(); });
        lg.appendChild(btn);
      }
    } else {
      for (const s of list) {
        const sp = document.createElement('span'); sp.className = 'g-key'; sp.style.setProperty('--c', s.color); sp.textContent = s.label; lg.appendChild(sp);
      }
    }
    if (SERIES.ghost) {
      const g = document.createElement('span'); g.className = 'g-key ghost'; g.textContent = '점선 = 직전 실행';
      lg.appendChild(g);
      const clr = document.createElement('button'); clr.type = 'button'; clr.className = 'g-tog small'; clr.textContent = '잔상 지우기';
      clr.addEventListener('click', (e) => { e.stopPropagation(); clearGhost(); scheduleGraph(); });
      lg.appendChild(clr);
    }
  }
