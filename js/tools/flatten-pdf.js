// js/tools/flatten-pdf.js — Tool: Flatten PDF (làm phẳng)
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class FlattenPdfTool {
  constructor() {
    this.state = { pdfDoc: null, pdfjsDoc: null, bytes: null, pageCount: 0, pages: [], fileName: '', fileSize: 0 };
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `<div class="upload-zone" id="upload-zone"><div class="upload-icon">🔨</div><h3>Kéo thả file PDF vào đây</h3><p class="sub">Làm phẳng PDF — gộp form fields, annotations, layers thành nội dung cố định</p></div><input type="file" id="file-input" accept=".pdf,application/pdf" hidden><div id="results-area" style="display:none;"></div>`;
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

    const cols = Math.min(s.pageCount, 5);
    r.innerHTML = `
      <div class="convert-card" style="max-width:600px;">
        <div style="text-align:center;margin-bottom:24px;"><span style="font-size:3rem;">🔨</span></div>
        <h2 style="text-align:center;">Làm phẳng PDF</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:8px;">${s.pageCount} trang · ${formatFileSize(s.fileSize)}</p>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;font-size:0.85rem;">
          <strong>Làm phẳng</strong> sẽ gộp tất cả form fields, text boxes, annotations và layers thành nội dung cố định.<br>
          Sau khi flatten, không thể chỉnh sửa form fields được nữa.
        </p>

        <div class="form-group"><label>Tùy chọn</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-primary);margin-bottom:8px;">
            <input type="checkbox" id="flatten-forms" checked> Gộp form fields (text input, checkboxes...)
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-primary);margin-bottom:8px;">
            <input type="checkbox" id="flatten-annotations" checked> Gộp annotations (ghi chú, highlight...)
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-primary);">
            <input type="checkbox" id="render-all"> Render tất cả trang thành ảnh (đảm bảo 100% phẳng, nhưng mất text)
          </label>
        </div>

        <button class="btn btn-primary" id="btn-flatten" style="width:100%;padding:14px;">🔨 Làm phẳng PDF</button>
        <p id="note" style="font-size:0.7rem;color:var(--text-muted);text-align:center;margin-top:8px;">Flatten không làm thay đổi nội dung hiển thị</p>
      </div>`;

    document.getElementById('render-all').addEventListener('change', e => {
      document.getElementById('note').textContent = e.target.checked
        ? '⚠️ Chế độ render: mỗi trang sẽ được chuyển thành ảnh (không còn text có thể chọn)'
        : 'Flatten không làm thay đổi nội dung hiển thị';
    });

    document.getElementById('btn-flatten').addEventListener('click', () => this.flatten());
  }

  async flatten() {
    const btn = document.getElementById('btn-flatten'); btn.disabled = true; btn.textContent = '⏳ Đang làm phẳng...';
    const renderAll = document.getElementById('render-all').checked;

    try {
      const { bytes, pdfjsDoc, pageCount, fileName } = this.state;
      const doc = await PDFLib.PDFDocument.load(bytes);

      if (renderAll) {
        // Render every page to image, create new PDF
        btn.textContent = '⏳ Đang render từng trang...';
        const newDoc = await PDFLib.PDFDocument.create();
        const scale = 1.5;

        for (let i = 1; i <= pageCount; i++) {
          btn.textContent = `⏳ Render trang ${i}/${pageCount}...`;
          const page = await pdfjsDoc.getPage(i);
          const vp = page.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;

          const dataUrl = c.toDataURL('image/jpeg', 0.9);
          const jpgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), x => x.charCodeAt(0));
          const img = await newDoc.embedJpg(jpgBytes);
          const p = newDoc.addPage([vp.width, vp.height]);
          p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
        }

        const out = await newDoc.save();
        PDFEngine.download(out, fileName.replace(/\.pdf$/i, '_flattened.pdf'));
      } else {
        // pdf-lib copyPages automatically strips annotations and form fields
        const newDoc = await PDFLib.PDFDocument.create();
        const indices = Array.from({ length: pageCount }, (_, i) => i);
        const copied = await newDoc.copyPages(doc, indices);
        copied.forEach(p => newDoc.addPage(p));

        const out = await newDoc.save({ useObjectStreams: true });
        PDFEngine.download(out, fileName.replace(/\.pdf$/i, '_flattened.pdf'));
      }

      showToast(`Đã làm phẳng ${pageCount} trang!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Lỗi: ' + e.message, 'error');
    }
    btn.textContent = '🔨 Làm phẳng PDF'; btn.disabled = false;
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new FlattenPdfTool();
export default tool;
