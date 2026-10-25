from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Business, Buyer, Document, EmissionFactor
from ..services.extraction.service import ExtractionService
from .samples import sample_list

router = APIRouter(tags=["System"])


@router.get("/health", response_model=None)
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(select(func.count()).select_from(Business))
    return {"status": "ok", "version": settings.version}


@router.get("/meta", response_model=None)
def meta(db: Session = Depends(get_db)) -> dict:
    demo_businesses = db.scalars(
        select(Business).where(Business.is_demo.is_(True)).order_by(Business.id)
    ).all()
    demo_buyers = db.scalars(select(Buyer).where(Buyer.is_demo.is_(True))).all()
    counts = {
        "businesses": db.scalar(select(func.count()).select_from(Business)) or 0,
        "documents": db.scalar(select(func.count()).select_from(Document)) or 0,
        "factors": db.scalar(select(func.count()).select_from(EmissionFactor)) or 0,
    }
    return {
        "app": settings.app_name,
        "version": settings.version,
        "factor_mode": settings.factor_mode,
        "auto_seed": settings.auto_seed,
        "limits": {"max_upload_mb": settings.max_upload_mb},
        "extraction": ExtractionService().capabilities(),
        "demo": {
            "businesses": [{"id": business.id, "name": business.name} for business in demo_businesses],
            "buyers": [{"id": buyer.id, "name": buyer.name} for buyer in demo_buyers],
        },
        "counts": counts,
        "samples": sample_list(),
    }
