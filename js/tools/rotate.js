// js/tools/rotate.js — Tool: Xoay trang PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFRotateTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      pages: [],
      rotations: new Map(),    // pageIndex -> total rotation applied
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
        <div class="upload-icon">🔄</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Click nút xoay trên từng trang hoặc chọn nhiều trang để xoay hàng loạt</p>
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
      const scale = pageCount > 50 ? 0.2 : 0.35;
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, scale);

      this.state = {
        pdfDoc, pdfjsDoc, pages,
        rotations: new Map(),
        fileName: file.name,
        fileSize: file.size
      };

      hideLoading();
      this.renderResults();
    } catch (err) {
      hideLoading();
      console.error('Rotate load error:', err);
      showToast('Không thể đọc file PDF', 'error');
    }
  }

  renderResults() {
    const { pages, rotations, fileName, fileSize } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;

    results.innerHTML = `
      <div class="toolbar">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span class="page-count">📑 ${pages.length} trang</span>
          <button class="btn btn-secondary btn-sm" id="btn-select-all">Chọn tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-rotate-batch" disabled>↻ Xoay 90° trang đã chọn</button>
          <span style="font-size:0.8rem;color:var(--text-muted);" id="selected-info"></span>
        </div>
        <button class="btn btn-primary" id="btn-download" ${this.hasChanges() ? '' : 'disabled'}>
          ⬇️ Tải PDF đã xoay
        </button>
      </div>
      <div class="thumbnail-grid" id="thumbnail-grid"
           style="grid-template-columns: repeat(${cols}, 200px);">
        ${pages.map((p, idx) => {
          const angle = rotations.get(idx) || 0;
          const rotateStyle = angle ? `transform: rotate(${angle}deg);` : '';
          return `
            <div class="thumbnail-card rotate-card ${rotations.has(idx) ? 'has-rotation' : ''}"
                 data-page-index="${idx}">
              <div class="thumbnail-wrapper" style="${rotateStyle}">
                <img src="${p.thumbnail}" alt="Trang ${idx + 1}"
                     width="${p.width}" height="${p.height}">
              </div>
              <span class="page-number">${idx + 1}</span>
              <div class="rotate-controls">
                <button class="btn-rotate" data-action="cw" data-page="${idx}" title="Xoay 90° phải">↻</button>
                <button class="btn-rotate" data-action="ccw" data-page="${idx}" title="Xoay 90° trái">↺</button>
                <button class="btn-rotate" data-action="180" data-page="${idx}" title="Xoay 180°">↔</button>
                ${rotations.has(idx) ? `<button class="btn-rotate btn-reset" data-action="reset" data-page="${idx}" title="Reset">↩</button>` : ''}
              </div>
              <div class="select-indicator" data-page="${idx}"></div>
            </div>
          `;
        }).join('')}
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

    this.setupRotationControls();
    this.setupDownload();
    this.setupBatchSelect();
  }

  setupRotationControls() {
    // Individual rotate buttons
    document.querySelectorAll('.btn-rotate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pageIdx = parseInt(btn.dataset.page);
        const action = btn.dataset.action;

        const current = this.state.rotations.get(pageIdx) || 0;

        if (action === 'cw') {
          this.state.rotations.set(pageIdx, ((current + 90) % 360 + 360) % 360);
        } else if (action === 'ccw') {
          this.state.rotations.set(pageIdx, ((current - 90) % 360 + 360) % 360);
        } else if (action === '180') {
          this.state.rotations.set(pageIdx, ((current + 180) % 360 + 360) % 360);
        } else if (action === 'reset') {
          this.state.rotations.delete(pageIdx);
        }

        // Remove 0 and 360 rotations
        if (this.state.rotations.get(pageIdx) === 0 || this.state.rotations.get(pageIdx) === 360) {
          this.state.rotations.delete(pageIdx);
        }

        this.renderResults();
      });
    });

    // Batch rotate
    document.getElementById('btn-rotate-batch')?.addEventListener('click', () => {
      const selected = this.getSelectedPages();
      for (const idx of selected) {
        const current = this.state.rotations.get(idx) || 0;
        const newAngle = ((current + 90) % 360 + 360) % 360;
        if (newAngle === 0 || newAngle === 360) {
          this.state.rotations.delete(idx);
        } else {
          this.state.rotations.set(idx, newAngle);
        }
      }
      this.renderResults();
    });
  }

  setupBatchSelect() {
    const selectedSet = new Set();

    document.querySelectorAll('.select-indicator').forEach(indicator => {
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(indicator.dataset.page);
        const card = indicator.closest('.thumbnail-card');

        if (selectedSet.has(idx)) {
          selectedSet.delete(idx);
          card.classList.remove('batch-selected');
        } else {
          selectedSet.add(idx);
          card.classList.add('batch-selected');
        }

        this.updateBatchUI(selectedSet);
      });
    });

    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      this.state.pages.forEach((_, i) => selectedSet.add(i));
      document.querySelectorAll('.thumbnail-card.rotate-card').forEach(c => c.classList.add('batch-selected'));
      this.updateBatchUI(selectedSet);
    });

    const updateFn = () => this.updateBatchUI(selectedSet);
    this._getSelectedPages = () => selectedSet;
  }

  updateBatchUI(selectedSet) {
    const count = selectedSet.size;
    const btn = document.getElementById('btn-rotate-batch');
    const info = document.getElementById('selected-info');
    if (btn) btn.disabled = count === 0;
    if (info) info.textContent = count > 0 ? `Đã chọn ${count} trang` : '';
  }

  getSelectedPages() {
    return this._getSelectedPages ? Array.from(this._getSelectedPages()) : [];
  }

  hasChanges() {
    return this.state.rotations.size > 0;
  }

  setupDownload() {
    document.getElementById('btn-download')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-download');
      btn.disabled = true;
      btn.textContent = '⏳ Đang xoay...';

      try {
        const rotations = new Map();
        for (const [idx, angle] of this.state.rotations.entries()) {
          if (angle !== 0 && angle !== 360) {
            rotations.set(idx, angle);
          }
        }

        const pdfBytes = await PDFEngine.rotatePages(this.state.pdfDoc, rotations);
        const outName = this.state.fileName.replace(/\.pdf$/i, '_xoay.pdf');
        PDFEngine.download(pdfBytes, outName);
        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được xoay!', 'success');
      } catch (err) {
        console.error('Rotate error:', err);
        showToast('Có lỗi khi xoay PDF', 'error');
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '⬇️ Tải PDF đã xoay';
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

const tool = new PDFRotateTool();
export default tool;
