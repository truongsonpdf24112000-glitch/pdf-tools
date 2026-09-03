// main.cjs — Electron main process cho PDF Tools Desktop
// Chiến lược:
//  - Web app (index.html, css/, js/) được phục vụ Y NGUYÊN qua custom scheme
//    `app://web/...` (privileged: secure + supportFetchAPI + stream) nên không
//    phải sửa source web.
//  - Mọi request CDN (unpkg, Google Fonts/gstatic) được chính handler này map
//    thẳng tới file local trong desktop/vendor & desktop/fonts → chạy offline 100%.
//  - googletagmanager (analytics) bị chặn.
//  - <a download>/createObjectURL → Save As dialog của Windows.
//  - Service worker (sw.js) trả 404 êm — desktop không cần PWA cache.

const { app, BrowserWindow, protocol, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// scheme phải khai báo privileged TRƯỚC khi app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

// ---- Đường dẫn tài nguyên ----
// packaged: resources/web (extraResources), vendor+fonts nằm trong asar (app path)
// dev:      repo gốc + desktop/
const WEB_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..');
const ASSETS_DIR = __dirname; // vendor/, fonts/ nằm trong desktop/ (kể cả asar — fs đọc được)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function mimeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

// Giải mã URL request -> đường dẫn file local (hoặc null nếu chặn/404)
function resolveLocal(reqUrl) {
  let u;
  try { u = new URL(reqUrl); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const pathname = decodeURIComponent(u.pathname || '/');

  if (host === 'web') {
    // PWA: chặn sw đăng ký + manifest (không có worker scope hợp lệ trên app://)
    if (/^\/(sw\.js|manifest\.json)$/.test(pathname)) return { block: true };
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const p = path.normalize(path.join(WEB_ROOT, rel));
    if (!p.startsWith(path.normalize(WEB_ROOT))) return { block: true };
    return { file: p };
  }

  if (host === 'unpkg.com' || host === 'cdn.jsdelivr.net') {
    // /pdf-lib@1.17.1/dist/pdf-lib.min.js -> vendor/pdf-lib.min.js
    const file = path.basename(pathname);
    return { file: path.join(ASSETS_DIR, 'vendor', file) };
  }

  if (host === 'fonts.googleapis.com') {
    // CSS rewrite dùng URL relative -> trình duyệt resolve thành
    // https://fonts.googleapis.com/s/... ; đồng thời phục vụ cả /css2 gốc
    if (pathname.startsWith('/s/')) {
      const p = path.normalize(path.join(ASSETS_DIR, 'fonts', pathname.replace(/^\//, '')));
      if (!p.startsWith(path.normalize(path.join(ASSETS_DIR, 'fonts')))) return { block: true };
      return { file: p };
    }
    const name = pathname.replace(/^\//, '').replace(/\//g, '_') || 'css2';
    return { file: path.join(ASSETS_DIR, 'fonts', name + '.css') };
  }

  if (host === 'fonts.gstatic.com') {
    // /s/inter/v13/xxxx.woff2 -> fonts/s/inter/v13/xxxx.woff2
    const p = path.normalize(path.join(ASSETS_DIR, 'fonts', pathname.replace(/^\//, '')));
    if (!p.startsWith(path.normalize(path.join(ASSETS_DIR, 'fonts')))) return { block: true };
    return { file: p };
  }

  if (host === 'www.googletagmanager.com' || host === 'analytics.google.com' || host === 'google-analytics.com') {
    return { block: true };
  }

  return { block: true }; // mọi thứ khác: chặn (app offline không cần mạng)
}

async function serve(win) {
  win.webContents.on('render-process-gone', (e, d) => console.log('GONE:', JSON.stringify(d)));
  protocol.handle('app', async (request) => {
    const r = resolveLocal(request.url);
    if (!r || r.block) {
      return new Response('', { status: 404 });
    }
    try {
      const buf = await fs.promises.readFile(r.file);
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': mimeFor(r.file),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    title: 'PDF Tools',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // serviceWorkers: bị chặn qua resolveLocal -> đăng ký SW sẽ fail êm
    },
  });

  win.loadURL('app://web/index.html');
  win.webContents.on('render-process-gone', (e, details) => {
    console.log('RENDERER-GONE:', JSON.stringify(details));
  });
  win.webContents.on('console-message', (e, level, message, line, source) => {
    if (process.env.PDFTOOLS_LOG_CONSOLE) console.log('RCONSOLE:', message.slice(0, 300));
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  return win;
}

app.whenReady().then(() => {
  serve();

  const ses = session.defaultSession;

  // "Download" của web app -> Save As dialog
  ses.on('will-download', (event, item) => {
    console.log('DOWNLOAD-EVENT:', item.getURL(), item.getFilename());
    event.preventDefault();
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const defaultPath = path.join(app.getPath('downloads'), item.getFilename());

    // Test hook: tự lưu không hỏi (chỉ khi env đặt chủ đích)
    if (process.env.PDFTOOLS_AUTO_DOWNLOAD) {
      const dir = process.env.PDFTOOLS_AUTO_DOWNLOAD;
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, item.getFilename());
      item.setSavePath(p);
      item.once('done', (e, state) => {
        if (state === 'completed') console.log('SAVED:' + p);
        else console.log('DL-FAIL:' + state);
      });
      item.resume();
      return;
    }

    dialog.showSaveDialog(win, { title: 'Lưu file', defaultPath }).then(({ canceled, filePath }) => {
      if (!canceled && filePath) {
        item.setSavePath(filePath);
        item.once('done', (e, state) => {
          if (state === 'completed') shell.showItemInFolder(filePath);
        });
        item.resume();
      } else {
        item.cancel();
      }
    });
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
