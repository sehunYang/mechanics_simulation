/* 헤드리스 Chrome 헬퍼 — test/browser/run.js 와 스크린샷 생성이 사용.
 *   준비: 저장소 루트에서  npm i --no-save puppeteer-core
 *         정적 서버:      python -m http.server 8123
 *   환경변수 CHROME_PATH / APP_URL 로 경로·주소를 바꿀 수 있다. */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.APP_URL || 'http://localhost:8123/index.html';

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-sandbox'],
  });
}

async function newPage(browser, width = 1280, height = 800, dsf = 2, mobile = false, url) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile });
  if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url || URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction('typeof STATE !== "undefined" && typeof loadScene === "function"', { timeout: 15000 }).catch(e => { console.error("page errors:", errors); throw e; });
  await sleep(300);
  page.__errors = errors;
  return page;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 갤러리 장면 불러오기 (뷰 맞춤 포함) */
async function scene(page, id) {
  await page.evaluate((id) => { loadScene(id); }, id);
  await sleep(250);
}

/** 실행 시작 후 실제 시간 ms 만큼 기다림 */
async function run(page, ms) {
  await page.evaluate(() => { document.getElementById('btn-run').click(); });
  await sleep(ms);
}
async function pause(page) { await page.evaluate(() => { if (STATE.simMode === 'RUNNING') document.getElementById('btn-run').click(); }); await sleep(100); }
async function reset(page) { await page.evaluate(() => { document.getElementById('btn-reset').click(); }); await sleep(150); }

/** 물체 선택 (키 → SERIES 라벨 or 인덱스) */
async function select(page, idx) {
  await page.evaluate((idx) => {
    const bodies = STATE.elements.filter(e => e.type === 'rect' || e.type === 'circle');
    _selectObject(bodies[idx] || null);
  }, idx);
  await sleep(150);
}

/** 속성 패널의 측정값 행 {키: 값} */
async function rows(page) {
  return page.evaluate(() => {
    const o = {};
    document.querySelectorAll('#panel-right .pp-row').forEach(r => {
      const k = r.querySelector('.pp-k'), v = r.querySelector('.pp-v');
      if (k && v) o[k.textContent.trim()] = v.textContent.trim();
    });
    return o;
  });
}

async function shot(page, name) {
  const dir = path.join(__dirname, '..', '..', 'docs', 'images');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  await page.screenshot({ path: p });
  return p;
}

module.exports = { launch, newPage, scene, run, pause, reset, select, rows, shot, sleep, URL };
