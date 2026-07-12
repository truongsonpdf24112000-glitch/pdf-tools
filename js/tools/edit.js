// js/tools/edit.js — Công cụ chỉnh sửa PDF cơ bản: Sắp xếp, Trộn, Tách, Xoay, Xóa
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize, showProgress, escapeHtml } from '../utils/ui-helpers.js';

const MODES = [
  { id: 'reorder', label: 'Sắp xếp', icon: '📑', desc: 'Kéo thả để sắp xếp lại thứ tự trang' },
  { id: 'merge',   label: 'Trộn',   icon: '🔀', desc: 'Gộp nhiều file PDF thành một' },
  { id: 'split',   label: 'Tách',   icon: '✂️', desc: 'Chọn trang muốn tách ra file mới' },
  { id: 'rotate',  label: 'Xoay',   icon: '🔄', desc: 'Xoay trang 90°, 180° hoặc 270°' },
  { id: 'delete',  label: 'Xóa',    icon: '🗑️', desc: 'Xóa trang không cần thiết' },
];

class PDFEditTool {
  constructor() {
    // Shared state
    this.mode = 'reorder';
    this.fileName = '';
    this.fileSize = 0;
    this.pdfDoc = null;
    this.pdfjsDoc = null;
    this.pages = [];          // { index, thumbnail, width, height }

    // Mode-specific state
    this.order = [];          // reorder: new page order
    this.mergeFiles = [];     // merge: { file, pdfDoc, pageCount, name, size }
    this.selectedPages = new Set();   // split: selected page indices
    this.rotations = new Map();       // rotate: pageIdx -> angle
    this.deletedPages = new Set();    // delete: page indices to delete

    this.sortableInstance = null;
    this.mergeSortableInstance = null;
  }

  init() {
    this.render();
    this.setupEvents();
    // Nhận file từ trang chủ nếu có
    if (window.__pendingPdfFile) {
      const file = window.__pendingPdfFile;
      delete window.__pendingPdfFile;
      setTimeout(() => this.handleSingleFile(file), 100);
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────

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

    // Upload zone
    const zone = document.createElement('div');
    zone.className = 'upload-zone';
    zone.id = 'upload-zone';
    zone.innerHTML = this.getUploadZoneHTML();
    container.appendChild(zone);

    // Hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'file-input';
    input.accept = '.pdf,application/pdf';
    input.multiple = this.mode === 'merge';
    input.hidden = true;
    container.appendChild(input);

    // Results area
    const results = document.createElement('div');
    results.id = 'results-area';
    results.style.display = 'none';
    container.appendChild(results);

    // Bind mode buttons
    this.bindModeButtons();

    // If merge mode already has files, show them
    if (this.mode === 'merge' && this.mergeFiles.length > 0) {
      this.renderMergeResults();
    }
  }

  getUploadZoneHTML() {
    if (this.mode === 'merge') {
      return `
        <div class="upload-icon">🔀</div>
        <h3>Kéo thả nhiều file PDF vào đây</h3>
        <p class="sub">Chọn nhiều file cùng lúc để trộn thành 1 PDF</p>
        <p class="file-info">Tối đa 30 file, các file sẽ được trộn theo thứ tự</p>
      `;
    }
    // Nếu đã load file cho single mode, hiện compact
    if (this.pdfDoc && this.mode !== 'merge') {
      return `
        <span class="upload-icon">📄</span>
        <div class="upload-text">
          <h3>${escapeHtml(this.fileName)}</h3>
          <span class="sub">${formatFileSize(this.fileSize)} · ${this.pages.length} trang</span>
        </div>
        <button class="change-btn" id="change-file-btn">Đổi file</button>
      `;
    }
    return `
      <div class="upload-icon">📄</div>
      <h3>Kéo thả file PDF vào đây</h3>
      <p class="sub">hoặc click để chọn file</p>
      <p class="file-info">Hỗ trợ file PDF, tối đa 100MB</p>
    `;
  }

  bindModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newMode = btn.dataset.mode;
        if (newMode !== this.mode) {
          this.mode = newMode;
          // Update file input multiple attr
          const input = document.getElementById('file-input');
          input.multiple = (newMode === 'merge');
          // Re-render UI preserving state
          this.render();
          // If we have a loaded doc for single modes, show results
          if (newMode !== 'merge' && this.pdfDoc) {
            this.renderSingleResults();
          }
          if (newMode === 'merge' && this.mergeFiles.length > 0) {
            this.renderMergeResults();
          }
        }
      });
    });
  }

  // ─── EVENTS ────────────────────────────────────────────────

  setupEvents() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        if (this.mode === 'merge') {
          this.addMergeFiles(Array.from(e.target.files));
        } else {
          this.handleSingleFile(e.target.files[0]);
        }
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
        if (this.mode === 'merge') {
          this.addMergeFiles(Array.from(e.dataTransfer.files));
        } else {
          this.handleSingleFile(e.dataTransfer.files[0]);
        }
      }
    });

    // Container drop — handle file insert (drag onto thumbnails)
    const container = document.getElementById('tool-container');
    let insertIndicator = null;

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.mode === 'merge' || !this.pdfDoc) {
        zone.classList.add('drag-over');
      } else {
        // Show insert indicator between thumbnails
        this.showInsertIndicator(e.clientX, e.clientY, insertIndicator, container);
      }
    });
    container.addEventListener('dragleave', (e) => {
      if (insertIndicator) { insertIndicator.remove(); insertIndicator = null; }
    });
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (insertIndicator) { insertIndicator.remove(); insertIndicator = null; }

      if (e.dataTransfer.files.length > 0) {
        if (this.mode === 'merge') {
          if (this.mergeFiles.length === 0) this.addMergeFiles(Array.from(e.dataTransfer.files));
        } else if (!this.pdfDoc) {
          this.handleSingleFile(e.dataTransfer.files[0]);
        } else {
          // Insert dropped PDF at insertion point
          const insertIdx = this.getInsertIndex(e.clientX, e.clientY, container);
          if (insertIdx !== null) {
            await this.insertPdfAt(e.dataTransfer.files[0], insertIdx);
          }
        }
      }
    });
  }

  // ─── SINGLE FILE HANDLING ──────────────────────────────────

  async handleSingleFile(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Vui lòng chọn file PDF', 'error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast('File PDF quá lớn (tối đa 100MB)', 'error');
      return;
    }

    const container = document.getElementById('tool-container');

    try {
      // Show progress bar
      const progress = showProgress(container, `Đang đọc ${escapeHtml(file.name)}...`);
      progress.setProgress(10, 'Đang tải PDF...');

      const buffer = await file.arrayBuffer();
      progress.setProgress(30, 'Đang phân tích...');

      const { pdfDoc, pdfjsDoc, pageCount } = await PDFEngine.load(buffer);
      progress.setProgress(40, `Đã load ${pageCount} trang`);

      // Render thumbnails with progress (chunked, non-blocking)
      const scale = pageCount > 50 ? 0.2 : 0.35;
      const pages = await PDFEngine.renderThumbnailsWithProgress(pdfjsDoc, scale, container);

      this.pdfDoc = pdfDoc;
      this.pdfjsDoc = pdfjsDoc;
      this.pages = pages;
      this.fileName = file.name;
      this.fileSize = file.size;
      this.order = pages.map((_, i) => i);
      this.selectedPages = new Set();
      this.rotations = new Map();
      this.deletedPages = new Set();

      this.renderSingleResults();
    } catch (err) {
      console.error('PDF load error:', err);
      showToast('Không thể đọc file PDF. File có thể bị hỏng hoặc có mật khẩu.', 'error');
      // Clean up progress bar
      const pb = document.getElementById('progress-bar');
      if (pb) pb.remove();
    }
  }

  renderSingleResults() {
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    // Update upload zone to compact
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = this.getUploadZoneHTML();
    const changeBtn = document.getElementById('change-file-btn');
    if (changeBtn) {
      changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('file-input').click();
      });
    }

    // Render mode-specific content
    switch (this.mode) {
      case 'reorder': this.renderReorderResults(results); break;
      case 'split':   this.renderSplitResults(results);   break;
      case 'rotate':  this.renderRotateResults(results);  break;
      case 'delete':  this.renderDeleteResults(results);  break;
    }
  }

  // ─── REORDER MODE ──────────────────────────────────────────

  renderReorderResults(results) {
    const { pages, order } = this;
    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;

    results.innerHTML = `
      <div class="toolbar">
        <span class="page-count">📑 ${pages.length} trang — Kéo thả để sắp xếp</span>
        <button class="btn btn-primary" id="btn-action">
          ⬇️ Tải PDF đã sắp xếp
        </button>
      </div>
      <div class="thumbnail-grid" id="thumbnail-grid"
           style="grid-template-columns: repeat(${cols}, 180px);">
        ${order.map(idx => `
          <div class="thumbnail-card" data-page-index="${idx}">
            <img src="${pages[idx].thumbnail}" alt="Trang ${idx + 1}"
                 width="${pages[idx].width}" height="${pages[idx].height}">
            <span class="page-number">${idx + 1}</span>
          </div>
        `).join('')}
      </div>
    `;

    this.setupReorderSortable();
    this.setupReorderDownload();
  }

  setupReorderSortable() {
    const grid = document.getElementById('thumbnail-grid');
    if (this.sortableInstance) this.sortableInstance.destroy();

    this.sortableInstance = new Sortable(grid, {
      animation: 200,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: () => {
        const cards = document.querySelectorAll('.thumbnail-card');
        const newOrder = [];
        cards.forEach((card, displayIndex) => {
          const pageIndex = parseInt(card.dataset.pageIndex);
          newOrder.push(pageIndex);
          const numEl = card.querySelector('.page-number');
          if (numEl) numEl.textContent = displayIndex + 1;
        });
        this.order = newOrder;
      }
    });
  }

  setupReorderDownload() {
    document.getElementById('btn-action')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-action');
      btn.disabled = true;
      btn.textContent = '⏳ Đang tạo PDF...';
      try {
        const pdfBytes = await PDFEngine.reorderAndSave(this.pdfDoc, this.order);
        PDFEngine.download(pdfBytes, this.fileName.replace(/\.pdf$/i, '_sapxep.pdf'));
        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được sắp xếp và tải về!', 'success');
      } catch (err) {
        console.error('Reorder error:', err);
        showToast('Có lỗi khi tạo PDF. Thử lại nhé.', 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = '⬇️ Tải PDF đã sắp xếp'; }, 2000);
      }
    });
  }

  // ─── SPLIT MODE ────────────────────────────────────────────

  renderSplitResults(results) {
    const { pages, selectedPages } = this;
    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;

    results.innerHTML = `
      <div class="toolbar">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span class="page-count">📑 Click vào trang để chọn (đã chọn: <strong id="selected-count">${selectedPages.size}</strong>)</span>
          <button class="btn btn-secondary btn-sm" id="btn-select-all">Chọn tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-deselect-all">Bỏ chọn</button>
        </div>
        <button class="btn btn-primary" id="btn-action" ${selectedPages.size === 0 ? 'disabled' : ''}>
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
            <div class="select-overlay"><span class="select-check">✓</span></div>
          </div>
        `).join('')}
      </div>
    `;

    this.setupSplitSelection();
    this.setupSplitAction();
  }

  setupSplitSelection() {
    document.querySelectorAll('.thumbnail-card.selectable').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.pageIndex);
        if (this.selectedPages.has(idx)) {
          this.selectedPages.delete(idx);
          card.classList.remove('selected');
        } else {
          this.selectedPages.add(idx);
          card.classList.add('selected');
        }
        this.updateSplitUI();
      });
    });

    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      this.selectedPages = new Set(this.pages.map((_, i) => i));
      document.querySelectorAll('.thumbnail-card.selectable').forEach(c => c.classList.add('selected'));
      this.updateSplitUI();
    });

    document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
      this.selectedPages = new Set();
      document.querySelectorAll('.thumbnail-card.selectable').forEach(c => c.classList.remove('selected'));
      this.updateSplitUI();
    });
  }

  updateSplitUI() {
    const el = document.getElementById('selected-count');
    if (el) el.textContent = this.selectedPages.size;
    const btn = document.getElementById('btn-action');
    if (btn) btn.disabled = this.selectedPages.size === 0;
  }

  setupSplitAction() {
    document.getElementById('btn-action')?.addEventListener('click', async () => {
      if (this.selectedPages.size === 0) return;
      const indices = Array.from(this.selectedPages).sort((a, b) => a - b);
      const btn = document.getElementById('btn-action');
      btn.disabled = true;
      btn.textContent = '⏳ Đang tách trang...';
      try {
        const pdfBytes = await PDFEngine.extractPages(this.pdfDoc, indices);
        PDFEngine.download(pdfBytes, this.fileName.replace(/\.pdf$/i, '_tach.pdf'));
        btn.textContent = '✅ Đã tải xong';
        showToast(`Đã tách ${indices.length} trang!`, 'success');
      } catch (err) {
        console.error('Split error:', err);
        showToast('Có lỗi khi tách trang', 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = '✂️ Tách trang đã chọn'; }, 2000);
      }
    });
  }

  // ─── ROTATE MODE ───────────────────────────────────────────

  renderRotateResults(results) {
    const { pages, rotations } = this;
    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;
    const hasRotations = rotations.size > 0;

    results.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="page-count">📑 ${pages.length} trang</span>
          ${hasRotations ? `<span style="font-size:0.8rem;color:var(--accent);">(${rotations.size} trang đã xoay)</span>` : ''}
          <span style="color:var(--text-muted);font-size:0.78rem;">·</span>
          <button class="btn btn-secondary btn-sm" id="btn-rotate-all-left" title="Xoay tất cả sang trái 90°">↺ Xoay tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-rotate-all-right" title="Xoay tất cả sang phải 90°">↻ Xoay tất cả</button>
          ${hasRotations ? '<button class="btn btn-secondary btn-sm" id="btn-reset-all" title="Reset tất cả về 0°">↩ Reset</button>' : ''}
        </div>
        <button class="btn btn-primary" id="btn-action">
          ⬇️ Tải PDF${hasRotations ? ' đã xoay' : ''}
        </button>
      </div>
      <div class="thumbnail-grid" id="thumbnail-grid"
           style="grid-template-columns: repeat(${cols}, 200px);">
        ${pages.map((p, idx) => {
          const angle = rotations.get(idx) || 0;
          return `
            <div class="thumbnail-card rotate-card" data-page-index="${idx}">
              <div class="thumbnail-wrapper" id="tw-${idx}" style="transition: transform 0.3s ease;${angle ? `transform: rotate(${angle}deg);` : ''}">
                <img src="${p.thumbnail}" alt="Trang ${idx + 1}" width="${p.width}" height="${p.height}">
              </div>
              <span class="page-number" id="pn-${idx}">${idx + 1}</span>
              ${angle ? `<span class="rotate-badge" id="rb-${idx}">${angle}°</span>` : ''}
              <div class="rotate-controls">
                <button class="btn-rotate" data-action="ccw" data-page="${idx}" title="Xoay trái 90°">↺</button>
                <button class="btn-rotate" data-action="cw" data-page="${idx}" title="Xoay phải 90°">↻</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="shortcut-hint" style="margin-top:12px;">
        <span class="kbd">Ctrl</span> + <span class="kbd">S</span> Tải PDF &nbsp;|&nbsp;
        <span class="kbd">1</span>–<span class="kbd">5</span> Đổi chế độ
      </div>
    `;

    this.setupRotateControls();
    this.setupRotateDownload();
  }

  setupRotateControls() {
    // Individual page rotate buttons — instant CSS update
    document.querySelectorAll('.btn-rotate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pageIdx = parseInt(btn.dataset.page);
        const action = btn.dataset.action;
        let current = this.rotations.get(pageIdx) || 0;

        if (action === 'cw') {
          current = ((current + 90) % 360 + 360) % 360;
        } else if (action === 'ccw') {
          current = ((current - 90) % 360 + 360) % 360;
        }

        // Update state
        if (current === 0 || current === 360) {
          this.rotations.delete(pageIdx);
        } else {
          this.rotations.set(pageIdx, current);
        }

        // INSTANT visual update — no re-render
        this.updateRotateCardUI(pageIdx, current);
      });
    });

    // Rotate All Left
    document.getElementById('btn-rotate-all-left')?.addEventListener('click', () => {
      for (let i = 0; i < this.pages.length; i++) {
        const current = this.rotations.get(i) || 0;
        const newAngle = ((current - 90) % 360 + 360) % 360;
        if (newAngle === 0 || newAngle === 360) {
          this.rotations.delete(i);
        } else {
          this.rotations.set(i, newAngle);
        }
        this.updateRotateCardUI(i, newAngle);
      }
    });

    // Rotate All Right
    document.getElementById('btn-rotate-all-right')?.addEventListener('click', () => {
      for (let i = 0; i < this.pages.length; i++) {
        const current = this.rotations.get(i) || 0;
        const newAngle = ((current + 90) % 360 + 360) % 360;
        if (newAngle === 0 || newAngle === 360) {
          this.rotations.delete(i);
        } else {
          this.rotations.set(i, newAngle);
        }
        this.updateRotateCardUI(i, newAngle);
      }
    });

    // Reset All
    document.getElementById('btn-reset-all')?.addEventListener('click', () => {
      for (let i = 0; i < this.pages.length; i++) {
        this.rotations.delete(i);
        this.updateRotateCardUI(i, 0);
      }
    });
  }

  // Update a single card's rotation UI instantly (no re-render)
  updateRotateCardUI(pageIdx, angle) {
    const wrapper = document.getElementById(`tw-${pageIdx}`);
    if (wrapper) {
      wrapper.style.transform = angle ? `rotate(${angle}deg)` : '';
    }

    // Update badge
    const badge = document.getElementById(`rb-${pageIdx}`);
    if (angle && angle !== 0 && angle !== 360) {
      if (badge) {
        badge.textContent = angle + '°';
      } else {
        const card = document.querySelector(`.thumbnail-card[data-page-index="${pageIdx}"]`);
        const pageNum = document.getElementById(`pn-${pageIdx}`);
        if (card && pageNum) {
          const newBadge = document.createElement('span');
          newBadge.className = 'rotate-badge';
          newBadge.id = `rb-${pageIdx}`;
          newBadge.textContent = angle + '°';
          pageNum.insertAdjacentElement('afterend', newBadge);
        }
      }
    } else {
      if (badge) badge.remove();
    }

    // Update toolbar: count + download button text
    const hasRotations = this.rotations.size > 0;
    const countEl = document.querySelector('.toolbar .page-count + span');
    if (countEl && countEl.style) {
      countEl.textContent = hasRotations ? `(${this.rotations.size} trang đã xoay)` : '';
    }
    const btn = document.getElementById('btn-action');
    if (btn) {
      btn.textContent = hasRotations ? `⬇️ Tải PDF đã xoay` : '⬇️ Tải PDF';
    }

    // Show/hide reset all button
    let resetBtn = document.getElementById('btn-reset-all');
    if (hasRotations && !resetBtn) {
      const rotateAllRight = document.getElementById('btn-rotate-all-right');
      if (rotateAllRight) {
        resetBtn = document.createElement('button');
        resetBtn.className = 'btn btn-secondary btn-sm';
        resetBtn.id = 'btn-reset-all';
        resetBtn.textContent = '↩ Reset';
        resetBtn.title = 'Reset tất cả về 0°';
        resetBtn.addEventListener('click', () => {
          for (let i = 0; i < this.pages.length; i++) {
            this.rotations.delete(i);
            this.updateRotateCardUI(i, 0);
          }
        });
        rotateAllRight.insertAdjacentElement('afterend', resetBtn);
      }
    } else if (!hasRotations && resetBtn) {
      resetBtn.remove();
    }
  }

  setupRotateDownload() {
    document.getElementById('btn-action')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-action');
      btn.disabled = true;
      btn.textContent = '⏳ Đang xoay...';
      try {
        const cleanRotations = new Map();
        for (const [idx, angle] of this.rotations.entries()) {
          if (angle !== 0 && angle !== 360) cleanRotations.set(idx, angle);
        }
        const pdfBytes = await PDFEngine.rotatePages(this.pdfDoc, cleanRotations);
        PDFEngine.download(pdfBytes, this.fileName.replace(/\.pdf$/i, '_xoay.pdf'));
        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được xoay!', 'success');
      } catch (err) {
        console.error('Rotate error:', err);
        showToast('Có lỗi khi xoay PDF', 'error');
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          const hasRotations = this.rotations.size > 0;
          btn.textContent = hasRotations ? '⬇️ Tải PDF đã xoay' : '⬇️ Tải PDF';
        }, 2000);
      }
    });
  }

  // ─── DELETE MODE ───────────────────────────────────────────

  renderDeleteResults(results) {
    const { pages, deletedPages } = this;
    const remaining = pages.length - deletedPages.size;
    const cols = pages.length < 3 ? pages.length : pages.length < 6 ? pages.length : 6;

    results.innerHTML = `
      <div class="toolbar">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span class="page-count">📑 Còn lại <strong id="delete-remaining">${remaining}</strong> / ${pages.length} trang</span>
          <button class="btn btn-secondary btn-sm" id="btn-select-all">Chọn tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-deselect-all">Bỏ chọn</button>
        </div>
        <button class="btn btn-primary" id="btn-action" ${deletedPages.size === 0 ? 'disabled' : ''}>
          🗑️ Xóa <span id="delete-count">${deletedPages.size}</span> trang
        </button>
      </div>
      <div class="range-select-bar">
        <span class="range-label">🎯 Chọn nhanh:</span>
        <input type="text" id="range-input"
               placeholder="vd: 1-5, 8, 10-12"
               title="Nhập dải trang: số lẻ (1,3,5) hoặc khoảng (1-5). Giữ Shift+click để chọn dải.">
        <button class="btn btn-secondary btn-sm" id="btn-apply-range">Áp dụng</button>
        <span class="range-hint">Shift+click để chọn dải</span>
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

    this.setupDeleteSelection();
    this.setupDeleteAction();
    this.setupRangeInput();
  }

  setupDeleteSelection() {
    const grid = document.getElementById('thumbnail-grid');
    this._deleteLastClicked = null;

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.thumbnail-card.selectable');
      if (!card) return;
      const idx = parseInt(card.dataset.pageIndex);

      if (e.shiftKey && this._deleteLastClicked !== null) {
        // Range select with Shift
        const start = Math.min(this._deleteLastClicked, idx);
        const end = Math.max(this._deleteLastClicked, idx);
        for (let i = start; i <= end; i++) {
          this.deletedPages.add(i);
          const c = document.querySelector(`.thumbnail-card[data-page-index="${i}"]`);
          if (c) c.classList.add('marked-delete');
        }
      } else {
        // Toggle single page — NO RE-RENDER, just toggle CSS
        if (this.deletedPages.has(idx)) {
          this.deletedPages.delete(idx);
          card.classList.remove('marked-delete');
        } else {
          this.deletedPages.add(idx);
          card.classList.add('marked-delete');
        }
        this._deleteLastClicked = idx;
      }

      this._updateDeleteUI();
    });

    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      this.deletedPages = new Set(this.pages.map((_, i) => i));
      document.querySelectorAll('.thumbnail-card.selectable').forEach(c => c.classList.add('marked-delete'));
      this._updateDeleteUI();
    });

    document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
      this.deletedPages = new Set();
      document.querySelectorAll('.thumbnail-card.selectable').forEach(c => c.classList.remove('marked-delete'));
      this._updateDeleteUI();
    });
  }

  _updateDeleteUI() {
    // Incremental UI updates — no full re-render
    const remaining = this.pages.length - this.deletedPages.size;
    const remainEl = document.getElementById('delete-remaining');
    const countEl = document.getElementById('delete-count');
    const btn = document.getElementById('btn-action');

    if (remainEl) remainEl.textContent = remaining;
    if (countEl) countEl.textContent = this.deletedPages.size;
    if (btn) {
      btn.disabled = this.deletedPages.size === 0;
      btn.innerHTML = `🗑️ Xóa <span id="delete-count">${this.deletedPages.size}</span> trang`;
    }
  }

  setupRangeInput() {
    document.getElementById('btn-apply-range')?.addEventListener('click', () => {
      this._applyRangeInput();
    });

    document.getElementById('range-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._applyRangeInput();
    });
  }

  _applyRangeInput() {
    const input = document.getElementById('range-input');
    if (!input || !input.value.trim()) return;

    const parsed = this._parsePageRange(input.value.trim(), this.pages.length);
    if (parsed.error) {
      showToast(parsed.error, 'error');
      return;
    }

    // Clear all, then select parsed
    this.deletedPages = new Set();
    document.querySelectorAll('.thumbnail-card.selectable').forEach(c => c.classList.remove('marked-delete'));

    for (const idx of parsed.indices) {
      this.deletedPages.add(idx);
      const c = document.querySelector(`.thumbnail-card[data-page-index="${idx}"]`);
      if (c) c.classList.add('marked-delete');
    }

    this._updateDeleteUI();
    showToast(`Đã chọn ${parsed.indices.length} trang`, 'success');
  }

  _parsePageRange(text, maxPage) {
    // Parse formats: "1-5, 8, 10-12", "1,3,5", "1-5"
    const indices = new Set();
    const parts = text.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map(s => s.trim());
        const start = parseInt(startStr);
        const end = parseInt(endStr);
        if (isNaN(start) || isNaN(end)) return { error: `Khoảng không hợp lệ: "${part}". Dùng dạng: 1-5` };
        if (start < 1 || end > maxPage || start > end) {
          return { error: `Khoảng "${part}" vượt quá số trang (1-${maxPage})` };
        }
        for (let i = start; i <= end; i++) indices.add(i - 1); // 1-based to 0-based
      } else {
        const num = parseInt(part);
        if (isNaN(num)) return { error: `Số trang không hợp lệ: "${part}"` };
        if (num < 1 || num > maxPage) return { error: `Trang ${num} không tồn tại (1-${maxPage})` };
        indices.add(num - 1);
      }
    }

    return { indices: Array.from(indices).sort((a, b) => a - b) };
  }

  setupDeleteAction() {
    document.getElementById('btn-action')?.addEventListener('click', async () => {
      if (this.deletedPages.size === 0) return;
      const keepIndices = this.pages.map((_, i) => i).filter(i => !this.deletedPages.has(i));
      if (keepIndices.length === 0) {
        showToast('Không thể xóa tất cả trang', 'error');
        return;
      }
      const btn = document.getElementById('btn-action');
      btn.disabled = true;
      btn.textContent = '⏳ Đang xóa trang...';
      try {
        const pdfBytes = await PDFEngine.deletePages(this.pdfDoc, keepIndices);
        PDFEngine.download(pdfBytes, this.fileName.replace(/\.pdf$/i, '_xoatrang.pdf'));
        btn.textContent = '✅ Đã tải xong';
        showToast(`Đã xóa ${this.deletedPages.size} trang!`, 'success');
      } catch (err) {
        console.error('Delete error:', err);
        showToast('Có lỗi khi xóa trang', 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = `🗑️ Xóa trang đã chọn (${this.deletedPages.size})`; }, 2000);
      }
    });
  }

  // ─── MERGE MODE ────────────────────────────────────────────

  async addMergeFiles(newFiles) {
    const pdfFiles = newFiles.filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdfFiles.length === 0) {
      showToast('Vui lòng chọn file PDF', 'error');
      return;
    }
    if (this.mergeFiles.length + pdfFiles.length > 30) {
      showToast('Tối đa 30 file PDF', 'error');
      return;
    }

    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      for (const file of pdfFiles) {
        const buffer = await file.arrayBuffer();
        const result = await PDFEngine.load(buffer);
        this.mergeFiles.push({
          file, pdfDoc: result.pdfDoc, pdfjsDoc: result.pdfjsDoc,
          pageCount: result.pageCount, name: file.name, size: file.size
        });
        // Initialize page selection: all pages selected by default
        if (!this._mergePageSelection) this._mergePageSelection = new Map();
        const idx = this.mergeFiles.length - 1;
        this._mergePageSelection.set(idx, new Set(
          Array.from({ length: result.pageCount }, (_, i) => i)
        ));
      }
      hideLoading();
      this.renderMergeResults();
      showToast(`Đã thêm ${pdfFiles.length} file (tổng: ${this.mergeFiles.length})`, 'success');
    } catch (err) {
      hideLoading();
      console.error('Merge load error:', err);
      showToast('Có lỗi khi đọc file PDF', 'error');
    }
  }

  renderMergeResults() {
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">📂</span>
      <div class="upload-text">
        <h3>${this.mergeFiles.length} file đã chọn</h3>
        <span class="sub">Kéo thêm file hoặc click để thêm</span>
      </div>
    `;

    const results = document.getElementById('results-area');
    results.style.display = 'block';
    const totalPages = this.mergeFiles.reduce((sum, f) => sum + f.pageCount, 0);
    const selectedTotal = this._countSelectedMergePages();

    // Show empty state hint when no files
    if (this.mergeFiles.length === 0) {
      results.innerHTML = `
        <div class="toolbar">
          <span class="page-count">📑 Chưa có file nào</span>
          <button class="btn btn-primary" id="btn-add-more">+ Thêm file</button>
        </div>
      `;
      this.setupMergeButtons();
      return;
    }

    results.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
          <span class="page-count">📑 ${this.mergeFiles.length} file · <strong id="merge-total-pages">${totalPages}</strong> trang</span>
          ${selectedTotal !== totalPages ? `<span class="merge-selection-badge">✅ <strong>${selectedTotal}</strong> trang đã chọn</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-secondary btn-sm" id="btn-expand-all">📋 Mở tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-collapse-all">📋 Thu tất cả</button>
          <button class="btn btn-secondary" id="btn-add-more">+ Thêm file</button>
          <button class="btn btn-primary" id="btn-action" ${selectedTotal === 0 ? 'disabled' : ''}>
            🔀 Trộn ${selectedTotal} trang
          </button>
        </div>
      </div>
      <div class="file-list" id="file-list">
        ${this.mergeFiles.map((f, i) => this._renderMergeFileCard(f, i)).join('')}
      </div>
    `;

    this.setupMergeSortable();
    this.setupMergeButtons();
    // Render thumbnails for each expanded card
    this._renderMergeThumbnails();
  }

  _renderMergeFileCard(f, idx) {
    const selected = this._mergePageSelection?.get(idx) || new Set();
    const selectedCount = selected.size;
    const allSelected = selectedCount === f.pageCount;
    const isExpanded = this._mergeExpandedFiles?.has(idx);

    return `
      <div class="merge-file-card" data-file-index="${idx}">
        <div class="merge-file-header">
          <span class="drag-handle" title="Kéo để sắp xếp">⠿</span>
          <span class="file-icon">📄</span>
          <div class="file-info">
            <span class="file-name">${escapeHtml(f.name)}</span>
            <span class="file-meta">
              ${formatFileSize(f.size)} · ${f.pageCount} trang
              · <span class="merge-select-count" id="merge-sel-${idx}">
                ${allSelected ? '✅ Tất cả' : `⚠️ ${selectedCount}/${f.pageCount}`}
              </span>
            </span>
          </div>
          <button class="btn-toggle-pages" data-file="${idx}" title="${isExpanded ? 'Thu gọn' : 'Chọn trang'}">
            ${isExpanded ? '▲ Thu gọn' : '📋 Chọn trang'}
          </button>
          <button class="btn-remove" data-remove="${idx}" title="Xóa file">×</button>
        </div>
        <div class="merge-page-strip ${isExpanded ? 'expanded' : ''}" id="merge-strip-${idx}">
          <div class="merge-page-grid" id="merge-pages-${idx}">
            <span class="merge-loading">⏳ Đang tải thumbnail...</span>
          </div>
          <div class="merge-page-actions">
            <button class="btn btn-secondary btn-sm" data-select-all="${idx}">✅ Chọn tất cả</button>
            <button class="btn btn-secondary btn-sm" data-deselect-all="${idx}">☐ Bỏ chọn</button>
          </div>
        </div>
      </div>
    `;
  }

  _countSelectedMergePages() {
    if (!this._mergePageSelection) return 0;
    let count = 0;
    for (const [, pages] of this._mergePageSelection) {
      count += pages.size;
    }
    return count;
  }

  async _renderMergeThumbnails() {
    // Only render for expanded files
    if (!this._mergeExpandedFiles) return;

    for (const idx of this._mergeExpandedFiles) {
      const f = this.mergeFiles[idx];
      if (!f || !f.pdfjsDoc) continue;

      const grid = document.getElementById(`merge-pages-${idx}`);
      if (!grid) continue;

      // Skip if already rendered
      if (grid.querySelector('.merge-page-thumb')) continue;

      const selected = this._mergePageSelection?.get(idx) || new Set();
      const scale = f.pageCount > 20 ? 0.15 : 0.25;

      grid.innerHTML = '';
      for (let i = 0; i < f.pageCount; i++) {
        const thumbDiv = document.createElement('div');
        thumbDiv.className = `merge-page-thumb ${selected.has(i) ? 'selected' : ''}`;
        thumbDiv.dataset.fileIdx = idx;
        thumbDiv.dataset.pageIdx = i;
        thumbDiv.title = `Trang ${i + 1}`;
        thumbDiv.innerHTML = `
          <canvas class="merge-thumb-canvas" id="mtc-${idx}-${i}"></canvas>
          <span class="merge-page-num">${i + 1}</span>
          <div class="merge-page-check">✓</div>
        `;
        grid.appendChild(thumbDiv);
      }

      // Render canvases (async, chunked)
      this._renderThumbCanvases(f.pdfjsDoc, idx, 0, f.pageCount, scale);
    }
  }

  async _renderThumbCanvases(pdfjsDoc, fileIdx, start, end, scale) {
    const BATCH = 3;
    for (let i = start; i < end; i += BATCH) {
      const batchEnd = Math.min(i + BATCH, end);
      for (let j = i; j < batchEnd; j++) {
        const canvas = document.getElementById(`mtc-${fileIdx}-${j}`);
        if (!canvas) continue;
        try {
          const page = await pdfjsDoc.getPage(j + 1);
          const viewport = page.getViewport({ scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
        } catch (e) {
          canvas.style.display = 'none';
        }
      }
      if (batchEnd < end) await new Promise(r => setTimeout(r, 0));
    }
  }

  setupMergeSortable() {
    const list = document.getElementById('file-list');
    if (this.mergeSortableInstance) this.mergeSortableInstance.destroy();

    this.mergeSortableInstance = new Sortable(list, {
      animation: 200,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: (evt) => {
        const item = this.mergeFiles.splice(evt.oldIndex, 1)[0];
        this.mergeFiles.splice(evt.newIndex, 0, item);
        this.renderMergeResults();
      }
    });
  }

  setupMergeButtons() {
    document.getElementById('btn-add-more')?.addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    // Expand/Collapse all
    document.getElementById('btn-expand-all')?.addEventListener('click', () => {
      if (!this._mergeExpandedFiles) this._mergeExpandedFiles = new Set();
      for (let i = 0; i < this.mergeFiles.length; i++) {
        this._mergeExpandedFiles.add(i);
      }
      this.renderMergeResults();
    });

    document.getElementById('btn-collapse-all')?.addEventListener('click', () => {
      this._mergeExpandedFiles = new Set();
      this.renderMergeResults();
    });

    // Toggle individual file expand
    document.querySelectorAll('.btn-toggle-pages').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.file);
        if (!this._mergeExpandedFiles) this._mergeExpandedFiles = new Set();
        if (this._mergeExpandedFiles.has(idx)) {
          this._mergeExpandedFiles.delete(idx);
        } else {
          this._mergeExpandedFiles.add(idx);
        }
        this.renderMergeResults();
      });
    });

    // Remove file
    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove);
        this.mergeFiles.splice(idx, 1);
        this._mergePageSelection?.delete(idx);
        // Re-index remaining selections
        if (this._mergePageSelection) {
          const newMap = new Map();
          let newIdx = 0;
          for (const [oldIdx, pages] of this._mergePageSelection) {
            if (oldIdx !== idx) {
              newMap.set(newIdx, pages);
              newIdx++;
            }
          }
          this._mergePageSelection = newMap;
        }
        if (this._mergeExpandedFiles) {
          this._mergeExpandedFiles.delete(idx);
          const newExpanded = new Set();
          for (const e of this._mergeExpandedFiles) {
            newExpanded.add(e > idx ? e - 1 : e);
          }
          this._mergeExpandedFiles = newExpanded;
        }
        if (this.mergeFiles.length === 0) {
          document.getElementById('results-area').style.display = 'none';
          document.getElementById('results-area').innerHTML = '';
          const zone = document.getElementById('upload-zone');
          zone.className = 'upload-zone';
          zone.innerHTML = this.getUploadZoneHTML();
          this.setupEvents();
        } else {
          this.renderMergeResults();
        }
      });
    });

    // Select all / deselect all per file
    document.querySelectorAll('[data-select-all]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.selectAll);
        const f = this.mergeFiles[idx];
        this._mergePageSelection.set(idx, new Set(Array.from({ length: f.pageCount }, (_, i) => i)));
        this._updateMergeFileUI(idx);
        this._updateMergeToolbar();
      });
    });

    document.querySelectorAll('[data-deselect-all]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.deselectAll);
        this._mergePageSelection.set(idx, new Set());
        this._updateMergeFileUI(idx);
        this._updateMergeToolbar();
      });
    });

    // Click on page thumbnails to toggle
    this._setupMergePageClicks();

    // Merge action
    document.getElementById('btn-action')?.addEventListener('click', async () => {
      const selectedTotal = this._countSelectedMergePages();
      if (selectedTotal === 0) return;
      const btn = document.getElementById('btn-action');
      btn.disabled = true;
      btn.textContent = '⏳ Đang trộn...';
      try {
        const pdfBytes = await this._mergeWithSelection();
        PDFEngine.download(pdfBytes, 'merged.pdf');
        btn.textContent = '✅ Đã tải xong';
        showToast(`Đã trộn ${selectedTotal} trang thành công!`, 'success');
      } catch (err) {
        console.error('Merge error:', err);
        showToast('Có lỗi khi trộn PDF', 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = `🔀 Trộn ${selectedTotal} trang`; }, 2000);
      }
    });
  }

  _setupMergePageClicks() {
    document.querySelectorAll('.merge-page-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const fileIdx = parseInt(thumb.dataset.fileIdx);
        const pageIdx = parseInt(thumb.dataset.pageIdx);
        const sel = this._mergePageSelection.get(fileIdx);
        if (!sel) return;

        if (sel.has(pageIdx)) {
          sel.delete(pageIdx);
          thumb.classList.remove('selected');
        } else {
          sel.add(pageIdx);
          thumb.classList.add('selected');
        }

        this._updateMergeFileUI(fileIdx);
        this._updateMergeToolbar();
      });
    });
  }

  _updateMergeFileUI(fileIdx) {
    const f = this.mergeFiles[fileIdx];
    const sel = this._mergePageSelection?.get(fileIdx) || new Set();
    const countEl = document.getElementById(`merge-sel-${fileIdx}`);
    if (countEl) {
      countEl.textContent = sel.size === f.pageCount ? '✅ Tất cả' : `⚠️ ${sel.size}/${f.pageCount}`;
    }
    // Update page thumb classes
    document.querySelectorAll(`.merge-page-thumb[data-file-idx="${fileIdx}"]`).forEach(thumb => {
      const pageIdx = parseInt(thumb.dataset.pageIdx);
      thumb.classList.toggle('selected', sel.has(pageIdx));
    });
  }

  _updateMergeToolbar() {
    const selectedTotal = this._countSelectedMergePages();
    const totalPages = this.mergeFiles.reduce((sum, f) => sum + f.pageCount, 0);
    const totalEl = document.getElementById('merge-total-pages');
    const btn = document.getElementById('btn-action');
    const badge = document.querySelector('.merge-selection-badge');

    if (totalEl) totalEl.textContent = totalPages;
    if (btn) {
      btn.disabled = selectedTotal === 0;
      btn.textContent = `🔀 Trộn ${selectedTotal} trang`;
    }
    if (badge) {
      if (selectedTotal === totalPages) {
        badge.style.display = 'none';
      } else {
        badge.style.display = 'inline';
        badge.querySelector('strong').textContent = selectedTotal;
      }
    }
  }

  async _mergeWithSelection() {
    const merged = await PDFLib.PDFDocument.create();
    for (let i = 0; i < this.mergeFiles.length; i++) {
      const { pdfDoc } = this.mergeFiles[i];
      const selected = this._mergePageSelection?.get(i);
      if (!selected || selected.size === 0) continue;

      const indices = Array.from(selected).sort((a, b) => a - b);
      const copiedPages = await merged.copyPages(pdfDoc, indices);
      for (const page of copiedPages) merged.addPage(page);
    }
    return await merged.save();
  }

  // ─── DRAG INSERT ────────────────────────────────────────────

  showInsertIndicator(clientX, clientY, indicator, container) {
    const cards = document.querySelectorAll('.thumbnail-card');
    if (cards.length === 0) return;
    
    let insertIdx = null;
    let insertLeft = 0;
    
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (clientX < midX) { insertIdx = i; insertLeft = rect.left; break; }
    }
    if (insertIdx === null) {
      const lastRect = cards[cards.length - 1].getBoundingClientRect();
      insertIdx = cards.length;
      insertLeft = lastRect.right;
    }
    
    const containerRect = container.getBoundingClientRect();
    const relativeLeft = insertLeft - containerRect.left;
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'insert-indicator';
      container.appendChild(indicator);
    }
    // Find a thumbnail card for height reference
    const cardRect = cards[0].getBoundingClientRect();
    indicator.style.left = relativeLeft + 'px';
    indicator.style.top = (cardRect.top - containerRect.top) + 'px';
    indicator.style.height = cardRect.height + 'px';
    indicator.style.display = 'block';
  }

  getInsertIndex(clientX, clientY, container) {
    const cards = document.querySelectorAll('.thumbnail-card');
    if (cards.length === 0) return null;
    
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (clientX < midX) return i;
    }
    return cards.length; // after last card
  }

  async insertPdfAt(file, position) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Chỉ hỗ trợ chèn file PDF', 'error');
      return;
    }
    
    const container = document.getElementById('tool-container');
    const progress = showProgress(container, `Đang chèn ${escapeHtml(file.name)}...`);
    
    try {
      progress.setProgress(15, 'Đang đọc file...');
      const buffer = await file.arrayBuffer();
      const { pdfDoc: insertDoc, pageCount: insertPages } = await PDFEngine.load(buffer);
      progress.setProgress(50, `Đã đọc ${insertPages} trang`);
      
      const pdfBytes = await PDFEngine.insertPDF(this.pdfDoc, insertDoc, position);
      progress.done('✓ Đã chèn xong');
      
      // Re-load the combined PDF
      const newPdfBlob = new Blob([pdfBytes]);
      const newFile = new File([newPdfBlob], this.fileName, { type: 'application/pdf' });
      this.pdfDoc = null;
      this.pdfjsDoc = null;
      this.pages = [];
      
      // Use a flag to prevent re-upload UI
      await this.handleSingleFile(newFile);
      showToast(`Đã chèn ${insertPages} trang từ "${file.name}" vào vị trí ${position + 1}`, 'success');
    } catch (err) {
      console.error('Insert error:', err);
      showToast('Không thể chèn file PDF', 'error');
      const pb = document.getElementById('progress-bar');
      if (pb) pb.remove();
    }
  }

  // ─── UTILS ─────────────────────────────────────────────────

  // (using escapeHtml from ui-helpers.js)
}

const tool = new PDFEditTool();
export default tool;
