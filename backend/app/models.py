from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, utcnow


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    industry: Mapped[str] = mapped_column(String(120), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    language: Mapped[str] = mapped_column(String(8), default="en")
    reporting_period_start: Mapped[date] = mapped_column(Date, nullable=False)
    reporting_period_end: Mapped[date] = mapped_column(Date, nullable=False)
    units_produced: Mapped[float | None] = mapped_column(Float, nullable=True)
    annual_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    region: Mapped[str] = mapped_column(String(16), default="IN")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    documents: Mapped[list["Document"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    supplier_links: Mapped[list["SupplierLink"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    preview_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    original_filename: Mapped[str] = mapped_column(String(300), default="")
    mime_type: Mapped[str] = mapped_column(String(100), default="")
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    doc_type: Mapped[str] = mapped_column(String(40), default="unknown")
    status: Mapped[str] = mapped_column(String(20), default="uploaded", index=True)
    extraction_method: Mapped[str | None] = mapped_column(String(80), nullable=True)
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duplicate_of: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    business: Mapped["Business"] = relationship(back_populates="documents")
    record: Mapped["ExtractedRecord | None"] = relationship(
        back_populates="document", cascade="all, delete-orphan", uselist=False
    )


class ExtractedRecord(Base):
    __tablename__ = "extracted_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, unique=True
    )
    vendor: Mapped[str | None] = mapped_column(String(200), nullable=True)
    billing_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    billing_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    fuel_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    field_confidence: Mapped[dict] = mapped_column(JSON, default=dict)
    overall_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    user_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    raw_llm_output: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")
    validation_warnings: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    document: Mapped["Document"] = relationship(back_populates="record")
    result: Mapped["EmissionResult | None"] = relationship(
        back_populates="record", cascade="all, delete-orphan", uselist=False
    )


class EmissionFactor(Base):
    __tablename__ = "emission_factors"
    __table_args__ = (UniqueConstraint("activity_key", "year", "region", name="uq_factor_key_year_region"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    activity_key: Mapped[str] = mapped_column(String(80), index=True)
    unit: Mapped[str] = mapped_column(String(30))
    factor_kg_co2e_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(300))
    source_version: Mapped[str] = mapped_column(String(120), default="")
    year: Mapped[int] = mapped_column(Integer)
    region: Mapped[str] = mapped_column(String(16), default="IN")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class EmissionResult(Base):
    __tablename__ = "emission_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    record_id: Mapped[int] = mapped_column(
        ForeignKey("extracted_records.id", ondelete="CASCADE"), index=True, unique=True
    )
    factor_id: Mapped[int | None] = mapped_column(ForeignKey("emission_factors.id"), nullable=True)
    activity_key: Mapped[str] = mapped_column(String(80))
    quantity_used: Mapped[float] = mapped_column(Float)
    unit_used: Mapped[str] = mapped_column(String(30))
    kg_co2e: Mapped[float] = mapped_column(Float)
    scope: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(60))
    calc_method: Mapped[str] = mapped_column(String(30), default="activity")
    data_quality: Mapped[str] = mapped_column(String(20), default="medium")
    formula_text: Mapped[str] = mapped_column(Text)
    factor_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    factor_unit: Mapped[str] = mapped_column(String(30), default="")
    factor_source: Mapped[str] = mapped_column(String(300), default="")
    factor_version: Mapped[str] = mapped_column(String(120), default="")
    factor_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    factor_region: Mapped[str] = mapped_column(String(16), default="")
    factor_status: Mapped[str] = mapped_column(String(20), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    record: Mapped["ExtractedRecord"] = relationship(back_populates="result")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    action: Mapped[str] = mapped_column(String(60))
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    actor: Mapped[str] = mapped_column(String(40), default="system")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Buyer(Base):
    __tablename__ = "buyers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    links: Mapped[list["SupplierLink"]] = relationship(
        back_populates="buyer", cascade="all, delete-orphan"
    )


class SupplierLink(Base):
    __tablename__ = "supplier_links"
    __table_args__ = (UniqueConstraint("buyer_id", "business_id", name="uq_buyer_supplier"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("buyers.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    buyer: Mapped["Buyer"] = relationship(back_populates="links")
    business: Mapped["Business"] = relationship(back_populates="supplier_links")


class RecommendationSet(Base):
    __tablename__ = "recommendation_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True
    )
    method: Mapped[str] = mapped_column(String(40), default="heuristic")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
