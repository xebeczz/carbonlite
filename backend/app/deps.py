from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Business, ExtractedRecord


def business_or_404(db: Session, business_id: int) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found.")
    return business


def record_or_404(db: Session, record_id: int) -> ExtractedRecord:
    record = db.get(ExtractedRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found.")
    return record
