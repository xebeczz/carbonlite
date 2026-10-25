from __future__ import annotations

from datetime import datetime

import pytest

from app.services.calculation import (
    ActivityInput,
    CalculationError,
    FactorInfo,
    FactorUnavailable,
    MissingActivityData,
    ResultSnapshot,
    UnitMismatch,
    aggregate_results,
    calculate_emission,
    find_factor,
    intensity_metrics,
    month_key,
    normalize_unit,
)


def factor(
    key: str = "electricity_grid_in",
    value: float | None = 0.71,
    unit: str = "kWh",
    year: int = 2026,
    region: str = "IN",
    status: str = "demo",
) -> FactorInfo:
    return FactorInfo(
        id=1,
        activity_key=key,
        unit=unit,
        value=value,
        source="Illustrative demo assumption",
        source_version="demo-v1",
        year=year,
        region=region,
        status=status,
    )


FACTORS = [
    factor("electricity_grid_in", 0.71, "kWh", 2026),
    factor("electricity_grid_in", 0.68, "kWh", 2025),
    factor("diesel_litre", 2.68, "litre", 2026),
    factor("petrol_litre", 2.31, "litre", 2026),
    factor("lpg_kg", 2.98, "kg", 2026),
    factor("diesel_spend_inr", 0.028, "INR", 2026),
    factor("lpg_spend_inr", 0.0199, "INR", 2026),
]


def test_normalize_unit_aliases():
    assert normalize_unit("kwh") == "kWh"
    assert normalize_unit("Units") == "kWh"
    assert normalize_unit("Litres") == "litre"
    assert normalize_unit("L") == "litre"
    assert normalize_unit("kg") == "kg"
    assert normalize_unit("cubic metres") is None


def test_electricity_calculation_scope_2_and_formula():
    result = calculate_emission(
        ActivityInput(
            doc_type="electricity_bill",
            quantity=1250,
            unit="units",
            overall_confidence=0.92,
        ),
        FACTORS,
    )
    assert result.kg_co2e == pytest.approx(887.5)
    assert result.scope == 2
    assert result.category == "electricity_grid"
    assert result.calc_method == "activity"
    assert result.data_quality == "high"
    assert "1,250 kWh" in result.formula_text
    assert "0.71 kg CO2e/kWh" in result.formula_text
    assert "2026" in result.formula_text


def test_diesel_is_scope_1_and_uses_litre_factor():
    result = calculate_emission(
        ActivityInput(
            doc_type="fuel_receipt",
            fuel_type="diesel",
            quantity=240,
            unit="litres",
            overall_confidence=0.9,
        ),
        FACTORS,
    )
    assert result.kg_co2e == pytest.approx(643.2)
    assert result.scope == 1
    assert result.category == "diesel"
    assert result.unit_used == "litre"


def test_factor_lookup_uses_latest_year():
    selected = find_factor(FACTORS, "electricity_grid_in", "IN")
    assert selected.year == 2026
    assert selected.value == 0.71


def test_factor_lookup_region_falls_back_to_all():
    factors = [
        factor("electricity_grid_in", 0.7, "kWh", 2024, "ALL"),
        factor("electricity_grid_in", 0.6, "kWh", 2023, "US"),
    ]
    selected = find_factor(factors, "electricity_grid_in", "IN")
    assert selected.region == "ALL"


def test_verify_me_factor_is_refused():
    with pytest.raises(FactorUnavailable, match="VERIFY_ME"):
        calculate_emission(
            ActivityInput(doc_type="electricity_bill", quantity=100, unit="kWh"),
            [factor(value=None, status="unverified")],
        )


def test_missing_factor_is_refused():
    factors_without_petrol = [item for item in FACTORS if item.activity_key != "petrol_litre"]
    with pytest.raises(FactorUnavailable, match="No emission factor"):
        calculate_emission(
            ActivityInput(doc_type="fuel_receipt", fuel_type="petrol", quantity=10, unit="litre"),
            factors_without_petrol,
        )


def test_spend_fallback_for_fuel_without_quantity():
    result = calculate_emission(
        ActivityInput(
            doc_type="fuel_receipt",
            fuel_type="diesel",
            quantity=None,
            amount=22680,
            currency="INR",
            overall_confidence=0.8,
        ),
        FACTORS,
    )
    assert result.calc_method == "spend_estimate"
    assert result.data_quality == "low"
    assert result.scope == 1
    assert result.kg_co2e == pytest.approx(635.04)
    assert "spend-based estimate" in result.formula_text


def test_missing_quantity_without_amount_needs_manual_entry():
    with pytest.raises(MissingActivityData, match="Quantity is missing"):
        calculate_emission(
            ActivityInput(doc_type="fuel_receipt", fuel_type="diesel", quantity=None, amount=None),
            FACTORS,
        )


def test_unit_mismatch_is_rejected():
    with pytest.raises(UnitMismatch, match="litres"):
        calculate_emission(
            ActivityInput(doc_type="fuel_receipt", fuel_type="diesel", quantity=240, unit="kg"),
            FACTORS,
        )


def test_electricity_missing_quantity_is_rejected():
    with pytest.raises(MissingActivityData):
        calculate_emission(ActivityInput(doc_type="electricity_bill", quantity=None), FACTORS)


def test_low_confidence_field_downgrades_quality():
    result = calculate_emission(
        ActivityInput(
            doc_type="electricity_bill",
            quantity=500,
            unit="kWh",
            overall_confidence=0.95,
            field_confidence={"quantity": 0.55, "vendor": 0.99},
        ),
        FACTORS,
    )
    assert result.data_quality == "medium"


def test_aggregate_results_totals_scopes_categories_months():
    snapshots = [
        ResultSnapshot(887.5, 2, "electricity_grid", "high", "2026-04"),
        ResultSnapshot(643.2, 1, "diesel", "high", "2026-04"),
        ResultSnapshot(178.8, 1, "lpg", "medium", "2026-05"),
        ResultSnapshot(100.0, 2, "electricity_grid", "high", "2026-05"),
    ]
    summary = aggregate_results(snapshots)
    assert summary["total_kg_co2e"] == pytest.approx(1809.5)
    assert summary["total_tonnes"] == pytest.approx(1.8095, abs=0.001)
    scope_map = {row["scope"]: row for row in summary["by_scope"]}
    assert scope_map[2]["kg_co2e"] == pytest.approx(987.5)
    assert scope_map[2]["share"] == pytest.approx(54.6, abs=0.1)
    assert summary["top_emitter"]["category"] == "electricity_grid"
    assert [row["month"] for row in summary["monthly"]] == ["2026-04", "2026-05"]
    assert summary["quality_mix"] == {"high": 3, "medium": 1, "low": 0}
    assert summary["quality_score"] == 90


def test_intensity_metrics():
    metrics = intensity_metrics(1000, 500, 2_000_000)
    assert metrics["kg_co2e_per_unit"] == 2.0
    assert metrics["kg_co2e_per_rupee"] == 0.0005
    empty = intensity_metrics(1000, None, None)
    assert empty["kg_co2e_per_unit"] is None
    assert empty["kg_co2e_per_rupee"] is None


def test_month_key():
    assert month_key(datetime(2026, 4, 30)) == "2026-04"
    assert month_key(None) is None


def test_unknown_document_type():
    with pytest.raises(CalculationError):
        calculate_emission(ActivityInput(doc_type="unknown", quantity=5), FACTORS)
