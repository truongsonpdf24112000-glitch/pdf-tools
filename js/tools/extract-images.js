// js/tools/extract-images.js — Tool: Trích xuất ảnh từ PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class ExtractImagesTool {
  constructor() {
    this.state = {
      bytes: null,
      fileName: '',
      fileSize: 0,
      pageCount: 0
    };
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
        <p class="sub">Trích xuất tất cả ảnh có trong file PDF</p>
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
      const bytes = new Uint8Array(buffer);
      const { pageCount } = await PDFEngine.load(buffer);

      this.state = {
        bytes,
        fileName: file.name,
        fileSize: file.size,
        pageCount
      };

      hideLoading();
      this.renderSelection();
    } catch (err) {
      hideLoading();
      console.error('Load error:', err);
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  renderSelection() {
    const { fileName, fileSize, pageCount } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📄</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(fileName)}</h3>
        <span class="sub">${formatFileSize(fileSize)} · ${pageCount} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    results.innerHTML = `
      <div class="convert-card">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:3rem;">📄➡️🖼️</span>
        </div>
        <h2 style="text-align:center;margin-bottom:8px;">Trích xuất ảnh từ PDF</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:4px;">
          ${this.escapeHtml(fileName)} · ${pageCount} trang
        </p>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;">
          Tất cả ảnh trong PDF sẽ được trích xuất và tải về dạng ZIP
        </p>

        <button class="btn btn-primary" id="btn-extract" style="width:100%;padding:14px;font-size:1rem;">
          🔍 Trích xuất ảnh
        </button>
        <p id="backend-status" style="font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);"></p>
      </div>
    `;

    this.checkBackend();
    document.getElementById('btn-extract').addEventListener('click', () => this.extract());
  }

  async checkBackend() {
    try {
      const resp = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        document.getElementById('backend-status').textContent = '✅ Backend đã sẵn sàng';
        document.getElementById('backend-status').style.color = 'var(--success)';
      }
    } catch {
      document.getElementById('backend-status').innerHTML = '⚠️ Backend chưa chạy. Chạy: <code>backend/.venv/bin/python3 backend/server.py</code>';
      document.getElementById('backend-status').style.color = 'var(--warning)';
    }
  }

  async extract() {
    const btn = document.getElementById('btn-extract');
    btn.disabled = true;
    btn.textContent = '⏳ Đang trích xuất ảnh...';

    try {
      const formData = new FormData();
      formData.append('file', new Blob([this.state.bytes], { type: 'application/pdf' }), this.state.fileName);

      const resp = await fetch(`${this.backendUrl}/extract-images`, {
        method: 'POST',
        body: formData
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Extract failed');
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.state.fileName.replace(/\.pdf$/i, '_images.zip');
      a.click();
      URL.revokeObjectURL(url);

      showToast('Đã trích xuất ảnh thành công!', 'success');
    } catch (err) {
      console.error('Extract error:', err);
      if (err.message.includes('No images found')) {
        showToast('Không tìm thấy ảnh nào trong PDF này', 'error');
      } else {
        showToast('Lỗi: ' + err.message, 'error');
      }
    }

    btn.textContent = '🔍 Trích xuất ảnh';
    btn.disabled = false;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new ExtractImagesTool();
export default tool;
