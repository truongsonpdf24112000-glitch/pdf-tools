// js/tools/pdf-to-office.js — Tool: PDF → Word / Excel / PowerPoint
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFToOfficeTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      bytes: null,
      pageCount: 0,
      fileName: '',
      fileSize: 0
    };
    this.targetFormat = 'word';
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
        <div class="upload-icon">📄➡️📝</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Chuyển đổi PDF sang Word, Excel hoặc PowerPoint</p>
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

    if (file.size > 50 * 1024 * 1024) {
      showToast('File PDF quá lớn (tối đa 50MB)', 'error');
      return;
    }

    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      const buffer = await file.arrayBuffer();
      const result = await PDFEngine.load(buffer);

      this.state = {
        pdfDoc: result.pdfDoc,
        pdfjsDoc: result.pdfjsDoc,
        bytes: result.bytes,
        pageCount: result.pageCount,
        fileName: file.name,
        fileSize: file.size
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

    // Compact upload zone
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
          <span style="font-size:3rem;">📄➡️</span>
        </div>
        <h2 style="text-align:center;margin-bottom:8px;">Chọn định dạng đầu ra</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;">
          Chuyển ${this.escapeHtml(fileName)} sang định dạng văn phòng
        </p>

        <div class="convert-options">
          <button class="convert-option active" data-format="word">
            <span class="c-icon">📝</span>
            <span class="c-label">Word (.docx)</span>
            <span class="c-desc">Tài liệu có thể chỉnh sửa</span>
          </button>
          <button class="convert-option" data-format="excel">
            <span class="c-icon">📊</span>
            <span class="c-label">Excel (.xlsx)</span>
            <span class="c-desc">Bảng tính, dữ liệu</span>
          </button>
          <button class="convert-option" data-format="ppt">
            <span class="c-icon">📽️</span>
            <span class="c-label">PowerPoint (.pptx)</span>
            <span class="c-desc">Bài thuyết trình</span>
          </button>
        </div>

        <button class="btn btn-primary" id="btn-convert" style="width:100%;padding:14px;margin-top:20px;font-size:1rem;">
          🔄 Chuyển đổi ngay
        </button>
        <p id="backend-status" style="font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);"></p>
      </div>
    `;

    // Check backend
    this.checkBackend();

    // Format selection
    document.querySelectorAll('.convert-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.convert-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.targetFormat = btn.dataset.format;
      });
    });

    document.getElementById('btn-convert').addEventListener('click', () => this.convert());
  }

  async checkBackend() {
    try {
      const resp = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        document.getElementById('backend-status').textContent = '✅ Backend chuyển đổi đã sẵn sàng';
        document.getElementById('backend-status').style.color = 'var(--success)';
      }
    } catch {
      document.getElementById('backend-status').innerHTML = '⚠️ Backend chưa chạy. Chạy lệnh: <code>backend/.venv/bin/python3 backend/server.py</code>';
      document.getElementById('backend-status').style.color = 'var(--warning)';
    }
  }

  async convert() {
    const btn = document.getElementById('btn-convert');
    btn.disabled = true;

    const formatNames = { word: 'Word', excel: 'Excel', ppt: 'PowerPoint' };
    const typeMap = { word: 'pdf-to-word', excel: 'pdf-to-excel', ppt: 'pdf-to-ppt' };
    const extMap = { word: '.docx', excel: '.xlsx', ppt: '.pptx' };

    btn.textContent = `⏳ Đang chuyển sang ${formatNames[this.targetFormat]}...`;

    try {
      const formData = new FormData();
      formData.append('file', new Blob([this.state.bytes], { type: 'application/pdf' }), this.state.fileName);

      const resp = await fetch(`${this.backendUrl}/convert?type=${typeMap[this.targetFormat]}`, {
        method: 'POST',
        body: formData
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.state.fileName.replace(/\.pdf$/i, extMap[this.targetFormat]);
      a.click();
      URL.revokeObjectURL(url);

      showToast(`Đã chuyển đổi sang ${formatNames[this.targetFormat]}!`, 'success');
    } catch (err) {
      console.error('Convert error:', err);
      if (err.message.includes('LibreOffice not installed')) {
        showToast('Cần cài LibreOffice: sudo apt install libreoffice', 'error');
      } else {
        showToast('Lỗi chuyển đổi: ' + err.message, 'error');
      }
    }

    btn.textContent = '🔄 Chuyển đổi ngay';
    btn.disabled = false;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new PDFToOfficeTool();
export default tool;
