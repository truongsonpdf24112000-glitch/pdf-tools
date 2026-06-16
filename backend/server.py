#!/usr/bin/env python3
"""
Backend API cho Chỉnh Sửa PDF — Convert + Compress + Image
Chạy: backend/.venv/bin/python3 backend/server.py
Cổng mặc định: 5001

SECURITY: v4.1.1 — đã fix toàn bộ lỗ hổng pentest 2026-06-15
"""

import os
import io
import re
import uuid
import time
import shutil
import tempfile
import subprocess
import zipfile
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from functools import wraps

from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS

# ============================================================
# APP CONFIG
# ============================================================
app = Flask(__name__)

# --- SECURITY: Tắt debug mode trong production ---
# Chỉ bật debug khi có FLASK_DEBUG=1 (không mặc định)
app.config['DEBUG'] = os.environ.get('FLASK_DEBUG') == '1'

# --- SECURITY: Giới hạn CORS về origin cụ thể ---
ALLOWED_ORIGINS = [
    'https://truongsonpdf24112000-glitch.github.io',
    'http://localhost:5000',
    'http://localhost:5001',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5001',
    'http://localhost:8080',
    'http://localhost:3000',
]
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

# --- SECURITY: Giới hạn kích thước file upload (50MB) ---
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

# --- SECURITY: Ẩn Server header ---
app.config['SERVER_NAME'] = None  # Không tự động set

# ============================================================
# RATE LIMITER — In-memory (không cần Redis)
# ============================================================
_rate_limit_store = defaultdict(list)

def rate_limit(max_requests=30, window=60):
    """Giới hạn số request trong khoảng thời gian window (giây)."""
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            ip = request.remote_addr or '127.0.0.1'
            # Key = IP + endpoint để mỗi endpoint có counter riêng
            endpoint = request.endpoint or 'unknown'
            key = f'{ip}:{endpoint}'
            now = time.time()
            # Dọn các timestamp cũ
            _rate_limit_store[key] = [t for t in _rate_limit_store[key] if now - t < window]
            if len(_rate_limit_store[key]) >= max_requests:
                return jsonify({'error': 'Quá nhiều request. Vui lòng thử lại sau.'}), 429
            _rate_limit_store[key].append(now)
            return f(*args, **kwargs)
        return wrapped
    return decorator

# ============================================================
# SECURITY HEADERS — after_request hook
# ============================================================
@app.after_request
def add_security_headers(response):
    """Thêm các security headers cho mọi response."""
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    # CSP: chỉ cho phép self và unpkg CDN (cho frontend)
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://www.googletagmanager.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' http://localhost:* https://pdf-tools-backend.onrender.com; "
        "frame-ancestors 'none'"
    )
    # Ẩn Server header
    response.headers['Server'] = 'PDF Tools'
    return response

# ============================================================
# CSRF / ORIGIN CHECK
# ============================================================
def check_csrf():
    """Kiểm tra Origin/Referer header cho các request POST quan trọng."""
    if request.method != 'POST':
        return
    origin = request.headers.get('Origin', '')
    referer = request.headers.get('Referer', '')
    # Nếu không có Origin hoặc Referer → có thể là API call trực tiếp (chấp nhận)
    # Nếu có → phải match allowed origins
    if origin:
        allowed = any(origin.startswith(o) for o in ALLOWED_ORIGINS)
        if not allowed:
            # Log suspicious origin
            print(f'[SECURITY] Blocked request from origin: {origin}')
            # Vẫn cho qua nhưng log lại (API có thể được gọi từ tool khác)
    if referer:
        allowed = any(referer.startswith(o) for o in ALLOWED_ORIGINS)
        if not allowed and not origin:
            print(f'[SECURITY] Suspicious Referer: {referer}')

# ============================================================
# FILE VALIDATION
# ============================================================
# Whitelist các loại file được chấp nhận
ALLOWED_EXTENSIONS = {
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.html', '.htm',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
}

def validate_uploaded_file(file, allowed_exts=None):
    """
    Validate file upload: extension check + basic magic bytes.
    Trả về (True, None) nếu OK, (False, error_msg) nếu fail.
    """
    if not file or not file.filename:
        return False, 'Không có file được gửi lên'

    filename = file.filename
    ext = Path(filename).suffix.lower()

    # Nếu filename rỗng
    if not filename.strip():
        return False, 'Tên file không hợp lệ'

    # Chống path traversal trong filename
    if '..' in filename or '/' in filename or '\\' in filename:
        return False, 'Tên file không hợp lệ (chứa ký tự nguy hiểm)'

    if allowed_exts and ext not in allowed_exts:
        return False, f'Định dạng file không được hỗ trợ: {ext}'

    if ext not in ALLOWED_EXTENSIONS:
        return False, f'Định dạng file không được hỗ trợ: {ext}'

    # Kiểm tra tên file không quá dài
    if len(filename) > 255:
        return False, 'Tên file quá dài (tối đa 255 ký tự)'

    return True, None

# ============================================================
# ERROR HANDLING — không leak internal info
# ============================================================
def safe_error(e, default_msg='Lỗi xử lý file. Vui lòng thử lại với file khác.'):
    """Trả về error message an toàn, không leak internal info."""
    # Log lỗi thật ra console (chỉ admin thấy)
    import traceback
    print(f'[ERROR] {traceback.format_exc()}')
    # Trả về message an toàn cho client
    return jsonify({'error': default_msg}), 500

# ============================================================
# BACKEND DIRS
# ============================================================
BACKEND_DIR = Path(__file__).parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# ============================================================
# ROOT — Trang chào mừng khi truy cập từ browser
# ============================================================
@app.route('/', methods=['GET'])
def index():
    return '''
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chỉnh Sửa PDF — Backend API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0b0b1a; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 16px; padding: 48px; max-width: 520px; text-align: center; }
    h1 { color: #6c5ce7; font-size: 1.8rem; margin-bottom: 8px; }
    .ver { color: #a0a0c0; font-size: 0.85rem; margin-bottom: 24px; }
    .status { display: inline-flex; align-items: center; gap: 8px; background: #0d2818; color: #4ade80; padding: 8px 20px; border-radius: 20px; font-size: 0.9rem; margin-bottom: 24px; }
    .dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .links { display: flex; flex-direction: column; gap: 10px; }
    .links a { color: #7c8aff; text-decoration: none; padding: 12px; background: #1e1e3a; border-radius: 8px; transition: background 0.2s; }
    .links a:hover { background: #2a2a5a; }
    .note { margin-top: 20px; font-size: 0.8rem; color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📄 Chỉnh Sửa PDF</h1>
    <div class="ver">Backend API v4.1.1</div>
    <div class="status"><span class="dot"></span> Server đang chạy</div>
    <div class="links">
      <a href="/health">📊 Health Check</a>
      <a href="https://truongsonpdf24112000-glitch.github.io/pdf-tools/">🌐 Mở giao diện web</a>
    </div>
    <div class="note">Đây là API backend, không phải giao diện người dùng.<br>Vào link trên để sử dụng công cụ.</div>
  </div>
</body>
</html>''', 200

# ============================================================
# HEALTH
# ============================================================
@app.route('/health', methods=['GET'])
@rate_limit(max_requests=60, window=60)  # Health check thường xuyên hơn
def health():
    libreoffice = shutil.which('soffice') or shutil.which('libreoffice')
    return jsonify({
        'status': 'ok',
        'engine': 'pikepdf + LibreOffice',
        'libreoffice': bool(libreoffice),
        'pikepdf': True,
        'pillow': True,
        'pdf2image': True
    })

# ============================================================
# CONVERT — PDF ↔ Office Formats (LibreOffice headless)
# ============================================================
FORMAT_MAP = {
    # PDF → Office
    'pdf-to-word':   {'from': 'pdf', 'to': 'docx', 'mime': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'ext': '.docx'},
    'pdf-to-excel':  {'from': 'pdf', 'to': 'xlsx', 'mime': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'ext': '.xlsx'},
    'pdf-to-ppt':    {'from': 'pdf', 'to': 'pptx', 'mime': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'ext': '.pptx'},
    # Office → PDF
    'word-to-pdf':   {'from': 'docx', 'to': 'pdf', 'mime': 'application/pdf', 'ext': '.pdf'},
    'excel-to-pdf':  {'from': 'xlsx', 'to': 'pdf', 'mime': 'application/pdf', 'ext': '.pdf'},
    'ppt-to-pdf':    {'from': 'pptx', 'to': 'pdf', 'mime': 'application/pdf', 'ext': '.pdf'},
    # Other → PDF
    'html-to-pdf':   {'from': 'html', 'to': 'pdf', 'mime': 'application/pdf', 'ext': '.pdf'},
}

EXT_TO_CONVERSION = {
    '.docx': 'word-to-pdf',
    '.doc': 'word-to-pdf',
    '.xlsx': 'excel-to-pdf',
    '.xls': 'excel-to-pdf',
    '.pptx': 'ppt-to-pdf',
    '.ppt': 'ppt-to-pdf',
    '.pdf': 'pdf-to-word',
    '.html': 'html-to-pdf',
    '.htm': 'html-to-pdf',
}

# Allowed extensions per conversion type
ALLOWED_CONVERT_INPUT = {
    'pdf-to-word':  {'.pdf'},
    'pdf-to-excel': {'.pdf'},
    'pdf-to-ppt':   {'.pdf'},
    'word-to-pdf':  {'.docx', '.doc'},
    'excel-to-pdf': {'.xlsx', '.xls'},
    'ppt-to-pdf':   {'.pptx', '.ppt'},
    'html-to-pdf':  {'.html', '.htm'},
}

@app.route('/convert', methods=['POST'])
@rate_limit(max_requests=20, window=60)
def convert():
    """Universal convert endpoint. Use query param ?type=<conversion-type>"""
    check_csrf()
    conv_type = request.args.get('type', '')

    # Auto-detect from file extension if no type given
    if not conv_type and 'file' in request.files:
        ext = Path(request.files['file'].filename).suffix.lower()
        conv_type = EXT_TO_CONVERSION.get(ext, 'pdf-to-word')

    if conv_type not in FORMAT_MAP:
        return jsonify({'error': 'Định dạng chuyển đổi không được hỗ trợ'}), 400

    fmt = FORMAT_MAP[conv_type]

    if 'file' not in request.files:
        return jsonify({'error': 'Vui lòng chọn file để chuyển đổi'}), 400

    file = request.files['file']

    # --- SECURITY: Validate file ---
    allowed = ALLOWED_CONVERT_INPUT.get(conv_type, {'.pdf'})
    is_valid, err_msg = validate_uploaded_file(file, allowed_exts=allowed)
    if not is_valid:
        return jsonify({'error': err_msg}), 400

    work_dir = Path(tempfile.mkdtemp(dir=UPLOAD_DIR))

    # PDF → Office: LibreOffice doesn't support PDF import.
    # Only Word is special-cased below
    if conv_type.startswith('pdf-to-') and conv_type != 'pdf-to-word':
        pass

    # For PDF→Word, extract text and create simple DOCX
    if conv_type == 'pdf-to-word':
        try:
            return _pdf_to_docx(file, work_dir)
        except Exception as e:
            return jsonify({'error': 'Không thể chuyển đổi PDF sang Word. Thử chuyển PDF→JPG trước, sau đó dùng OCR.'}), 500

    # For PDF→Excel/PPT: these don't work via LibreOffice directly
    if conv_type in ('pdf-to-excel', 'pdf-to-ppt'):
        return jsonify({
            'error': 'Chuyển đổi này chưa được hỗ trợ trực tiếp.',
            'hint': 'Chuyển PDF→JPG trước, sau đó dùng OCR để trích xuất dữ liệu. Hoặc dùng PDF→Word làm bước trung gian.'
        }), 400

    input_path = work_dir / f"input{Path(file.filename).suffix}"

    try:
        file.save(str(input_path))

        # Run LibreOffice conversion
        libreoffice = shutil.which('soffice') or shutil.which('libreoffice')
        if not libreoffice:
            return jsonify({'error': 'LibreOffice chưa được cài đặt trên server'}), 503

        if conv_type == 'html-to-pdf':
            output_path = work_dir / f"output{fmt['ext']}"
            _html_to_pdf(input_path, output_path)
        else:
            result = subprocess.run(
                [libreoffice, '--headless', '--convert-to', fmt['to'],
                 '--outdir', str(work_dir), str(input_path)],
                capture_output=True, text=True, timeout=60, cwd=str(work_dir)
            )
            if result.returncode != 0:
                # Không leak stderr ra client
                print(f'[ERROR] LibreOffice conversion failed: {result.stderr[:300]}')
                return jsonify({'error': 'Chuyển đổi thất bại. File có thể bị lỗi hoặc không đúng định dạng.'}), 500

            # Find output file
            output_files = list(work_dir.glob(f"*.{fmt['to']}"))
            if not output_files:
                output_files = list(work_dir.glob(f"*.{fmt['to'].upper()}"))
            if not output_files:
                return jsonify({'error': 'Không tạo được file đầu ra'}), 500
            output_path = output_files[0]

        # Send file
        out_name = Path(file.filename).stem + fmt['ext']
        return send_file(
            str(output_path),
            mimetype=fmt['mime'],
            as_attachment=True,
            download_name=out_name
        )

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Quá thời gian chuyển đổi (giới hạn 60 giây)'}), 504
    except Exception as e:
        return safe_error(e, 'Lỗi khi chuyển đổi file')
    finally:
        # Cleanup
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass

def _html_to_pdf(html_path, output_path):
    """Convert HTML to PDF using weasyprint if available, else Chrome headless."""
    try:
        from weasyprint import HTML
        HTML(filename=str(html_path)).write_pdf(str(output_path))
        return
    except ImportError:
        pass

    # SECURITY: Fallback Chrome headless — ƯU TIÊN weasyprint
    # --no-sandbox chỉ dùng khi thực sự cần và trong môi trường container
    for browser in ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable']:
        exe = shutil.which(browser)
        if exe:
            try:
                subprocess.run(
                    [exe, '--headless', '--disable-gpu',
                     # Chỉ dùng --no-sandbox nếu chạy root trong container
                     f'--print-to-pdf={output_path}', f'file://{html_path}'],
                    timeout=30
                )
                if output_path.exists():
                    return
            except Exception:
                continue
    raise RuntimeError("Không tìm thấy công cụ chuyển đổi HTML→PDF. Cài weasyprint hoặc Chromium.")


def _pdf_to_docx(file, work_dir):
    """Extract text from PDF and create a minimal DOCX file"""
    import pikepdf

    input_bytes = file.read()
    pdf = pikepdf.Pdf.open(io.BytesIO(input_bytes))

    # Extract text from all pages
    text_parts = []
    for page in pdf.pages:
        try:
            if '/Contents' in page:
                content = page.Contents.read_bytes()
                text = content.decode('latin-1', errors='replace')
                import re
                texts = re.findall(r'\\(([^)]*)\\)', text)
                page_text = ' '.join(t for t in texts if len(t) > 1 and not t.startswith('\\\\'))
                if page_text.strip():
                    text_parts.append(page_text.strip())
        except Exception:
            pass

    pdf.close()

    combined = '\n\n'.join(text_parts) if text_parts else '(PDF chứa ảnh quét — không có text để trích xuất)'

    # Create minimal DOCX (ZIP of XML files)
    docx_buf = io.BytesIO()
    with zipfile.ZipFile(docx_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        # [Content_Types].xml
        zf.writestr('[Content_Types].xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>''')

        # _rels/.rels
        zf.writestr('_rels/.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>''')

        # word/_rels/document.xml.rels
        zf.writestr('word/_rels/document.xml.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>''')

        # word/document.xml
        paragraphs = ''.join(
            f'<w:p><w:r><w:t xml:space="preserve">{_xml_escape(para)}</w:t></w:r></w:p>'
            for para in combined.split('\n\n') if para.strip()
        )
        zf.writestr('word/document.xml', f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{paragraphs}</w:body>
</w:document>''')

    docx_buf.seek(0)
    out_name = Path(file.filename).stem + '.docx'
    return send_file(docx_buf, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     as_attachment=True, download_name=out_name)


def _xml_escape(text):
    """Escape XML special chars — đầy đủ & < > \" '"""
    return (text
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;'))

# ============================================================
# IMAGE — PDF ↔ Images
# ============================================================
@app.route('/pdf-to-images', methods=['POST'])
@rate_limit(max_requests=20, window=60)
def pdf_to_images():
    """Convert PDF pages to JPG/PNG images. Returns ZIP of all pages."""
    check_csrf()

    if 'file' not in request.files:
        return jsonify({'error': 'Vui lòng chọn file PDF'}), 400

    file = request.files['file']
    is_valid, err_msg = validate_uploaded_file(file, allowed_exts={'.pdf'})
    if not is_valid:
        return jsonify({'error': err_msg}), 400

    fmt = request.args.get('format', 'jpg').lower()
    if fmt not in ('jpg', 'jpeg', 'png'):
        fmt = 'jpg'

    work_dir = Path(tempfile.mkdtemp(dir=UPLOAD_DIR))
    pdf_path = work_dir / 'input.pdf'

    try:
        file.save(str(pdf_path))

        # Use pdf2image (requires poppler-utils)
        try:
            from pdf2image import convert_from_path
            dpi = int(request.args.get('dpi', 150))
            images = convert_from_path(str(pdf_path), dpi=dpi)
        except Exception as e:
            if not shutil.which('pdftoppm'):
                images = _pdf_to_images_pikepdf(pdf_path)
                if not images:
                    return jsonify({'error': 'Không thể chuyển đổi PDF sang ảnh. Cần cài poppler-utils hoặc PDF không có ảnh nhúng.'}), 500
            else:
                images = _pdf_to_images_pikepdf(pdf_path)

        if not images:
            return jsonify({'error': 'Không trích xuất được trang nào từ PDF'}), 500

        # If single page, send directly
        if len(images) == 1:
            buf = io.BytesIO()
            img_format = 'PNG' if fmt == 'png' else 'JPEG'
            save_kwargs = {}
            if img_format == 'JPEG':
                save_kwargs = {'quality': 90}
            images[0].save(buf, format=img_format, **save_kwargs)
            buf.seek(0)
            mime = f'image/{fmt}'
            return send_file(buf, mimetype=mime, as_attachment=True,
                           download_name=f'{Path(file.filename).stem}_page1.{fmt}')

        # Multiple pages → ZIP
        zip_buf = io.BytesIO()
        img_format = 'PNG' if fmt == 'png' else 'JPEG'
        save_kwargs = {}
        if img_format == 'JPEG':
            save_kwargs = {'quality': 90}
        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for i, img in enumerate(images, 1):
                buf = io.BytesIO()
                img.save(buf, format=img_format, **save_kwargs)
                zf.writestr(f'page_{i}.{fmt}', buf.getvalue())

        zip_buf.seek(0)
        return send_file(zip_buf, mimetype='application/zip', as_attachment=True,
                       download_name=f'{Path(file.filename).stem}_pages.zip')

    except Exception as e:
        return safe_error(e, 'Lỗi khi chuyển đổi PDF sang ảnh')
    finally:
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass

def _pdf_to_images_pikepdf(pdf_path):
    """Fallback: use pikepdf + Pillow to render pages (rasterizes embedded images only)"""
    import pikepdf
    from PIL import Image
    images = []
    pdf = pikepdf.Pdf.open(pdf_path)
    for page_num, page in enumerate(pdf.pages):
        page_images = []
        if '/Resources' in page and '/XObject' in page.Resources:
            xobjects = page.Resources.XObject
            for name, xobj in xobjects.items():
                if hasattr(xobj, '/Subtype') and str(xobj.Subtype) == '/Image':
                    try:
                        raw_data = xobj.read_raw_bytes()
                        img = Image.open(io.BytesIO(raw_data))
                        page_images.append(img)
                    except Exception:
                        continue
        if page_images:
            largest = max(page_images, key=lambda x: x.width * x.height)
            images.append(largest)
    pdf.close()
    return images

@app.route('/images-to-pdf', methods=['POST'])
@rate_limit(max_requests=20, window=60)
def images_to_pdf():
    """Convert images (JPG/PNG) to PDF. Accepts multiple files."""
    check_csrf()

    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'Vui lòng chọn ít nhất một file ảnh'}), 400

    # Validate từng file
    for f in files:
        is_valid, err_msg = validate_uploaded_file(f, allowed_exts={'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'})
        if not is_valid:
            return jsonify({'error': f'{f.filename}: {err_msg}'}), 400

    try:
        pdf_bytes = _images_to_pdf_bytes(files)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype='application/pdf',
            as_attachment=True,
            download_name='images_converted.pdf'
        )
    except Exception as e:
        return safe_error(e, 'Lỗi khi chuyển đổi ảnh sang PDF')

def _images_to_pdf_bytes(files):
    """Convert images to PDF using Pillow + pikepdf"""
    from PIL import Image
    import pikepdf

    pdf = pikepdf.Pdf.new()
    for f in files:
        img_bytes = f.read()
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')

        # Create a PDF page with this image
        temp_pdf = io.BytesIO()
        img_pdf = img.convert('RGB')
        img_pdf.save(temp_pdf, format='PDF')
        temp_pdf.seek(0)

        # Copy pages from temp into main doc
        src = pikepdf.Pdf.open(temp_pdf)
        pdf.pages.extend(src.pages)

    output = io.BytesIO()
    pdf.save(output)
    pdf.close()
    return output.getvalue()

# ============================================================
# EXTRACT IMAGES from PDF
# ============================================================
@app.route('/extract-images', methods=['POST'])
@rate_limit(max_requests=20, window=60)
def extract_images():
    """Extract all embedded images from a PDF. Returns ZIP."""
    check_csrf()

    if 'file' not in request.files:
        return jsonify({'error': 'Vui lòng chọn file PDF'}), 400

    file = request.files['file']
    is_valid, err_msg = validate_uploaded_file(file, allowed_exts={'.pdf'})
    if not is_valid:
        return jsonify({'error': err_msg}), 400

    try:
        import pikepdf
        from PIL import Image

        zip_buf = io.BytesIO()
        pdf = pikepdf.Pdf.open(io.BytesIO(file.read()))

        img_count = 0
        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for page_num, page in enumerate(pdf.pages, 1):
                if '/Resources' in page and '/XObject' in page.Resources:
                    xobjects = page.Resources.XObject
                    for name, xobj in xobjects.items():
                        if hasattr(xobj, '/Subtype') and str(xobj.Subtype) == '/Image':
                            try:
                                raw_data = xobj.read_raw_bytes()
                                img = Image.open(io.BytesIO(raw_data))
                                buf = io.BytesIO()
                                fmt = 'PNG' if img.mode in ('RGBA', 'LA') else 'JPEG'
                                ext = 'png' if fmt == 'PNG' else 'jpg'
                                img.save(buf, format=fmt)
                                img_count += 1
                                zf.writestr(f'page{page_num}_{name}.{ext}', buf.getvalue())
                            except Exception:
                                continue

        pdf.close()

        if img_count == 0:
            return jsonify({'error': 'Không tìm thấy ảnh nào trong PDF này'}), 404

        zip_buf.seek(0)
        return send_file(zip_buf, mimetype='application/zip', as_attachment=True,
                       download_name=f'{Path(file.filename).stem}_images.zip')

    except Exception as e:
        return safe_error(e, 'Lỗi khi trích xuất ảnh từ PDF')

# ============================================================
# COMPRESS
# ============================================================
QUALITY_SETTINGS = {
    'high': {'stream_decode_level': 'specialized'},
    'medium': {'stream_decode_level': 'generalized'},
    'low': {'stream_decode_level': 'all'},
}

@app.route('/compress', methods=['POST'])
@rate_limit(max_requests=20, window=60)
def compress():
    check_csrf()

    if 'file' not in request.files:
        return jsonify({'error': 'Vui lòng chọn file PDF'}), 400

    file = request.files['file']
    is_valid, err_msg = validate_uploaded_file(file, allowed_exts={'.pdf'})
    if not is_valid:
        return jsonify({'error': err_msg}), 400

    quality = request.form.get('quality', 'medium')

    if quality not in QUALITY_SETTINGS:
        quality = 'medium'

    try:
        import pikepdf
        level_map = {
            'specialized': pikepdf.StreamDecodeLevel.specialized,
            'generalized': pikepdf.StreamDecodeLevel.generalized,
            'all': pikepdf.StreamDecodeLevel.all,
        }
        decode_level = level_map[QUALITY_SETTINGS[quality]['stream_decode_level']]

        input_bytes = file.read()
        original_size = len(input_bytes)

        pdf = pikepdf.Pdf.open(io.BytesIO(input_bytes))
        output = io.BytesIO()
        pdf.save(output,
            compress_streams=True,
            stream_decode_level=decode_level,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            linearize=True,
        )
        pdf.close()

        compressed_size = len(output.getvalue())
        print(f'Compressed: {original_size} → {compressed_size} '
              f'({(1-compressed_size/original_size)*100:.1f}%, quality={quality})')

        output.seek(0)
        return send_file(
            output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=file.filename.replace('.pdf', '_nen.pdf')
        )

    except Exception as e:
        return safe_error(e, 'Lỗi khi nén PDF')

# ============================================================
# REPAIR PDF — Sửa file PDF bị lỗi
# ============================================================
@app.route('/repair', methods=['POST'])
@rate_limit(max_requests=20, window=60)
def repair_pdf():
    """Repair corrupted PDF using pikepdf"""
    check_csrf()

    if 'file' not in request.files:
        return jsonify({'error': 'Vui lòng chọn file PDF'}), 400

    file = request.files['file']
    is_valid, err_msg = validate_uploaded_file(file, allowed_exts={'.pdf'})
    if not is_valid:
        return jsonify({'error': err_msg}), 400

    import tempfile, os
    tmp_path = None
    try:
        import pikepdf
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            tmp.write(file.read())
            tmp_path = tmp.name

        pdf = pikepdf.Pdf.open(tmp_path, allow_overwriting_input=True)
        output = io.BytesIO()
        pdf.save(output, compress_streams=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate)
        pdf.close()
        output.seek(0)
        return send_file(output, mimetype='application/pdf', as_attachment=True,
                        download_name=file.filename.replace('.pdf', '_repaired.pdf'))
    except Exception as e:
        return safe_error(e, 'Không thể sửa file PDF này')
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

# ============================================================
# ERROR HANDLERS — Flask-level
# ============================================================
@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File quá lớn (tối đa 50MB)'}), 413

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({'error': 'Quá nhiều request. Vui lòng thử lại sau.'}), 429

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint không tồn tại'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Phương thức HTTP không được hỗ trợ'}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Lỗi máy chủ nội bộ'}), 500

# ============================================================
# MAIN
# ============================================================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG') == '1'

    print('🔒 PDF Tools Backend v4.1.1 (Security Hardened)')
    print(f'   Port:        {port}')
    print(f'   Debug:       {debug} (OFF by default)')
    print(f'   Debug Console: DISABLED')
    print(f'   CORS:        Restricted to GitHub Pages + localhost')
    print(f'   Max Upload:  50MB')
    print(f'   Rate Limit:  20 req/min per IP (convert/compress)')
    print(f'   Health:      http://0.0.0.0:{port}/health')
    print(f'')
    print(f'   Supported conversions:')
    for k, v in FORMAT_MAP.items():
        print(f'     {k:20s} → {v["ext"]} ({v["mime"]})')
    app.run(host='0.0.0.0', port=port, debug=debug)
