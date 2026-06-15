# PDF Tools

Bộ công cụ PDF miễn phí, xử lý trực tiếp trên trình duyệt. Không cần cài đặt, không cần upload lên server.

🔗 **Dùng ngay:** [https://truongsonpdf24112000-glitch.github.io/pdf-tools](https://truongsonpdf24112000-glitch.github.io/pdf-tools)

## 8 Công Cụ

| Tool | Mô tả |
|------|-------|
| 📑 Sắp xếp trang | Kéo thả để sắp xếp lại thứ tự trang PDF |
| 🔀 Trộn PDF | Trộn nhiều file PDF thành 1 file duy nhất |
| ✂️ Tách trang | Chọn và tách trang cụ thể từ PDF |
| 🔄 Xoay trang | Xoay trang 90°/180°/270°, hỗ trợ xoay hàng loạt |
| 🗑️ Xóa trang | Xóa trang không mong muốn khỏi PDF |
| 🔢 Thêm số trang | Thêm số trang với nhiều tùy chọn vị trí và định dạng |
| 🔒 Khóa/Mở khóa | Đặt mật khẩu bảo vệ hoặc mở khóa PDF |
| 📦 Nén PDF | Giảm kích thước file PDF |

## Tính Năng

- ✅ Xử lý 100% trên trình duyệt — file không rời khỏi máy bạn
- ✅ Không cần cài đặt, không cần đăng ký
- ✅ Dark mode / Light mode
- ✅ Responsive — dùng được trên mobile
- ✅ Mã nguồn mở (MIT)

## Backend Nén PDF (Tùy chọn)

Để nén PDF chất lượng cao, chạy backend pikepdf:

```bash
cd backend
pip install -r requirements.txt
python3 compress_server.py
```

Frontend sẽ tự động phát hiện backend và sử dụng nó để nén.

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
- [pikepdf](https://github.com/pikepdf/pikepdf) — nén PDF (backend)

## License

MIT
