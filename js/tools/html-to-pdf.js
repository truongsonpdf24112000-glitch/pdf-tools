// js/tools/html-to-pdf.js — Tool: HTML → PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class HtmlToPdfTool {
  constructor() {
    this.state = {
      bytes: null,
      fileName: '',
      mode: 'file'  // file | url | code
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
      <div class="convert-card" style="max-width:600px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:3rem;">🌐➡️📄</span>
        </div>
        <h2 style="text-align:center;margin-bottom:8px;">HTML → PDF</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;">
          Chuyển đổi trang web hoặc file HTML sang PDF
        </p>

        <div class="mode-tabs" id="mode-tabs">
          <button class="mode-tab active" data-mode="file">📁 File HTML</button>
          <button class="mode-tab" data-mode="url">🔗 URL</button>
          <button class="mode-tab" data-mode="code">💻 Code HTML</button>
        </div>

        <div id="mode-content" style="margin-top:20px;"></div>

        <div id="upload-content">
          <div class="upload-zone" id="upload-zone" style="padding:40px;">
            <div class="upload-icon">📁</div>
            <h3>Kéo thả file HTML vào đây</h3>
            <p class="sub">hoặc click để chọn file .html</p>
          </div>
          <input type="file" id="file-input" accept=".html,.htm" hidden>
        </div>

        <div id="url-content" style="display:none;">
          <div class="form-group">
            <label>Nhập URL trang web</label>
            <input type="url" id="url-input" class="form-input" placeholder="https://example.com" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);">
          </div>
        </div>

        <div id="code-content" style="display:none;">
          <div class="form-group">
            <label>Dán code HTML vào đây</label>
            <textarea id="code-input" class="form-input" placeholder="<html>...</html>" rows="12" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-family:monospace;resize:vertical;"></textarea>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-convert" style="width:100%;padding:14px;margin-top:20px;font-size:1rem;">
          🔄 Chuyển đổi sang PDF
        </button>
        <p id="backend-status" style="font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);"></p>
      </div>
    `;

    this.checkBackend();
    this.setupModeTabs();
    this.setupUpload();
  }

  setupModeTabs() {
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.state.mode = tab.dataset.mode;

        document.getElementById('upload-content').style.display = this.state.mode === 'file' ? 'block' : 'none';
        document.getElementById('url-content').style.display = this.state.mode === 'url' ? 'block' : 'none';
        document.getElementById('code-content').style.display = this.state.mode === 'code' ? 'block' : 'none';
      });
    });
  }

  setupUpload() {
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

    document.getElementById('btn-convert').addEventListener('click', () => this.convert());
  }

  async handleFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!['.html', '.htm'].includes(ext)) {
      showToast('Vui lòng chọn file HTML', 'error');
      return;
    }

    this.state.fileName = file.name;
    this.state.bytes = new Uint8Array(await file.arrayBuffer());

    // Update upload zone
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📁</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(file.name)}</h3>
        <span class="sub">${formatFileSize(file.size)} — sẵn sàng chuyển đổi</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });
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

  async convert() {
    const btn = document.getElementById('btn-convert');
    btn.disabled = true;
    btn.textContent = '⏳ Đang chuyển đổi...';

    try {
      let formData = new FormData();
      let downloadName = 'page.pdf';

      if (this.state.mode === 'file') {
        if (!this.state.bytes) {
          showToast('Vui lòng chọn file HTML trước', 'error');
          btn.disabled = false;
          btn.textContent = '🔄 Chuyển đổi sang PDF';
          return;
        }
        formData.append('file', new Blob([this.state.bytes], { type: 'text/html' }), this.state.fileName);
        downloadName = this.state.fileName.replace(/\.html?$/i, '.pdf');
      } else if (this.state.mode === 'url') {
        const url = document.getElementById('url-input').value.trim();
        if (!url) {
          showToast('Vui lòng nhập URL', 'error');
          btn.disabled = false;
          btn.textContent = '🔄 Chuyển đổi sang PDF';
          return;
        }

        // Fetch the URL content first
        const pageResp = await fetch(url);
        const html = await pageResp.text();
        const urlName = new URL(url).hostname || 'webpage';
        formData.append('file', new Blob([html], { type: 'text/html' }), `${urlName}.html`);
        downloadName = `${urlName}.pdf`;
      } else if (this.state.mode === 'code') {
        const code = document.getElementById('code-input').value.trim();
        if (!code) {
          showToast('Vui lòng dán code HTML', 'error');
          btn.disabled = false;
          btn.textContent = '🔄 Chuyển đổi sang PDF';
          return;
        }
        formData.append('file', new Blob([code], { type: 'text/html' }), 'code.html');
        downloadName = 'code.pdf';
      }

      const resp = await fetch(`${this.backendUrl}/convert?type=html-to-pdf`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000)
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);

      showToast('Đã chuyển đổi sang PDF!', 'success');
    } catch (err) {
      console.error('Convert error:', err);
      if (err.name === 'TimeoutError') {
        showToast('Yêu cầu mất quá nhiều thời gian. Thử lại với URL đơn giản hơn.', 'error');
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

const tool = new HtmlToPdfTool();
export default tool;
