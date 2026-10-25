from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .constants import DOC_TYPES, FUEL_TYPES


class BusinessCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    industry: str = Field(default="", max_length=120)
    location: str = Field(default="", max_length=200)
    language: str = "en"
    reporting_period_start: date
    reporting_period_end: date
    units_produced: float | None = Field(default=None, ge=0)
    annual_revenue: float | None = Field(default=None, ge=0)

    @field_validator("name", "industry", "location", mode="before")
    @classmethod
    def _trim(cls, value):
        return str(value or "").strip()

    @field_validator("language")
    @classmethod
    def _language(cls, value: str) -> str:
        return value if value in {"en", "ta"} else "en"

    @model_validator(mode="after")
    def _dates(self):
        if self.reporting_period_end < self.reporting_period_start:
            raise ValueError("Reporting period end must be on or after the start date.")
        return self


class RecordUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vendor: str | None = Field(default=None, max_length=200)
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    quantity: float | None = None
    unit: str | None = Field(default=None, max_length=30)
    amount: float | None = None
    currency: str | None = Field(default=None, max_length=8)
    fuel_type: Literal["diesel", "petrol", "lpg"] | None = None
    doc_type: Literal["electricity_bill", "fuel_receipt", "lpg_invoice", "unknown"] | None = None
    notes: str | None = None

    @field_validator("vendor", "unit", "currency", "notes", mode="before")
    @classmethod
    def _strip(cls, value):
        if value is None:
            return None
        return str(value).strip()


class RecommendationRequest(BaseModel):
    pass
