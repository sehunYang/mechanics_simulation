/* ============================================================
   test/smoke-load.js — index.html 순서대로 전체 js/*.js 로드 스모크 테스트
     로드 시점 예외(오타·미정의 참조·구문 오류)를 잡는다. DOM은 스텁.
   실행: node test/smoke-load.js
   ============================================================ */
'use strict';
const vm = require('vm');
const { loadApp } = require('./dom-harness');

const app = loadApp();
let fail = 0;

for (const f of app.files) {
  const e = app.errors.find(x => x.file === f);
  if (e) {
    fail++;
    console.log(`FAIL  ${f}\n      ${String(e.err.stack || e.err).split('\n').slice(0, 3).join('\n      ')}`);
  } else {
    console.log(` ok   ${f}`);
  }
}

/* 로드 후 핵심 심볼이 실제로 정의됐는지 확인 */
const REQUIRED = [
  'CONFIG', 'STATE', 'VIEWPORT', 'RectBody', 'CircleBody', 'FloorSegment', 'Rope',
  'Pulley', 'Spring', 'ExtForce', 'ForceZone',
  'simStep', 'initPhysics', 'resolveFloorCollisions', 'resolveRopeConstraints',
  'applySpringForces', 'applyExtForces', 'validateAll',
  '_arcPhysPoints', '_arcSamplePoints', '_arcRadiusFromCurvature',
  '_backFaceSkip', '_depenetrateInitial',
  'physToWorld', 'worldToPhys', 'worldToScreen', 'drawScene', 'drawGrid',
  'startSimulation', 'pauseSimulation', 'resumeSimulation',
  'runIndicator', '_updateRunIndicator',
];
const missing = REQUIRED.filter(n => vm.runInContext(`typeof ${n}`, app.ctx) === 'undefined');
if (missing.length) { fail++; console.log(`\nFAIL  미정의 심볼: ${missing.join(', ')}`); }
else console.log(`\n ok   핵심 심볼 ${REQUIRED.length}개 모두 정의됨`);

/* 실제로 씬을 만들고 돌려보기 + 상태 배지 갱신까지 */
try {
  app.evalIn(`
    CONFIG.cellSize = 8;
    STATE.floorSegments.push(new FloorSegment(0,60,100,60));
    const r = new RectBody(); r.gridX = 50; r.gridY = 40; STATE.elements.push(r);
    startSimulation();
    for (let i=0;i<120;i++){ simStep(CONFIG.FIXED_DT); STATE.simTime += CONFIG.FIXED_DT; }
    if (!isFinite(r.physY)) throw new Error('physY is not finite');
    _updateRunIndicator();
    drawScene();
    pauseSimulation(); _updateRunIndicator(); drawScene();
    STATE.simMode = 'EDIT'; _updateRunIndicator(); drawScene();
  `);
  console.log(' ok   씬 구성 + 2초 시뮬 + 상태 배지 + drawScene() 정상 수행');
} catch (err) {
  fail++;
  console.log(`FAIL  런타임 스모크: ${err.message}`);
}

/* 캡처(PNG 선화) 경로도 예외 없이 도는지 */
try {
  app.evalIn(`
    STATE.floorSegments[0].isFriction = true;
    captureImage();
  `);
  console.log(' ok   captureImage() 정상 수행 (마찰면 포함)');
} catch (err) {
  fail++;
  console.log(`FAIL  captureImage: ${err.message}`);
}

console.log('\n' + '='.repeat(60));
console.log(fail === 0 ? `스모크 통과 — ${app.files.length}개 파일 로드 OK` : `실패 ${fail}건`);
process.exit(fail ? 1 : 0);
