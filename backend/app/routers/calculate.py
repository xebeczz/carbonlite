from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404
from ..services.audit import log_audit
from ..services.dashboard import recalculate_business

router = APIRouter(tags=["Calculation"])


@router.post("/calculate/{business_id}", response_model=None)
def recalculate(business_id: int, db: Session = Depends(get_db)) -> dict:
    business = business_or_404(db, business_id)
    summary = recalculate_business(db, business)
    log_audit(
        db,
        "business",
        business.id,
        "emissions.recalculated",
        new_value={
            "calculated": summary["calculated"],
            "errors": len(summary["errors"]),
            "verified_documents": summary["verified_documents"],
        },
    )
    db.commit()
    return {
        **summary,
        "message": (
            f"Recalculated {summary['calculated']} verified record(s)."
            if not summary["errors"]
            else f"Recalculated {summary['calculated']} record(s), {len(summary['errors'])} could not be calculated."
        ),
    }
