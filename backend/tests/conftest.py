from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

_TMP_DIR = Path(tempfile.mkdtemp(prefix="carbonlite-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP_DIR / 'test-carbonlite.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_TMP_DIR / "uploads")
os.environ["FACTOR_MODE"] = "demo"
os.environ["AUTO_SEED"] = "true"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def pytest_sessionfinish(session, exitstatus):
    try:
        from app.database import engine

        engine.dispose()
    except Exception:
        pass
    shutil.rmtree(_TMP_DIR, ignore_errors=True)
