// js/tools/reorder.js — Tool: Sắp xếp trang PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFReorderTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      pages: [],
      order: [],
      fileName: '',
      fileSize: 0
    };
    this.sortableInstance = null;
  }

  /**
   * Khởi tạo tool: render upload zone, gắn event handlers
   */
  init() {
    this.render();
    this.setupEvents();
  }

  render() {
    const container = document.getElementById('tool-container');
    container.innerHTML = '';
    container.style.position = 'relative';

    // Upload zone
    const zone = document.createElement('div');
    zone.className = 'upload-zone';
    zone.id = 'upload-zone';
    zone.innerHTML = `
      <div class="upload-icon">📄</div>
      <h3>Kéo thả file PDF vào đây</h3>
      <p class="sub">hoặc click để chọn file</p>
      <p class="file-info">Hỗ trợ file PDF, tối đa 100MB</p>
    `;
    container.appendChild(zone);

    // Hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'file-input';
    input.accept = '.pdf,application/pdf';
    input.hidden = true;
    container.appendChild(input);

    // Results area (hidden initially)
    const results = document.createElement('div');
    results.id = 'results-area';
    results.style.display = 'none';
    container.appendChild(results);
  }

  setupEvents() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    // Click to select
    zone.addEventListener('click', () => input.click());

    // File selected
    input.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFile(e.target.files[0]);
    });

    // Drag & drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this.handleFile(file);
    });

    // Also allow dropping onto the whole container
    const container = document.getElementById('tool-container');
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!this.state.pdfDoc) zone.classList.add('drag-over');
    });
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (!this.state.pdfDoc && e.dataTransfer.files[0]) {
        this.handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  async handleFile(file) {
    // Validate
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

      // Render thumbnails
      const scale = pageCount > 50 ? 0.2 : 0.35;
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, scale);

      this.state = {
        pdfDoc,
        pdfjsDoc,
        pages,
        order: pages.map((_, i) => i),
        fileName: file.name,
        fileSize: file.size
      };

      this.renderResults();
      hideLoading();
    } catch (err) {
      hideLoading();
      console.error('PDF load error:', err);
      showToast('Không thể đọc file PDF. File có thể bị hỏng hoặc có mật khẩu.', 'error');
    }
  }

  renderResults() {
    const { pages, order, fileName, fileSize } = this.state;
    const container = document.getElementById('tool-container');

    // Update upload zone to compact mode
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📄</span>
      <div class="upload-text">
        <h3>${fileName}</h3>
        <span class="sub">${formatFileSize(fileSize)} · ${pages.length} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    // Build results area
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;

    results.innerHTML = `
      <div class="toolbar">
        <span class="page-count">📑 ${pages.length} trang — Kéo thả để sắp xếp</span>
        <button class="btn btn-primary" id="btn-download">
          ⬇️ Tải PDF đã sắp xếp
        </button>
      </div>
      <div class="thumbnail-grid" id="thumbnail-grid"
           style="grid-template-columns: repeat(${cols}, 180px);">
        ${order.map(idx => `
          <div class="thumbnail-card" data-page-index="${idx}">
            <img src="${pages[idx].thumbnail}"
                 alt="Trang ${idx + 1}"
                 width="${pages[idx].width}"
                 height="${pages[idx].height}">
            <span class="page-number">${idx + 1}</span>
          </div>
        `).join('')}
      </div>
    `;

    this.setupSortable();
    this.setupDownload();
  }

  setupSortable() {
    const grid = document.getElementById('thumbnail-grid');

    // Destroy old instance if exists
    if (this.sortableInstance) {
      this.sortableInstance.destroy();
    }

    this.sortableInstance = new Sortable(grid, {
      animation: 200,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: () => {
        this.updateOrder();
      }
    });
  }

  updateOrder() {
    const cards = document.querySelectorAll('.thumbnail-card');
    const newOrder = [];

    cards.forEach((card, displayIndex) => {
      const pageIndex = parseInt(card.dataset.pageIndex);
      newOrder.push(pageIndex);

      // Update visual page number
      const numEl = card.querySelector('.page-number');
      if (numEl) numEl.textContent = displayIndex + 1;
    });

    this.state.order = newOrder;
  }

  setupDownload() {
    const btn = document.getElementById('btn-download');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Đang tạo PDF...';

      try {
        const pdfBytes = await PDFEngine.reorderAndSave(
          this.state.pdfDoc,
          this.state.order
        );

        const outName = this.state.fileName.replace(/\.pdf$/i, '_sapxep.pdf');
        PDFEngine.download(pdfBytes, outName);

        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được sắp xếp và tải về!', 'success');
      } catch (err) {
        console.error('Reorder error:', err);
        showToast('Có lỗi khi tạo PDF. Thử lại nhé.', 'error');
        btn.textContent = '⬇️ Tải PDF đã sắp xếp';
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '⬇️ Tải PDF đã sắp xếp';
        }, 2000);
      }
    });
  }
}

const tool = new PDFReorderTool();
export default tool;
