# PDF Tools — Desktop App (Windows / macOS / Linux)

Bản desktop chạy **offline hoàn toàn** của 25 công cụ xử lý PDF, giao diện y hệt web.

## Chạy thử từ mã nguồn (dev)

```bash
cd desktop
npm install
npm start          # mở app Electron
npm run smoke      # test khói: UI + mở PDF + libs (cần display Linux hoặc xvfb)
OFFLINE=1 npm run smoke   # ép mất mạng qua proxy chặn — vẫn PASS = offline chuẩn
```

## Build bản cài đặt Windows (trên máy Windows)

```bash
cd desktop
npm install
npm run build:win
```
Output trong `desktop/dist/`:
- `PDF Tools Setup <version>.exe` — installer NSIS (khuyên dùng, có shortcut + icon)
- `PDF-Tools-<version>-Portable.exe` — 1 file exe chạy thẳng, không cần cài

## Build tự động bằng GitHub Actions

Push `desktop/**` lên main hoặc chạy workflow **Build Desktop App (Windows)**
(tab Actions) → tải artifact `pdf-tools-desktop-windows`.

## Kiến trúc offline

| Thành phần | Web | Desktop |
|---|---|---|
| pdf-lib, pdfjs, Sortable | CDN unpkg | `desktop/vendor/` (intercept về local) |
| Google Fonts (có vietnamese) | fonts.googleapis.com | `desktop/fonts/` (self-host) |
| Service worker / PWA | có | **chặn** — không cần cache network |
| Lưu file kết quả | trình duyệt tải | hộp thoại **Save As** gốc Windows |
| Backend Python (convert) | tùy chọn | không bắt buộc — 100% client-side |

Main process (`main.cjs`) phục vụ nguyên bộ web app qua custom scheme `app://web/`
(secure origin → fetch/Worker/showSaveFilePicker hoạt động) và chuyển hướng mọi
yêu cầu CDN sang file local, kể cả trong production build (extraResources).
