from __future__ import annotations

import csv
import io

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...config import settings
from ...database import utcnow
from ...models import Business, Document
from ..dashboard import business_dashboard
from ..recommendations import latest_recommendations, recommendations_response
from ..serializers import business_dict, result_dict

METHODOLOGY = [
    "Boundaries: Scope 1 (diesel, petrol, and LPG burned on site) and Scope 2 (purchased grid electricity). Scope 3 is out of scope for this report.",
    "Formula: emissions (kg CO2e) = activity data x emission factor. An emission factor is selected per activity, region, and latest available year from the factor table included in this report.",
    "Every figure is computed by a deterministic calculation engine. The extraction model never calculates emissions.",
    "Only documents marked verified, after a person reviewed the extracted values, are counted. Pending and rejected documents are listed in the audit appendix but excluded from totals.",
    "Activity data comes from user-supplied electricity bills, fuel receipts, and LPG invoices. Records with a missing quantity on a fuel bill use a spend-based estimate and are marked low data quality.",
    "Factor values and sources are shown in the factor table. CarbonLite refuses to finalize a report when a used factor is still marked VERIFY_ME.",
]

LIMITATIONS = [
    "This is a Scope 1 and Scope 2 supplier report, not a full corporate inventory. Purchased goods, transport, waste, and other Scope 3 categories are not included.",
    "Activity data is self-reported by the supplier and verified by a person against uploaded documents. It has not been independently assured by a third party.",
    "Emission factors are generic. Actual supplier-specific factors may differ. The factor year and source are stated for every calculation.",
    "Spend-based estimates are directionally useful but low quality and cannot replace measured activity data.",
    "Intensity metrics depend on production and revenue figures supplied by the business and are not audited.",
]


class ReportBlocked(Exception):
    def __init__(self, message: str, details: list[str] | None = None):
        self.message = message
        self.details = details or []
        super().__init__(message)


def _audit_rows(db: Session, business: Business) -> list[dict]:
    documents = db.scalars(
        select(Document)
        .where(Document.business_id == business.id)
        .order_by(Document.id)
    ).all()
    rows = []
    for document in documents:
        record = document.record
        result = record.result if record else None
        rows.append(
            {
                "document": {
                    "id": document.id,
                    "original_filename": document.original_filename,
                    "doc_type": document.doc_type,
                    "status": document.status,
                    "uploaded_at": document.uploaded_at.isoformat() if document.uploaded_at else None,
                    "extraction_method": document.extraction_method,
                    "is_demo": document.is_demo,
                },
                "record": {
                    "id": record.id if record else None,
                    "vendor": record.vendor if record else None,
                    "billing_period_start": record.billing_period_start.isoformat()
                    if record and record.billing_period_start
                    else None,
                    "billing_period_end": record.billing_period_end.isoformat()
                    if record and record.billing_period_end
                    else None,
                    "quantity": record.quantity if record else None,
                    "unit": record.unit if record else None,
                    "amount": record.amount if record else None,
                    "currency": record.currency if record else "INR",
                    "fuel_type": record.fuel_type if record else None,
                    "overall_confidence": record.overall_confidence if record else None,
                    "user_edited": record.user_edited if record else False,
                },
                "result": result_dict(result),
                "counted": result is not None and document.status == "verified",
            }
        )
    return rows


def build_report_payload(db: Session, business: Business) -> dict:
    dashboard = business_dashboard(db, business)
    factors = dashboard["factor_status"]["factors"]
    audit_rows = _audit_rows(db, business)
    counted_rows = [row for row in audit_rows if row["counted"]]
    pending = [row for row in audit_rows if row["document"]["status"] in {"uploaded", "extracted"}]
    rejected = [row for row in audit_rows if row["document"]["status"] == "rejected"]
    latest_recs = latest_recommendations(db, business)
    recs = recommendations_response(latest_recs)

    unverified_factors = [
        factor for factor in factors if factor["status"] == "unverified"
    ]
    missing_results = dashboard["calculation_errors"]
    problems: list[str] = []
    if unverified_factors:
        names = ", ".join(sorted({factor["activity_key"] for factor in unverified_factors}))
        problems.append(f"Unverified emission factors are used: {names}. Marked VERIFY_ME.")
    if missing_results:
        problems.append(
            f"{len(missing_results)} verified record(s) could not be calculated and are not in the total."
        )
    if not counted_rows:
        problems.append("No verified records are counted yet.")

    can_finalize = not problems
    demo = bool(dashboard["demo"] or settings.factor_mode == "demo")
    watermark = "DEMO - ILLUSTRATIVE FACTOR VALUES - NOT FOR BUYER" if demo else None
    generated_at = utcnow()
    completeness = dashboard["quality"]["completeness_pct"]

    return {
        "business": business_dict(business),
        "period": {
            "start": business.reporting_period_start.isoformat(),
            "end": business.reporting_period_end.isoformat(),
        },
        "generated_at": generated_at.isoformat() + "Z",
        "totals": dashboard["totals"],
        "by_scope": dashboard["by_scope"],
        "by_category": dashboard["by_category"],
        "monthly": dashboard["monthly"],
        "quality": dashboard["quality"],
        "intensity": dashboard["intensity"],
        "factor_status": dashboard["factor_status"],
        "factors": factors,
        "recommendations": recs,
        "audit": {
            "rows": audit_rows,
            "counted": len(counted_rows),
            "pending": len(pending),
            "rejected": len(rejected),
        },
        "completeness_pct": completeness,
        "demo": demo,
        "watermark": watermark,
        "can_finalize": can_finalize,
        "block_reason": " ".join(problems) if problems else None,
        "problems": problems,
        "methodology": METHODOLOGY,
        "limitations": LIMITATIONS,
    }


def build_csv(payload: dict) -> bytes:
    buffer = io.StringIO()
    fieldnames = [
        "business",
        "reporting_period_start",
        "reporting_period_end",
        "document_id",
        "record_id",
        "status",
        "counted",
        "vendor",
        "document_type",
        "billing_period_start",
        "billing_period_end",
        "quantity",
        "unit",
        "amount_inr",
        "scope",
        "category",
        "activity_key",
        "calculation_method",
        "kg_co2e",
        "data_quality",
        "factor_value",
        "factor_unit",
        "factor_source",
        "factor_year",
        "factor_region",
        "factor_status",
        "formula",
        "source_document",
        "is_demo",
    ]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in payload["audit"]["rows"]:
        document = row["document"]
        record = row["record"]
        result = row["result"] or {}
        factor = result.get("factor") or {}
        writer.writerow(
            {
                "business": payload["business"]["name"],
                "reporting_period_start": payload["period"]["start"],
                "reporting_period_end": payload["period"]["end"],
                "document_id": document["id"],
                "record_id": record.get("id"),
                "status": document["status"],
                "counted": row["counted"],
                "vendor": record.get("vendor"),
                "document_type": document["doc_type"],
                "billing_period_start": record.get("billing_period_start"),
                "billing_period_end": record.get("billing_period_end"),
                "quantity": record.get("quantity"),
                "unit": record.get("unit"),
                "amount_inr": record.get("amount"),
                "scope": result.get("scope"),
                "category": result.get("category"),
                "activity_key": result.get("activity_key"),
                "calculation_method": result.get("calc_method"),
                "kg_co2e": result.get("kg_co2e"),
                "data_quality": result.get("data_quality"),
                "factor_value": factor.get("value"),
                "factor_unit": factor.get("unit"),
                "factor_source": factor.get("source"),
                "factor_year": factor.get("year"),
                "factor_region": factor.get("region"),
                "factor_status": factor.get("status"),
                "formula": result.get("formula_text"),
                "source_document": document["original_filename"],
                "is_demo": document["is_demo"] or payload["demo"],
            }
        )
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")
