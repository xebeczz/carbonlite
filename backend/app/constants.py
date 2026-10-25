from __future__ import annotations

DOC_TYPES = ("electricity_bill", "fuel_receipt", "lpg_invoice", "unknown")
DOC_TYPE_LABELS = {
    "electricity_bill": "Electricity bill",
    "fuel_receipt": "Diesel / petrol receipt",
    "lpg_invoice": "LPG invoice",
    "unknown": "Unclassified document",
}

DOC_STATUSES = ("uploaded", "extracted", "verified", "rejected")
STATUS_LABELS = {
    "uploaded": "Needs data",
    "extracted": "Ready to verify",
    "verified": "Counted",
    "rejected": "Rejected",
}

FUEL_TYPES = ("diesel", "petrol", "lpg")
FUEL_LABELS = {"diesel": "Diesel", "petrol": "Petrol", "lpg": "LPG"}

CONFIDENCE_THRESHOLD = 0.75

UNIT_ALIASES = {
    "kwh": "kWh",
    "kw-h": "kWh",
    "kw h": "kWh",
    "kilowatt hour": "kWh",
    "kilowatt-hour": "kWh",
    "kilowatt hours": "kWh",
    "unit": "kWh",
    "units": "kWh",
    "litre": "litre",
    "litres": "litre",
    "liter": "litre",
    "liters": "litre",
    "l": "litre",
    "ltr": "litre",
    "ltrs": "litre",
    "kg": "kg",
    "kgs": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "inr": "INR",
    "rs": "INR",
    "₹": "INR",
    "rupees": "INR",
}

# Canonical units per document type.
EXPECTED_UNITS = {
    "electricity_bill": "kWh",
    "fuel_receipt": "litre",
    "lpg_invoice": "kg",
}

# Sanity ranges are deliberately wide. Hitting one is a warning, never a block.
SANITY_RANGES = {
    "electricity": {"min": 10, "max": 500_000, "unit": "kWh", "label": "electricity units"},
    "diesel": {"min": 5, "max": 50_000, "unit": "litre", "label": "diesel litres"},
    "petrol": {"min": 5, "max": 20_000, "unit": "litre", "label": "petrol litres"},
    "lpg": {"min": 2, "max": 5_000, "unit": "kg", "label": "LPG kilograms"},
}

QUALITY_ORDER = {"high": 0, "medium": 1, "low": 2}
QUALITY_LABELS = {"high": "High", "medium": "Medium", "low": "Low"}
QUALITY_WEIGHTS = {"high": 1.0, "medium": 0.6, "low": 0.25}

SCOPE_LABELS = {
    1: "Fuel",
    2: "Electricity",
}
SCOPE_FULL_LABELS = {
    1: "Fuel · Scope 1",
    2: "Electricity · Scope 2",
}

CATEGORY_LABELS = {
    "electricity_grid": "Electricity",
    "diesel": "Diesel",
    "petrol": "Petrol",
    "lpg": "LPG",
}

UNVERIFIED_FACTOR_MARKER = "VERIFY_ME"
DEMO_FACTOR_MARKER = "DEMO"
