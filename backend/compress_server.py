#!/usr/bin/env python3
"""
Backend nén PDF - Flask server dùng pikepdf để nén PDF chất lượng cao.
Chạy: python3 backend/compress_server.py
Cổng mặc định: 5001
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pikepdf
import io
import os

app = Flask(__name__)
CORS(app)

QUALITY_SETTINGS = {
    'high': {'compress_streams': True, 'stream_decode_level': pikepdf.StreamDecodeLevel.specialized},
    'medium': {'compress_streams': True, 'stream_decode_level': pikepdf.StreamDecodeLevel.generalized},
    'low': {'compress_streams': True, 'stream_decode_level': pikepdf.StreamDecodeLevel.all},
}

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'engine': 'pikepdf'})

@app.route('/compress', methods=['POST'])
def compress():
    if 'file' not in request.files:
        return 'Missing file', 400

    file = request.files['file']
    quality = request.form.get('quality', 'medium')

    if quality not in QUALITY_SETTINGS:
        quality = 'medium'

    settings = QUALITY_SETTINGS[quality]

    try:
        # Read PDF
        input_bytes = file.read()
        original_size = len(input_bytes)

        # Compress with pikepdf
        pdf = pikepdf.Pdf.open(io.BytesIO(input_bytes))

        # Apply compression settings
        pdf.save(
            compress_streams=settings['compress_streams'],
            stream_decode_level=settings['stream_decode_level'],
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            normalize_content=True,
            linearize=True,
        )

        # Get compressed bytes
        output = io.BytesIO()
        pdf.save(output,
            compress_streams=True,
            stream_decode_level=settings['stream_decode_level'],
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            normalize_content=True,
            linearize=True,
        )
        pdf.close()

        compressed_bytes = output.getvalue()
        compressed_size = len(compressed_bytes)

        print(f'Compressed: {original_size} -> {compressed_size} '
              f'({(1-compressed_size/original_size)*100:.1f}% reduction, quality={quality})')

        output.seek(0)
        return send_file(
            output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=file.filename.replace('.pdf', '_nen.pdf')
        )

    except Exception as e:
        print(f'Compression error: {e}')
        return str(e), 500

if __name__ == '__main__':
    print('🚀 PDF Compress Backend (pikepdf)')
    print(f'   URL: http://localhost:5001')
    print(f'   Health: http://localhost:5001/health')
    app.run(host='0.0.0.0', port=5001, debug=False)
