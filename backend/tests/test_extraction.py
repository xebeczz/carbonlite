from __future__ import annotations

import io
from datetime import date
from pathlib import Path

from PIL import Image

from app.services.extraction import service as extraction_service_module
from app.services.extraction.llm import LLMError
from app.services.extraction.schemas import ExtractedFields, parse_dateish
from app.services.extraction.service import ExtractionService

SAMPLES = Path(__file__).resolve().parents[2] / "sample_bills"


class FakeLLM:
    configured = True

    def __init__(self, vision_payloads=None, text_payloads=None):
        self.vision_payloads = list(vision_payloads or [])
        self.text_payloads = list(text_payloads or [])
        self.vision_calls = 0
        self.text_calls = 0

    @staticmethod
    def _next(queue):
        if not queue:
            raise LLMError("No fake response queued")
        return queue.pop(0) if len(queue) > 1 else queue[0]

    def extract_from_image(self, system, user, image_bytes, mime, correction=None):
        self.vision_calls += 1
        payload = self._next(self.vision_payloads)
        if isinstance(payload, Exception):
            raise payload
        return payload

    def extract_from_text(self, system, user, correction=None):
        self.text_calls += 1
        payload = self._next(self.text_payloads)
        if isinstance(payload, Exception):
            raise payload
        return payload


VALID_JSON = """{
  "document_type": "electricity_bill",
  "vendor": "TANGEDCO",
  "billing_period_start": "2026-05-01",
  "billing_period_end": "2026-05-31",
  "quantity": 1250,
  "unit": "kWh",
  "fuel_type": null,
  "amount": 9375,
  "currency": "INR",
  "field_confidence": {"quantity": 0.94, "vendor": 0.9, "amount": 0.88},
  "overall_confidence": 0.91,
  "notes": "Clean bill"
}"""


def test_pdf_reader_extracts_electricity_sample():
    service = ExtractionService(llm=None)
    outcome = service.extract(
        SAMPLES / "electricity_bill_tneb_sample.pdf",
        "application/pdf",
        "electricity_bill_tneb_sample.pdf",
    )
    assert outcome.method == "pdf_text_parser"
    assert outcome.fields.document_type == "electricity_bill"
    assert outcome.fields.quantity == 1250
    assert outcome.fields.amount == 9375
    assert outcome.fields.fuel_type is None
    assert outcome.fields.billing_period_start.isoformat() == "2026-05-01"
    assert outcome.fields.billing_period_end.isoformat() == "2026-05-31"


def test_pdf_reader_extracts_diesel_and_lpg_amounts_correctly():
    service = ExtractionService(llm=None)
    diesel = service.extract(SAMPLES / "diesel_receipt_sample.pdf", "application/pdf", "diesel.pdf")
    lpg = service.extract(SAMPLES / "lpg_invoice_sample.pdf", "application/pdf", "lpg.pdf")
    assert diesel.fields.quantity == 240
    assert diesel.fields.unit == "litre"
    assert diesel.fields.amount == 22680
    assert diesel.fields.fuel_type == "diesel"
    assert lpg.fields.document_type == "lpg_invoice"
    assert lpg.fields.quantity == 38
    assert lpg.fields.amount == 3800
    assert lpg.fields.fuel_type == "lpg"


def test_vision_llm_is_primary_and_retries_invalid_json(tmp_path):
    image_path = tmp_path / "bill.png"
    Image.new("RGB", (600, 800), "white").save(image_path)
    fake = FakeLLM(vision_payloads=["not json at all", VALID_JSON])
    service = ExtractionService(llm=fake)
    outcome = service.extract(image_path, "image/png", "bill.png")
    assert outcome.method == "vision_llm"
    assert fake.vision_calls == 2
    assert outcome.fields.quantity == 1250
    assert outcome.fields.overall_confidence == 0.91


def test_vision_schema_failure_retries_once(tmp_path):
    image_path = tmp_path / "bill.png"
    Image.new("RGB", (600, 800), "white").save(image_path)
    bad = '{"document_type": "electricity_bill", "quantity": 10, "overall_confidence": "very high"}'
    fake = FakeLLM(vision_payloads=[bad, VALID_JSON])
    outcome = ExtractionService(llm=fake).extract(image_path, "image/png", "bill.png")
    assert fake.vision_calls == 2
    assert outcome.method == "vision_llm"


def test_vision_failure_falls_back_to_text_llm():
    fake = FakeLLM(
        vision_payloads=[LLMError("vision unavailable")],
        text_payloads=[VALID_JSON],
    )
    outcome = ExtractionService(llm=fake).extract(
        SAMPLES / "electricity_bill_tneb_sample.pdf", "application/pdf", "bill.pdf"
    )
    assert outcome.method == "text_llm"
    assert fake.vision_calls == 2
    assert fake.text_calls == 1
    assert outcome.fields.quantity == 1250


def test_llm_failure_falls_back_to_offline_reader():
    fake = FakeLLM(
        vision_payloads=[LLMError("vision down")],
        text_payloads=[LLMError("text down")],
    )
    outcome = ExtractionService(llm=fake).extract(
        SAMPLES / "lpg_invoice_sample.pdf", "application/pdf", "lpg.pdf"
    )
    assert outcome.method == "pdf_text_parser"
    assert outcome.fields.quantity == 38


def test_image_without_llm_or_ocr_requires_manual_entry(tmp_path, monkeypatch):
    image_path = tmp_path / "photo.jpg"
    Image.new("RGB", (600, 800), "white").save(image_path, "JPEG")
    monkeypatch.setattr(extraction_service_module, "_ocr_image_bytes", lambda content: None)
    outcome = ExtractionService(llm=None).extract(image_path, "image/jpeg", "photo.jpg")
    assert outcome.method == "manual"
    assert outcome.manual_required is True
    assert outcome.error
    assert not outcome.fields.has_any_data()


def test_date_parsing_day_first_and_confidence_scale():
    assert parse_dateish("05/06/2026").isoformat() == "2026-06-05"
    assert parse_dateish("2026-06-05").isoformat() == "2026-06-05"
    fields = ExtractedFields(
        document_type="Fuel Receipt",
        quantity="1,250.50",
        unit="Litres",
        fuel_type="diesel",
        field_confidence={"quantity": 90},
        overall_confidence=0,
    )
    assert fields.document_type == "fuel_receipt"
    assert fields.quantity == 1250.5
    assert fields.unit == "litre"
    assert fields.field_confidence["quantity"] == 0.9
    assert fields.overall_confidence == 0.9


def test_manual_text_parser_handles_tamil_english_labels():
    from app.services.extraction.local_parser import parse_document_text

    text = """
    வணக்கம்
    Vendor: Sri Balaji Fuels
    Fuel Type: Diesel
    Billing Period: 12/04/2026 to 12/04/2026
    Quantity: 240 litres
    Total Amount: Rs. 22,680.00
    """
    fields = parse_document_text(text)
    assert fields.document_type == "fuel_receipt"
    assert fields.vendor == "Sri Balaji Fuels"
    assert fields.quantity == 240
    assert fields.amount == 22680
    assert fields.billing_period_start.isoformat() == "2026-04-12"
