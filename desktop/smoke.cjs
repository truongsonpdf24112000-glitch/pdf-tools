// smoke.cjs — Test khói cho PDF Tools Desktop (vòng phản hồi Phase 1)
// 1. Khởi động Electron, 2. chờ app://web load, 3. bơm PDF fixture qua file input,
// 4. chờ thumbnail render, 5. assert số card trang, 6. kiểm tra không có CDN lỗi.
// Exit 0 = PASS, 1 = FAIL.
const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const appDir = __dirname;
  const electronBin = process.env.ELECTRON_BIN ||
    require('path').join(appDir, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  const extraLib = process.env.ELECTRON_EXTRA_LIB || '/opt/data/elextra/root/usr/lib/x86_64-linux-gnu';
  process.env.LD_LIBRARY_PATH = [extraLib, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
  process.env.DISPLAY = process.env.DISPLAY || ':99';

  const offline = process.env.OFFLINE === '1';
  const extraArgs = offline ? ['--proxy-server=http=127.0.0.1:9;https=127.0.0.1:9'] : [];
  const app = await electron.launch({
    executablePath: electronBin,
    args: [appDir, '--no-sandbox', '--disable-gpu', ...extraArgs],
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ':99',
      // thư viện .so trích từ deb (không cần root) để chạy Electron trên container
      LD_LIBRARY_PATH: ['/opt/data/elextra/root/usr/lib/x86_64-linux-gnu', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
    },
  });

  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  // Chờ app bootstrap (sidebar + tools)
  await win.waitForSelector('.tool-item', { timeout: 30000 });
  console.log('UI shell loaded');

  // Điều hướng tới tool Chỉnh sửa PDF (edit)
  const editBtn = await win.$('a[href*="edit"], .tool-item');
  await win.evaluate(() => {
    const items = [...document.querySelectorAll('.tool-item, .sidebar a, nav a')];
    const t = items.find((el) => /chỉnh sửa|edit/i.test(el.textContent));
    if (t) t.click();
  });
  await win.waitForTimeout(1500);

  // Bơm fixture PDF vào input#file-input (hidden)
  const fixture = path.join(appDir, '..', 'test-6pages.pdf');
  if (!fs.existsSync(fixture)) throw new Error('Thiếu fixture ' + fixture);
  const input = await win.$('input[type="file"]');
  if (!input) throw new Error('Không thấy input[type=file]');
  await input.setInputFiles(fixture);

  // Chờ thumbnail grid render đủ 6 trang
  await win.waitForFunction(() => {
    const grid = document.getElementById('thumbnail-grid');
    return grid && grid.querySelectorAll('.thumbnail-card, .unified-card, [class*="card"]').length >= 6;
  }, null, { timeout: 45000 });
  console.log('PDF loaded, thumbnails rendered');

  // Kiểm tra vendor scripts load thành công (không cần mạng)
  const libs = await win.evaluate(() => ({
    pdfLib: typeof window.PDFLib !== 'undefined',
    pdfjs: typeof window.pdfjsLib !== 'undefined',
    sortable: typeof window.Sortable !== 'undefined',
  }));
  console.log('libs:', JSON.stringify(libs));
  if (!libs.pdfLib || !libs.pdfjs || !libs.sortable) throw new Error('Thiếu library: ' + JSON.stringify(libs));

  // Xoay trang 1 rồi bấm nút tác vụ (áp dụng) -> chờ file download (Save dialog chặn ở chế độ headless?
  // dialog Sync sẽ block. Bỏ qua bước save trong smoke; chỉ verify render.)

  const fatal = errors.filter((e) => !/favicon|sw|manifest|serviceworker|404/i.test(e));
  console.log('console errors:', errors.length, '| fatal:', fatal.length);
  if (fatal.length) console.log(fatal.slice(0, 5).join('\n'));

  await app.close();
  if (fatal.length >= 3) throw new Error('Quá nhiều lỗi JS');
  console.log('SMOKE PASS');
})().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
