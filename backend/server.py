#!/usr/bin/env python3
"""
Backend API cho Chỉnh Sửa PDF — Convert + Compress + Image
Chạy: backend/.venv/bin/python3 backend/server.py
Cổng mặc định: 5001
"""

import os
import io
import re
import uuid
import shutil
import tempfile
import subprocess
import zipfile
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BACKEND_DIR = Path(__file__).parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# ============================================================
# HEALTH
# ============================================================
@app.route('/health', methods=['GET'])
def health():
    libreoffice = shutil.which('soffice') or shutil.which('libreoffice')
    return jsonify({
        'status': 'ok',
        'engine': 'pikepdf + LibreOffice',
        'libreoffice': bool(libreoffice),
        'libreoffice_path': libreoffice or 'NOT FOUND',
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
    '.pdf': 'pdf-to-word',  # default
    '.html': 'html-to-pdf',
    '.htm': 'html-to-pdf',
}

@app.route('/convert', methods=['POST'])
def convert():
    """Universal convert endpoint. Use query param ?type=<conversion-type>"""
    conv_type = request.args.get('type', '')

    # Auto-detect from file extension if no type given
    if not conv_type and 'file' in request.files:
        ext = Path(request.files['file'].filename).suffix.lower()
        conv_type = EXT_TO_CONVERSION.get(ext, 'pdf-to-word')

    if conv_type not in FORMAT_MAP:
        return jsonify({'error': f'Unsupported conversion type: {conv_type}',
                        'supported': list(FORMAT_MAP.keys())}), 400

    fmt = FORMAT_MAP[conv_type]

    if 'file' not in request.files:
        return jsonify({'error': 'Missing file'}), 400

    file = request.files['file']
    work_dir = Path(tempfile.mkdtemp(dir=UPLOAD_DIR))
    input_path = work_dir / f"input{Path(file.filename).suffix}"

    try:
        file.save(str(input_path))

        # Run LibreOffice conversion
        libreoffice = shutil.which('soffice') or shutil.which('libreoffice')
        if not libreoffice:
            return jsonify({'error': 'LibreOffice not installed. Run: sudo apt install libreoffice'}), 503

        if conv_type == 'html-to-pdf':
            # HTML needs special handling
            output_path = work_dir / f"output{fmt['ext']}"
            _html_to_pdf(input_path, output_path)
        else:
            result = subprocess.run(
                [libreoffice, '--headless', '--convert-to', fmt['to'],
                 '--outdir', str(work_dir), str(input_path)],
                capture_output=True, text=True, timeout=60, cwd=str(work_dir)
            )
            if result.returncode != 0:
                return jsonify({'error': f'Conversion failed: {result.stderr[:300]}'}), 500

            # Find output file
            output_files = list(work_dir.glob(f"*.{fmt['to']}"))
            if not output_files:
                # Try with different extension case
                output_files = list(work_dir.glob(f"*.{fmt['to'].upper()}"))
            if not output_files:
                return jsonify({'error': 'No output generated'}), 500
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
        return jsonify({'error': 'Conversion timed out (max 60s)'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Cleanup
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass

def _html_to_pdf(html_path, output_path):
    """Convert HTML to PDF using weasyprint if available, else Chrome headless"""
    try:
        from weasyprint import HTML
        HTML(filename=str(html_path)).write_pdf(str(output_path))
        return
    except ImportError:
        pass

    # Fallback: Chrome/Chromium headless
    for browser in ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable']:
        exe = shutil.which(browser)
        if exe:
            subprocess.run(
                [exe, '--headless', '--disable-gpu', '--no-sandbox',
                 f'--print-to-pdf={output_path}', f'file://{html_path}'],
                timeout=30
            )
            if output_path.exists():
                return

    raise RuntimeError("No HTML→PDF converter available. Install weasyprint or Chromium.")

# ============================================================
# IMAGE — PDF ↔ Images
# ============================================================
@app.route('/pdf-to-images', methods=['POST'])
def pdf_to_images():
    """Convert PDF pages to JPG/PNG images. Returns ZIP of all pages."""
    if 'file' not in request.files:
        return jsonify({'error': 'Missing file'}), 400

    file = request.files['file']
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
            # Check if poppler-utils is missing
            if not shutil.which('pdftoppm'):
                # Fallback to pikepdf + Pillow
                images = _pdf_to_images_pikepdf(pdf_path)
                if not images:
                    return jsonify({'error': 'poppler-utils not installed. Run: sudo apt install poppler-utils. Or PDF has no embedded images.'}), 500
            else:
                images = _pdf_to_images_pikepdf(pdf_path)

        if not images:
            return jsonify({'error': 'No pages extracted'}), 500

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
        return jsonify({'error': str(e)}), 500
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
        # Try to extract embedded images from page
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
            # Combine images (simplistic — just use first large one)
            largest = max(page_images, key=lambda x: x.width * x.height)
            images.append(largest)
    return images

@app.route('/images-to-pdf', methods=['POST'])
def images_to_pdf():
    """Convert images (JPG/PNG) to PDF. Accepts multiple files."""
    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'Missing files'}), 400

    try:
        pdf_bytes = _images_to_pdf_bytes(files)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype='application/pdf',
            as_attachment=True,
            download_name='images_converted.pdf'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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

        # Save as JPEG bytes for embedding
        jpg_buf = io.BytesIO()
        img.save(jpg_buf, format='JPEG', quality=90)
        jpg_buf.seek(0)

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
def extract_images():
    """Extract all embedded images from a PDF. Returns ZIP."""
    if 'file' not in request.files:
        return jsonify({'error': 'Missing file'}), 400

    file = request.files['file']
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
            return jsonify({'error': 'No images found in this PDF'}), 404

        zip_buf.seek(0)
        return send_file(zip_buf, mimetype='application/zip', as_attachment=True,
                       download_name=f'{Path(file.filename).stem}_images.zip')

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# COMPRESS (giữ nguyên từ compress_server.py cũ)
# ============================================================
QUALITY_SETTINGS = {
    'high': {'stream_decode_level': 'specialized'},
    'medium': {'stream_decode_level': 'generalized'},
    'low': {'stream_decode_level': 'all'},
}

@app.route('/compress', methods=['POST'])
def compress():
    if 'file' not in request.files:
        return jsonify({'error': 'Missing file'}), 400

    file = request.files['file']
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
        print(f'Compress error: {e}')
        return jsonify({'error': str(e)}), 500

# ============================================================
# REPAIR PDF — Sửa file PDF bị lỗi
# ============================================================
@app.route('/repair', methods=['POST'])
def repair_pdf():
    """Repair corrupted PDF using pikepdf"""
    if 'file' not in request.files:
        return jsonify({'error': 'Missing file'}), 400

    file = request.files['file']
    import tempfile, os
    tmp_path = None
    try:
        import pikepdf
        # Save to temp file (allow_overwriting_input needs a real path)
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
        return jsonify({'error': f'Cannot repair: {str(e)}'}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

# ============================================================
# MAIN
# ============================================================
if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_ENV') != 'production'

    print('🚀 PDF Tools Backend')
    print(f'   Port:        {port}')
    print(f'   Debug:       {debug}')
    print(f'   Health:      http://0.0.0.0:{port}/health')
    print(f'   Convert:     POST /convert?type=pdf-to-word')
    print(f'   PDF→Images:  POST /pdf-to-images?format=jpg')
    print(f'   Images→PDF:  POST /images-to-pdf')
    print(f'   Extract Img: POST /extract-images')
    print(f'   Compress:    POST /compress')
    print(f'')
    print(f'   Supported conversions:')
    for k, v in FORMAT_MAP.items():
        print(f'     {k:20s} → {v["ext"]} ({v["mime"]})')
    app.run(host='0.0.0.0', port=port, debug=debug)
