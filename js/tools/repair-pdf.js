// js/tools/repair-pdf.js — Tool: Sửa PDF bị lỗi / hỏng
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class RepairPdfTool {
  constructor() {
    this.state = { bytes: null, fileName: '', fileSize: 0 };
    this.backendUrl = null;
  }

  async init() {
    const { getBackendUrl } = await import('../utils/config.js');
    this.backendUrl = await getBackendUrl();
    this.render();
    this.setupEvents();
  }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">🔧</div>
        <h3>Kéo thả file PDF bị lỗi vào đây</h3>
        <p class="sub">Tự động sửa các lỗi cấu trúc PDF, file bị hỏng nhẹ</p>
        <p class="sub" style="font-size:0.7rem;margin-top:4px;">Dành cho PDF không mở được, báo lỗi, hoặc tải về bị lỗi</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
      <div id="results-area" style="display:none;"></div>`;
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
      this.state = { bytes: new Uint8Array(buf), fileName: file.name, fileSize: file.size };

      // Try to detect issues
      const issues = this.detectIssues(new Uint8Array(buf));
      hideLoading();
      this.renderResults(issues);
    } catch (e) {
      hideLoading();
      // Even if detection fails, still offer repair
      this.renderResults([{ level: 'warning', msg: 'Không thể phân tích file — có thể file bị hỏng nặng' }]);
    }
  }

  detectIssues(bytes) {
    const issues = [];
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (!header.startsWith('%PDF')) issues.push({ level: 'error', msg: 'Thiếu header %PDF — file có thể không phải PDF' });

    const lastBytes = bytes.slice(-1024);
    const lastText = new TextDecoder().decode(lastBytes);
    if (!lastText.includes('%%EOF')) issues.push({ level: 'warning', msg: 'Thiếu %%EOF marker — file tải không hoàn chỉnh' });

    if (bytes.length < 100) issues.push({ level: 'warning', msg: `File quá nhỏ (${bytes.length} bytes) — có thể bị hỏng` });

    if (issues.length === 0) issues.push({ level: 'info', msg: 'Không phát hiện lỗi rõ ràng — vẫn có thể sửa để tối ưu' });
    return issues;
  }

  renderResults(issues) {
    const { fileName, fileSize } = this.state;
    const r = document.getElementById('results-area');
    r.style.display = 'block';

    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(fileName)}</h3><span class="sub">${formatFileSize(fileSize)}</span></div><button class="change-btn" id="chg-btn">Đổi file</button>`;
    document.getElementById('chg-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('file-input').click(); });

    const levelIcons = { error: '🔴', warning: '🟡', info: '🔵' };
    const levelColors = { error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--text-muted)' };

    r.innerHTML = `
      <div class="convert-card" style="max-width:600px;">
        <div style="text-align:center;margin-bottom:24px;"><span style="font-size:3rem;">🔧</span></div>
        <h2 style="text-align:center;">Sửa PDF</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:16px;">${this.esc(fileName)} · ${formatFileSize(fileSize)}</p>

        <div style="background:var(--bg-input);padding:16px;border-radius:8px;margin-bottom:16px;">
          <h4 style="margin:0 0 8px;">Kết quả phân tích:</h4>
          ${issues.map(i => `<div style="color:${levelColors[i.level]};font-size:0.85rem;margin-bottom:4px;">${levelIcons[i.level]} ${i.msg}</div>`).join('')}
        </div>

        <div class="form-group"><label>Phương pháp sửa</label>
          <select id="repair-method" class="form-select">
            <option value="basic" selected>🔧 Cơ bản — copy pages sang PDF mới (sửa hầu hết lỗi)</option>
            <option value="deep">🔧🔧 Sâu — render lại từng trang (cho file hỏng nặng, chậm hơn)</option>
          </select></div>

        <div id="backend-info" style="font-size:0.75rem;text-align:center;margin-bottom:12px;"></div>

        <button class="btn btn-primary" id="btn-repair" style="width:100%;padding:14px;">🔧 Sửa PDF</button>

        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:16px;">
          <strong>Cách hoạt động:</strong><br>
          <strong>Cơ bản:</strong> Đọc từng trang PDF → copy sang file mới → bỏ qua các phần bị lỗi<br>
          <strong>Sâu:</strong> Render từng trang thành ảnh → tạo PDF mới (mất text, nhưng đảm bảo sửa được)
        </p>
      </div>`;

    this.updateBackendInfo();
    document.getElementById('btn-repair').addEventListener('click', () => this.repair());
  }

  async updateBackendInfo() {
    const info = document.getElementById('backend-info');
    if (this.backendUrl) {
      info.innerHTML = '<span style="color:var(--success);">✅ Backend sẵn sàng — dùng pikepdf để sửa chuyên sâu</span>';
    } else {
      info.innerHTML = '<span style="color:var(--text-muted);">⚡ Client-side repair — phù hợp hầu hết trường hợp</span>';
    }
  }

  async repair() {
    const btn = document.getElementById('btn-repair'); btn.disabled = true; btn.textContent = '⏳ Đang sửa...';
    const method = document.getElementById('repair-method').value;

    try {
      let outputBytes;

      if (this.backendUrl) {
        // Try backend first (pikepdf)
        try {
          const fd = new FormData();
          fd.append('file', new Blob([this.state.bytes], { type: 'application/pdf' }), this.state.fileName);
          const resp = await fetch(`${this.backendUrl}/repair`, {
            method: 'POST', body: fd, signal: AbortSignal.timeout(30000)
          });
          if (resp.ok) {
            outputBytes = new Uint8Array(await resp.arrayBuffer());
          }
        } catch {}
      }

      if (!outputBytes) {
        if (method === 'deep') {
          outputBytes = await this.deepRepair();
        } else {
          outputBytes = await this.basicRepair();
        }
      }

      PDFEngine.download(outputBytes, this.state.fileName.replace(/\.pdf$/i, '_repaired.pdf'));
      showToast('Đã sửa PDF! File mới đã được tạo.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Không thể sửa file này: ' + e.message, 'error');
    }
    btn.textContent = '🔧 Sửa PDF'; btn.disabled = false;
  }

  async basicRepair() {
    const { bytes } = this.state;
    // Try loading with pdf-lib (ignores many errors)
    let doc;
    try {
      doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      throw new Error('File PDF quá hỏng, không thể đọc được. Thử phương pháp Sâu.');
    }

    const newDoc = await PDFLib.PDFDocument.create();
    const pageCount = doc.getPageCount();
    if (pageCount === 0) throw new Error('Không tìm thấy trang nào trong PDF');

    const indices = Array.from({ length: pageCount }, (_, i) => i);
    const copiedPages = await newDoc.copyPages(doc, indices);
    copiedPages.forEach(p => newDoc.addPage(p));

    return await newDoc.save({ useObjectStreams: true });
  }

  async deepRepair() {
    // Render every page to image, create fresh PDF
    const { bytes, fileName } = this.state;
    let pdfjsDoc;
    try {
      pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(), disableAutoFetch: true }).promise;
    } catch {
      throw new Error('File quá hỏng, không thể render trang nào');
    }

    const newDoc = await PDFLib.PDFDocument.create();
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      btn && (document.getElementById('btn-repair').textContent = `⏳ Render trang ${i}/${pdfjsDoc.numPages}...`);
      const page = await pdfjsDoc.getPage(i);
      const vp = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const jpg = canvas.toDataURL('image/jpeg', 0.9);
      const jpgBytes = Uint8Array.from(atob(jpg.split(',')[1]), c => c.charCodeAt(0));
      const img = await newDoc.embedJpg(jpgBytes);
      const p = newDoc.addPage([vp.width, vp.height]);
      p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
    }

    return await newDoc.save();
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new RepairPdfTool();
export default tool;
