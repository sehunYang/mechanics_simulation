# 고전역학 시뮬레이터

캔버스 기반 2D 고전역학 시뮬레이터 (중력·충돌·마찰·실/도르래·용수철). 빌드 도구·의존성 없음 — `index.html`을 브라우저로 열면 바로 실행됩니다.

## 디렉토리 구조

```
mechanics_simulation/
├── index.html          진입점 (마크업 + CSS/JS 링크만)
├── css/
│   └── main.css        전체 스타일 (디자인 토큰 + 레이아웃 + 컴포넌트)
├── js/                 로드 순서 = 아래 순서 (index.html 하단에서 순차 로드)
│   ├── config.js       CONFIG / VIEWPORT / STATE / DOM 참조 (전역 상수·상태)
│   ├── coords.js       좌표 변환 유틸 (월드/화면/물리/격자) + 기하 헬퍼
│   ├── canvas.js       캔버스 초기화·리사이즈 + 격자 렌더링
│   ├── render.js       rAF 렌더 루프 + 씬/요소/오버레이 드로잉
│   ├── elements.js     Element 기반 클래스 + 요소/Connection 클래스
│   ├── hit-test.js     5종 히트 테스트 (요소/바닥/실/격자점/앵커)
│   ├── interaction.js  포인터 이벤트 (줌·팬·드래그·선택·리와이어)
│   ├── ui-controls.js  팔레트/하단 버튼 + addElement + 시뮬 제어
│   ├── physics.js      시뮬레이션 스텝·중력·충돌·실/도르래/용수철·검증
│   ├── capture.js      PNG 선화 캡처
│   ├── panel.js        속성 패널 렌더링 + 선택 삭제
│   └── boot.js         모바일 사이드바 토글 + load 부트스트랩
├── backup/
│   └── mechanics_simulation_2026-07-05.html   분리 전 단일 파일 원본(백업)
├── QC_Report_v1.md     품질 점검 보고서 + 수정 내역
└── README.md
```

## 아키텍처 노트 (⚠️ 유지보수 시 필독)

- **클래식 스크립트, 단일 전역 스코프**: `js/*.js`는 ES 모듈이 아니라 일반 `<script>`로
  로드됩니다. 각 파일의 최상위 `const`/`class`/`function`은 **모든 파일이 공유하는
  하나의 전역 스코프**에 들어갑니다. 즉 `config.js`의 `STATE`를 `physics.js`에서
  `import` 없이 바로 씁니다. 이는 원본 단일 파일의 동작을 **바이트 단위로 보존**하기
  위한 선택입니다 (분리 시 물리 코드는 한 글자도 바뀌지 않았고, QC 회귀 테스트로 확인).
- **로드 순서가 곧 의존성 순서**입니다. `index.html`의 `<script>` 나열 순서를 지키세요.
  특히 `config.js`(DOM 참조·전역 상수)가 가장 먼저, 이벤트 리스너를 바인딩하는
  `ui-controls.js`/`boot.js`는 그 참조들이 정의된 뒤에 와야 합니다.
- **스크립트는 `<body>` 끝**에 위치 — DOM 요소(`getElementById`)가 이미 존재하므로
  `config.js`의 최상위 DOM 참조가 안전하게 동작합니다.
- **새 파일 추가 시**: `js/`에 파일을 만들고 `index.html`의 알맞은 위치에
  `<script src>` 한 줄을 추가하세요 (import/export 불필요).
- **ES 모듈로의 전환**을 원한다면 모든 전역 심볼에 `export`/`import`를 달아야 하며,
  이는 큰 리팩터링입니다. 현재 구조는 그 전 단계로서 관심사 분리만 달성한 상태입니다.

## 실행

`index.html`을 브라우저에서 직접 엽니다. 서버 불필요 (`file://`로 동작).

## 좌표계 요약

- **격자(grid)**: 0–99 정수 인덱스. 요소의 편집상 위치(`gridX`, `gridY`).
- **월드(world) 픽셀**: 렌더링 좌표 (`cellSize` 배율).
- **물리(phys) 미터**: 시뮬레이션 좌표. y축이 위로 증가(수학 관례), 화면과 반대.
- 변환 함수는 모두 `coords.js`에 있음 (`physToWorld`, `worldToPhys`, `worldToScreen` 등).
