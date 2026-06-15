// js/tools/watermark.js — Tool: Watermark (thêm logo/text mờ)
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class WatermarkTool {
  constructor() {
    this.state = { pdfDoc: null, pdfjsDoc: null, bytes: null, pageCount: 0, pages: [], fileName: '', fileSize: 0 };
    this.wmType = 'text'; // text | image
    this.wmText = 'BẢN NHÁP';
    this.wmOpacity = 0.3;
    this.wmSize = 48;
    this.wmColor = '#ff0000';
    this.wmAngle = 45;
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `<div class="upload-zone" id="upload-zone"><div class="upload-icon">💧</div><h3>Kéo thả file PDF vào đây</h3><p class="sub">Thêm watermark text hoặc logo vào PDF</p></div><input type="file" id="file-input" accept=".pdf,application/pdf" hidden><div id="results-area" style="display:none;"></div>`;
  }

  setupEvents() {
    const z = document.getElementById('upload-zone'), inp = document.getElementById('file-input');
    z.addEventListener('click', () => inp.click());
    inp.addEventListener('change', e => { if (e.target.files[0]) this.handleFile(e.target.files[0]); });
    z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('drag-over'); });
    z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
    z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('drag-over'); if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]); });
  }

  async handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Chọn file PDF', 'error'); return; }
    const c = document.getElementById('tool-container'); showLoading(c);
    try {
      const buf = await file.arrayBuffer();
      const { pdfDoc, pdfjsDoc, bytes, pageCount } = await PDFEngine.load(buf);
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, 0.25);
      this.state = { pdfDoc, pdfjsDoc, bytes, pageCount, pages, fileName: file.name, fileSize: file.size };
      hideLoading(); this.renderSelection();
    } catch (e) { hideLoading(); showToast('Lỗi đọc PDF', 'error'); }
  }

  renderSelection() {
    const s = this.state, r = document.getElementById('results-area');
    r.style.display = 'block';
    const z = document.getElementById('upload-zone');
    z.className = 'upload-zone compact';
    z.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(s.fileName)}</h3><span class="sub">${formatFileSize(s.fileSize)} · ${s.pageCount} trang</span></div><button class="change-btn" id="chg-btn">Đổi file</button>`;
    document.getElementById('chg-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('file-input').click(); });

    const cols = Math.min(s.pageCount, 4);
    r.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;align-items:flex-end;">
        <div><label style="font-size:0.7rem;color:var(--text-muted);">Loại</label>
          <select id="wm-type" class="form-select" style="width:auto;"><option value="text">Text</option><option value="image">Logo/Ảnh</option></select></div>
        <div id="text-opts"><label style="font-size:0.7rem;color:var(--text-muted);">Nội dung</label>
          <input class="form-input" id="wm-text" value="${this.esc(this.wmText)}" style="width:140px;"></div>
        <div><label style="font-size:0.7rem;color:var(--text-muted);">Độ mờ</label>
          <input type="range" id="wm-opacity" min="5" max="100" value="${this.wmOpacity*100}" style="width:80px;"></div>
        <div><label style="font-size:0.7rem;color:var(--text-muted);">Cỡ chữ</label>
          <input type="number" id="wm-size" class="form-input" value="${this.wmSize}" min="8" max="200" style="width:60px;"></div>
        <div><label style="font-size:0.7rem;color:var(--text-muted);">Màu</label>
          <input type="color" id="wm-color" value="${this.wmColor}" style="width:36px;height:36px;border:none;cursor:pointer;"></div>
        <div><label style="font-size:0.7rem;color:var(--text-muted);">Xoay (°)</label>
          <input type="number" id="wm-angle" class="form-input" value="${this.wmAngle}" min="-180" max="180" style="width:55px;"></div>
        <div id="img-opt" style="display:none;"><label style="font-size:0.7rem;color:var(--text-muted);">Ảnh</label>
          <input type="file" id="wm-image" accept="image/*" style="font-size:0.75rem;"></div>
        <div style="margin-left:auto;"><button class="btn btn-primary" id="btn-apply">💧 Thêm Watermark</button></div>
      </div>
      <div class="thumbnail-grid" id="thumb-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${s.pages.map((p, i) => `<div class="thumbnail-card"><img src="${p.thumbnail}" alt="Trang ${i+1}"><span class="page-number">${i+1}</span></div>`).join('')}
      </div>`;

    document.getElementById('wm-type').addEventListener('change', e => {
      this.wmType = e.target.value;
      document.getElementById('text-opts').style.display = this.wmType === 'text' ? '' : 'none';
      document.getElementById('img-opt').style.display = this.wmType === 'image' ? '' : 'none';
    });
    document.getElementById('wm-text').addEventListener('input', e => this.wmText = e.target.value);
    document.getElementById('wm-opacity').addEventListener('input', e => this.wmOpacity = e.target.value / 100);
    document.getElementById('wm-size').addEventListener('input', e => this.wmSize = parseInt(e.target.value) || 48);
    document.getElementById('wm-color').addEventListener('input', e => this.wmColor = e.target.value);
    document.getElementById('wm-angle').addEventListener('input', e => this.wmAngle = parseInt(e.target.value) || 0);
    document.getElementById('wm-image').addEventListener('change', e => { if (e.target.files[0]) this.wmImageFile = e.target.files[0]; });
    document.getElementById('btn-apply').addEventListener('click', () => this.apply());
  }

  async apply() {
    const btn = document.getElementById('btn-apply'); btn.disabled = true; btn.textContent = '⏳ Đang thêm...';
    try {
      const { pdfDoc, bytes } = this.state;
      const doc = await PDFLib.PDFDocument.load(bytes);

      if (this.wmType === 'text') {
        const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const color = this.hexToRgb(this.wmColor);
        const pages = doc.getPages();
        for (const page of pages) {
          const { width, height } = page.getSize();
          // Draw multiple diagonal watermarks
          for (let x = -width; x < width * 2; x += width * 0.4) {
            for (let y = -height; y < height * 2; y += height * 0.4) {
              page.drawText(this.wmText, {
                x, y, size: this.wmSize,
                font, opacity: this.wmOpacity,
                color: PDFLib.rgb(color.r, color.g, color.b),
                rotate: PDFLib.degrees(this.wmAngle)
              });
            }
          }
        }
      } else if (this.wmImageFile) {
        const imgBytes = new Uint8Array(await this.wmImageFile.arrayBuffer());
        let img;
        if (this.wmImageFile.type === 'image/png') img = await doc.embedPng(imgBytes);
        else img = await doc.embedJpg(imgBytes);
        const pages = doc.getPages();
        for (const page of pages) {
          const { width, height } = page.getSize();
          const s = Math.min(width, height) * 0.4;
          const ratio = img.width / img.height;
          const iw = s, ih = s / ratio;
          page.drawImage(img, { x: width/2 - iw/2, y: height/2 - ih/2, width: iw, height: ih, opacity: this.wmOpacity });
        }
      }

      const out = await doc.save();
      PDFEngine.download(out, this.state.fileName.replace(/\.pdf$/i, '_wm.pdf'));
      showToast('Đã thêm watermark!', 'success');
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    btn.textContent = '💧 Thêm Watermark'; btn.disabled = false;
  }

  hexToRgb(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.substring(0,2), 16)/255, g: parseInt(h.substring(2,4), 16)/255, b: parseInt(h.substring(4,6), 16)/255 };
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new WatermarkTool();
export default tool;
