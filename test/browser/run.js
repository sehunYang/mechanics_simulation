/* ════════════════════════════════════════════════════════════════════
 * 브라우저 단계 검증 (헤드리스 Chrome) — 사용자에게 보이는 값
 *
 *   실행:  npm i --no-save puppeteer-core          (1회)
 *          python -m http.server 8123              (저장소 루트, 다른 터미널)
 *          node test/browser/run.js [--shots]      (--shots: docs/images 스크린샷 갱신)
 *
 *   node test/run-all.js 는 물리·모듈 수치를 Node vm 에서 검증한다. 이 파일은
 *   실제 페이지를 띄워 **화면에 보이는 것**을 본다 — 속성 패널 측정값 텍스트,
 *   툴바 토글, 그래프·POE·스윕 패널의 표시, 공유 링크 왕복(URL 로 다시 열기),
 *   라벨 토글 뒤 촬영 SVG, 모바일 뷰포트 레이아웃. 기대값은 닫힌형 공식.
 * ════════════════════════════════════════════════════════════════════ */
'use strict';
const L = require('./lib');
const path = require('path');
const fs = require('fs');

const SHOTS = process.argv.includes('--shots');
const R = [];
function chk(name, ok, detail) { R.push({ name, ok: !!ok, detail: detail || '' }); }
function near(name, got, want, rtol, atol) {
  const ok = typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= Math.max(atol || 1e-9, (rtol || 1e-3) * Math.abs(want));
  chk(name, ok, ok ? '' : `got=${got} want=${want}`);
}
function num(s) { const m = String(s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }

(async () => {
  const browser = await L.launch();
  try {
    /* ── 1. 데스크톱: 시작 카드 · 갤러리 · 측정값 ── */
    let p = await L.newPage(browser, 1280, 800, SHOTS ? 2 : 1);
    chk('시작 카드가 보인다', await p.evaluate(() => document.getElementById('start-guide').classList.contains('visible')));
    chk('갤러리 12개', (await p.evaluate(() => document.querySelectorAll('#sg-gallery .gal-item').length)) === 12);
    if (SHOTS) await L.shot(p, '01-start.png');

    await L.scene(p, 'atwood');
    chk('장면 로드 후 시작 카드 사라짐', !(await p.evaluate(() => document.getElementById('start-guide').classList.contains('visible'))));
    chk('경고 칩 없음', !(await p.evaluate(() => document.getElementById('status-chip').classList.contains('visible'))));
    await p.evaluate(() => { document.getElementById('tb-forces').click(); document.getElementById('tb-vectors').click(); });
    if (SHOTS) await L.shot(p, '02-atwood-edit.png');
    await L.run(p, 900);
    await L.pause(p);
    await L.select(p, 1);   // B (1.5 kg)
    let rows = await L.rows(p);
    near('패널: 장력 T = 2m₁m₂g/(m₁+m₂)', num(rows['장력 T']), 11.76, 0.01);
    near('패널: 중력 mg = 14.7', num(rows['중력 mg']), 14.7, 0.01);
    near('패널: 알짜힘 = m·a = 1.5·1.96', num(rows['알짜힘 ΣF = ma']), 2.94, 0.02);
    chk('그래프 패널이 실행과 함께 열림', await p.evaluate(() => document.getElementById('graph-panel').classList.contains('visible')));
    chk('실행 배지 일시정지', await p.evaluate(() => document.getElementById('run-indicator').classList.contains('is-paused')));
    if (SHOTS) await L.shot(p, '03-atwood-run.png');
    await p.evaluate(() => { _selectObject(STATE.ropes[1]); });
    await L.sleep(150);
    rows = await L.rows(p);
    chk('실 패널: 팽팽함', /팽팽/.test(rows['상태'] || ''));
    near('실 패널: 장력', num(rows['장력 T']), 11.76, 0.01);

    /* ── 2. 빗면: 수직항력·마찰 · 잔상 비교 그래프 ── */
    await L.reset(p);
    await L.scene(p, 'incline');
    await L.run(p, 700); await L.pause(p); await L.select(p, 0);
    rows = await L.rows(p);
    near('빗면: N = mg cosθ', num(rows['수직항력 N']), 2 * 9.8 * Math.cos(Math.atan(0.5)), 0.01);
    near('빗면: f = μk N', num(rows['마찰력 f']), 0.25 * 2 * 9.8 * Math.cos(Math.atan(0.5)), 0.01);
    chk('빗면: 운동 마찰 배지', /운동 마찰/.test(rows['마찰력 f'] || ''));
    await L.reset(p);
    chk('초기화 뒤 잔상 보관', await p.evaluate(() => !!SERIES.ghost));
    await p.evaluate(() => { STATE.floorSegments[0].muK = 0.1; document.querySelector('.g-tab[data-tab="v"]').click(); });
    await L.run(p, 700); await L.pause(p);
    chk('그래프에 잔상 범례', await p.evaluate(() => /직전 실행/.test(document.getElementById('graph-legend').textContent)));
    if (SHOTS) await L.shot(p, '04-incline-graph.png');

    /* ── 3. 라벨 토글 → 촬영 SVG ── */
    await L.reset(p);
    let svgOn = await p.evaluate(() => buildSceneSVG());
    await p.evaluate(() => document.getElementById('tb-labels').click());
    let svgOff = await p.evaluate(() => buildSceneSVG());
    chk('라벨 켜짐: SVG 에 kg', /kg</.test(svgOn));
    chk('라벨 꺼짐: SVG 에 kg 없음', !/kg</.test(svgOff));
    await p.evaluate(() => document.getElementById('tb-labels').click());

    /* ── 4. 공유 링크 왕복 — 새 탭에서 URL 로 열기 ── */
    await L.scene(p, 'movable-pulley');
    const url = await p.evaluate(() => sceneShareURL());
    chk('공유 URL 에 #s=', /#s=/.test(url));
    const p2 = await L.newPage(browser, 1280, 800, 1, false, url);
    const back = await p2.evaluate(() => ({ n: STATE.elements.length, f: STATE.floorSegments.length, r: STATE.ropes.length, pulleys: STATE.elements.filter(e => e.type === 'pulley').length }));
    chk('링크로 열린 장면: 요소 4·바닥 2·실 5', back.n === 4 && back.f === 2 && back.r === 5 && back.pulleys === 2);
    await p2.evaluate(() => document.getElementById('btn-run').click());
    await L.sleep(800);
    const vs = await p2.evaluate(() => STATE.elements.filter(e => e.type === 'rect').map(e => e.vy));
    chk('링크로 연 장면이 실제로 움직인다 (하중 위로, 추 아래로)', vs.length === 2 && vs[0] > 0.05 && vs[1] < -0.05);
    await p2.close();

    /* ── 5. POE 흐름 ── */
    await L.reset(p);
    await p.evaluate(() => { togglePOE(true); });
    await L.sleep(150);
    chk('POE 목록: 분류 탭 9개(7 + 해설 + 탐구)', (await p.evaluate(() => document.querySelectorAll('#poe-body .poe-tab').length)) === 9);
    if (SHOTS) await L.shot(p, '05-poe-list.png');
    await p.evaluate(() => startPOE(POE_EXAMPLES.find(e => e.id === 'atwood-T')));
    await L.sleep(200);
    chk('POE 예측: 선택지 4개', (await p.evaluate(() => document.querySelectorAll('#poe-body .poe-opt').length)) === 4);
    chk('POE 예측 단계: 힘 표시 꺼짐', !(await p.evaluate(() => STATE.showForces)));
    await p.evaluate(() => { document.querySelectorAll('#poe-body .poe-opt')[0].click(); });
    await p.evaluate(() => { document.querySelector('#poe-body .poe-primary').click(); });
    await L.sleep(300);
    chk('POE 관찰: 힘 표시 켜짐 · 비교표 3행', await p.evaluate(() => STATE.showForces && document.querySelectorAll('#poe-body table.poe-truth tr').length === 4));
    const vt = await p.evaluate(() => [...document.querySelectorAll('#poe-body table.poe-truth tr td:nth-child(2)')].map(td => td.textContent));
    near('비교표 기준 장력', num(vt[0]), 11.76, 0.01);
    near('비교표 3 kg 장력', num(vt[1]), 14.7, 0.01);
    near('비교표 같은 질량 장력 = mg', num(vt[2]), 9.8, 0.01);
    await L.run(p, 700); await L.pause(p);
    if (SHOTS) await L.shot(p, '06-poe-observe.png');
    await p.evaluate(() => { document.querySelector('#poe-body .poe-primary').click(); });
    await L.sleep(200);
    chk('POE 설명: 판정·정답·해설', await p.evaluate(() => !!document.querySelector('#poe-body .poe-verdict') && !!document.querySelector('#poe-body .poe-answer') && !!document.querySelector('#poe-body .poe-explain')));
    chk('POE 결과 1건 기록', (await p.evaluate(() => POE.results.length)) === 1);
    if (SHOTS) await L.shot(p, '07-poe-explain.png');

    /* ── 6. 수치 문항 + 해설 + 탐구 카드 → 스윕 ── */
    await p.evaluate(() => startPOE(POE_EXAMPLES.find(e => e.id === 'atwood-a')));
    await L.sleep(150);
    chk('수치 문항: 입력 버튼', await p.evaluate(() => /입력/.test(document.querySelector('#poe-body .poe-opts .poe-btn').textContent)));
    await p.evaluate(() => { POE.numeric = 1.9; POE.step = 2; _record(POE.cur); renderPOEStep(); });
    await L.sleep(150);
    chk('수치 문항 1.9 → 정답 판정', await p.evaluate(() => document.querySelector('#poe-body .poe-verdict').classList.contains('ok')));
    await p.evaluate(() => startGuide(POE_GUIDES[5]));
    await L.sleep(200);
    chk('해설 카드: 단계 3개 + 왜', await p.evaluate(() => document.querySelectorAll('#poe-body .poe-steps-list li').length === 3 && !!document.querySelector('#poe-body .poe-answer')));
    await p.evaluate(() => startIdea(POE_IDEAS[1]));
    await L.sleep(200);
    await p.evaluate(() => { document.querySelector('#poe-body .poe-primary').click(); });
    await L.sleep(200);
    chk('탐구 카드 → 스윕 패널 열림 (POE 옆)', await p.evaluate(() => document.getElementById('sweep-panel').classList.contains('visible') && document.getElementById('poe-panel').classList.contains('visible')));
    chk('스윕 프리셋: 질량 1→10', await p.evaluate(() => document.getElementById('sweep-prop').value === 'mass' && +document.getElementById('sweep-to').value === 10));
    await p.evaluate(() => document.getElementById('sweep-run').click());
    await L.sleep(1500);
    const sw = await p.evaluate(() => SWEEP.rows.map(r => r.y));
    chk('스윕 결과 10행, 가속도 단조 증가·g 미만', sw.length === 10 && sw.every((v, i) => i === 0 || v > sw[i - 1]) && sw[sw.length - 1] < 9.8);
    if (SHOTS) await L.shot(p, '08-sweep.png');

    /* ── 7. 모바일 뷰포트 ── */
    const m = await L.newPage(browser, 390, 844, SHOTS ? 2 : 1, true);
    chk('모바일: 햄버거 보임', await m.evaluate(() => getComputedStyle(document.getElementById('hamburger-btn')).display !== 'none'));
    chk('모바일: 사이드바 숨김(변환)', await m.evaluate(() => { const r = document.getElementById('sidebar-left').getBoundingClientRect(); return r.right <= 0; }));
    await L.scene(m, 'pendulum');
    await m.evaluate(() => document.getElementById('btn-run').click());
    await L.sleep(600);
    chk('모바일: 실행 배지가 화면 안', await m.evaluate(() => { const r = document.getElementById('run-indicator').getBoundingClientRect(); return r.right <= window.innerWidth && r.left >= 0; }));
    chk('모바일: 툴바가 pill 위에 (겹치지 않음)', await m.evaluate(() => { const t = document.getElementById('tool-bar').getBoundingClientRect(), c = document.getElementById('controls-bottom').getBoundingClientRect(); return t.bottom <= c.top + 2; }));
    if (SHOTS) await L.shot(m, '09-mobile.png');
    await m.close();

    chk('페이지 오류 없음', p.__errors.length === 0, p.__errors.join(' | '));
    await p.close();
  } finally {
    await browser.close();
  }

  const fail = R.filter(r => !r.ok);
  for (const r of R) console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name}${r.detail ? '   ' + r.detail : ''}`);
  console.log(`\n브라우저 검증: ${R.length - fail.length}/${R.length} 통과`);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
