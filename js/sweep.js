/* ============================================================
   sweep.js — 파라미터 스윕: 변수 하나를 여러 값으로 자동 반복 → 표 + 그래프
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   심화 탐구용. 현재 장면의 요소 하나(물체·마찰 바닥·용수철·외력·힘구간)와
   속성 하나(질량·초기 속도·반발계수·μ·k·힘)를 고르고, 시작·끝·단계 수를 주면
   headless.measureScene 으로 값마다 장면을 돌려 측정값(속력·가속도·장력·주기·
   멈춘 거리…)을 표와 그래프로 보여 준다. 줄을 누르면 그 조건이 장면에 적용된다.
   결과는 CSV 로 저장할 수 있다.
   ============================================================ */

  const SWEEP = { target: null, prop: null, from: 1, to: 5, steps: 5, q: 'v', when: 'at', at: 2, rows: [], _raf: 0 };

  const SWEEP_PROPS = {
    rect:      [['mass', '질량 m [kg]', 0.5, 5], ['vx0', '초기 vx [m/s]', 0, 8], ['vy0', '초기 vy [m/s]', 0, 8], ['e', '반발계수 e', 0, 1], ['drag', '공기저항 b [N·s/m]', 0, 4]],
    circle:    [['mass', '질량 m [kg]', 0.5, 5], ['vx0', '초기 vx [m/s]', 0, 8], ['vy0', '초기 vy [m/s]', 0, 8], ['e', '반발계수 e', 0, 1], ['drag', '공기저항 b [N·s/m]', 0, 4]],
    spring:    [['k', '용수철 상수 k [N/m]', 5, 40], ['L0', '자연 길이 L₀ [m]', 1, 3]],
    extforce:  [['forceN', '외력 F [N]', 0, 20]],
    forceZone: [['fx', '힘 Fx [N]', -10, 10], ['fy', '힘 Fy [N]', -10, 10]],
    floorSegment: [['muK', '운동 마찰계수 μk', 0, 0.8], ['muS', '정지 마찰계수 μs', 0, 1]],
  };
  const SWEEP_Q = [
    ['v', '속력 |v|', 'm/s'], ['vx', '속도 vx', 'm/s'], ['vy', '속도 vy', 'm/s'], ['a', '가속도 |a|', 'm/s²'],
    ['x', '위치 x', 'm'], ['y', '위치 y', 'm'], ['ke', '운동에너지', 'J'], ['E', '역학적 에너지', 'J'],
    ['T', '장력 T', 'N'], ['N', '수직항력 N', 'N'], ['f', '마찰력 f', 'N'], ['period', '주기 (vx 부호 전환)', 's'], ['dist', '멈추기까지 거리', 'm'],
  ];
  const SWEEP_WHEN = [['at', '시각 t 에서'], ['max', '최댓값'], ['min', '최솟값'], ['floor', '바닥에 닿는 순간'], ['floor-time', '바닥 도달 시각'], ['stop', '멈추는 순간']];

  function _sEl(id) { return document.getElementById(id); }

  function initSweep() {
    const p = _sEl('sweep-panel'); if (!p) return;
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) p.addEventListener(ev, e => e.stopPropagation());
    _sEl('sweep-close-btn').addEventListener('click', () => toggleSweep(false));
    const tb = _sEl('tb-sweep'); if (tb) { tb.addEventListener('pointerdown', e => e.stopPropagation()); tb.addEventListener('click', (e) => { e.stopPropagation(); toggleSweep(); }); }
    _sEl('sweep-run').addEventListener('click', runSweep);
    _sEl('sweep-csv').addEventListener('click', exportSweepCSV);
    for (const id of ['sweep-target', 'sweep-prop', 'sweep-q', 'sweep-when']) _sEl(id).addEventListener('change', () => { _readForm(); if (id === 'sweep-target') _fillProps(); if (id === 'sweep-prop') _fillRange(); _syncWhen(); });
    EVENTS.on('scene:changed', () => { if (p.classList.contains('visible')) _fillTargets(); });
  }

  function toggleSweep(force) {
    const p = _sEl('sweep-panel'); if (!p) return;
    const on = force == null ? !p.classList.contains('visible') : !!force;
    p.classList.toggle('visible', on);
    p.classList.toggle('beside', !!SWEEP._keepPOE);   // POE 옆에 나란히
    const tb = _sEl('tb-sweep'); if (tb) tb.classList.toggle('active', on);
    if (on) { if (typeof togglePOE === 'function' && !SWEEP._keepPOE) togglePOE(false); _fillTargets(); _fillQ(); _syncWhen(); drawSweep(); }
  }

  /* ── 폼 ── */
  function _opt(v, t) { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }
  function _targets() {
    const out = [];
    for (const e of STATE.elements) if (SWEEP_PROPS[e.type]) out.push({ id: e.id, key: e._key, type: e.type, label: (e.type === 'rect' || e.type === 'circle') ? bodyLabel(e) : ({ spring: '용수철', extforce: '외력', forceZone: '힘구간' })[e.type] });
    for (const s of STATE.floorSegments) if (s.isFriction) out.push({ id: s.id, key: s._key, type: 'floorSegment', label: '마찰 바닥면' });
    return out;
  }
  function _fillTargets() {
    const sel = _sEl('sweep-target'); if (!sel) return;
    const prev = sel.value; sel.innerHTML = '';
    const ts = _targets();
    for (const t of ts) sel.appendChild(_opt(t.id, `${t.label}`));
    if (ts.some(t => t.id === prev)) sel.value = prev;
    _fillProps();
    // 측정 대상 물체
    const bsel = _sEl('sweep-body'); bsel.innerHTML = '';
    for (const e of STATE.elements) if (e.type === 'rect' || e.type === 'circle') bsel.appendChild(_opt(e.id, bodyLabel(e)));
  }
  function _fillProps() {
    const sel = _sEl('sweep-target'), ps = _sEl('sweep-prop');
    const t = _targets().find(x => x.id === sel.value);
    ps.innerHTML = '';
    if (!t) return;
    for (const [k, label] of SWEEP_PROPS[t.type]) ps.appendChild(_opt(k, label));
    _fillRange();
  }
  function _fillRange() {
    const t = _targets().find(x => x.id === _sEl('sweep-target').value); if (!t) return;
    const def = SWEEP_PROPS[t.type].find(p => p[0] === _sEl('sweep-prop').value); if (!def) return;
    const cur = (STATE.elements.find(e => e.id === t.id) || STATE.floorSegments.find(s => s.id === t.id) || {})[def[0]];
    _sEl('sweep-from').value = def[2]; _sEl('sweep-to').value = def[3];
    _sEl('sweep-cur').textContent = cur != null ? `현재 값 ${cur}` : '';
  }
  function _fillQ() {
    const q = _sEl('sweep-q'); if (q.children.length) return;
    for (const [k, label] of SWEEP_Q) q.appendChild(_opt(k, label));
    const w = _sEl('sweep-when');
    for (const [k, label] of SWEEP_WHEN) w.appendChild(_opt(k, label));
    q.value = 'v'; w.value = 'at';
  }
  function _syncWhen() {
    const w = _sEl('sweep-when').value, q = _sEl('sweep-q').value;
    _sEl('sweep-at-wrap').style.display = (w === 'at' && q !== 'period' && q !== 'dist') ? '' : 'none';
  }
  function _readForm() {
    SWEEP.from = parseFloat(_sEl('sweep-from').value); SWEEP.to = parseFloat(_sEl('sweep-to').value);
    SWEEP.steps = Math.max(2, Math.min(24, parseInt(_sEl('sweep-steps').value, 10) || 5));
    SWEEP.at = Math.max(0.1, parseFloat(_sEl('sweep-at').value) || 2);
    SWEEP.q = _sEl('sweep-q').value; SWEEP.when = _sEl('sweep-when').value;
  }

  /** 측정 규격 조립 */
  function _measureSpec(bodyRef) {
    const q = SWEEP.q, w = SWEEP.when;
    if (q === 'period') return { body: bodyRef, q: 'period', T: 12 };
    if (q === 'dist') return { body: bodyRef, q: 'x', when: 'stop', stat: 'dist', T: 10 };
    if (w === 'max') return { body: bodyRef, q, stat: 'max', T: Math.max(SWEEP.at, 4) };
    if (w === 'min') return { body: bodyRef, q, stat: 'min', T: Math.max(SWEEP.at, 4) };
    if (w === 'floor') return { body: bodyRef, q, when: 'floor', T: 10 };
    if (w === 'floor-time') return { body: bodyRef, q, when: 'floor', stat: 'time', T: 10 };
    if (w === 'stop') return { body: bodyRef, q, when: 'stop', T: 10 };
    return { body: bodyRef, q, at: SWEEP.at };
  }

  /**
   * 프리셋으로 열기 (탐구 아이디어 카드) —
   *   { targetKey, prop, from, to, steps, bodyKey, q, when, at }
   */
  function presetSweep(pre) {
    SWEEP._keepPOE = true; toggleSweep(true); SWEEP._keepPOE = false;
    const t = STATE.elements.find(e => e._key === pre.targetKey) || STATE.floorSegments.find(s => s._key === pre.targetKey);
    if (t) { _sEl('sweep-target').value = t.id; _fillProps(); }
    if (pre.prop) { _sEl('sweep-prop').value = pre.prop; _fillRange(); }
    if (pre.from != null) _sEl('sweep-from').value = pre.from;
    if (pre.to != null) _sEl('sweep-to').value = pre.to;
    if (pre.steps != null) _sEl('sweep-steps').value = pre.steps;
    const b = STATE.elements.find(e => e._key === pre.bodyKey);
    if (b) _sEl('sweep-body').value = b.id;
    if (pre.q) _sEl('sweep-q').value = pre.q;
    if (pre.when) _sEl('sweep-when').value = pre.when;
    if (pre.at != null) _sEl('sweep-at').value = pre.at;
    _syncWhen();
    if (pre.run) runSweep();
  }

  /** 스윕 실행 — 값마다 headless 로 장면을 돌린다 */
  function runSweep() {
    _readForm();
    const tsel = _sEl('sweep-target'), prop = _sEl('sweep-prop').value, bodyId = _sEl('sweep-body').value;
    const target = STATE.elements.find(e => e.id === tsel.value) || STATE.floorSegments.find(s => s.id === tsel.value);
    const body = STATE.elements.find(e => e.id === bodyId);
    if (!target || !prop || !body) { showToast('대상·속성·측정 물체를 고르세요', 'warn', 1800); return; }
    if (STATE.simMode !== 'EDIT') { const r = _sEl('btn-reset'); if (r) r.click(); }
    const data = sceneToData();
    const tIdx = data.elements.findIndex(e => e.id === target.id), fIdx = data.floorSegments.findIndex(s => s.id === target.id);
    const bIdx = data.elements.findIndex(e => e.id === body.id);
    const rows = [];
    const n = SWEEP.steps;
    for (let i = 0; i < n; i++) {
      const val = SWEEP.from + (SWEEP.to - SWEEP.from) * (n === 1 ? 0 : i / (n - 1));
      const d = JSON.parse(JSON.stringify(data));
      const tgt = tIdx >= 0 ? d.elements[tIdx] : d.floorSegments[fIdx];
      tgt[prop] = Math.round(val * 1000) / 1000;
      if (prop === 'muS' && tgt.muK > val) tgt.muK = val;
      if (prop === 'muK' && tgt.muS < val) tgt.muS = val;
      const v = measureScene(d, _measureSpec(d.elements[bIdx].id));
      rows.push({ x: tgt[prop], y: v });
    }
    SWEEP.rows = rows;
    SWEEP.meta = { prop, propLabel: (SWEEP_PROPS[target.type] || []).find(p => p[0] === prop)?.[1] || prop,
                   qLabel: SWEEP_Q.find(q => q[0] === SWEEP.q)?.[1] || SWEEP.q, unit: SWEEP_Q.find(q => q[0] === SWEEP.q)?.[2] || '',
                   targetId: target.id, targetIsFloor: fIdx >= 0 };
    renderSweepTable();
    drawSweep();
    if (typeof EVENTS !== 'undefined') EVENTS.emit('sweep:done', rows);
  }

  function renderSweepTable() {
    const box = _sEl('sweep-table'); box.innerHTML = '';
    if (!SWEEP.rows.length) return;
    const tbl = document.createElement('table'); tbl.className = 'poe-truth';
    const th = document.createElement('tr');
    for (const t of [SWEEP.meta.propLabel, `${SWEEP.meta.qLabel} [${SWEEP.meta.unit}]`]) { const c = document.createElement('th'); c.textContent = t; th.appendChild(c); }
    tbl.appendChild(th);
    SWEEP.rows.forEach((r) => {
      const tr = document.createElement('tr'); tr.className = 'click';
      const a = document.createElement('td'); a.textContent = r.x;
      const b = document.createElement('td'); b.textContent = isFinite(r.y) ? (Math.round(r.y * 1000) / 1000) : '—';
      tr.appendChild(a); tr.appendChild(b);
      tr.title = '이 조건을 장면에 적용';
      tr.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = STATE.elements.find(x => x.id === SWEEP.meta.targetId) || STATE.floorSegments.find(x => x.id === SWEEP.meta.targetId);
        if (!t) return;
        if (STATE.simMode !== 'EDIT') { const rb = _sEl('btn-reset'); if (rb) rb.click(); }
        t[SWEEP.meta.prop] = r.x;
        if (SWEEP.meta.prop === 'muS' && t.muK > r.x) t.muK = r.x;
        validateAll(); renderPanel(); if (typeof recordHistory === 'function') recordHistory();
        tbl.querySelectorAll('tr').forEach(x => x.classList.remove('on')); tr.classList.add('on');
        showToast(`${SWEEP.meta.propLabel} = ${r.x} 적용 — ▶ 실행으로 확인하세요`, 'ok', 2000);
      });
      tbl.appendChild(tr);
    });
    box.appendChild(tbl);
  }

  function drawSweep() {
    const cv = _sEl('sweep-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d'); const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 340, H = 150;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const rows = SWEEP.rows.filter(r => isFinite(r.y));
    const padL = 44, padR = 10, padT = 12, padB = 24, pw = W - padL - padR, ph = H - padT - padB;
    ctx.font = `10px ${SN.font}`; ctx.fillStyle = '#6b7482'; ctx.strokeStyle = '#c9ced6';
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
    if (rows.length < 2) { ctx.textAlign = 'center'; ctx.font = `11px ${SN.fontKo}`; ctx.fillText('대상·속성·범위를 고르고 [스윕 실행]', W / 2, H / 2); return; }
    let x0 = Math.min(...rows.map(r => r.x)), x1 = Math.max(...rows.map(r => r.x));
    let y0 = Math.min(...rows.map(r => r.y)), y1 = Math.max(...rows.map(r => r.y));
    if (y1 - y0 < 1e-9) { y1 += 1; y0 -= 1; } const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
    if (x1 - x0 < 1e-9) x1 = x0 + 1;
    const X = x => padL + (x - x0) / (x1 - x0) * pw, Y = y => padT + (1 - (y - y0) / (y1 - y0)) * ph;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4; ctx.strokeStyle = '#eef0f3'; ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke(); ctx.fillText((Math.round(v * 100) / 100).toString(), padL - 4, Y(v)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const r of rows) ctx.fillText(String(r.x), X(r.x), H - padB + 4);
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 1.6; ctx.beginPath();
    rows.forEach((r, i) => { if (i === 0) ctx.moveTo(X(r.x), Y(r.y)); else ctx.lineTo(X(r.x), Y(r.y)); }); ctx.stroke();
    ctx.fillStyle = '#1d4ed8';
    for (const r of rows) { ctx.beginPath(); ctx.arc(X(r.x), Y(r.y), 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#6b7482'; ctx.textAlign = 'left'; ctx.fillText(SWEEP.meta ? SWEEP.meta.unit : '', padL + 3, padT - 4);
    ctx.textAlign = 'right'; ctx.fillText(SWEEP.meta ? SWEEP.meta.propLabel : '', W - padR, H - padB + 12);
  }

  function sweepCSV() {
    const lines = [`${SWEEP.meta.propLabel},${SWEEP.meta.qLabel}[${SWEEP.meta.unit}]`];
    for (const r of SWEEP.rows) lines.push(`${r.x},${isFinite(r.y) ? r.y : ''}`);
    return lines.join('\n');
  }
  function exportSweepCSV() {
    if (!SWEEP.rows.length) { showToast('먼저 스윕을 실행하세요', 'warn', 1400); return; }
    const blob = new Blob(['﻿' + sweepCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sweep.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  }
