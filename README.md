# Chỉnh Sửa PDF

Bộ công cụ chỉnh sửa PDF miễn phí, xử lý trực tiếp trên trình duyệt. Không cần cài đặt, không cần upload lên server.

🔗 **Dùng ngay:** [https://truongsonpdf24112000-glitch.github.io/pdf-tools/](https://truongsonpdf24112000-glitch.github.io/pdf-tools/)

## 14 Công Cụ

### 📑 Chỉnh sửa trang
| # | Tool | Mô tả |
|---|------|-------|
| 1 | 📑 Sắp xếp trang | Kéo thả để sắp xếp lại thứ tự trang PDF |
| 2 | 🔀 Trộn PDF | Trộn nhiều file PDF thành 1 file duy nhất |
| 3 | ✂️ Tách trang | Chọn và tách trang cụ thể từ PDF |
| 4 | 🔄 Xoay trang | Xoay trang 90°/180°/270°, hỗ trợ xoay hàng loạt |
| 5 | 🗑️ Xóa trang | Xóa trang không mong muốn khỏi PDF |

### 🔄 Chuyển đổi định dạng
| # | Tool | Mô tả | Cần Backend |
|---|------|-------|-------------|
| 6 | 📄→📝 PDF → Word/Excel/PPT | Chuyển PDF sang Word, Excel hoặc PowerPoint | Có |
| 7 | 📝→📄 Word/Excel/PPT → PDF | Chuyển tài liệu Office sang PDF | Có |
| 8 | 📄→🖼️ PDF → JPG | Chuyển từng trang PDF thành ảnh JPG/PNG | Không |
| 9 | 🖼️→📄 JPG → PDF | Chuyển ảnh thành file PDF | Không |
| 10 | 🌐→📄 HTML → PDF | Chuyển trang web hoặc code HTML sang PDF | Có |

### ⚙️ Công cụ nâng cao
| # | Tool | Mô tả |
|---|------|-------|
| 11 | 📦 Nén PDF | Giảm kích thước file PDF |
| 12 | 🔢 Thêm số trang | Thêm số trang với nhiều tùy chọn vị trí và định dạng |
| 13 | 🔒 Khóa/Mở khóa | Đặt mật khẩu bảo vệ hoặc mở khóa PDF |
| 14 | 🖼️ Trích xuất ảnh | Trích xuất tất cả ảnh từ file PDF |

## Tính Năng

- ✅ Xử lý 100% trên trình duyệt — file không rời khỏi máy bạn (cho tool client-side)
- ✅ Không cần cài đặt, không cần đăng ký
- ✅ Dark mode / Light mode
- ✅ Responsive — dùng được trên mobile
- ✅ Mã nguồn mở (MIT)
- ✅ 14 tool, chia 3 nhóm rõ ràng

## Backend (Tùy chọn)

Một số tool cần backend để chạy (chuyển đổi định dạng Office, nén chất lượng cao, trích xuất ảnh).

### 1. Cài LibreOffice (cho chuyển đổi Office)

```bash
sudo apt install libreoffice
```

### 2. Cài dependencies Python

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 3. Chạy backend

```bash
backend/.venv/bin/python3 backend/server.py
```

Backend chạy ở cổng 5001. Frontend tự động phát hiện và sử dụng backend khi có sẵn.
Nếu backend không chạy, các tool client-side vẫn hoạt động bình thường.

### Các endpoint
| Endpoint | Mô tả |
|----------|-------|
| GET /health | Kiểm tra trạng thái |
| POST /convert?type=pdf-to-word | Chuyển đổi định dạng |
| POST /pdf-to-images?format=jpg | PDF → Ảnh |
| POST /images-to-pdf | Ảnh → PDF |
| POST /extract-images | Trích xuất ảnh từ PDF |
| POST /compress | Nén PDF |

## Phát Triển

```bash
# Chạy local dev server
python3 -m http.server 8080
# Mở http://localhost:8080
```

## Công Nghệ

- [pdf-lib](https://github.com/Hopding/pdf-lib) — đọc/ghi PDF
- [PDF.js](https://mozilla.github.io/pdf.js/) — render PDF
- [SortableJS](https://sortablejs.github.io/Sortable/) — kéo thả
- [Flask](https://flask.palletsprojects.com/) — backend API
- [pikepdf](https://github.com/pikepdf/pikepdf) — nén & xử lý PDF
- [LibreOffice](https://www.libreoffice.org/) — chuyển đổi Office

## License

MIT
