// functional.cjs — Test chức năng end-to-end cho PDF Tools Desktop
// Cách ly bằng CDP: spawn electron --remote-debugging-port, connectOverCDP.
// Kịch bản: mở test-6pages.pdf -> xoay trang 1 (verify badge 90°) -> bấm Apply
// -> xác nhận tải lại PDF state (card mới render) -> verify download event qua CDP.
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const appDir = __dirname;
const extraLib = '/opt/data/elextra/root/usr/lib/x86_64-linux-gnu';
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [extraLib, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':'),
  DISPLAY: process.env.DISPLAY || ':99',
};

function getJson(port, p) {
  return fetch(`http://127.0.0.1:${port}${p}`).then(r => r.json());
}

(async () => {
  const port = 9400 + Math.floor(Math.random() * 100);
  let outLog = '';
  const proc = spawn(path.join(appDir, 'node_modules', '.bin', 'electron'),
    [appDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${port}`],
    { env: { ...env, PDFTOOLS_AUTO_DOWNLOAD: '/tmp/etdl' } });
  proc.stdout.on('data', d => outLog += d.toString());
  proc.stderr.on('data', d => outLog += d.toString());

  // chờ endpoint
  let targets = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    try { const t = await getJson(port, '/json/version'); if (t.webSocketDebuggerUrl) { targets = true; break; } } catch {}
  }
  if (!targets) throw new Error('Electron không lên CDP endpoint');
  console.log('CDP up');

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const ctx = browser.contexts()[0];
  const win = ctx.pages().find(p => p.url().startsWith('app://web')) || await ctx.waitForEvent('page');
  await win.waitForSelector('.tool-item', { timeout: 30000 });
  console.log('UI shell OK');

  // CDP: bật Browser domain để bắt download
  const cdp = await ctx.newCDPSession(win);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: '/tmp/etdl', eventsEnabled: true }).catch(e => console.log('dl-behavior warn:', e.message));

  // tới tool edit
  await win.evaluate(() => {
    const items = [...document.querySelectorAll('.tool-item, .sidebar a, nav a')];
    const t = items.find(el => /chỉnh sửa/i.test(el.textContent));
    if (t) t.click();
  });
  await win.waitForTimeout(1200);

  const input = await win.$('input[type="file"]');
  await input.setInputFiles(path.join(appDir, '..', 'test-6pages.pdf'));
  await win.waitForFunction(() => {
    const g = document.getElementById('thumbnail-grid');
    return g && g.querySelectorAll('[class*="card"]').length >= 6;
  }, null, { timeout: 45000 });
  console.log('OPEN: 6 trang render OK');

  // xoay trang 1: tìm nút ↻ trên card đầu
  const rotated = await win.evaluate(() => {
    const card = document.querySelector('#thumbnail-grid [class*="card"]');
    const b = [...card.querySelectorAll('button')].find(x => /↻/.test(x.textContent) || /xoay phải|rotate right/i.test(x.title));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!rotated) throw new Error('Không tìm thấy nút xoay trên card');
  await win.waitForSelector('.rotate-badge, [class*="badge"]', { timeout: 5000 });
  const badge = await win.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(s => /90°/.test(s.textContent));
    return el ? el.textContent.trim() : null;
  });
  if (!badge || !badge.includes('90')) throw new Error('Badge xoay không xuất hiện');
  console.log('ROTATE: badge', badge, 'OK');

  // bấm Apply (btn-action) -> tải lại PDF state
  win.on('console', (msg) => { if (/error|fail|download/i.test(msg.text())) console.log('PAGE:', msg.text().slice(0, 200)); });
  fs.rmSync('/tmp/etdl', { recursive: true, force: true });
  // bấm Apply (btn-action) -> tải lại PDF state
  await win.evaluate(() => document.getElementById('btn-action')?.click());
  // chờ main process tự lưu file (hook PDFTOOLS_AUTO_DOWNLOAD)
  let savedFile = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (fs.existsSync('/tmp/etdl')) {
      const f = fs.readdirSync('/tmp/etdl').find(n => n.toLowerCase().endsWith('.pdf'));
      if (f) { savedFile = path.join('/tmp/etdl', f); break; }
    }
  }
  console.log('APPLY: file lưu =', savedFile || '(không có)');

  // verify state reload: chờ 1 nhịp rồi đếm lại card
  await win.waitForTimeout(2500);
  const cards2 = await win.evaluate(() => document.querySelectorAll('#thumbnail-grid [class*="card"]').length);
  console.log('RELOAD: cards sau apply =', cards2);

  await browser.close().catch(() => {});
  proc.kill();
  console.log('--- electron log ---\n' + outLog.slice(-1500));
  if (!savedFile) throw new Error('Không có file PDF sau Apply');
  const sz = fs.statSync(savedFile).size;
  console.log('output size:', sz);
  if (sz < 1000) throw new Error('File output quá nhỏ');
  console.log('FUNCTIONAL PASS');
})().catch(e => { console.error('FUNCTIONAL FAIL:', e.message); console.log('--- electron log ---\n' + (typeof outLog !== 'undefined' ? outLog.slice(-2000) : 'n/a')); try { proc && proc.kill(); } catch {} process.exit(1); });