// js/tools/delete.js — Tool: Xóa trang PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFDeleteTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      pages: [],
      deletedPages: new Set(),
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
        <div class="upload-icon">🗑️</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Click vào trang muốn xóa, sau đó tải về PDF mới</p>
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
        deletedPages: new Set(),
        fileName: file.name,
        fileSize: file.size
      };

      hideLoading();
      this.renderResults();
    } catch (err) {
      hideLoading();
      console.error('Delete load error:', err);
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  renderResults() {
    const { pages, deletedPages, fileName, fileSize } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const remaining = pages.length - deletedPages.size;
    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;

    results.innerHTML = `
      <div class="toolbar">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span class="page-count">📑 Còn lại <strong>${remaining}</strong> / ${pages.length} trang</span>
          <button class="btn btn-secondary btn-sm" id="btn-select-all">Chọn tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-deselect-all">Bỏ chọn</button>
        </div>
        <button class="btn btn-primary" id="btn-delete" ${deletedPages.size === 0 ? 'disabled' : ''}>
          🗑️ Xóa trang đã chọn (${deletedPages.size})
        </button>
      </div>
      <div class="thumbnail-grid" id="thumbnail-grid"
           style="grid-template-columns: repeat(${cols}, 180px);">
        ${pages.map((p, idx) => `
          <div class="thumbnail-card selectable ${deletedPages.has(idx) ? 'marked-delete' : ''}"
               data-page-index="${idx}">
            <img src="${p.thumbnail}" alt="Trang ${idx + 1}" width="${p.width}" height="${p.height}">
            <span class="page-number">${idx + 1}</span>
            <div class="delete-overlay">
              <span>🗑️</span>
              <span>Xóa</span>
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
    this.setupDeleteButton();
  }

  setupSelection() {
    document.querySelectorAll('.thumbnail-card.selectable').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.pageIndex);
        if (this.state.deletedPages.has(idx)) {
          this.state.deletedPages.delete(idx);
        } else {
          this.state.deletedPages.add(idx);
        }
        this.renderResults();
      });
    });

    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      this.state.deletedPages = new Set(this.state.pages.map((_, i) => i));
      this.renderResults();
    });

    document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
      this.state.deletedPages = new Set();
      this.renderResults();
    });
  }

  setupDeleteButton() {
    document.getElementById('btn-delete')?.addEventListener('click', async () => {
      if (this.state.deletedPages.size === 0) return;

      const keepIndices = this.state.pages
        .map((_, i) => i)
        .filter(i => !this.state.deletedPages.has(i));

      if (keepIndices.length === 0) {
        showToast('Không thể xóa tất cả trang', 'error');
        return;
      }

      const btn = document.getElementById('btn-delete');
      btn.disabled = true;
      btn.textContent = '⏳ Đang xóa trang...';

      try {
        const pdfBytes = await PDFEngine.deletePages(this.state.pdfDoc, keepIndices);
        const outName = this.state.fileName.replace(/\.pdf$/i, '_xoatrang.pdf');
        PDFEngine.download(pdfBytes, outName);
        btn.textContent = '✅ Đã tải xong';
        showToast(`Đã xóa ${this.state.deletedPages.size} trang!`, 'success');
      } catch (err) {
        console.error('Delete error:', err);
        showToast('Có lỗi khi xóa trang', 'error');
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = `🗑️ Xóa trang đã chọn (${this.state.deletedPages.size})`;
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

const tool = new PDFDeleteTool();
export default tool;
