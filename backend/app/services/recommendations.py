from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..constants import CATEGORY_LABELS
from ..database import utcnow
from ..models import Business, Document, EmissionResult, ExtractedRecord, RecommendationSet
from .audit import log_audit
from .dashboard import business_dashboard
from .extraction.llm import LLMClient, LLMError, parse_json_object
from .extraction.prompts import RECOMMENDATION_SYSTEM_PROMPT

logger = logging.getLogger("carbonlite.recommendations")


class NoVerifiedData(Exception):
    pass


class RecommendationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=3, max_length=180)
    action: str = ""
    why: str = ""
    category: str = "general"
    est_tonnes_saved: float | None = None
    est_rs_saved: float | None = None
    assumptions: list[str] = Field(default_factory=list)
    effort: Literal["low", "medium", "high"] = "medium"


class RecommendationPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    summary: str = ""
    items: list[RecommendationItem] = Field(min_length=3, max_length=5)


def _spend_by_category(db: Session, business: Business) -> dict[str, float]:
    rows = db.execute(
        select(EmissionResult.category, ExtractedRecord.amount)
        .join(ExtractedRecord, EmissionResult.record_id == ExtractedRecord.id)
        .join(Document, ExtractedRecord.document_id == Document.id)
        .where(Document.business_id == business.id, Document.status == "verified")
    ).all()
    spend: dict[str, float] = {}
    for category, amount in rows:
        if amount and amount > 0:
            spend[category] = spend.get(category, 0.0) + float(amount)
    return spend


def _basis(db: Session, business: Business) -> tuple[dict, dict]:
    dashboard = business_dashboard(db, business)
    spend = _spend_by_category(db, business)
    categories = []
    for row in dashboard["by_category"]:
        categories.append(
            {
                "category": row["category"],
                "label": row["label"],
                "kg_co2e": row["kg_co2e"],
                "tonnes_co2e": round(row["kg_co2e"] / 1000, 4),
                "share": row["share"],
                "spend_inr": round(spend.get(row["category"], 0.0), 2) or None,
            }
        )
    basis = {
        "business": business.name,
        "industry": business.industry,
        "location": business.location,
        "reporting_period": {
            "start": business.reporting_period_start.isoformat(),
            "end": business.reporting_period_end.isoformat(),
        },
        "total_tonnes_co2e": dashboard["totals"]["tonnes_co2e"],
        "categories": categories,
        "quality_score": dashboard["quality"]["score"],
        "completeness_pct": dashboard["quality"]["completeness_pct"],
        "monthly": dashboard["monthly"],
    }
    return dashboard, basis


def _category_grounding(categories: list[dict]) -> dict[str, dict]:
    return {row["category"]: row for row in categories}


def heuristic_recommendations(business: Business, basis: dict) -> list[dict]:
    categories = _category_grounding(basis["categories"])
    total_kg = basis["total_tonnes_co2e"] * 1000
    items: list[dict] = []

    def add(
        title: str,
        action: str,
        category: str,
        fraction: float,
        assumptions: list[str],
        effort: str,
    ) -> None:
        row = categories.get(category)
        if not row or not row["kg_co2e"]:
            return
        saved_kg = row["kg_co2e"] * fraction
        spend = row.get("spend_inr")
        items.append(
            {
                "title": title,
                "action": action,
                "why": (
                    f"{row['label']} is {row['share']:.0f}% of your counted footprint "
                    f"({row['tonnes_co2e']:.2f} t CO2e)."
                ),
                "category": category,
                "est_tonnes_saved": round(saved_kg / 1000, 3),
                "est_rs_saved": round(spend * fraction) if spend else None,
                "assumptions": assumptions,
                "effort": effort,
                "estimate": True,
            }
        )

    add(
        "Shift part of your grid power to rooftop solar",
        "Get a rooftop solar quote sized to the share of daytime load you can move. Start with a small rooftop system and measure the units it offsets.",
        "electricity_grid",
        0.20,
        [
            "20% of your counted grid electricity is replaced by solar.",
            "Savings use the same grid emission factor shown in your audit.",
            "Rupee savings use the verified electricity bill amounts on file (if present).",
        ],
        "high",
    )
    add(
        "Run an energy audit and switch off idle loads",
        "Book a simple walk-through energy audit. Fix compressed-air leaks, idle motors, and lighting left on between shifts.",
        "electricity_grid",
        0.08,
        [
            "8% reduction in counted electricity use from low-cost efficiency fixes.",
            "Emissions saved are 8% of your counted electricity emissions.",
            "Rupee savings use available electricity bills; actual tariffs may vary.",
        ],
        "medium",
    )
    add(
        "Cut diesel idling with better scheduling",
        "Plan machine runs and deliveries so engines are not left idling. Check tyre pressure and service air filters on schedule.",
        "diesel",
        0.10,
        [
            "10% reduction in counted diesel use from reduced idling and better maintenance.",
            "Emissions saved are 10% of your counted diesel emissions.",
            "Rupee savings use the diesel amounts on your verified receipts (if present).",
        ],
        "low",
    )
    add(
        "Combine trips and keep vehicles serviced",
        "Group local trips, avoid peak-hour idling, and keep tyres at the recommended pressure.",
        "petrol",
        0.08,
        [
            "8% reduction in counted petrol use from trip combining and maintenance.",
            "Emissions saved are 8% of your counted petrol emissions.",
        ],
        "low",
    )
    add(
        "Recover heat and insulate LPG ovens",
        "Insulate hot surfaces and recover waste heat from LPG-fired processes where it is safe to do so.",
        "lpg",
        0.08,
        [
            "8% reduction in counted LPG use from insulation and heat recovery.",
            "Emissions saved are 8% of your counted LPG emissions.",
        ],
        "medium",
    )

    if len(items) < 3:
        items.append(
            {
                "title": "Read one meter or receipt every month",
                "action": "Save one electricity bill, fuel receipt, and LPG invoice each month so next quarter's footprint is complete.",
                "why": "Regular records make your numbers easier for a buyer to trust.",
                "category": "general",
                "est_tonnes_saved": round(total_kg * 0.03 / 1000, 3) if total_kg else 0.0,
                "est_rs_saved": None,
                "assumptions": [
                    "Illustrative 3% saving from tighter monitoring and avoided waste.",
                    "This is a monitoring action, not an engineering estimate.",
                ],
                "effort": "low",
                "estimate": True,
            }
        )
    if len(items) > 5:
        items = items[:5]
    return items


def _sanitise_llm_payload(
    data: dict, total_tonnes: float, categories: list[dict]
) -> dict | None:
    try:
        payload = RecommendationPayload.model_validate(data)
    except ValidationError as exc:
        logger.warning("LLM recommendations failed schema validation: %s", exc)
        return None
    valid_categories = {row["category"] for row in categories} | {"general"}
    items = []
    for item in payload.items[:5]:
        tonnes = item.est_tonnes_saved
        if tonnes is not None:
            if tonnes <= 0:
                tonnes = None
            else:
                tonnes = min(round(tonnes, 3), round(max(total_tonnes, 0.001) * 1.25, 3))
        rupees = item.est_rs_saved
        if rupees is not None:
            rupees = max(0, round(rupees))
        items.append(
            {
                **item.model_dump(),
                "category": item.category if item.category in valid_categories else "general",
                "est_tonnes_saved": tonnes,
                "est_rs_saved": rupees,
                "estimate": True,
            }
        )
    if len(items) < 3:
        return None
    return {"summary": payload.summary, "items": items}


def generate_recommendations(db: Session, business: Business) -> dict:
    dashboard, basis = _basis(db, business)
    if not dashboard["totals"]["record_count"]:
        raise NoVerifiedData(
            "Verify at least one bill before asking for recommendations. CarbonLite only advises on counted data."
        )
    method = "heuristic"
    notice = None
    items = None
    summary = ""
    provider = None
    llm = LLMClient(settings) if settings.llm_configured else None
    if llm:
        user_prompt = (
            "Here is the verified footprint data. Suggest 3 to 5 actions. "
            "Use only these numbers and do not recalculate emissions.\n\n"
            + json.dumps(basis, indent=2)
        )
        try:
            raw = llm.recommend(RECOMMENDATION_SYSTEM_PROMPT, user_prompt)
            data = parse_json_object(raw)
            cleaned = _sanitise_llm_payload(data, basis["total_tonnes_co2e"], basis["categories"])
            if cleaned:
                items = cleaned["items"]
                summary = cleaned["summary"]
                method = "llm"
                provider = settings.llm_text_model
            else:
                notice = "The AI response could not be verified, so CarbonLite used its grounded estimator."
        except (LLMError, ValueError) as exc:
            logger.warning("Recommendation LLM failed: %s", exc)
            notice = "The AI service was unavailable, so CarbonLite used its grounded estimator."
    else:
        notice = "No LLM key is configured, so these are grounded estimates computed from your data."

    if items is None:
        items = heuristic_recommendations(business, basis)
        summary = summary or (
            f"Your counted footprint for {business.reporting_period_start.strftime('%b %Y')}–"
            f"{business.reporting_period_end.strftime('%b %Y')} is "
            f"{basis['total_tonnes_co2e']:.2f} t CO2e. These actions target the biggest categories first."
        )

    disclaimer = (
        "Savings are indicative estimates, not an engineering study. Each action shows the assumption used. "
        "Verify costs and savings locally before spending money."
    )
    payload = {
        "summary": summary,
        "items": items,
        "disclaimer": disclaimer,
        "basis": basis,
    }
    entry = RecommendationSet(
        business_id=business.id,
        method=method,
        payload=payload,
        generated_at=utcnow(),
    )
    db.add(entry)
    log_audit(
        db,
        "business",
        business.id,
        "recommendations.generated",
        new_value={"method": method, "items": len(items)},
    )
    db.commit()
    return {
        "id": entry.id,
        "method": method,
        "method_label": (
            f"AI-generated, grounded in your data ({provider})"
            if method == "llm"
            else "Grounded estimates from your data (no AI key needed)"
        ),
        "generated_at": entry.generated_at.isoformat() + "Z",
        "notice": notice,
        "summary": summary,
        "items": items,
        "disclaimer": disclaimer,
        "basis": basis,
    }


def latest_recommendations(db: Session, business: Business) -> RecommendationSet | None:
    return db.scalar(
        select(RecommendationSet)
        .where(RecommendationSet.business_id == business.id)
        .order_by(RecommendationSet.generated_at.desc(), RecommendationSet.id.desc())
        .limit(1)
    )


def recommendations_response(entry: RecommendationSet | None) -> dict | None:
    if entry is None:
        return None
    payload = entry.payload or {}
    return {
        "id": entry.id,
        "method": entry.method,
        "method_label": (
            "AI-generated, grounded in your data" if entry.method == "llm" else "Grounded estimates from your data (no AI key needed)"
        ),
        "generated_at": entry.generated_at.isoformat() + "Z",
        "notice": None,
        "summary": payload.get("summary", ""),
        "items": payload.get("items", []),
        "disclaimer": payload.get("disclaimer", ""),
        "basis": payload.get("basis", {}),
    }
