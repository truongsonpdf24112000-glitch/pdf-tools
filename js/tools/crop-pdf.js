// js/tools/crop-pdf.js — Tool: Crop PDF (cắt lề)
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class CropPdfTool {
  constructor() {
    this.state = {
      pdfDoc: null, pdfjsDoc: null, bytes: null,
      pages: [], pageCount: 0, fileName: '', fileSize: 0,
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      unit: 'mm'
    };
  }

  init() {
    this.render();
    this.setupEvents();
  }

  render() {
    const container = document.getElementById('tool-container');
    container.innerHTML = '';
    container.style.position = 'relative';
    container.innerHTML = `
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">✂️</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Cắt lề trang PDF — loại bỏ khoảng trắng thừa</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
      <div id="results-area" style="display:none;"></div>
    `;
  }

  setupEvents() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { if (e.target.files[0]) this.handleFile(e.target.files[0]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
    });
  }

  async handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Vui lòng chọn file PDF', 'error'); return; }
    const container = document.getElementById('tool-container');
    showLoading(container);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const { pdfDoc, pdfjsDoc, pageCount } = await PDFEngine.load(buffer);
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, 0.3);
      this.state = { pdfDoc, pdfjsDoc, bytes, pages, pageCount, fileName: file.name, fileSize: file.size,
        crop: { top: 0, right: 0, bottom: 0, left: 0 } };
      hideLoading();
      this.renderSelection();
    } catch (err) { hideLoading(); showToast('Không thể đọc file PDF', 'error'); }
  }

  renderSelection() {
    const { fileName, fileSize, pageCount, pages, crop } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(fileName)}</h3><span class="sub">${formatFileSize(fileSize)} · ${pageCount} trang</span></div><button class="change-btn" id="change-file-btn">Đổi file</button>`;
    document.getElementById('change-file-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('file-input').click(); });

    const cols = Math.min(pageCount, 4);
    results.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:16px;align-items:flex-end;">
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Cắt trên (mm)</label>
          <input type="number" class="form-input" id="crop-top" value="${crop.top}" min="0" max="500" style="width:80px;">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Cắt dưới (mm)</label>
          <input type="number" class="form-input" id="crop-bottom" value="${crop.bottom}" min="0" max="500" style="width:80px;">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Cắt trái (mm)</label>
          <input type="number" class="form-input" id="crop-left" value="${crop.left}" min="0" max="500" style="width:80px;">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Cắt phải (mm)</label>
          <input type="number" class="form-input" id="crop-right" value="${crop.right}" min="0" max="500" style="width:80px;">
        </div>
        <div>
          <button class="btn btn-secondary" id="btn-remove-margins" style="height:38px;">🗑️ Tự động bỏ lề trắng</button>
        </div>
        <div style="margin-left:auto;">
          <button class="btn btn-primary" id="btn-crop" style="height:38px;">✂️ Cắt & Tải PDF</button>
        </div>
      </div>
      <div class="thumbnail-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${pages.map((p, i) => `<div class="thumbnail-card"><img src="${p.thumbnail}" alt="Trang ${i+1}" loading="lazy"><span class="page-number">${i+1}</span></div>`).join('')}
      </div>
    `;

    document.getElementById('btn-crop').addEventListener('click', () => this.crop());
    document.getElementById('btn-remove-margins').addEventListener('click', () => this.autoRemoveMargins());

    ['top','bottom','left','right'].forEach(side => {
      document.getElementById(`crop-${side}`).addEventListener('input', e => {
        this.state.crop[side] = parseFloat(e.target.value) || 0;
        this.updatePreview();
      });
    });
  }

  updatePreview() {
    const { crop, pages } = this.state;
    document.querySelectorAll('.thumbnail-card img').forEach((img, i) => {
      const mmToPx = 2.8346;
      const w = pages[i].width - (crop.left + crop.right) * mmToPx;
      const h = pages[i].height - (crop.top + crop.bottom) * mmToPx;
      const l = crop.left * mmToPx;
      const t = crop.top * mmToPx;
      img.style.clipPath = `inset(${t}px ${(pages[i].width - l - w)}px ${(pages[i].height - t - h)}px ${l}px)`;
    });
  }

  async autoRemoveMargins() {
    showToast('Đang phân tích lề trắng...', 'info');
    const { pdfjsDoc } = this.state;
    const margins = { top: Infinity, left: Infinity, bottom: Infinity, right: Infinity };

    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const page = await pdfjsDoc.getPage(i);
      const vp = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let t = 0, l = 0, b = canvas.height - 1, r = canvas.width - 1;
      const isWhite = idx => data[idx] > 250 && data[idx+1] > 250 && data[idx+2] > 250;

      for (; t < canvas.height; t++) { let white = true;
        for (let x = 0; x < canvas.width; x++) { if (!isWhite((t * canvas.width + x) * 4)) { white = false; break; } }
        if (!white) break; }
      for (; l < canvas.width; l++) { let white = true;
        for (let y = 0; y < canvas.height; y++) { if (!isWhite((y * canvas.width + l) * 4)) { white = false; break; } }
        if (!white) break; }
      for (; b >= 0; b--) { let white = true;
        for (let x = 0; x < canvas.width; x++) { if (!isWhite((b * canvas.width + x) * 4)) { white = false; break; } }
        if (!white) break; }
      for (; r >= 0; r--) { let white = true;
        for (let y = 0; y < canvas.height; y++) { if (!isWhite((y * canvas.width + r) * 4)) { white = false; break; } }
        if (!white) break; }

      const mmScale = 25.4 / (72 * 0.5);
      margins.top = Math.min(margins.top, t * mmScale);
      margins.left = Math.min(margins.left, l * mmScale);
      margins.bottom = Math.min(margins.bottom, (canvas.height - b) * mmScale);
      margins.right = Math.min(margins.right, (canvas.width - r) * mmScale);
    }

    this.state.crop = margins;
    ['top','bottom','left','right'].forEach(s => {
      document.getElementById(`crop-${s}`).value = Math.round(margins[s]);
    });
    this.updatePreview();
    showToast('Đã phát hiện lề trắng', 'success');
  }

  async crop() {
    const btn = document.getElementById('btn-crop'); btn.disabled = true; btn.textContent = '⏳ Đang cắt...';
    try {
      const { crop, pdfDoc, pages } = this.state;
      const newDoc = await PDFLib.PDFDocument.create();
      const copied = await newDoc.copyPages(pdfDoc, Array.from({length: pdfDoc.getPageCount()}, (_, i) => i));
      const mmToPt = 72 / 25.4;

      copied.forEach((page, i) => {
        const w = pages[i].width - (crop.left + crop.right) * (72/25.4 / 0.3);
        const h = pages[i].height - (crop.top + crop.bottom) * (72/25.4 / 0.3);
        page.setCropBox(crop.left * mmToPt, crop.bottom * mmToPt,
                        pages[i].width / 0.3 * 72/25.4 - crop.right * mmToPt - crop.left * mmToPt,
                        pages[i].height / 0.3 * 72/25.4 - crop.top * mmToPt - crop.bottom * mmToPt);
        newDoc.addPage(page);
      });

      const out = await newDoc.save();
      PDFEngine.download(out, this.state.fileName.replace(/\.pdf$/i, '_crop.pdf'));
      showToast('Đã cắt PDF!', 'success');
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
    btn.textContent = '✂️ Cắt & Tải PDF'; btn.disabled = false;
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new CropPdfTool();
export default tool;
