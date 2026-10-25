from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from ..constants import (
    CATEGORY_LABELS,
    CONFIDENCE_THRESHOLD,
    FUEL_LABELS,
    QUALITY_WEIGHTS,
    SCOPE_LABELS,
)

SCOPE_BY_CATEGORY = {
    "electricity_grid": 2,
    "diesel": 1,
    "petrol": 1,
    "lpg": 1,
}
CATEGORY_BY_FUEL = {"diesel": "diesel", "petrol": "petrol", "lpg": "lpg"}
ACTIVITY_BY_FUEL = {
    "diesel": "diesel_litre",
    "petrol": "petrol_litre",
    "lpg": "lpg_kg",
}
SPEND_ACTIVITY_BY_FUEL = {
    "diesel": "diesel_spend_inr",
    "petrol": "petrol_spend_inr",
    "lpg": "lpg_spend_inr",
}


class CalculationError(Exception):
    code = "calculation_error"

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class FactorUnavailable(CalculationError):
    code = "factor_unavailable"


class MissingActivityData(CalculationError):
    code = "missing_activity_data"


class UnitMismatch(CalculationError):
    code = "unit_mismatch"


@dataclass(frozen=True)
class FactorInfo:
    id: int | None
    activity_key: str
    unit: str
    value: float | None
    source: str
    source_version: str
    year: int
    region: str
    notes: str = ""
    status: str = "verified"


@dataclass(frozen=True)
class ActivityInput:
    doc_type: str
    fuel_type: str | None = None
    quantity: float | None = None
    unit: str | None = None
    amount: float | None = None
    currency: str | None = "INR"
    overall_confidence: float | None = None
    field_confidence: dict = field(default_factory=dict)
    user_edited: bool = False


@dataclass(frozen=True)
class CalcOutcome:
    activity_key: str
    factor: FactorInfo
    quantity_used: float
    unit_used: str
    kg_co2e: float
    scope: int
    category: str
    calc_method: str
    data_quality: str
    formula_text: str


@dataclass(frozen=True)
class ResultSnapshot:
    kg_co2e: float
    scope: int
    category: str
    data_quality: str
    month: str | None


UNIT_ALIASES = {
    "kwh": "kWh",
    "kw-h": "kWh",
    "kw h": "kWh",
    "kilowatt hour": "kWh",
    "kilowatt-hour": "kWh",
    "kilowatt hours": "kWh",
    "unit": "kWh",
    "units": "kWh",
    "litre": "litre",
    "litres": "litre",
    "liter": "litre",
    "liters": "litre",
    "l": "litre",
    "ltr": "litre",
    "ltrs": "litre",
    "kg": "kg",
    "kgs": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "inr": "INR",
    "rs": "INR",
    "rs.": "INR",
    "₹": "INR",
    "rupees": "INR",
}


def normalize_unit(raw: str | None) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    return UNIT_ALIASES.get(text.lower(), None)


def normalize_fuel(raw: str | None) -> str | None:
    if not raw:
        return None
    text = raw.strip().lower()
    return text if text in FUEL_LABELS else None


def _fmt(value: float, decimals: int = 2) -> str:
    formatted = f"{value:,.{decimals}f}"
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    return formatted


def _factor_display(value: float) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def month_key(value: date | datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m")


def month_label(key: str | None) -> str:
    if not key:
        return "Undated"
    try:
        return datetime.strptime(key, "%Y-%m").strftime("%b %Y")
    except ValueError:
        return key


def find_factor(factors: list[FactorInfo], activity_key: str, region: str = "IN") -> FactorInfo:
    matches = [factor for factor in factors if factor.activity_key == activity_key]
    if not matches:
        raise FactorUnavailable(
            f"No emission factor is configured for '{activity_key}'. Add a verified row to factors.csv."
        )
    local = [factor for factor in matches if factor.region.upper() == region.upper()]
    fallback = [factor for factor in matches if factor.region.upper() == "ALL"]
    candidates = local or fallback or matches
    factor = max(candidates, key=lambda item: (item.year, item.region.upper() == region.upper()))
    if factor.value is None or factor.status == "unverified":
        raise FactorUnavailable(
            f"The emission factor for '{activity_key}' is still marked VERIFY_ME. "
            "Reports are blocked until a verified value is loaded."
        )
    return factor


def _resolve_line(activity: ActivityInput) -> tuple[str, str, int, str, str, float, str]:
    """Return activity_key, unit_used, scope, category, method, quantity_used, display_unit."""

    if activity.doc_type == "electricity_bill":
        if activity.quantity is None:
            raise MissingActivityData(
                "Electricity needs a quantity in kWh. Enter the units consumed from the bill."
            )
        unit = normalize_unit(activity.unit) or "kWh"
        if unit != "kWh":
            raise UnitMismatch("Electricity must be entered in kWh (or 'units').")
        if activity.quantity <= 0:
            raise MissingActivityData("Electricity units must be greater than zero.")
        return "electricity_grid_in", "kWh", 2, "electricity_grid", "activity", float(activity.quantity), "kWh"

    if activity.doc_type not in {"fuel_receipt", "lpg_invoice"}:
        raise MissingActivityData("Choose whether this is an electricity bill, fuel receipt, or LPG invoice.")

    fuel = normalize_fuel(activity.fuel_type)
    if activity.doc_type == "lpg_invoice":
        fuel = "lpg"
    if fuel is None:
        raise MissingActivityData("Select the fuel type (diesel, petrol, or LPG).")
    if activity.doc_type == "fuel_receipt" and fuel == "lpg":
        raise MissingActivityData("LPG belongs on an LPG invoice. Change the document type to LPG invoice.")

    expected_unit = "kg" if fuel == "lpg" else "litre"
    category = CATEGORY_BY_FUEL[fuel]
    scope = SCOPE_BY_CATEGORY[category]

    if activity.quantity is not None:
        unit = normalize_unit(activity.unit) or expected_unit
        if unit != expected_unit:
            raise UnitMismatch(
                f"{FUEL_LABELS[fuel]} must be entered in {expected_unit}s. "
                f"The receipt says {activity.unit or 'no unit'}."
            )
        if activity.quantity <= 0:
            raise MissingActivityData("Quantity must be greater than zero.")
        return ACTIVITY_BY_FUEL[fuel], expected_unit, scope, category, "activity", float(activity.quantity), expected_unit

    currency = (activity.currency or "INR").upper()
    if activity.amount is not None and activity.amount > 0 and currency == "INR":
        return (
            SPEND_ACTIVITY_BY_FUEL[fuel],
            "INR",
            scope,
            category,
            "spend_estimate",
            float(activity.amount),
            "INR",
        )
    raise MissingActivityData(
        "Quantity is missing. Enter it from the receipt, or add the amount so a flagged spend-based estimate can be used."
    )


def _quality(activity: ActivityInput, calc_method: str) -> str:
    if calc_method == "spend_estimate":
        return "low"
    critical = ("vendor", "billing_period_start", "billing_period_end", "quantity")
    confidence = activity.field_confidence or {}
    has_low_field = any(
        key in confidence and confidence[key] is not None and confidence[key] < CONFIDENCE_THRESHOLD
        for key in critical
    )
    if has_low_field:
        return "medium"
    if activity.overall_confidence is not None and activity.overall_confidence >= 0.85:
        return "high"
    if activity.overall_confidence is None and not activity.user_edited:
        return "medium"
    return "medium"


def calculate_emission(activity: ActivityInput, factors: list[FactorInfo], region: str = "IN") -> CalcOutcome:
    activity_key, unit_used, scope, category, calc_method, quantity_used, display_unit = _resolve_line(activity)
    factor = find_factor(factors, activity_key, region=region)
    if normalize_unit(factor.unit) != normalize_unit(unit_used):
        raise FactorUnavailable(
            f"Factor unit '{factor.unit}' does not match activity unit '{unit_used}'. Fix factors.csv."
        )
    kg_co2e = quantity_used * float(factor.value)
    quality = _quality(activity, calc_method)
    quantity_text = _fmt(quantity_used, 2 if calc_method == "spend_estimate" else 3)
    unit_text = "INR" if unit_used == "INR" else display_unit
    formula = (
        f"{quantity_text} {unit_text} × {_factor_display(float(factor.value))} kg CO2e/{factor.unit} "
        f"({factor.source}, {factor.year}) = {kg_co2e:,.3f} kg CO2e"
    )
    if calc_method == "spend_estimate":
        formula += " — spend-based estimate (low data quality)"
    return CalcOutcome(
        activity_key=activity_key,
        factor=factor,
        quantity_used=quantity_used,
        unit_used=unit_used,
        kg_co2e=round(kg_co2e, 6),
        scope=scope,
        category=category,
        calc_method=calc_method,
        data_quality=quality,
        formula_text=formula,
    )


def aggregate_results(snapshots: list[ResultSnapshot]) -> dict:
    total = sum(item.kg_co2e for item in snapshots)
    by_scope_map: dict[int, float] = {}
    by_category_map: dict[str, float] = {}
    monthly_map: dict[str, float] = {}
    quality_mix = {"high": 0, "medium": 0, "low": 0}

    for item in snapshots:
        by_scope_map[item.scope] = by_scope_map.get(item.scope, 0.0) + item.kg_co2e
        by_category_map[item.category] = by_category_map.get(item.category, 0.0) + item.kg_co2e
        month = item.month or "undated"
        monthly_map[month] = monthly_map.get(month, 0.0) + item.kg_co2e
        if item.data_quality in quality_mix:
            quality_mix[item.data_quality] += 1

    def share(value: float) -> float:
        return round((value / total) * 100, 1) if total else 0.0

    by_scope = [
        {
            "scope": scope,
            "label": SCOPE_LABELS.get(scope, f"Scope {scope}"),
            "kg_co2e": round(value, 3),
            "share": share(value),
        }
        for scope, value in sorted(by_scope_map.items())
    ]
    by_category = [
        {
            "category": category,
            "label": CATEGORY_LABELS.get(category, category),
            "scope": SCOPE_BY_CATEGORY.get(category, 0),
            "kg_co2e": round(value, 3),
            "share": share(value),
        }
        for category, value in sorted(by_category_map.items(), key=lambda pair: pair[1], reverse=True)
    ]
    monthly = [
        {"month": month, "label": month_label(None if month == "undated" else month), "kg_co2e": round(value, 3)}
        for month, value in sorted(monthly_map.items())
    ]
    top = None
    if by_category and total:
        first = by_category[0]
        top = {
            "category": first["category"],
            "label": first["label"],
            "kg_co2e": first["kg_co2e"],
            "share": first["share"],
        }
    weighted = sum(QUALITY_WEIGHTS.get(s.data_quality, 0.3) for s in snapshots)
    quality_score = round((weighted / len(snapshots)) * 100) if snapshots else 0
    return {
        "total_kg_co2e": round(total, 3),
        "total_tonnes": round(total / 1000, 3),
        "by_scope": by_scope,
        "by_category": by_category,
        "monthly": monthly,
        "top_emitter": top,
        "quality_mix": quality_mix,
        "quality_score": quality_score,
        "record_count": len(snapshots),
    }


def intensity_metrics(
    total_kg: float, units_produced: float | None, annual_revenue: float | None
) -> dict:
    per_unit = round(total_kg / units_produced, 4) if units_produced and units_produced > 0 else None
    per_revenue = round(total_kg / annual_revenue, 6) if annual_revenue and annual_revenue > 0 else None
    return {
        "units_produced": units_produced,
        "annual_revenue": annual_revenue,
        "kg_co2e_per_unit": per_unit,
        "kg_co2e_per_rupee": per_revenue,
    }
