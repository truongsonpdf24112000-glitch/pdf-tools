// js/tools/advanced.js — Công cụ nâng cao (10-in-1): Crop, Watermark, Header/Footer, Grayscale, Flatten, Redact, Compress, Page Num, Lock, Extract Images
import { PDFEngine } from "../utils/pdf-engine.js";
import { showToast, showLoading, hideLoading, formatFileSize } from "../utils/ui-helpers.js";
import { getBackendUrl } from "../utils/config.js";

const MODES = [
  { id: "crop",          label: "Cắt lề",        icon: "✂️", desc: "Cắt lề trang PDF — loại bỏ khoảng trắng thừa" },
  { id: "watermark",     label: "Watermark",     icon: "💧", desc: "Thêm watermark text hoặc logo vào PDF" },
  { id: "header-footer", label: "Header/Footer", icon: "📋", desc: "Thêm đầu trang và chân trang" },
  { id: "grayscale",     label: "Grayscale",     icon: "⬛⬜", desc: "Chuyển PDF màu sang trắng đen" },
  { id: "flatten",       label: "Flatten",       icon: "🔨", desc: "Làm phẳng form fields, annotations" },
  { id: "redact",        label: "Redact",        icon: "⬛", desc: "Che nội dung nhạy cảm bằng ô đen" },
  { id: "compress",      label: "Nén",           icon: "📦", desc: "Giảm kích thước file PDF" },
  { id: "page-num",      label: "Số trang",      icon: "🔢", desc: "Thêm số trang vào PDF" },
  { id: "lock",          label: "Khóa/Mở khóa",  icon: "🔒", desc: "Đặt mật khẩu hoặc mở khóa PDF" },
  { id: "extract-img",   label: "Trích xuất ảnh", icon: "🖼️", desc: "Trích xuất tất cả ảnh từ PDF" },
];

class PDFAdvancedTool {
  constructor() {
    // ── Shared state ──
    this.mode = "crop";
    this.pdfDoc = null;
    this.pdfjsDoc = null;
    this.bytes = null;
    this.pages = [];
    this.pageCount = 0;
    this.fileName = "";
    this.fileSize = 0;

    // ── Mode-specific state ──
    // crop
    this.cropValues = { top: 0, right: 0, bottom: 0, left: 0 };
    // watermark
    this.wmType = "text";
    this.wmText = "BẢN NHÁP";
    this.wmOpacity = 0.3;
    this.wmSize = 48;
    this.wmColor = "#ff0000";
    this.wmAngle = 45;
    this.wmImageFile = null;
    // header-footer
    this.header = { text: "", size: 12, color: "#888888", margin: 15 };
    this.footer = { text: "Trang {page}/{total}", size: 10, color: "#888888", margin: 15 };
    // grayscale
    this.grayscaleDpi = 150;
    // flatten
    // (uses shared state)
    // redact
    this.redactions = {};
    this.activePage = 0;
    this.isDrawing = false;
    this.drawStart = null;
    // compress
    this.quality = "medium";
    this.backendAvailable = false;
    this.backendUrl = null;
    this.compressedBytes = null;
    this.compressedSize = null;
    // page-num
    this.numSettings = {
      position: "bottom-center",
      fontSize: 12,
      startNumber: 1,
      skipFirst: false,
      prefix: "",
      suffix: ""
    };
    // lock
    this.isEncrypted = false;
    // extract-img
    // (uses shared state + backendUrl)
  }

  async init() {
    this.backendUrl = await getBackendUrl();
    this.render();
    this.setupEvents();
    if (this.mode === "compress") this.checkBackend();
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  render() {
    const container = document.getElementById("tool-container");
    container.innerHTML = "";
    container.style.position = "relative";

    // Mode toolbar
    const modeBar = document.createElement("div");
    modeBar.className = "mode-toolbar";
    modeBar.id = "mode-toolbar";
    modeBar.innerHTML = MODES.map(m =>
      "<button class=\"mode-btn " + (m.id === this.mode ? "active" : "") + "\" data-mode=\"" + m.id + "\" title=\"" + m.label + ": " + m.desc + "\">" +
        "<span class=\"mode-icon\">" + m.icon + "</span>" +
        "<span class=\"mode-label\">" + m.label + "</span>" +
      "</button>"
    ).join("");
    container.appendChild(modeBar);

    // Upload zone
    const zone = document.createElement("div");
    zone.className = "upload-zone";
    zone.id = "upload-zone";
    zone.innerHTML = this.getUploadZoneHTML();
    container.appendChild(zone);

    // Hidden file input
    const input = document.createElement("input");
    input.type = "file";
    input.id = "file-input";
    input.accept = ".pdf,application/pdf";
    input.hidden = true;
    container.appendChild(input);

    // Results area
    const results = document.createElement("div");
    results.id = "results-area";
    results.style.display = "none";
    container.appendChild(results);

    this.bindModeButtons();

    // If already loaded, re-render results
    if (this.pdfDoc) {
      this.renderModeResults();
    }
  }

  getUploadZoneHTML() {
    if (this.pdfDoc && this.mode !== "compress") {
      return "<span class=\"upload-icon\">📄</span>" +
        "<div class=\"upload-text\">" +
          "<h3>" + this.esc(this.fileName) + "</h3>" +
          "<span class=\"sub\">" + formatFileSize(this.fileSize) + " · " + this.pageCount + " trang</span>" +
        "</div>" +
        "<button class=\"change-btn\" id=\"change-file-btn\">Đổi file</button>";
    }
    const mode = MODES.find(m => m.id === this.mode);
    return "<div class=\"upload-icon\">" + (mode ? mode.icon : "📄") + "</div>" +
      "<h3>Kéo thả file PDF vào đây</h3>" +
      "<p class=\"sub\">" + (mode ? mode.desc : "hoặc click để chọn file") + "</p>" +
      "<p class=\"file-info\">Hỗ trợ file PDF, tối đa 100MB</p>";
  }

  bindModeButtons() {
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const newMode = btn.dataset.mode;
        if (newMode !== this.mode) {
          this.mode = newMode;
          this.render();
          if (this.pdfDoc) this.renderModeResults();
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENTS (Upload / Drag & Drop)
  // ═══════════════════════════════════════════════════════════════

  setupEvents() {
    const zone = document.getElementById("upload-zone");
    const input = document.getElementById("file-input");

    zone.addEventListener("click", () => input.click());

    input.addEventListener("change", (e) => {
      if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
    });

    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]);
    });

    const container = document.getElementById("tool-container");
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!this.pdfDoc) zone.classList.add("drag-over");
    });
    container.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0 && !this.pdfDoc) {
        this.handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // FILE HANDLING
  // ═══════════════════════════════════════════════════════════════

  async handleFile(file) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Vui lòng chọn file PDF", "error");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast("File PDF quá lớn (tối đa 100MB)", "error");
      return;
    }

    const container = document.getElementById("tool-container");
    showLoading(container);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const { pdfDoc, pdfjsDoc, pageCount } = await PDFEngine.load(buffer);
      const scale = pageCount > 50 ? 0.2 : 0.35;
      const pages = await PDFEngine.renderThumbnails(pdfjsDoc, scale);

      this.pdfDoc = pdfDoc;
      this.pdfjsDoc = pdfjsDoc;
      this.bytes = bytes;
      this.pageCount = pageCount;
      this.pages = pages;
      this.fileName = file.name;
      this.fileSize = file.size;

      // Reset mode-specific state
      this.cropValues = { top: 0, right: 0, bottom: 0, left: 0 };
      this.wmImageFile = null;
      this.wmType = "text";
      this.redactions = {};
      this.activePage = 0;
      this.compressedBytes = null;
      this.compressedSize = null;
      this.isEncrypted = false;

      // Detect encryption for lock mode
      try {
        await PDFLib.PDFDocument.load(bytes, { password: "" });
      } catch (e) {
        if (e.message && (e.message.includes("encrypt") || e.message.includes("password") || e.message.includes("Incorrect"))) {
          this.isEncrypted = true;
        }
      }

      hideLoading();
      this.renderModeResults();
    } catch (err) {
      hideLoading();
      console.error("PDF load error:", err);
      showToast("Không thể đọc file PDF. File có thể bị hỏng hoặc có mật khẩu.", "error");
    }
  }

  renderModeResults() {
    const results = document.getElementById("results-area");
    results.style.display = "block";

    // Compact upload zone
    const zone = document.getElementById("upload-zone");
    zone.className = "upload-zone compact";
    zone.innerHTML = this.getUploadZoneHTML();
    const changeBtn = document.getElementById("change-file-btn");
    if (changeBtn) {
      changeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("file-input").click();
      });
    }

    results.innerHTML = "";

    switch (this.mode) {
      case "crop":          this.renderCropMode(results);          break;
      case "watermark":     this.renderWatermarkMode(results);     break;
      case "header-footer": this.renderHeaderFooterMode(results);  break;
      case "grayscale":     this.renderGrayscaleMode(results);     break;
      case "flatten":       this.renderFlattenMode(results);       break;
      case "redact":        this.renderRedactMode(results);        break;
      case "compress":      this.renderCompressMode(results);      break;
      case "page-num":      this.renderPageNumMode(results);       break;
      case "lock":          this.renderLockMode(results);          break;
      case "extract-img":   this.renderExtractImgMode(results);    break;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. CROP MODE
  // ═══════════════════════════════════════════════════════════════

  renderCropMode(results) {
    const { pages, pageCount, cropValues } = this;
    const cols = Math.min(pageCount, 4);

    results.innerHTML =
      "<div class=\"toolbar\" style=\"flex-wrap:wrap;gap:16px;align-items:flex-end;\">" +
        "<div><label style=\"font-size:0.8rem;color:var(--text-muted);\">Cắt trên (mm)</label>" +
          "<input type=\"number\" class=\"form-input\" id=\"crop-top\" value=\"" + cropValues.top + "\" min=\"0\" max=\"500\" style=\"width:80px;\"></div>" +
        "<div><label style=\"font-size:0.8rem;color:var(--text-muted);\">Cắt dưới (mm)</label>" +
          "<input type=\"number\" class=\"form-input\" id=\"crop-bottom\" value=\"" + cropValues.bottom + "\" min=\"0\" max=\"500\" style=\"width:80px;\"></div>" +
        "<div><label style=\"font-size:0.8rem;color:var(--text-muted);\">Cắt trái (mm)</label>" +
          "<input type=\"number\" class=\"form-input\" id=\"crop-left\" value=\"" + cropValues.left + "\" min=\"0\" max=\"500\" style=\"width:80px;\"></div>" +
        "<div><label style=\"font-size:0.8rem;color:var(--text-muted);\">Cắt phải (mm)</label>" +
          "<input type=\"number\" class=\"form-input\" id=\"crop-right\" value=\"" + cropValues.right + "\" min=\"0\" max=\"500\" style=\"width:80px;\"></div>" +
        "<div><button class=\"btn btn-secondary\" id=\"btn-auto-margins\" style=\"height:38px;\">🗑️ Tự động bỏ lề trắng</button></div>" +
        "<div style=\"margin-left:auto;\"><button class=\"btn btn-primary\" id=\"btn-action\" style=\"height:38px;\">✂️ Cắt & Tải PDF</button></div>" +
      "</div>" +
      "<div class=\"thumbnail-grid\" style=\"grid-template-columns: repeat(" + cols + ", 1fr);\">" +
        pages.map((p, i) => "<div class=\"thumbnail-card\"><img src=\"" + p.thumbnail + "\" alt=\"Trang " + (i+1) + "\" loading=\"lazy\"><span class=\"page-number\">" + (i+1) + "</span></div>").join("") +
      "</div>";

    document.getElementById("btn-action").addEventListener("click", () => this.cropExecute());
    document.getElementById("btn-auto-margins").addEventListener("click", () => this.cropAutoMargins());
    ["top","bottom","left","right"].forEach(side => {
      document.getElementById("crop-" + side).addEventListener("input", e => {
        this.cropValues[side] = parseFloat(e.target.value) || 0;
        this.cropUpdatePreview();
      });
    });
  }

  cropUpdatePreview() {
    const { cropValues, pages } = this;
    document.querySelectorAll(".thumbnail-card img").forEach((img, i) => {
      const mmToPx = 2.8346;
      const w = pages[i].width - (cropValues.left + cropValues.right) * mmToPx;
      const h = pages[i].height - (cropValues.top + cropValues.bottom) * mmToPx;
      const l = cropValues.left * mmToPx;
      const t = cropValues.top * mmToPx;
      img.style.clipPath = "inset(" + t + "px " + (pages[i].width - l - w) + "px " + (pages[i].height - t - h) + "px " + l + "px)";
    });
  }

  async cropAutoMargins() {
    showToast("Đang phân tích lề trắng...", "info");
    const { pdfjsDoc } = this;
    const margins = { top: Infinity, left: Infinity, bottom: Infinity, right: Infinity };

    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const page = await pdfjsDoc.getPage(i);
      const vp = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let t = 0, l = 0, b = canvas.height - 1, r = canvas.width - 1;
      const isWhite = idx => data[idx] > 250 && data[idx+1] > 250 && data[idx+2] > 250;

      for (; t < canvas.height; t++) { let white = true;
        for (let x = 0; x < canvas.width; x++) { if (!isWhite((t * canvas.width + x) * 4)) { white = false; break; } }
        if (!white) break; }
      for (; l < canvas.width; l++) { let white = true;
        for (let y = 0; y < canvas.height; y++) { if (!isWhite((y * canvas.width + l) * 4)) { white = false; break; } }
        if (!white) break; }
      for (; b >= 0; b--) { let white = true;
        for (let x = 0; x < canvas.width; x++) { if (!isWhite((b * canvas.width + x) * 4)) { white = false; break; } }
        if (!white) break; }
      for (; r >= 0; r--) { let white = true;
        for (let y = 0; y < canvas.height; y++) { if (!isWhite((y * canvas.width + r) * 4)) { white = false; break; } }
        if (!white) break; }

      const mmScale = 25.4 / (72 * 0.5);
      margins.top = Math.min(margins.top, t * mmScale);
      margins.left = Math.min(margins.left, l * mmScale);
      margins.bottom = Math.min(margins.bottom, (canvas.height - b) * mmScale);
      margins.right = Math.min(margins.right, (canvas.width - r) * mmScale);
    }

    this.cropValues = margins;
    ["top","bottom","left","right"].forEach(s => {
      const el = document.getElementById("crop-" + s);
      if (el) el.value = Math.round(margins[s]);
    });
    this.cropUpdatePreview();
    showToast("Đã phát hiện lề trắng", "success");
  }

  async cropExecute() {
    const btn = document.getElementById("btn-action"); btn.disabled = true; btn.textContent = "⏳ Đang cắt...";
    try {
      const { cropValues, pdfDoc, pages } = this;
      const newDoc = await PDFLib.PDFDocument.create();
      const copied = await newDoc.copyPages(pdfDoc, Array.from({length: pdfDoc.getPageCount()}, (_, i) => i));
      const mmToPt = 72 / 25.4;

      copied.forEach((page, i) => {
        page.setCropBox(cropValues.left * mmToPt, cropValues.bottom * mmToPt,
          pages[i].width / 0.35 * 72/25.4 - cropValues.right * mmToPt - cropValues.left * mmToPt,
          pages[i].height / 0.35 * 72/25.4 - cropValues.top * mmToPt - cropValues.bottom * mmToPt);
        newDoc.addPage(page);
      });

      const out = await newDoc.save();
      PDFEngine.download(out, this.fileName.replace(/\.pdf$/i, "_crop.pdf"));
      showToast("Đã cắt PDF!", "success");
    } catch (err) { showToast("Lỗi: " + err.message, "error"); }
    btn.textContent = "✂️ Cắt & Tải PDF"; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. WATERMARK MODE
  // ═══════════════════════════════════════════════════════════════

  renderWatermarkMode(results) {
    const { pages, pageCount } = this;
    const cols = Math.min(pageCount, 4);

    results.innerHTML =
      "<div class=\"toolbar\" style=\"flex-wrap:wrap;gap:12px;align-items:flex-end;\">" +
        "<div><label style=\"font-size:0.7rem;color:var(--text-muted);\">Loại</label>" +
          "<select id=\"wm-type\" class=\"form-select\" style=\"width:auto;\"><option value=\"text\">Text</option><option value=\"image\">Logo/Ảnh</option></select></div>" +
        "<div id=\"text-opts\"><label style=\"font-size:0.7rem;color:var(--text-muted);\">Nội dung</label>" +
          "<input class=\"form-input\" id=\"wm-text\" value=\"" + this.esc(this.wmText) + "\" style=\"width:140px;\"></div>" +
        "<div><label style=\"font-size:0.7rem;color:var(--text-muted);\">Độ mờ</label>" +
          "<input type=\"range\" id=\"wm-opacity\" min=\"5\" max=\"100\" value=\"" + (this.wmOpacity*100) + "\" style=\"width:80px;\"></div>" +
        "<div><label style=\"font-size:0.7rem;color:var(--text-muted);\">Cỡ chữ</label>" +
          "<input type=\"number\" id=\"wm-size\" class=\"form-input\" value=\"" + this.wmSize + "\" min=\"8\" max=\"200\" style=\"width:60px;\"></div>" +
        "<div><label style=\"font-size:0.7rem;color:var(--text-muted);\">Màu</label>" +
          "<input type=\"color\" id=\"wm-color\" value=\"" + this.wmColor + "\" style=\"width:36px;height:36px;border:none;cursor:pointer;\"></div>" +
        "<div><label style=\"font-size:0.7rem;color:var(--text-muted);\">Xoay (°)</label>" +
          "<input type=\"number\" id=\"wm-angle\" class=\"form-input\" value=\"" + this.wmAngle + "\" min=\"-180\" max=\"180\" style=\"width:55px;\"></div>" +
        "<div id=\"img-opt\" style=\"display:none;\"><label style=\"font-size:0.7rem;color:var(--text-muted);\">Ảnh</label>" +
          "<input type=\"file\" id=\"wm-image\" accept=\"image/*\" style=\"font-size:0.75rem;\"></div>" +
        "<div style=\"margin-left:auto;\"><button class=\"btn btn-primary\" id=\"btn-action\">💧 Thêm Watermark</button></div>" +
      "</div>" +
      "<div class=\"thumbnail-grid\" style=\"grid-template-columns: repeat(" + cols + ", 1fr);\">" +
        pages.map((p, i) => "<div class=\"thumbnail-card\"><img src=\"" + p.thumbnail + "\" alt=\"Trang " + (i+1) + "\"><span class=\"page-number\">" + (i+1) + "</span></div>").join("") +
      "</div>";

    document.getElementById("wm-type").addEventListener("change", e => {
      this.wmType = e.target.value;
      document.getElementById("text-opts").style.display = this.wmType === "text" ? "" : "none";
      document.getElementById("img-opt").style.display = this.wmType === "image" ? "" : "none";
    });
    document.getElementById("wm-text").addEventListener("input", e => this.wmText = e.target.value);
    document.getElementById("wm-opacity").addEventListener("input", e => this.wmOpacity = e.target.value / 100);
    document.getElementById("wm-size").addEventListener("input", e => this.wmSize = parseInt(e.target.value) || 48);
    document.getElementById("wm-color").addEventListener("input", e => this.wmColor = e.target.value);
    document.getElementById("wm-angle").addEventListener("input", e => this.wmAngle = parseInt(e.target.value) || 0);
    document.getElementById("wm-image").addEventListener("change", e => { if (e.target.files[0]) this.wmImageFile = e.target.files[0]; });
    document.getElementById("btn-action").addEventListener("click", () => this.watermarkExecute());
  }

  async watermarkExecute() {
    const btn = document.getElementById("btn-action"); btn.disabled = true; btn.textContent = "⏳ Đang thêm...";
    try {
      const doc = await PDFLib.PDFDocument.load(this.bytes);
      if (this.wmType === "text") {
        const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const color = this.hexRgb(this.wmColor);
        const pages = doc.getPages();
        for (const page of pages) {
          const { width, height } = page.getSize();
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
        if (this.wmImageFile.type === "image/png") img = await doc.embedPng(imgBytes);
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
      PDFEngine.download(out, this.fileName.replace(/\.pdf$/i, "_wm.pdf"));
      showToast("Đã thêm watermark!", "success");
    } catch (e) { showToast("Lỗi: " + e.message, "error"); }
    btn.textContent = "💧 Thêm Watermark"; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. HEADER / FOOTER MODE
  // ═══════════════════════════════════════════════════════════════

  renderHeaderFooterMode(results) {
    results.innerHTML =
      "<div class=\"convert-card\" style=\"max-width:600px;\">" +
        "<h3 style=\"margin-bottom:16px;\">📋 Cấu hình Header & Footer</h3>" +
        "<p style=\"font-size:0.75rem;color:var(--text-muted);margin-bottom:16px;\">Dùng <code>{page}</code> cho số trang, <code>{total}</code> cho tổng số trang</p>" +
        "<div class=\"form-group\"><label>📌 Header (đầu trang)</label>" +
          "<input class=\"form-input\" id=\"h-text\" value=\"" + this.esc(this.header.text) + "\" placeholder=\"Để trống nếu không cần\">" +
          "<div style=\"display:flex;gap:8px;margin-top:6px;\">" +
            "<input type=\"number\" class=\"form-input\" id=\"h-size\" value=\"" + this.header.size + "\" min=\"6\" max=\"48\" style=\"width:70px;\" title=\"Cỡ chữ\">" +
            "<input type=\"color\" id=\"h-color\" value=\"" + this.header.color + "\" style=\"width:36px;height:36px;border:none;cursor:pointer;\" title=\"Màu chữ\">" +
            "<span style=\"font-size:0.7rem;color:var(--text-muted);align-self:center;\">Lề trên: </span>" +
            "<input type=\"number\" class=\"form-input\" id=\"h-margin\" value=\"" + this.header.margin + "\" min=\"0\" max=\"100\" style=\"width:60px;\" title=\"Lề trên (mm)\">" +
            "<span style=\"font-size:0.7rem;color:var(--text-muted);align-self:center;\">mm</span>" +
          "</div></div>" +
        "<div class=\"form-group\"><label>📌 Footer (chân trang)</label>" +
          "<input class=\"form-input\" id=\"f-text\" value=\"" + this.esc(this.footer.text) + "\" placeholder=\"Để trống nếu không cần\">" +
          "<div style=\"display:flex;gap:8px;margin-top:6px;\">" +
            "<input type=\"number\" class=\"form-input\" id=\"f-size\" value=\"" + this.footer.size + "\" min=\"6\" max=\"48\" style=\"width:70px;\" title=\"Cỡ chữ\">" +
            "<input type=\"color\" id=\"f-color\" value=\"" + this.footer.color + "\" style=\"width:36px;height:36px;border:none;cursor:pointer;\" title=\"Màu chữ\">" +
            "<span style=\"font-size:0.7rem;color:var(--text-muted);align-self:center;\">Lề dưới: </span>" +
            "<input type=\"number\" class=\"form-input\" id=\"f-margin\" value=\"" + this.footer.margin + "\" min=\"0\" max=\"100\" style=\"width:60px;\" title=\"Lề dưới (mm)\">" +
            "<span style=\"font-size:0.7rem;color:var(--text-muted);align-self:center;\">mm</span>" +
          "</div></div>" +
        "<div class=\"form-group\"><label>Trang áp dụng</label>" +
          "<select id=\"page-range\" class=\"form-select\">" +
            "<option value=\"all\">Tất cả các trang</option>" +
            "<option value=\"skip-first\">Bỏ qua trang đầu</option>" +
            "<option value=\"skip-first-last\">Bỏ qua trang đầu & cuối</option>" +
          "</select></div>" +
        "<button class=\"btn btn-primary\" id=\"btn-action\" style=\"width:100%;padding:14px;\">📋 Thêm Header/Footer</button>" +
      "</div>";

    document.getElementById("btn-action").addEventListener("click", () => this.headerFooterExecute());
  }

  async headerFooterExecute() {
    const btn = document.getElementById("btn-action"); btn.disabled = true; btn.textContent = "⏳ Đang áp dụng...";
    try {
      const h = {
        text: document.getElementById("h-text").value,
        size: parseInt(document.getElementById("h-size").value) || 12,
        color: document.getElementById("h-color").value,
        margin: parseFloat(document.getElementById("h-margin").value) || 15
      };
      const f = {
        text: document.getElementById("f-text").value,
        size: parseInt(document.getElementById("f-size").value) || 10,
        color: document.getElementById("f-color").value,
        margin: parseFloat(document.getElementById("f-margin").value) || 15
      };
      const range = document.getElementById("page-range").value;

      const doc = await PDFLib.PDFDocument.load(this.bytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const pages = doc.getPages();
      const total = pages.length;
      const mmToPt = 72 / 25.4;

      pages.forEach((page, i) => {
        let skip = false;
        if (range === "skip-first" && i === 0) skip = true;
        if (range === "skip-first-last" && (i === 0 || i === total - 1)) skip = true;
        if (skip) return;

        const { width, height } = page.getSize();
        const pageNum = i + 1;
        const sc = (t) => t.replace(/\{page\}/g, pageNum).replace(/\{total\}/g, total);

        if (h.text) {
          const hc = this.hexRgb(h.color);
          const txt = sc(h.text);
          page.drawText(txt, {
            x: width / 2 - font.widthOfTextAtSize(txt, h.size) / 2,
            y: height - h.margin * mmToPt,
            size: h.size, font, color: PDFLib.rgb(hc.r, hc.g, hc.b)
          });
        }
        if (f.text) {
          const fc = this.hexRgb(f.color);
          const txt = sc(f.text);
          page.drawText(txt, {
            x: width / 2 - font.widthOfTextAtSize(txt, f.size) / 2,
            y: f.margin * mmToPt,
            size: f.size, font, color: PDFLib.rgb(fc.r, fc.g, fc.b)
          });
        }
      });

      const out = await doc.save();
      PDFEngine.download(out, this.fileName.replace(/\.pdf$/i, "_headerfooter.pdf"));
      showToast("Đã thêm Header/Footer!", "success");
    } catch (e) { showToast("Lỗi: " + e.message, "error"); }
    btn.textContent = "📋 Thêm Header/Footer"; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. GRAYSCALE MODE
  // ═══════════════════════════════════════════════════════════════

  renderGrayscaleMode(results) {
    results.innerHTML =
      "<div class=\"convert-card\" style=\"max-width:600px;\">" +
        "<div style=\"text-align:center;margin-bottom:24px;\"><span style=\"font-size:3rem;\">⬛⬜</span></div>" +
        "<h2 style=\"text-align:center;\">Chuyển sang Grayscale</h2>" +
        "<p style=\"text-align:center;color:var(--text-muted);margin-bottom:16px;\">" + this.pageCount + " trang · " + formatFileSize(this.fileSize) + "</p>" +
        "<p style=\"text-align:center;color:var(--text-muted);margin-bottom:24px;font-size:0.85rem;\">⚠️ Tool này render lại từng trang dưới dạng ảnh trắng đen, phù hợp với PDF in ấn. Chất lượng phụ thuộc vào DPI.</p>" +
        "<div class=\"form-group\"><label>Chất lượng (DPI)</label>" +
          "<select id=\"dpi-select\" class=\"form-select\">" +
            "<option value=\"100\">100 DPI — Nhẹ, nhanh</option>" +
            "<option value=\"150\" selected>150 DPI — Cân bằng</option>" +
            "<option value=\"200\">200 DPI — Rõ nét</option>" +
          "</select></div>" +
        "<button class=\"btn btn-primary\" id=\"btn-action\" style=\"width:100%;padding:14px;\">⬛⬜ Chuyển sang Grayscale</button>" +
        "<p style=\"font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:8px;\">File PDF mới sẽ chứa ảnh trắng đen, không còn text có thể chọn</p>" +
      "</div>";

    document.getElementById("btn-action").addEventListener("click", () => this.grayscaleExecute());
  }

  async grayscaleExecute() {
    const btn = document.getElementById("btn-action"); btn.disabled = true; btn.textContent = "⏳ Đang chuyển đổi...";
    const dpi = parseInt(document.getElementById("dpi-select").value) || 150;
    try {
      const { pdfjsDoc, fileName, pageCount } = this;
      const pdfDoc = await PDFLib.PDFDocument.create();
      const scale = dpi / 72;

      for (let i = 1; i <= pageCount; i++) {
        btn.textContent = "⏳ Đang xử lý trang " + i + "/" + pageCount + "...";
        const page = await pdfjsDoc.getPage(i);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let j = 0; j < imgData.data.length; j += 4) {
          const gray = 0.299 * imgData.data[j] + 0.587 * imgData.data[j+1] + 0.114 * imgData.data[j+2];
          imgData.data[j] = imgData.data[j+1] = imgData.data[j+2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);

        const jpgDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const jpgBytes = Uint8Array.from(atob(jpgDataUrl.split(",")[1]), c => c.charCodeAt(0));
        const img = await pdfDoc.embedJpg(jpgBytes);
        const pdfPage = pdfDoc.addPage([vp.width, vp.height]);
        pdfPage.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      }

      const out = await pdfDoc.save();
      PDFEngine.download(out, fileName.replace(/\.pdf$/i, "_grayscale.pdf"));
      showToast("Đã chuyển " + pageCount + " trang sang grayscale!", "success");
    } catch (e) { showToast("Lỗi: " + e.message, "error"); }
    btn.textContent = "⬛⬜ Chuyển sang Grayscale"; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. FLATTEN MODE
  // ═══════════════════════════════════════════════════════════════

  renderFlattenMode(results) {
    results.innerHTML =
      "<div class=\"convert-card\" style=\"max-width:600px;\">" +
        "<div style=\"text-align:center;margin-bottom:24px;\"><span style=\"font-size:3rem;\">🔨</span></div>" +
        "<h2 style=\"text-align:center;\">Làm phẳng PDF</h2>" +
        "<p style=\"text-align:center;color:var(--text-muted);margin-bottom:8px;\">" + this.pageCount + " trang · " + formatFileSize(this.fileSize) + "</p>" +
        "<p style=\"text-align:center;color:var(--text-muted);margin-bottom:24px;font-size:0.85rem;\">" +
          "<strong>Làm phẳng</strong> sẽ gộp tất cả form fields, text boxes, annotations và layers thành nội dung cố định.<br>" +
          "Sau khi flatten, không thể chỉnh sửa form fields được nữa." +
        "</p>" +
        "<div class=\"form-group\"><label>Tùy chọn</label>" +
          "<label style=\"display:flex;align-items:center;gap:8px;font-size:0.85rem;margin-bottom:8px;\">" +
            "<input type=\"checkbox\" id=\"flatten-forms\" checked> Gộp form fields (text input, checkboxes...)" +
          "</label>" +
          "<label style=\"display:flex;align-items:center;gap:8px;font-size:0.85rem;margin-bottom:8px;\">" +
            "<input type=\"checkbox\" id=\"flatten-annotations\" checked> Gộp annotations (ghi chú, highlight...)" +
          "</label>" +
          "<label style=\"display:flex;align-items:center;gap:8px;font-size:0.85rem;\">" +
            "<input type=\"checkbox\" id=\"render-all\"> Render tất cả trang thành ảnh (đảm bảo 100% phẳng, nhưng mất text)" +
          "</label>" +
        "</div>" +
        "<button class=\"btn btn-primary\" id=\"btn-action\" style=\"width:100%;padding:14px;\">🔨 Làm phẳng PDF</button>" +
        "<p id=\"flatten-note\" style=\"font-size:0.7rem;color:var(--text-muted);text-align:center;margin-top:8px;\">Flatten không làm thay đổi nội dung hiển thị</p>" +
      "</div>";

    document.getElementById("render-all").addEventListener("change", e => {
      document.getElementById("flatten-note").textContent = e.target.checked
        ? "⚠️ Chế độ render: mỗi trang sẽ được chuyển thành ảnh (không còn text có thể chọn)"
        : "Flatten không làm thay đổi nội dung hiển thị";
    });
    document.getElementById("btn-action").addEventListener("click", () => this.flattenExecute());
  }

  async flattenExecute() {
    const btn = document.getElementById("btn-action"); btn.disabled = true; btn.textContent = "⏳ Đang làm phẳng...";
    const renderAll = document.getElementById("render-all").checked;
    try {
      const { bytes, pdfjsDoc, pageCount, fileName } = this;
      if (renderAll) {
        btn.textContent = "⏳ Đang render từng trang...";
        const newDoc = await PDFLib.PDFDocument.create();
        const scale = 1.5;
        for (let i = 1; i <= pageCount; i++) {
          btn.textContent = "⏳ Render trang " + i + "/" + pageCount + "...";
          const page = await pdfjsDoc.getPage(i);
          const vp = page.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
          const dataUrl = c.toDataURL("image/jpeg", 0.9);
          const jpgBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), x => x.charCodeAt(0));
          const img = await newDoc.embedJpg(jpgBytes);
          const p = newDoc.addPage([vp.width, vp.height]);
          p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
        }
        const out = await newDoc.save();
        PDFEngine.download(out, fileName.replace(/\.pdf$/i, "_flattened.pdf"));
      } else {
        const doc = await PDFLib.PDFDocument.load(bytes);
        const newDoc = await PDFLib.PDFDocument.create();
        const indices = Array.from({ length: pageCount }, (_, i) => i);
        const copied = await newDoc.copyPages(doc, indices);
        copied.forEach(p => newDoc.addPage(p));
        const out = await newDoc.save({ useObjectStreams: true });
        PDFEngine.download(out, fileName.replace(/\.pdf$/i, "_flattened.pdf"));
      }
      showToast("Đã làm phẳng " + pageCount + " trang!", "success");
    } catch (e) { console.error(e); showToast("Lỗi: " + e.message, "error"); }
    btn.textContent = "🔨 Làm phẳng PDF"; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. REDACT MODE
  // ═══════════════════════════════════════════════════════════════

  renderRedactMode(results) {
    const { pageCount } = this;

    results.innerHTML =
      "<div class=\"toolbar\">" +
        "<span style=\"font-weight:600;\">⬛ Che nội dung nhạy cảm</span>" +
        "<span style=\"font-size:0.8rem;color:var(--text-muted);\">🖱️ Kéo chuột trên trang để vẽ ô che</span>" +
        "<button class=\"btn btn-secondary btn-sm\" id=\"btn-redact-undo\">↩️ Hoàn tác</button>" +
        "<button class=\"btn btn-secondary btn-sm\" id=\"btn-redact-clear\">🗑️ Xóa tất cả</button>" +
        "<button class=\"btn btn-primary\" id=\"btn-action\">⬛ Áp dụng & Tải PDF</button>" +
      "</div>" +
      "<div class=\"redact-nav\" style=\"display:flex;align-items:center;gap:12px;justify-content:center;margin-bottom:16px;\">" +
        "<button id=\"btn-prev\" class=\"btn btn-secondary btn-sm\"" + (pageCount <= 1 ? " disabled" : "") + ">◀ Trang trước</button>" +
        "<span id=\"page-info\">Trang 1 / " + pageCount + "</span>" +
        "<button id=\"btn-next\" class=\"btn btn-secondary btn-sm\"" + (pageCount <= 1 ? " disabled" : "") + ">Trang sau ▶</button>" +
        "<span style=\"font-size:0.75rem;color:var(--text-muted);\" id=\"redact-count\">0 ô đã vẽ</span>" +
      "</div>" +
      "<div id=\"redact-canvas-container\" style=\"position:relative;display:inline-block;cursor:crosshair;border:1px solid var(--border);border-radius:8px;overflow:hidden;max-width:100%;\">" +
        "<canvas id=\"redact-canvas\"></canvas>" +
        "<div id=\"redact-overlay\" style=\"position:absolute;top:0;left:0;pointer-events:none;\"></div>" +
      "</div>" +
      "<p style=\"font-size:0.75rem;color:var(--text-danger);margin-top:8px;\">⚠️ Redact là vĩnh viễn — file tải về sẽ bị che vĩnh viễn, không thể phục hồi</p>";

    this.activePage = 0;
    this.redactLoadPage(0);
    this.redactBindEvents();
  }

  async redactLoadPage(pageIdx) {
    this.activePage = pageIdx;
    const page = await this.pdfjsDoc.getPage(pageIdx + 1);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.getElementById("redact-canvas");
    if (!canvas) return;
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    this.redactDrawOverlay();
    const info = document.getElementById("page-info");
    if (info) info.textContent = "Trang " + (pageIdx + 1) + " / " + this.pageCount;
    this.redactUpdateCount();
  }

  redactDrawOverlay() {
    const overlay = document.getElementById("redact-overlay");
    if (!overlay) return;
    overlay.innerHTML = "";
    const rects = this.redactions[this.activePage] || [];
    rects.forEach(rect => {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;left:" + rect.x + "px;top:" + rect.y + "px;width:" + rect.width + "px;height:" + rect.height + "px;background:rgba(0,0,0,0.7);border:2px solid var(--danger);";
      overlay.appendChild(div);
    });
  }

  redactBindEvents() {
    const canvas = document.getElementById("redact-canvas");
    if (!canvas) return;
    let startX, startY, drawRect;

    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;

    canvas.addEventListener("mousedown", e => {
      this.isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      drawRect = document.createElement("div");
      drawRect.style.cssText = "position:absolute;left:" + startX + "px;top:" + startY + "px;width:0;height:0;background:rgba(0,0,0,0.5);border:2px dashed #fff;pointer-events:none;";
      const overlay = document.getElementById("redact-overlay");
      if (overlay) overlay.appendChild(drawRect);
    });

    canvas.addEventListener("mousemove", e => {
      if (!this.isDrawing || !drawRect) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      drawRect.style.left = Math.min(startX, x) + "px";
      drawRect.style.top = Math.min(startY, y) + "px";
      drawRect.style.width = Math.abs(x - startX) + "px";
      drawRect.style.height = Math.abs(y - startY) + "px";
    });

    canvas.addEventListener("mouseup", e => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const rx = Math.min(startX, x), ry = Math.min(startY, y);
      const rw = Math.abs(x - startX), rh = Math.abs(y - startY);
      if (rw > 5 && rh > 5) {
        if (!this.redactions[this.activePage]) this.redactions[this.activePage] = [];
        this.redactions[this.activePage].push({ x: rx, y: ry, width: rw, height: rh });
        this.redactDrawOverlay();
        this.redactUpdateCount();
      } else if (drawRect) {
        drawRect.remove();
      }
      drawRect = null;
    });

    document.getElementById("btn-prev")?.addEventListener("click", () => {
      if (this.activePage > 0) this.redactLoadPage(this.activePage - 1);
    });
    document.getElementById("btn-next")?.addEventListener("click", () => {
      if (this.activePage < this.pageCount - 1) this.redactLoadPage(this.activePage + 1);
    });
    document.getElementById("btn-redact-undo")?.addEventListener("click", () => {
      if (this.redactions[this.activePage]?.length) {
        this.redactions[this.activePage].pop();
        this.redactDrawOverlay();
        this.redactUpdateCount();
      }
    });
    document.getElementById("btn-redact-clear")?.addEventListener("click", () => {
      if (this.redactions[this.activePage]?.length) {
        this.redactions[this.activePage] = [];
        this.redactDrawOverlay();
        this.redactUpdateCount();
      }
    });
    document.getElementById("btn-action")?.addEventListener("click", () => this.redactExecute());
  }

  redactUpdateCount() {
    const total = Object.values(this.redactions).reduce((s, arr) => s + arr.length, 0);
    const el = document.getElementById("redact-count");
    if (el) el.textContent = total + " ô đã vẽ";
  }

  async redactExecute() {
    const btn = document.getElementById("btn-action");
    const totalRects = Object.values(this.redactions).reduce((s, a) => s + a.length, 0);
    if (totalRects === 0) { showToast("Chưa vẽ ô che nào", "error"); return; }
    btn.disabled = true; btn.textContent = "⏳ Đang áp dụng...";
    try {
      const { pageCount } = this;
      const newDoc = await PDFLib.PDFDocument.create();
      const scale = 1.5;
      for (let i = 0; i < pageCount; i++) {
        btn.textContent = "⏳ Xử lý trang " + (i+1) + "/" + pageCount + "...";
        const page = await this.pdfjsDoc.getPage(i + 1);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const rects = this.redactions[i] || [];
        ctx.fillStyle = "#000000";
        rects.forEach(r => { ctx.fillRect(r.x, r.y, r.width, r.height); });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        const jpgBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), c => c.charCodeAt(0));
        const img = await newDoc.embedJpg(jpgBytes);
        const p = newDoc.addPage([vp.width, vp.height]);
        p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      }
      const out = await newDoc.save();
      PDFEngine.download(out, this.fileName.replace(/\.pdf$/i, "_redacted.pdf"));
      showToast("Đã che " + totalRects + " vùng! File đã được redact vĩnh viễn.", "success");
    } catch (e) { console.error(e); showToast("Lỗi: " + e.message, "error"); }
    btn.textContent = "⬛ Áp dụng & Tải PDF"; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. COMPRESS MODE
  // ═══════════════════════════════════════════════════════════════

  async checkBackend() {
    try {
      const resp = await fetch(this.backendUrl + "/health", { mode: "cors", signal: AbortSignal.timeout(2000) });
      if (resp.ok) this.backendAvailable = true;
    } catch { this.backendAvailable = false; }
  }

  renderCompressMode(results) {
    const { fileName, fileSize, pageCount } = this;

    results.innerHTML =
      "<div class=\"compress-card\">" +
        "<div class=\"compress-icon\">📦</div>" +
        "<h2>" + this.esc(fileName) + "</h2>" +
        "<p>" + pageCount + " trang · Kích thước gốc: <strong>" + formatFileSize(fileSize) + "</strong></p>" +
        "<div class=\"form-group\" style=\"margin-top:24px;\">" +
          "<label>Chất lượng nén</label>" +
          "<div class=\"quality-options\">" +
            "<button class=\"quality-btn " + (this.quality === "medium" ? "active" : "") + "\" data-quality=\"medium\">" +
              "<span class=\"q-icon\">⚡</span><span class=\"q-label\">Trung bình</span>" +
              "<span class=\"q-desc\">Cân bằng giữa chất lượng & kích thước</span></button>" +
            "<button class=\"quality-btn " + (this.quality === "high" ? "active" : "") + "\" data-quality=\"high\">" +
              "<span class=\"q-icon\">✨</span><span class=\"q-label\">Cao</span>" +
              "<span class=\"q-desc\">Giữ chất lượng tốt nhất</span></button>" +
            "<button class=\"quality-btn " + (this.quality === "low" ? "active" : "") + "\" data-quality=\"low\">" +
              "<span class=\"q-icon\">🗜️</span><span class=\"q-label\">Thấp</span>" +
              "<span class=\"q-desc\">Kích thước nhỏ nhất</span></button>" +
          "</div></div>" +
        "<div id=\"compress-result\" style=\"display:" + (this.compressedSize ? "block" : "none") + ";margin-top:20px;\">" +
          "<div class=\"size-comparison\">" +
            "<div class=\"size-bar\"><div class=\"size-before\" style=\"width:100%;\"><span>" + formatFileSize(fileSize) + "</span></div></div>" +
            "<div class=\"size-arrow\">⬇️</div>" +
            "<div class=\"size-bar\"><div class=\"size-after\" id=\"size-after-bar\" style=\"width:" + (this.compressedSize ? Math.max(10, (this.compressedSize/fileSize)*100) + "%" : "100%") + ";\">" +
              "<span id=\"size-after-text\">" + (this.compressedSize ? formatFileSize(this.compressedSize) : "---") + "</span></div></div>" +
          "</div>" +
          "<p class=\"size-reduction\" id=\"size-reduction\">" + (this.compressedSize ? "Giảm " + ((1 - this.compressedSize/fileSize)*100).toFixed(1) + "%" : "") + "</p>" +
        "</div>" +
        "<button class=\"btn btn-primary\" id=\"btn-action\" style=\"margin-top:24px;width:100%;padding:14px;\">" +
          (this.compressedBytes ? "⬇️ Tải PDF đã nén" : "📦 Nén PDF") +
        "</button>" +
        (!this.backendAvailable ?
          "<p style=\"font-size:0.75rem;color:var(--text-muted);margin-top:8px;text-align:center;\">⚡ Đang dùng chế độ nén cơ bản. Để nén tốt hơn, chạy backend: <code>python3 backend/compress_server.py</code></p>" :
          "<p style=\"font-size:0.75rem;color:var(--success);margin-top:8px;text-align:center;\">✅ Backend pikepdf đã sẵn sàng — nén chất lượng cao</p>") +
      "</div>";

    // Quality buttons
    document.querySelectorAll(".quality-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".quality-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.quality = btn.dataset.quality;
      });
    });

    // Action button
    const actionBtn = document.getElementById("btn-action");
    if (this.compressedBytes) {
      actionBtn.addEventListener("click", () => {
        PDFEngine.download(this.compressedBytes, this.fileName.replace(/\.pdf$/i, "_nen.pdf"));
        showToast("PDF đã nén đang được tải về!", "success");
      });
    } else {
      actionBtn.addEventListener("click", () => this.compressExecute());
    }
  }

  async compressExecute() {
    const btn = document.getElementById("btn-action");
    btn.disabled = true;
    btn.textContent = "⏳ Đang nén...";

    try {
      let compressedBytes;
      if (this.backendAvailable) {
        compressedBytes = await this.compressBackend();
      } else {
        compressedBytes = await this.compressBasic();
      }
      const compressedSize = compressedBytes.length;
      this.compressedBytes = compressedBytes;
      this.compressedSize = compressedSize;

      // Show result
      const resultEl = document.getElementById("compress-result");
      if (resultEl) resultEl.style.display = "block";

      const afterBar = document.getElementById("size-after-bar");
      const afterText = document.getElementById("size-after-text");
      const reductionEl = document.getElementById("size-reduction");
      const ratio = ((1 - compressedSize / this.fileSize) * 100).toFixed(1);
      const barPercent = Math.max(10, (compressedSize / this.fileSize) * 100);
      if (afterBar) afterBar.style.width = barPercent + "%";
      if (afterText) afterText.textContent = formatFileSize(compressedSize);
      if (reductionEl) {
        reductionEl.textContent = "Giảm " + ratio + "% (tiết kiệm " + formatFileSize(this.fileSize - compressedSize) + ")";
        reductionEl.style.color = ratio > 10 ? "var(--success)" : "var(--warning)";
      }

      // Enable download
      btn.textContent = "⬇️ Tải PDF đã nén";
      btn.disabled = false;
      btn.onclick = () => {
        PDFEngine.download(compressedBytes, this.fileName.replace(/\.pdf$/i, "_nen.pdf"));
        showToast("PDF đã nén đang được tải về!", "success");
      };
    } catch (err) {
      console.error("Compress error:", err);
      showToast("Có lỗi khi nén PDF: " + err.message, "error");
      btn.textContent = "📦 Nén PDF";
      btn.disabled = false;
    }
  }

  async compressBackend() {
    const formData = new FormData();
    formData.append("file", new Blob([this.bytes], { type: "application/pdf" }), this.fileName);
    formData.append("quality", this.quality);
    const resp = await fetch(this.backendUrl + "/compress", { method: "POST", body: formData });
    if (!resp.ok) { const errText = await resp.text(); throw new Error(errText || "Backend nén thất bại"); }
    return new Uint8Array(await resp.arrayBuffer());
  }

  async compressBasic() {
    const newDoc = await PDFLib.PDFDocument.create();
    const pageCount = this.pdfDoc.getPageCount();
    const indices = Array.from({ length: pageCount }, (_, i) => i);
    const copiedPages = await newDoc.copyPages(this.pdfDoc, indices);
    for (const page of copiedPages) { newDoc.addPage(page); }
    return await newDoc.save({ useObjectStreams: true, addDefaultPage: false });
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. PAGE NUM MODE
  // ═══════════════════════════════════════════════════════════════

  renderPageNumMode(results) {
    const { pageCount, pages } = this;
    const s = this.numSettings;

    results.innerHTML =
      "<div class=\"pagenum-layout\" style=\"display:flex;gap:24px;flex-wrap:wrap;\">" +
        "<div class=\"pagenum-settings\" style=\"flex:1;min-width:300px;\">" +
          "<h3>⚙️ Tùy chọn số trang</h3>" +
          "<div class=\"form-group\"><label>Vị trí</label>" +
            "<div class=\"position-grid\" style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:6px;\">" +
              ["top-left","top-center","top-right","bottom-left","bottom-center","bottom-right"].map(pos =>
                "<button class=\"pos-btn" + (s.position === pos ? " active" : "") + "\" data-pos=\"" + pos + "\">" + pos.replace("-", " ") + "</button>"
              ).join("") +
            "</div></div>" +
          "<div class=\"form-row\"><div class=\"form-group\"><label>Cỡ chữ</label>" +
            "<input type=\"range\" min=\"6\" max=\"24\" value=\"" + s.fontSize + "\" id=\"font-size\" class=\"range-slider\">" +
            "<span class=\"range-value\">" + s.fontSize + "px</span></div></div>" +
          "<div class=\"form-row\"><div class=\"form-group\"><label>Bắt đầu từ số</label>" +
            "<input type=\"number\" min=\"1\" max=\"9999\" value=\"" + s.startNumber + "\" id=\"start-number\" class=\"form-input\"></div></div>" +
          "<div class=\"form-row\"><div class=\"form-group\"><label>Tiền tố (vd: \"Trang \")</label>" +
            "<input type=\"text\" value=\"" + this.escAttr(s.prefix) + "\" id=\"prefix\" class=\"form-input\" placeholder=\"vd: Trang \"></div></div>" +
          "<div class=\"form-row\"><div class=\"form-group\"><label>Hậu tố (vd: \" / " + pageCount + "\")</label>" +
            "<input type=\"text\" value=\"" + this.escAttr(s.suffix) + "\" id=\"suffix\" class=\"form-input\" placeholder=\"vd: / " + pageCount + "\"></div></div>" +
          "<div class=\"form-row\"><label class=\"checkbox-label\">" +
            "<input type=\"checkbox\" id=\"skip-first\"" + (s.skipFirst ? " checked" : "") + "> Bỏ qua trang đầu tiên (trang bìa)</label></div>" +
          "<div class=\"preview-box\"><span class=\"preview-label\">Xem trước:</span>" +
            "<span class=\"preview-text\" id=\"preview-text\">" + s.prefix + s.startNumber + s.suffix + "</span></div>" +
        "</div>" +
        "<div class=\"pagenum-preview\" style=\"flex:0 0 320px;\">" +
          "<h3>📄 Xem trước trang đầu</h3>" +
          "<div class=\"preview-thumbnail\" id=\"preview-thumb\" style=\"position:relative;\">" +
            "<img src=\"" + pages[0].thumbnail + "\" alt=\"Trang 1\" style=\"max-width:100%;border-radius:8px;\">" +
            "<div class=\"page-num-overlay " + s.position + "\" style=\"font-size:" + s.fontSize + "px;position:absolute;padding:2px 8px;background:rgba(255,255,255,0.85);border-radius:4px;\" id=\"page-num-overlay\">" +
              (s.skipFirst ? "" : s.prefix + s.startNumber + s.suffix) +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      "<div style=\"text-align:center;margin-top:24px;\"><button class=\"btn btn-primary btn-lg\" id=\"btn-action\" style=\"padding:12px 40px;font-size:1rem;\">🔢 Thêm số trang</button></div>";

    this.pageNumBindEvents();
  }

  pageNumBindEvents() {
    document.querySelectorAll(".pos-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".pos-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.numSettings.position = btn.dataset.pos;
        this.pageNumUpdatePreview();
      });
    });

    const fontSizeEl = document.getElementById("font-size");
    fontSizeEl?.addEventListener("input", () => {
      this.numSettings.fontSize = parseInt(fontSizeEl.value);
      fontSizeEl.nextElementSibling.textContent = fontSizeEl.value + "px";
      this.pageNumUpdatePreview();
    });

    document.getElementById("start-number")?.addEventListener("input", (e) => {
      this.numSettings.startNumber = parseInt(e.target.value) || 1;
      this.pageNumUpdatePreview();
    });

    document.getElementById("prefix")?.addEventListener("input", (e) => {
      this.numSettings.prefix = e.target.value;
      this.pageNumUpdatePreview();
    });

    document.getElementById("suffix")?.addEventListener("input", (e) => {
      this.numSettings.suffix = e.target.value;
      this.pageNumUpdatePreview();
    });

    document.getElementById("skip-first")?.addEventListener("change", (e) => {
      this.numSettings.skipFirst = e.target.checked;
      this.pageNumUpdatePreview();
    });

    document.getElementById("btn-action")?.addEventListener("click", () => this.pageNumExecute());
  }

  pageNumUpdatePreview() {
    const s = this.numSettings;
    const el = document.getElementById("preview-text");
    if (el) el.textContent = s.prefix + s.startNumber + s.suffix;

    const overlay = document.getElementById("page-num-overlay");
    if (overlay) {
      overlay.style.fontSize = s.fontSize + "px";
      overlay.textContent = s.skipFirst ? "" : s.prefix + s.startNumber + s.suffix;
      overlay.className = "page-num-overlay " + s.position;
    }
  }

  async pageNumExecute() {
    const btn = document.getElementById("btn-action");
    btn.disabled = true; btn.textContent = "⏳ Đang thêm số trang...";
    try {
      const s = this.numSettings;
      const pages = this.pdfDoc.getPages();
      const pageCount = pages.length;
      const helveticaFont = await this.pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

      for (let i = 0; i < pageCount; i++) {
        if (s.skipFirst && i === 0) continue;
        const page = pages[i];
        const { width, height } = page.getSize();
        const pageNum = s.startNumber + i - (s.skipFirst ? 1 : 0);
        const text = s.prefix + pageNum + s.suffix;
        const textWidth = helveticaFont.widthOfTextAtSize(text, s.fontSize);
        const margin = 40;
        let x, y;
        const [vPos, hPos] = s.position.split("-");
        if (hPos === "left") x = margin;
        else if (hPos === "right") x = width - textWidth - margin;
        else x = (width - textWidth) / 2;
        if (vPos === "top") y = height - margin;
        else y = margin + s.fontSize;

        const bgPad = 4;
        page.drawRectangle({
          x: x - bgPad, y: y - s.fontSize - bgPad,
          width: textWidth + bgPad * 2, height: s.fontSize + bgPad * 2,
          color: PDFLib.rgb(1, 1, 1), opacity: 0.85,
        });
        page.drawText(text, { x, y, size: s.fontSize, font: helveticaFont, color: PDFLib.rgb(0.2, 0.2, 0.2) });
      }

      const pdfBytes = await this.pdfDoc.save();
      PDFEngine.download(pdfBytes, this.fileName.replace(/\.pdf$/i, "_sotrang.pdf"));
      btn.textContent = "✅ Đã tải xong";
      showToast("Đã thêm số trang!", "success");
    } catch (err) {
      console.error("Page num error:", err);
      showToast("Có lỗi khi thêm số trang", "error");
    } finally {
      setTimeout(() => { btn.disabled = false; btn.textContent = "🔢 Thêm số trang"; }, 2000);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. LOCK MODE
  // ═══════════════════════════════════════════════════════════════

  renderLockMode(results) {
    const { fileName, fileSize, pageCount, isEncrypted } = this;

    if (isEncrypted) {
      results.innerHTML =
        "<div class=\"lock-card\">" +
          "<div class=\"lock-icon\">🔐</div>" +
          "<h2>PDF này đang được bảo vệ bằng mật khẩu</h2>" +
          "<p>" + this.esc(fileName) + " · " + formatFileSize(fileSize) + "</p>" +
          "<div class=\"form-group\" style=\"margin-top:24px;\">" +
            "<label>Nhập mật khẩu để mở khóa</label>" +
            "<div class=\"password-input-wrap\">" +
              "<input type=\"password\" id=\"password-input\" class=\"form-input\" placeholder=\"Nhập mật khẩu...\" autocomplete=\"off\">" +
              "<button class=\"btn-eye\" id=\"btn-eye\" title=\"Hiện/ẩn mật khẩu\">👁️</button>" +
            "</div></div>" +
          "<button class=\"btn btn-primary\" id=\"btn-action\" style=\"margin-top:16px;width:100%;\">🔓 Mở khóa PDF</button>" +
          "<p class=\"error-msg\" id=\"error-msg\" style=\"display:none;\"></p>" +
        "</div>";
      this.bindLockEye();
      document.getElementById("btn-action").addEventListener("click", () => this.lockUnlockExecute());
    } else {
      results.innerHTML =
        "<div class=\"lock-card\">" +
          "<div class=\"lock-icon\">🔓</div>" +
          "<h2>PDF chưa có mật khẩu bảo vệ</h2>" +
          "<p>" + this.esc(fileName) + " · " + formatFileSize(fileSize) + " · " + pageCount + " trang</p>" +
          "<div class=\"form-group\" style=\"margin-top:24px;\">" +
            "<label>Đặt mật khẩu mới</label>" +
            "<div class=\"password-input-wrap\">" +
              "<input type=\"password\" id=\"password-input\" class=\"form-input\" placeholder=\"Nhập mật khẩu...\" autocomplete=\"off\">" +
              "<button class=\"btn-eye\" id=\"btn-eye\" title=\"Hiện/ẩn mật khẩu\">👁️</button>" +
            "</div></div>" +
          "<div class=\"form-group\"><label>Xác nhận mật khẩu</label>" +
            "<input type=\"password\" id=\"password-confirm\" class=\"form-input\" placeholder=\"Nhập lại mật khẩu...\" autocomplete=\"off\"></div>" +
          "<div class=\"form-group\"><label>Quyền hạn (tùy chọn)</label>" +
            "<div class=\"permission-grid\">" +
              "<label class=\"checkbox-label\"><input type=\"checkbox\" id=\"perm-print\" checked> Cho phép in</label>" +
              "<label class=\"checkbox-label\"><input type=\"checkbox\" id=\"perm-copy\" checked> Cho phép copy text</label>" +
              "<label class=\"checkbox-label\"><input type=\"checkbox\" id=\"perm-edit\" checked> Cho phép chỉnh sửa</label>" +
            "</div></div>" +
          "<button class=\"btn btn-primary\" id=\"btn-action\" style=\"margin-top:16px;width:100%;\">🔒 Khóa PDF</button>" +
          "<p class=\"error-msg\" id=\"error-msg\" style=\"display:none;\"></p>" +
        "</div>";
      this.bindLockEye();
      document.getElementById("btn-action").addEventListener("click", () => this.lockLockExecute());
    }
  }

  bindLockEye() {
    document.getElementById("btn-eye")?.addEventListener("click", () => {
      const input = document.getElementById("password-input");
      input.type = input.type === "password" ? "text" : "password";
    });
  }

  async lockLockExecute() {
    const password = document.getElementById("password-input").value;
    const confirm = document.getElementById("password-confirm").value;
    const errorEl = document.getElementById("error-msg");

    if (!password || password.length < 3) { this.lockShowError(errorEl, "Mật khẩu phải có ít nhất 3 ký tự"); return; }
    if (password !== confirm) { this.lockShowError(errorEl, "Mật khẩu xác nhận không khớp"); return; }

    const btn = document.getElementById("btn-action");
    btn.disabled = true; btn.textContent = "⏳ Đang khóa...";
    try {
      const pdfDoc = this.pdfDoc;
      pdfDoc.encrypt({
        userPassword: password,
        ownerPassword: password + "_owner",
        permissions: {
          printing: document.getElementById("perm-print")?.checked ? "highResolution" : "none",
          copying: document.getElementById("perm-copy")?.checked ?? true,
          modifying: document.getElementById("perm-edit")?.checked ?? true,
        }
      });
      const pdfBytes = await pdfDoc.save();
      PDFEngine.download(pdfBytes, this.fileName.replace(/\.pdf$/i, "_khoa.pdf"));
      btn.textContent = "✅ Đã tải xong";
      showToast("PDF đã được khóa bằng mật khẩu!", "success");
    } catch (err) {
      console.error("Lock error:", err);
      this.lockShowError(errorEl, "Có lỗi khi khóa PDF: " + err.message);
      btn.textContent = "🔒 Khóa PDF"; btn.disabled = false;
    }
  }

  async lockUnlockExecute() {
    const password = document.getElementById("password-input").value;
    const errorEl = document.getElementById("error-msg");
    if (!password) { this.lockShowError(errorEl, "Vui lòng nhập mật khẩu"); return; }

    const btn = document.getElementById("btn-action");
    btn.disabled = true; btn.textContent = "⏳ Đang mở khóa...";
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(this.bytes, { password: password });
      const newDoc = await PDFLib.PDFDocument.create();
      const pageIndices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
      const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
      for (const page of copiedPages) { newDoc.addPage(page); }
      const pdfBytes = await newDoc.save();
      PDFEngine.download(pdfBytes, this.fileName.replace(/\.pdf$/i, "_mokhoa.pdf"));
      btn.textContent = "✅ Đã tải xong";
      showToast("PDF đã được mở khóa!", "success");
    } catch (err) {
      console.error("Unlock error:", err);
      if (err.message && err.message.includes("password")) {
        this.lockShowError(errorEl, "Sai mật khẩu. Vui lòng thử lại.");
      } else {
        this.lockShowError(errorEl, "Có lỗi khi mở khóa PDF: " + err.message);
      }
      btn.textContent = "🔓 Mở khóa PDF"; btn.disabled = false;
    }
  }

  lockShowError(el, msg) {
    if (el) { el.textContent = msg; el.style.display = "block"; setTimeout(() => { el.style.display = "none"; }, 4000); }
  }

  // ═══════════════════════════════════════════════════════════════
  // 10. EXTRACT IMAGES MODE
  // ═══════════════════════════════════════════════════════════════

  renderExtractImgMode(results) {
    const { fileName, fileSize, pageCount } = this;

    results.innerHTML =
      "<div class=\"convert-card\">" +
        "<div style=\"text-align:center;margin-bottom:24px;\"><span style=\"font-size:3rem;\">📄➡️🖼️</span></div>" +
        "<h2 style=\"text-align:center;margin-bottom:8px;\">Trích xuất ảnh từ PDF</h2>" +
        "<p style=\"text-align:center;color:var(--text-muted);margin-bottom:4px;\">" + this.esc(fileName) + " · " + pageCount + " trang</p>" +
        "<p style=\"text-align:center;color:var(--text-muted);margin-bottom:24px;\">Tất cả ảnh trong PDF sẽ được trích xuất và tải về dạng ZIP</p>" +
        "<button class=\"btn btn-primary\" id=\"btn-action\" style=\"width:100%;padding:14px;font-size:1rem;\">🔍 Trích xuất ảnh</button>" +
        "<p id=\"extract-status\" style=\"font-size:0.75rem;text-align:center;margin-top:8px;color:var(--text-muted);\"></p>" +
      "</div>";

    this.extractImgCheckBackend();
    document.getElementById("btn-action").addEventListener("click", () => this.extractImgExecute());
  }

  async extractImgCheckBackend() {
    try {
      const resp = await fetch(this.backendUrl + "/health", { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const el = document.getElementById("extract-status");
        if (el) { el.textContent = "✅ Backend đã sẵn sàng"; el.style.color = "var(--success)"; }
      }
    } catch {
      const el = document.getElementById("extract-status");
      if (el) { el.innerHTML = "⚠️ Backend chưa chạy. Chạy: <code>backend/.venv/bin/python3 backend/server.py</code>"; el.style.color = "var(--warning)"; }
    }
  }

  async extractImgExecute() {
    const btn = document.getElementById("btn-action");
    btn.disabled = true; btn.textContent = "⏳ Đang trích xuất ảnh...";
    try {
      const formData = new FormData();
      formData.append("file", new Blob([this.bytes], { type: "application/pdf" }), this.fileName);
      const resp = await fetch(this.backendUrl + "/extract-images", { method: "POST", body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Extract failed");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.fileName.replace(/\.pdf$/i, "_images.zip");
      a.click();
      URL.revokeObjectURL(url);
      showToast("Đã trích xuất ảnh thành công!", "success");
    } catch (err) {
      console.error("Extract error:", err);
      if (err.message.includes("No images found")) {
        showToast("Không tìm thấy ảnh nào trong PDF này", "error");
      } else {
        showToast("Lỗi: " + err.message, "error");
      }
    }
    btn.textContent = "🔍 Trích xuất ảnh"; btn.disabled = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════════════════════════════

  hexRgb(h) {
    const x = h.replace("#", "");
    return { r: parseInt(x.substring(0,2),16)/255, g: parseInt(x.substring(2,4),16)/255, b: parseInt(x.substring(4,6),16)/255 };
  }

  esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  escAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

const tool = new PDFAdvancedTool();
export default tool;
