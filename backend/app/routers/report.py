from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404
from ..services.audit import log_audit
from ..services.reporting.pdf import build_report_pdf
from ..services.reporting.service import build_csv, build_report_payload

router = APIRouter(tags=["Reports"])


def _blocked(payload: dict) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "message": payload["block_reason"] or "This report is not ready to finalize.",
            "code": "report_blocked",
            "problems": payload["problems"],
            "can_finalize": False,
        },
    )


def _filename(payload: dict, extension: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", payload["business"]["name"].lower()).strip("-")
    slug = slug or f"business-{payload['business']['id']}"
    return f"carbonlite-{slug}-{payload['period']['start']}-to-{payload['period']['end']}.{extension}"


def _headers(payload: dict, filename: str) -> dict[str, str]:
    return {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-CarbonLite-Demo": "true" if payload["demo"] else "false",
        "Cache-Control": "no-store",
    }


@router.get("/report/{business_id}", response_model=None)
def report_preview(business_id: int, db: Session = Depends(get_db)) -> dict:
    business = business_or_404(db, business_id)
    return build_report_payload(db, business)


@router.get("/report/{business_id}/pdf", response_model=None)
def report_pdf(business_id: int, db: Session = Depends(get_db)) -> Response:
    business = business_or_404(db, business_id)
    payload = build_report_payload(db, business)
    if not payload["can_finalize"]:
        raise _blocked(payload)
    pdf_bytes = build_report_pdf(payload)
    filename = _filename(payload, "pdf")
    log_audit(
        db,
        "business",
        business.id,
        "report.pdf_generated",
        new_value={
            "filename": filename,
            "kg_co2e": payload["totals"]["kg_co2e"],
            "counted_records": payload["audit"]["counted"],
            "demo": payload["demo"],
        },
    )
    db.commit()
    return Response(content=pdf_bytes, media_type="application/pdf", headers=_headers(payload, filename))


@router.get("/report/{business_id}/csv", response_model=None)
def report_csv(business_id: int, db: Session = Depends(get_db)) -> Response:
    business = business_or_404(db, business_id)
    payload = build_report_payload(db, business)
    if not payload["can_finalize"]:
        raise _blocked(payload)
    csv_bytes = build_csv(payload)
    filename = _filename(payload, "csv")
    log_audit(
        db,
        "business",
        business.id,
        "report.csv_generated",
        new_value={"filename": filename, "rows": len(payload["audit"]["rows"]), "demo": payload["demo"]},
    )
    db.commit()
    return Response(content=csv_bytes, media_type="text/csv; charset=utf-8", headers=_headers(payload, filename))
