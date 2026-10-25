from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


def _load_env() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(BACKEND_DIR / ".env")


_load_env()


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _path(name: str, default: Path) -> Path:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    path = Path(raw)
    if not path.is_absolute():
        path = (BACKEND_DIR / path).resolve()
    return path


@dataclass(frozen=True)
class Settings:
    app_name: str
    version: str
    backend_dir: Path
    project_root: Path
    database_url: str
    upload_dir: Path
    factor_mode: str
    factor_file: Path
    auto_seed: bool
    llm_api_key: str | None
    llm_base_url: str
    llm_vision_model: str
    llm_text_model: str
    llm_timeout_seconds: float
    cors_origins: list[str]
    max_upload_mb: int

    @property
    def demo_mode(self) -> bool:
        return self.factor_mode == "demo"

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key)

    @property
    def sample_bills_dir(self) -> Path:
        return self.project_root / "sample_bills"


def get_settings() -> Settings:
    factor_mode = os.getenv("FACTOR_MODE", "demo").strip().lower()
    if factor_mode not in {"demo", "strict"}:
        factor_mode = "demo"
    data_dir = BACKEND_DIR / "app" / "data"
    factor_file = data_dir / ("factors.demo.csv" if factor_mode == "demo" else "factors.csv")
    origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ]
    return Settings(
        app_name="CarbonLite",
        version="1.0.0",
        backend_dir=BACKEND_DIR,
        project_root=PROJECT_ROOT,
        database_url=os.getenv("DATABASE_URL", "sqlite:///./carbonlite.db"),
        upload_dir=_path("UPLOAD_DIR", BACKEND_DIR / "uploads"),
        factor_mode=factor_mode,
        factor_file=factor_file,
        auto_seed=_bool("AUTO_SEED", True),
        llm_api_key=(os.getenv("LLM_API_KEY") or "").strip() or None,
        llm_base_url=(os.getenv("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/"),
        llm_vision_model=os.getenv("LLM_VISION_MODEL", "gpt-4o").strip() or "gpt-4o",
        llm_text_model=os.getenv("LLM_TEXT_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini",
        llm_timeout_seconds=float(os.getenv("LLM_TIMEOUT_SECONDS", "60")),
        cors_origins=origins,
        max_upload_mb=int(os.getenv("MAX_UPLOAD_MB", "15")),
    )


settings = get_settings()
