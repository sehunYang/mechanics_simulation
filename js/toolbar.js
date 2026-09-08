/* ============================================================
   toolbar.js — 왼쪽 아래 툴바의 표시 토글 (벡터 · 힘 · 라벨 · 그래프)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   버튼 → STATE.show* 플래그. 렌더는 매 프레임 플래그를 읽으므로 따로
   다시 그릴 필요가 없다. 공유 링크·촬영에는 라벨 토글만 영향을 준다
   (라벨을 끄면 값이 빠진 "빈 문항 그림" 이 된다).
   ============================================================ */

  function _tbToggle(id, prop, onChange) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const sync = () => btn.classList.toggle('active', !!STATE[prop]);
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      STATE[prop] = !STATE[prop];
      sync();
      if (onChange) onChange(STATE[prop]);
      if (typeof EVENTS !== 'undefined') EVENTS.emit('view:toggle', { prop, on: STATE[prop] });
    });
    sync();
  }

  function initToolbar() {
    _tbToggle('tb-vectors', 'showVectors');
    _tbToggle('tb-forces',  'showForces', (on) => {
      if (on && STATE.simMode === 'EDIT' && typeof showToast === 'function')
        showToast('자유물체도: 실행하면 수직항력·마찰력·장력이 함께 그려집니다', 'ok', 2600);
    });
    _tbToggle('tb-labels',  'showLabels');
    const g = document.getElementById('tb-graph');
    if (g) {
      g.addEventListener('pointerdown', e => e.stopPropagation());
      g.addEventListener('click', (e) => { e.stopPropagation(); if (typeof toggleGraph === 'function') toggleGraph(); });
    }
  }
