// js/tools/bates-numbering.js — Tool: Bates Numbering (đánh số pháp lý)
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class BatesNumberingTool {
  constructor() {
    this.state = { pdfDoc: null, bytes: null, pageCount: 0, pages: [], fileName: '', fileSize: 0 };
    this.prefix = 'EXHIBIT-';
    this.startNum = 1;
    this.digits = 6;           // zero-padded: 000001
    this.position = 'bottom-right';
    this.fontSize = 10;
    this.skipFirst = false;
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `<div class="upload-zone" id="upload-zone"><div class="upload-icon">🔢</div><h3>Kéo thả file PDF vào đây</h3><p class="sub">Đánh số Bates — dùng cho tài liệu pháp lý, chứng từ</p></div><input type="file" id="file-input" accept=".pdf,application/pdf" hidden><div id="results-area" style="display:none;"></div>`;
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
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, 0.15);
      this.state = { pdfDoc, pdfjsDoc, bytes, pageCount, pages, fileName: file.name, fileSize: file.size };
      hideLoading(); this.renderSelection();
    } catch (e) { hideLoading(); showToast('Lỗi đọc PDF', 'error'); }
  }

  renderSelection() {
    const s = this.state, r = document.getElementById('results-area');
    r.style.display = 'block';
    const z = document.getElementById('upload-zone');
    z.className = 'upload-zone compact';
    z.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(s.fileName)}</h3><span class="sub">${s.pageCount} trang</span></div><button class="change-btn" id="chg-btn">Đổi file</button>`;
    document.getElementById('chg-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('file-input').click(); });

    r.innerHTML = `
      <div class="convert-card" style="max-width:600px;">
        <h3 style="margin-bottom:16px;">🔢 Cấu hình Bates Numbering</h3>

        <div class="form-group"><label>Tiền tố (Prefix)</label>
          <input class="form-input" id="b-prefix" value="${this.esc(this.prefix)}" placeholder="VD: EXHIBIT-, ABC-"></div>

        <div style="display:flex;gap:12px;">
          <div class="form-group" style="flex:1;"><label>Bắt đầu từ số</label>
            <input type="number" class="form-input" id="b-start" value="${this.startNum}" min="1"></div>
          <div class="form-group" style="flex:1;"><label>Số chữ số (zero-pad)</label>
            <input type="number" class="form-input" id="b-digits" value="${this.digits}" min="1" max="12"></div>
        </div>

        <div style="display:flex;gap:12px;">
          <div class="form-group" style="flex:1;"><label>Cỡ chữ</label>
            <input type="number" class="form-input" id="b-size" value="${this.fontSize}" min="6" max="36"></div>
          <div class="form-group" style="flex:1;"><label>Vị trí</label>
            <select id="b-pos" class="form-select">
              <option value="bottom-right" selected>Dưới phải</option>
              <option value="bottom-center">Dưới giữa</option>
              <option value="bottom-left">Dưới trái</option>
              <option value="top-right">Trên phải</option>
              <option value="top-left">Trên trái</option>
            </select></div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-primary);margin-bottom:16px;">
          <input type="checkbox" id="b-skip"> Bỏ qua trang đầu (trang bìa)
        </label>

        <div style="background:var(--bg-input);padding:12px;border-radius:8px;text-align:center;margin-bottom:16px;">
          <span style="font-size:0.75rem;color:var(--text-muted);">Xem trước:</span>
          <span style="font-weight:700;font-size:1.1rem;display:block;margin-top:4px;" id="b-preview">${this.prefix}${String(this.startNum).padStart(this.digits, '0')}</span>
        </div>

        <button class="btn btn-primary" id="btn-apply" style="width:100%;padding:14px;">🔢 Đánh số Bates</button>
      </div>`;

    // Preview update
    const updatePreview = () => {
      this.prefix = document.getElementById('b-prefix').value;
      this.startNum = parseInt(document.getElementById('b-start').value) || 1;
      this.digits = parseInt(document.getElementById('b-digits').value) || 6;
      document.getElementById('b-preview').textContent = this.prefix + String(this.startNum).padStart(this.digits, '0');
    };
    ['b-prefix','b-start','b-digits'].forEach(id => {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    document.getElementById('btn-apply').addEventListener('click', () => this.apply());
  }

  async apply() {
    const btn = document.getElementById('btn-apply'); btn.disabled = true; btn.textContent = '⏳ Đang đánh số...';
    try {
      this.prefix = document.getElementById('b-prefix').value;
      this.startNum = parseInt(document.getElementById('b-start').value) || 1;
      this.digits = parseInt(document.getElementById('b-digits').value) || 6;
      this.fontSize = parseInt(document.getElementById('b-size').value) || 10;
      this.position = document.getElementById('b-pos').value;
      this.skipFirst = document.getElementById('b-skip').checked;

      const doc = await PDFLib.PDFDocument.load(this.state.bytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const pages = doc.getPages();
      const mmToPt = 72 / 25.4;

      pages.forEach((page, i) => {
        if (this.skipFirst && i === 0) return;
        const num = this.prefix + String(this.startNum + (this.skipFirst ? i - 1 : i)).padStart(this.digits, '0');
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(num, this.fontSize);
        const margin = 10 * mmToPt;
        let x, y;

        switch (this.position) {
          case 'bottom-right': x = width - textWidth - margin; y = margin + this.fontSize; break;
          case 'bottom-center': x = (width - textWidth) / 2; y = margin + this.fontSize; break;
          case 'bottom-left': x = margin; y = margin + this.fontSize; break;
          case 'top-right': x = width - textWidth - margin; y = height - margin; break;
          case 'top-left': x = margin; y = height - margin; break;
          default: x = width - textWidth - margin; y = margin + this.fontSize;
        }

        page.drawText(num, { x, y, size: this.fontSize, font, color: PDFLib.rgb(0.3, 0.3, 0.3) });
      });

      const out = await doc.save();
      PDFEngine.download(out, this.state.fileName.replace(/\.pdf$/i, '_bates.pdf'));
      showToast('Đã đánh số Bates!', 'success');
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    btn.textContent = '🔢 Đánh số Bates'; btn.disabled = false;
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new BatesNumberingTool();
export default tool;
