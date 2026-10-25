from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import CATEGORY_LABELS
from ..models import Business, Document, EmissionFactor, EmissionResult, ExtractedRecord
from .calculation import (
    ActivityInput,
    CalculationError,
    FactorInfo,
    month_key,
    ResultSnapshot,
    aggregate_results,
    calculate_emission,
    intensity_metrics,
)


def factor_infos(db: Session) -> list[FactorInfo]:
    factors = db.scalars(select(EmissionFactor)).all()
    return [
        FactorInfo(
            id=factor.id,
            activity_key=factor.activity_key,
            unit=factor.unit,
            value=factor.factor_kg_co2e_per_unit,
            source=factor.source,
            source_version=factor.source_version,
            year=factor.year,
            region=factor.region,
            notes=factor.notes,
            status=factor.status,
        )
        for factor in factors
    ]


def activity_from_record(record: ExtractedRecord, document: Document) -> ActivityInput:
    return ActivityInput(
        doc_type=document.doc_type,
        fuel_type=record.fuel_type,
        quantity=record.quantity,
        unit=record.unit,
        amount=record.amount,
        currency=record.currency,
        overall_confidence=record.overall_confidence,
        field_confidence=record.field_confidence or {},
        user_edited=record.user_edited,
    )


class EmissionCalculationFailed(Exception):
    def __init__(self, message: str, code: str = "calculation_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def calculate_record_result(
    db: Session, record: ExtractedRecord, document: Document, business: Business
) -> EmissionResult:
    outcome = calculate_emission(
        activity_from_record(record, document),
        factor_infos(db),
        region=business.region or "IN",
    )
    existing = record.result
    if existing:
        db.delete(existing)
        db.flush()
    result = EmissionResult(
        record_id=record.id,
        factor_id=outcome.factor.id,
        activity_key=outcome.activity_key,
        quantity_used=outcome.quantity_used,
        unit_used=outcome.unit_used,
        kg_co2e=outcome.kg_co2e,
        scope=outcome.scope,
        category=outcome.category,
        calc_method=outcome.calc_method,
        data_quality=outcome.data_quality,
        formula_text=outcome.formula_text,
        factor_value=outcome.factor.value,
        factor_unit=outcome.factor.unit,
        factor_source=outcome.factor.source,
        factor_version=outcome.factor.source_version,
        factor_year=outcome.factor.year,
        factor_region=outcome.factor.region,
        factor_status=outcome.factor.status,
    )
    db.add(result)
    db.flush()
    record.result = result
    return result


def recalculate_business(db: Session, business: Business) -> dict:
    documents = db.scalars(
        select(Document)
        .where(Document.business_id == business.id, Document.status == "verified")
        .order_by(Document.id)
    ).all()
    calculated = 0
    errors: list[dict] = []
    for document in documents:
        record = document.record
        if record is None:
            errors.append(
                {
                    "document_id": document.id,
                    "record_id": None,
                    "code": "missing_record",
                    "message": "This verified document has no extracted record.",
                }
            )
            continue
        try:
            calculate_record_result(db, record, document, business)
            calculated += 1
        except CalculationError as exc:
            if record.result:
                db.delete(record.result)
            errors.append(
                {
                    "document_id": document.id,
                    "record_id": record.id,
                    "code": exc.code,
                    "message": exc.message,
                }
            )
        except Exception as exc:  # pragma: no cover - defensive
            errors.append(
                {
                    "document_id": document.id,
                    "record_id": record.id,
                    "code": "unexpected_error",
                    "message": f"Could not calculate this record: {exc}",
                }
            )
    db.commit()
    return {
        "business_id": business.id,
        "calculated": calculated,
        "errors": errors,
        "verified_documents": len(documents),
    }


def verified_results(db: Session, business_id: int) -> list[EmissionResult]:
    return list(
        db.scalars(
            select(EmissionResult)
            .join(ExtractedRecord, EmissionResult.record_id == ExtractedRecord.id)
            .join(Document, ExtractedRecord.document_id == Document.id)
            .where(Document.business_id == business_id, Document.status == "verified")
            .order_by(Document.id)
        ).all()
    )


def snapshots_for(results: list[EmissionResult], records_by_id: dict[int, ExtractedRecord]) -> list[ResultSnapshot]:
    snapshots = []
    for result in results:
        record = records_by_id.get(result.record_id)
        month = month_key(record.billing_period_end if record else None)
        snapshots.append(
            ResultSnapshot(
                kg_co2e=result.kg_co2e,
                scope=result.scope,
                category=result.category,
                data_quality=result.data_quality,
                month=month,
            )
        )
    return snapshots


def factor_usage(db: Session, results: list[EmissionResult]) -> list[dict]:
    used: dict[tuple, dict] = {}
    for result in results:
        key = (result.factor_id, result.activity_key)
        if key in used:
            used[key]["record_count"] += 1
            continue
        current = (
            db.get(EmissionFactor, result.factor_id) if result.factor_id is not None else None
        )
        used[key] = {
            "factor_id": result.factor_id,
            "activity_key": result.activity_key,
            "category_label": CATEGORY_LABELS.get(result.category, result.category),
            "value": result.factor_value,
            "unit": result.factor_unit,
            "source": result.factor_source,
            "source_version": result.factor_version,
            "year": result.factor_year,
            "region": result.factor_region,
            "status": current.status if current else result.factor_status,
            "notes": current.notes if current else "",
            "record_count": 0,
        }
        used[key]["record_count"] += 1
    return list(used.values())


def business_dashboard(db: Session, business: Business) -> dict:
    documents = db.scalars(
        select(Document)
        .where(Document.business_id == business.id)
        .order_by(Document.uploaded_at.desc(), Document.id.desc())
    ).all()
    non_rejected = [doc for doc in documents if doc.status != "rejected"]
    verified_docs = [doc for doc in documents if doc.status == "verified"]
    pending_docs = [doc for doc in documents if doc.status in {"uploaded", "extracted"}]
    results = verified_results(db, business.id)
    record_ids = {result.record_id for result in results}
    records_by_id = {
        record.id: record
        for record in db.scalars(
            select(ExtractedRecord).where(ExtractedRecord.id.in_(record_ids))
        ).all()
    } if record_ids else {}
    snapshots = snapshots_for(results, records_by_id)
    aggregate = aggregate_results(snapshots)

    missing_results = []
    for document in verified_docs:
        if document.record is not None and document.record.result is None:
            missing_results.append(
                {
                    "document_id": document.id,
                    "record_id": document.record.id,
                    "vendor": document.record.vendor,
                    "message": "This verified record is not counted yet — its emission factor is unavailable. Add a verified factor and recalculate.",
                }
            )

    factors = factor_usage(db, results)
    has_unverified_factor = any(factor["status"] == "unverified" for factor in factors)
    has_demo_factor = any(factor["status"] == "demo" for factor in factors)
    factor_notice = None
    if has_unverified_factor:
        factor_notice = (
            "One or more emission factors are still marked VERIFY_ME. Reports are blocked until they are replaced."
        )
    elif has_demo_factor:
        factor_notice = (
            "Factor values are illustrative demo values, not verified CEA/IPCC/DEFRA figures. "
            "The report will carry a DEMO watermark."
        )

    total_kg = aggregate["total_kg_co2e"]
    intensity = intensity_metrics(total_kg, business.units_produced, business.annual_revenue)
    completeness = round(len(verified_docs) / len(non_rejected) * 100, 1) if non_rejected else 0.0
    quality_mix = aggregate["quality_mix"]
    spend_count = sum(1 for result in results if result.calc_method == "spend_estimate")

    total_docs = len(documents)
    recent = documents[:6]
    from .serializers import document_dict  # local import avoids a cycle

    return {
        "business": {
            **{
                "id": business.id,
                "name": business.name,
                "industry": business.industry,
                "location": business.location,
                "reporting_period_start": business.reporting_period_start.isoformat(),
                "reporting_period_end": business.reporting_period_end.isoformat(),
                "units_produced": business.units_produced,
                "annual_revenue": business.annual_revenue,
                "is_demo": business.is_demo,
            }
        },
        "totals": {
            "kg_co2e": aggregate["total_kg_co2e"],
            "tonnes_co2e": aggregate["total_tonnes"],
            "record_count": aggregate["record_count"],
            "top_emitter": aggregate["top_emitter"],
        },
        "by_scope": aggregate["by_scope"],
        "by_category": aggregate["by_category"],
        "monthly": aggregate["monthly"],
        "quality": {
            "score": aggregate["quality_score"],
            "mix": quality_mix,
            "spend_estimates": spend_count,
            "completeness_pct": completeness,
            "verified_documents": len(verified_docs),
            "pending_documents": len(pending_docs),
            "rejected_documents": total_docs - len(non_rejected),
            "total_documents": total_docs,
        },
        "intensity": intensity,
        "factor_status": {
            "mode": "demo" if has_demo_factor else ("strict" if has_unverified_factor else "verified"),
            "factors": factors,
            "has_unverified": has_unverified_factor,
            "has_demo": has_demo_factor,
            "notice": factor_notice,
            "blocked": has_unverified_factor or bool(missing_results),
        },
        "calculation_errors": missing_results,
        "demo": business.is_demo or has_demo_factor,
        "recent_records": [document_dict(document) for document in recent],
        "pending_documents": len(pending_docs),
    }
