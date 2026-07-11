"""conftest.py — Fixtures dùng chung cho pytest tests của PDF Tools backend."""

import pytest
from unittest.mock import patch


@pytest.fixture(autouse=True)
def disable_rate_limiting(monkeypatch):
    """Disable rate limiting in tests — trả về nguyên hàm không wrap."""
    import server

    def noop_rate_limit(max_requests=30, window=60):
        """Rate limit decorator but does nothing."""

        def decorator(f):
            return f

        return decorator

    monkeypatch.setattr(server, "rate_limit", noop_rate_limit)
    # Also reset the in-memory store in case anything leaked from import
    server._rate_limit_store.clear()


@pytest.fixture
def app():
    """Flask app fixture configured for testing."""
    import server

    server.app.config["TESTING"] = True
    server.app.config["SERVER_NAME"] = "localhost"
    return server.app


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.test_client()
