# 아키텍처 (Architecture)

> 이 문서는 **코드를 고치려는 사람**을 위한 것입니다.
> 수업에서 쓰는 방법은 [README.md](README.md) 를 보세요.

빌드 도구·패키지 매니저·트랜스파일러가 없는 **순수 정적 웹앱**입니다.
`index.html` 이 CSS·JS 를 순서대로 불러오고, 모든 JS 는 **클래식 스크립트 하나의
전역 스코프**를 공유합니다 (`import/export` 없음). 로드 순서가 곧 의존 순서입니다.

---

## 개발용 실행

```bash
python -m http.server 8123      # → http://localhost:8123
```

`index.html` 을 더블클릭해 `file://` 로 열어도 동작합니다. 외부 의존성은 없습니다
(CDN 도 없음). 공유 링크·CSV 저장은 `http(s)` 에서 가장 잘 동작합니다.

## 검증

```bash
node test/run-all.js            # Node vm — 물리·모듈 수치 검증 (14 스위트, 219 항목)
node test/run-all.js --verbose

npm i --no-save puppeteer-core  # 1회
python -m http.server 8123      # 다른 터미널
node test/browser/run.js        # 헤드리스 Chrome — 화면에 보이는 값 41 항목
node test/browser/run.js --shots   # + docs/images 스크린샷 갱신
```

- `test/harness.js` — `config → coords → elements → physics` 를 **수정 없이** vm 에 올리고 DOM 만 스텁. 물리 공식(닫힌형)과 대조.
- `test/dom-harness.js` — `index.html` 의 `<script>` 순서대로 전체 JS 를 올리고, 등록된 실제 이벤트 핸들러에 합성 포인터 입력을 흘린다. 1~3단계 기능(spec11~13)은 이 하네스 위에서 검증한다.
- `test/browser/` — puppeteer-core. 속성 패널 텍스트, 툴바 토글, 패널 표시, 공유 링크를 **새 탭에서 URL 로 열어** 왕복, 모바일 뷰포트.

물리나 입력 처리를 손볼 때는 `run-all` 을, 렌더·패널·UI 를 손볼 때는 `browser/run` 도 함께 돌리세요.
기대값은 항상 시뮬레이터와 무관한 닫힌형 공식으로 적습니다 (자기참조 검증 금지).

---

## 디렉토리 구조

```
mechanics_simulation/
├── index.html                 마크업 + 로드 순서 (로직 없음). ?v= 캐시 버스터
├── css/                       링크 순서 = 캐스케이드 순서, responsive 가 마지막
│   ├── tokens.css             디자인 토큰 — circuit_simulation 과 같은 이름 (+ 구 이름 별칭)
│   ├── base · sidebar · canvas · controls · panel · modal · overlays · responsive
├── js/                        로드 순서 = index.html 순서
│   ├── config.js              CONFIG / VIEWPORT / STATE / DOM 참조
│   ├── events.js              EVENTS — 경량 이벤트 버스 (on/off/emit)
│   ├── coords.js              좌표 변환 (격자·월드·물리·화면)
│   ├── svg-shapes.js          수능 작도 규격 도형 (SVG path → Path2D)
│   ├── canvas.js              캔버스 초기화·격자
│   ├── render.js              rAF 루프 + 씬 드로잉 (drawOverlays 호출)
│   ├── elements.js            요소 클래스 (RectBody · CircleBody · ForceZone · ExtForce · Pulley · Spring · FloorSegment · Rope)
│   ├── hit-test.js            히트 테스트
│   ├── interaction.js         포인터·키보드 (실행 중에는 선택만 허용)
│   ├── ui-controls.js         팔레트 · 하단 pill · 배속(0.25~100x) · 한 스텝
│   ├── physics.js             ★ 물리 엔진 + validateAll (편집 경고) + 자유물체도 분해
│   ├── series.js              시계열 기록 (t·x·y·v·a·KE·PE·E) · 잔상 · CSV
│   ├── overlay.js             속도·힘 벡터 · 잔상 궤적 오버레이
│   ├── capture.js             SVG 촬영 (라벨 토글 반영)
│   ├── modal.js               숫자 키패드 · 확인 대화상자
│   ├── measure.js             측정값 행 (패널 하단, 실행 중 갱신)
│   ├── panel.js               속성 패널
│   ├── history.js             실행취소/다시실행
│   ├── scene.js               장면 직렬화·복원 · 선언적 DSL · 뷰 맞춤
│   ├── scenes.js              갤러리 장면 8개 (DSL)
│   ├── share.js               공유 링크 (#s=…, delta 인코딩)
│   ├── headless.js            화면 없이 장면을 돌려 측정 (POE·스윕)
│   ├── poe-data.js            POE 문항 24 · 해설 8 · 탐구 카드 10
│   ├── poe.js                 POE 엔진 (예측→관찰→설명, CSV)
│   ├── sweep.js               파라미터 스윕 (표·그래프·CSV·프리셋)
│   ├── graph.js               시간 그래프 패널
│   ├── toolbar.js             표시 토글 (속도·힘·라벨·그래프)
│   ├── guide.js               시작 카드 · 갤러리 · 상태 알림 · 도움말 · 토스트
│   └── boot.js                부트스트랩 (init 순서 · 공유 링크 복원)
├── test/                      위 "검증" 참고
├── docs/images/               README 스크린샷 (browser/run.js --shots 가 생성)
├── Circuit_Port_Analysis.md   형제 앱(circuit_simulation)에서 이식한 항목 분석
├── Persona_Rubric_Evaluation.md  네 페르소나 루브릭 평가 · 로드맵 보정
├── Design_Suneung_Comparison.md  수능 작도 규격 대조
└── Physics_Verification_Report.md · QC_Report_v1/v2.md   물리 검증·품질 기록
```

---

## 상태와 이벤트

`STATE` (config.js) 가 유일한 진실 공급원입니다. 장면 = `elements` + `floorSegments` + `ropes` + `gravityOn`.

```
편집 입력 (interaction · panel · ui-controls)
   │  STATE 변경 → validateAll()
   ▼
'validated' (경고 배열) ──► guide.renderStatusChip · refreshStartGuide
장면 로드 loadSceneData() ──► 'scene:changed' {source:'load'} ──► series.clearSeries/clearGhost · guide · sweep
실행 startSimulation ──► 'sim:start' ──► graph 자동 열기 (넓은 화면)  … 'sim:pause' | 'sim:resume' | 'sim:stop'
매 스텝 simStep ──► recordSeries ──► 'series:sample' ──► graph 재그리기(rAF)
                └──► 'sim:step' ──► measure.refreshMeasureSection (4 스텝마다)
```

이벤트 이름과 payload 규약은 `events.js` 머리말에 있습니다. 새 모듈은 STATE 를 직접
폴링하지 말고 이 이벤트에 붙이세요. 물리 코드(physics.js)는 `typeof X === 'function'`
가드로 상위 모듈을 부르므로 Node 하네스(물리만 로드)에서도 그대로 돕니다.

## 물리 엔진 요약 (physics.js)

- 고정 dt 1/60 s, 서브스텝 4. 순서: 힘 적용 → 반음적 오일러 적분 → 외력 앵커 추종 → 바닥 충돌 → 물체 충돌 → 실 제약 → 에너지 투영.
- 바닥면은 **단면**(그린 방향의 왼쪽이 실체면). 원·사각형 각각 최심 침투 1건만 보정.
- 실·도르래: 무질량 중계점. 고정 도르래는 Atwood 합제약, 움직도르래 네트워크는 국소 KKT 선형해.
- 에너지 투영: 실 제약은 무일이므로 서브스텝 전후 에너지 차(이산화 오차)를 속도 배율로 되돌린다.
- **자유물체도(computeFreeBodyDiagrams)**: 한 스텝의 실제 가속도 a = Δv/dt 에서 알려진 힘(중력·힘구간·외력·공기저항·용수철)을 뺀 잔차 R 을 장력 → 접촉(수직항력·마찰) → 기타 순으로 탐욕 분해한다. 결과 `el._fbd` 를 overlay·measure·headless 가 읽는다. 검증: 아트우드 T = 2m₁m₂g/(m₁+m₂), 빗면 N = mg cos θ, 정지 마찰 = mg sin θ 를 0.5 % 안에서 재현 (spec12).
- 공기저항: `el.drag` (b, N·s/m) 가 0 보다 크면 F = −b·v. 종단속도 mg/b.

## 장면 DSL (scene.js)

```js
buildSceneFromSpec({
  floors:   [{ key:'S', x1,y1,x2,y2, isFriction, muS, muK, pathType, curvature }],
  elements: [{ key:'A', type:'rect', gridX, gridY, mass, vx0, ..., onFloor:{ floor:'S', x:56 }, left:'W', right:'A' }],
  ropes:    [['A','top','P','left']],
  view:     'fit' | { cx, cy, scale },
})
```

`key` 는 장면 안의 이름이고 요소에 `_key` 로 남아 POE 의 `set`·`measure`, 스윕 프리셋이 참조합니다.
`onFloor` 는 LINE 바닥면 위 x 지점에 물체를 실체면 쪽으로 얹고 기울기 회전까지 맞춥니다.
좌표 규약: 바닥면은 왼쪽→오른읁으로 그리면 윗면이 실체면, 벽은 위→아래로 그리면 오른쪽이 실체면.

## 헤드리스 측정 (headless.js)

회로 앱은 정상상태 해가 있어 solve() 한 번으로 관찰값을 얻지만 역학은 시간 진화입니다.
`measureScene(sceneData, { body, q, at | when:'floor'|'stop', stat:'final'|'max'|'min'|'time'|'dist' })` 는
현재 STATE 를 잠시 떼어 두고 대상 장면을 올려 돌린 뒤 되돌립니다. `HEADLESS.active` 가 켜진 동안
simStep 은 궤적·시계열·이벤트를 건너뜁니다. POE 의 수치 정답·비교표와 스윕이 이 경로를 씁니다.

## POE (poe.js · poe-data.js)

문항 = `{ scene(갤러리 id | DSL), set, question, options[{label,correct,tag}] | answer{measure,tol}, observe, vis, select, variants, measure, explain, misconception }`.
선택지는 문항 id 시드의 결정적 셔플. 수치 정답은 `measureScene` 으로 그 자리에서 계산해 엔진과 늘 일치합니다.
`spec13` 이 24문항 전부의 장면 로드·필드·정답 유일성과 핵심 문항 7개의 정답–시뮬 정합을 검사합니다.

## 공유 링크 (share.js)

요소·바닥면을 기본 인스턴스와 다른 필드만(delta) 남긴 JSON → base64url → `#s=…`. id 는 번호로 바꾸고
복원 때 새로 발급합니다(실 앵커·용수철 양끝이 번호를 가리킴). 필드가 늘어도 링크는 짧게 유지됩니다.

## 코딩 컨벤션

- 클래식 스크립트, 전역 스코프 공유. 새 파일은 `index.html` 의 알맞은 자리에 `<script src="…?v=…">` 한 줄.
- 물리 코드가 UI 를 부를 때는 `typeof fn === 'function'` 가드 (Node 하네스 호환).
- 주석은 한국어. 모듈 머리말에 설계 의도·규약·주의를 적는다.
- 새 CSS 는 `responsive.css` 앞에. 토큰 이름은 `tokens.css` 의 circuit 규약을 따른다.
- 배포 전 `index.html` 의 `?v=` 날짜를 올린다 (GitHub Pages 캐시).
