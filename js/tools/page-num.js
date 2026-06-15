// js/tools/page-num.js — Tool: Thêm số trang vào PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFPageNumTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      pages: [],
      pageCount: 0,
      fileName: '',
      fileSize: 0
    };
    
    // Default settings
    this.settings = {
      position: 'bottom-center',  // top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
      fontSize: 12,
      startNumber: 1,
      skipFirst: false,
      prefix: '',
      suffix: '',
      format: '{prefix}{num}{suffix}'  // or '{num}/{total}'
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
        <div class="upload-icon">🔢</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Thêm số trang vào PDF với nhiều tùy chọn</p>
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
      const { pdfDoc, pdfjsDoc, pageCount } = await PDFEngine.load(buffer);
      const scale = pageCount > 50 ? 0.15 : 0.25;
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, scale);

      this.state = {
        pdfDoc, pdfjsDoc, pages, pageCount,
        fileName: file.name,
        fileSize: file.size
      };

      hideLoading();
      this.renderSettings();
    } catch (err) {
      hideLoading();
      console.error('Page num load error:', err);
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  renderSettings() {
    const { pageCount, pages, fileName, fileSize } = this.state;
    const s = this.settings;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    results.innerHTML = `
      <div class="pagenum-layout">
        <!-- Settings panel -->
        <div class="pagenum-settings">
          <h3>⚙️ Tùy chọn số trang</h3>
          
          <div class="form-group">
            <label>Vị trí</label>
            <div class="position-grid">
              ${['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'].map(pos => `
                <button class="pos-btn ${s.position === pos ? 'active' : ''}" data-pos="${pos}">
                  ${pos.replace('-', ' ')}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Cỡ chữ</label>
              <input type="range" min="6" max="24" value="${s.fontSize}" id="font-size" class="range-slider">
              <span class="range-value">${s.fontSize}px</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Bắt đầu từ số</label>
              <input type="number" min="1" max="9999" value="${s.startNumber}" id="start-number" class="form-input">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Tiền tố (vd: "Trang ")</label>
              <input type="text" value="${this.escapeAttr(s.prefix)}" id="prefix" class="form-input" placeholder="vd: Trang ">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Hậu tố (vd: " / ${pageCount}")</label>
              <input type="text" value="${this.escapeAttr(s.suffix)}" id="suffix" class="form-input" placeholder="vd: / ${pageCount}">
            </div>
          </div>

          <div class="form-row">
            <label class="checkbox-label">
              <input type="checkbox" id="skip-first" ${s.skipFirst ? 'checked' : ''}>
              Bỏ qua trang đầu tiên (trang bìa)
            </label>
          </div>

          <div class="preview-box">
            <span class="preview-label">Xem trước:</span>
            <span class="preview-text" id="preview-text">${s.prefix}1${s.suffix}</span>
          </div>
        </div>

        <!-- Preview panel -->
        <div class="pagenum-preview">
          <h3>📄 Xem trước trang đầu</h3>
          <div class="preview-thumbnail" id="preview-thumb">
            <img src="${pages[0].thumbnail}" alt="Trang 1" style="max-width:100%;border-radius:8px;">
            <div class="page-num-overlay ${s.position}" style="font-size:${s.fontSize}px;" id="page-num-overlay">
              ${s.skipFirst ? '' : `${s.prefix}${s.startNumber}${s.suffix}`}
            </div>
          </div>
          ${pageCount > 1 ? `<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;margin-top:8px;">+ ${pageCount - 1} trang khác</p>` : ''}
        </div>
      </div>

      <div style="text-align:center;margin-top:24px;">
        <button class="btn btn-primary btn-lg" id="btn-apply" style="padding:12px 40px;font-size:1rem;">
          🔢 Thêm số trang
        </button>
      </div>
    `;

    // Update upload zone
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

    this.bindSettings();
  }

  bindSettings() {
    // Position buttons
    document.querySelectorAll('.pos-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.position = btn.dataset.pos;
        this.updatePreview();
        this.updateOverlayPosition();
      });
    });

    // Font size
    const fontSize = document.getElementById('font-size');
    fontSize?.addEventListener('input', () => {
      this.settings.fontSize = parseInt(fontSize.value);
      fontSize.nextElementSibling.textContent = fontSize.value + 'px';
      this.updatePreview();
    });

    // Start number
    document.getElementById('start-number')?.addEventListener('input', (e) => {
      this.settings.startNumber = parseInt(e.target.value) || 1;
      this.updatePreview();
    });

    // Prefix
    document.getElementById('prefix')?.addEventListener('input', (e) => {
      this.settings.prefix = e.target.value;
      this.updatePreview();
    });

    // Suffix
    document.getElementById('suffix')?.addEventListener('input', (e) => {
      this.settings.suffix = e.target.value;
      this.updatePreview();
    });

    // Skip first
    document.getElementById('skip-first')?.addEventListener('change', (e) => {
      this.settings.skipFirst = e.target.checked;
      this.updatePreview();
    });

    // Apply button
    document.getElementById('btn-apply')?.addEventListener('click', () => this.applyPageNumbers());
  }

  updatePreview() {
    const s = this.settings;
    const el = document.getElementById('preview-text');
    if (el) {
      el.textContent = `${s.prefix}${s.startNumber}${s.suffix}`;
    }

    // Update overlay
    const overlay = document.getElementById('page-num-overlay');
    if (overlay) {
      overlay.style.fontSize = s.fontSize + 'px';
      overlay.textContent = s.skipFirst ? '' : `${s.prefix}${s.startNumber}${s.suffix}`;
    }
  }

  updateOverlayPosition() {
    const overlay = document.getElementById('page-num-overlay');
    if (overlay) {
      overlay.className = 'page-num-overlay ' + this.settings.position;
    }
  }

  async applyPageNumbers() {
    const btn = document.getElementById('btn-apply');
    btn.disabled = true;
    btn.textContent = '⏳ Đang thêm số trang...';

    try {
      const s = this.settings;
      const pages = this.state.pdfDoc.getPages();
      const pageCount = pages.length;
      
      const helveticaFont = await this.state.pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
      const helveticaBold = await this.state.pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

      for (let i = 0; i < pageCount; i++) {
        // Skip first page if requested
        if (s.skipFirst && i === 0) continue;

        const page = pages[i];
        const { width, height } = page.getSize();
        const pageNum = s.startNumber + i - (s.skipFirst ? 1 : 0);
        const text = `${s.prefix}${pageNum}${s.suffix}`;

        // Calculate position
        const textWidth = helveticaFont.widthOfTextAtSize(text, s.fontSize);
        const margin = 40;
        let x, y;

        const [vPos, hPos] = s.position.split('-');

        // Horizontal
        if (hPos === 'left') x = margin;
        else if (hPos === 'right') x = width - textWidth - margin;
        else x = (width - textWidth) / 2;

        // Vertical
        if (vPos === 'top') y = height - margin;
        else y = margin + s.fontSize;

        // Draw white background for readability
        const bgPad = 4;
        page.drawRectangle({
          x: x - bgPad,
          y: y - s.fontSize - bgPad,
          width: textWidth + bgPad * 2,
          height: s.fontSize + bgPad * 2,
          color: PDFLib.rgb(1, 1, 1),
          opacity: 0.85,
        });

        // Draw text
        page.drawText(text, {
          x,
          y,
          size: s.fontSize,
          font: helveticaFont,
          color: PDFLib.rgb(0.2, 0.2, 0.2),
        });
      }

      const pdfBytes = await this.state.pdfDoc.save();
      const outName = this.state.fileName.replace(/\.pdf$/i, '_sotrang.pdf');
      PDFEngine.download(pdfBytes, outName);

      btn.textContent = '✅ Đã tải xong';
      showToast('Đã thêm số trang!', 'success');
    } catch (err) {
      console.error('Page num error:', err);
      showToast('Có lỗi khi thêm số trang', 'error');
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '🔢 Thêm số trang';
      }, 2000);
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

const tool = new PDFPageNumTool();
export default tool;
