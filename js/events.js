/* ============================================================
   events.js — 경량 이벤트 버스 (옵저버 패턴)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   모듈 사이의 직접 호출을 줄이기 위한 최소 장치. on/off/emit 만 있다.
   emit 은 핸들러 배열을 복사한 뒤 순회하므로 콜백 안에서 on/off 를
   불러도 안전하다. 핸들러 하나가 던진 예외가 다른 핸들러를 막지 않도록
   개별로 잡아 콘솔에만 남긴다 (UI 계층의 실수가 물리 루프를 멈추지 않게).

   쓰는 이벤트 이름 (규약):
     'scene:changed'   편집으로 장면이 바뀜 (요소 추가·이동·삭제·값 변경)
     'validated'       validateAll() 이 끝남 — payload: 경고 배열
     'sim:start' | 'sim:pause' | 'sim:resume' | 'sim:stop'
     'sim:step'        simStep 한 번 끝남 — payload: dt
     'view:changed'    뷰포트(줌·팬) 변경
     'selection'       선택 대상 변경 — payload: 선택 객체 | null
   ============================================================ */

  const EVENTS = (() => {
    const map = new Map();
    return {
      on(name, fn) {
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(fn);
        return () => EVENTS.off(name, fn);
      },
      off(name, fn) {
        const list = map.get(name);
        if (!list) return;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      emit(name, payload) {
        const list = map.get(name);
        if (!list || list.length === 0) return;
        for (const fn of list.slice()) {
          try { fn(payload); }
          catch (err) { console.error(`[EVENTS] '${name}' 핸들러 오류:`, err); }
        }
      },
      /** 테스트·디버그용: 등록된 핸들러 수 */
      count(name) { return (map.get(name) || []).length; },
    };
  })();
