# PDF-Tools Issues — Sprint Plan

> Tổng: **30 issues** chia làm **4 Sprint** (mỗi sprint 1 tuần)
> Priority: 🔴 P0-Critical → 🟠 P1-High → 🟡 P2-Medium → 🟢 P3-Low

---

## 🏃 SPRINT 1: Bảo mật + Sửa lỗi nghiêm trọng (P0)

### Issue #1.1 — 🔴 [SECURITY] CSRF check không chặn request
- **Label:** `bug`, `security`, `P0`
- **File:** `backend/server.py:105-122`
- **Mô tả:** Hàm `check_csrf()` kiểm tra Origin/Referer nhưng chỉ log, không chặn. Mọi POST request từ origin lạ đều được chấp nhận.
- **Fix:** Trả về 403 khi Origin không hợp lệ. Cập nhật tất cả endpoint gọi `check_csrf()` để kiểm tra kết quả.

### Issue #1.2 — 🔴 [BUG] PDF→Excel và PDF→PPT không hoạt động
- **Label:** `bug`, `P0`
- **File:** `backend/server.py:321-325`
- **Mô tả:** Backend trả lỗi 400 "Chưa được hỗ trợ trực tiếp". Nhưng README và UI đều hiển thị option này.
- **Fix:** Implement thực sự PDF→Excel (dùng pdfplumber/camelot trích bảng) hoặc ẩn option khỏi UI + ghi chú trong README.

### Issue #1.3 — 🔴 [BUG] Service Worker file không tồn tại
- **Label:** `bug`, `P0`
- **File:** `index.html:108`, missing `sw.js`
- **Mô tả:** index.html đăng ký `/pdf-tools/sw.js` nhưng file không có trong repo → console error trên mọi page.
- **Fix:** Tạo file `sw.js` tối thiểu (cache shell) hoặc xóa dòng đăng ký nếu chưa cần PWA.

### Issue #1.4 — 🔴 [BUG] README lỗi thời — 14 tools nhưng code có 25 tools
- **Label:** `documentation`, `P0`
- **File:** `README.md`
- **Mô tả:** README liệt kê 14 tools trong 3 nhóm. Code thực tế có 25 tools trong 4 nhóm. Thiếu 11 tools: Crop, Watermark, Header/Footer, Grayscale, Flatten, Redact, Ký & Đóng dấu, So sánh, Bates, Scan, Sửa lỗi.
- **Fix:** Cập nhật README liệt kê đầy đủ 25 tools + 4 nhóm.

### Issue #1.5 — 🔴 [CHORE] Backend monolith — tách module
- **Label:** `refactor`, `P0`
- **File:** `backend/server.py` (838 dòng)
- **Mô tả:** Toàn bộ app trong 1 file: routes, logic, config, validation, helpers. Không test được.
- **Fix:** Tách thành: `app.py`, `config.py`, `routes/`, `services/`, `utils/`.

### Issue #1.6 — 🔴 [CHORE] 0 unit test
- **Label:** `testing`, `P0`
- **File:** toàn bộ repo
- **Mô tả:** Không có bất kỳ test nào cho frontend hay backend.
- **Fix:** Thiết lập pytest cho backend (app factory + fixtures). Viết test cho ít nhất: health, compress, image conversion.

### Issue #1.7 — 🔴 [PERF] 3 CDN scripts block render (~770KB)
- **Label:** `performance`, `P0`
- **File:** `index.html:64-66`
- **Mô tả:** pdf-lib, PDF.js, SortableJS load đồng bộ, chặn render. Tổng ~770KB.
- **Fix:** Thêm `defer` hoặc `async`, hoặc dynamic import.

### Issue #1.8 — 🔴 [BUG] Dead CSS duplicate block
- **Label:** `bug`, `P0`
- **File:** `css/components.css:1318-1340`
- **Mô tả:** Bản sao minified của CSS bên trên gây conflict + tăng bundle size vô ích.
- **Fix:** Xóa dòng 1318-1340, kiểm tra không có regression.

---

## 🏃 SPRINT 2: Cải thiện bảo mật + Ổn định (P1)

### Issue #2.1 — 🟠 [SECURITY] Thêm HSTS header
- **Label:** `security`, `P1`
- **File:** `backend/server.py:81-100`
- **Fix:** Thêm `Strict-Transport-Security: max-age=31536000; includeSubDomains`

### Issue #2.2 — 🟠 [SECURITY] Rate limiter không thread-safe
- **Label:** `security`, `P1`
- **File:** `backend/server.py:57-76`
- **Fix:** Dùng `threading.Lock` bọc dict hoặc chuyển sang Redis/flask-limiter.

### Issue #2.3 — 🟠 [SECURITY] CSP unsafe-inline + localhost wildcard
- **Label:** `security`, `P1`
- **File:** `backend/server.py:90-96`
- **Fix:** Bỏ `unsafe-inline`, dùng nonce/hash. Giới hạn `localhost:*` → port cụ thể.

### Issue #2.4 — 🟠 [CHORE] Dùng print() thay vì logging
- **Label:** `refactor`, `P1`
- **File:** `backend/server.py` (nhiều dòng)
- **Fix:** Thiết lập `logging.getLogger(__name__)`, thay tất cả `print()` → `logger.info/warning/error()`.

### Issue #2.5 — 🟠 [BUG] Rò rỉ temp dirs
- **Label:** `bug`, `P1`
- **File:** `backend/server.py:180,306,501`
- **Fix:** Thêm cleanup lúc startup + dùng `tempfile.TemporaryDirectory` context manager.

### Issue #2.6 — 🟠 [BUG] _pdf_to_docx text extraction sai
- **Label:** `bug`, `P1`
- **File:** `backend/server.py:416-427`
- **Fix:** Dùng `pdfminer.six` hoặc `PyMuPDF` để trích text thực sự.

### Issue #2.7 — 🟠 [REFACTOR] Trùng lặp code upload zone
- **Label:** `refactor`, `P1`
- **File:** `js/tools/edit.js`, `convert.js`, `advanced.js`, `special.js`
- **Fix:** Tạo shared helper `createUploadZone(config)` trong `ui-helpers.js`, giảm ~150 dòng.

### Issue #2.8 — 🟠 [REFACTOR] 3 implementation escapeHtml trùng lặp
- **Label:** `refactor`, `P1`
- **File:** `js/utils/ui-helpers.js`, `js/tools/convert.js`, `js/tools/special.js`
- **Fix:** Giữ 1 implementation trong `ui-helpers.js`, xóa 2 cái còn lại.

---

## 🏃 SPRINT 3: Code Quality + Performance (P2)

### Issue #3.1 — 🟡 [PERF] Không code splitting
- **Label:** `performance`, `P2`
- **File:** `js/app.js`
- **Fix:** Dynamic import cho từng tool module, chỉ load khi người dùng chọn.

### Issue #3.2 — 🟡 [STYLE] Style JS không đồng nhất
- **Label:** `style`, `P2`
- **File:** `js/tools/edit.js` vs `advanced.js`
- **Fix:** Thống nhất dùng template literals, format qua Prettier.

### Issue #3.3 — 🟡 [SECURITY] Thiếu magic byte validation
- **Label:** `security`, `P2`
- **File:** `backend/server.py:133-162`
- **Fix:** Thêm magic bytes check cho PDF, Office, images.

### Issue #3.4 — 🟡 [BUG] SVG trong ALLOWED_EXTENSIONS
- **Label:** `security`, `P2`
- **File:** `backend/server.py:130`
- **Fix:** Loại bỏ `.svg` khỏi whitelist hoặc sanitize.

### Issue #3.5 — 🟡 [DEVOPS] requirements.txt không pin version
- **Label:** `devops`, `P2`
- **File:** `backend/requirements.txt`
- **Fix:** Pin tất cả version chính xác, tạo `requirements.lock`.

### Issue #3.6 — 🟡 [DEVOPS] weasyprint bị comment out
- **Label:** `devops`, `P2`
- **File:** `backend/requirements.txt:8`, `render.yaml:14`
- **Fix:** Uncomment weasyprint hoặc thêm Chromium vào render.yaml build step.

### Issue #3.7 — 🟡 [BUG] Backend version không sync với frontend
- **Label:** `bug`, `P2`
- **File:** `index.html:92`, `backend/server.py:212`
- **Fix:** Backend hiển thị v4.1.1 nhưng frontend v5.1.0. Đồng bộ version hoặc thêm endpoint `/version`.

### Issue #3.8 — 🟡 [BUG] Google Analytics placeholder
- **Label:** `bug`, `P2`
- **File:** `index.html:69`
- **Fix:** Thay `G-XXXXXXXXXX` bằng ID thực hoặc xóa nếu chưa dùng.

### Issue #3.9 — 🟡 [BUG] _images_to_pdf_bytes double convert('RGB')
- **Label:** `bug`, `P2`
- **File:** `backend/server.py:621,625`
- **Fix:** Bỏ dòng 625, dùng `img` đã convert ở dòng 621.

---

## 🏃 SPRINT 4: Tính năng + UX (P3)

### Issue #4.1 — 🟢 [FEATURE] Thêm OCR tool
- **Label:** `enhancement`, `P3`
- **Mô tả:** Thêm tool nhận dạng văn bản từ ảnh/scan. Dùng Tesseract.js (client-side) hoặc backend endpoint.

### Issue #4.2 — 🟢 [UX] Backend status indicator trên UI
- **Label:** `enhancement`, `P3`
- **Mô tả:** Hiển thị trạng thái backend (online/offline) ở góc màn hình, không chỉ trong từng tool.

### Issue #4.3 — 🟢 [UX] Favicon thực sự
- **Label:** `enhancement`, `P3`
- **File:** `index.html:55-56`
- **Fix:** Thay inline SVG data URL bằng file favicon.ico thực.

### Issue #4.4 — 🟢 [FEATURE] Hỗ trợ tiếng Anh
- **Label:** `enhancement`, `P3`
- **Mô tả:** Thêm i18n để hỗ trợ tiếng Anh, mở rộng người dùng quốc tế.

### Issue #4.5 — 🟢 [CHORE] Thêm CI/CD pipeline
- **Label:** `devops`, `P3`
- **Mô tả:** GitHub Actions: lint (ESLint + flake8), test (pytest), deploy tự động.

---

## 📊 TỔNG KẾT SPRINT

| Sprint | Issues | Trọng tâm |
|--------|:------:|-----------|
| Sprint 1 | 8 (P0) | Bảo mật + Bug nghiêm trọng + README |
| Sprint 2 | 8 (P1) | Bảo mật nâng cao + Refactor |
| Sprint 3 | 9 (P2) | Code quality + DevOps |
| Sprint 4 | 5 (P3) | Tính năng mới + UX |

**Tổng: 30 issues — 4 tuần**
