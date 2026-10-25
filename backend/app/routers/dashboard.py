from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404
from ..services.dashboard import business_dashboard

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/{business_id}", response_model=None)
def dashboard(business_id: int, db: Session = Depends(get_db)) -> dict:
    business = business_or_404(db, business_id)
    return business_dashboard(db, business)
