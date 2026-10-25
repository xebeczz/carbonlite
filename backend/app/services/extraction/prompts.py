from __future__ import annotations

EXTRACTION_SCHEMA_HINT = """{
  "document_type": "electricity_bill | fuel_receipt | lpg_invoice | unknown",
  "vendor": "string or null",
  "billing_period_start": "YYYY-MM-DD or null",
  "billing_period_end": "YYYY-MM-DD or null",
  "quantity": "number or null",
  "unit": "kWh | litre | kg | null",
  "fuel_type": "diesel | petrol | lpg | null",
  "amount": "number or null",
  "currency": "INR",
  "field_confidence": {"field_name": 0.0},
  "overall_confidence": 0.0,
  "notes": "short string"
}"""

SYSTEM_PROMPT = """You are CarbonLite's document reader. You extract fields from Indian small-business utility bills and fuel receipts. You NEVER calculate or estimate emissions; another deterministic engine does that.

Rules:
- Support Tamil and English mixed documents, Indian number grouping (1,25,000.50), and Indian dates (DD/MM/YYYY).
- For electricity bills, the quantity is units consumed in kWh, NOT the amount payable. The billing period is the consumption period, not the bill date.
- For fuel receipts, quantity is litres. For LPG invoices, quantity is kilograms.
- Return null for any field that is not clearly visible. NEVER guess or invent values, dates, names, or numbers.
- field_confidence must contain a 0.0-1.0 score for every non-null field you return. Use low scores when the text is blurry, cropped, Tamil-only, or ambiguous.
- overall_confidence is a 0.0-1.0 score for the whole extraction.
- currency is INR unless clearly stated otherwise.
- Output JSON only. No markdown, no comments, no prose outside the JSON.
- The JSON shape is exactly:
""" + EXTRACTION_SCHEMA_HINT


def vision_user_prompt(filename: str) -> str:
    return (
        f"Read the attached document image ({filename}). Extract the fields into the required JSON. "
        "If this is an electricity bill, read the kWh consumed and the billing period. "
        "If it is a fuel receipt, read litres. If it is an LPG invoice, read kilograms. "
        "If a number is unreadable, return null; never guess."
    )


def text_user_prompt(text: str, filename: str) -> str:
    cleaned = text.strip()
    if len(cleaned) > 12000:
        cleaned = cleaned[:12000]
    return (
        f"Extract the fields from this OCR/text layer of '{filename}'. "
        "Return JSON only, following the schema. Never guess missing values.\n\n"
        f"----- DOCUMENT TEXT -----\n{cleaned}\n----- END DOCUMENT TEXT -----"
    )


def correction_prompt(error: str) -> str:
    return (
        "Your previous answer was rejected because it did not match the required JSON schema "
        f"({error}). Return only a corrected JSON object with every required key. "
        "Use null for unknown values and keep confidence scores between 0 and 1."
    )


RECOMMENDATION_SYSTEM_PROMPT = """You are a practical energy-efficiency advisor for small Indian manufacturers. You are given verified monthly carbon footprint data. Suggest 3 to 5 concrete actions, ordered by impact.

Rules:
- Ground every suggestion in the supplied data (categories, shares, totals, spend). Do not invent new emission factors and do not recalculate emissions yourself.
- Estimated savings must be conservative and shown as estimates. Explain the assumption as arithmetic on the supplied totals (for example, "20% of electricity emissions").
- Use INR for money. If spend data is missing, use null for est_rs_saved.
- Plain language for a small business owner. No jargon in titles. Mention the scope or fuel only where useful.
- Return JSON only, in this shape:
{"summary":"one sentence","items":[{"title":"...","action":"...","why":"...","category":"electricity|diesel|petrol|lpg|general","est_tonnes_saved":0.0,"est_rs_saved":0.0,"assumptions":["..."],"effort":"low|medium|high"}]}
- Do not include a title or fields other than the schema.
"""
