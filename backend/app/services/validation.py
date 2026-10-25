from __future__ import annotations

from datetime import date
from typing import Any, Sequence

from ..constants import CONFIDENCE_THRESHOLD, EXPECTED_UNITS, SANITY_RANGES
from .calculation import normalize_fuel, normalize_unit

SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"


def _issue(code: str, severity: str, field: str | None, message: str) -> dict:
    return {"code": code, "severity": severity, "field": field, "message": message}


def _lower(value: str | None) -> str:
    return (value or "").strip().lower()


def validate_record(
    record: Any,
    business: Any,
    doc_type: str,
    siblings: Sequence[Any] = (),
    today: date | None = None,
) -> list[dict]:
    """Deterministic checks. Errors block counting; warnings ask for review."""
    today = today or date.today()
    issues: list[dict] = []
    quantity = getattr(record, "quantity", None)
    unit = getattr(record, "unit", None)
    amount = getattr(record, "amount", None)
    currency = (getattr(record, "currency", None) or "INR").upper()
    fuel_type = normalize_fuel(getattr(record, "fuel_type", None))
    vendor = (getattr(record, "vendor", None) or "").strip()
    start = getattr(record, "billing_period_start", None)
    end = getattr(record, "billing_period_end", None)
    confidence = getattr(record, "field_confidence", None) or {}
    overall = getattr(record, "overall_confidence", None)

    if doc_type not in EXPECTED_UNITS:
        issues.append(
            _issue(
                "unknown_doc_type",
                SEVERITY_ERROR,
                "doc_type",
                "Choose whether this is an electricity bill, fuel receipt, or LPG invoice.",
            )
        )

    if len(vendor) < 2:
        issues.append(
            _issue("missing_vendor", SEVERITY_WARNING, "vendor", "Add the vendor name so the record can be audited.")
        )

    if not start or not end:
        issues.append(
            _issue(
                "missing_period",
                SEVERITY_ERROR,
                "billing_period_start",
                "Both billing period dates are needed to place this record on the monthly timeline.",
            )
        )
    else:
        if start > end:
            issues.append(
                _issue(
                    "period_reversed",
                    SEVERITY_ERROR,
                    "billing_period_start",
                    "The billing period start is after the end date.",
                )
            )
        if end > today:
            issues.append(
                _issue(
                    "period_future",
                    SEVERITY_WARNING,
                    "billing_period_end",
                    "This billing period ends in the future. Check the dates.",
                )
            )
        business_start = getattr(business, "reporting_period_start", None)
        business_end = getattr(business, "reporting_period_end", None)
        if business_start and start < business_start:
            issues.append(
                _issue(
                    "period_outside",
                    SEVERITY_WARNING,
                    "billing_period_start",
                    "This bill starts before the reporting period. It will still count, but mention it in your notes.",
                )
            )
        if business_end and end > business_end:
            issues.append(
                _issue(
                    "period_outside",
                    SEVERITY_WARNING,
                    "billing_period_end",
                    "This bill ends after the reporting period. It will still count, but mention it in your notes.",
                )
            )

    expected_unit = EXPECTED_UNITS.get(doc_type)
    normalized_unit = normalize_unit(unit) if unit else None

    if doc_type == "fuel_receipt":
        if not fuel_type:
            issues.append(
                _issue(
                    "missing_fuel_type",
                    SEVERITY_ERROR,
                    "fuel_type",
                    "Select diesel or petrol for this receipt.",
                )
            )
        elif fuel_type == "lpg":
            issues.append(
                _issue(
                    "fuel_type_mismatch",
                    SEVERITY_ERROR,
                    "fuel_type",
                    "LPG should be recorded as an LPG invoice, not a fuel receipt.",
                )
            )
    if doc_type == "electricity_bill" and fuel_type:
        issues.append(
            _issue(
                "unexpected_fuel_type",
                SEVERITY_WARNING,
                "fuel_type",
                "Electricity bills do not need a fuel type. It will be ignored.",
            )
        )

    if quantity is None:
        if doc_type in {"fuel_receipt", "lpg_invoice"} and amount and amount > 0 and currency == "INR":
            issues.append(
                _issue(
                    "spend_fallback",
                    SEVERITY_WARNING,
                    "quantity",
                    "Quantity is missing. A spend-based estimate will be used and marked low data quality.",
                )
            )
        else:
            issues.append(
                _issue(
                    "missing_quantity",
                    SEVERITY_ERROR,
                    "quantity",
                    "Enter the quantity from the document. Electricity: kWh, fuel: litres, LPG: kg.",
                )
            )
    else:
        if quantity <= 0:
            issues.append(
                _issue("quantity_nonpositive", SEVERITY_ERROR, "quantity", "Quantity must be greater than zero.")
            )
        if unit:
            if normalized_unit is None:
                issues.append(
                    _issue(
                        "unsupported_unit",
                        SEVERITY_ERROR,
                        "unit",
                        f"'{unit}' is not a supported unit. Use kWh, litre, or kg.",
                    )
                )
            elif expected_unit and normalized_unit != expected_unit:
                issues.append(
                    _issue(
                        "unit_mismatch",
                        SEVERITY_ERROR,
                        "unit",
                        f"{expected_unit} is required here, but the record says {unit}.",
                    )
                )
        else:
            issues.append(
                _issue(
                    "missing_unit",
                    SEVERITY_WARNING,
                    "unit",
                    f"Unit is missing. It will be treated as {expected_unit or 'the expected unit'}.",
                )
            )

        category_key = (
            "electricity"
            if doc_type == "electricity_bill"
            else ("lpg" if doc_type == "lpg_invoice" else fuel_type)
        )
        sanity = SANITY_RANGES.get(category_key or "")
        if sanity and not (sanity["min"] <= quantity <= sanity["max"]):
            issues.append(
                _issue(
                    "quantity_out_of_range",
                    SEVERITY_WARNING,
                    "quantity",
                    f"{quantity:,.2f} is outside the usual range for {sanity['label']} "
                    f"({sanity['min']:,}–{sanity['max']:,} {sanity['unit']}). Double-check the reading.",
                )
            )

    if amount is None:
        issues.append(
            _issue(
                "missing_amount",
                SEVERITY_WARNING,
                "amount",
                "The amount is missing. The audit trail will be weaker; add it if it is on the document.",
            )
        )
    elif amount <= 0:
        issues.append(_issue("amount_nonpositive", SEVERITY_WARNING, "amount", "Amount should be greater than zero."))

    if currency != "INR":
        issues.append(
            _issue(
                "currency_mismatch",
                SEVERITY_WARNING,
                "currency",
                f"Spend-based estimates are only supported in INR; this record says {currency}.",
            )
        )

    if overall is not None and overall < CONFIDENCE_THRESHOLD:
        issues.append(
            _issue(
                "low_overall_confidence",
                SEVERITY_WARNING,
                None,
                f"The reader was only {overall * 100:.0f}% confident overall. Check every highlighted field.",
            )
        )

    key_fields = ["vendor", "billing_period_start", "billing_period_end", "quantity", "amount"]
    for field in key_fields:
        value = confidence.get(field)
        if value is not None and value < CONFIDENCE_THRESHOLD:
            issues.append(
                _issue(
                    "low_confidence",
                    SEVERITY_WARNING,
                    field,
                    f"{field.replace('_', ' ').title()} was read with {value * 100:.0f}% confidence. Confirm it.",
                )
            )

    dup_start = start
    dup_end = end
    for sibling in siblings:
        sibling_id = getattr(sibling, "id", None)
        if sibling_id is not None and sibling_id == getattr(record, "id", -1):
            continue
        if not dup_start or not dup_end:
            break
        sibling_vendor = _lower(getattr(sibling, "vendor", None))
        if not vendor or sibling_vendor != _lower(vendor):
            continue
        sibling_start = getattr(sibling, "billing_period_start", None)
        sibling_end = getattr(sibling, "billing_period_end", None)
        if sibling_start != dup_start or sibling_end != dup_end:
            continue
        sibling_quantity = getattr(sibling, "quantity", None)
        if quantity is None or sibling_quantity is None:
            continue
        tolerance = max(0.02, abs(quantity) * 0.005)
        if abs(quantity - sibling_quantity) <= tolerance:
            issues.append(
                _issue(
                    "potential_duplicate",
                    SEVERITY_WARNING,
                    None,
                    f"Looks like a duplicate of record #{sibling_id} (same vendor, period, and quantity).",
                )
            )
            break

    return issues


def has_blocking_errors(issues: Sequence[dict]) -> bool:
    return any(issue["severity"] == SEVERITY_ERROR for issue in issues)


def low_confidence_fields(record: Any) -> list[str]:
    confidence = getattr(record, "field_confidence", None) or {}
    return sorted(
        field
        for field, value in confidence.items()
        if value is not None and value < CONFIDENCE_THRESHOLD
    )
