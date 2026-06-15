// js/tools/compress.js — Tool: Nén PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFCompressTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      bytes: null,
      fileName: '',
      originalSize: 0,
      pageCount: 0
    };

    this.quality = 'medium'; // high | medium | low
    this.backendAvailable = false;
    this.backendUrl = 'http://localhost:5001';
  }

  init() {
    this.render();
    this.setupEvents();
    this.checkBackend();
  }

  render() {
    const container = document.getElementById('tool-container');
    container.innerHTML = '';
    container.style.position = 'relative';

    container.innerHTML = `
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">📦</div>
        <h3>Kéo thả file PDF vào đây để nén</h3>
        <p class="sub">Giảm kích thước file PDF mà vẫn giữ chất lượng</p>
        <p class="file-info" id="backend-status">Đang kiểm tra backend...</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
      <div id="results-area" style="display:none;"></div>
    `;
  }

  async checkBackend() {
    try {
      const resp = await fetch(this.backendUrl + '/health', { mode: 'cors', signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        this.backendAvailable = true;
        document.getElementById('backend-status').textContent = '✅ Backend nén PDF đã sẵn sàng';
      }
    } catch {
      this.backendAvailable = false;
      document.getElementById('backend-status').textContent = '⚡ Nén cơ bản (backend không khả dụng)';
    }
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
      const { pdfDoc, pageCount } = await PDFEngine.load(buffer);

      this.state = {
        pdfDoc,
        bytes,
        fileName: file.name,
        originalSize: file.size,
        pageCount,
        compressedSize: null
      };

      hideLoading();
      this.renderCompressUI();
    } catch (err) {
      hideLoading();
      console.error('Compress load error:', err);
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  renderCompressUI() {
    const { fileName, originalSize, pageCount } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    results.innerHTML = `
      <div class="compress-card">
        <div class="compress-icon">📦</div>
        <h2>${this.escapeHtml(fileName)}</h2>
        <p>${pageCount} trang · Kích thước gốc: <strong>${formatFileSize(originalSize)}</strong></p>

        <div class="form-group" style="margin-top:24px;">
          <label>Chất lượng nén</label>
          <div class="quality-options">
            <button class="quality-btn active" data-quality="medium">
              <span class="q-icon">⚡</span>
              <span class="q-label">Trung bình</span>
              <span class="q-desc">Cân bằng giữa chất lượng & kích thước</span>
            </button>
            <button class="quality-btn" data-quality="high">
              <span class="q-icon">✨</span>
              <span class="q-label">Cao</span>
              <span class="q-desc">Giữ chất lượng tốt nhất</span>
            </button>
            <button class="quality-btn" data-quality="low">
              <span class="q-icon">🗜️</span>
              <span class="q-label">Thấp</span>
              <span class="q-desc">Kích thước nhỏ nhất</span>
            </button>
          </div>
        </div>

        <div id="compress-result" style="display:none;margin-top:20px;">
          <div class="size-comparison">
            <div class="size-bar">
              <div class="size-before" style="width:100%;">
                <span>${formatFileSize(originalSize)}</span>
              </div>
            </div>
            <div class="size-arrow">⬇️</div>
            <div class="size-bar">
              <div class="size-after" id="size-after-bar">
                <span id="size-after-text">---</span>
              </div>
            </div>
          </div>
          <p class="size-reduction" id="size-reduction"></p>
        </div>

        <button class="btn btn-primary" id="btn-compress" style="margin-top:24px;width:100%;padding:14px;">
          📦 Nén PDF
        </button>

        ${!this.backendAvailable ? `
          <p style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;text-align:center;">
            ⚡ Đang dùng chế độ nén cơ bản. Để nén tốt hơn, chạy backend: <code>python3 backend/compress_server.py</code>
          </p>
        ` : `
          <p style="font-size:0.75rem;color:var(--success);margin-top:8px;text-align:center;">
            ✅ Backend pikepdf đã sẵn sàng — nén chất lượng cao
          </p>
        `}
      </div>
    `;

    // Upload zone compact
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📄</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(fileName)}</h3>
        <span class="sub">${formatFileSize(originalSize)} · ${pageCount} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    this.bindEvents();
  }

  bindEvents() {
    // Quality buttons
    document.querySelectorAll('.quality-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.quality = btn.dataset.quality;
      });
    });

    // Compress button
    document.getElementById('btn-compress')?.addEventListener('click', () => this.compress());
  }

  async compress() {
    const btn = document.getElementById('btn-compress');
    btn.disabled = true;
    btn.textContent = '⏳ Đang nén...';

    try {
      let compressedBytes;
      let compressedSize;

      if (this.backendAvailable) {
        // Use backend
        compressedBytes = await this.compressBackend();
        compressedSize = compressedBytes.length;
      } else {
        // Use basic pdf-lib compression
        compressedBytes = await this.compressBasic();
        compressedSize = compressedBytes.length;
      }

      this.state.compressedSize = compressedSize;

      // Show result
      const result = document.getElementById('compress-result');
      result.style.display = 'block';

      const ratio = ((1 - compressedSize / this.state.originalSize) * 100).toFixed(1);
      const afterBar = document.getElementById('size-after-bar');
      const afterText = document.getElementById('size-after-text');
      const reduction = document.getElementById('size-reduction');

      const barPercent = Math.max(10, (compressedSize / this.state.originalSize) * 100);
      afterBar.style.width = barPercent + '%';
      afterText.textContent = formatFileSize(compressedSize);
      reduction.textContent = `Giảm ${ratio}% (tiết kiệm ${formatFileSize(this.state.originalSize - compressedSize)})`;
      reduction.style.color = ratio > 10 ? 'var(--success)' : 'var(--warning)';

      // Enable download
      btn.textContent = '⬇️ Tải PDF đã nén';
      btn.disabled = false;
      btn.onclick = () => {
        const outName = this.state.fileName.replace(/\.pdf$/i, '_nen.pdf');
        PDFEngine.download(compressedBytes, outName);
        showToast('PDF đã nén đang được tải về!', 'success');
      };

    } catch (err) {
      console.error('Compress error:', err);
      showToast('Có lỗi khi nén PDF: ' + err.message, 'error');
      btn.textContent = '📦 Nén PDF';
      btn.disabled = false;
    }
  }

  async compressBackend() {
    const formData = new FormData();
    formData.append('file', new Blob([this.state.bytes], { type: 'application/pdf' }), this.state.fileName);
    formData.append('quality', this.quality);

    const resp = await fetch(this.backendUrl + '/compress', {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(errText || 'Backend nén thất bại');
    }

    return new Uint8Array(await resp.arrayBuffer());
  }

  async compressBasic() {
    // Use pdf-lib's built-in save which does stream compression
    // For better results, we create a fresh doc and copy pages
    const newDoc = await PDFLib.PDFDocument.create();
    const pageCount = this.state.pdfDoc.getPageCount();
    const indices = Array.from({ length: pageCount }, (_, i) => i);
    const copiedPages = await newDoc.copyPages(this.state.pdfDoc, indices);

    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    // Save with compression
    const compressed = await newDoc.save({
      useObjectStreams: true,
      addDefaultPage: false
    });

    return compressed;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new PDFCompressTool();
export default tool;
