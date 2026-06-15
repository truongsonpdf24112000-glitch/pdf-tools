// js/tools/header-footer.js — Tool: Header & Footer
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class HeaderFooterTool {
  constructor() {
    this.state = { pdfDoc: null, bytes: null, pageCount: 0, pages: [], fileName: '', fileSize: 0 };
    this.header = { text: '', size: 12, color: '#888888', margin: 15 };
    this.footer = { text: 'Trang {page}/{total}', size: 10, color: '#888888', margin: 15 };
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `<div class="upload-zone" id="upload-zone"><div class="upload-icon">📋</div><h3>Kéo thả file PDF vào đây</h3><p class="sub">Thêm đầu trang (Header) và chân trang (Footer)</p></div><input type="file" id="file-input" accept=".pdf,application/pdf" hidden><div id="results-area" style="display:none;"></div>`;
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
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, 0.2);
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
        <h3 style="margin-bottom:16px;">📋 Cấu hình Header & Footer</h3>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:16px;">Dùng <code>{page}</code> cho số trang, <code>{total}</code> cho tổng số trang</p>

        <div class="form-group"><label>📌 Header (đầu trang)</label>
          <input class="form-input" id="h-text" value="${this.esc(this.header.text)}" placeholder="Để trống nếu không cần">
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input type="number" class="form-input" id="h-size" value="${this.header.size}" min="6" max="48" style="width:70px;" title="Cỡ chữ">
            <input type="color" id="h-color" value="${this.header.color}" style="width:36px;height:36px;border:none;cursor:pointer;" title="Màu chữ">
            <span style="font-size:0.7rem;color:var(--text-muted);align-self:center;">Lề trên: </span>
            <input type="number" class="form-input" id="h-margin" value="${this.header.margin}" min="0" max="100" style="width:60px;" title="Lề trên (mm)">
            <span style="font-size:0.7rem;color:var(--text-muted);align-self:center;">mm</span>
          </div>
        </div>

        <div class="form-group"><label>📌 Footer (chân trang)</label>
          <input class="form-input" id="f-text" value="${this.esc(this.footer.text)}" placeholder="Để trống nếu không cần">
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input type="number" class="form-input" id="f-size" value="${this.footer.size}" min="6" max="48" style="width:70px;" title="Cỡ chữ">
            <input type="color" id="f-color" value="${this.footer.color}" style="width:36px;height:36px;border:none;cursor:pointer;" title="Màu chữ">
            <span style="font-size:0.7rem;color:var(--text-muted);align-self:center;">Lề dưới: </span>
            <input type="number" class="form-input" id="f-margin" value="${this.footer.margin}" min="0" max="100" style="width:60px;" title="Lề dưới (mm)">
            <span style="font-size:0.7rem;color:var(--text-muted);align-self:center;">mm</span>
          </div>
        </div>

        <div class="form-group"><label>Trang áp dụng</label>
          <select id="page-range" class="form-select">
            <option value="all">Tất cả các trang</option>
            <option value="skip-first">Bỏ qua trang đầu</option>
            <option value="skip-first-last">Bỏ qua trang đầu & cuối</option>
          </select></div>

        <button class="btn btn-primary" id="btn-apply" style="width:100%;padding:14px;">📋 Thêm Header/Footer</button>
      </div>`;

    document.getElementById('btn-apply').addEventListener('click', () => this.apply());
  }

  async apply() {
    const btn = document.getElementById('btn-apply'); btn.disabled = true; btn.textContent = '⏳ Đang áp dụng...';
    try {
      const h = {
        text: document.getElementById('h-text').value,
        size: parseInt(document.getElementById('h-size').value) || 12,
        color: document.getElementById('h-color').value,
        margin: parseFloat(document.getElementById('h-margin').value) || 15
      };
      const f = {
        text: document.getElementById('f-text').value,
        size: parseInt(document.getElementById('f-size').value) || 10,
        color: document.getElementById('f-color').value,
        margin: parseFloat(document.getElementById('f-margin').value) || 15
      };
      const range = document.getElementById('page-range').value;

      const doc = await PDFLib.PDFDocument.load(this.state.bytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const pages = doc.getPages();
      const total = pages.length;
      const mmToPt = 72 / 25.4;

      pages.forEach((page, i) => {
        let skip = false;
        if (range === 'skip-first' && i === 0) skip = true;
        if (range === 'skip-first-last' && (i === 0 || i === total - 1)) skip = true;
        if (skip) return;

        const { width, height } = page.getSize();
        const pageNum = i + 1;
        const sc = (t) => t.replace(/\{page\}/g, pageNum).replace(/\{total\}/g, total);

        // Header
        if (h.text) {
          const hc = this.hexRgb(h.color);
          page.drawText(sc(h.text), {
            x: width / 2 - font.widthOfTextAtSize(sc(h.text), h.size) / 2,
            y: height - h.margin * mmToPt,
            size: h.size, font, color: PDFLib.rgb(hc.r, hc.g, hc.b)
          });
        }

        // Footer
        if (f.text) {
          const fc = this.hexRgb(f.color);
          page.drawText(sc(f.text), {
            x: width / 2 - font.widthOfTextAtSize(sc(f.text), f.size) / 2,
            y: f.margin * mmToPt,
            size: f.size, font, color: PDFLib.rgb(fc.r, fc.g, fc.b)
          });
        }
      });

      const out = await doc.save();
      PDFEngine.download(out, this.state.fileName.replace(/\.pdf$/i, '_headerfooter.pdf'));
      showToast('Đã thêm Header/Footer!', 'success');
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    btn.textContent = '📋 Thêm Header/Footer'; btn.disabled = false;
  }

  hexRgb(h) { const x = h.replace('#',''); return { r: parseInt(x.substring(0,2),16)/255, g: parseInt(x.substring(2,4),16)/255, b: parseInt(x.substring(4,6),16)/255 }; }
  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new HeaderFooterTool();
export default tool;
