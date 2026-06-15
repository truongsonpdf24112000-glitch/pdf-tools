// js/tools/merge.js — Tool: Trộn nhiều file PDF thành 1
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFMergeTool {
  constructor() {
    this.files = [];      // { file, pdfDoc, pageCount, name, size }
    this.sortableInstance = null;
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
        <div class="upload-icon">🔀</div>
        <h3>Kéo thả nhiều file PDF vào đây</h3>
        <p class="sub">hoặc click để chọn — có thể chọn nhiều file cùng lúc</p>
        <p class="file-info">Các file sẽ được trộn theo thứ tự bên dưới</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" multiple hidden>
      <div id="results-area" style="display:none;"></div>
    `;
  }

  setupEvents() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.addFiles(Array.from(e.target.files));
      }
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        this.addFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  async addFiles(newFiles) {
    const pdfFiles = newFiles.filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      showToast('Vui lòng chọn file PDF', 'error');
      return;
    }

    const totalAfterAdd = this.files.length + pdfFiles.length;
    if (totalAfterAdd > 30) {
      showToast('Tối đa 30 file PDF', 'error');
      return;
    }

    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      for (const file of pdfFiles) {
        const buffer = await file.arrayBuffer();
        const { pdfDoc, pageCount } = await PDFEngine.load(buffer);
        this.files.push({
          file,
          pdfDoc,
          pageCount,
          name: file.name,
          size: file.size
        });
      }

      hideLoading();
      this.renderFileList();
      showToast(`Đã thêm ${pdfFiles.length} file (tổng: ${this.files.length})`, 'success');
    } catch (err) {
      hideLoading();
      console.error('Merge load error:', err);
      showToast('Có lỗi khi đọc file PDF', 'error');
    }
  }

  renderFileList() {
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    const totalPages = this.files.reduce((sum, f) => sum + f.pageCount, 0);

    results.innerHTML = `
      <div class="toolbar">
        <span class="page-count">📑 ${this.files.length} file · ${totalPages} trang</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="btn-add-more">+ Thêm file</button>
          <button class="btn btn-primary" id="btn-merge" ${this.files.length < 2 ? 'disabled' : ''}>
            🔀 Trộn thành 1 PDF
          </button>
        </div>
      </div>
      <div class="file-list" id="file-list">
        ${this.files.map((f, i) => `
          <div class="file-list-item" data-file-index="${i}">
            <span class="drag-handle">⠿</span>
            <span class="file-icon">📄</span>
            <div class="file-info">
              <span class="file-name">${this.escapeHtml(f.name)}</span>
              <span class="file-meta">${formatFileSize(f.size)} · ${f.pageCount} trang</span>
            </div>
            <button class="btn-remove" data-remove="${i}" title="Xóa">×</button>
          </div>
        `).join('')}
      </div>
    `;

    // Update upload zone
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📂</span>
      <div class="upload-text">
        <h3>${this.files.length} file đã chọn</h3>
        <span class="sub">Kéo thêm file hoặc click để thêm</span>
      </div>
    `;

    this.setupSortable();
    this.setupButtons();
  }

  setupSortable() {
    const list = document.getElementById('file-list');
    if (this.sortableInstance) this.sortableInstance.destroy();

    this.sortableInstance = new Sortable(list, {
      animation: 200,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: (evt) => {
        const item = this.files.splice(evt.oldIndex, 1)[0];
        this.files.splice(evt.newIndex, 0, item);
        this.renderFileList();
      }
    });
  }

  setupButtons() {
    // Add more
    document.getElementById('btn-add-more')?.addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    // Remove buttons
    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove);
        this.files.splice(idx, 1);
        if (this.files.length === 0) {
          this.reset();
        } else {
          this.renderFileList();
        }
      });
    });

    // Merge button
    document.getElementById('btn-merge')?.addEventListener('click', async () => {
      if (this.files.length < 2) return;

      const btn = document.getElementById('btn-merge');
      btn.disabled = true;
      btn.textContent = '⏳ Đang trộn...';

      try {
        const pdfBytes = await PDFEngine.mergePDFs(this.files);
        PDFEngine.download(pdfBytes, 'merged.pdf');
        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được trộn thành công!', 'success');
      } catch (err) {
        console.error('Merge error:', err);
        showToast('Có lỗi khi trộn PDF', 'error');
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '🔀 Trộn thành 1 PDF';
        }, 2000);
      }
    });
  }

  reset() {
    this.files = [];
    const results = document.getElementById('results-area');
    results.style.display = 'none';
    results.innerHTML = '';

    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone';
    zone.innerHTML = `
      <div class="upload-icon">🔀</div>
      <h3>Kéo thả nhiều file PDF vào đây</h3>
      <p class="sub">hoặc click để chọn — có thể chọn nhiều file cùng lúc</p>
      <p class="file-info">Các file sẽ được trộn theo thứ tự bên dưới</p>
    `;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new PDFMergeTool();
export default tool;
