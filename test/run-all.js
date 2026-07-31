/* ============================================================
   test/run-all.js — 전체 물리 검증 스위트 실행
   실행: node test/run-all.js  [--verbose]
   ============================================================ */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['spec',  '기본 역학 (중력·충돌·마찰·회전·실·도르래·용수철·외력)'],
  ['spec2', '조합 2차 (구름·적층·반발계수·힘구간·실·용수철·곡면·경계)'],
  ['spec3', '조합 3차 (경사반발·벽마찰·비스듬충돌·스핀·2체용수철·극단값)'],
  ['spec4', '기하 일치 (렌더 ↔ 히트테스트 ↔ 물리 곡면)'],
  ['spec5', '화면 픽셀 단위 검증'],
  ['spec6', '단면 바닥 규약 · 정지마찰 고정 · 직렬 도르래 · 남은 조합'],
];

const verbose = process.argv.includes('--verbose');
let tp = 0, tf = 0, te = 0, tn = 0;
const failedSuites = [];

/* 0. 전체 파일 로드 스모크 (index.html 순서) */
try {
  execFileSync(process.execPath, [path.join(__dirname, 'smoke-load.js')],
    { encoding: 'utf8', stdio: 'pipe' });
  console.log(' ok   smoke   14/14  index.html 순서대로 전체 js 로드 + 1프레임 수행');
} catch (err) {
  failedSuites.push('smoke-load');
  console.log('FAIL  smoke          index.html 로드 스모크');
  console.log((err.stdout || '') + (err.stderr || ''));
}

for (const [name, desc] of SUITES) {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, name + '.js')],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    out = (err.stdout || '') + (err.stderr || '');
  }
  const m = out.match(/PASS (\d+) \/ FAIL (\d+) \/ ERROR (\d+)\s+\(total (\d+)\)/);
  const [, p, f, e, n] = m ? m.map(Number) : [0, 0, 0, 1, 1];
  tp += p; tf += f; te += e; tn += n;
  const bad = f + e > 0;
  if (bad) failedSuites.push(name);
  console.log(`${bad ? 'FAIL' : ' ok '}  ${name.padEnd(6)} ${String(p).padStart(3)}/${String(n).padEnd(3)}  ${desc}`);
  if (verbose || bad) {
    const lines = out.split('\n');
    let show = false;
    for (const ln of lines) {
      if (/^\[(FAIL|ERROR)\]/.test(ln)) show = true;
      else if (/^\[PASS\]/.test(ln)) show = false;
      if (show && ln.trim()) console.log('        ' + ln);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log(`합계  PASS ${tp} / FAIL ${tf} / ERROR ${te}   (검증 항목 ${tn}개)`);
if (failedSuites.length) console.log(`실패 스위트: ${failedSuites.join(', ')}`);
process.exit(tf + te > 0 || failedSuites.length ? 1 : 0);
