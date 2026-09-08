/* ============================================================
   scenes.js — 장면 갤러리 (대표 상황 8개)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   각 항목은 scene.js 의 DSL(spec) 로 적는다. 시작 카드·갤러리·POE 가
   같은 목록을 쓴다. 좌표는 격자(0–99, y 아래로 증가), 1칸 = 1 m.

   좌표 규약 메모
     · 바닥면은 왼쪽→오른쪽으로 그리면 윗면이 실체면(물체가 얹히는 쪽)이다.
     · 벽은 위→아래로 그리면 오른쪽이 실체면.
     · 도르래는 2×2, 림 앵커는 중심에서 1칸. 물체 폭 1 이면 gridX 를 반칸(.5)에 둔다.
     · "천장" 은 짧은 바닥면 조각 — 실의 고정점으로만 쓴다. 앵커 's<d>' 는 시작점에서 d칸.
   ============================================================ */

  const SCENES = [
    {
      id: 'freefall', title: '자유낙하와 포물선', level: '기초', tag: '힘과 운동',
      desc: '같은 높이에서 하나는 놓고 하나는 옆으로 던집니다. 어느 쪽이 먼저 떨어질까요?',
      hint: '두 공의 궤적을 비교하세요. 가로 속도는 낙하 시간에 영향을 주지 않습니다.',
      spec: {
        floors: [{ key: 'F', x1: 34, y1: 60, x2: 72, y2: 60 }],
        elements: [
          { key: 'A', type: 'circle', gridX: 44, gridY: 44, mass: 1, e: 0.3, showTrail: true },
          { key: 'B', type: 'circle', gridX: 47, gridY: 44, mass: 1, vx0: 5, e: 0.3, showTrail: true },
        ],
        view: 'fit',
      },
    },
    {
      id: 'incline', title: '마찰 있는 빗면', level: '기초', tag: '마찰·빗면',
      desc: '경사각 약 27°, μ = 0.3 인 빗면 위 물체. 미끄러질까요, 멈춰 있을까요?',
      hint: 'tan 27° ≈ 0.5 > μ 이므로 미끄러집니다. 질량을 바꿔도 가속도는 같습니다.',
      spec: {
        floors: [
          { key: 'S', x1: 38, y1: 62, x2: 62, y2: 50, isFriction: true, muS: 0.3, muK: 0.25 },
          { key: 'G', x1: 26, y1: 62, x2: 38, y2: 62 },
        ],
        elements: [
          { key: 'A', type: 'rect', gridW: 1, gridH: 1, mass: 2, showTrail: true, onFloor: { floor: 'S', x: 56 } },
        ],
        view: 'fit',
      },
    },
    {
      id: 'atwood', title: '아트우드 기계', level: '기초', tag: '실·도르래',
      desc: '고정 도르래에 1 kg 과 1.5 kg 을 걸었습니다. 장력은 어느 무게에 가까울까요?',
      hint: 'a = g(m₂−m₁)/(m₁+m₂) ≈ 1.96 m/s². 장력은 두 무게 사이의 값입니다.',
      spec: {
        floors: [
          { key: 'C', x1: 47, y1: 37, x2: 53, y2: 37 },
          { key: 'F', x1: 40, y1: 62, x2: 60, y2: 62 },
        ],
        elements: [
          { key: 'P', type: 'pulley', gridX: 49, gridY: 40 },
          { key: 'A', type: 'rect', gridX: 48.5, gridY: 48, mass: 1,   showTrail: false },
          { key: 'B', type: 'rect', gridX: 50.5, gridY: 48, mass: 1.5, showTrail: false },
        ],
        ropes: [
          ['P', 'center', 'C', 's3'],
          ['A', 'top', 'P', 'left'],
          ['B', 'top', 'P', 'right'],
        ],
        view: 'fit',
      },
    },
    {
      id: 'movable-pulley', title: '움직도르래', level: '심화', tag: '실·도르래',
      desc: '1.5 kg 이 움직도르래에 걸린 2 kg 을 들어 올립니다. 왜 가벼운 쪽이 이길까요?',
      hint: '움직도르래는 힘을 절반으로 줄이고 거리를 두 배로 늘립니다. 두 물체의 속력을 비교하세요.',
      spec: {
        floors: [
          { key: 'C', x1: 44, y1: 37, x2: 56, y2: 37 },
          { key: 'F', x1: 40, y1: 64, x2: 60, y2: 64 },
        ],
        elements: [
          { key: 'P1', type: 'pulley', gridX: 49, gridY: 40 },
          { key: 'P2', type: 'pulley', gridX: 47, gridY: 50 },
          { key: 'L',  type: 'rect', gridX: 47.5, gridY: 54, mass: 2,   showTrail: false },
          { key: 'M',  type: 'rect', gridX: 50.5, gridY: 47, mass: 1.5, showTrail: false },
        ],
        ropes: [
          ['P1', 'center', 'C', 's6'],
          ['C', 's3', 'P2', 'left'],
          ['P2', 'right', 'P1', 'left'],
          ['P1', 'right', 'M', 'top'],
          ['P2', 'center', 'L', 'top'],
        ],
        view: 'fit',
      },
    },
    {
      id: 'spring', title: '용수철 진동', level: '기초', tag: '용수철',
      desc: '벽에 붙은 용수철(k = 10 N/m)에 1 kg 물체가 매달려 마찰 없는 바닥에서 진동합니다.',
      hint: '주기 T = 2π√(m/k) ≈ 1.99 s. 초기 속력을 바꿔도 주기는 변하지 않습니다.',
      spec: {
        floors: [
          { key: 'G', x1: 36, y1: 56, x2: 62, y2: 56 },
          { key: 'W', x1: 38, y1: 50, x2: 38, y2: 56 },
        ],
        elements: [
          { key: 'S', type: 'spring', gridX: 38, gridY: 55, gridW: 4, gridH: 1, k: 10, L0: 4, left: 'W', right: 'A' },
          { key: 'A', type: 'rect', gridX: 42, gridY: 55, mass: 1, vx0: -3, showTrail: false },
        ],
        view: 'fit',
      },
    },
    {
      id: 'pendulum', title: '진자', level: '기초', tag: '에너지',
      desc: '길이 8 m 인 실에 매달린 추를 45° 에서 놓습니다. 가장 낮은 곳에서 속력은?',
      hint: 'v = √(2gh) ≈ 6.8 m/s. 역학적 에너지가 보존되는지 그래프로 확인하세요.',
      spec: {
        floors: [{ key: 'C', x1: 44, y1: 38, x2: 56, y2: 38 }],
        elements: [
          { key: 'A', type: 'circle', gridX: 55.16, gridY: 43.16, mass: 1, showTrail: true },
        ],
        ropes: [['C', 's6', 'A', 'center']],
        view: 'fit',
      },
    },
    {
      id: 'collision', title: '같은 질량의 충돌', level: '기초', tag: '충돌·운동량',
      desc: '같은 질량의 공이 정지한 공에 4 m/s 로 부딪힙니다 (반발계수 1).',
      hint: '속도가 그대로 교환됩니다. 질량이나 반발계수를 바꿔 운동량 보존을 확인하세요.',
      spec: {
        floors: [{ key: 'F', x1: 34, y1: 60, x2: 72, y2: 60 }],
        elements: [
          { key: 'A', type: 'circle', gridX: 42, gridY: 59, mass: 1, vx0: 4, e: 1, showTrail: false },
          { key: 'B', type: 'circle', gridX: 52, gridY: 59, mass: 1, vx0: 0, e: 1, showTrail: false },
        ],
        view: 'fit',
      },
    },
    {
      id: 'forcezone', title: '힘 구간 통과', level: '심화', tag: '힘과 운동',
      desc: '3 m/s 로 미끄러지는 2 kg 물체가 −4 N 의 일정한 힘을 받는 구간에 들어갑니다.',
      hint: '구간 안에서만 감속합니다. v² = v₀² + 2as 로 어디서 멈추는지 예측해 보세요.',
      spec: {
        floors: [{ key: 'F', x1: 34, y1: 60, x2: 72, y2: 60 }],
        elements: [
          { key: 'Z', type: 'forceZone', gridX: 50, gridY: 56, gridW: 8, gridH: 4, fx: -4, fy: 0 },
          { key: 'A', type: 'rect', gridX: 40, gridY: 59, mass: 2, vx0: 3, showTrail: true },
        ],
        view: 'fit',
      },
    },
  ];

  /** id 로 장면 찾기 */
  function findScene(id) { return SCENES.find(s => s.id === id) || null; }

  /**
   * 갤러리 장면 불러오기 → { ids } (없으면 null)
   *   실행 중이면 멈추고 편집 모드로 돌아간다.
   */
  function loadScene(id, opts) {
    const sc = findScene(id);
    if (!sc) return null;
    const r = buildSceneFromSpec(sc.spec, opts);
    STATE.currentSceneId = id;
    if (typeof EVENTS !== 'undefined') EVENTS.emit('scene:loaded', sc);
    return r;
  }
