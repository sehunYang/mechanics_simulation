/* ============================================================
   guide.js — 처음 쓰는 사람을 위한 안내 계층
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   물리와 무관하게 "화면에 무엇을 띄울지"만 정한다.
     1) 시작 카드 (#start-guide)  장면이 비었을 때만 — 한 줄 안내 + 장면 갤러리.
     2) 장면 갤러리 (#gallery-panel) 툴바 📚 — 언제든 대표 상황을 불러온다.
     3) 상태 알림 (#status-chip)  validateAll 경고 → "무엇이 문제고 어떻게 고치는지".
     4) 도움말 (#help-panel)      조작·모드·단축키 한 장.
     5) 토스트 (#toast)           showToast(msg, kind, ms) — 어느 모듈에서나.
   ============================================================ */

  /* ── 경고 문구 → 고치는 방법 ── (문구는 validateAll 의 계약이라 여기서 덧붙인다) */
  const GUIDE_FIX = {
    '용수철이 아무것에도 붙어 있지 않습니다': '용수철 끝에 물체나 벽(바닥면)을 맞닿게 놓으세요. 한쪽만 붙이면 반대쪽은 고정 핀이 됩니다.',
    '실이 걸리지 않은 도르래가 있습니다':     '팔레트의 "실"을 고른 뒤 도르래 가장자리(●)와 물체를 차례로 클릭하세요. 고정하려면 중심(center)을 바닥면과 이으세요.',
    '실이 연결되지 않은 외력이 있습니다':     '"실"로 외력과 물체를 이으세요. 실 방향으로 힘이 작용합니다.',
    '물체가 서로 겹쳐 있습니다':               '겹친 물체는 실행 순간 서로 튕겨 나갑니다. 한쪽을 옆으로 옮기세요.',
    '연결 대상이 없는 실이 있습니다':           '실을 선택해 삭제하거나 끝점 핸들을 끌어 다른 앵커에 다시 연결하세요.',
    '움직일 물체가 없습니다':                   '팔레트에서 네모나 원을 추가하세요.',
    '도르래가 어디에도 고정되지 않았습니다':   '도르래 중심(center)을 실로 바닥면(천장)과 이으면 고정 도르래, 그대로 두면 움직도르래입니다.',
  };

  let _guideDismissed = false;

  /* ── 토스트 ── */
  let _toastTimer = null;
  function showToast(msg, kind, ms) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'visible ' + (kind || 'warn');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.classList.remove('visible'); }, ms || 2600);
  }

  /* ── 상태 알림 ── */
  function renderStatusChip(warnings) {
    const chip = document.getElementById('status-chip');
    if (!chip) return;
    const list = Array.isArray(warnings) ? warnings : (STATE.warnings || []);
    if (!list.length || STATE.simMode !== 'EDIT') { chip.classList.remove('visible'); return; }
    const msg = list[0];
    const hint = GUIDE_FIX[msg] || '';
    chip.innerHTML = '';
    const m = document.createElement('div'); m.className = 'chip-msg';
    m.textContent = '⚠ ' + msg + (list.length > 1 ? `  (+${list.length - 1})` : '');
    chip.appendChild(m);
    if (hint) { const h = document.createElement('div'); h.className = 'chip-hint'; h.textContent = hint; chip.appendChild(h); }
    const x = document.createElement('span'); x.className = 'chip-x'; x.textContent = '✕'; x.title = '닫기';
    x.addEventListener('click', (e) => { e.stopPropagation(); chip.classList.remove('visible'); });
    chip.appendChild(x);
    chip.classList.add('visible');
  }

  /* ── 시작 카드 ── */
  function _sceneEmpty() {
    return STATE.elements.length === 0 && STATE.floorSegments.length === 0 && STATE.ropes.length === 0;
  }
  function refreshStartGuide() {
    const card = document.getElementById('start-guide');
    if (!card) return;
    const show = _sceneEmpty() && !_guideDismissed && STATE.simMode === 'EDIT';
    card.classList.toggle('visible', show);
    if (!_sceneEmpty()) _guideDismissed = false;   // 다시 비면 카드를 되살린다
    const lead = card.querySelector('.sg-lead');
    if (lead) {
      const mob = window.innerWidth <= 480;
      lead.innerHTML = mob
        ? '왼쪽 위 <b>☰</b> 에서 물체·바닥면·실을 꺼내 놓고 <b>▶ 실행</b>을 누르세요. 아래 예제를 누르면 바로 만들어집니다.'
        : '왼쪽 팔레트에서 물체를 놓고, <b>바닥면</b>은 격자점 두 곳을 클릭해 그립니다. <b>▶ 실행</b>으로 움직여 보세요. 아래 예제를 누르면 바로 만들어집니다.';
    }
  }

  /* ── 장면 갤러리 그리기 (시작 카드·갤러리 패널 공용) ── */
  function renderGallery(container, opts) {
    if (!container) return;
    opts = opts || {};
    container.innerHTML = '';
    for (const sc of SCENES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gal-item' + (STATE.currentSceneId === sc.id ? ' current' : '');
      b.title = sc.desc;
      const t = document.createElement('div'); t.className = 'gal-title'; t.textContent = sc.title;
      const lv = document.createElement('span'); lv.className = 'gal-lv'; lv.textContent = sc.level;
      const tag = document.createElement('div'); tag.className = 'gal-tag'; tag.textContent = sc.tag;
      t.appendChild(lv);
      b.appendChild(t); b.appendChild(tag);
      if (opts.desc) { const d = document.createElement('div'); d.className = 'gal-desc'; d.textContent = sc.desc; b.appendChild(d); }
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        _openSceneWithConfirm(sc.id);
      });
      container.appendChild(b);
    }
  }

  function _openSceneWithConfirm(id) {
    const go = () => {
      loadScene(id);
      _closeGallery();
      const sc = findScene(id);
      if (sc) showToast(sc.title + ' — ' + sc.hint, 'ok', 4200);
    };
    if (_sceneEmpty() || STATE.currentSceneId) { go(); return; }
    openConfirmDialog({
      message: '지금 장면을 지우고 예제를 불러올까요?\n(되돌리려면 불러온 뒤 Ctrl+Z)',
      confirmLabel: '불러오기', cancelLabel: '취소',
      onConfirm: go,
    });
  }

  /* ── 갤러리 패널 ── */
  function toggleGallery(force) {
    const p = document.getElementById('gallery-panel');
    if (!p) return;
    const on = force == null ? !p.classList.contains('visible') : !!force;
    if (on) { renderGallery(p.querySelector('.gal-grid'), { desc: true }); _closeHelp(); }
    p.classList.toggle('visible', on);
  }
  function _closeGallery() { const p = document.getElementById('gallery-panel'); if (p) p.classList.remove('visible'); }

  /* ── 도움말 ── */
  function toggleHelp(force) {
    const h = document.getElementById('help-panel');
    if (!h) return;
    const on = force == null ? !h.classList.contains('visible') : !!force;
    if (on) _closeGallery();
    h.classList.toggle('visible', on);
  }
  function _closeHelp() { const h = document.getElementById('help-panel'); if (h) h.classList.remove('visible'); }

  /* ── 배선 ── */
  function _bindClick(id, fn) {
    const e = document.getElementById(id);
    if (!e) return;
    e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    e.addEventListener('click', (ev) => { ev.stopPropagation(); fn(ev); });
  }

  function initGuide() {
    _bindClick('sg-close',   () => { _guideDismissed = true; refreshStartGuide(); });
    _bindClick('sg-help',    () => toggleHelp(true));
    _bindClick('help-close-btn',    () => toggleHelp(false));
    _bindClick('gallery-close-btn', () => toggleGallery(false));
    _bindClick('tb-help',    () => toggleHelp());
    _bindClick('tb-gallery', () => toggleGallery());
    _bindClick('tb-share',   () => {
      if (_sceneEmpty()) { showToast('공유할 장면이 없습니다', 'warn', 1500); return; }
      copySceneLink();
    });
    _bindClick('tb-csv',     () => exportSeriesCSV());

    renderGallery(document.getElementById('sg-gallery'));

    // 패널·카드 위의 포인터가 캔버스로 새지 않게
    for (const id of ['start-guide', 'help-panel', 'gallery-panel', 'status-chip', 'tool-bar']) {
      const el = document.getElementById(id);
      if (el) for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    }

    EVENTS.on('validated', (w) => { renderStatusChip(w); refreshStartGuide(); });
    EVENTS.on('scene:changed', () => { refreshStartGuide(); renderGallery(document.getElementById('sg-gallery')); });
    EVENTS.on('scene:loaded', () => { renderGallery(document.getElementById('sg-gallery')); });
    for (const ev of ['sim:start', 'sim:stop', 'sim:pause', 'sim:resume']) {
      EVENTS.on(ev, () => { refreshStartGuide(); renderStatusChip(); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { _closeHelp(); _closeGallery(); }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) toggleHelp();
    });
    refreshStartGuide();
    renderStatusChip();
  }
