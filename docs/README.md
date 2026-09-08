# 문서 (docs)

앱을 **쓰는** 방법은 저장소 루트의 [README.md](../README.md) 에 있습니다. 이 폴더에는 그 외의
모든 문서 — 코드 구조, 설계 근거, 검증·품질 기록 — 를 종류별로 모아 둡니다.

| 폴더 | 무엇을 넣나 | 파일명 규칙 |
|---|---|---|
| `docs/` (루트) | 코드 구조와 설계 의도 | `ARCHITECTURE.md` 하나 |
| `design/` | 설계 결정과 그 근거 — 조사·비교·평가 | 주제를 kebab-case 로 (`suneung-drawing-convention.md`) |
| `reports/` | 한 시점의 점검·검증 결과 (이후 코드가 바뀌어도 고치지 않는 기록) | 날짜 접두어 `YYYY-MM-DD-주제.md` |
| `archive/` | 더 이상 쓰지 않지만 참고용으로 남기는 파일 | 원래 이름 + 날짜 |
| `images/` | README 스크린샷 | `NN-이름.png` — `node test/browser/run.js --shots` 가 다시 만든다 |

---

## 구조

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — 빌드 없는 정적 웹앱의 로드 순서, `STATE` 와 이벤트 버스,
  물리 엔진(고정 dt·서브스텝·단면 바닥·실/도르래 제약·자유물체도 분해·클로소이드 이음), 검증 스위트 구성.
  코드를 고치기 전에 읽는 문서.

## 설계 근거 (`design/`)

| 문서 | 요약 | 시점 |
|---|---|---|
| [suneung-drawing-convention.md](design/suneung-drawing-convention.md) | 2022~2026학년도 수능 물리학Ⅰ·Ⅱ 역학 문항 그림의 작도 관례를 조사해 정리하고, 시뮬레이터 요소(물체·바닥면·실·도르래·용수철·힘 화살표·서체)를 그 규격으로 바꾼 근거. 📷 촬영(SVG 내보내기)의 규격 문서. | 2026-07-31 |
| [circuit-port-analysis.md](design/circuit-port-analysis.md) | 형제 프로젝트 [circuit_simulation](https://github.com/sehunYang/circuit_simulation) 의 구조·기능을 분석해 역학 앱에 무엇을 어떤 형태로 옮길지 4단계 로드맵으로 정리. 갤러리·POE·스윕·헤드리스 측정·교사용 README 가 여기서 나왔다. 구현 현황 주석 포함. | 2026-09-08 |
| [persona-rubric-evaluation.md](design/persona-rubric-evaluation.md) | 네 사용자 유형(흥미 위주 · 학습 보조 · 개념 점검 · 심화 탐구)에 대고 루브릭으로 채점한 유용성 진단. 로드맵이 놓친 보정 항목(느린 배속, 자유물체도, 실행 겹쳐 보기, 수치 예측형 문항, 파라미터 스윕 등)의 출처. | 2026-09-08 |

## 검증·품질 기록 (`reports/`)

| 문서 | 요약 | 시점 |
|---|---|---|
| [2026-07-05-qc-v1.md](reports/2026-07-05-qc-v1.md) | 단일 파일 시절의 첫 QC — 문법 검사, 헤드리스 Chrome 자동화 14종, 물리 로직 정적 리뷰. 질량 0 → NaN, 사각형–원호 관통 결함 발견. | 2026-07-05 |
| [2026-07-05-qc-v2.md](reports/2026-07-05-qc-v2.md) | 사용자 수동 QC 목록 — 숫자 키패드, 롱프레스 지연, ELBOW 경계 사라짐, 배속 버튼 등 개선 요청. | 2026-07-05 |
| [2026-07-31-physics-verification.md](reports/2026-07-31-physics-verification.md) | 역학 요소 조합을 대표 케이스로 뽑아 닫힌형 공식과 수치 비교한 검증 보고서(당시 155항목). 수정 전 코드에서 18건이 실패함을 보여 스위트가 결함을 실제로 잡는다는 근거. 현재 스위트 규모는 [ARCHITECTURE.md](ARCHITECTURE.md) 의 "검증" 절 참고. | 2026-07-31 |

> 보고서는 작성 시점의 기록입니다. 수치(검증 항목 수 등)는 그 뒤 늘었을 수 있으니 현재 값은
> `node test/run-all.js` 출력과 README 배지를 보세요.

## 보관 (`archive/`)

| 파일 | 설명 |
|---|---|
| [mechanics_simulation_2026-07-05_single-file.html](archive/mechanics_simulation_2026-07-05_single-file.html) | css/js 모듈로 나누기 전의 단일 HTML 파일 버전. 열면 그대로 실행되지만 이후 수정은 반영되지 않는다. |
