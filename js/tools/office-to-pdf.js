// js/tools/office-to-pdf.js — Tool: Word / Excel / PowerPoint → PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class OfficeToPdfTool {
  constructor() {
    this.state = {
      file: null,       // {name, size, type}
      bytes: null
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
        <div class="upload-icon">📝➡️📄</div>
        <h3>Kéo thả file Word, Excel hoặc PowerPoint vào đây</h3>
        <p class="sub">Chuyển đổi tài liệu văn phòng sang PDF</p>
        <p class="sub" style="margin-top:4px;font-size:0.7rem;">Hỗ trợ: .docx, .xlsx, .pptx, .doc, .xls, .ppt</p>
      </div>
      <input type="file" id="file-input" accept=".docx,.doc,.xlsx,.xls,.pptx,.ppt" hidden>
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
    const validExts = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExts.includes(ext)) {
      showToast('Vui lòng chọn file Word, Excel hoặc PowerPoint', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('File quá lớn (tối đa 50MB)', 'error');
      return;
    }

    const buffer = await file.arrayBuffer();
    this.state.file = { name: file.name, size: file.size, ext };
    this.state.bytes = new Uint8Array(buffer);

    this.renderSelection();
  }

  renderSelection() {
    const { file } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    // Update upload zone
    const zone = document.getElementById('upload-zone');
    const iconMap = { '.docx': '📝', '.doc': '📝', '.xlsx': '📊', '.xls': '📊', '.pptx': '📽️', '.ppt': '📽️' };
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">${iconMap[file.ext] || '📄'}</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(file.name)}</h3>
        <span class="sub">${formatFileSize(file.size)}</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    const typeNames = {
      '.docx': 'Word (.docx)', '.doc': 'Word (.doc)',
      '.xlsx': 'Excel (.xlsx)', '.xls': 'Excel (.xls)',
      '.pptx': 'PowerPoint (.pptx)', '.ppt': 'PowerPoint (.ppt)'
    };

    results.innerHTML = `
      <div class="convert-card">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:3rem;">${iconMap[file.ext]}➡️📄</span>
        </div>
        <h2 style="text-align:center;margin-bottom:8px;">${this.escapeHtml(file.name)}</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:4px;">
          ${typeNames[file.ext]} · ${formatFileSize(file.size)}
        </p>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;">
          Sẽ được chuyển đổi sang PDF
        </p>

        <button class="btn btn-primary" id="btn-convert" style="width:100%;padding:14px;font-size:1rem;">
          🔄 Chuyển đổi sang PDF
        </button>
        <p id="backend-status" style="font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);"></p>
      </div>
    `;

    this.checkBackend();
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
      document.getElementById('backend-status').innerHTML = '⚠️ Backend chưa chạy. Chạy: <code>backend/.venv/bin/python3 backend/server.py</code>';
      document.getElementById('backend-status').style.color = 'var(--warning)';
    }
  }

  async convert() {
    const btn = document.getElementById('btn-convert');
    btn.disabled = true;
    btn.textContent = '⏳ Đang chuyển đổi sang PDF...';

    try {
      const formData = new FormData();
      formData.append('file', new Blob([this.state.bytes]), this.state.file.name);

      const resp = await fetch(`${this.backendUrl}/convert`, {
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
      a.download = this.state.file.name.replace(/\.[^.]+$/, '.pdf');
      a.click();
      URL.revokeObjectURL(url);

      showToast('Đã chuyển đổi sang PDF!', 'success');
    } catch (err) {
      console.error('Convert error:', err);
      if (err.message.includes('LibreOffice not installed')) {
        showToast('Cần cài LibreOffice: sudo apt install libreoffice', 'error');
      } else {
        showToast('Lỗi chuyển đổi: ' + err.message, 'error');
      }
    }

    btn.textContent = '🔄 Chuyển đổi sang PDF';
    btn.disabled = false;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new OfficeToPdfTool();
export default tool;
