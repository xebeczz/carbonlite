from __future__ import annotations

import re
from datetime import date

import fitz

from ..calculation import normalize_fuel, normalize_unit
from .schemas import ExtractedFields, parse_dateish

MONTHS = (
    "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|"
    "January|February|March|April|June|July|August|September|October|November|December"
)

LABEL_VALUES = {
    "vendor": ("vendor", "supplier", "merchant", "sold by", "billed by", "issued by"),
    "billing_period": ("billing period", "bill period", "service period", "consumption period", "period"),
    "date": ("date", "bill date", "invoice date", "receipt date", "transaction date"),
    "units": ("units consumed", "units", "consumption", "energy consumed"),
    "quantity": ("quantity", "qty", "volume", "net weight"),
    "amount": (
        "total amount payable",
        "total invoice amount",
        "total amount",
        "amount payable",
        "invoice total",
        "total",
        "amount",
    ),
    "fuel_type": ("fuel type", "product", "fuel"),
}


def extract_pdf_text(path: str, max_pages: int = 3) -> str:
    try:
        document = fitz.open(path)
    except Exception:
        return ""
    chunks: list[str] = []
    try:
        for index in range(min(len(document), max_pages)):
            chunks.append(document.load_page(index).get_text("text"))
    finally:
        document.close()
    return "\n".join(chunk for chunk in chunks if chunk).strip()


def render_pdf_preview(path: str, out_path: str, zoom: float = 1.6) -> bool:
    try:
        document = fitz.open(path)
        try:
            page = document.load_page(0)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            pixmap.save(out_path)
        finally:
            document.close()
        return True
    except Exception:
        return False


def _clean_lines(text: str) -> list[str]:
    return [line.strip() for line in text.replace("\r\n", "\n").split("\n")]


def _label_candidates(lines: list[str], labels: tuple[str, ...]) -> list[str]:
    candidates: list[str] = []
    for label in labels:
        candidates.extend(_candidates_for_label(lines, label))
    return candidates


def _candidates_for_label(lines: list[str], label: str) -> list[str]:
    candidates: list[str] = []
    label = label.lower()
    for index, line in enumerate(lines):
        if not line:
            continue
        lower = line.lower().strip(" :")
        if lower == label:
            for following in lines[index + 1 : index + 3]:
                if following:
                    candidates.append(following)
                    break
            continue
        if lower.startswith(label + ":"):
            rest = line.split(":", 1)[1].strip()
            if rest:
                candidates.append(rest)
    return candidates


def _numbers(value: str) -> list[float]:
    found = []
    for match in re.finditer(r"(?<![\w/])(\d[\d,]*(?:\.\d+)?)(?![\w/])", value):
        try:
            found.append(float(match.group(1).replace(",", "")))
        except ValueError:
            continue
    return found


def _find_dates(text: str) -> list[date]:
    results: list[date] = []
    patterns = (
        re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b"),
        re.compile(rf"\b(\d{{1,2}})\s+({MONTHS})[\s,\-]+(\d{{4}})\b", re.IGNORECASE),
        re.compile(rf"\b({MONTHS})\s+(\d{{1,2}}),?\s+(\d{{4}})\b", re.IGNORECASE),
    )
    for pattern in patterns:
        for match in pattern.finditer(text):
            raw = match.group(0)
            parsed = parse_dateish(raw)
            if parsed:
                results.append(parsed)
    return results


def detect_doc_type(text: str) -> tuple[str, float]:
    upper = text.upper()
    fuel_match = re.search(r"FUEL\s*TYPE\s*[:\n]?\s*(DIESEL|PETROL|LPG)", upper)
    if fuel_match:
        value = fuel_match.group(1)
        if value == "LPG":
            return "lpg_invoice", 0.9
        return "fuel_receipt", 0.9
    if ("LPG" in upper and ("CYLINDER" in upper or "GAS AGENCIES" in upper or "LPG INVOICE" in upper)):
        return "lpg_invoice", 0.85
    if any(term in upper for term in ("KWH", "ELECTRICITY", "TANGEDCO", "TNEB", "UNITS CONSUMED")):
        return "electricity_bill", 0.88
    if any(term in upper for term in ("DIESEL", "PETROL", "HSD", "FUEL RECEIPT")):
        return "fuel_receipt", 0.85
    if "LPG" in upper:
        return "lpg_invoice", 0.65
    return "unknown", 0.2


def _parse_quantity(
    doc_type: str, lines: list[str], text: str
) -> tuple[float | None, str | None, float]:
    unit_hint = {"electricity_bill": "kWh", "fuel_receipt": "litre", "lpg_invoice": "kg"}.get(doc_type)
    labels = LABEL_VALUES["units"] if doc_type == "electricity_bill" else LABEL_VALUES["quantity"]
    unit_patterns = {
        "electricity_bill": r"(?i)\b(kwh|units?)\b",
        "fuel_receipt": r"(?i)\b(litres?|liters?|ltrs?|l)\b",
        "lpg_invoice": r"(?i)\b(kgs?|kilograms?)\b",
    }
    for candidate in _label_candidates(lines, labels):
        numbers = _numbers(candidate)
        if not numbers:
            continue
        if unit_patterns.get(doc_type) and re.search(unit_patterns[doc_type], candidate):
            return numbers[0], unit_hint, 0.92
        return numbers[0], unit_hint, 0.78
    if doc_type == "lpg_invoice":
        match = re.search(r"(?i)([\d,]+(?:\.\d+)?)\s*(?:kg|kilograms?)", text)
        if match:
            return float(match.group(1).replace(",", "")), "kg", 0.65
    if doc_type == "electricity_bill":
        match = re.search(r"(?i)([\d,]+(?:\.\d+)?)\s*kwh", text)
        if match:
            return float(match.group(1).replace(",", "")), "kWh", 0.65
    if doc_type == "fuel_receipt":
        match = re.search(r"(?i)([\d,]+(?:\.\d+)?)\s*(?:litres?|liters?|ltrs?|l)\b", text)
        if match:
            return float(match.group(1).replace(",", "")), "litre", 0.6
    return None, unit_hint, 0.0


def _parse_amount(lines: list[str], text: str) -> tuple[float | None, float]:
    for label in LABEL_VALUES["amount"]:
        for candidate in _candidates_for_label(lines, label):
            numbers = _numbers(candidate)
            if numbers:
                return max(numbers), 0.9
    match = re.search(r"(?i)(?:total|amount)[^\n]{0,40}?(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)", text)
    if match:
        return float(match.group(1).replace(",", "")), 0.6
    return None, 0.0


def parse_document_text(text: str, filename_hint: str = "") -> ExtractedFields:
    lines = _clean_lines(text)
    doc_type, type_confidence = detect_doc_type(text)

    fuel_type: str | None = None
    for candidate in _label_candidates(lines, LABEL_VALUES["fuel_type"]):
        fuel = normalize_fuel(candidate)
        if fuel:
            fuel_type = fuel
            break
    if not fuel_type:
        upper = text.upper()
        if re.search(r"\bDIESEL\b|\bHSD\b", upper):
            fuel_type = "diesel"
        elif re.search(r"\bPETROL\b", upper):
            fuel_type = "petrol"
        elif re.search(r"\bLPG\b", upper):
            fuel_type = "lpg"
    if doc_type == "electricity_bill":
        fuel_type = None
    elif doc_type == "lpg_invoice":
        fuel_type = "lpg"

    vendor = None
    vendor_confidence = 0.0
    for candidate in _label_candidates(lines, LABEL_VALUES["vendor"]):
        cleaned = candidate.strip()
        if cleaned and not re.match(r"(?i)^(sample|demo)", cleaned):
            vendor = cleaned
            vendor_confidence = 0.92
            break
    if not vendor:
        for line in lines:
            if not line or re.match(r"(?i)^(sample|demo|tax invoice|cash memo|invoice|receipt)", line):
                continue
            if re.search(r"(?i)(ltd|limited|pvt|agencies|fuels|board|tangedco|enterprises|traders|gas)", line):
                vendor = line
                vendor_confidence = 0.58
                break
    if not vendor and lines and len(lines[0]) < 80:
        vendor = lines[0]
        vendor_confidence = 0.4

    period_candidates = _label_candidates(lines, LABEL_VALUES["billing_period"])
    start = end = None
    period_confidence = 0.0
    for candidate in period_candidates:
        dates = _find_dates(candidate)
        if len(dates) >= 2:
            start, end = dates[0], dates[1]
            period_confidence = 0.92
            break
        if len(dates) == 1:
            start = end = dates[0]
            period_confidence = 0.7
            break
    if not start:
        for candidate in _label_candidates(lines, LABEL_VALUES["date"]):
            dates = _find_dates(candidate)
            if dates:
                start = end = dates[0]
                period_confidence = 0.68
                break
    if start and end and start > end:
        start, end = end, start

    quantity, unit, quantity_confidence = _parse_quantity(doc_type, lines, text)
    if quantity is None:
        unit = {"electricity_bill": "kWh", "fuel_receipt": "litre", "lpg_invoice": "kg"}.get(doc_type)
    amount, amount_confidence = _parse_amount(lines, text)

    confidence: dict[str, float] = {}
    if doc_type != "unknown":
        confidence["document_type"] = type_confidence
    if vendor:
        confidence["vendor"] = vendor_confidence
    if start:
        confidence["billing_period_start"] = period_confidence
    if end:
        confidence["billing_period_end"] = period_confidence
    if quantity is not None:
        confidence["quantity"] = quantity_confidence
    if amount is not None:
        confidence["amount"] = amount_confidence
    if fuel_type:
        confidence["fuel_type"] = 0.85

    overall = round(sum(confidence.values()) / len(confidence), 3) if confidence else 0.0
    fields = ExtractedFields(
        document_type=doc_type,
        vendor=vendor,
        billing_period_start=start,
        billing_period_end=end,
        quantity=quantity,
        unit=unit,
        fuel_type=fuel_type,
        amount=amount,
        currency="INR",
        field_confidence=confidence,
        overall_confidence=overall,
        notes=(
            "Read from the document's text layer by CarbonLite's offline reader "
            "(no AI model was used). Confirm every field."
        ),
    )
    return fields
