from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404
from ..models import Business
from ..schemas import BusinessCreate
from ..services.audit import log_audit
from ..services.serializers import business_dict

router = APIRouter(tags=["Business"])


@router.post("/business", status_code=201, response_model=None)
def create_business(payload: BusinessCreate, db: Session = Depends(get_db)) -> dict:
    business = Business(
        name=payload.name,
        industry=payload.industry,
        location=payload.location or "India",
        language=payload.language,
        reporting_period_start=payload.reporting_period_start,
        reporting_period_end=payload.reporting_period_end,
        units_produced=payload.units_produced,
        annual_revenue=payload.annual_revenue,
        is_demo=False,
    )
    db.add(business)
    db.flush()
    log_audit(db, "business", business.id, "business.created", new_value=business_dict(business))
    db.commit()
    return business_dict(business)


@router.get("/businesses", response_model=None)
def list_businesses(db: Session = Depends(get_db)) -> list[dict]:
    businesses = db.scalars(select(Business).order_by(Business.is_demo.desc(), Business.name)).all()
    return [business_dict(business) for business in businesses]


@router.get("/business/{business_id}", response_model=None)
def get_business(business_id: int, db: Session = Depends(get_db)) -> dict:
    return business_dict(business_or_404(db, business_id))
