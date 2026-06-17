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
          <span class="page-count">📑 Còn lại <strong>${remaining}</strong> / ${pages.length} trang</span>
          <button class="btn btn-secondary btn-sm" id="btn-select-all">Chọn tất cả</button>
          <button class="btn btn-secondary btn-sm" id="btn-deselect-all">Bỏ chọn</button>
        </div>
        <button class="btn btn-primary" id="btn-action" ${deletedPages.size === 0 ? 'disabled' : ''}>
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

    this.setupDeleteSelection();
    this.setupDeleteAction();
  }

  setupDeleteSelection() {
    document.querySelectorAll('.thumbnail-card.selectable').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.pageIndex);
        if (this.deletedPages.has(idx)) {
          this.deletedPages.delete(idx);
        } else {
          this.deletedPages.add(idx);
        }
        const results = document.getElementById('results-area');
        this.renderDeleteResults(results);
        this.setupDeleteSelection();
        this.setupDeleteAction();
      });
    });

    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      this.deletedPages = new Set(this.pages.map((_, i) => i));
      const results = document.getElementById('results-area');
      this.renderDeleteResults(results);
      this.setupDeleteSelection();
      this.setupDeleteAction();
    });

    document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
      this.deletedPages = new Set();
      const results = document.getElementById('results-area');
      this.renderDeleteResults(results);
      this.setupDeleteSelection();
      this.setupDeleteAction();
    });
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
        const { pdfDoc, pageCount } = await PDFEngine.load(buffer);
        this.mergeFiles.push({ file, pdfDoc, pageCount, name: file.name, size: file.size });
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
    // Update upload zone
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

    results.innerHTML = `
      <div class="toolbar">
        <span class="page-count">📑 ${this.mergeFiles.length} file · ${totalPages} trang</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="btn-add-more">+ Thêm file</button>
          <button class="btn btn-primary" id="btn-action" ${this.mergeFiles.length < 2 ? 'disabled' : ''}>
            🔀 Trộn thành 1 PDF
          </button>
        </div>
      </div>
      <div class="file-list" id="file-list">
        ${this.mergeFiles.map((f, i) => `
          <div class="file-list-item" data-file-index="${i}">
            <span class="drag-handle">⠿</span>
            <span class="file-icon">📄</span>
            <div class="file-info">
              <span class="file-name">${escapeHtml(f.name)}</span>
              <span class="file-meta">${formatFileSize(f.size)} · ${f.pageCount} trang</span>
            </div>
            <button class="btn-remove" data-remove="${i}" title="Xóa">×</button>
          </div>
        `).join('')}
      </div>
    `;

    this.setupMergeSortable();
    this.setupMergeButtons();
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

    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove);
        this.mergeFiles.splice(idx, 1);
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

    document.getElementById('btn-action')?.addEventListener('click', async () => {
      if (this.mergeFiles.length < 2) return;
      const btn = document.getElementById('btn-action');
      btn.disabled = true;
      btn.textContent = '⏳ Đang trộn...';
      try {
        const pdfBytes = await PDFEngine.mergePDFs(this.mergeFiles);
        PDFEngine.download(pdfBytes, 'merged.pdf');
        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được trộn thành công!', 'success');
      } catch (err) {
        console.error('Merge error:', err);
        showToast('Có lỗi khi trộn PDF', 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = '🔀 Trộn thành 1 PDF'; }, 2000);
      }
    });
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
