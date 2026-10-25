"""Vercel serverless entrypoint for the CarbonLite FastAPI app.

Vercel serves files under api/ as serverless functions. This thin wrapper
exposes the existing FastAPI application (backend/app/main.py) as the
function's ASGI app. No application code is duplicated or modified here.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.main import app  # noqa: E402,F401  (re-exported for Vercel)
