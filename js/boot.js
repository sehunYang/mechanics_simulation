/* ============================================================
   boot.js — 모바일 사이드바 토글 + load 부트스트랩
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [BOOT] — 앱 시작
  ================================================================ */

  /* 모바일 사이드바 토글 (햄버거 오버레이) — 신규 핸들러는 햄버거/오버레이/팔레트에만 바인딩 */
  (function initSidebarToggle() {
    const hamburger = document.getElementById('hamburger-btn');
    const overlay   = document.getElementById('sidebar-overlay');
    const sidebar   = document.getElementById('sidebar-left');
    if (!hamburger || !overlay || !sidebar) return;
    const open  = () => { sidebar.classList.add('mobile-open');    overlay.classList.add('visible'); };
    const close = () => { sidebar.classList.remove('mobile-open'); overlay.classList.remove('visible'); };
    hamburger.addEventListener('click', () => {
      if (sidebar.classList.contains('mobile-open')) close(); else open();
    });
    overlay.addEventListener('click', close);
    // 모바일 편의: 팔레트 아이템을 누르면 사이드바 자동 닫기 (데스크톱에선 overlay 미표시라 무해)
    sidebar.querySelectorAll('.palette-item').forEach(it => it.addEventListener('click', close));
  })();

  // DOMContentLoaded 이후 초기화
  window.addEventListener('load', () => {
    initCanvas();
    // 떠있는 pill로의 재배치로 캔버스 래퍼 크기가 확정된 뒤 한 번 더 맞춤 (필수 안전장치)
    requestAnimationFrame(fitCanvas);
    validateAll();
    initHistory();   // 최초 씬 상태를 실행취소 베이스로 기록
  });

  