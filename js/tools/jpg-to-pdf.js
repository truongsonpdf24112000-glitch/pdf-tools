// js/tools/jpg-to-pdf.js — Tool: JPG/PNG → PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class JpgToPdfTool {
  constructor() {
    this.state = {
      files: [],        // [{name, size, dataUrl, width, height}]
      orientation: 'portrait',  // portrait | landscape | auto
      pageSize: 'a4'           // a4 | letter | original
    };
    this.backendUrl = 'http://localhost:5001';
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
        <div class="upload-icon">🖼️➡️📄</div>
        <h3>Kéo thả ảnh JPG/PNG vào đây</h3>
        <p class="sub">Chuyển đổi ảnh thành file PDF. Hỗ trợ nhiều ảnh → 1 PDF</p>
      </div>
      <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp,image/bmp" multiple hidden>
      <div id="results-area" style="display:none;"></div>
    `;
  }

  setupEvents() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      if (e.target.files.length) this.handleFiles([...e.target.files]);
    });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) this.handleFiles([...e.dataTransfer.files]);
    });
  }

  async handleFiles(files) {
    const imgFiles = files.filter(f => f.type.startsWith('image/'));
    if (imgFiles.length === 0) {
      showToast('Vui lòng chọn file ảnh (JPG/PNG/WebP)', 'error');
      return;
    }

    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      const imageData = [];
      for (const file of imgFiles) {
        const dataUrl = await this.readFileAsDataURL(file);
        const dimensions = await this.getImageDimensions(dataUrl);
        imageData.push({
          name: file.name,
          size: file.size,
          dataUrl,
          width: dimensions.width,
          height: dimensions.height
        });
      }

      this.state.files = imageData;
      hideLoading();
      this.renderSelection();
    } catch (err) {
      hideLoading();
      console.error('Load error:', err);
      showToast('Không thể đọc file ảnh', 'error');
    }
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  getImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  renderSelection() {
    const { files } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    // Compact upload zone
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">🖼️</span>
      <div class="upload-text">
        <h3>${files.length} ảnh đã chọn</h3>
        <span class="sub">Tổng dung lượng: ${formatFileSize(files.reduce((s, f) => s + f.size, 0))}</span>
      </div>
      <button class="change-btn" id="add-more-btn">+ Thêm ảnh</button>
    `;
    document.getElementById('add-more-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    const cols = Math.min(files.length, 5);

    results.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;">
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Hướng trang</label>
          <select id="orientation-select" class="form-select">
            <option value="auto">Tự động</option>
            <option value="portrait">Dọc (Portrait)</option>
            <option value="landscape">Ngang (Landscape)</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--text-muted);">Khổ giấy</label>
          <select id="pagesize-select" class="form-select">
            <option value="original">Giữ kích thước gốc</option>
            <option value="a4" selected>A4</option>
            <option value="letter">Letter</option>
          </select>
        </div>
        <div style="display:flex;align-items:flex-end;">
          <button class="btn btn-primary" id="btn-convert">
            📄 Tạo PDF (${files.length} ảnh)
          </button>
        </div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:0.9rem;color:var(--text-muted);">Ảnh đã chọn — kéo thả để sắp xếp thứ tự</h3>
      <div class="thumbnail-grid" id="thumbnail-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${files.map((f, i) => `
          <div class="thumbnail-card" data-index="${i}" style="cursor:grab;">
            <img src="${f.dataUrl}" alt="${this.escapeHtml(f.name)}" loading="lazy">
            <span class="page-number">${i+1}</span>
            <span style="display:block;font-size:0.7rem;color:var(--text-muted);padding:4px;text-align:center;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${this.escapeHtml(f.name)}</span>
          </div>
        `).join('')}
        ${files.length > 1 ? '<p style="grid-column:1/-1;font-size:0.75rem;color:var(--text-muted);text-align:center;">↕️ Kéo thả để đổi thứ tự trang</p>' : ''}
      </div>
    `;

    // Sortable init for reordering
    if (files.length > 1) {
      new Sortable(document.getElementById('thumbnail-grid'), {
        animation: 200,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
          const item = this.state.files.splice(evt.oldIndex, 1)[0];
          this.state.files.splice(evt.newIndex, 0, item);
          // Update numbers
          document.querySelectorAll('.thumbnail-card .page-number').forEach((el, i) => {
            el.textContent = i + 1;
          });
        }
      });
    }

    document.getElementById('btn-convert').addEventListener('click', () => this.convert());

    document.getElementById('orientation-select').addEventListener('change', (e) => {
      this.state.orientation = e.target.value;
    });
    document.getElementById('pagesize-select').addEventListener('change', (e) => {
      this.state.pageSize = e.target.value;
    });
  }

  async convert() {
    const btn = document.getElementById('btn-convert');
    btn.disabled = true;
    btn.textContent = '⏳ Đang tạo PDF...';

    try {
      // Try backend first
      let downloaded = false;
      try {
        const resp = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(1000) });
        if (resp.ok) {
          await this.convertBackend();
          downloaded = true;
        }
      } catch {}

      if (!downloaded) {
        await this.convertClientSide();
      }

      showToast('Đã tạo PDF thành công!', 'success');
    } catch (err) {
      console.error('Convert error:', err);
      showToast('Lỗi: ' + err.message, 'error');
    }

    btn.textContent = `📄 Tạo PDF (${this.state.files.length} ảnh)`;
    btn.disabled = false;
  }

  async convertBackend() {
    const formData = new FormData();
    for (const f of this.state.files) {
      const resp = await fetch(f.dataUrl);
      const blob = await resp.blob();
      formData.append('files', blob, f.name);
    }

    const resp = await fetch(`${this.backendUrl}/images-to-pdf`, {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) throw new Error(await resp.text());

    const blob = await resp.blob();
    PDFEngine.download(new Uint8Array(await blob.arrayBuffer()), 'images_converted.pdf');
  }

  async convertClientSide() {
    const { PDFDocument, PageSizes } = PDFLib;

    // Map sizes
    const sizeMap = {
      'a4': [595.28, 841.89],
      'letter': [612, 792],
    };

    const pdfDoc = await PDFDocument.create();

    for (const img of this.state.files) {
      let pageWidth, pageHeight;
      const [defaultW, defaultH] = sizeMap[this.state.pageSize] || [img.width, img.height];

      if (this.state.pageSize === 'original') {
        pageWidth = img.width;
        pageHeight = img.height;
      } else if (this.state.orientation === 'auto') {
        if (img.width > img.height) {
          pageWidth = defaultH;
          pageHeight = defaultW;
        } else {
          pageWidth = defaultW;
          pageHeight = defaultH;
        }
      } else if (this.state.orientation === 'landscape') {
        pageWidth = defaultH;
        pageHeight = defaultW;
      } else {
        pageWidth = defaultW;
        pageHeight = defaultH;
      }

      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Decode base64 data URL to raw bytes
      const base64 = img.dataUrl.split(',')[1];
      const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      let embedded;
      if (img.dataUrl.startsWith('data:image/png')) {
        embedded = await pdfDoc.embedPng(imgBytes);
      } else if (img.dataUrl.startsWith('data:image/jpeg') || img.dataUrl.startsWith('data:image/jpg')) {
        embedded = await pdfDoc.embedJpg(imgBytes);
      } else {
        // Try JPEG first
        try { embedded = await pdfDoc.embedJpg(imgBytes); }
        catch { embedded = await pdfDoc.embedPng(imgBytes); }
      }

      // Fit image to page, maintaining aspect ratio
      const imgRatio = img.width / img.height;
      const pageRatio = pageWidth / pageHeight;
      let drawW, drawH;

      if (imgRatio > pageRatio) {
        drawW = pageWidth - 40;
        drawH = drawW / imgRatio;
      } else {
        drawH = pageHeight - 40;
        drawW = drawH * imgRatio;
      }

      const x = (pageWidth - drawW) / 2;
      const y = (pageHeight - drawH) / 2;

      page.drawImage(embedded, { x, y, width: drawW, height: drawH });
    }

    const pdfBytes = await pdfDoc.save();
    PDFEngine.download(pdfBytes, 'images_converted.pdf');
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new JpgToPdfTool();
export default tool;
