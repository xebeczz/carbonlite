from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..services.factors import factor_summary, load_factors

router = APIRouter(tags=["Emission factors"])


def _payload(db: Session) -> dict:
    factors = factor_summary(db)
    unverified = [factor for factor in factors if factor["status"] == "unverified"]
    demo = [factor for factor in factors if factor["status"] == "demo"]
    if unverified:
        notice = (
            "Some factor values are still marked VERIFY_ME. Verified records using them will not be counted "
            "and reports are blocked until real values are supplied."
        )
    elif demo:
        notice = (
            "These are illustrative demo values, not verified CEA/IPCC/DEFRA figures. "
            "Reports produced in demo mode carry a DEMO watermark."
        )
    else:
        notice = "Factor values are marked verified in the factor file."
    return {
        "mode": settings.factor_mode,
        "factor_file": settings.factor_file.name,
        "notice": notice,
        "counts": {
            "total": len(factors),
            "verified": sum(1 for factor in factors if factor["status"] == "verified"),
            "demo": len(demo),
            "unverified": len(unverified),
        },
        "factors": factors,
    }


@router.get("/factors", response_model=None)
def list_factors(db: Session = Depends(get_db)) -> dict:
    return _payload(db)


@router.post("/factors/reload", response_model=None)
def reload_factors(db: Session = Depends(get_db)) -> dict:
    summary = load_factors(db)
    return {**summary, **_payload(db)}
