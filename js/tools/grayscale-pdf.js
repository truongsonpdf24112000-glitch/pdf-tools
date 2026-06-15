// js/tools/grayscale-pdf.js — Tool: Grayscale PDF (trắng đen)
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class GrayscaleTool {
  constructor() {
    this.state = { pdfDoc: null, pdfjsDoc: null, bytes: null, pageCount: 0, pages: [], fileName: '', fileSize: 0 };
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `<div class="upload-zone" id="upload-zone"><div class="upload-icon">⬛⬜</div><h3>Kéo thả file PDF vào đây</h3><p class="sub">Chuyển đổi PDF màu sang trắng đen (grayscale)</p></div><input type="file" id="file-input" accept=".pdf,application/pdf" hidden><div id="results-area" style="display:none;"></div>`;
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
    z.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(s.fileName)}</h3><span class="sub">${formatFileSize(s.fileSize)} · ${s.pageCount} trang</span></div><button class="change-btn" id="chg-btn">Đổi file</button>`;
    document.getElementById('chg-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('file-input').click(); });

    const cols = Math.min(s.pageCount, 5);
    r.innerHTML = `
      <div class="convert-card" style="max-width:600px;">
        <div style="text-align:center;margin-bottom:24px;"><span style="font-size:3rem;">⬛⬜</span></div>
        <h2 style="text-align:center;">Chuyển sang Grayscale</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:16px;">${s.pageCount} trang · ${formatFileSize(s.fileSize)}</p>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:24px;font-size:0.85rem;">⚠️ Tool này render lại từng trang dưới dạng ảnh trắng đen, phù hợp với PDF in ấn. Chất lượng phụ thuộc vào DPI.</p>

        <div class="form-group"><label>Chất lượng (DPI)</label>
          <select id="dpi-select" class="form-select">
            <option value="100">100 DPI — Nhẹ, nhanh</option>
            <option value="150" selected>150 DPI — Cân bằng</option>
            <option value="200">200 DPI — Rõ nét</option>
          </select></div>

        <button class="btn btn-primary" id="btn-convert" style="width:100%;padding:14px;">⬛⬜ Chuyển sang Grayscale</button>
        <p style="font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:8px;">File PDF mới sẽ chứa ảnh trắng đen, không còn text có thể chọn</p>
      </div>`;

    document.getElementById('btn-convert').addEventListener('click', () => this.convert());
  }

  async convert() {
    const btn = document.getElementById('btn-convert'); btn.disabled = true; btn.textContent = '⏳ Đang chuyển đổi...';
    const dpi = parseInt(document.getElementById('dpi-select').value) || 150;
    try {
      const { pdfjsDoc, fileName } = this.state;
      const pdfDoc = await PDFLib.PDFDocument.create();
      const scale = dpi / 72;
      const total = this.state.pageCount;

      for (let i = 1; i <= total; i++) {
        btn.textContent = `⏳ Đang xử lý trang ${i}/${total}...`;
        const page = await pdfjsDoc.getPage(i);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Convert to grayscale
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let j = 0; j < imgData.data.length; j += 4) {
          const gray = 0.299 * imgData.data[j] + 0.587 * imgData.data[j+1] + 0.114 * imgData.data[j+2];
          imgData.data[j] = imgData.data[j+1] = imgData.data[j+2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);

        // Embed as JPG
        const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const jpgBytes = Uint8Array.from(atob(jpgDataUrl.split(',')[1]), c => c.charCodeAt(0));
        const img = await pdfDoc.embedJpg(jpgBytes);

        const pdfPage = pdfDoc.addPage([vp.width, vp.height]);
        pdfPage.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      }

      const out = await pdfDoc.save();
      PDFEngine.download(out, fileName.replace(/\.pdf$/i, '_grayscale.pdf'));
      showToast(`Đã chuyển ${total} trang sang grayscale!`, 'success');
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    btn.textContent = '⬛⬜ Chuyển sang Grayscale'; btn.disabled = false;
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new GrayscaleTool();
export default tool;
