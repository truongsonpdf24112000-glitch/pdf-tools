// js/tools/lock.js — Tool: Khóa / Mở khóa PDF bằng mật khẩu
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class PDFLockTool {
  constructor() {
    this.state = {
      pdfDoc: null,
      pdfjsDoc: null,
      bytes: null,
      pageCount: 0,
      fileName: '',
      fileSize: 0,
      isEncrypted: false
    };
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
        <div class="upload-icon">🔒</div>
        <h3>Kéo thả file PDF vào đây</h3>
        <p class="sub">Đặt mật khẩu bảo vệ hoặc mở khóa PDF</p>
      </div>
      <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
      <div id="results-area" style="display:none;"></div>
    `;
  }

  setupEvents() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFile(e.target.files[0]);
    });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
    });
  }

  async handleFile(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Vui lòng chọn file PDF', 'error');
      return;
    }

    const container = document.getElementById('tool-container');
    showLoading(container);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Try loading to check if encrypted
      let isEncrypted = false;
      let pdfDoc = null;
      let pdfjsDoc = null;
      let pageCount = 0;

      try {
        const result = await PDFEngine.load(buffer);
        pdfDoc = result.pdfDoc;
        pdfjsDoc = result.pdfjsDoc;
        pageCount = result.pageCount;
      } catch (e) {
        // Check if it's an encryption error
        if (e.message && (e.message.includes('encrypt') || e.message.includes('password'))) {
          isEncrypted = true;
        } else {
          throw e;
        }
      }

      this.state = {
        pdfDoc, pdfjsDoc, bytes, pageCount,
        fileName: file.name,
        fileSize: file.size,
        isEncrypted
      };

      hideLoading();
      this.renderForm();
    } catch (err) {
      hideLoading();
      console.error('Lock load error:', err);
      showToast('Không thể đọc file PDF. File có thể bị hỏng.', 'error');
    }
  }

  renderForm() {
    const { fileName, fileSize, pageCount, isEncrypted } = this.state;
    const results = document.getElementById('results-area');
    results.style.display = 'block';

    if (isEncrypted) {
      // UNLOCK mode
      results.innerHTML = `
        <div class="lock-card">
          <div class="lock-icon">🔐</div>
          <h2>PDF này đang được bảo vệ bằng mật khẩu</h2>
          <p>${this.escapeHtml(fileName)} · ${formatFileSize(fileSize)}</p>
          
          <div class="form-group" style="margin-top:24px;">
            <label>Nhập mật khẩu để mở khóa</label>
            <div class="password-input-wrap">
              <input type="password" id="password-input" class="form-input" placeholder="Nhập mật khẩu..." autocomplete="off">
              <button class="btn-eye" id="btn-eye" title="Hiện/ẩn mật khẩu">👁️</button>
            </div>
          </div>

          <button class="btn btn-primary" id="btn-unlock" style="margin-top:16px;width:100%;">
            🔓 Mở khóa PDF
          </button>
          <p class="error-msg" id="error-msg" style="display:none;"></p>
        </div>
      `;

      this.bindUnlockButton();

    } else {
      // LOCK mode
      results.innerHTML = `
        <div class="lock-card">
          <div class="lock-icon">🔓</div>
          <h2>PDF chưa có mật khẩu bảo vệ</h2>
          <p>${this.escapeHtml(fileName)} · ${formatFileSize(fileSize)} · ${pageCount} trang</p>

          <div class="form-group" style="margin-top:24px;">
            <label>Đặt mật khẩu mới</label>
            <div class="password-input-wrap">
              <input type="password" id="password-input" class="form-input" placeholder="Nhập mật khẩu..." autocomplete="off">
              <button class="btn-eye" id="btn-eye" title="Hiện/ẩn mật khẩu">👁️</button>
            </div>
          </div>

          <div class="form-group">
            <label>Xác nhận mật khẩu</label>
            <input type="password" id="password-confirm" class="form-input" placeholder="Nhập lại mật khẩu..." autocomplete="off">
          </div>

          <div class="form-group">
            <label>Quyền hạn (tùy chọn)</label>
            <div class="permission-grid">
              <label class="checkbox-label">
                <input type="checkbox" id="perm-print" checked> Cho phép in
              </label>
              <label class="checkbox-label">
                <input type="checkbox" id="perm-copy" checked> Cho phép copy text
              </label>
              <label class="checkbox-label">
                <input type="checkbox" id="perm-edit" checked> Cho phép chỉnh sửa
              </label>
            </div>
          </div>

          <button class="btn btn-primary" id="btn-lock" style="margin-top:16px;width:100%;">
            🔒 Khóa PDF
          </button>
          <p class="error-msg" id="error-msg" style="display:none;"></p>
        </div>
      `;

      this.bindLockButton();
    }

    // Upload zone compact
    const zone = document.getElementById('upload-zone');
    zone.className = 'upload-zone compact';
    zone.innerHTML = `
      <span class="upload-icon">${isEncrypted ? '🔐' : '📄'}</span>
      <div class="upload-text">
        <h3>${this.escapeHtml(fileName)}</h3>
        <span class="sub">${isEncrypted ? 'Đã khóa' : 'Không mật khẩu'} · ${formatFileSize(fileSize)} · ${pageCount || '?'} trang</span>
      </div>
      <button class="change-btn" id="change-file-btn">Đổi file</button>
    `;
    document.getElementById('change-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('file-input').click();
    });

    // Toggle password visibility
    document.getElementById('btn-eye')?.addEventListener('click', () => {
      const input = document.getElementById('password-input');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  bindLockButton() {
    document.getElementById('btn-lock')?.addEventListener('click', async () => {
      const password = document.getElementById('password-input').value;
      const confirm = document.getElementById('password-confirm').value;
      const errorEl = document.getElementById('error-msg');

      if (!password || password.length < 3) {
        this.showError(errorEl, 'Mật khẩu phải có ít nhất 3 ký tự');
        return;
      }

      if (password !== confirm) {
        this.showError(errorEl, 'Mật khẩu xác nhận không khớp');
        return;
      }

      const btn = document.getElementById('btn-lock');
      btn.disabled = true;
      btn.textContent = '⏳ Đang khóa...';

      try {
        const pdfDoc = this.state.pdfDoc;

        // Encrypt the document
        pdfDoc.encrypt({
          userPassword: password,
          ownerPassword: password + '_owner',
          permissions: {
            printing: document.getElementById('perm-print')?.checked ? 'highResolution' : 'none',
            copying: document.getElementById('perm-copy')?.checked ?? true,
            modifying: document.getElementById('perm-edit')?.checked ?? true,
          }
        });

        const pdfBytes = await pdfDoc.save();
        const outName = this.state.fileName.replace(/\.pdf$/i, '_khoa.pdf');
        PDFEngine.download(pdfBytes, outName);

        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được khóa bằng mật khẩu!', 'success');
      } catch (err) {
        console.error('Lock error:', err);
        this.showError(errorEl, 'Có lỗi khi khóa PDF: ' + err.message);
        btn.textContent = '🔒 Khóa PDF';
        btn.disabled = false;
      }
    });
  }

  bindUnlockButton() {
    document.getElementById('btn-unlock')?.addEventListener('click', async () => {
      const password = document.getElementById('password-input').value;
      const errorEl = document.getElementById('error-msg');

      if (!password) {
        this.showError(errorEl, 'Vui lòng nhập mật khẩu');
        return;
      }

      const btn = document.getElementById('btn-unlock');
      btn.disabled = true;
      btn.textContent = '⏳ Đang mở khóa...';

      try {
        // Load with password
        const pdfDoc = await PDFLib.PDFDocument.load(this.state.bytes, {
          password: password
        });

        // Remove encryption by saving without password
        // pdf-lib keeps encryption... need to create a new doc
        const newDoc = await PDFLib.PDFDocument.create();
        const pageIndices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
        const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
        for (const page of copiedPages) {
          newDoc.addPage(page);
        }

        const pdfBytes = await newDoc.save();
        const outName = this.state.fileName.replace(/\.pdf$/i, '_mokhoa.pdf');
        PDFEngine.download(pdfBytes, outName);

        btn.textContent = '✅ Đã tải xong';
        showToast('PDF đã được mở khóa!', 'success');
      } catch (err) {
        console.error('Unlock error:', err);
        if (err.message && err.message.includes('password')) {
          this.showError(errorEl, 'Sai mật khẩu. Vui lòng thử lại.');
        } else {
          this.showError(errorEl, 'Có lỗi khi mở khóa PDF: ' + err.message);
        }
        btn.textContent = '🔓 Mở khóa PDF';
        btn.disabled = false;
      }
    });
  }

  showError(el, msg) {
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 4000);
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const tool = new PDFLockTool();
export default tool;
