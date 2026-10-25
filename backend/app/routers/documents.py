from __future__ import annotations

import mimetypes

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import business_or_404
from ..models import AuditLog, Document, ExtractedRecord
from ..schemas import RecordUpdate
from ..services.audit import log_audit
from ..services.documents import (
    DuplicateDocument,
    UploadRejected,
    inspect_upload,
    resolve_stored_path,
    store_upload,
)
from ..services.extraction.service import ExtractionService
from ..services.extraction.schemas import ExtractedFields
from ..services.serializers import (
    audit_dict,
    document_dict,
    record_dict,
)
from ..services.validation import validate_record

router = APIRouter(tags=["Documents"])


def _siblings(db: Session, business_id: int, exclude_document_id: int | None = None) -> list[ExtractedRecord]:
    query = (
        select(ExtractedRecord)
        .join(Document, ExtractedRecord.document_id == Document.id)
        .where(Document.business_id == business_id, Document.status != "rejected")
    )
    if exclude_document_id is not None:
        query = query.where(Document.id != exclude_document_id)
    return list(db.scalars(query).all())


def _apply_extraction(
    db: Session, document: Document, outcome, business
) -> ExtractedRecord:
    fields: ExtractedFields = outcome.fields
    document.doc_type = fields.document_type
    document.extraction_method = outcome.method
    document.extraction_error = outcome.error
    document.status = "extracted" if fields.has_any_data() else "uploaded"

    record = ExtractedRecord(
        document_id=document.id,
        vendor=fields.vendor,
        billing_period_start=fields.billing_period_start,
        billing_period_end=fields.billing_period_end,
        quantity=fields.quantity,
        unit=fields.unit,
        amount=fields.amount,
        currency=fields.currency or "INR",
        fuel_type=fields.fuel_type,
        field_confidence=fields.field_confidence,
        overall_confidence=fields.overall_confidence,
        user_edited=False,
        raw_llm_output={
            **(outcome.raw or {}),
            "_provider": outcome.provider,
            "_warnings": outcome.warnings,
            "_error": outcome.error,
        },
        notes=fields.notes or "",
        validation_warnings=[],
    )
    db.add(record)
    db.flush()
    siblings = _siblings(db, business.id, exclude_document_id=document.id)
    record.validation_warnings = validate_record(record, business, document.doc_type, siblings)
    return record


@router.post("/documents/upload", status_code=201, response_model=None)
def upload_document(
    business_id: int = Query(..., gt=0),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    business = business_or_404(db, business_id)
    try:
        content = file.file.read()
        sanitised = inspect_upload(file.filename, content)
        document = store_upload(db, business, sanitised)
    except DuplicateDocument as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(exc),
                "existing_document_id": exc.existing_id,
                "code": "duplicate_file",
            },
        ) from exc
    except UploadRejected as exc:
        raise HTTPException(
            status_code=400, detail={"message": str(exc), "code": "upload_rejected"}
        ) from exc
    finally:
        file.file.close()

    path = resolve_stored_path(document.file_path)
    if path is None:
        raise HTTPException(status_code=500, detail="Uploaded file could not be stored.")

    service = ExtractionService()
    outcome = service.extract(path, document.mime_type, document.original_filename)
    record = _apply_extraction(db, document, outcome, business)

    log_audit(
        db,
        "document",
        document.id,
        "document.uploaded",
        new_value={
            "filename": document.original_filename,
            "doc_type": document.doc_type,
            "status": document.status,
            "method": outcome.method,
        },
    )
    log_audit(
        db,
        "record",
        record.id,
        "record.extracted",
        new_value={
            "vendor": record.vendor,
            "quantity": record.quantity,
            "unit": record.unit,
            "overall_confidence": record.overall_confidence,
            "method": outcome.method,
        },
    )
    db.commit()
    warnings = list(outcome.warnings)
    if record.validation_warnings:
        warnings.extend(issue["message"] for issue in record.validation_warnings if issue["severity"] == "error")

    return {
        "document": document_dict(document),
        "record": record_dict(record),
        "extraction": {
            "method": outcome.method,
            "method_label": outcome.method_label,
            "provider": outcome.provider,
            "error": outcome.error,
            "warnings": warnings,
            "manual_required": outcome.manual_required or not outcome.fields.has_any_data(),
            "capabilities": service.capabilities(),
        },
    }


@router.get("/documents", response_model=None)
def list_documents(
    business_id: int = Query(..., gt=0),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    business_or_404(db, business_id)
    query = (
        select(Document)
        .where(Document.business_id == business_id)
        .order_by(Document.uploaded_at.desc(), Document.id.desc())
    )
    if status:
        query = query.where(Document.status == status)
    documents = db.scalars(query).all()
    return [document_dict(document) for document in documents]


@router.get("/documents/{document_id}", response_model=None)
def get_document(document_id: int, db: Session = Depends(get_db)) -> dict:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    payload = document_dict(document)
    logs = db.scalars(
        select(AuditLog)
        .where(AuditLog.entity == "document", AuditLog.entity_id == document.id)
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
    ).all()
    payload["audit_logs"] = [audit_dict(entry) for entry in logs]
    return payload


def _serve_file(document: Document, preview: bool) -> FileResponse:
    relative = document.preview_path if preview else document.file_path
    path = resolve_stored_path(relative) or resolve_stored_path(document.file_path)
    if path is None:
        raise HTTPException(status_code=404, detail="The stored file is missing.")
    if preview:
        media_type = mimetypes.guess_type(path.name)[0] or document.mime_type
    else:
        media_type = document.mime_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    safe_name = document.original_filename.replace('"', "").replace("\n", " ") or f"document-{document.id}"
    return FileResponse(
        path,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "private, max-age=300",
        },
    )


@router.get("/documents/{document_id}/preview", response_model=None)
def preview_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return _serve_file(document, preview=True)


@router.get("/documents/{document_id}/file", response_model=None)
def original_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return _serve_file(document, preview=False)
