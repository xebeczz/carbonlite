from __future__ import annotations

from ..constants import (
    CATEGORY_LABELS,
    DOC_TYPE_LABELS,
    FUEL_LABELS,
    QUALITY_LABELS,
    SCOPE_FULL_LABELS,
    SCOPE_LABELS,
    STATUS_LABELS,
)
from ..models import (
    AuditLog,
    Business,
    Buyer,
    Document,
    EmissionFactor,
    EmissionResult,
    ExtractedRecord,
    RecommendationSet,
    SupplierLink,
)

EXTRACTION_METHOD_LABELS = {
    "vision_llm": "AI vision reader",
    "text_llm": "AI text reader",
    "pdf_text_parser": "Offline PDF reader",
    "ocr_parser": "OCR offline reader",
    "manual": "Manual entry",
}


def iso(value) -> str | None:
    return value.isoformat() if value else None


def business_dict(business: Business) -> dict:
    return {
        "id": business.id,
        "name": business.name,
        "industry": business.industry,
        "location": business.location,
        "language": business.language,
        "reporting_period_start": iso(business.reporting_period_start),
        "reporting_period_end": iso(business.reporting_period_end),
        "units_produced": business.units_produced,
        "annual_revenue": business.annual_revenue,
        "currency": business.currency,
        "region": business.region,
        "is_demo": business.is_demo,
        "created_at": iso(business.created_at),
    }


def factor_dict(factor: EmissionFactor) -> dict:
    return {
        "id": factor.id,
        "activity_key": factor.activity_key,
        "unit": factor.unit,
        "factor_kg_co2e_per_unit": factor.factor_kg_co2e_per_unit,
        "source": factor.source,
        "source_version": factor.source_version,
        "year": factor.year,
        "region": factor.region,
        "notes": factor.notes,
        "status": factor.status,
    }


def result_dict(result: EmissionResult | None) -> dict | None:
    if result is None:
        return None
    return {
        "id": result.id,
        "record_id": result.record_id,
        "activity_key": result.activity_key,
        "quantity_used": result.quantity_used,
        "unit_used": result.unit_used,
        "kg_co2e": round(result.kg_co2e, 3),
        "tonnes_co2e": round(result.kg_co2e / 1000, 4),
        "scope": result.scope,
        "scope_label": SCOPE_LABELS.get(result.scope, f"Scope {result.scope}"),
        "scope_full_label": SCOPE_FULL_LABELS.get(result.scope, f"Scope {result.scope}"),
        "category": result.category,
        "category_label": CATEGORY_LABELS.get(result.category, result.category),
        "calc_method": result.calc_method,
        "data_quality": result.data_quality,
        "data_quality_label": QUALITY_LABELS.get(result.data_quality, result.data_quality),
        "formula_text": result.formula_text,
        "factor": {
            "id": result.factor_id,
            "activity_key": result.activity_key,
            "value": result.factor_value,
            "unit": result.factor_unit,
            "source": result.factor_source,
            "source_version": result.factor_version,
            "year": result.factor_year,
            "region": result.factor_region,
            "status": result.factor_status,
        },
        "created_at": iso(result.created_at),
    }


def record_dict(
    record: ExtractedRecord | None,
    *,
    include_result: bool = True,
    include_document: bool = False,
) -> dict | None:
    if record is None:
        return None
    low_fields = sorted(
        field
        for field, value in (record.field_confidence or {}).items()
        if value is not None and value < 0.75
    )
    payload = {
        "id": record.id,
        "document_id": record.document_id,
        "vendor": record.vendor,
        "billing_period_start": iso(record.billing_period_start),
        "billing_period_end": iso(record.billing_period_end),
        "quantity": record.quantity,
        "unit": record.unit,
        "amount": record.amount,
        "currency": record.currency,
        "fuel_type": record.fuel_type,
        "fuel_type_label": FUEL_LABELS.get(record.fuel_type or "", None),
        "field_confidence": record.field_confidence or {},
        "overall_confidence": record.overall_confidence,
        "low_confidence_fields": low_fields,
        "user_edited": record.user_edited,
        "notes": record.notes,
        "validation_warnings": record.validation_warnings or [],
        "created_at": iso(record.created_at),
        "updated_at": iso(record.updated_at),
        "result": result_dict(record.result) if include_result else None,
    }
    if include_document and record.document:
        payload["document"] = document_dict(record.document, include_record=False)
    return payload


def document_dict(
    document: Document,
    *,
    include_record: bool = True,
    include_result: bool = True,
) -> dict:
    return {
        "id": document.id,
        "business_id": document.business_id,
        "original_filename": document.original_filename,
        "doc_type": document.doc_type,
        "doc_type_label": DOC_TYPE_LABELS.get(document.doc_type, document.doc_type),
        "status": document.status,
        "status_label": STATUS_LABELS.get(document.status, document.status),
        "uploaded_at": iso(document.uploaded_at),
        "mime_type": document.mime_type,
        "file_url": f"/documents/{document.id}/file",
        "preview_url": f"/documents/{document.id}/preview",
        "extraction_method": document.extraction_method,
        "extraction_method_label": EXTRACTION_METHOD_LABELS.get(
            document.extraction_method or "", document.extraction_method or "—"
        ),
        "extraction_error": document.extraction_error,
        "duplicate_of": document.duplicate_of,
        "is_demo": document.is_demo,
        "record": record_dict(document.record, include_result=include_result) if include_record else None,
    }


def audit_dict(entry: AuditLog) -> dict:
    return {
        "id": entry.id,
        "entity": entry.entity,
        "entity_id": entry.entity_id,
        "action": entry.action,
        "old_value": entry.old_value,
        "new_value": entry.new_value,
        "actor": entry.actor,
        "timestamp": iso(entry.timestamp),
    }


def buyer_dict(buyer: Buyer) -> dict:
    return {
        "id": buyer.id,
        "name": buyer.name,
        "is_demo": buyer.is_demo,
    }


def supplier_link_dict(link: SupplierLink) -> dict:
    return {
        "id": link.id,
        "buyer_id": link.buyer_id,
        "business_id": link.business_id,
        "status": link.status,
        "business": business_dict(link.business) if link.business else None,
    }


def recommendation_set_dict(entry: RecommendationSet | None) -> dict | None:
    if entry is None:
        return None
    payload = entry.payload or {}
    return {
        "id": entry.id,
        "method": entry.method,
        "generated_at": iso(entry.generated_at),
        **payload,
    }
