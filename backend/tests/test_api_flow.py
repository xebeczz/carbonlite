from __future__ import annotations

from pathlib import Path

import pytest

from app.config import settings

SAMPLE_PDF = settings.project_root / "sample_bills" / "electricity_bill_tneb_sample.pdf"


def _create_business(client, name: str) -> dict:
    response = client.post(
        "/api/business",
        json={
            "name": name,
            "industry": "Textile manufacturing",
            "location": "Tiruppur, Tamil Nadu",
            "language": "en",
            "reporting_period_start": "2026-01-01",
            "reporting_period_end": "2026-06-30",
            "units_produced": 420000,
            "annual_revenue": 48000000,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _upload_sample(client, business_id: int) -> dict:
    content = SAMPLE_PDF.read_bytes()
    response = client.post(
        f"/api/documents/upload?business_id={business_id}",
        files={"file": (SAMPLE_PDF.name, content, "application/pdf")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _set_reviewed_fields(client, record_id: int, **overrides) -> dict:
    payload = {
        "doc_type": "electricity_bill",
        "vendor": "TANGEDCO",
        "billing_period_start": "2026-05-01",
        "billing_period_end": "2026-05-31",
        "quantity": 18420,
        "unit": "kWh",
        "amount": 142860,
        "currency": "INR",
        "notes": "Reviewed during the API test.",
    }
    payload.update(overrides)
    response = client.put(f"/api/records/{record_id}", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.skipif(not SAMPLE_PDF.exists(), reason="sample bill PDF is not present")
def test_upload_review_confirm_calculate_and_report(client):
    business = _create_business(client, "API Flow Textiles")
    upload = _upload_sample(client, business["id"])

    document = upload["document"]
    record = upload["record"]
    assert document["doc_type"] == "electricity_bill"
    assert document["status"] == "extracted"
    assert upload["extraction"]["method"] != "llm"
    assert upload["extraction"]["manual_required"] is False
    assert record["result"] is None

    reviewed = _set_reviewed_fields(client, record["id"])
    assert reviewed["document"]["status"] == "extracted"
    assert reviewed["record"]["user_edited"] is True
    assert reviewed["counted"] is False

    verified = client.post(f"/api/records/{record['id']}/verify")
    assert verified.status_code == 200, verified.text
    body = verified.json()
    assert body["counted"] is True
    assert body["document"]["status"] == "verified"
    assert body["result"]["scope"] == 2
    assert body["result"]["factor"]["status"] == "demo"
    assert body["result"]["kg_co2e"] == pytest.approx(18420 * body["result"]["factor"]["value"])

    dashboard = client.get(f"/api/dashboard/{business['id']}").json()
    assert dashboard["totals"]["record_count"] == 1
    assert dashboard["totals"]["kg_co2e"] == pytest.approx(body["result"]["kg_co2e"])
    assert dashboard["quality"]["completeness_pct"] == 100.0

    report = client.get(f"/api/report/{business['id']}")
    assert report.status_code == 200
    payload = report.json()
    assert payload["can_finalize"] is True
    assert payload["problems"] == []
    assert payload["demo"] is True
    assert payload["watermark"]
    assert payload["audit"]["counted"] == 1
    assert payload["methodology"] and payload["limitations"]
    assert payload["factors"][0]["factor_id"] == body["result"]["factor"]["id"]
    assert "recommendations" in payload

    pdf = client.get(f"/api/report/{business['id']}/pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF")
    assert pdf.headers["x-carbonlite-demo"] == "true"

    csv = client.get(f"/api/report/{business['id']}/csv")
    assert csv.status_code == 200
    assert csv.content.startswith(b"\xef\xbb\xbf")


@pytest.mark.skipif(not SAMPLE_PDF.exists(), reason="sample bill PDF is not present")
def test_duplicate_upload_is_rejected(client):
    business = _create_business(client, "Duplicate Check Fabrics")
    _upload_sample(client, business["id"])
    content = SAMPLE_PDF.read_bytes()
    response = client.post(
        f"/api/documents/upload?business_id={business['id']}",
        files={"file": (SAMPLE_PDF.name, content, "application/pdf")},
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "duplicate_file"
    assert detail["existing_document_id"]


@pytest.mark.skipif(not SAMPLE_PDF.exists(), reason="sample bill PDF is not present")
def test_blocking_validation_prevents_counting(client):
    business = _create_business(client, "Blocked Record Weaving")
    upload = _upload_sample(client, business["id"])
    record_id = upload["record"]["id"]

    reviewed = _set_reviewed_fields(client, record_id, quantity=None, unit=None)
    assert reviewed["blocking"] is True
    assert any(
        issue["severity"] == "error"
        for issue in reviewed["record"]["validation_warnings"]
    )

    verified = client.post(f"/api/records/{record_id}/verify")
    assert verified.status_code == 422
    detail = verified.json()["detail"]
    assert detail["blocking"] is True
    assert detail["issues"]
    assert detail["record"]["result"] is None

    report = client.get(f"/api/report/{business['id']}").json()
    assert report["can_finalize"] is False
    blocked_pdf = client.get(f"/api/report/{business['id']}/pdf")
    assert blocked_pdf.status_code == 409
    assert blocked_pdf.json()["detail"]["code"] == "report_blocked"


def test_buyer_view_returns_aggregates_only(client):
    buyers = client.get("/api/buyers")
    assert buyers.status_code == 200
    assert buyers.json(), "demo seed should expose at least one buyer"

    buyer = buyers.json()[0]
    overview = client.get(f"/api/buyer/{buyer['id']}/suppliers")
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["totals"]["supplier_count"] >= 1
    assert len(payload["suppliers"]) == payload["totals"]["supplier_count"]
    assert payload["totals"]["total_tonnes"] > 0
    assert "file_url" not in str(payload["suppliers"])
    assert "original_filename" not in str(payload["suppliers"])

    supplier = payload["suppliers"][0]
    detail = client.get(f"/api/buyer/{buyer['id']}/suppliers/{supplier['business']['id']}")
    assert detail.status_code == 200
    dashboard = detail.json()["dashboard"]
    assert dashboard["business"]["id"] == supplier["business"]["id"]
    assert "file_url" not in str(dashboard)


def test_unverified_factor_blocks_reports(client):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import EmissionFactor

    business = _create_business(client, "Factor Guard Spinning")
    upload = _upload_sample(client, business["id"])
    record_id = upload["record"]["id"]
    _set_reviewed_fields(client, record_id)
    verified = client.post(f"/api/records/{record_id}/verify")
    assert verified.status_code == 200, verified.text
    factor_id = verified.json()["result"]["factor"]["id"]
    assert factor_id is not None

    with SessionLocal() as db:
        factor = db.get(EmissionFactor, factor_id)
        original_status = factor.status
        factor.status = "unverified"
        db.commit()

    try:
        report = client.get(f"/api/report/{business['id']}").json()
        assert report["can_finalize"] is False
        assert any("VERIFY_ME" in problem for problem in report["problems"])
        assert report["factors"][0]["status"] == "unverified"

        pdf = client.get(f"/api/report/{business['id']}/pdf")
        assert pdf.status_code == 409
        assert pdf.json()["detail"]["code"] == "report_blocked"

        # Recalculation must refuse to produce a result from a VERIFY_ME factor.
        recalc = client.post(f"/api/calculate/{business['id']}")
        assert recalc.status_code == 200
        assert recalc.json()["errors"]
    finally:
        with SessionLocal() as db:
            factor = db.get(EmissionFactor, factor_id)
            factor.status = original_status
            db.commit()


def test_meta_reports_capabilities_and_demo_labels(client):
    meta = client.get("/api/meta")
    assert meta.status_code == 200
    payload = meta.json()
    assert payload["factor_mode"] == "demo"
    assert payload["counts"]["factors"] > 0
    assert payload["demo"]["businesses"], "demo supplier should be seeded"
    assert payload["demo"]["buyers"], "demo buyer should be seeded"
    assert "llm_configured" in payload["extraction"]
    assert payload["samples"], "sample documents should be listed"
