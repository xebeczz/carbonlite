from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..calculation import normalize_fuel, normalize_unit

DOC_TYPE_ALIASES = {
    "electricity": "electricity_bill",
    "electricity_bill": "electricity_bill",
    "electricity bill": "electricity_bill",
    "electricity_bill_tneb": "electricity_bill",
    "power_bill": "electricity_bill",
    "fuel": "fuel_receipt",
    "fuel_receipt": "fuel_receipt",
    "fuel receipt": "fuel_receipt",
    "diesel_receipt": "fuel_receipt",
    "petrol_receipt": "fuel_receipt",
    "receipt": "fuel_receipt",
    "lpg": "lpg_invoice",
    "lpg_invoice": "lpg_invoice",
    "lpg invoice": "lpg_invoice",
    "gas_invoice": "lpg_invoice",
    "unknown": "unknown",
    "other": "unknown",
}


def parse_dateish(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(".", "/").replace("-", "/")
    parts = text.split("/")
    if len(parts) == 3 and all(part.strip().isdigit() for part in parts):
        first, second, third = (int(part) for part in parts)
        if len(parts[0].strip()) == 4:
            year, month, day = first, second, third
        else:
            day, month, year = first, second, third
            if year < 100:
                year += 2000
        try:
            return date(year, month, day)
        except ValueError:
            return None
    for fmt in ("%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"(?i)(rs\.?|inr|₹|kwh|litres?|liters?|kg|units?)", "", text).strip()
    text = text.replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group()) if match else None


class ExtractedFields(BaseModel):
    model_config = ConfigDict(extra="ignore")

    document_type: Literal["electricity_bill", "fuel_receipt", "lpg_invoice", "unknown"] = "unknown"
    vendor: str | None = None
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    quantity: float | None = None
    unit: str | None = None
    fuel_type: Literal["diesel", "petrol", "lpg"] | None = None
    amount: float | None = None
    currency: str = "INR"
    field_confidence: dict[str, float] = Field(default_factory=dict)
    overall_confidence: float = 0.0
    notes: str = ""

    @field_validator("document_type", mode="before")
    @classmethod
    def _normalise_doc_type(cls, value):
        if value is None:
            return "unknown"
        key = str(value).strip().lower()
        return DOC_TYPE_ALIASES.get(key, key if key in DOC_TYPE_ALIASES.values() else "unknown")

    @field_validator("vendor", mode="before")
    @classmethod
    def _clean_vendor(cls, value):
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @field_validator("billing_period_start", "billing_period_end", mode="before")
    @classmethod
    def _parse_dates(cls, value):
        return parse_dateish(value)

    @field_validator("quantity", "amount", mode="before")
    @classmethod
    def _parse_numbers(cls, value):
        return _number(value)

    @field_validator("unit", mode="before")
    @classmethod
    def _normalise_unit(cls, value):
        if value is None:
            return None
        return normalize_unit(str(value)) or str(value).strip() or None

    @field_validator("fuel_type", mode="before")
    @classmethod
    def _normalise_fuel(cls, value):
        if value is None:
            return None
        fuel = normalize_fuel(str(value))
        return fuel or None

    @field_validator("notes", mode="before")
    @classmethod
    def _clean_notes(cls, value):
        return str(value).strip() if value is not None else ""

    @field_validator("currency", mode="before")
    @classmethod
    def _clean_currency(cls, value):
        text = str(value or "INR").strip().upper().replace("₹", "INR")
        return "INR" if text in {"INR", "RS", "RS.", "RUPEE", "RUPEES"} else text

    @field_validator("field_confidence", mode="before")
    @classmethod
    def _clean_confidence(cls, value):
        if not isinstance(value, dict):
            return {}
        result: dict[str, float] = {}
        for key, raw in value.items():
            try:
                number = float(raw)
            except (TypeError, ValueError):
                continue
            if number > 1:
                number = number / 100
            result[str(key)] = round(max(0.0, min(1.0, number)), 3)
        return result

    @model_validator(mode="after")
    def _finalise(self):
        if self.overall_confidence > 1:
            self.overall_confidence = self.overall_confidence / 100
        self.overall_confidence = round(max(0.0, min(1.0, self.overall_confidence)), 3)
        if not self.overall_confidence and self.field_confidence:
            self.overall_confidence = round(
                sum(self.field_confidence.values()) / len(self.field_confidence), 3
            )
        if self.quantity is not None and self.quantity < 0:
            self.quantity = None
        if self.amount is not None and self.amount < 0:
            self.amount = None
        return self

    def has_any_data(self) -> bool:
        return any(
            [
                self.document_type != "unknown",
                self.vendor,
                self.billing_period_start or self.billing_period_end,
                self.quantity is not None,
                self.amount is not None,
            ]
        )
