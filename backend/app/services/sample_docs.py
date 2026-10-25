from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

GREEN = HexColor("#123f2e")
GREEN_LIGHT = HexColor("#e7efe8")
INK = HexColor("#14231c")
MUTED = HexColor("#607066")
LINE = HexColor("#d9dfd8")
SAND = HexColor("#f6f5ef")
AMBER = HexColor("#b45309")


def _date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _inr(value: float) -> str:
    return f"Rs. {value:,.2f}"


def _page(canvas: Canvas, title: str, subtitle: str, doc_tag: str) -> None:
    width, height = A4
    canvas.setFillColor(SAND)
    canvas.rect(0, 0, width, height, stroke=0, fill=1)
    canvas.setFillColor(GREEN)
    canvas.rect(0, height - 42 * mm, width, 42 * mm, stroke=0, fill=1)
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 20)
    canvas.drawString(20 * mm, height - 20 * mm, title)
    canvas.setFont("Helvetica", 10)
    canvas.setFillColor(HexColor("#cfe0d4"))
    canvas.drawString(20 * mm, height - 28 * mm, subtitle)
    canvas.setFillColor(HexColor("#f2c94c"))
    canvas.roundRect(width - 58 * mm, height - 25 * mm, 38 * mm, 9 * mm, 2 * mm, stroke=0, fill=1)
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawCentredString(width - 39 * mm, height - 22 * mm, "SAMPLE / DEMO")
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(20 * mm, height - 55 * mm, doc_tag)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.7)
    canvas.line(20 * mm, height - 58 * mm, width - 20 * mm, height - 58 * mm)


def _footer(canvas: Canvas, note: str) -> None:
    width, _ = A4
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(20 * mm, 14 * mm, note)
    canvas.drawRightString(width - 20 * mm, 14 * mm, "CarbonLite sample document - not a real invoice")


def _watermark(canvas: Canvas, text: str = "SAMPLE") -> None:
    width, height = A4
    canvas.saveState()
    canvas.translate(width / 2, height / 2)
    canvas.rotate(32)
    canvas.setFillColor(Color(0.72, 0.78, 0.73, alpha=0.16))
    canvas.setFont("Helvetica-Bold", 92)
    canvas.drawCentredString(0, 0, text)
    canvas.restoreState()


def _field(canvas: Canvas, x: float, y: float, label: str, value: str, size: float = 10) -> None:
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(x, y + 5 * mm, label.upper())
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", size)
    canvas.drawString(x, y, value)


def _box(canvas: Canvas, x: float, y: float, w: float, h: float, fill: Color = white) -> None:
    canvas.setFillColor(fill)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.8)
    canvas.roundRect(x, y, w, h, 2.5 * mm, stroke=1, fill=1)


def make_electricity_pdf(
    path: Path,
    *,
    business_name: str,
    consumer_no: str,
    period_start: date,
    period_end: date,
    units: float,
    rate: float,
    bill_date: date,
    invoice_no: str,
    address: str = "Tiruppur, Tamil Nadu",
    vendor: str = "TANGEDCO",
    demo_banner: str = "SAMPLE DOCUMENT - CarbonLite demo",
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    amount = round(units * rate, 2)
    canvas = Canvas(str(path), pagesize=A4)
    _page(
        canvas,
        "TAMIL NADU ELECTRICITY BOARD",
        "TANGEDCO - Domestic & Industrial Supply",
        "Electricity Bill",
    )
    _watermark(canvas)
    width, height = A4
    _box(canvas, 20 * mm, height - 104 * mm, 170 * mm, 38 * mm)
    _field(canvas, 26 * mm, height - 82 * mm, "Vendor", vendor)
    _field(canvas, 26 * mm, height - 94 * mm, "Consumer Name", business_name)
    _field(canvas, 110 * mm, height - 82 * mm, "Consumer / Service No.", consumer_no, 9)
    _field(canvas, 110 * mm, height - 94 * mm, "Address", address, 9)

    _box(canvas, 20 * mm, height - 158 * mm, 170 * mm, 46 * mm)
    _field(
        canvas,
        26 * mm,
        height - 124 * mm,
        "Billing Period",
        f"{_date(period_start)} to {_date(period_end)}",
    )
    _field(canvas, 26 * mm, height - 140 * mm, "Bill Date", _date(bill_date))
    _field(canvas, 26 * mm, height - 150 * mm, "Invoice No.", invoice_no, 9)
    _field(canvas, 110 * mm, height - 124 * mm, "Previous Reading", "45,120", 9)
    _field(canvas, 110 * mm, height - 136 * mm, "Current Reading", "46,370", 9)
    _field(canvas, 110 * mm, height - 148 * mm, "Tariff", "LT-IA Industrial", 9)

    _box(canvas, 20 * mm, height - 207 * mm, 170 * mm, 36 * mm, fill=GREEN_LIGHT)
    _field(canvas, 28 * mm, height - 186 * mm, "Units Consumed", f"{units:,.0f} kWh", 18)
    _field(canvas, 116 * mm, height - 186 * mm, "Rate", f"{rate:,.2f} per kWh", 11)

    canvas.setFillColor(INK)
    canvas.setFont("Helvetica", 10)
    canvas.drawString(26 * mm, height - 231 * mm, "Electricity charges")
    canvas.drawRightString(width - 26 * mm, height - 231 * mm, _inr(amount))
    canvas.line(26 * mm, height - 235 * mm, width - 26 * mm, height - 235 * mm)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(26 * mm, height - 247 * mm, "Total Amount Payable")
    canvas.drawRightString(width - 26 * mm, height - 247 * mm, _inr(amount))

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8.5)
    canvas.drawString(26 * mm, height - 262 * mm, "Due date: 18/06/2026  |  Pay online at tangedco.gov.in or at any EB counter.")
    canvas.drawString(26 * mm, height - 268 * mm, demo_banner)
    _footer(canvas, "This bill was generated for CarbonLite, a carbon accounting demo. Fields are sample data.")
    canvas.showPage()
    canvas.save()
    return path


def make_fuel_receipt_pdf(
    path: Path,
    *,
    vendor: str,
    fuel_type: str,
    quantity: float,
    rate: float,
    transaction_date: date,
    receipt_no: str,
    business_name: str = "",
    gstin: str = "33AABCS1429B1Z1",
    address: str = "Avinashi Road, Coimbatore, Tamil Nadu",
    demo_banner: str = "SAMPLE DOCUMENT - CarbonLite demo",
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    amount = round(quantity * rate, 2)
    canvas = Canvas(str(path), pagesize=A4)
    _page(canvas, vendor.upper(), "Fuel Station - Tax Invoice / Cash Memo", "Fuel Receipt")
    _watermark(canvas)
    width, height = A4
    _box(canvas, 20 * mm, height - 108 * mm, 170 * mm, 42 * mm)
    _field(canvas, 26 * mm, height - 82 * mm, "Vendor", vendor)
    _field(canvas, 26 * mm, height - 94 * mm, "Sold To", business_name or "Walk-in customer", 9)
    _field(canvas, 110 * mm, height - 82 * mm, "GSTIN", gstin, 9)
    _field(canvas, 110 * mm, height - 94 * mm, "Address", address, 9)
    _field(canvas, 26 * mm, height - 104 * mm, "Receipt No.", receipt_no, 9)
    _field(canvas, 110 * mm, height - 104 * mm, "Date", _date(transaction_date), 9)

    _box(canvas, 20 * mm, height - 158 * mm, 170 * mm, 40 * mm)
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(26 * mm, height - 128 * mm, "DESCRIPTION")
    canvas.drawString(90 * mm, height - 128 * mm, "QUANTITY")
    canvas.drawString(122 * mm, height - 128 * mm, "RATE")
    canvas.drawRightString(width - 26 * mm, height - 128 * mm, "AMOUNT")
    canvas.line(26 * mm, height - 132 * mm, width - 26 * mm, height - 132 * mm)
    canvas.setFont("Helvetica", 11)
    canvas.drawString(26 * mm, height - 145 * mm, f"{fuel_type.upper()} (HSD)")
    canvas.drawString(90 * mm, height - 145 * mm, f"{quantity:,.2f} litres")
    canvas.drawString(122 * mm, height - 145 * mm, f"{rate:,.2f} / litre")
    canvas.drawRightString(width - 26 * mm, height - 145 * mm, _inr(amount))
    _field(canvas, 90 * mm, height - 155 * mm, "Billing Period", f"{_date(transaction_date)} to {_date(transaction_date)}", 8)

    _box(canvas, 20 * mm, height - 193 * mm, 170 * mm, 26 * mm, fill=GREEN_LIGHT)
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(26 * mm, height - 178 * mm, "Total Amount")
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawRightString(width - 26 * mm, height - 179 * mm, _inr(amount))
    _field(canvas, 26 * mm, height - 188 * mm, "Fuel Type", fuel_type.capitalize(), 9)
    _field(canvas, 80 * mm, height - 188 * mm, "Payment", "UPI", 9)
    _field(canvas, 120 * mm, height - 188 * mm, "Quantity", f"{quantity:,.2f} litres", 9)

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(26 * mm, height - 207 * mm, demo_banner)
    _footer(canvas, "Generated as a sample fuel receipt for CarbonLite. Not a real tax invoice.")
    canvas.showPage()
    canvas.save()
    return path


def make_lpg_invoice_pdf(
    path: Path,
    *,
    vendor: str,
    quantity_kg: float,
    cylinders: int,
    cylinder_size_kg: float,
    rate_per_kg: float,
    period_start: date,
    period_end: date,
    invoice_no: str,
    business_name: str = "",
    address: str = "Mettupalayam Road, Coimbatore, Tamil Nadu",
    demo_banner: str = "SAMPLE DOCUMENT - CarbonLite demo",
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    amount = round(quantity_kg * rate_per_kg, 2)
    canvas = Canvas(str(path), pagesize=A4)
    _page(canvas, vendor.upper(), "Commercial LPG - Invoice", "LPG Invoice")
    _watermark(canvas)
    width, height = A4
    _box(canvas, 20 * mm, height - 108 * mm, 170 * mm, 42 * mm)
    _field(canvas, 26 * mm, height - 82 * mm, "Vendor", vendor)
    _field(canvas, 26 * mm, height - 94 * mm, "Billed To", business_name or "Commercial customer", 9)
    _field(canvas, 110 * mm, height - 82 * mm, "Invoice No.", invoice_no, 9)
    _field(canvas, 110 * mm, height - 94 * mm, "Address", address, 9)
    _field(
        canvas,
        26 * mm,
        height - 104 * mm,
        "Billing Period",
        f"{_date(period_start)} to {_date(period_end)}",
        9,
    )
    _field(canvas, 110 * mm, height - 104 * mm, "Invoice Date", _date(period_end), 9)

    _box(canvas, 20 * mm, height - 162 * mm, 170 * mm, 44 * mm)
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(26 * mm, height - 129 * mm, "DESCRIPTION")
    canvas.drawString(96 * mm, height - 129 * mm, "QUANTITY")
    canvas.drawString(128 * mm, height - 129 * mm, "RATE")
    canvas.drawRightString(width - 26 * mm, height - 129 * mm, "AMOUNT")
    canvas.line(26 * mm, height - 133 * mm, width - 26 * mm, height - 133 * mm)
    canvas.setFont("Helvetica", 10)
    canvas.drawString(
        26 * mm,
        height - 146 * mm,
        f"Commercial LPG cylinder - {cylinder_size_kg:.0f} kg x {cylinders}",
    )
    canvas.drawString(96 * mm, height - 146 * mm, f"{quantity_kg:,.2f} kg")
    canvas.drawString(128 * mm, height - 146 * mm, f"{rate_per_kg:,.2f} / kg")
    canvas.drawRightString(width - 26 * mm, height - 146 * mm, _inr(amount))
    _field(canvas, 26 * mm, height - 157 * mm, "Fuel Type", "LPG", 9)
    _field(canvas, 96 * mm, height - 157 * mm, "Quantity", f"{quantity_kg:,.2f} kg", 9)

    _box(canvas, 20 * mm, height - 197 * mm, 170 * mm, 26 * mm, fill=GREEN_LIGHT)
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(26 * mm, height - 182 * mm, "Total Invoice Amount")
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawRightString(width - 26 * mm, height - 183 * mm, _inr(amount))

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(26 * mm, height - 210 * mm, demo_banner)
    _footer(canvas, "Generated as a sample LPG invoice for CarbonLite. Not a real invoice.")
    canvas.showPage()
    canvas.save()
    return path


def pdf_to_png(pdf_path: Path, png_path: Path, zoom: float = 1.6) -> Path | None:
    try:
        import fitz

        document = fitz.open(str(pdf_path))
        page = document.load_page(0)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        png_path.parent.mkdir(parents=True, exist_ok=True)
        pixmap.save(str(png_path))
        document.close()
        return png_path
    except Exception:
        return None


def generate_sample_set(out_dir: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    paths["electricity"] = make_electricity_pdf(
        out_dir / "electricity_bill_tneb_sample.pdf",
        business_name="Sri Meenakshi Fabrics",
        consumer_no="11-22-334-556-7890",
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        units=1250,
        rate=7.5,
        bill_date=date(2026, 6, 3),
        invoice_no="TNEB/2026/05/18442",
    )
    paths["fuel"] = make_fuel_receipt_pdf(
        out_dir / "diesel_receipt_sample.pdf",
        vendor="Sri Balaji Fuels",
        fuel_type="diesel",
        quantity=240,
        rate=94.5,
        transaction_date=date(2026, 4, 12),
        receipt_no="SBF/2026/0412/88",
        business_name="Sri Meenakshi Fabrics",
    )
    paths["lpg"] = make_lpg_invoice_pdf(
        out_dir / "lpg_invoice_sample.pdf",
        vendor="Bharat Gas Agencies",
        quantity_kg=38,
        cylinders=2,
        cylinder_size_kg=19,
        rate_per_kg=100,
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
        invoice_no="BGA/2026/03/7741",
        business_name="Sri Meenakshi Fabrics",
    )
    for key, path in paths.items():
        pdf_to_png(path, out_dir / f"{path.stem}.png")
    return paths


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate CarbonLite sample bills")
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parents[3] / "sample_bills"),
        help="Output directory",
    )
    args = parser.parse_args()
    created = generate_sample_set(Path(args.out))
    for name, path in created.items():
        print(f"{name}: {path}")
