from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404
from ..models import Buyer
from ..services.buyer import buyer_overview, buyer_supplier_detail, list_buyers
from ..services.serializers import buyer_dict

router = APIRouter(tags=["Buyer view"])


def _buyer_or_404(db: Session, buyer_id: int) -> Buyer:
    buyer = db.get(Buyer, buyer_id)
    if buyer is None:
        raise HTTPException(status_code=404, detail="Buyer not found.")
    return buyer


@router.get("/buyers", response_model=None)
def get_buyers(db: Session = Depends(get_db)) -> list[dict]:
    return [buyer_dict(buyer) for buyer in list_buyers(db)]


@router.get("/buyer/{buyer_id}/suppliers", response_model=None)
def get_buyer_suppliers(buyer_id: int, db: Session = Depends(get_db)) -> dict:
    return buyer_overview(db, _buyer_or_404(db, buyer_id))


@router.get("/buyer/{buyer_id}/suppliers/{business_id}", response_model=None)
def get_buyer_supplier(buyer_id: int, business_id: int, db: Session = Depends(get_db)) -> dict:
    buyer = _buyer_or_404(db, buyer_id)
    business = business_or_404(db, business_id)
    payload = buyer_supplier_detail(db, buyer, business)
    if not payload:
        raise HTTPException(
            status_code=404,
            detail="This business is not linked to the selected buyer.",
        )
    return payload
