from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404
from ..services.recommendations import (
    NoVerifiedData,
    generate_recommendations,
    latest_recommendations,
    recommendations_response,
)

router = APIRouter(tags=["Recommendations"])


@router.get("/recommendations/{business_id}", response_model=None)
def get_recommendations(business_id: int, db: Session = Depends(get_db)) -> dict:
    business = business_or_404(db, business_id)
    entry = latest_recommendations(db, business)
    return {
        "business_id": business.id,
        "has_recommendations": entry is not None,
        "recommendations": recommendations_response(entry),
    }


@router.post("/recommendations/{business_id}", status_code=201, response_model=None)
def create_recommendations(business_id: int, db: Session = Depends(get_db)) -> dict:
    business = business_or_404(db, business_id)
    try:
        payload = generate_recommendations(db, business)
    except NoVerifiedData as exc:
        raise HTTPException(
            status_code=409,
            detail={"message": str(exc), "code": "no_verified_data"},
        ) from exc
    return payload
