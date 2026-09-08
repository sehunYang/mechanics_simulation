/* ============================================================
   share.js — 장면 저장·공유 (URL 해시)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   서버 없이 링크만으로 장면을 나눈다: 장면 데이터를 "기본값과 다른 필드만"
   남긴 짧은 JSON 으로 만들고 base64url 로 감싸 `#s=…` 에 싣는다.
   페이지를 열 때 해시가 있으면 복원한다.

   · 요소·바닥면의 id 는 번호로 바꿔 싣고 복원 때 새 id 를 만든다.
     (실의 앵커, 용수철의 양끝이 이 번호를 가리킨다)
   · 기본값과 같은 필드는 빼므로(delta) 필드가 늘어나도 링크는 짧다.

   encodeScene(data?) → 문자열,  decodeScene(str) → data | null
   sceneShareURL() → 현재 장면의 공유 URL,  copySceneLink() → 클립보드 + 토스트
   applySceneFromHash() → 해시가 있으면 복원 (boot 에서 호출)
   ============================================================ */

  const SHARE_VERSION = 1;

  /* 기본 인스턴스 캐시 (delta 기준) */
  const _shareDefaults = {};
  function _defaultsOf(type) {
    if (!_shareDefaults[type]) {
      let inst = null;
      if (type === 'floorSegment') inst = new FloorSegment(0, 0, 1, 0);
      else inst = makeElementFromData({ type });
      _shareDefaults[type] = inst ? inst.serialize() : {};
    }
    return _shareDefaults[type];
  }

  function _round(v) {
    if (typeof v !== 'number') return v;
    return Math.round(v * 1e4) / 1e4;
  }
  function _sameVal(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /** 객체에서 기본값과 다른 필드만 (id·런타임 제외, 숫자는 반올림) */
  function _delta(obj, type, skip) {
    const def = _defaultsOf(type);
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === 'id' || k === 'selected' || (skip && skip.has(k))) continue;
      if (k.startsWith('_') && k !== '_snapRotation' && k !== '_key') continue;
      const v = obj[k];
      if (v === null || v === undefined || typeof v === 'function') continue;
      if (k in def && _sameVal(def[k], v)) continue;
      out[k] = _round(v);
    }
    return out;
  }

  /** 장면 데이터 → 압축 문자열 */
  function encodeScene(data) {
    data = data || sceneToData();
    const idx = {};
    data.elements.forEach((e, i) => { idx[e.id] = i; });
    const base = data.elements.length;
    data.floorSegments.forEach((s, i) => { idx[s.id] = base + i; });

    const E = data.elements.map(e => {
      const d = _delta(e, e.type, new Set(['type', 'leftElementId', 'rightElementId', 'connectedRopeIds']));
      d.t = e.type;
      if (e.type === 'spring') {
        if (e.leftElementId  && idx[e.leftElementId]  != null) d.l = idx[e.leftElementId];
        if (e.rightElementId && idx[e.rightElementId] != null) d.r = idx[e.rightElementId];
      }
      return d;
    });
    const F = data.floorSegments.map(s => {
      const d = _delta(s, 'floorSegment', new Set(['type', 'x1', 'y1', 'x2', 'y2', 'isFixed']));
      d.p = [_round(s.x1), _round(s.y1), _round(s.x2), _round(s.y2)];
      return d;
    });
    const R = data.ropes
      .filter(r => idx[r.anchorA.elementId] != null && idx[r.anchorB.elementId] != null)
      .map(r => [idx[r.anchorA.elementId], r.anchorA.attachPoint, idx[r.anchorB.elementId], r.anchorB.attachPoint, _round(r.ropeLength)]);

    const payload = { v: SHARE_VERSION, e: E, f: F, r: R };
    if (data.g === false) payload.g = 0;
    return _b64u(JSON.stringify(payload));
  }

  /** 압축 문자열 → 장면 데이터 (실패 시 null) */
  function decodeScene(str) {
    let d;
    try { d = JSON.parse(_unb64u(str)); } catch (e) { return null; }
    if (!d || !Array.isArray(d.e)) return null;

    const elements = d.e.map(o => {
      const type = o.t;
      if (!_sceneElementClassExists(type)) return null;
      const def = _defaultsOf(type);
      const e = Object.assign({}, def);
      for (const k of Object.keys(o)) {
        if (k === 't' || k === 'l' || k === 'r') continue;
        e[k] = o[k];
      }
      e.type = type;
      e.id = makeId();
      e._l = o.l; e._r = o.r;
      return e;
    }).filter(Boolean);

    const floors = (d.f || []).map(o => {
      const def = _defaultsOf('floorSegment');
      const s = Object.assign({}, def);
      for (const k of Object.keys(o)) { if (k !== 'p') s[k] = o[k]; }
      const p = o.p || [0, 0, 1, 0];
      s.x1 = p[0]; s.y1 = p[1]; s.x2 = p[2]; s.y2 = p[3];
      s.type = 'floorSegment'; s.isFixed = true;
      s.id = makeId();
      return s;
    });

    const all = elements.concat(floors);
    const idOf = i => (all[i] ? all[i].id : null);

    for (const e of elements) {
      if (e.type === 'spring') {
        e.leftElementId  = e._l != null ? idOf(e._l) : null;
        e.rightElementId = e._r != null ? idOf(e._r) : null;
        e.leftLocked  = !!e.leftElementId;
        e.rightLocked = !!e.rightElementId;
      }
      delete e._l; delete e._r;
    }

    const ropes = (d.r || []).map(a => {
      const A = idOf(a[0]), B = idOf(a[2]);
      if (!A || !B) return null;
      return { id: makeId(), type: 'rope',
               anchorA: { elementId: A, attachPoint: a[1] },
               anchorB: { elementId: B, attachPoint: a[3] },
               ropeLength: a[4] != null ? a[4] : 1 };
    }).filter(Boolean);

    return { g: d.g !== 0, elements, floorSegments: floors, ropes };
  }
  function _sceneElementClassExists(type) {
    return ['rect', 'circle', 'forceZone', 'pulley', 'spring', 'extforce'].includes(type);
  }

  /** 현재 장면의 공유 URL */
  function sceneShareURL() {
    const base = (typeof location !== 'undefined' ? location.href : '').split('#')[0];
    return base + '#s=' + encodeScene();
  }

  /** 링크 복사 (클립보드 → 실패 시 prompt) + 주소창 갱신 */
  function copySceneLink() {
    const url = sceneShareURL();
    const done = () => { if (typeof showToast === 'function') showToast('공유 링크를 복사했습니다 — 붙여넣어 나누세요', 'ok', 2400); };
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => { if (typeof prompt === 'function') prompt('공유 링크', url); });
    } else if (typeof prompt === 'function') {
      prompt('공유 링크', url);
    }
    try { history.replaceState(null, '', url); } catch (e) { /* file:// 등 */ }
    return url;
  }

  /** 페이지 해시에 장면이 있으면 복원. 성공 시 true */
  function applySceneFromHash() {
    if (typeof location === 'undefined') return false;
    const m = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (!m) return false;
    const data = decodeScene(m[1]);
    if (!data) return false;
    loadSceneData(data, { history: true });
    if (typeof fitViewToScene === 'function') fitViewToScene();
    STATE.currentSceneId = null;
    return true;
  }

  /* ── base64url (UTF-8) ── */
  function _b64u(s) {
    const bytes = unescape(encodeURIComponent(s));
    const b = (typeof btoa === 'function') ? btoa(bytes) : Buffer.from(bytes, 'binary').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function _unb64u(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bytes = (typeof atob === 'function') ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    return decodeURIComponent(escape(bytes));
  }
