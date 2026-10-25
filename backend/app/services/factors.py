from __future__ import annotations

import csv
import logging
import math
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..constants import DEMO_FACTOR_MARKER, UNVERIFIED_FACTOR_MARKER
from ..models import EmissionFactor

logger = logging.getLogger("carbonlite.factors")


@dataclass(frozen=True)
class FactorRow:
    activity_key: str
    unit: str
    factor_kg_co2e_per_unit: float | None
    source: str
    source_version: str
    year: int
    region: str
    notes: str
    status: str


def _parse_year(raw: str) -> int:
    try:
        return int(float(raw.strip()))
    except (TypeError, ValueError):
        return 0


def _parse_value(raw: str) -> float | None:
    text = (raw or "").strip()
    if not text or UNVERIFIED_FACTOR_MARKER in text.upper():
        return None
    try:
        value = float(text.replace(",", ""))
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def classify_status(value: float | None, source: str, notes: str) -> str:
    haystack = f"{source} {notes}".upper()
    if value is None or UNVERIFIED_FACTOR_MARKER in haystack:
        return "unverified"
    if DEMO_FACTOR_MARKER in haystack:
        return "demo"
    return "verified"


def read_factor_rows(path: Path) -> tuple[list[FactorRow], list[str]]:
    rows: list[FactorRow] = []
    warnings: list[str] = []
    if not path.exists():
        return rows, [f"Factor file not found: {path}"]
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "activity_key",
            "unit",
            "factor_kg_co2e_per_unit",
            "source",
            "year",
            "region",
        }
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            return rows, [f"Factor file is missing required columns: {path}"]
        for line_no, raw in enumerate(reader, start=2):
            activity_key = (raw.get("activity_key") or "").strip()
            unit = (raw.get("unit") or "").strip()
            if not activity_key or not unit:
                warnings.append(f"Skipped factor row {line_no}: missing activity_key or unit")
                continue
            source = (raw.get("source") or "").strip()
            notes = (raw.get("notes") or "").strip()
            value = _parse_value(raw.get("factor_kg_co2e_per_unit") or "")
            status = classify_status(value, source, notes)
            if value is not None and value <= 0:
                warnings.append(f"Skipped factor row {line_no}: non-positive value")
                continue
            rows.append(
                FactorRow(
                    activity_key=activity_key,
                    unit=unit,
                    factor_kg_co2e_per_unit=value,
                    source=source,
                    source_version=(raw.get("source_version") or "").strip(),
                    year=_parse_year(raw.get("year") or ""),
                    region=((raw.get("region") or "IN").strip().upper() or "IN"),
                    notes=notes,
                    status=status,
                )
            )
    return rows, warnings


def load_factors(db: Session, path: Path | None = None) -> dict:
    path = path or settings.factor_file
    rows, warnings = read_factor_rows(path)
    created = 0
    updated = 0
    for row in rows:
        existing = db.scalar(
            select(EmissionFactor).where(
                EmissionFactor.activity_key == row.activity_key,
                EmissionFactor.year == row.year,
                EmissionFactor.region == row.region,
            )
        )
        if existing is None:
            db.add(
                EmissionFactor(
                    activity_key=row.activity_key,
                    unit=row.unit,
                    factor_kg_co2e_per_unit=row.factor_kg_co2e_per_unit,
                    source=row.source,
                    source_version=row.source_version,
                    year=row.year,
                    region=row.region,
                    notes=row.notes,
                    status=row.status,
                )
            )
            created += 1
        else:
            existing.unit = row.unit
            existing.factor_kg_co2e_per_unit = row.factor_kg_co2e_per_unit
            existing.source = row.source
            existing.source_version = row.source_version
            existing.notes = row.notes
            existing.status = row.status
            updated += 1
    db.commit()
    summary = {
        "file": str(path),
        "mode": settings.factor_mode,
        "loaded": len(rows),
        "created": created,
        "updated": updated,
        "unverified": sum(1 for row in rows if row.status == "unverified"),
        "demo": sum(1 for row in rows if row.status == "demo"),
        "warnings": warnings,
    }
    logger.info("Loaded emission factors: %s", summary)
    return summary


def get_factor_model(db: Session, activity_key: str, region: str = "IN") -> EmissionFactor | None:
    candidates = db.scalars(
        select(EmissionFactor)
        .where(EmissionFactor.activity_key == activity_key)
        .order_by(EmissionFactor.year.desc())
    ).all()
    if not candidates:
        return None
    for candidate in candidates:
        if candidate.region.upper() == region.upper():
            return candidate
    for candidate in candidates:
        if candidate.region.upper() == "ALL":
            return candidate
    return candidates[0]


def factor_summary(db: Session) -> list[dict]:
    factors = db.scalars(select(EmissionFactor).order_by(EmissionFactor.activity_key)).all()
    return [
        {
            "id": f.id,
            "activity_key": f.activity_key,
            "unit": f.unit,
            "factor_kg_co2e_per_unit": f.factor_kg_co2e_per_unit,
            "source": f.source,
            "source_version": f.source_version,
            "year": f.year,
            "region": f.region,
            "notes": f.notes,
            "status": f.status,
        }
        for f in factors
    ]
