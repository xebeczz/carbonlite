from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..models import Business, Buyer, SupplierLink
from .dashboard import business_dashboard
from .serializers import buyer_dict, business_dict


def list_buyers(db: Session) -> list[Buyer]:
    return list(db.scalars(select(Buyer).order_by(Buyer.name)).all())


def _supplier_summary(db: Session, link: SupplierLink) -> dict:
    business = link.business
    dashboard = business_dashboard(db, business)
    scope_map = {row["scope"]: row for row in dashboard["by_scope"]}
    return {
        "business": business_dict(business),
        "link_status": link.status,
        "total_tonnes": dashboard["totals"]["tonnes_co2e"],
        "by_scope": dashboard["by_scope"],
        "scope_1_kg": scope_map.get(1, {}).get("kg_co2e", 0.0),
        "scope_2_kg": scope_map.get(2, {}).get("kg_co2e", 0.0),
        "top_emitter": dashboard["totals"]["top_emitter"],
        "quality_score": dashboard["quality"]["score"],
        "completeness_pct": dashboard["quality"]["completeness_pct"],
        "verified_documents": dashboard["quality"]["verified_documents"],
        "pending_documents": dashboard["quality"]["pending_documents"],
        "total_documents": dashboard["quality"]["total_documents"],
        "factor_notice": dashboard["factor_status"]["notice"],
        "blocked": dashboard["factor_status"]["blocked"],
        "is_demo": business.is_demo or dashboard["demo"],
        "period": {
            "start": business.reporting_period_start.isoformat(),
            "end": business.reporting_period_end.isoformat(),
        },
    }


def buyer_overview(db: Session, buyer: Buyer) -> dict:
    links = db.scalars(
        select(SupplierLink)
        .where(SupplierLink.buyer_id == buyer.id)
        .options(joinedload(SupplierLink.business))
        .order_by(SupplierLink.id)
    ).all()
    suppliers = [_supplier_summary(db, link) for link in links]
    total_tonnes = sum(row["total_tonnes"] for row in suppliers)
    completeness_values = [row["completeness_pct"] for row in suppliers]
    quality_values = [row["quality_score"] for row in suppliers]
    return {
        "buyer": buyer_dict(buyer),
        "suppliers": suppliers,
        "totals": {
            "supplier_count": len(suppliers),
            "total_tonnes": round(total_tonnes, 3),
            "scope_1_kg": round(sum(row["scope_1_kg"] for row in suppliers), 3),
            "scope_2_kg": round(sum(row["scope_2_kg"] for row in suppliers), 3),
            "average_completeness": round(sum(completeness_values) / len(completeness_values), 1)
            if completeness_values
            else 0.0,
            "average_quality": round(sum(quality_values) / len(quality_values))
            if quality_values
            else 0,
            "verified_documents": sum(row["verified_documents"] for row in suppliers),
            "pending_documents": sum(row["pending_documents"] for row in suppliers),
        },
    }


BUYER_DASHBOARD_FIELDS = (
    "business",
    "totals",
    "by_scope",
    "by_category",
    "monthly",
    "quality",
    "intensity",
    "factor_status",
    "demo",
    "pending_documents",
)


def buyer_supplier_detail(db: Session, buyer: Buyer, business: Business) -> dict:
    link = db.scalar(
        select(SupplierLink).where(
            SupplierLink.buyer_id == buyer.id, SupplierLink.business_id == business.id
        )
    )
    if link is None:
        return {}
    dashboard = business_dashboard(db, business)
    # Buyers only receive aggregates; documents and field-level values stay with the supplier.
    public_dashboard = {field: dashboard[field] for field in BUYER_DASHBOARD_FIELDS}
    return {
        "buyer": buyer_dict(buyer),
        "link_status": link.status,
        "dashboard": public_dashboard,
    }
