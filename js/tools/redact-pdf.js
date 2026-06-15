// js/tools/redact-pdf.js — Tool: Redact PDF (che nội dung nhạy cảm)
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class RedactPdfTool {
  constructor() {
    this.state = { pdfDoc: null, pdfjsDoc: null, bytes: null, pageCount: 0, pages: [], fileName: '', fileSize: 0 };
    this.redactions = {}; // pageIndex → [{x, y, width, height}]
    this.activePage = 0;
    this.isDrawing = false;
    this.drawStart = null;
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `<div class="upload-zone" id="upload-zone"><div class="upload-icon">⬛</div><h3>Kéo thả file PDF vào đây</h3><p class="sub">Che (redact) nội dung nhạy cảm bằng ô đen</p></div><input type="file" id="file-input" accept=".pdf,application/pdf" hidden><div id="results-area" style="display:none;"></div>`;
  }

  setupEvents() {
    const z = document.getElementById('upload-zone'), inp = document.getElementById('file-input');
    z.addEventListener('click', () => inp.click());
    inp.addEventListener('change', e => { if (e.target.files[0]) this.handleFile(e.target.files[0]); });
    z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('drag-over'); });
    z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
    z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('drag-over'); if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]); });
  }

  async handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Chọn file PDF', 'error'); return; }
    const c = document.getElementById('tool-container'); showLoading(c);
    try {
      const buf = await file.arrayBuffer();
      const { pdfDoc, pdfjsDoc, bytes, pageCount } = await PDFEngine.load(buf);
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, 0.4);
      this.state = { pdfDoc, pdfjsDoc, bytes, pageCount, pages, fileName: file.name, fileSize: file.size };
      this.redactions = {};
      this.activePage = 0;
      hideLoading(); this.renderSelection();
    } catch (e) { hideLoading(); showToast('Lỗi đọc PDF', 'error'); }
  }

  renderSelection() {
    const s = this.state, r = document.getElementById('results-area');
    r.style.display = 'block';
    const z = document.getElementById('upload-zone');
    z.className = 'upload-zone compact';
    z.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(s.fileName)}</h3><span class="sub">${s.pageCount} trang</span></div><button class="change-btn" id="chg-btn">Đổi file</button>`;
    document.getElementById('chg-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('file-input').click(); });

    r.innerHTML = `
      <div class="toolbar">
        <span style="font-weight:600;">⬛ Che nội dung nhạy cảm</span>
        <span style="font-size:0.8rem;color:var(--text-muted);">🖱️ Kéo chuột trên trang để vẽ ô che</span>
        <button class="btn btn-secondary btn-sm" id="btn-undo">↩️ Hoàn tác</button>
        <button class="btn btn-secondary btn-sm" id="btn-clear-all">🗑️ Xóa tất cả</button>
        <button class="btn btn-primary" id="btn-apply">⬛ Áp dụng & Tải PDF</button>
      </div>
      <div class="redact-nav">
        <button id="btn-prev" class="btn btn-secondary btn-sm" ${s.pageCount <= 1 ? 'disabled' : ''}>◀ Trang trước</button>
        <span id="page-info">Trang 1 / ${s.pageCount}</span>
        <button id="btn-next" class="btn btn-secondary btn-sm" ${s.pageCount <= 1 ? 'disabled' : ''}>Trang sau ▶</button>
        <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px;" id="redact-count">0 ô đã vẽ</span>
      </div>
      <div id="redact-canvas-container" style="position:relative;display:inline-block;cursor:crosshair;border:1px solid var(--border);border-radius:8px;overflow:hidden;max-width:100%;">
        <canvas id="redact-canvas"></canvas>
        <div id="redact-overlay" style="position:absolute;top:0;left:0;pointer-events:none;"></div>
      </div>
      <p style="font-size:0.75rem;color:var(--text-danger);margin-top:8px;">⚠️ Redact là vĩnh viễn — file tải về sẽ bị che vĩnh viễn, không thể phục hồi</p>`;

    this.loadPage(0);
    this.bindRedactEvents();
  }

  async loadPage(pageIdx) {
    this.activePage = pageIdx;
    const page = await this.state.pdfjsDoc.getPage(pageIdx + 1);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.getElementById('redact-canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // Draw existing redactions
    this.drawRedactionOverlay();
    document.getElementById('page-info').textContent = `Trang ${pageIdx + 1} / ${this.state.pageCount}`;
    this.updateRedactCount();
  }

  drawRedactionOverlay() {
    const overlay = document.getElementById('redact-overlay');
    overlay.innerHTML = '';
    const rects = this.redactions[this.activePage] || [];
    rects.forEach(rect => {
      const div = document.createElement('div');
      div.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:rgba(0,0,0,0.7);border:2px solid var(--danger);`;
      overlay.appendChild(div);
    });
  }

  bindRedactEvents() {
    const canvas = document.getElementById('redact-canvas');
    const container = document.getElementById('redact-canvas-container');
    let startX, startY, drawRect;

    canvas.addEventListener('mousedown', e => {
      this.isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;

      drawRect = document.createElement('div');
      drawRect.style.cssText = `position:absolute;left:${startX}px;top:${startY}px;width:0;height:0;background:rgba(0,0,0,0.5);border:2px dashed #fff;pointer-events:none;`;
      document.getElementById('redact-overlay').appendChild(drawRect);
    });

    canvas.addEventListener('mousemove', e => {
      if (!this.isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      drawRect.style.left = Math.min(startX, x) + 'px';
      drawRect.style.top = Math.min(startY, y) + 'px';
      drawRect.style.width = Math.abs(x - startX) + 'px';
      drawRect.style.height = Math.abs(y - startY) + 'px';
    });

    canvas.addEventListener('mouseup', e => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const rx = Math.min(startX, x), ry = Math.min(startY, y);
      const rw = Math.abs(x - startX), rh = Math.abs(y - startY);

      if (rw > 5 && rh > 5) {
        if (!this.redactions[this.activePage]) this.redactions[this.activePage] = [];
        this.redactions[this.activePage].push({ x: rx, y: ry, width: rw, height: rh });
        this.drawRedactionOverlay();
        this.updateRedactCount();
      } else {
        drawRect.remove();
      }
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
      if (this.activePage > 0) this.loadPage(this.activePage - 1);
    });
    document.getElementById('btn-next').addEventListener('click', () => {
      if (this.activePage < this.state.pageCount - 1) this.loadPage(this.activePage + 1);
    });
    document.getElementById('btn-undo').addEventListener('click', () => {
      if (this.redactions[this.activePage]?.length) {
        this.redactions[this.activePage].pop();
        this.drawRedactionOverlay();
        this.updateRedactCount();
      }
    });
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (this.redactions[this.activePage]?.length) {
        this.redactions[this.activePage] = [];
        this.drawRedactionOverlay();
        this.updateRedactCount();
      }
    });
    document.getElementById('btn-apply').addEventListener('click', () => this.apply());
  }

  updateRedactCount() {
    const total = Object.values(this.redactions).reduce((s, arr) => s + arr.length, 0);
    document.getElementById('redact-count').textContent = `${total} ô đã vẽ`;
  }

  async apply() {
    const btn = document.getElementById('btn-apply');
    const totalRects = Object.values(this.redactions).reduce((s, a) => s + a.length, 0);
    if (totalRects === 0) { showToast('Chưa vẽ ô che nào', 'error'); return; }

    btn.disabled = true; btn.textContent = '⏳ Đang áp dụng...';
    try {
      const { bytes, pageCount } = this.state;
      // Render each page to image, draw black rectangles, create new PDF
      const newDoc = await PDFLib.PDFDocument.create();
      const scale = 1.5;

      for (let i = 0; i < pageCount; i++) {
        btn.textContent = `⏳ Xử lý trang ${i+1}/${pageCount}...`;
        const page = await this.state.pdfjsDoc.getPage(i + 1);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Draw black rectangles for redactions
        const rects = this.redactions[i] || [];
        ctx.fillStyle = '#000000';
        rects.forEach(r => {
          ctx.fillRect(r.x, r.y, r.width, r.height);
        });

        // Embed as image into PDF
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const jpgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
        const img = await newDoc.embedJpg(jpgBytes);
        const p = newDoc.addPage([vp.width, vp.height]);
        p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      }

      const out = await newDoc.save();
      PDFEngine.download(out, this.state.fileName.replace(/\.pdf$/i, '_redacted.pdf'));
      showToast(`Đã che ${totalRects} vùng! File đã được redact vĩnh viễn.`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Lỗi: ' + e.message, 'error');
    }
    btn.textContent = '⬛ Áp dụng & Tải PDF'; btn.disabled = false;
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new RedactPdfTool();
export default tool;
