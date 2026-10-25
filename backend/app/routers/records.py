from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404, record_or_404
from ..models import AuditLog, Document, ExtractedRecord
from ..schemas import RecordUpdate
from ..services.audit import log_audit
from ..services.calculation import CalculationError
from ..services.dashboard import calculate_record_result
from ..services.serializers import audit_dict, document_dict, record_dict
from ..services.validation import has_blocking_errors, validate_record

router = APIRouter(tags=["Records"])

AUDITED_FIELDS = (
    "vendor",
    "billing_period_start",
    "billing_period_end",
    "quantity",
    "unit",
    "amount",
    "currency",
    "fuel_type",
    "notes",
)


def _siblings(db: Session, business_id: int, exclude_document_id: int) -> list[ExtractedRecord]:
    return list(
        db.scalars(
            select(ExtractedRecord)
            .join(Document, ExtractedRecord.document_id == Document.id)
            .where(
                Document.business_id == business_id,
                Document.status != "rejected",
                Document.id != exclude_document_id,
            )
        ).all()
    )


def _record_snapshot(record: ExtractedRecord) -> dict:
    return {
        "vendor": record.vendor,
        "billing_period_start": record.billing_period_start.isoformat()
        if record.billing_period_start
        else None,
        "billing_period_end": record.billing_period_end.isoformat() if record.billing_period_end else None,
        "quantity": record.quantity,
        "unit": record.unit,
        "amount": record.amount,
        "currency": record.currency,
        "fuel_type": record.fuel_type,
        "doc_type": record.document.doc_type if record.document else None,
        "notes": record.notes,
    }


def _audit_logs(db: Session, record: ExtractedRecord) -> list[dict]:
    document = record.document
    conditions = [
        and_(AuditLog.entity == "record", AuditLog.entity_id == record.id),
        and_(AuditLog.entity == "document", AuditLog.entity_id == document.id),
    ]
    entries = db.scalars(
        select(AuditLog)
        .where(or_(*conditions))
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .limit(60)
    ).all()
    return [audit_dict(entry) for entry in entries]


def _detail(db: Session, record: ExtractedRecord) -> dict:
    document = record.document
    return {
        **record_dict(record),
        "document": document_dict(document, include_record=False),
        "audit_logs": _audit_logs(db, record),
    }


def _recalculate(db: Session, record: ExtractedRecord, document: Document, business) -> tuple[bool, dict | None]:
    try:
        result = calculate_record_result(db, record, document, business)
        log_audit(
            db,
            "record",
            record.id,
            "emission.calculated",
            new_value={
                "kg_co2e": round(result.kg_co2e, 3),
                "formula": result.formula_text,
                "data_quality": result.data_quality,
                "factor": result.factor_source,
            },
        )
        return True, None
    except CalculationError as exc:
        if record.result:
            db.delete(record.result)
            db.flush()
        return False, {"code": exc.code, "message": exc.message}


@router.get("/records", response_model=None)
def list_records(
    business_id: int = Query(..., gt=0),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    business_or_404(db, business_id)
    query = (
        select(ExtractedRecord)
        .join(Document, ExtractedRecord.document_id == Document.id)
        .where(Document.business_id == business_id)
        .order_by(ExtractedRecord.id.desc())
    )
    if status:
        query = query.where(Document.status == status)
    records = db.scalars(query).all()
    return [
        {
            **record_dict(record),
            "document": document_dict(record.document, include_record=False),
        }
        for record in records
    ]


@router.get("/records/{record_id}", response_model=None)
def get_record(record_id: int, db: Session = Depends(get_db)) -> dict:
    return _detail(db, record_or_404(db, record_id))


@router.put("/records/{record_id}", response_model=None)
def update_record(record_id: int, payload: RecordUpdate, db: Session = Depends(get_db)) -> dict:
    record = record_or_404(db, record_id)
    document = record.document
    business = document.business
    old_snapshot = _record_snapshot(record)

    updates = payload.model_dump(exclude_unset=True)
    new_doc_type = updates.pop("doc_type", None)
    changed_fields: list[str] = []
    for field, value in updates.items():
        if getattr(record, field) != value:
            setattr(record, field, value)
            if field in AUDITED_FIELDS:
                changed_fields.append(field)

    doc_type_changed = new_doc_type is not None and new_doc_type != document.doc_type
    if doc_type_changed:
        document.doc_type = new_doc_type

    if changed_fields or doc_type_changed:
        confidence = dict(record.field_confidence or {})
        for field in changed_fields:
            confidence[field] = 1.0
        record.field_confidence = confidence
        record.overall_confidence = 1.0
        record.user_edited = True

    siblings = _siblings(db, business.id, exclude_document_id=document.id)
    issues = validate_record(record, business, document.doc_type, siblings)
    record.validation_warnings = issues
    blocking = has_blocking_errors(issues)

    counted = False
    calculation_error = None
    status_changed = False
    previous_status = document.status
    if document.status == "verified":
        if blocking:
            document.status = "extracted"
            status_changed = True
            if record.result:
                db.delete(record.result)
                db.flush()
        else:
            counted, calculation_error = _recalculate(db, record, document, business)
    elif not blocking and document.status == "uploaded":
        document.status = "extracted"
        status_changed = True

    new_snapshot = _record_snapshot(record)
    if changed_fields or doc_type_changed:
        log_audit(
            db,
            "record",
            record.id,
            "record.edited",
            old_value=old_snapshot,
            new_value=new_snapshot,
        )
    if status_changed:
        log_audit(
            db,
            "document",
            document.id,
            "document.status_changed",
            old_value={"status": previous_status},
            new_value={
                "status": document.status,
                "reason": "Record edited; re-verification required.",
            },
        )
    db.commit()

    record = record_or_404(db, record_id)
    warnings = [issue for issue in (record.validation_warnings or []) if issue["severity"] == "warning"]
    message = "Saved. This record is still counted." if counted else "Saved."
    if blocking:
        message = "Saved, but this record has blocking issues and is not counted. Fix the highlighted fields."
    elif calculation_error:
        message = "Saved. The record is verified but no emission factor is available, so it is not counted."
    elif document.status == "extracted" and not blocking:
        message = "Saved. Review the values and confirm to count this record."
    return {
        "document": document_dict(document, include_record=False),
        "record": record_dict(record),
        "result": record_dict(record)["result"],
        "warnings": warnings,
        "blocking": blocking,
        "counted": counted,
        "calculation_error": calculation_error,
        "message": message,
    }


@router.post("/records/{record_id}/verify", response_model=None)
def verify_record(record_id: int, db: Session = Depends(get_db)) -> dict:
    record = record_or_404(db, record_id)
    document = record.document
    business = document.business

    previous_status = document.status
    siblings = _siblings(db, business.id, exclude_document_id=document.id)
    issues = validate_record(record, business, document.doc_type, siblings)
    record.validation_warnings = issues
    blocking = has_blocking_errors(issues)
    if blocking:
        log_audit(
            db,
            "record",
            record.id,
            "record.verify_blocked",
            new_value={"issues": [issue["message"] for issue in issues if issue["severity"] == "error"]},
        )
        db.commit()
        raise HTTPException(
            status_code=422,
            detail={
                "message": "This record cannot be counted yet. Fix the blocking issues, then confirm again.",
                "issues": issues,
                "blocking": True,
                "record": record_dict(record),
            },
        )

    document.status = "verified"
    counted, calculation_error = _recalculate(db, record, document, business)
    log_audit(
        db,
        "document",
        document.id,
        "document.verified",
        old_value={"status": previous_status},
        new_value={
            "status": "verified",
            "counted": counted,
            "confidence": record.overall_confidence,
            "user_edited": record.user_edited,
        },
    )
    db.commit()
    record = record_or_404(db, record_id)

    if calculation_error:
        message = "Confirmed. This record is verified but not counted because no usable emission factor is available."
    elif any(issue["severity"] == "warning" for issue in issues):
        message = "Confirmed and counted. Review the remaining warnings in the audit trail."
    else:
        message = "Confirmed and counted."
    return {
        "document": document_dict(document, include_record=False),
        "record": record_dict(record),
        "result": record_dict(record)["result"],
        "warnings": [issue for issue in issues if issue["severity"] == "warning"],
        "blocking": False,
        "counted": counted,
        "calculation_error": calculation_error,
        "message": message,
    }


@router.post("/records/{record_id}/reject", response_model=None)
def reject_record(record_id: int, db: Session = Depends(get_db)) -> dict:
    record = record_or_404(db, record_id)
    document = record.document
    previous_status = document.status
    document.status = "rejected"
    if record.result:
        db.delete(record.result)
        db.flush()
    log_audit(
        db,
        "document",
        document.id,
        "document.rejected",
        old_value={"status": previous_status},
        new_value={"status": "rejected"},
    )
    db.commit()
    return {
        "document": document_dict(document, include_record=False),
        "record": record_dict(record),
        "result": None,
        "counted": False,
        "message": "Rejected. This document stays in the audit trail but is excluded from totals.",
    }


@router.post("/records/{record_id}/reopen", response_model=None)
def reopen_record(record_id: int, db: Session = Depends(get_db)) -> dict:
    record = record_or_404(db, record_id)
    document = record.document
    business = document.business
    if document.status != "rejected":
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Only rejected documents can be reopened.",
                "code": "not_rejected",
            },
        )
    document.status = "extracted"
    siblings = _siblings(db, business.id, exclude_document_id=document.id)
    issues = validate_record(record, business, document.doc_type, siblings)
    record.validation_warnings = issues
    log_audit(
        db,
        "document",
        document.id,
        "document.reopened",
        old_value={"status": "rejected"},
        new_value={"status": "extracted"},
    )
    db.commit()
    return {
        "document": document_dict(document, include_record=False),
        "record": record_dict(record),
        "result": record_dict(record)["result"],
        "warnings": [issue for issue in issues if issue["severity"] == "warning"],
        "blocking": has_blocking_errors(issues),
        "counted": False,
        "calculation_error": None,
        "message": "Reopened for review. Fix the fields and confirm to count it again.",
    }


@router.get("/business/{business_id}/audit", response_model=None)
def business_audit(
    business_id: int,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[dict]:
    business_or_404(db, business_id)
    document_ids = list(
        db.scalars(select(Document.id).where(Document.business_id == business_id)).all()
    )
    record_ids = list(
        db.scalars(
            select(ExtractedRecord.id)
            .join(Document, ExtractedRecord.document_id == Document.id)
            .where(Document.business_id == business_id)
        ).all()
    )
    conditions = [and_(AuditLog.entity == "business", AuditLog.entity_id == business_id)]
    if document_ids:
        conditions.append(and_(AuditLog.entity == "document", AuditLog.entity_id.in_(document_ids)))
    if record_ids:
        conditions.append(and_(AuditLog.entity == "record", AuditLog.entity_id.in_(record_ids)))
    entries = db.scalars(
        select(AuditLog)
        .where(or_(*conditions))
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .limit(limit)
    ).all()
    return [audit_dict(entry) for entry in entries]
