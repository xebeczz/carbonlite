from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..config import settings

router = APIRouter(tags=["Sample documents"])

SAMPLES = {
    "electricity": {
        "label": "TNEB electricity bill",
        "description": "May 2026 TANGEDCO industrial bill for 1,250 kWh.",
        "pdf": "electricity_bill_tneb_sample.pdf",
        "png": "electricity_bill_tneb_sample.png",
    },
    "diesel": {
        "label": "Diesel receipt",
        "description": "240 litres of diesel from April 2026.",
        "pdf": "diesel_receipt_sample.pdf",
        "png": "diesel_receipt_sample.png",
    },
    "lpg": {
        "label": "LPG invoice",
        "description": "38 kg commercial LPG for March 2026.",
        "pdf": "lpg_invoice_sample.pdf",
        "png": "lpg_invoice_sample.png",
    },
}


def sample_list() -> list[dict]:
    items = []
    for kind, meta in SAMPLES.items():
        pdf = settings.sample_bills_dir / meta["pdf"]
        png = settings.sample_bills_dir / meta["png"]
        items.append(
            {
                "kind": kind,
                "label": meta["label"],
                "description": meta["description"],
                "filename": meta["pdf"],
                "available": pdf.is_file(),
                "pdf_url": f"/samples/{kind}/pdf",
                "png_url": f"/samples/{kind}/png" if png.is_file() else None,
            }
        )
    return items


@router.get("/samples", response_model=None)
def list_samples() -> list[dict]:
    return sample_list()


@router.get("/samples/{kind}/{fmt}", response_model=None)
def sample_file(kind: str, fmt: str) -> FileResponse:
    meta = SAMPLES.get(kind)
    if meta is None or fmt not in {"pdf", "png"}:
        raise HTTPException(status_code=404, detail="Sample document not found.")
    path = settings.sample_bills_dir / meta[fmt]
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Sample document is missing. Run the sample bill generator to recreate it.",
        )
    media = "application/pdf" if fmt == "pdf" else "image/png"
    return FileResponse(
        path,
        media_type=media,
        headers={"Content-Disposition": f'inline; filename="{meta[fmt]}"'},
    )
