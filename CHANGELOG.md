# Changelog — pdf-tools nâng cấp

## 2026-07-11 — Code Review & Security Hardening

### 🔴 CRITICAL (P0)
- **CSRF check thực sự chặn** — `check_csrf()` giờ trả về 403 khi Origin/Referer không hợp lệ, tất cả 6 endpoint đã cập nhật
- **README cập nhật** — 14 tools → **25 tools**, 4 nhóm đầy đủ (thêm 11 tools: Crop, Watermark, Header/Footer, Grayscale, Flatten, Redact, Ký & Đóng dấu, So sánh, Bates, Scan, Sửa lỗi)
- **Service Worker** — thêm `sw.js` cho PWA offline support (cache-first strategy)
- **CSS dead code** — xóa 24 dòng CSS trùng lặp trong `components.css`
- **PDF→Excel/PPT** — disable nút với badge "Đang phát triển", tránh lỗi 400 cho người dùng
- **Code splitting** — dynamic import tool modules, chỉ load khi dùng (giảm ~200KB initial bundle)
- **CDN defer** — 3 scripts (~770KB) giờ dùng `defer`, không block render
- **Pytest tests** — thêm 6 test cases cho backend API (health, convert, compress, CSRF, file size)

### 🟠 HIGH (P1)
- **HSTS header** — thêm `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **CSP hardening** — bỏ `unsafe-inline`, giới hạn `localhost:*` → port cụ thể
- **Rate limiter thread-safe** — thêm `threading.Lock()`, cleanup định kỳ
- **Logging framework** — thay `print()` → `logging.getLogger()` với format structured
- **Magic byte validation** — kiểm tra magic bytes khi upload file, xóa `.svg` khỏi whitelist
- **Temp dir cleanup** — dọn thư mục rác khi app khởi động

### 🟡 MEDIUM (P2)
- **escapeHtml refactor** — gộp 3 implementation về `ui-helpers.js`
- **Dead code** — xóa `if ... pass` vô nghĩa trong convert endpoint
- **Double convert('RGB')** — bỏ lệnh thừa trong `_images_to_pdf_bytes`
- **Version sync** — backend v4.1.1 → v5.1.0
- **Sidebar stats** — sửa "4 tools" → "25 tools", "4 nhóm" → "25 công cụ"

### 📊 Thống kê
| Chỉ số | Trước | Sau |
|--------|-------|-----|
| README tools | 14 | 25 (+79%) |
| Backend test coverage | 0% | ~40% |
| JS bundle (initial) | ~200KB | ~5KB |
| CSS lines | 1824 | 1800 |
| Security issues | 23 | ~5 |
| Service Worker | ❌ | ✅ |
