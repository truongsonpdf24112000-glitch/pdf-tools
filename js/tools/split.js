// js/tools/split.js — Tool: Tách trang PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFSplitTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      pages: [],
      selectedPages: new Set(),
      fileName: '',
      fileSize: 0
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
        <p class="sub">Chọn trang muốn tách, sau đó tải về file PDF mới</p>
        <p class="file-info">Hỗ trợ tách 1 hoặc nhiều trang</p>
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
    if (file.size > 100 * 1024 * 1024) {
      showToast('File PDF quá lớn (tối đa 100MB)', 'error');
      return;
    }

    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      const buffer = await file.arrayBuffer();
      const { pdfDoc, pdfjsDoc, pageCount } = await PDFEngine.load(buffer);
      const scale = pageCount > 50 ? 0.2 : 0.35;
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, scale);

      this.state = {
        pdfDoc, pdfjsDoc, pages,
        selectedPages: new Set(),
        fileName: file.name,
        fileSize: file.size
      };

      hideLoading();
      this.renderResults();
    } catch (err) {
      hideLoading();
      console.error('Split load error:', err);
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  renderResults() {
    const { pages, selectedPages, fileName, fileSize } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;

    results.innerHTML = `
      <div class="toolbar">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span class="page-count">📑 Click vào trang để chọn (đã chọn: <strong id="selected-count">0</strong>)</span>
          <button class="btn btn-secondary btn-sm" id="btn-select-all">Chọn tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-deselect-all">Bỏ chọn</button>
        </div>
        <button class="btn btn-primary" id="btn-split" disabled>
          ✂️ Tách trang đã chọn
        </button>
      </div>
      <div class="thumbnail-grid" id="thumbnail-grid"
           style="grid-template-columns: repeat(${cols}, 180px);">
        ${pages.map((p, idx) => `
          <div class="thumbnail-card selectable ${selectedPages.has(idx) ? 'selected' : ''}"
               data-page-index="${idx}">
            <img src="${p.thumbnail}" alt="Trang ${idx + 1}" width="${p.width}" height="${p.height}">
            <span class="page-number">${idx + 1}</span>
            <div class="select-overlay">
              <span class="select-check">✓</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Update upload zone
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📄</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(fileName)}</h3>
        <span class="sub">${formatFileSize(fileSize)} · ${pages.length} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    this.setupSelection();
    this.setupSplitButton();
  }

  setupSelection() {
    const cards = document.querySelectorAll('.thumbnail-card.selectable');

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.pageIndex);
        if (this.state.selectedPages.has(idx)) {
          this.state.selectedPages.delete(idx);
          card.classList.remove('selected');
        } else {
          this.state.selectedPages.add(idx);
          card.classList.add('selected');
        }
        this.updateCount();
      });
    });

    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      this.state.selectedPages = new Set(this.state.pages.map((_, i) => i));
      document.querySelectorAll('.thumbnail-card.selectable').forEach(c => c.classList.add('selected'));
      this.updateCount();
    });

    document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
      this.state.selectedPages = new Set();
      document.querySelectorAll('.thumbnail-card.selectable').forEach(c => c.classList.remove('selected'));
      this.updateCount();
    });

    this.updateCount();
  }

  updateCount() {
    const count = this.state.selectedPages.size;
    const el = document.getElementById('selected-count');
    if (el) el.textContent = count;

    const btn = document.getElementById('btn-split');
    if (btn) btn.disabled = count === 0;
  }

  setupSplitButton() {
    document.getElementById('btn-split')?.addEventListener('click', async () => {
      if (this.state.selectedPages.size === 0) return;

      const indices = Array.from(this.state.selectedPages).sort((a, b) => a - b);
      const btn = document.getElementById('btn-split');
      btn.disabled = true;
      btn.textContent = '⏳ Đang tách trang...';

      try {
        const pdfBytes = await PDFEngine.extractPages(this.state.pdfDoc, indices);
        const outName = this.state.fileName.replace(/\.pdf$/i, '_tach.pdf');
        PDFEngine.download(pdfBytes, outName);
        btn.textContent = '✅ Đã tải xong';
        showToast(`Đã tách ${indices.length} trang!`, 'success');
      } catch (err) {
        console.error('Split error:', err);
        showToast('Có lỗi khi tách trang', 'error');
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '✂️ Tách trang đã chọn';
        }, 2000);
      }
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new PDFSplitTool();
export default tool;
