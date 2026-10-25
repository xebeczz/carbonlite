"""Create clearly-labelled demo data so CarbonLite is usable on first launch.

All businesses, documents, buyer links, and recommendation sets created here are
marked ``is_demo``. Factor values only become demo values when FACTOR_MODE=demo.
"""

from __future__ import annotations

import json
import tempfile
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal, init_db
from .models import (
    AuditLog,
    Business,
    Buyer,
    Document,
    EmissionFactor,
    EmissionResult,
    ExtractedRecord,
    RecommendationSet,
    SupplierLink,
)
from .services.audit import log_audit
from .services.calculation import CalculationError
from .services.dashboard import calculate_record_result
from .services.documents import inspect_upload, remove_stored_document, store_upload
from .services.factors import load_factors
from .services.sample_docs import (
    make_electricity_pdf,
    make_fuel_receipt_pdf,
    make_lpg_invoice_pdf,
)
from .services.validation import has_blocking_errors, validate_record

DEMO_MAIN_NAME = "Sri Meenakshi Fabrics"
DEMO_MAIN_CONSUMER = "11-22-334-556-7890"
DEMO_BUYER_NAME = "Bharat Textiles Sourcing"
DEMO_PERIOD_START = date(2026, 1, 1)
DEMO_PERIOD_END = date(2026, 6, 30)
DEMO_ACTOR = "demo-seed"


def _end_of_month(year: int, month: int) -> date:
    return date(year + (month // 12), (month % 12) + 1, 1) - timedelta(days=1)


def _confidence(overall: float, **overrides: float) -> dict:
    values = {
        "document_type": min(1.0, overall + 0.03),
        "vendor": min(1.0, overall + 0.02),
        "billing_period_start": overall,
        "billing_period_end": overall,
        "quantity": overall,
        "unit": min(1.0, overall + 0.04),
        "amount": min(1.0, overall + 0.02),
        "fuel_type": min(1.0, overall + 0.04),
    }
    values.update(overrides)
    return {key: round(value, 3) for key, value in values.items()}


def _register_record(
    db: Session,
    business: Business,
    *,
    pdf_path: Path,
    filename: str,
    doc_type: str,
    status: str,
    vendor: str,
    period_start: date,
    period_end: date,
    quantity: float,
    unit: str,
    amount: float,
    fuel_type: str | None,
    overall_confidence: float,
    field_confidence: dict,
    notes: str = "",
    extraction_error: str | None = None,
) -> Document:
    content = pdf_path.read_bytes()
    document = store_upload(db, business, inspect_upload(filename, content))
    document.doc_type = doc_type
    document.status = status
    document.extraction_method = "pdf_text_parser"
    document.extraction_error = extraction_error
    document.is_demo = True
    db.flush()

    record = ExtractedRecord(
        document_id=document.id,
        vendor=vendor,
        billing_period_start=period_start,
        billing_period_end=period_end,
        quantity=quantity,
        unit=unit,
        amount=amount,
        currency="INR",
        fuel_type=fuel_type,
        field_confidence=field_confidence,
        overall_confidence=overall_confidence,
        user_edited=False,
        raw_llm_output={"demo": True, "source": "CarbonLite demo seed", "method": "offline reader"},
        notes=notes,
        validation_warnings=[],
    )
    db.add(record)
    db.flush()

    siblings = list(
        db.scalars(
            select(ExtractedRecord)
            .join(Document, ExtractedRecord.document_id == Document.id)
            .where(Document.business_id == business.id, Document.id != document.id)
        ).all()
    )
    issues = validate_record(record, business, doc_type, siblings)
    if status == "verified" and has_blocking_errors(issues):
        raise RuntimeError(f"Demo record for {filename} would be blocked: {issues}")
    record.validation_warnings = issues

    log_audit(
        db,
        "document",
        document.id,
        "document.uploaded",
        new_value={"filename": filename, "doc_type": doc_type, "status": status, "demo": True},
        actor=DEMO_ACTOR,
    )
    log_audit(
        db,
        "record",
        record.id,
        "record.extracted",
        new_value={
            "vendor": vendor,
            "quantity": quantity,
            "unit": unit,
            "overall_confidence": overall_confidence,
            "method": "pdf_text_parser",
        },
        actor=DEMO_ACTOR,
    )
    if status == "verified":
        try:
            result = calculate_record_result(db, record, document, business)
            log_audit(
                db,
                "record",
                record.id,
                "emission.calculated",
                new_value={
                    "kg_co2e": round(result.kg_co2e, 3),
                    "formula": result.formula_text,
                    "data_quality": result.data_quality,
                },
                actor=DEMO_ACTOR,
            )
        except CalculationError as exc:
            log_audit(
                db,
                "record",
                record.id,
                "emission.failed",
                new_value={"code": exc.code, "message": exc.message},
                actor=DEMO_ACTOR,
            )
        log_audit(
            db,
            "document",
            document.id,
            "document.verified",
            old_value={"status": "extracted"},
            new_value={"status": "verified", "demo": True},
            actor=DEMO_ACTOR,
        )
    return document


def _electricity(
    db: Session,
    business: Business,
    tmp: Path,
    *,
    month: int,
    units: float,
    rate: float,
    consumer_no: str,
    invoice_no: str,
    status: str = "verified",
    overall: float = 0.97,
    notes: str = "Demo data: generated from a sample TNEB bill.",
    extraction_error: str | None = None,
) -> Document:
    start = date(2026, month, 1)
    end = _end_of_month(2026, month)
    bill_date = end + timedelta(days=3)
    pdf = tmp / f"{business.id}-{invoice_no.replace('/', '-')}.pdf"
    make_electricity_pdf(
        pdf,
        business_name=business.name,
        consumer_no=consumer_no,
        period_start=start,
        period_end=end,
        units=units,
        rate=rate,
        bill_date=bill_date,
        invoice_no=invoice_no,
        address=business.location,
    )
    if status == "verified":
        field_confidence = _confidence(overall)
    else:
        field_confidence = _confidence(overall, quantity=0.52, amount=0.61)
    return _register_record(
        db,
        business,
        pdf_path=pdf,
        filename=f"{start:%Y-%m}_electricity_{invoice_no.split('/')[-1]}.pdf",
        doc_type="electricity_bill",
        status=status,
        vendor="TANGEDCO",
        period_start=start,
        period_end=end,
        quantity=units,
        unit="kWh",
        amount=round(units * rate, 2),
        fuel_type=None,
        overall_confidence=overall,
        field_confidence=field_confidence,
        notes=notes,
        extraction_error=extraction_error,
    )


def _fuel(
    db: Session,
    business: Business,
    tmp: Path,
    *,
    fuel_type: str,
    day: date,
    quantity: float,
    rate: float,
    vendor: str,
    receipt_no: str,
    address: str,
    overall: float = 0.94,
    status: str = "verified",
) -> Document:
    pdf = tmp / f"{business.id}-{receipt_no.replace('/', '-')}.pdf"
    make_fuel_receipt_pdf(
        pdf,
        vendor=vendor,
        fuel_type=fuel_type,
        quantity=quantity,
        rate=rate,
        transaction_date=day,
        receipt_no=receipt_no,
        business_name=business.name,
        address=address,
    )
    return _register_record(
        db,
        business,
        pdf_path=pdf,
        filename=f"{day:%Y-%m-%d}_{fuel_type}_{receipt_no.split('/')[-1]}.pdf",
        doc_type="fuel_receipt",
        status=status,
        vendor=vendor,
        period_start=day,
        period_end=day,
        quantity=quantity,
        unit="litre",
        amount=round(quantity * rate, 2),
        fuel_type=fuel_type,
        overall_confidence=overall,
        field_confidence=_confidence(overall),
        notes=f"Demo data: generated from a sample {fuel_type} receipt.",
    )


def _lpg(
    db: Session,
    business: Business,
    tmp: Path,
    *,
    month: int,
    day: int,
    cylinders: int,
    cylinder_size: float,
    rate_per_kg: float,
    vendor: str,
    invoice_no: str,
    address: str,
    overall: float = 0.95,
) -> Document:
    quantity = round(cylinders * cylinder_size, 2)
    start = date(2026, month, 1)
    end = _end_of_month(2026, month)
    pdf = tmp / f"{business.id}-{invoice_no.replace('/', '-')}.pdf"
    make_lpg_invoice_pdf(
        pdf,
        vendor=vendor,
        quantity_kg=quantity,
        cylinders=cylinders,
        cylinder_size_kg=cylinder_size,
        rate_per_kg=rate_per_kg,
        period_start=start,
        period_end=end,
        invoice_no=invoice_no,
        business_name=business.name,
        address=address,
    )
    return _register_record(
        db,
        business,
        pdf_path=pdf,
        filename=f"{start:%Y-%m}_lpg_{invoice_no.split('/')[-1]}.pdf",
        doc_type="lpg_invoice",
        status="verified",
        vendor=vendor,
        period_start=start,
        period_end=end,
        quantity=quantity,
        unit="kg",
        amount=round(quantity * rate_per_kg, 2),
        fuel_type=None,
        overall_confidence=overall,
        field_confidence=_confidence(overall),
        notes="Demo data: generated from a sample commercial LPG invoice.",
    )


def _business(
    db: Session,
    *,
    name: str,
    industry: str,
    location: str,
    units_produced: float,
    annual_revenue: float,
) -> Business:
    business = Business(
        name=name,
        industry=industry,
        location=location,
        language="en",
        reporting_period_start=DEMO_PERIOD_START,
        reporting_period_end=DEMO_PERIOD_END,
        units_produced=units_produced,
        annual_revenue=annual_revenue,
        currency="INR",
        region="IN",
        is_demo=True,
    )
    db.add(business)
    db.flush()
    log_audit(
        db,
        "business",
        business.id,
        "business.created",
        new_value={"name": name, "is_demo": True, "seeded": True},
        actor=DEMO_ACTOR,
    )
    return business


def _seed_suppliers(db: Session, tmp: Path) -> list[int]:
    ids: list[int] = []

    kovai = _business(
        db,
        name="Kovai Precision Components",
        industry="Auto components manufacturing",
        location="Coimbatore, Tamil Nadu",
        units_produced=180_000,
        annual_revenue=42_000_000,
    )
    ids.append(kovai.id)
    _electricity(
        db,
        kovai,
        tmp,
        month=2,
        units=12_400,
        rate=8.10,
        consumer_no="11-44-775-221-0042",
        invoice_no="TNEB/KPC/2026/02/5521",
        overall=0.96,
    )
    _electricity(
        db,
        kovai,
        tmp,
        month=5,
        units=13_100,
        rate=8.15,
        consumer_no="11-44-775-221-0042",
        invoice_no="TNEB/KPC/2026/05/6022",
        overall=0.95,
    )
    _electricity(
        db,
        kovai,
        tmp,
        month=6,
        units=13_800,
        rate=8.15,
        consumer_no="11-44-775-221-0042",
        invoice_no="TNEB/KPC/2026/06/6410",
        status="extracted",
        overall=0.69,
        notes="Reader was unsure of a handwritten meter correction. Confirm the units before counting.",
        extraction_error="Low-confidence quantity: handwritten correction on the bill.",
    )
    _fuel(
        db,
        kovai,
        tmp,
        fuel_type="diesel",
        day=date(2026, 4, 9),
        quantity=320,
        rate=94.5,
        vendor="Kovai Fuel Point",
        receipt_no="KFP/2026/0409/31",
        address="Trichy Road, Coimbatore, Tamil Nadu",
        overall=0.92,
    )

    nellai = _business(
        db,
        name="Nellai Spinning Mills",
        industry="Cotton spinning",
        location="Tirunelveli, Tamil Nadu",
        units_produced=260_000,
        annual_revenue=58_000_000,
    )
    ids.append(nellai.id)
    _electricity(
        db,
        nellai,
        tmp,
        month=3,
        units=26_500,
        rate=7.95,
        consumer_no="11-55-889-442-1177",
        invoice_no="TNEB/NSM/2026/03/8834",
        overall=0.97,
    )
    _lpg(
        db,
        nellai,
        tmp,
        month=5,
        day=21,
        cylinders=10,
        cylinder_size=19,
        rate_per_kg=100,
        vendor="Indane Gas Distributors",
        invoice_no="IGD/2026/05/4420",
        address="Palayamkottai, Tirunelveli, Tamil Nadu",
        overall=0.94,
    )

    chennai = _business(
        db,
        name="Chennai Print & Pack",
        industry="Printing and packaging",
        location="Chennai, Tamil Nadu",
        units_produced=90_000,
        annual_revenue=24_000_000,
    )
    ids.append(chennai.id)
    _electricity(
        db,
        chennai,
        tmp,
        month=5,
        units=7_800,
        rate=8.55,
        consumer_no="11-33-556-773-2201",
        invoice_no="TNEB/CPP/2026/05/3345",
        overall=0.95,
    )
    _fuel(
        db,
        chennai,
        tmp,
        fuel_type="petrol",
        day=date(2026, 4, 22),
        quantity=180,
        rate=102.5,
        vendor="Shell Avinashi Road",
        receipt_no="SAR/2026/0422/77",
        address="Guindy, Chennai, Tamil Nadu",
        overall=0.93,
    )

    madurai = _business(
        db,
        name="Madurai Agro Foods",
        industry="Food processing",
        location="Madurai, Tamil Nadu",
        units_produced=140_000,
        annual_revenue=31_000_000,
    )
    ids.append(madurai.id)
    _electricity(
        db,
        madurai,
        tmp,
        month=2,
        units=9_600,
        rate=7.80,
        consumer_no="11-66-221-884-5510",
        invoice_no="TNEB/MAF/2026/02/2257",
        overall=0.96,
    )
    _lpg(
        db,
        madurai,
        tmp,
        month=4,
        day=12,
        cylinders=7,
        cylinder_size=19,
        rate_per_kg=100,
        vendor="HP Gas Agency",
        invoice_no="HPA/2026/04/6621",
        address="KK Nagar, Madurai, Tamil Nadu",
        overall=0.95,
    )
    _fuel(
        db,
        madurai,
        tmp,
        fuel_type="diesel",
        day=date(2026, 6, 11),
        quantity=210,
        rate=94.5,
        vendor="Madurai Diesel Depot",
        receipt_no="MDD/2026/0611/19",
        address="Bypass Road, Madurai, Tamil Nadu",
        overall=0.92,
    )
    return ids


def demo_exists(db: Session) -> bool:
    return (
        db.scalar(
            select(Business.id).where(
                Business.is_demo.is_(True), Business.name == DEMO_MAIN_NAME
            )
        )
        is not None
    )


def seed_demo(db: Session) -> dict:
    if demo_exists(db):
        business = db.scalar(select(Business).where(Business.name == DEMO_MAIN_NAME))
        buyer = db.scalar(select(Buyer).where(Buyer.name == DEMO_BUYER_NAME))
        return {
            "created": False,
            "reason": "Demo data already exists.",
            "business_id": business.id if business else None,
            "buyer_id": buyer.id if buyer else None,
        }

    if not db.scalar(select(func.count()).select_from(EmissionFactor)):
        load_factors(db)

    with tempfile.TemporaryDirectory(prefix="carbonlite-seed-") as temp_dir:
        tmp = Path(temp_dir)
        main = _business(
            db,
            name=DEMO_MAIN_NAME,
            industry="Textile manufacturing",
            location="Tiruppur, Tamil Nadu",
            units_produced=420_000,
            annual_revenue=48_000_000,
        )

        _electricity(
            db, main, tmp, month=1, units=18_420, rate=8.15,
            consumer_no=DEMO_MAIN_CONSUMER, invoice_no="TNEB/SMF/2026/01/1187",
        )
        _electricity(
            db, main, tmp, month=2, units=19_860, rate=8.15,
            consumer_no=DEMO_MAIN_CONSUMER, invoice_no="TNEB/SMF/2026/02/1453",
        )
        _electricity(
            db, main, tmp, month=3, units=21_150, rate=8.20,
            consumer_no=DEMO_MAIN_CONSUMER, invoice_no="TNEB/SMF/2026/03/1811",
        )
        _electricity(
            db, main, tmp, month=4, units=20_480, rate=8.20,
            consumer_no=DEMO_MAIN_CONSUMER, invoice_no="TNEB/SMF/2026/04/2110",
        )
        _electricity(
            db, main, tmp, month=5, units=19_230, rate=8.25,
            consumer_no=DEMO_MAIN_CONSUMER, invoice_no="TNEB/SMF/2026/05/2448",
        )
        _electricity(
            db, main, tmp, month=6, units=22_100, rate=8.25,
            consumer_no=DEMO_MAIN_CONSUMER, invoice_no="TNEB/SMF/2026/06/2931",
            status="extracted", overall=0.66,
            notes="The meter photo had a handwritten correction. Check the June units before counting it.",
            extraction_error="Low-confidence quantity: the printed reading was partly covered by a stamp.",
        )
        _fuel(
            db, main, tmp, fuel_type="diesel", day=date(2026, 1, 15), quantity=620, rate=94.5,
            vendor="Sri Balaji Fuels", receipt_no="SBF/2026/0115/42",
            address="Avinashi Road, Coimbatore, Tamil Nadu",
        )
        _fuel(
            db, main, tmp, fuel_type="diesel", day=date(2026, 3, 18), quantity=780, rate=94.5,
            vendor="Sri Balaji Fuels", receipt_no="SBF/2026/0318/51",
            address="Avinashi Road, Coimbatore, Tamil Nadu",
        )
        _fuel(
            db, main, tmp, fuel_type="diesel", day=date(2026, 5, 12), quantity=540, rate=94.5,
            vendor="Sri Balaji Fuels", receipt_no="SBF/2026/0512/63",
            address="Avinashi Road, Coimbatore, Tamil Nadu",
        )
        _lpg(
            db, main, tmp, month=2, day=5, cylinders=6, cylinder_size=19, rate_per_kg=100,
            vendor="Bharat Gas Agencies", invoice_no="BGA/2026/02/3341",
            address="Mettupalayam Road, Coimbatore, Tamil Nadu",
        )
        _lpg(
            db, main, tmp, month=4, day=7, cylinders=6, cylinder_size=19, rate_per_kg=100,
            vendor="Bharat Gas Agencies", invoice_no="BGA/2026/04/5582",
            address="Mettupalayam Road, Coimbatore, Tamil Nadu",
        )
        _lpg(
            db, main, tmp, month=6, day=3, cylinders=5, cylinder_size=19, rate_per_kg=100,
            vendor="Bharat Gas Agencies", invoice_no="BGA/2026/06/7741",
            address="Mettupalayam Road, Coimbatore, Tamil Nadu",
        )

        _seed_suppliers(db, tmp)

    buyer = Buyer(name=DEMO_BUYER_NAME, is_demo=True)
    db.add(buyer)
    db.flush()
    log_audit(
        db,
        "buyer",
        buyer.id,
        "buyer.created",
        new_value={"name": buyer.name, "is_demo": True},
        actor=DEMO_ACTOR,
    )
    supplier_count = 0
    for business in db.scalars(
        select(Business).where(Business.is_demo.is_(True)).order_by(Business.id)
    ).all():
        db.add(SupplierLink(buyer_id=buyer.id, business_id=business.id, status="active"))
        supplier_count += 1
    log_audit(
        db,
        "buyer",
        buyer.id,
        "buyer.suppliers_linked",
        new_value={"suppliers": supplier_count},
        actor=DEMO_ACTOR,
    )
    log_audit(
        db,
        "business",
        main.id,
        "seed.demo_loaded",
        new_value={
            "demo": True,
            "note": "All documents and figures are generated sample data, not real supplier records.",
            "buyer": buyer.name,
        },
        actor=DEMO_ACTOR,
    )
    db.commit()

    documents = db.scalar(
        select(func.count()).select_from(Document).where(Document.business_id == main.id)
    )
    verified = db.scalar(
        select(func.count())
        .select_from(Document)
        .where(Document.business_id == main.id, Document.status == "verified")
    )
    return {
        "created": True,
        "demo": True,
        "business_id": main.id,
        "business_name": main.name,
        "buyer_id": buyer.id,
        "buyer_name": buyer.name,
        "suppliers": supplier_count,
        "documents": documents,
        "verified_documents": verified,
        "message": "Demo supplier and buyer data created. Everything is labelled as demo data.",
    }


def reset_demo(db: Session) -> dict:
    demo_businesses = db.scalars(select(Business).where(Business.is_demo.is_(True))).all()
    demo_buyers = db.scalars(select(Buyer).where(Buyer.is_demo.is_(True))).all()
    business_ids = [business.id for business in demo_businesses]
    buyer_ids = [buyer.id for buyer in demo_buyers]
    if not business_ids and not buyer_ids:
        return {"reset": False, "message": "There is no demo data to reset."}

    documents = (
        db.scalars(select(Document).where(Document.business_id.in_(business_ids))).all()
        if business_ids
        else []
    )
    for document in documents:
        remove_stored_document(document)
    document_ids = [document.id for document in documents]
    record_ids = (
        list(
            db.scalars(
                select(ExtractedRecord.id).where(ExtractedRecord.document_id.in_(document_ids))
            ).all()
        )
        if document_ids
        else []
    )

    if record_ids:
        db.execute(delete(EmissionResult).where(EmissionResult.record_id.in_(record_ids)))
    if business_ids:
        db.execute(delete(RecommendationSet).where(RecommendationSet.business_id.in_(business_ids)))
        db.execute(delete(SupplierLink).where(SupplierLink.business_id.in_(business_ids)))
    if buyer_ids:
        db.execute(delete(SupplierLink).where(SupplierLink.buyer_id.in_(buyer_ids)))
    if record_ids:
        db.execute(delete(ExtractedRecord).where(ExtractedRecord.id.in_(record_ids)))
    if document_ids:
        db.execute(delete(Document).where(Document.id.in_(document_ids)))

    audit_conditions = []
    if business_ids:
        audit_conditions.append(
            (AuditLog.entity == "business") & (AuditLog.entity_id.in_(business_ids))
        )
    if document_ids:
        audit_conditions.append(
            (AuditLog.entity == "document") & (AuditLog.entity_id.in_(document_ids))
        )
    if record_ids:
        audit_conditions.append(
            (AuditLog.entity == "record") & (AuditLog.entity_id.in_(record_ids))
        )
    if buyer_ids:
        audit_conditions.append(
            (AuditLog.entity == "buyer") & (AuditLog.entity_id.in_(buyer_ids))
        )
    if audit_conditions:
        db.execute(delete(AuditLog).where(or_(*audit_conditions)))
    if buyer_ids:
        db.execute(delete(Buyer).where(Buyer.id.in_(buyer_ids)))
    if business_ids:
        db.execute(delete(Business).where(Business.id.in_(business_ids)))
    db.commit()
    return {
        "reset": True,
        "removed_businesses": len(business_ids),
        "removed_documents": len(document_ids),
        "removed_buyers": len(buyer_ids),
    }


def ensure_demo_data(db: Session) -> dict:
    if settings.auto_seed is False or demo_exists(db):
        return {"created": False, "reason": "Demo seed disabled or already present."}
    if db.scalar(select(func.count()).select_from(Business)):
        return {
            "created": False,
            "reason": "A non-demo business already exists; automatic demo seeding was skipped.",
        }
    return seed_demo(db)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Seed CarbonLite demo data")
    parser.add_argument("--reset", action="store_true", help="Delete demo data, then recreate it")
    args = parser.parse_args()

    init_db()
    with SessionLocal() as db:
        load_factors(db)
        if args.reset:
            reset_demo(db)
        result = seed_demo(db)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
