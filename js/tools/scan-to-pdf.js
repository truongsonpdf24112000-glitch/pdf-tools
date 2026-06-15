// js/tools/scan-to-pdf.js — Tool: Scan to PDF (chụp ảnh → PDF)
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast } from '../utils/ui-helpers.js';

class ScanToPdfTool {
  constructor() {
    this.state = { captures: [] }; // [{dataUrl, width, height, name}]
    this.stream = null;
    this.pageSize = 'a4'; // a4 | letter | original
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `
      <div class="convert-card" style="max-width:700px;">
        <h3 style="text-align:center;margin-bottom:8px;">📸 Scan to PDF</h3>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:16px;">Chụp ảnh tài liệu bằng camera và tạo file PDF</p>

        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <button class="btn btn-primary" id="btn-start-cam" style="flex:1;padding:14px;">📷 Mở Camera</button>
          <button class="btn btn-secondary" id="btn-upload-img" style="flex:1;padding:14px;">📁 Upload ảnh</button>
          <input type="file" id="img-upload" accept="image/*" multiple hidden>
        </div>

        <div id="camera-area" style="display:none;text-align:center;margin-bottom:16px;">
          <video id="camera-video" autoplay playsinline style="width:100%;max-height:400px;border-radius:8px;background:#000;"></video>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-primary" id="btn-capture" style="flex:1;">📸 Chụp</button>
            <button class="btn btn-secondary" id="btn-stop-cam" style="flex:1;">⏹️ Tắt</button>
          </div>
        </div>

        <div id="preview-area">
          ${this.state.captures.length === 0
            ? '<p style="text-align:center;color:var(--text-muted);">Chưa có ảnh nào. Chụp hoặc upload ảnh để bắt đầu.</p>'
            : this.renderCaptures()}
        </div>

        ${this.state.captures.length > 0
          ? `<div style="display:flex;gap:12px;margin-top:16px;">
              <div class="form-group" style="flex:1;"><label>Khổ giấy</label>
                <select id="page-size" class="form-select"><option value="a4" selected>A4</option><option value="letter">Letter</option><option value="original">Kích thước gốc</option></select></div>
              <button class="btn btn-primary" id="btn-create-pdf" style="flex:1;height:42px;align-self:flex-end;">📄 Tạo PDF (${this.state.captures.length} ảnh)</button>
            </div>`
          : ''}
      </div>`;
  }

  renderCaptures() {
    const cols = Math.min(this.state.captures.length, 4);
    return `
      <div class="thumbnail-grid" id="capture-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${this.state.captures.map((cap, i) => `
          <div class="thumbnail-card" data-index="${i}" style="position:relative;cursor:grab;">
            <img src="${cap.dataUrl}" alt="Scan ${i+1}" loading="lazy">
            <span class="page-number">${i+1}</span>
            <button class="btn-delete-scan" data-idx="${i}" style="position:absolute;top:4px;right:4px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;">✕</button>
          </div>
        `).join('')}
      </div>
      <p style="font-size:0.7rem;color:var(--text-muted);text-align:center;margin-top:8px;">↕️ Kéo thả để sắp xếp thứ tự · ✕ để xóa</p>`;
  }

  setupEvents() {
    const c = document.getElementById('tool-container');

    c.addEventListener('click', e => {
      if (e.target.id === 'btn-start-cam') this.startCamera();
      if (e.target.id === 'btn-stop-cam') this.stopCamera();
      if (e.target.id === 'btn-capture') this.capture();
      if (e.target.id === 'btn-upload-img') document.getElementById('img-upload').click();
      if (e.target.id === 'btn-create-pdf') this.createPdf();
      if (e.target.classList.contains('btn-delete-scan')) {
        this.state.captures.splice(parseInt(e.target.dataset.idx), 1);
        this.render(); this.setupEvents();
        if (this.state.captures.length > 1) this.initSortable();
      }
    });

    document.getElementById('img-upload').addEventListener('change', async e => {
      for (const file of [...e.target.files]) {
        const dataUrl = await this.readFile(file);
        const dims = await this.getDimensions(dataUrl);
        this.state.captures.push({ dataUrl, width: dims.width, height: dims.height, name: file.name });
      }
      this.render(); this.setupEvents();
      if (this.state.captures.length > 1) this.initSortable();
    });
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
      const video = document.getElementById('camera-video');
      video.srcObject = this.stream;
      document.getElementById('camera-area').style.display = 'block';
      document.getElementById('btn-start-cam').style.display = 'none';
    } catch (e) {
      showToast('Không truy cập được camera: ' + e.message, 'error');
    }
  }

  stopCamera() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    document.getElementById('camera-area').style.display = 'none';
    document.getElementById('btn-start-cam').style.display = '';
  }

  capture() {
    const video = document.getElementById('camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    this.state.captures.push({ dataUrl, width: canvas.width, height: canvas.height, name: `scan_${Date.now()}.jpg` });
    this.render(); this.setupEvents();
    if (this.state.captures.length > 1) this.initSortable();
    showToast('Đã chụp!', 'success');
  }

  initSortable() {
    new Sortable(document.getElementById('capture-grid'), {
      animation: 200, ghostClass: 'sortable-ghost',
      onEnd: (evt) => {
        const item = this.state.captures.splice(evt.oldIndex, 1)[0];
        this.state.captures.splice(evt.newIndex, 0, item);
        this.render(); this.setupEvents();
        this.initSortable();
      }
    });
  }

  async createPdf() {
    const btn = document.getElementById('btn-create-pdf'); btn.disabled = true; btn.textContent = '⏳ Đang tạo...';
    try {
      const sizeEl = document.getElementById('page-size');
      if (sizeEl) this.pageSize = sizeEl.value;

      const sizes = { a4: [595.28, 841.89], letter: [612, 792] };
      const pdfDoc = await PDFLib.PDFDocument.create();

      for (const cap of this.state.captures) {
        let pw, ph;
        if (this.pageSize === 'original') { pw = cap.width; ph = cap.height; }
        else { [pw, ph] = sizes[this.pageSize] || sizes.a4; }

        const page = pdfDoc.addPage([pw, ph]);
        const base64 = cap.dataUrl.split(',')[1];
        const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        let img;
        try { img = await pdfDoc.embedJpg(imgBytes); } catch { img = await pdfDoc.embedPng(imgBytes); }

        const ratio = img.width / img.height;
        const pageRatio = pw / ph;
        let dw, dh;
        if (ratio > pageRatio) { dw = pw - 40; dh = dw / ratio; }
        else { dh = ph - 40; dw = dh * ratio; }
        page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      }

      const out = await pdfDoc.save();
      PDFEngine.download(out, 'scan.pdf');
      showToast('Đã tạo PDF!', 'success');
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    btn.textContent = `📄 Tạo PDF (${this.state.captures.length} ảnh)`; btn.disabled = false;
  }

  readFile(file) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }); }
  getDimensions(u) { return new Promise(r => { const i = new Image(); i.onload = () => r({ width: i.width, height: i.height }); i.src = u; }); }
  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new ScanToPdfTool();
export default tool;
