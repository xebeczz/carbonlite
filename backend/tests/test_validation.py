from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.services.validation import has_blocking_errors, low_confidence_fields, validate_record

BUSINESS = SimpleNamespace(
    reporting_period_start=date(2026, 1, 1),
    reporting_period_end=date(2026, 6, 30),
)


def record(**overrides):
    base = dict(
        id=1,
        vendor="TANGEDCO",
        billing_period_start=date(2026, 5, 1),
        billing_period_end=date(2026, 5, 31),
        quantity=1250,
        unit="kWh",
        amount=9375,
        currency="INR",
        fuel_type=None,
        field_confidence={"quantity": 0.9, "vendor": 0.92},
        overall_confidence=0.9,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def codes(issues):
    return {issue["code"] for issue in issues}


def test_valid_electricity_record_has_no_blocking_errors():
    issues = validate_record(
        record(), BUSINESS, "electricity_bill", today=date(2026, 7, 1)
    )
    assert not has_blocking_errors(issues)
    assert "missing_quantity" not in codes(issues)


def test_missing_quantity_is_a_blocking_error():
    issues = validate_record(
        record(quantity=None), BUSINESS, "electricity_bill", today=date(2026, 7, 1)
    )
    assert "missing_quantity" in codes(issues)
    assert has_blocking_errors(issues)


def test_missing_fuel_quantity_with_amount_is_spend_fallback_warning():
    issues = validate_record(
        record(quantity=None, unit=None, fuel_type="diesel", amount=22680),
        BUSINESS,
        "fuel_receipt",
        today=date(2026, 7, 1),
    )
    assert "spend_fallback" in codes(issues)
    assert not has_blocking_errors(issues)


def test_unit_mismatch_blocks_verification():
    issues = validate_record(
        record(quantity=240, unit="kg"), BUSINESS, "fuel_receipt", today=date(2026, 7, 1)
    )
    assert "unit_mismatch" in codes(issues)
    assert has_blocking_errors(issues)


def test_missing_fuel_type_blocks_verification():
    issues = validate_record(
        record(quantity=240, unit="litre", fuel_type=None),
        BUSINESS,
        "fuel_receipt",
        today=date(2026, 7, 1),
    )
    assert "missing_fuel_type" in codes(issues)
    assert has_blocking_errors(issues)


def test_quantity_sanity_range_is_only_a_warning():
    issues = validate_record(
        record(quantity=999_999), BUSINESS, "electricity_bill", today=date(2026, 7, 1)
    )
    assert "quantity_out_of_range" in codes(issues)
    assert not has_blocking_errors(issues)
    assert next(i for i in issues if i["code"] == "quantity_out_of_range")["severity"] == "warning"


def test_reversed_and_out_of_period_dates():
    reversed_issues = validate_record(
        record(billing_period_start=date(2026, 5, 31), billing_period_end=date(2026, 5, 1)),
        BUSINESS,
        "electricity_bill",
        today=date(2026, 7, 1),
    )
    assert "period_reversed" in codes(reversed_issues)
    outside = validate_record(
        record(billing_period_start=date(2025, 12, 1), billing_period_end=date(2025, 12, 31)),
        BUSINESS,
        "electricity_bill",
        today=date(2026, 7, 1),
    )
    assert "period_outside" in codes(outside)
    assert not has_blocking_errors(outside)


def test_low_confidence_fields_are_flagged():
    issues = validate_record(
        record(overall_confidence=0.6, field_confidence={"quantity": 0.5, "vendor": 0.9}),
        BUSINESS,
        "electricity_bill",
        today=date(2026, 7, 1),
    )
    assert "low_overall_confidence" in codes(issues)
    low = [i for i in issues if i["code"] == "low_confidence"]
    assert len(low) == 1
    assert low[0]["field"] == "quantity"
    assert low_confidence_fields(record(field_confidence={"quantity": 0.5, "amount": 0.9})) == [
        "quantity"
    ]


def test_duplicate_vendor_period_quantity_is_flagged():
    sibling = record(id=2)
    issues = validate_record(
        record(), BUSINESS, "electricity_bill", siblings=[sibling], today=date(2026, 7, 1)
    )
    assert "potential_duplicate" in codes(issues)
    assert not has_blocking_errors(issues)


def test_same_period_different_quantity_is_not_duplicate():
    sibling = record(id=2, quantity=999)
    issues = validate_record(
        record(), BUSINESS, "electricity_bill", siblings=[sibling], today=date(2026, 7, 1)
    )
    assert "potential_duplicate" not in codes(issues)


def test_unknown_document_type_blocks():
    issues = validate_record(record(), BUSINESS, "unknown", today=date(2026, 7, 1))
    assert "unknown_doc_type" in codes(issues)
    assert has_blocking_errors(issues)
