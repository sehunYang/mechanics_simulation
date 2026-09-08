/* ============================================================
   poe.js — 예측·관찰·설명(POE) 활동 엔진
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   데이터는 poe-data.js (POE_EXAMPLES · POE_GUIDES · POE_CATS).
   흐름: 목록(분류 탭·진행률·CSV) → 예측(선택지 또는 수치 입력)
        → 관찰(장면 로드·표시 토글·비교표) → 설명(정답·오개념 태그·해설).
   선택지는 예제 id 로 시드를 잡은 결정적 셔플 — 정답이 늘 첫 줄이면 예측이 아니다.
   수치 정답은 headless.measureScene 으로 그 자리에서 계산한다 (엔진과 늘 일치).
   결과는 세션 안에 쌓이고 CSV 로 내보낸다.
   ============================================================ */

  const POE = {
    open: false, cur: null, step: 0, picked: null, numeric: null, tab: 'motion',
    results: [], sceneData: null, variantIdx: 0, variantVals: null, answerValue: null,
  };

  function _pEl(id) { return document.getElementById(id); }
  function _h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function _btn(text, cls, fn) {
    const b = _h('button', 'poe-btn ' + (cls || ''), text); b.type = 'button';
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', e => { e.stopPropagation(); fn(); });
    return b;
  }
  function _fmtV(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    const d = a >= 100 ? 1 : a >= 10 ? 2 : 3;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)) + (unit ? ' ' + unit : '');
  }

  /* ── 초기화 ── */
  function initPOE() {
    const panel = _pEl('poe-panel');
    if (!panel) return;
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) panel.addEventListener(ev, e => e.stopPropagation());
    const x = _pEl('poe-close-btn'); if (x) x.addEventListener('click', () => togglePOE(false));
    const b = _pEl('tb-poe'); if (b) { b.addEventListener('pointerdown', e => e.stopPropagation()); b.addEventListener('click', (e) => { e.stopPropagation(); togglePOE(); }); }
    const sg = _pEl('sg-poe'); if (sg) { sg.addEventListener('pointerdown', e => e.stopPropagation()); sg.addEventListener('click', (e) => { e.stopPropagation(); togglePOE(true); }); }
  }

  function togglePOE(force) {
    const p = _pEl('poe-panel'); if (!p) return;
    const on = force == null ? !p.classList.contains('visible') : !!force;
    p.classList.toggle('visible', on);
    POE.open = on;
    const tb = _pEl('tb-poe'); if (tb) tb.classList.toggle('active', on);
    if (on) { if (typeof toggleSweep === 'function') toggleSweep(false); POE.cur = null; renderPOEList(); }
  }

  /* ── 목록 ── */
  function renderPOEList() {
    const body = _pEl('poe-body'); if (!body) return;
    body.innerHTML = '';
    body.appendChild(_h('div', 'poe-intro', '예측 → 관찰 → 설명. 먼저 답을 고른 뒤에 장면을 돌립니다.'));
    const tabs = _h('div', 'poe-tabs');
    for (const ct of POE_CATS) {
      const n = ct.id === 'guide' ? POE_GUIDES.length : ct.id === 'idea' ? POE_IDEAS.length : POE_EXAMPLES.filter(e => e.cat === ct.id).length;
      if (!n) continue;
      const done = (ct.id === 'guide' || ct.id === 'idea') ? 0 : new Set(POE.results.filter(r => (POE_EXAMPLES.find(e => e.id === r.id) || {}).cat === ct.id).map(r => r.id)).size;
      const b = _h('button', 'poe-tab' + (ct.id === POE.tab ? ' on' : ''), `${ct.label} ${n}${done ? ' ✓' + done : ''}`);
      b.type = 'button';
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); POE.tab = ct.id; renderPOEList(); });
      tabs.appendChild(b);
    }
    body.appendChild(tabs);

    if (POE.tab === 'idea') {
      body.appendChild(_h('div', 'poe-dim', '탐구 보고서 소재. 카드를 누르면 시작 장면이 열리고 스윕 패널이 그 변수로 준비됩니다.'));
      for (const it of POE_IDEAS) {
        const row = _h('div', 'poe-item');
        row.appendChild(_h('span', 'poe-lv', it.level));
        row.appendChild(_h('span', 'poe-title', it.title));
        row.addEventListener('click', () => startIdea(it));
        body.appendChild(row);
      }
      return;
    }
    if (POE.tab === 'guide') {
      body.appendChild(_h('div', 'poe-dim', '문항 없이 "무엇을 볼지 · 왜 그런지" 를 단계별로 안내합니다.'));
      for (const g of POE_GUIDES) {
        const row = _h('div', 'poe-item');
        row.appendChild(_h('span', 'poe-lv', '해설'));
        row.appendChild(_h('span', 'poe-title', g.title));
        row.addEventListener('click', () => startGuide(g));
        body.appendChild(row);
      }
      return;
    }

    for (const ex of POE_EXAMPLES) {
      if (ex.cat !== POE.tab) continue;
      const row = _h('div', 'poe-item');
      const last = POE.results.filter(r => r.id === ex.id).slice(-1)[0];
      row.appendChild(_h('span', 'poe-lv', ex.level));
      row.appendChild(_h('span', 'poe-title', ex.title + (ex.answer ? ' ✎' : '')));
      if (last) row.appendChild(_h('span', 'poe-mark ' + (last.correct ? 'ok' : 'no'), last.correct ? '○' : '✕'));
      row.addEventListener('click', () => startPOE(ex));
      body.appendChild(row);
    }
    // 진행
    const seen = {}; POE.results.forEach(r => { seen[r.id] = r.correct; });
    const doneN = Object.keys(seen).length, okN = Object.values(seen).filter(Boolean).length;
    const prog = _h('div', 'poe-progress');
    prog.appendChild(_h('span', '', `전체 ${POE_EXAMPLES.length}개 중 ${doneN}개 풀이 · ${okN}개 정답`));
    const bar = _h('div', 'poe-bar'); const fill = _h('div', 'poe-bar-fill');
    fill.style.width = Math.round(doneN / POE_EXAMPLES.length * 100) + '%';
    bar.appendChild(fill); prog.appendChild(bar); body.appendChild(prog);
    const foot = _h('div', 'poe-foot');
    foot.appendChild(_btn('결과 CSV 내보내기', 'poe-small', exportPOECSV));
    if (doneN) foot.appendChild(_btn('기록 지우기', 'poe-small', () => { POE.results.length = 0; renderPOEList(); }));
    body.appendChild(foot);
  }

  /* ── 장면 준비 ── */
  function _poeLoadScene(ex) {
    if (typeof ex.scene === 'string') loadScene(ex.scene, { history: true });
    else { buildSceneFromSpec(ex.scene, { history: true }); STATE.currentSceneId = null; }
    if (ex.set) _applySetToState(ex.set);
    POE.sceneData = sceneToData();
    POE.variantIdx = 0; POE.variantVals = null;
    if (typeof fitViewToScene === 'function') fitViewToScene();
  }
  function _applySetToState(set) {
    for (const key of Object.keys(set)) {
      const t = STATE.elements.find(e => e._key === key || e.label === key) || STATE.floorSegments.find(s => s._key === key);
      if (t) Object.assign(t, set[key]);
    }
    if (typeof validateAll === 'function') validateAll();
  }
  /** 관찰 단계의 표시 토글·선택 */
  function _applyVis(ex) {
    const want = new Set(ex.vis || []);
    const setTog = (id, prop, on) => { STATE[prop] = on; const b = _pEl(id); if (b) b.classList.toggle('active', on); };
    setTog('tb-forces', 'showForces', want.has('forces'));
    setTog('tb-vectors', 'showVectors', want.has('vectors'));
    setTog('tb-labels', 'showLabels', !want.has('labels-off'));
    const g = [...want].find(v => v.startsWith('graph:'));
    if (g && typeof GRAPH !== 'undefined') {
      GRAPH.tab = g.split(':')[1];
      document.querySelectorAll('#graph-tabs .g-tab').forEach(x => x.classList.toggle('on', x.dataset.tab === GRAPH.tab));
      if (typeof toggleGraph === 'function') toggleGraph(true);
    }
    if (ex.select) {
      const el = STATE.elements.find(e => e._key === ex.select);
      if (el && typeof _selectObject === 'function') _selectObject(el);
    }
  }

  /* ── 활동 시작 ── */
  function startPOE(ex) {
    POE.cur = ex; POE.step = 0; POE.picked = null; POE.numeric = null; POE.answerValue = null;
    if (STATE.simMode !== 'EDIT') { const r = _pEl('btn-reset'); if (r) r.click(); }
    _poeLoadScene(ex);
    // 예측 단계: 표시는 끄고 라벨만 (관찰 전에는 답을 보여 주지 않는다)
    STATE.showForces = false; STATE.showVectors = false;
    ['tb-forces', 'tb-vectors'].forEach(id => { const b = _pEl(id); if (b) b.classList.remove('active'); });
    if (typeof toggleGraph === 'function') toggleGraph(false);
    renderPOEStep();
  }

  function startGuide(g) {
    POE.cur = { guide: g }; POE.step = 1;
    if (STATE.simMode !== 'EDIT') { const r = _pEl('btn-reset'); if (r) r.click(); }
    loadScene(g.scene, { history: true });
    POE.sceneData = sceneToData();
    if (typeof fitViewToScene === 'function') fitViewToScene();
    _applyVis(g);
    renderGuideStep(g);
  }

  /* ── 탐구 카드 ── */
  function startIdea(it) {
    POE.cur = { idea: it }; POE.step = 1;
    if (STATE.simMode !== 'EDIT') { const r = _pEl('btn-reset'); if (r) r.click(); }
    if (it.spec) { buildSceneFromSpec(it.spec, { history: true }); STATE.currentSceneId = null; }
    else loadScene(it.scene, { history: true });
    if (it.set) _applySetToState(it.set);
    POE.sceneData = sceneToData();
    if (typeof fitViewToScene === 'function') fitViewToScene();
    const body = _pEl('poe-body'); body.innerHTML = '';
    const head = _h('div', 'poe-head');
    head.appendChild(_h('span', 'poe-lv', it.level)); head.appendChild(_h('span', 'poe-title', it.title));
    head.appendChild(_btn('← 목록', 'poe-small', () => { POE.cur = null; renderPOEList(); }));
    body.appendChild(head);
    body.appendChild(_h('div', 'poe-q', it.question));
    body.appendChild(_h('div', 'poe-yours', '바꿀 변수: ' + it.vary));
    body.appendChild(_h('div', 'poe-answer', '기대: ' + it.expect));
    body.appendChild(_h('div', 'poe-dim', '절차: ① 스윕으로 표를 얻고 ② 표의 줄을 눌러 장면에 적용해 ▶ 실행으로 확인하고 ③ CSV 로 저장해 보고서에 붙입니다. 공유 링크(🔗)로 장면을 기록해 두세요.'));
    const row = _h('div', 'poe-endbtns');
    row.appendChild(_btn('🔁 스윕 열기 (변수 준비됨)', 'poe-primary', () => { if (typeof presetSweep === 'function') presetSweep(Object.assign({}, it.sweep, { run: false })); }));
    body.appendChild(row);
    const row2 = _h('div', 'poe-endbtns');
    const i = POE_IDEAS.indexOf(it);
    if (POE_IDEAS[i + 1]) row2.appendChild(_btn('다음 카드 →', 'poe-small', () => startIdea(POE_IDEAS[i + 1])));
    row2.appendChild(_btn('목록으로', 'poe-small', () => { POE.cur = null; renderPOEList(); }));
    body.appendChild(row2);
  }

  function renderGuideStep(g) {
    const body = _pEl('poe-body'); body.innerHTML = '';
    const head = _h('div', 'poe-head');
    head.appendChild(_h('span', 'poe-lv', '해설')); head.appendChild(_h('span', 'poe-title', g.title));
    head.appendChild(_btn('← 목록', 'poe-small', () => { POE.cur = null; renderPOEList(); }));
    body.appendChild(head);
    body.appendChild(_h('div', 'poe-q', '이렇게 보세요'));
    const ol = _h('ol', 'poe-steps-list');
    g.steps.forEach(s => ol.appendChild(_h('li', '', s)));
    body.appendChild(ol);
    body.appendChild(_h('div', 'poe-answer', '왜 그럴까: ' + g.why));
    body.appendChild(_h('div', 'poe-dim', '▶ 실행을 누르고, 값을 바꿔 다시 실행하면 이전 실행이 점선 잔상으로 남습니다.'));
    const i = POE_GUIDES.indexOf(g);
    const row = _h('div', 'poe-endbtns');
    if (POE_GUIDES[i + 1]) row.appendChild(_btn('다음 해설 →', 'poe-small', () => startGuide(POE_GUIDES[i + 1])));
    row.appendChild(_btn('목록으로', 'poe-small', () => { POE.cur = null; renderPOEList(); }));
    body.appendChild(row);
  }

  /* ── 선택지 순서: 예제 id 시드 결정적 셔플 ── */
  function _optionOrder(ex) {
    if (ex._order && ex._order.length === ex.options.length) return ex._order;
    const n = ex.options.length, idx = []; for (let i = 0; i < n; i++) idx.push(i);
    if (n <= 1) { ex._order = idx; return idx; }
    let seed = 7; for (let k = 0; k < ex.id.length; k++) seed = (seed * 31 + ex.id.charCodeAt(k) + k * 17) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let j = n - 1; j > 0; j--) { const r = Math.floor(rnd() * (j + 1)); const t = idx[j]; idx[j] = idx[r]; idx[r] = t; }
    ex._order = idx; return idx;
  }

  /* ── 수치 정답 ── */
  function _answerValue(ex) {
    if (!ex.answer) return null;
    if (POE.answerValue != null) return POE.answerValue;
    let v = ex.answer.value;
    if (ex.answer.measure && POE.sceneData) v = measureScene(POE.sceneData, ex.answer.measure);
    POE.answerValue = v;
    return v;
  }
  function _numericCorrect(ex) {
    const ans = _answerValue(ex);
    if (POE.numeric == null || ans == null || !isFinite(ans)) return false;
    const tol = typeof ex.answer.tol === 'string' && ex.answer.tol.endsWith('%') ? Math.abs(ans) * parseFloat(ex.answer.tol) / 100 : (ex.answer.tol || 0.05 * Math.abs(ans));
    return Math.abs(POE.numeric - Math.abs(ans)) <= Math.max(tol, 1e-6) || Math.abs(POE.numeric - ans) <= Math.max(tol, 1e-6);
  }
  function isPOECorrect(ex) {
    if (ex.answer) return _numericCorrect(ex);
    const o = ex.options[POE.picked];
    return !!(o && o.correct);
  }

  /* ── 비교표 ── */
  function _variantTable(ex, mode) {
    const wrap = _h('div', 'poe-vt');
    wrap.appendChild(_h('div', 'poe-dim', `비교표 — ${ex.measure.label}${mode === 'observe' ? ' (줄을 누르면 장면이 그 조건으로 바뀝니다)' : ''}`));
    const tbl = _h('table', 'poe-truth');
    const th = _h('tr'); th.appendChild(_h('th', '', '조건')); th.appendChild(_h('th', '', ex.measure.label + (ex.measure.unit ? ` [${ex.measure.unit}]` : ''))); tbl.appendChild(th);
    if (!POE.variantVals) {
      POE.variantVals = ex.variants.map(v => measureScene(applyVariant(POE.sceneData, v.set), ex.measure));
    }
    ex.variants.forEach((v, i) => {
      const tr = _h('tr', (mode === 'observe' ? 'click' : '') + (i === POE.variantIdx ? ' on' : ''));
      tr.appendChild(_h('td', '', v.label));
      tr.appendChild(_h('td', '', _fmtV(POE.variantVals[i])));
      if (mode === 'observe') tr.addEventListener('click', (e) => { e.stopPropagation(); applyPOEVariant(ex, i); });
      tbl.appendChild(tr);
    });
    wrap.appendChild(tbl);
    return wrap;
  }
  function applyPOEVariant(ex, i) {
    POE.variantIdx = i;
    if (STATE.simMode !== 'EDIT') { const r = _pEl('btn-reset'); if (r) r.click(); }
    loadSceneData(applyVariant(POE.sceneData, ex.variants[i].set), { history: true });
    _applyVis(ex);
    renderPOEStep();
    if (typeof showToast === 'function') showToast(`조건: ${ex.variants[i].label} — ▶ 실행으로 확인하세요`, 'ok', 2200);
  }

  /* ── 단계 렌더 ── */
  function renderPOEStep() {
    const ex = POE.cur; if (!ex || ex.guide) return;
    const body = _pEl('poe-body'); body.innerHTML = '';
    const head = _h('div', 'poe-head');
    head.appendChild(_h('span', 'poe-lv', ex.level)); head.appendChild(_h('span', 'poe-title', ex.title));
    head.appendChild(_btn('← 목록', 'poe-small', () => { POE.cur = null; renderPOEList(); }));
    body.appendChild(head);
    const steps = _h('div', 'poe-steps');
    ['예측', '관찰', '설명'].forEach((s, i) => steps.appendChild(_h('span', 'poe-step' + (i === POE.step ? ' on' : ''), `${i + 1} ${s}`)));
    body.appendChild(steps);

    if (POE.step === 0) {
      body.appendChild(_h('div', 'poe-q', ex.question));
      if (ex.answer) {
        const row = _h('div', 'poe-opts');
        const b = _btn(POE.numeric == null ? `${ex.answer.prompt || '값'} 입력…` : `내 예측: ${POE.numeric} ${ex.answer.unit || ''}`, POE.numeric == null ? '' : 'picked', () => {
          openNumericKeypad({ initialValue: POE.numeric != null ? POE.numeric : 0, onConfirm: (v) => { POE.numeric = v; renderPOEStep(); } });
        });
        row.appendChild(b); body.appendChild(row);
        body.appendChild(_h('div', 'poe-dim', '정답은 시뮬레이션이 실제로 낸 값과 비교합니다 (허용 오차 ' + (ex.answer.tol || '5%') + ').'));
      } else {
        const opts = _h('div', 'poe-opts');
        _optionOrder(ex).forEach(i => {
          opts.appendChild(_btn(ex.options[i].label, 'poe-opt' + (POE.picked === i ? ' picked' : ''), () => { POE.picked = i; renderPOEStep(); }));
        });
        body.appendChild(opts);
      }
      body.appendChild(_btn('관찰하기 →', 'poe-primary', () => {
        if (ex.answer ? POE.numeric == null : POE.picked == null) { showToast('먼저 예측을 입력하세요', 'warn', 1400); return; }
        POE.step = 1; _applyVis(ex); renderPOEStep();
      }));
    } else if (POE.step === 1) {
      body.appendChild(_h('div', 'poe-q', ex.observe));
      body.appendChild(_h('div', 'poe-dim', '아래 ▶ 실행을 누르세요. 값을 바꾸고 ↺ 초기화 → 다시 실행하면 이전 실행이 점선으로 남습니다.'));
      if (ex.variants && ex.measure) body.appendChild(_variantTable(ex, 'observe'));
      body.appendChild(_btn('설명 보기 →', 'poe-primary', () => { POE.step = 2; _record(ex); renderPOEStep(); }));
    } else {
      const ok = isPOECorrect(ex);
      body.appendChild(_h('div', 'poe-verdict ' + (ok ? 'ok' : 'no'), ok ? '예측이 맞았습니다.' : '예측과 다릅니다.'));
      if (ex.answer) {
        const ans = _answerValue(ex);
        body.appendChild(_h('div', 'poe-answer', `시뮬레이션 값: ${_fmtV(Math.abs(ans), ex.answer.unit)}`));
        body.appendChild(_h('div', 'poe-yours', `내 예측: ${POE.numeric} ${ex.answer.unit || ''}`));
      } else {
        const ci = ex.options.findIndex(o => o.correct);
        body.appendChild(_h('div', 'poe-answer', '정답: ' + ex.options[ci].label));
        const picked = ex.options[POE.picked];
        if (!ok && picked) {
          body.appendChild(_h('div', 'poe-yours', '내가 고른 답: ' + picked.label));
          if (picked.tag) body.appendChild(_h('div', 'poe-tag', '고른 답에 담긴 생각: ' + picked.tag));
        }
      }
      if (ex.variants && ex.measure) body.appendChild(_variantTable(ex, 'result'));
      body.appendChild(_h('div', 'poe-explain', ex.explain));
      body.appendChild(_h('div', 'poe-dim', '다루는 오개념: ' + ex.misconception));
      const row = _h('div', 'poe-endbtns');
      row.appendChild(_btn('다시 풀기', 'poe-small', () => startPOE(ex)));
      const nx = _nextExample(ex);
      if (nx) row.appendChild(_btn('다음 예제 →', 'poe-small', () => startPOE(nx)));
      body.appendChild(row);
      body.appendChild(_btn('목록으로', 'poe-primary', () => { POE.cur = null; renderPOEList(); }));
    }
  }

  function _nextExample(ex) {
    const same = POE_EXAMPLES.filter(e => e.cat === ex.cat);
    const i = same.indexOf(ex);
    const done = new Set(POE.results.map(r => r.id));
    for (let k = 1; k <= same.length; k++) { const c = same[(i + k) % same.length]; if (c !== ex && !done.has(c.id)) return c; }
    return same.length > 1 ? same[(i + 1) % same.length] : null;
  }

  function _record(ex) {
    const ok = isPOECorrect(ex);
    const picked = ex.answer ? String(POE.numeric) : ((ex.options[POE.picked] || {}).label || '');
    const tag = !ok && !ex.answer && ex.options[POE.picked] ? (ex.options[POE.picked].tag || '') : '';
    POE.results.push({ id: ex.id, title: ex.title, pick: picked, correct: ok, tag, at: new Date().toISOString() });
    if (typeof EVENTS !== 'undefined') EVENTS.emit('poe:recorded', POE.results[POE.results.length - 1]);
  }

  function poeResultsCSV() {
    const lines = ['예제,분류,선택,정답여부,오개념태그,시각'];
    for (const r of POE.results) {
      const ex = POE_EXAMPLES.find(e => e.id === r.id) || {};
      const cat = (POE_CATS.find(c => c.id === ex.cat) || {}).label || '';
      lines.push([r.title, cat, r.pick, r.correct ? 'O' : 'X', r.tag, r.at].map(s => '"' + String(s).replace(/"/g, '""') + '"').join(','));
    }
    return lines.join('\n');
  }
  function exportPOECSV() {
    if (!POE.results.length) { showToast('기록된 결과가 없습니다', 'warn', 1400); return; }
    const blob = new Blob(['﻿' + poeResultsCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'poe_results.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  }
