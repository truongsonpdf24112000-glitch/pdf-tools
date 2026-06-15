// js/tools/pdf-to-jpg.js — Tool: PDF → JPG/PNG
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFToJpgTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      bytes: null,
      pageCount: 0,
      fileName: '',
      convertedPages: []
    };
    this.format = 'jpg';
    this.dpi = 150;
    this.backendUrl = 'http://localhost:5001';
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
        <div class="upload-icon">🖼️</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Chuyển đổi từng trang PDF thành ảnh JPG hoặc PNG</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
      <div id="results-area" style="display:none;"></div>
    `;
  }

  setupEvents() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFile(e.target.files[0]);
    });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
    });
  }

  async handleFile(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Vui lòng chọn file PDF', 'error');
      return;
    }

    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      const buffer = await file.arrayBuffer();
      const result = await PDFEngine.load(buffer);
      const pages = await PDFEngine.renderThumbnails(result.pdfjsDoc, 0.5);

      this.state = {
        pdfDoc: result.pdfDoc,
        pdfjsDoc: result.pdfjsDoc,
        bytes: result.bytes,
        pageCount: result.pageCount,
        fileName: file.name,
        convertedPages: []
      };

      hideLoading();
      this.renderSelection(pages);
    } catch (err) {
      hideLoading();
      console.error('Load error:', err);
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  renderSelection(pages) {
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const uploadZone = document.getElementById('upload-zone');
    uploadZone.className = 'upload-zone compact';
    uploadZone.innerHTML = `
      <span class="upload-icon">📄</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(this.state.fileName)}</h3>
        <span class="sub">${this.state.pageCount} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    const pageCount = this.state.pageCount;
    const cols = Math.min(pageCount, 6);

    results.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;">
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Định dạng</label>
          <select id="format-select" class="form-select">
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Chất lượng (DPI)</label>
          <select id="dpi-select" class="form-select">
            <option value="100">100 DPI (nhẹ)</option>
            <option value="150" selected>150 DPI (cân bằng)</option>
            <option value="200">200 DPI (rõ)</option>
            <option value="300">300 DPI (sắc nét)</option>
          </select>
        </div>
        <div style="display:flex;align-items:flex-end;">
          <button class="btn btn-primary" id="btn-convert-all" style="height:38px;">
            ⬇️ Tải tất cả ${this.state.pageCount} trang
          </button>
        </div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:0.9rem;color:var(--text-muted);">Xem trước — click để tải từng trang</h3>
      <div class="thumbnail-grid" id="thumbnail-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${pages.map((p, i) => `
          <div class="thumbnail-card clickable" data-page="${i}" title="Click để tải trang ${i+1}">
            <img src="${p.thumbnail}" alt="Trang ${i+1}" loading="lazy">
            <span class="page-number">${i+1}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Bind events
    document.getElementById('format-select').addEventListener('change', (e) => {
      this.format = e.target.value;
    });
    document.getElementById('dpi-select').addEventListener('change', (e) => {
      this.dpi = parseInt(e.target.value);
    });
    document.getElementById('btn-convert-all').addEventListener('click', () => this.convertAll());

    document.querySelectorAll('.thumbnail-card.clickable').forEach(card => {
      card.addEventListener('click', () => {
        const pageIdx = parseInt(card.dataset.page);
        this.convertSingle(pageIdx);
      });
    });
  }

  async convertAll() {
    const btn = document.getElementById('btn-convert-all');
    btn.disabled = true;
    btn.textContent = '⏳ Đang chuyển đổi...';

    try {
      await this.convertAndDownloadAll();
      showToast(`Đã chuyển đổi ${this.state.pageCount} trang thành ${this.format.toUpperCase()}!`, 'success');
    } catch (err) {
      console.error('Convert error:', err);
      showToast('Lỗi chuyển đổi: ' + err.message, 'error');
    }

    btn.textContent = `⬇️ Tải tất cả ${this.state.pageCount} trang`;
    btn.disabled = false;
  }

  async convertSingle(pageIdx) {
    try {
      const page = await this.state.pdfjsDoc.getPage(pageIdx + 1);
      const scale = this.dpi / 72;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const mimeType = this.format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = this.format === 'png' ? undefined : 0.92;
      const dataUrl = canvas.toDataURL(mimeType, quality);

      const name = `${this.state.fileName.replace(/\.pdf$/i, '')}_trang${pageIdx+1}.${this.format}`;
      PDFEngine.downloadDataUrl(dataUrl, name);
    } catch (err) {
      showToast('Lỗi tải trang: ' + err.message, 'error');
    }
  }

  async convertAndDownloadAll() {
    // Use backend if available for better quality
    try {
      const resp = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(1000) });
      if (resp.ok) {
        return this._downloadAllBackend();
      }
    } catch {}

    // Client-side fallback: render each page
    const formData = new FormData();
    formData.append('file', new Blob([this.state.bytes], { type: 'application/pdf' }), this.state.fileName);

    try {
      const resp = await fetch(`${this.backendUrl}/pdf-to-images?format=${this.format}&dpi=${this.dpi}`, {
        method: 'POST',
        body: formData
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.state.fileName.replace(/\.pdf$/i, '')}_pages.${this.state.pageCount > 1 ? 'zip' : this.format}`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {}

    // Pure client-side fallback
    showToast('Đang chuyển đổi từng trang...', 'info');
    for (let i = 0; i < this.state.pageCount; i++) {
      await this.convertSingle(i);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  async _downloadAllBackend() {
    const formData = new FormData();
    formData.append('file', new Blob([this.state.bytes], { type: 'application/pdf' }), this.state.fileName);

    const resp = await fetch(`${this.backendUrl}/pdf-to-images?format=${this.format}&dpi=${this.dpi}`, {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) throw new Error(await resp.text());

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.state.fileName.replace(/\.pdf$/i, '')}_pages.${this.state.pageCount > 1 ? 'zip' : this.format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new PDFToJpgTool();
export default tool;
