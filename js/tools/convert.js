// js/tools/convert.js — Chuyển đổi định dạng: PDF↔Office, PDF↔Ảnh, HTML→PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';
import { getBackendUrl } from '../utils/config.js';

const MODES = [
  { id: 'pdf-to-office', label: 'PDF→Office', icon: '📄➡️📝', desc: 'PDF sang Word, Excel, PowerPoint' },
  { id: 'office-to-pdf', label: 'Office→PDF', icon: '📝➡️📄', desc: 'Word, Excel, PowerPoint sang PDF' },
  { id: 'pdf-to-jpg',    label: 'PDF→Ảnh',   icon: '📄➡️🖼️', desc: 'PDF sang JPG hoặc PNG' },
  { id: 'jpg-to-pdf',    label: 'Ảnh→PDF',   icon: '🖼️➡️📄', desc: 'JPG, PNG sang PDF' },
  { id: 'html-to-pdf',   label: 'HTML→PDF',  icon: '🌐➡️📄', desc: 'Trang web hoặc code HTML sang PDF' },
];

class PDFConvertTool {
  constructor() {
    this.mode = 'pdf-to-office';
    this.backendUrl = 'http://localhost:5001';

    // Common state
    this.fileName = '';
    this.fileSize = 0;
    this.bytes = null;         // Uint8Array
    this.pdfDoc = null;
    this.pdfjsDoc = null;
    this.pageCount = 0;
    this.pages = [];           // thumbnails for pdf-to-jpg

    // Mode-specific state
    this.targetFormat = 'word';        // pdf-to-office
    this.imageFormat = 'jpg';          // pdf-to-jpg
    this.dpi = 150;                    // pdf-to-jpg
    this.imageFiles = [];              // jpg-to-pdf
    this.imageOrientation = 'portrait';// jpg-to-pdf
    this.imagePageSize = 'a4';         // jpg-to-pdf
    this.htmlMode = 'file';            // html-to-pdf
  }

  async init() {
    this.backendUrl = await getBackendUrl() || 'http://localhost:5001';
    this.render();
    this.setupEvents();
  }

  // ─── RENDER ────────────────────────────────────────────────

  render() {
    const container = document.getElementById('tool-container');
    container.innerHTML = '';
    container.style.position = 'relative';

    // Mode toolbar
    const modeBar = document.createElement('div');
    modeBar.className = 'mode-toolbar';
    modeBar.id = 'mode-toolbar';
    modeBar.innerHTML = MODES.map(m => `
      <button class="mode-btn ${m.id === this.mode ? 'active' : ''}" data-mode="${m.id}"
              title="${m.desc}">
        <span class="mode-icon">${m.icon}</span>
        <span class="mode-label">${m.label}</span>
      </button>
    `).join('');
    container.appendChild(modeBar);

    // Content area
    const content = document.createElement('div');
    content.id = 'convert-content';
    container.appendChild(content);

    this.bindModeButtons();
    this.renderModeContent();
  }

  bindModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newMode = btn.dataset.mode;
        if (newMode !== this.mode) {
          this.mode = newMode;
          this.render(); // full re-render for clean state
        }
      });
    });
  }

  renderModeContent() {
    const content = document.getElementById('convert-content');
    content.innerHTML = '';

    switch (this.mode) {
      case 'pdf-to-office': this.renderPdfToOffice(content); break;
      case 'office-to-pdf': this.renderOfficeToPdf(content); break;
      case 'pdf-to-jpg':    this.renderPdfToJpg(content);    break;
      case 'jpg-to-pdf':    this.renderJpgToPdf(content);    break;
      case 'html-to-pdf':   this.renderHtmlToPdf(content);   break;
    }
  }

  // ─── COMMON HELPERS ───────────────────────────────────────

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async checkBackend(container) {
    try {
      const resp = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
      const el = container.querySelector('#backend-status');
      if (resp.ok && el) {
        el.textContent = '✅ Backend đã sẵn sàng';
        el.style.color = 'var(--success)';
      }
    } catch {
      const el = container.querySelector('#backend-status');
      if (el) {
        el.innerHTML = '⚠️ Backend chưa chạy. Chạy: <code>backend/.venv/bin/python3 backend/server.py</code>';
        el.style.color = 'var(--warning)';
      }
    }
  }

  createUploadZone(accept, multiple, icon, title, sub) {
    const zone = document.createElement('div');
    zone.className = 'upload-zone';
    zone.id = 'upload-zone';
    zone.innerHTML = `
      <div class="upload-icon">${icon}</div>
      <h3>${title}</h3>
      <p class="sub">${sub}</p>
      ${this.fileName && this.mode !== 'jpg-to-pdf' && this.mode !== 'html-to-pdf' ?
        `<p class="file-info">Đã chọn: ${this.escapeHtml(this.fileName)}</p>` : ''}
    `;
    return zone;
  }

  // ─── PDF → OFFICE ──────────────────────────────────────────

  renderPdfToOffice(container) {
    container.innerHTML = `
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">📄➡️📝</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Chuyển đổi PDF sang Word, Excel hoặc PowerPoint</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
      <div id="results-area" style="display:none;"></div>
    `;
    this.setupPdfUpload((file) => this.handlePdfToOffice(file));
    this.checkBackend(container);
  }

  async handlePdfToOffice(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Vui lòng chọn file PDF', 'error'); return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('File quá lớn (tối đa 50MB)', 'error'); return;
    }
    const cont = document.getElementById('tool-container');
    showLoading(cont);
    try {
      const buffer = await file.arrayBuffer();
      const { pdfDoc, pdfjsDoc, bytes, pageCount } = await PDFEngine.load(buffer);
      this.pdfDoc = pdfDoc; this.pdfjsDoc = pdfjsDoc;
      this.bytes = bytes; this.pageCount = pageCount;
      this.fileName = file.name; this.fileSize = file.size;
      hideLoading();
      this.showPdfToOfficeSelection();
    } catch (err) {
      hideLoading();
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  showPdfToOfficeSelection() {
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📄</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(this.fileName)}</h3>
        <span class="sub">${formatFileSize(this.fileSize)} · ${this.pageCount} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation(); document.getElementById('file-input').click();
    });

    const results = document.getElementById('results-area');
    results.style.display = 'block';
    results.innerHTML = `
      <div class="convert-card">
        <div style="text-align:center;margin-bottom:24px;"><span style="font-size:3rem;">📄➡️</span></div>
        <h2 style="text-align:center;margin-bottom:8px;">Chọn định dạng đầu ra</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;">
          Chuyển ${this.escapeHtml(this.fileName)} sang định dạng văn phòng
        </p>
        <div class="convert-options">
          <button class="convert-option active" data-format="word">
            <span class="c-icon">📝</span><span class="c-label">Word (.docx)</span><span class="c-desc">Tài liệu có thể chỉnh sửa</span>
          </button>
          <button class="convert-option" data-format="excel">
            <span class="c-icon">📊</span><span class="c-label">Excel (.xlsx)</span><span class="c-desc">Bảng tính, dữ liệu</span>
          </button>
          <button class="convert-option" data-format="ppt">
            <span class="c-icon">📽️</span><span class="c-label">PowerPoint (.pptx)</span><span class="c-desc">Bài thuyết trình</span>
          </button>
        </div>
        <button class="btn btn-primary" id="btn-convert" style="width:100%;padding:14px;margin-top:20px;font-size:1rem;">
          🔄 Chuyển đổi ngay
        </button>
        <p id="backend-status" style="font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);"></p>
      </div>
    `;
    this.checkBackend(results);

    document.querySelectorAll('.convert-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.convert-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.targetFormat = btn.dataset.format;
      });
    });
    document.getElementById('btn-convert').addEventListener('click', () => this.doPdfToOffice());
  }

  async doPdfToOffice() {
    const btn = document.getElementById('btn-convert');
    const names = { word: 'Word', excel: 'Excel', ppt: 'PowerPoint' };
    const types = { word: 'pdf-to-word', excel: 'pdf-to-excel', ppt: 'pdf-to-ppt' };
    const exts = { word: '.docx', excel: '.xlsx', ppt: '.pptx' };

    btn.disabled = true; btn.textContent = `⏳ Đang chuyển sang ${names[this.targetFormat]}...`;
    try {
      const fd = new FormData();
      fd.append('file', new Blob([this.bytes], { type: 'application/pdf' }), this.fileName);
      const resp = await fetch(`${this.backendUrl}/convert?type=${types[this.targetFormat]}`, { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = this.fileName.replace(/\.pdf$/i, exts[this.targetFormat]);
      a.click(); URL.revokeObjectURL(url);
      showToast(`Đã chuyển đổi sang ${names[this.targetFormat]}!`, 'success');
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
    btn.textContent = '🔄 Chuyển đổi ngay'; btn.disabled = false;
  }

  // ─── OFFICE → PDF ──────────────────────────────────────────

  renderOfficeToPdf(container) {
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
    this.setupGenericUpload(async (file) => {
      const valid = ['.docx','.doc','.xlsx','.xls','.pptx','.ppt'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!valid.includes(ext)) { showToast('Vui lòng chọn file Office', 'error'); return; }
      if (file.size > 50*1024*1024) { showToast('File quá lớn (tối đa 50MB)', 'error'); return; }
      this.fileName = file.name; this.fileSize = file.size;
      this.bytes = new Uint8Array(await file.arrayBuffer());
      this.showOfficeToPdfSelection();
    });
    this.checkBackend(container);
  }

  showOfficeToPdfSelection() {
    const iconMap = {'.docx':'📝','.doc':'📝','.xlsx':'📊','.xls':'📊','.pptx':'📽️','.ppt':'📽️'};
    const ext = '.' + this.fileName.split('.').pop().toLowerCase();
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">${iconMap[ext]||'📄'}</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(this.fileName)}</h3><span class="sub">${formatFileSize(this.fileSize)}</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation(); document.getElementById('file-input').click();
    });

    const typeNames = {'.docx':'Word (.docx)','.doc':'Word (.doc)','.xlsx':'Excel (.xlsx)','.xls':'Excel (.xls)','.pptx':'PowerPoint (.pptx)','.ppt':'PowerPoint (.ppt)'};
    const results = document.getElementById('results-area');
    results.style.display = 'block';
    results.innerHTML = `
      <div class="convert-card">
        <div style="text-align:center;margin-bottom:24px;"><span style="font-size:3rem;">${iconMap[ext]}➡️📄</span></div>
        <h2 style="text-align:center;margin-bottom:8px;">${this.escapeHtml(this.fileName)}</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:4px;">${typeNames[ext]} · ${formatFileSize(this.fileSize)}</p>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;">Sẽ được chuyển đổi sang PDF</p>
        <button class="btn btn-primary" id="btn-convert" style="width:100%;padding:14px;font-size:1rem;">🔄 Chuyển đổi sang PDF</button>
        <p id="backend-status" style="font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);"></p>
      </div>
    `;
    this.checkBackend(results);
    document.getElementById('btn-convert').addEventListener('click', () => this.doOfficeToPdf());
  }

  async doOfficeToPdf() {
    const btn = document.getElementById('btn-convert');
    btn.disabled = true; btn.textContent = '⏳ Đang chuyển đổi sang PDF...';
    try {
      const fd = new FormData();
      fd.append('file', new Blob([this.bytes]), this.fileName);
      const resp = await fetch(`${this.backendUrl}/convert`, { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = this.fileName.replace(/\.[^.]+$/, '.pdf');
      a.click(); URL.revokeObjectURL(url);
      showToast('Đã chuyển đổi sang PDF!', 'success');
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
    btn.textContent = '🔄 Chuyển đổi sang PDF'; btn.disabled = false;
  }

  // ─── PDF → JPG ─────────────────────────────────────────────

  renderPdfToJpg(container) {
    container.innerHTML = `
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">🖼️</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Chuyển đổi từng trang PDF thành ảnh JPG hoặc PNG</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
      <div id="results-area" style="display:none;"></div>
    `;
    this.setupPdfUpload((file) => this.handlePdfToJpg(file));
  }

  async handlePdfToJpg(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Vui lòng chọn file PDF', 'error'); return;
    }
    const cont = document.getElementById('tool-container');
    showLoading(cont);
    try {
      const buffer = await file.arrayBuffer();
      const result = await PDFEngine.load(buffer);
      const pages = await PDFEngine.renderThumbnails(result.pdfjsDoc, 0.5);
      this.pdfDoc = result.pdfDoc; this.pdfjsDoc = result.pdfjsDoc;
      this.bytes = result.bytes; this.pageCount = result.pageCount;
      this.fileName = file.name; this.pages = pages;
      hideLoading();
      this.showPdfToJpgSelection();
    } catch (err) {
      hideLoading();
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  showPdfToJpgSelection() {
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📄</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(this.fileName)}</h3><span class="sub">${this.pageCount} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation(); document.getElementById('file-input').click();
    });

    const cols = Math.min(this.pageCount, 6);
    const results = document.getElementById('results-area');
    results.style.display = 'block';
    results.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;">
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Định dạng</label>
          <select id="format-select" class="form-select">
            <option value="jpg">JPG</option><option value="png">PNG</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Chất lượng (DPI)</label>
          <select id="dpi-select" class="form-select">
            <option value="100">100 DPI (nhẹ)</option><option value="150" selected>150 DPI (cân bằng)</option>
            <option value="200">200 DPI (rõ)</option><option value="300">300 DPI (sắc nét)</option>
          </select>
        </div>
        <div style="display:flex;align-items:flex-end;">
          <button class="btn btn-primary" id="btn-convert-all" style="height:38px;">⬇️ Tải tất cả ${this.pageCount} trang</button>
        </div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:0.9rem;color:var(--text-muted);">Xem trước — click để tải từng trang</h3>
      <div class="thumbnail-grid" id="thumbnail-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${this.pages.map((p, i) => `
          <div class="thumbnail-card clickable" data-page="${i}" title="Click để tải trang ${i+1}">
            <img src="${p.thumbnail}" alt="Trang ${i+1}" loading="lazy">
            <span class="page-number">${i+1}</span>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('format-select').addEventListener('change', e => this.imageFormat = e.target.value);
    document.getElementById('dpi-select').addEventListener('change', e => this.dpi = parseInt(e.target.value));
    document.getElementById('btn-convert-all').addEventListener('click', () => this.doPdfToJpgAll());

    document.querySelectorAll('.thumbnail-card.clickable').forEach(card => {
      card.addEventListener('click', () => this.doPdfToJpgSingle(parseInt(card.dataset.page)));
    });
  }

  async doPdfToJpgSingle(pageIdx) {
    try {
      const page = await this.pdfjsDoc.getPage(pageIdx + 1);
      const scale = this.dpi / 72;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const mime = this.imageFormat === 'png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, this.imageFormat === 'png' ? undefined : 0.92);
      PDFEngine.downloadDataUrl(dataUrl, `${this.fileName.replace(/\.pdf$/i,'')}_trang${pageIdx+1}.${this.imageFormat}`);
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  async doPdfToJpgAll() {
    const btn = document.getElementById('btn-convert-all');
    btn.disabled = true; btn.textContent = '⏳ Đang chuyển đổi...';
    try {
      const fd = new FormData();
      fd.append('file', new Blob([this.bytes], { type: 'application/pdf' }), this.fileName);
      const resp = await fetch(`${this.backendUrl}/pdf-to-images?format=${this.imageFormat}&dpi=${this.dpi}`, { method: 'POST', body: fd });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${this.fileName.replace(/\.pdf$/i,'')}_pages.${this.pageCount > 1 ? 'zip' : this.imageFormat}`;
        a.click(); URL.revokeObjectURL(url);
        showToast(`Đã chuyển đổi ${this.pageCount} trang!`, 'success');
      } else { throw new Error(await resp.text()); }
    } catch {
      // Client-side fallback
      showToast('Đang chuyển đổi từng trang...', 'info');
      for (let i = 0; i < this.pageCount; i++) {
        await this.doPdfToJpgSingle(i);
        await new Promise(r => setTimeout(r, 200));
      }
    }
    btn.textContent = `⬇️ Tải tất cả ${this.pageCount} trang`; btn.disabled = false;
  }

  // ─── JPG → PDF ─────────────────────────────────────────────

  renderJpgToPdf(container) {
    container.innerHTML = `
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">🖼️➡️📄</div>
        <h3>Kéo thả ảnh JPG/PNG vào đây</h3>
        <p class="sub">Chuyển đổi ảnh thành file PDF. Hỗ trợ nhiều ảnh → 1 PDF</p>
      </div>
      <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp,image/bmp" multiple hidden>
      <div id="results-area" style="display:none;"></div>
    `;

    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { if (e.target.files.length) this.handleJpgFiles([...e.target.files]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) this.handleJpgFiles([...e.dataTransfer.files]);
    });
  }

  async handleJpgFiles(files) {
    const imgFiles = files.filter(f => f.type.startsWith('image/'));
    if (!imgFiles.length) { showToast('Vui lòng chọn file ảnh', 'error'); return; }
    const cont = document.getElementById('tool-container');
    showLoading(cont);
    try {
      const data = [];
      for (const file of imgFiles) {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
        });
        const dims = await new Promise((res, rej) => {
          const img = new Image(); img.onload = () => res({ w: img.width, h: img.height });
          img.onerror = rej; img.src = dataUrl;
        });
        data.push({ name: file.name, size: file.size, dataUrl, width: dims.w, height: dims.h });
      }
      this.imageFiles = data;
      hideLoading();
      this.showJpgToPdfSelection();
    } catch (err) {
      hideLoading();
      showToast('Không thể đọc file ảnh', 'error');
    }
  }

  showJpgToPdfSelection() {
    const files = this.imageFiles;
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">🖼️</span>
      <div class="upload-text">
        <h3>${files.length} ảnh đã chọn</h3>
        <span class="sub">Tổng: ${formatFileSize(files.reduce((s,f)=>s+f.size,0))}</span>
      </div>
      <button class="change-btn" id="add-more-btn">+ Thêm ảnh</button>
    `;
    document.getElementById('add-more-btn').addEventListener('click', e => {
      e.stopPropagation(); document.getElementById('file-input').click();
    });

    const cols = Math.min(files.length, 5);
    const results = document.getElementById('results-area');
    results.style.display = 'block';
    results.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;">
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Hướng trang</label>
          <select id="orientation-select" class="form-select">
            <option value="auto">Tự động</option><option value="portrait">Dọc</option><option value="landscape">Ngang</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Khổ giấy</label>
          <select id="pagesize-select" class="form-select">
            <option value="original">Giữ kích thước gốc</option><option value="a4" selected>A4</option><option value="letter">Letter</option>
          </select>
        </div>
        <div style="display:flex;align-items:flex-end;">
          <button class="btn btn-primary" id="btn-convert">📄 Tạo PDF (${files.length} ảnh)</button>
        </div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:0.9rem;color:var(--text-muted);">Ảnh đã chọn — kéo thả để sắp xếp</h3>
      <div class="thumbnail-grid" id="thumbnail-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${files.map((f, i) => `
          <div class="thumbnail-card" data-index="${i}" style="cursor:grab;">
            <img src="${f.dataUrl}" alt="${this.escapeHtml(f.name)}" loading="lazy">
            <span class="page-number">${i+1}</span>
            <span style="display:block;font-size:0.7rem;color:var(--text-muted);padding:4px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${this.escapeHtml(f.name)}</span>
          </div>
        `).join('')}
        ${files.length > 1 ? '<p style="grid-column:1/-1;font-size:0.75rem;color:var(--text-muted);text-align:center;">↕️ Kéo thả để đổi thứ tự trang</p>' : ''}
      </div>
    `;

    if (files.length > 1) {
      new Sortable(document.getElementById('thumbnail-grid'), {
        animation: 200, ghostClass: 'sortable-ghost',
        onEnd: evt => {
          const item = this.imageFiles.splice(evt.oldIndex, 1)[0];
          this.imageFiles.splice(evt.newIndex, 0, item);
          document.querySelectorAll('.thumbnail-card .page-number').forEach((el, i) => el.textContent = i + 1);
        }
      });
    }

    document.getElementById('orientation-select').addEventListener('change', e => this.imageOrientation = e.target.value);
    document.getElementById('pagesize-select').addEventListener('change', e => this.imagePageSize = e.target.value);
    document.getElementById('btn-convert').addEventListener('click', () => this.doJpgToPdf());
  }

  async doJpgToPdf() {
    const btn = document.getElementById('btn-convert');
    btn.disabled = true; btn.textContent = '⏳ Đang tạo PDF...';
    try {
      // Try backend first
      let done = false;
      try {
        const health = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(1000) });
        if (health.ok) {
          const fd = new FormData();
          for (const f of this.imageFiles) {
            const r = await fetch(f.dataUrl); fd.append('files', await r.blob(), f.name);
          }
          const resp = await fetch(`${this.backendUrl}/images-to-pdf`, { method: 'POST', body: fd });
          if (resp.ok) {
            const blob = await resp.blob();
            const ab = await blob.arrayBuffer();
            PDFEngine.download(new Uint8Array(ab), 'images_converted.pdf');
            done = true;
          }
        }
      } catch {}
      if (!done) await this.doJpgToPdfClient();
      showToast('Đã tạo PDF thành công!', 'success');
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
    btn.textContent = `📄 Tạo PDF (${this.imageFiles.length} ảnh)`; btn.disabled = false;
  }

  async doJpgToPdfClient() {
    const { PDFDocument } = PDFLib;
    const sizeMap = { a4: [595.28, 841.89], letter: [612, 792] };
    const pdfDoc = await PDFDocument.create();

    for (const img of this.imageFiles) {
      let pw, ph;
      const [dw, dh] = sizeMap[this.imagePageSize] || [img.width, img.height];
      if (this.imagePageSize === 'original') { pw = img.width; ph = img.height; }
      else if (this.imageOrientation === 'auto') {
        if (img.width > img.height) { pw = dh; ph = dw; } else { pw = dw; ph = dh; }
      } else if (this.imageOrientation === 'landscape') { pw = dh; ph = dw; }
      else { pw = dw; ph = dh; }

      const page = pdfDoc.addPage([pw, ph]);
      const base64 = img.dataUrl.split(',')[1];
      const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      let embedded;
      if (img.dataUrl.startsWith('data:image/png')) embedded = await pdfDoc.embedPng(imgBytes);
      else if (img.dataUrl.startsWith('data:image/jpeg') || img.dataUrl.startsWith('data:image/jpg')) embedded = await pdfDoc.embedJpg(imgBytes);
      else { try { embedded = await pdfDoc.embedJpg(imgBytes); } catch { embedded = await pdfDoc.embedPng(imgBytes); } }

      const ir = img.width / img.height, pr = pw / ph;
      let dw2, dh2;
      if (ir > pr) { dw2 = pw - 40; dh2 = dw2 / ir; } else { dh2 = ph - 40; dw2 = dh2 * ir; }
      page.drawImage(embedded, { x: (pw - dw2) / 2, y: (ph - dh2) / 2, width: dw2, height: dh2 });
    }
    const pdfBytes = await pdfDoc.save();
    PDFEngine.download(pdfBytes, 'images_converted.pdf');
  }

  // ─── HTML → PDF ────────────────────────────────────────────

  renderHtmlToPdf(container) {
    container.innerHTML = `
      <div class="convert-card" style="max-width:600px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:24px;"><span style="font-size:3rem;">🌐➡️📄</span></div>
        <h2 style="text-align:center;margin-bottom:8px;">HTML → PDF</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;">Chuyển đổi trang web hoặc file HTML sang PDF</p>
        <div class="mode-tabs" id="mode-tabs">
          <button class="mode-tab active" data-mode="file">📁 File HTML</button>
          <button class="mode-tab" data-mode="url">🔗 URL</button>
          <button class="mode-tab" data-mode="code">💻 Code HTML</button>
        </div>
        <div id="upload-content">
          <div class="upload-zone" id="upload-zone" style="padding:40px;">
            <div class="upload-icon">📁</div>
            <h3>Kéo thả file HTML vào đây</h3><p class="sub">hoặc click để chọn file .html</p>
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
        <button class="btn btn-primary" id="btn-convert" style="width:100%;padding:14px;margin-top:20px;font-size:1rem;">🔄 Chuyển đổi sang PDF</button>
        <p id="backend-status" style="font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);"></p>
      </div>
    `;

    this.checkBackend(container);

    // Sub-mode tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.htmlMode = tab.dataset.mode;
        document.getElementById('upload-content').style.display = this.htmlMode === 'file' ? 'block' : 'none';
        document.getElementById('url-content').style.display = this.htmlMode === 'url' ? 'block' : 'none';
        document.getElementById('code-content').style.display = this.htmlMode === 'code' ? 'block' : 'none';
      });
    });

    // File upload
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => {
      if (e.target.files[0]) this.handleHtmlFile(e.target.files[0]);
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this.handleHtmlFile(e.dataTransfer.files[0]);
    });

    document.getElementById('btn-convert').addEventListener('click', () => this.doHtmlToPdf());
  }

  async handleHtmlFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!['.html', '.htm'].includes(ext)) { showToast('Vui lòng chọn file HTML', 'error'); return; }
    this.fileName = file.name; this.fileSize = file.size;
    this.bytes = new Uint8Array(await file.arrayBuffer());
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📁</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(file.name)}</h3><span class="sub">${formatFileSize(file.size)} — sẵn sàng</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', e => {
      e.stopPropagation(); document.getElementById('file-input').click();
    });
  }

  async doHtmlToPdf() {
    const btn = document.getElementById('btn-convert');
    btn.disabled = true; btn.textContent = '⏳ Đang chuyển đổi...';
    try {
      let fd = new FormData();
      let dlName = 'page.pdf';

      if (this.htmlMode === 'file') {
        if (!this.bytes) { showToast('Vui lòng chọn file HTML', 'error'); btn.disabled = false; btn.textContent = '🔄 Chuyển đổi sang PDF'; return; }
        fd.append('file', new Blob([this.bytes], { type: 'text/html' }), this.fileName);
        dlName = this.fileName.replace(/\.html?$/i, '.pdf');
      } else if (this.htmlMode === 'url') {
        const url = document.getElementById('url-input').value.trim();
        if (!url) { showToast('Vui lòng nhập URL', 'error'); btn.disabled = false; btn.textContent = '🔄 Chuyển đổi sang PDF'; return; }
        const pageResp = await fetch(url);
        const html = await pageResp.text();
        const urlName = new URL(url).hostname || 'webpage';
        fd.append('file', new Blob([html], { type: 'text/html' }), `${urlName}.html`);
        dlName = `${urlName}.pdf`;
      } else if (this.htmlMode === 'code') {
        const code = document.getElementById('code-input').value.trim();
        if (!code) { showToast('Vui lòng dán code HTML', 'error'); btn.disabled = false; btn.textContent = '🔄 Chuyển đổi sang PDF'; return; }
        fd.append('file', new Blob([code], { type: 'text/html' }), 'code.html');
        dlName = 'code.pdf';
      }

      const resp = await fetch(`${this.backendUrl}/convert?type=html-to-pdf`, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = dlName;
      a.click(); URL.revokeObjectURL(url);
      showToast('Đã chuyển đổi sang PDF!', 'success');
    } catch (err) {
      if (err.name === 'TimeoutError') showToast('Yêu cầu mất quá nhiều thời gian.', 'error');
      else showToast('Lỗi: ' + err.message, 'error');
    }
    btn.textContent = '🔄 Chuyển đổi sang PDF'; btn.disabled = false;
  }

  // ─── UPLOAD SETUP ──────────────────────────────────────────

  setupPdfUpload(handler) {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { if (e.target.files[0]) handler(e.target.files[0]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]); });
  }

  setupGenericUpload(handler) {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { if (e.target.files[0]) handler(e.target.files[0]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]); });
  }
}

const tool = new PDFConvertTool();
export default tool;
