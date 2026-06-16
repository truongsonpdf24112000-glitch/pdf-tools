// js/tools/special.js — Công cụ chuyên dụng: So sánh, Bates, Scan, Sửa lỗi
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

const MODES = [
  { id: 'compare', label: 'So sánh', icon: '🔍', desc: 'So sánh 2 file PDF, line-by-line diff, % khớp' },
  { id: 'bates',   label: 'Bates',   icon: '🔢', desc: 'Đánh số Bates — tài liệu pháp lý, chứng từ' },
  { id: 'scan',    label: 'Scan',    icon: '📸', desc: 'Chụp ảnh / upload ảnh, tạo PDF' },
  { id: 'repair',  label: 'Sửa lỗi', icon: '🔧', desc: 'Sửa PDF bị lỗi, hỏng, không mở được' },
];

class SpecialTools {
  constructor() {
    this.mode = 'compare';

    // ── Compare state ─────────────────────────────────────────
    this.fileA = null;   // { name, size, bytes, pdfjsDoc, text, pages }
    this.fileB = null;

    // ── Bates state ───────────────────────────────────────────
    this.batesDoc = null;       // pdfDoc (pdf-lib)
    this.batesBytes = null;     // Uint8Array
    this.batesPdfjsDoc = null;
    this.batesPages = [];       // thumbnails
    this.batesFileName = '';
    this.batesFileSize = 0;
    this.prefix = 'EXHIBIT-';
    this.startNum = 1;
    this.digits = 6;
    this.position = 'bottom-right';
    this.fontSize = 10;
    this.skipFirst = false;

    // ── Scan state ────────────────────────────────────────────
    this.captures = [];   // [{ dataUrl, width, height, name }]
    this.stream = null;
    this.pageSize = 'a4';
    this.scanSortable = null;

    // ── Repair state ──────────────────────────────────────────
    this.repairBytes = null;
    this.repairFileName = '';
    this.repairFileSize = 0;
    this.backendUrl = null;
  }

  async init() {
    // Pre-fetch backend URL for repair mode
    try {
      const { getBackendUrl } = await import('../utils/config.js');
      this.backendUrl = await getBackendUrl();
    } catch { /* no backend */ }
    this.render();
    this.setupEvents();
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════

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
              title="${m.label}: ${m.desc}">
        <span class="mode-icon">${m.icon}</span>
        <span class="mode-label">${m.label}</span>
      </button>
    `).join('');
    container.appendChild(modeBar);

    // Mode-specific content area
    const contentArea = document.createElement('div');
    contentArea.id = 'special-content';
    container.appendChild(contentArea);

    // Results area (hidden initially)
    const results = document.createElement('div');
    results.id = 'results-area';
    results.style.display = 'none';
    container.appendChild(results);

    // Render mode-specific content
    this.renderModeContent();

    // Bind mode buttons
    this.bindModeButtons();
  }

  renderModeContent() {
    const content = document.getElementById('special-content');
    switch (this.mode) {
      case 'compare': this.renderCompare(content); break;
      case 'bates':   this.renderBates(content);   break;
      case 'scan':    this.renderScan(content);    break;
      case 'repair':  this.renderRepair(content);  break;
    }
  }

  bindModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newMode = btn.dataset.mode;
        if (newMode !== this.mode) {
          this.mode = newMode;
          // Reset results area
          const results = document.getElementById('results-area');
          results.style.display = 'none';
          results.innerHTML = '';
          // Stop camera if switching away from scan
          if (this.stream) this.stopCamera();
          // Re-render
          this.render();
        }
      });
    });
  }

  setupEvents() {
    // Common drag-over handling on container — prevent default drop
    const container = document.getElementById('tool-container');
    container.addEventListener('dragover', e => e.preventDefault());
    container.addEventListener('drop', e => e.preventDefault());
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODE 1: COMPARE — So sánh 2 file PDF
  // ═══════════════════════════════════════════════════════════════

  renderCompare(content) {
    content.innerHTML = `
      <div class="compare-dual">
        <div class="compare-side">
          <div class="upload-zone" id="zone-a"><div class="upload-icon">📄</div><h3>File A (bản gốc)</h3><p class="sub">Kéo thả hoặc click để chọn</p></div>
          <input type="file" id="file-a" accept=".pdf,application/pdf" hidden>
        </div>
        <div class="compare-vs">VS</div>
        <div class="compare-side">
          <div class="upload-zone" id="zone-b"><div class="upload-icon">📄</div><h3>File B (bản so sánh)</h3><p class="sub">Kéo thả hoặc click để chọn</p></div>
          <input type="file" id="file-b" accept=".pdf,application/pdf" hidden>
        </div>
      </div>`;

    this.setupCompareEvents();
  }

  setupCompareEvents() {
    for (const side of ['a', 'b']) {
      const zone = document.getElementById(`zone-${side}`);
      const input = document.getElementById(`file-${side}`);
      if (!zone || !input) continue;

      zone.addEventListener('click', () => input.click());
      input.addEventListener('change', e => { if (e.target.files[0]) this.handleCompareFile(side, e.target.files[0]); });
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) this.handleCompareFile(side, e.dataTransfer.files[0]);
      });
    }
  }

  async handleCompareFile(side, file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Chọn file PDF', 'error'); return; }
    const zone = document.getElementById(`zone-${side}`);
    zone.className = 'upload-zone compact';
    zone.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(file.name)}</h3><span class="sub">${formatFileSize(file.size)} — Đang đọc...</span></div>`;

    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const { pdfjsDoc, pageCount } = await PDFEngine.load(buf);
      const text = await this.extractText(pdfjsDoc);
      const obj = { name: file.name, size: file.size, bytes, pdfjsDoc, text, pages: pageCount };
      if (side === 'a') this.fileA = obj; else this.fileB = obj;
      zone.querySelector('.sub').textContent = `${formatFileSize(file.size)} · ${pageCount} trang ✅`;

      if (this.fileA && this.fileB) this.showCompareButton();
    } catch (e) {
      zone.querySelector('.sub').textContent = '❌ Lỗi đọc file';
      console.error(e);
    }
  }

  extractText(doc) {
    const texts = [];
    const promises = [];
    for (let i = 1; i <= doc.numPages; i++) {
      promises.push(
        doc.getPage(i).then(page =>
          page.getTextContent().then(tc => texts.push(tc.items.map(it => it.str).join(' ')))
        )
      );
    }
    return Promise.all(promises).then(() => texts.join('\n'));
  }

  showCompareButton() {
    const r = document.getElementById('results-area');
    r.style.display = 'block';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '🔍 So sánh ngay';
    btn.style.cssText = 'display:block;margin:20px auto;padding:14px 40px;font-size:1rem;';
    btn.addEventListener('click', () => this.runCompare());
    r.innerHTML = '';
    r.appendChild(btn);
  }

  async runCompare() {
    const btn = document.querySelector('#results-area .btn-primary');
    btn.disabled = true; btn.textContent = '⏳ Đang so sánh...';

    const a = this.fileA, b = this.fileB;
    const linesA = a.text.split('\n').filter(l => l.trim());
    const linesB = b.text.split('\n').filter(l => l.trim());

    const maxLen = Math.max(linesA.length, linesB.length);
    const diffs = [];
    let matchCount = 0;

    for (let i = 0; i < maxLen; i++) {
      const la = linesA[i] || '';
      const lb = linesB[i] || '';
      if (la.trim() === lb.trim()) {
        diffs.push({ type: 'match', a: la, b: lb });
        matchCount++;
      } else if (!la) {
        diffs.push({ type: 'added', a: '', b: lb });
      } else if (!lb) {
        diffs.push({ type: 'removed', a: la, b: '' });
      } else {
        const charDiff = this.charDiff(la, lb);
        diffs.push({ type: 'changed', a: la, b: lb, charDiff });
      }
    }

    const percent = linesA.length > 0 ? Math.round(matchCount / linesA.length * 100) : 0;
    this.renderCompareDiff(a, b, diffs, percent, matchCount, maxLen);
  }

  charDiff(a, b) {
    const result = [];
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        result.push({ type: 'same', char: a[i] });
        i++; j++;
      } else {
        if (i < a.length) { result.push({ type: 'rem', char: a[i] }); i++; }
        if (j < b.length) { result.push({ type: 'add', char: b[j] }); j++; }
      }
    }
    return result;
  }

  renderCompareDiff(a, b, diffs, percent, matchCount, total) {
    const r = document.getElementById('results-area');
    const color = percent >= 90 ? 'var(--success)' : percent >= 50 ? 'var(--warning)' : 'var(--danger)';

    r.innerHTML = `
      <div class="convert-card" style="max-width:900px;">
        <div style="text-align:center;margin-bottom:16px;">
          <span style="font-size:2rem;display:block;color:${color};">${percent}% khớp</span>
          <span style="font-size:0.85rem;color:var(--text-muted);">${matchCount}/${total} dòng khớp</span>
        </div>

        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <div style="flex:1;">
            <h4 style="margin:0 0 6px;">📄 ${this.esc(a.name)} (${a.pages} trang)</h4>
          </div>
          <div style="flex:1;">
            <h4 style="margin:0 0 6px;">📄 ${this.esc(b.name)} (${b.pages} trang)</h4>
          </div>
        </div>

        <div class="diff-list" style="max-height:500px;overflow-y:auto;">
          ${diffs.map((d, i) => `
            <div class="diff-line diff-${d.type}">
              <span class="diff-num">${i+1}</span>
              <div class="diff-content">
                <div class="diff-a">${d.a ? this.esc(d.a) : '<span style="color:var(--text-muted);">(trống)</span>'}</div>
                <div class="diff-b">${d.b ? this.esc(d.b) : '<span style="color:var(--text-muted);">(trống)</span>'}</div>
                ${d.charDiff ? `<div class="diff-char-detail">${d.charDiff.map(c => {
                  if (c.type === 'same') return `<span class="dc-same">${this.esc(c.char)}</span>`;
                  if (c.type === 'rem') return `<span class="dc-rem">${this.esc(c.char)}</span>`;
                  return `<span class="dc-add">${this.esc(c.char)}</span>`;
                }).join('')}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODE 2: BATES — Đánh số Bates
  // ═══════════════════════════════════════════════════════════════

  renderBates(content) {
    content.innerHTML = `
      <div class="upload-zone" id="bates-upload-zone">
        <div class="upload-icon">🔢</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Đánh số Bates — dùng cho tài liệu pháp lý, chứng từ</p>
      </div>
      <input type="file" id="bates-file-input" accept=".pdf,application/pdf" hidden>`;

    this.setupBatesEvents();
  }

  setupBatesEvents() {
    const zone = document.getElementById('bates-upload-zone');
    const input = document.getElementById('bates-file-input');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { if (e.target.files[0]) this.handleBatesFile(e.target.files[0]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this.handleBatesFile(e.dataTransfer.files[0]);
    });
  }

  async handleBatesFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Chọn file PDF', 'error'); return; }
    const container = document.getElementById('tool-container');
    showLoading(container);
    try {
      const buf = await file.arrayBuffer();
      const { pdfDoc, pdfjsDoc, bytes, pageCount } = await PDFEngine.load(buf);
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, 0.15);
      this.batesDoc = pdfDoc;
      this.batesBytes = bytes;
      this.batesPdfjsDoc = pdfjsDoc;
      this.batesPages = pages;
      this.batesFileName = file.name;
      this.batesFileSize = file.size;
      hideLoading();
      this.renderBatesConfig();
    } catch (e) {
      hideLoading();
      showToast('Lỗi đọc PDF', 'error');
    }
  }

  renderBatesConfig() {
    const zone = document.getElementById('bates-upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(this.batesFileName)}</h3><span class="sub">${this.batesPages.length} trang</span></div><button class="change-btn" id="bates-chg-btn">Đổi file</button>`;
    document.getElementById('bates-chg-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('bates-file-input').click(); });

    const r = document.getElementById('results-area');
    r.style.display = 'block';
    r.innerHTML = `
      <div class="convert-card" style="max-width:600px;">
        <h3 style="margin-bottom:16px;">🔢 Cấu hình Bates Numbering</h3>

        <div class="form-group"><label>Tiền tố (Prefix)</label>
          <input class="form-input" id="b-prefix" value="${this.esc(this.prefix)}" placeholder="VD: EXHIBIT-, ABC-"></div>

        <div style="display:flex;gap:12px;">
          <div class="form-group" style="flex:1;"><label>Bắt đầu từ số</label>
            <input type="number" class="form-input" id="b-start" value="${this.startNum}" min="1"></div>
          <div class="form-group" style="flex:1;"><label>Số chữ số (zero-pad)</label>
            <input type="number" class="form-input" id="b-digits" value="${this.digits}" min="1" max="12"></div>
        </div>

        <div style="display:flex;gap:12px;">
          <div class="form-group" style="flex:1;"><label>Cỡ chữ</label>
            <input type="number" class="form-input" id="b-size" value="${this.fontSize}" min="6" max="36"></div>
          <div class="form-group" style="flex:1;"><label>Vị trí</label>
            <select id="b-pos" class="form-select">
              <option value="bottom-right" ${this.position === 'bottom-right' ? 'selected' : ''}>Dưới phải</option>
              <option value="bottom-center" ${this.position === 'bottom-center' ? 'selected' : ''}>Dưới giữa</option>
              <option value="bottom-left" ${this.position === 'bottom-left' ? 'selected' : ''}>Dưới trái</option>
              <option value="top-right" ${this.position === 'top-right' ? 'selected' : ''}>Trên phải</option>
              <option value="top-left" ${this.position === 'top-left' ? 'selected' : ''}>Trên trái</option>
            </select></div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-primary);margin-bottom:16px;">
          <input type="checkbox" id="b-skip" ${this.skipFirst ? 'checked' : ''}> Bỏ qua trang đầu (trang bìa)
        </label>

        <div style="background:var(--bg-input);padding:12px;border-radius:8px;text-align:center;margin-bottom:16px;">
          <span style="font-size:0.75rem;color:var(--text-muted);">Xem trước:</span>
          <span style="font-weight:700;font-size:1.1rem;display:block;margin-top:4px;" id="b-preview">${this.prefix}${String(this.startNum).padStart(this.digits, '0')}</span>
        </div>

        <button class="btn btn-primary" id="btn-bates-apply" style="width:100%;padding:14px;">🔢 Đánh số Bates</button>
      </div>`;

    // Preview update
    const updatePreview = () => {
      this.prefix = document.getElementById('b-prefix').value;
      this.startNum = parseInt(document.getElementById('b-start').value) || 1;
      this.digits = parseInt(document.getElementById('b-digits').value) || 6;
      document.getElementById('b-preview').textContent = this.prefix + String(this.startNum).padStart(this.digits, '0');
    };
    ['b-prefix', 'b-start', 'b-digits'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updatePreview);
    });

    document.getElementById('btn-bates-apply').addEventListener('click', () => this.applyBates());
  }

  async applyBates() {
    const btn = document.getElementById('btn-bates-apply');
    btn.disabled = true; btn.textContent = '⏳ Đang đánh số...';
    try {
      this.prefix = document.getElementById('b-prefix').value;
      this.startNum = parseInt(document.getElementById('b-start').value) || 1;
      this.digits = parseInt(document.getElementById('b-digits').value) || 6;
      this.fontSize = parseInt(document.getElementById('b-size').value) || 10;
      this.position = document.getElementById('b-pos').value;
      this.skipFirst = document.getElementById('b-skip').checked;

      const doc = await PDFLib.PDFDocument.load(this.batesBytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const pages = doc.getPages();
      const mmToPt = 72 / 25.4;

      pages.forEach((page, i) => {
        if (this.skipFirst && i === 0) return;
        const num = this.prefix + String(this.startNum + (this.skipFirst ? i - 1 : i)).padStart(this.digits, '0');
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(num, this.fontSize);
        const margin = 10 * mmToPt;
        let x, y;

        switch (this.position) {
          case 'bottom-right': x = width - textWidth - margin; y = margin + this.fontSize; break;
          case 'bottom-center': x = (width - textWidth) / 2; y = margin + this.fontSize; break;
          case 'bottom-left': x = margin; y = margin + this.fontSize; break;
          case 'top-right': x = width - textWidth - margin; y = height - margin; break;
          case 'top-left': x = margin; y = height - margin; break;
          default: x = width - textWidth - margin; y = margin + this.fontSize;
        }

        page.drawText(num, { x, y, size: this.fontSize, font, color: PDFLib.rgb(0.3, 0.3, 0.3) });
      });

      const out = await doc.save();
      PDFEngine.download(out, this.batesFileName.replace(/\.pdf$/i, '_bates.pdf'));
      showToast('Đã đánh số Bates!', 'success');
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    btn.textContent = '🔢 Đánh số Bates'; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODE 3: SCAN — Chụp ảnh / upload ảnh → PDF
  // ═══════════════════════════════════════════════════════════════

  renderScan(content) {
    content.innerHTML = `
      <div class="convert-card" style="max-width:700px;">
        <h3 style="text-align:center;margin-bottom:8px;">📸 Scan to PDF</h3>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:16px;">Chụp ảnh tài liệu bằng camera và tạo file PDF</p>

        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <button class="btn btn-primary" id="btn-start-cam" style="flex:1;padding:14px;">📷 Mở Camera</button>
          <button class="btn btn-secondary" id="btn-upload-img" style="flex:1;padding:14px;">📁 Upload ảnh</button>
          <input type="file" id="img-upload" accept="image/*" multiple hidden>
        </div>

        <div id="camera-area" style="display:none;text-align:center;margin-bottom:16px;">
          <video id="camera-video" autoplay playsinline style="width:100%;max-height:400px;border-radius:8px;background:#000;"></video>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-primary" id="btn-capture" style="flex:1;">📸 Chụp</button>
            <button class="btn btn-secondary" id="btn-stop-cam" style="flex:1;">⏹️ Tắt</button>
          </div>
        </div>

        <div id="scan-preview-area">
          ${this.captures.length === 0
            ? '<p style="text-align:center;color:var(--text-muted);">Chưa có ảnh nào. Chụp hoặc upload ảnh để bắt đầu.</p>'
            : this.renderScanCaptures()}
        </div>

        ${this.captures.length > 0
          ? `<div style="display:flex;gap:12px;margin-top:16px;">
              <div class="form-group" style="flex:1;"><label>Khổ giấy</label>
                <select id="page-size" class="form-select"><option value="a4" ${this.pageSize === 'a4' ? 'selected' : ''}>A4</option><option value="letter" ${this.pageSize === 'letter' ? 'selected' : ''}>Letter</option><option value="original" ${this.pageSize === 'original' ? 'selected' : ''}>Kích thước gốc</option></select></div>
              <button class="btn btn-primary" id="btn-create-pdf" style="flex:1;height:42px;align-self:flex-end;">📄 Tạo PDF (${this.captures.length} ảnh)</button>
            </div>`
          : ''}
      </div>`;

    this.setupScanEvents();
    if (this.captures.length > 1) this.initScanSortable();
  }

  renderScanCaptures() {
    const cols = Math.min(this.captures.length, 4);
    return `
      <div class="thumbnail-grid" id="capture-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${this.captures.map((cap, i) => `
          <div class="thumbnail-card" data-index="${i}" style="position:relative;cursor:grab;">
            <img src="${cap.dataUrl}" alt="Scan ${i+1}" loading="lazy">
            <span class="page-number">${i+1}</span>
            <button class="btn-delete-scan" data-idx="${i}" style="position:absolute;top:4px;right:4px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;">✕</button>
          </div>
        `).join('')}
      </div>
      <p style="font-size:0.7rem;color:var(--text-muted);text-align:center;margin-top:8px;">↕️ Kéo thả để sắp xếp thứ tự · ✕ để xóa</p>`;
  }

  setupScanEvents() {
    const content = document.getElementById('special-content');

    // Use event delegation on content
    const handler = (e) => {
      if (e.target.id === 'btn-start-cam') { this.startCamera(); return; }
      if (e.target.id === 'btn-stop-cam') { this.stopCamera(); return; }
      if (e.target.id === 'btn-capture') { this.capture(); return; }
      if (e.target.id === 'btn-upload-img') { document.getElementById('img-upload').click(); return; }
      if (e.target.id === 'btn-create-pdf') { this.createScanPdf(); return; }
      if (e.target.classList.contains('btn-delete-scan')) {
        this.captures.splice(parseInt(e.target.dataset.idx), 1);
        this.renderScan(document.getElementById('special-content'));
        this.setupScanEvents();
        if (this.captures.length > 1) this.initScanSortable();
        return;
      }
    };

    // Remove old handler if any, add new
    if (this._scanHandler) content.removeEventListener('click', this._scanHandler);
    this._scanHandler = handler;
    content.addEventListener('click', handler);

    // Image upload input
    const imgInput = document.getElementById('img-upload');
    if (imgInput) {
      imgInput.addEventListener('change', async e => {
        for (const file of [...e.target.files]) {
          const dataUrl = await this.readFile(file);
          const dims = await this.getDimensions(dataUrl);
          this.captures.push({ dataUrl, width: dims.width, height: dims.height, name: file.name });
        }
        this.renderScan(document.getElementById('special-content'));
        this.setupScanEvents();
        if (this.captures.length > 1) this.initScanSortable();
      });
    }
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
      const video = document.getElementById('camera-video');
      if (video) {
        video.srcObject = this.stream;
        document.getElementById('camera-area').style.display = 'block';
        document.getElementById('btn-start-cam').style.display = 'none';
      }
    } catch (e) {
      showToast('Không truy cập được camera: ' + e.message, 'error');
    }
  }

  stopCamera() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    const camArea = document.getElementById('camera-area');
    const btnStart = document.getElementById('btn-start-cam');
    if (camArea) camArea.style.display = 'none';
    if (btnStart) btnStart.style.display = '';
  }

  capture() {
    const video = document.getElementById('camera-video');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    this.captures.push({ dataUrl, width: canvas.width, height: canvas.height, name: `scan_${Date.now()}.jpg` });
    this.renderScan(document.getElementById('special-content'));
    this.setupScanEvents();
    if (this.captures.length > 1) this.initScanSortable();
    showToast('Đã chụp!', 'success');
  }

  initScanSortable() {
    const grid = document.getElementById('capture-grid');
    if (!grid) return;
    if (this.scanSortable) this.scanSortable.destroy();
    this.scanSortable = new Sortable(grid, {
      animation: 200, ghostClass: 'sortable-ghost',
      onEnd: (evt) => {
        const item = this.captures.splice(evt.oldIndex, 1)[0];
        this.captures.splice(evt.newIndex, 0, item);
        this.renderScan(document.getElementById('special-content'));
        this.setupScanEvents();
        this.initScanSortable();
      }
    });
  }

  async createScanPdf() {
    const btn = document.getElementById('btn-create-pdf');
    btn.disabled = true; btn.textContent = '⏳ Đang tạo...';
    try {
      const sizeEl = document.getElementById('page-size');
      if (sizeEl) this.pageSize = sizeEl.value;

      const sizes = { a4: [595.28, 841.89], letter: [612, 792] };
      const pdfDoc = await PDFLib.PDFDocument.create();

      for (const cap of this.captures) {
        let pw, ph;
        if (this.pageSize === 'original') { pw = cap.width; ph = cap.height; }
        else { [pw, ph] = sizes[this.pageSize] || sizes.a4; }

        const page = pdfDoc.addPage([pw, ph]);
        const base64 = cap.dataUrl.split(',')[1];
        const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        let img;
        try { img = await pdfDoc.embedJpg(imgBytes); } catch { img = await pdfDoc.embedPng(imgBytes); }

        const ratio = img.width / img.height;
        const pageRatio = pw / ph;
        let dw, dh;
        if (ratio > pageRatio) { dw = pw - 40; dh = dw / ratio; }
        else { dh = ph - 40; dw = dh * ratio; }
        page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      }

      const out = await pdfDoc.save();
      PDFEngine.download(out, 'scan.pdf');
      showToast('Đã tạo PDF!', 'success');
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    btn.textContent = `📄 Tạo PDF (${this.captures.length} ảnh)`; btn.disabled = false;
  }

  readFile(file) {
    return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  }

  getDimensions(u) {
    return new Promise(r => { const i = new Image(); i.onload = () => r({ width: i.width, height: i.height }); i.src = u; });
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODE 4: REPAIR — Sửa PDF bị lỗi
  // ═══════════════════════════════════════════════════════════════

  renderRepair(content) {
    content.innerHTML = `
      <div class="upload-zone" id="repair-upload-zone">
        <div class="upload-icon">🔧</div>
        <h3>Kéo thả file PDF bị lỗi vào đây</h3>
        <p class="sub">Tự động sửa các lỗi cấu trúc PDF, file bị hỏng nhẹ</p>
        <p class="sub" style="font-size:0.7rem;margin-top:4px;">Dành cho PDF không mở được, báo lỗi, hoặc tải về bị lỗi</p>
      </div>
      <input type="file" id="repair-file-input" accept=".pdf,application/pdf" hidden>`;

    this.setupRepairEvents();
  }

  setupRepairEvents() {
    const zone = document.getElementById('repair-upload-zone');
    const input = document.getElementById('repair-file-input');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { if (e.target.files[0]) this.handleRepairFile(e.target.files[0]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this.handleRepairFile(e.dataTransfer.files[0]);
    });
  }

  async handleRepairFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Chọn file PDF', 'error'); return; }
    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      this.repairBytes = bytes;
      this.repairFileName = file.name;
      this.repairFileSize = file.size;

      const issues = this.detectIssues(bytes);
      hideLoading();
      this.renderRepairResults(issues);
    } catch (e) {
      hideLoading();
      this.renderRepairResults([{ level: 'warning', msg: 'Không thể phân tích file — có thể file bị hỏng nặng' }]);
    }
  }

  detectIssues(bytes) {
    const issues = [];
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (!header.startsWith('%PDF')) issues.push({ level: 'error', msg: 'Thiếu header %PDF — file có thể không phải PDF' });

    const lastBytes = bytes.slice(-1024);
    const lastText = new TextDecoder().decode(lastBytes);
    if (!lastText.includes('%%EOF')) issues.push({ level: 'warning', msg: 'Thiếu %%EOF marker — file tải không hoàn chỉnh' });

    if (bytes.length < 100) issues.push({ level: 'warning', msg: `File quá nhỏ (${bytes.length} bytes) — có thể bị hỏng` });

    if (issues.length === 0) issues.push({ level: 'info', msg: 'Không phát hiện lỗi rõ ràng — vẫn có thể sửa để tối ưu' });
    return issues;
  }

  renderRepairResults(issues) {
    const zone = document.getElementById('repair-upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(this.repairFileName)}</h3><span class="sub">${formatFileSize(this.repairFileSize)}</span></div><button class="change-btn" id="repair-chg-btn">Đổi file</button>`;
    document.getElementById('repair-chg-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('repair-file-input').click(); });

    const levelIcons = { error: '🔴', warning: '🟡', info: '🔵' };
    const levelColors = { error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--text-muted)' };

    const r = document.getElementById('results-area');
    r.style.display = 'block';
    r.innerHTML = `
      <div class="convert-card" style="max-width:600px;">
        <div style="text-align:center;margin-bottom:24px;"><span style="font-size:3rem;">🔧</span></div>
        <h2 style="text-align:center;">Sửa PDF</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:16px;">${this.esc(this.repairFileName)} · ${formatFileSize(this.repairFileSize)}</p>

        <div style="background:var(--bg-input);padding:16px;border-radius:8px;margin-bottom:16px;">
          <h4 style="margin:0 0 8px;">Kết quả phân tích:</h4>
          ${issues.map(i => `<div style="color:${levelColors[i.level]};font-size:0.85rem;margin-bottom:4px;">${levelIcons[i.level]} ${i.msg}</div>`).join('')}
        </div>

        <div class="form-group"><label>Phương pháp sửa</label>
          <select id="repair-method" class="form-select">
            <option value="basic" selected>🔧 Cơ bản — copy pages sang PDF mới (sửa hầu hết lỗi)</option>
            <option value="deep">🔧🔧 Sâu — render lại từng trang (cho file hỏng nặng, chậm hơn)</option>
          </select></div>

        <div id="backend-info" style="font-size:0.75rem;text-align:center;margin-bottom:12px;"></div>

        <button class="btn btn-primary" id="btn-repair" style="width:100%;padding:14px;">🔧 Sửa PDF</button>

        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:16px;">
          <strong>Cách hoạt động:</strong><br>
          <strong>Cơ bản:</strong> Đọc từng trang PDF → copy sang file mới → bỏ qua các phần bị lỗi<br>
          <strong>Sâu:</strong> Render từng trang thành ảnh → tạo PDF mới (mất text, nhưng đảm bảo sửa được)
        </p>
      </div>`;

    // Backend info
    const info = document.getElementById('backend-info');
    if (info) {
      if (this.backendUrl) {
        info.innerHTML = '<span style="color:var(--success);">✅ Backend sẵn sàng — dùng pikepdf để sửa chuyên sâu</span>';
      } else {
        info.innerHTML = '<span style="color:var(--text-muted);">⚡ Client-side repair — phù hợp hầu hết trường hợp</span>';
      }
    }

    document.getElementById('btn-repair').addEventListener('click', () => this.runRepair());
  }

  async runRepair() {
    const btn = document.getElementById('btn-repair');
    btn.disabled = true; btn.textContent = '⏳ Đang sửa...';
    const method = document.getElementById('repair-method').value;

    try {
      let outputBytes;

      if (this.backendUrl) {
        try {
          const fd = new FormData();
          fd.append('file', new Blob([this.repairBytes], { type: 'application/pdf' }), this.repairFileName);
          const resp = await fetch(`${this.backendUrl}/repair`, {
            method: 'POST', body: fd, signal: AbortSignal.timeout(30000)
          });
          if (resp.ok) {
            outputBytes = new Uint8Array(await resp.arrayBuffer());
          }
        } catch { /* fallback to client-side */ }
      }

      if (!outputBytes) {
        if (method === 'deep') {
          outputBytes = await this.deepRepair();
        } else {
          outputBytes = await this.basicRepair();
        }
      }

      PDFEngine.download(outputBytes, this.repairFileName.replace(/\.pdf$/i, '_repaired.pdf'));
      showToast('Đã sửa PDF! File mới đã được tạo.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Không thể sửa file này: ' + e.message, 'error');
    }
    btn.textContent = '🔧 Sửa PDF'; btn.disabled = false;
  }

  async basicRepair() {
    const bytes = this.repairBytes;
    let doc;
    try {
      doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      throw new Error('File PDF quá hỏng, không thể đọc được. Thử phương pháp Sâu.');
    }

    const newDoc = await PDFLib.PDFDocument.create();
    const pageCount = doc.getPageCount();
    if (pageCount === 0) throw new Error('Không tìm thấy trang nào trong PDF');

    const indices = Array.from({ length: pageCount }, (_, i) => i);
    const copiedPages = await newDoc.copyPages(doc, indices);
    copiedPages.forEach(p => newDoc.addPage(p));

    return await newDoc.save({ useObjectStreams: true });
  }

  async deepRepair() {
    const bytes = this.repairBytes;
    let pdfjsDoc;
    try {
      pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(), disableAutoFetch: true }).promise;
    } catch {
      throw new Error('File quá hỏng, không thể render trang nào');
    }

    const newDoc = await PDFLib.PDFDocument.create();
    const btn = document.getElementById('btn-repair');

    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      if (btn) btn.textContent = `⏳ Render trang ${i}/${pdfjsDoc.numPages}...`;
      const page = await pdfjsDoc.getPage(i);
      const vp = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const jpg = canvas.toDataURL('image/jpeg', 0.9);
      const jpgBytes = Uint8Array.from(atob(jpg.split(',')[1]), c => c.charCodeAt(0));
      const img = await newDoc.embedJpg(jpgBytes);
      const p = newDoc.addPage([vp.width, vp.height]);
      p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
    }

    return await newDoc.save();
  }

  // ═══════════════════════════════════════════════════════════════
  //  UTILS
  // ═══════════════════════════════════════════════════════════════

  esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

const tool = new SpecialTools();
export default tool;
