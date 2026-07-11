"""Pytest tests for PDF Tools Backend API (P0)."""

import io


class TestHealthEndpoint:
    """GET /health — kiểm tra server alive."""

    def test_health_endpoint(self, client):
        """Gọi GET /health, kiểm tra status 200, JSON có 'status':'ok'."""
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ok"


class TestIndexRoute:
    """GET / — trang chào mừng HTML."""

    def test_index_route(self, client):
        """Gọi GET /, kiểm tra status 200."""
        resp = client.get("/")
        assert resp.status_code == 200


class TestConvertNoFile:
    """POST /convert không có file."""

    def test_convert_no_file(self, client):
        """Gọi POST /convert không gửi file, kiểm tra lỗi 400."""
        resp = client.post("/convert")
        assert resp.status_code == 400
        data = resp.get_json()
        assert "error" in data


class TestCompressNoFile:
    """POST /compress không có file."""

    def test_compress_no_file(self, client):
        """Gọi POST /compress không gửi file, kiểm tra lỗi 400."""
        resp = client.post("/compress")
        assert resp.status_code == 400
        data = resp.get_json()
        assert "error" in data


class TestCsrfRejected:
    """POST với Origin lạ bị từ chối 403."""

    def test_csrf_rejected(self, client):
        """Gọi POST /convert với Origin lạ (evil.com), kiểm tra 403."""
        resp = client.post(
            "/convert",
            headers={"Origin": "https://evil.com"},
        )
        assert resp.status_code == 403
        data = resp.get_json()
        assert "error" in data


class TestFileTooLarge:
    """POST với file >50MB bị từ chối 413."""

    def test_file_too_large(self, client, app):
        """Gửi file >50MB, kiểm tra Flask trả về 413 (RequestEntityTooLarge)."""
        # Tạm hạ MAX_CONTENT_LENGTH xuống 1KB để test không tốn tài nguyên
        original_limit = app.config.get("MAX_CONTENT_LENGTH")
        try:
            app.config["MAX_CONTENT_LENGTH"] = 1024  # 1 KB
            # Tạo file 2KB (vượt quá limit)
            fake_data = io.BytesIO(b"x" * 2048)
            resp = client.post(
                "/convert",
                data={"file": (fake_data, "test.pdf")},
                content_type="multipart/form-data",
            )
            assert resp.status_code == 413
            data = resp.get_json()
            assert "error" in data
        finally:
            app.config["MAX_CONTENT_LENGTH"] = original_limit
