from __future__ import annotations

import io
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

GREEN = HexColor("#123f2e")
LEAF = HexColor("#2f6f4e")
SAGE = HexColor("#e7efe8")
SAND = HexColor("#f6f5ef")
INK = HexColor("#14231c")
MUTED = HexColor("#607066")
LINE = HexColor("#d9dfd8")
AMBER = HexColor("#b45309")
DEMO = HexColor("#a33a2b")

PAGE_W, PAGE_H = A4


def _fmt_num(value, decimals: int = 2) -> str:
    if value is None:
        return "-"
    return f"{float(value):,.{decimals}f}"


def _fmt_date(value: str | None) -> str:
    if not value:
        return "-"
    try:
        return datetime.fromisoformat(value.replace("Z", "")).strftime("%d %b %Y")
    except ValueError:
        return value


def _fmt_period(start: str | None, end: str | None) -> str:
    return f"{_fmt_date(start)} to {_fmt_date(end)}"


def _e(value) -> str:
    return escape(str(value if value is not None else ""))


def _styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CLBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=13.2,
            textColor=INK,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLH1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=GREEN,
            spaceBefore=2,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLH2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=GREEN,
            spaceBefore=14,
            spaceAfter=6,
            keepWithNext=True,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLSmall",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=10.5,
            textColor=MUTED,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLCell",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7.7,
            leading=10.3,
            textColor=INK,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLCellHead",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.7,
            leading=10.3,
            textColor=GREEN,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLKpiLabel",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=9,
            textColor=MUTED,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLKpiValue",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=GREEN,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CLBullet",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.4,
            leading=11.5,
            textColor=INK,
            leftIndent=11,
            bulletIndent=2,
            spaceAfter=2,
        )
    )
    return styles


def _status_factor_color(status: str):
    if status == "verified":
        return LEAF
    if status == "demo":
        return AMBER
    return DEMO


def _table(data, widths, *, header: bool = True, font_size: float = 8.0):
    table = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), SAGE),
                ("TEXTCOLOR", (0, 0), (-1, 0), GREEN),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), font_size),
            ]
        )
        commands.append(("FONTNAME", (0, 1), (-1, -1), "Helvetica"))
        commands.append(("FONTSIZE", (0, 1), (-1, -1), font_size))
    table.setStyle(TableStyle(commands))
    return table


def _cover(canvas, doc, payload):
    canvas.saveState()
    canvas.setFillColor(GREEN)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(Color(0.85, 0.92, 0.86, alpha=0.08))
    canvas.circle(PAGE_W - 18 * mm, PAGE_H - 40 * mm, 48 * mm, fill=1, stroke=0)
    canvas.circle(22 * mm, 40 * mm, 34 * mm, fill=1, stroke=0)

    canvas.setFillColor(HexColor("#cfe0d4"))
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(22 * mm, PAGE_H - 32 * mm, "CARBONLITE")
    canvas.setFont("Helvetica", 8)
    canvas.drawString(22 * mm, PAGE_H - 38 * mm, "SUPPLIER CARBON REPORT  |  GHG PROTOCOL, SCOPE 1 & 2")

    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 30)
    canvas.drawString(22 * mm, PAGE_H - 78 * mm, "Carbon footprint")
    canvas.drawString(22 * mm, PAGE_H - 91 * mm, "report")

    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 16)
    business_name = payload["business"]["name"][:70]
    canvas.drawString(22 * mm, PAGE_H - 118 * mm, business_name)
    canvas.setFillColor(HexColor("#cfe0d4"))
    canvas.setFont("Helvetica", 9.5)
    canvas.drawString(22 * mm, PAGE_H - 126 * mm, payload["business"].get("location") or "")
    canvas.drawString(
        22 * mm,
        PAGE_H - 133 * mm,
        f"Reporting period: {_fmt_period(payload['period']['start'], payload['period']['end'])}",
    )

    canvas.setStrokeColor(Color(0.7, 0.8, 0.72, alpha=0.35))
    canvas.line(22 * mm, PAGE_H - 145 * mm, PAGE_W - 22 * mm, PAGE_H - 145 * mm)

    canvas.setFillColor(HexColor("#cfe0d4"))
    canvas.setFont("Helvetica", 8.5)
    canvas.drawString(22 * mm, PAGE_H - 158 * mm, "TOTAL VERIFIED FOOTPRINT")
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 46)
    canvas.drawString(22 * mm, PAGE_H - 182 * mm, f"{_fmt_num(payload['totals']['tonnes_co2e'])}")
    canvas.setFillColor(HexColor("#cfe0d4"))
    canvas.setFont("Helvetica", 12)
    canvas.drawString(22 * mm + 72 * mm, PAGE_H - 181 * mm, "t CO2e")

    kpi_y = PAGE_H - 210 * mm
    kpis = [
        ("VERIFIED RECORDS", str(payload["audit"]["counted"])),
        ("DATA QUALITY", f"{payload['quality']['score']}/100"),
        ("COMPLETENESS", f"{payload['completeness_pct']:.0f}%"),
    ]
    for index, (label, value) in enumerate(kpis):
        x = 22 * mm + index * 55 * mm
        canvas.setFillColor(HexColor("#cfe0d4"))
        canvas.setFont("Helvetica", 7)
        canvas.drawString(x, kpi_y, label)
        canvas.setFillColor(white)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(x, kpi_y - 8 * mm, value)

    if payload.get("demo"):
        canvas.setFillColor(HexColor("#f2c94c"))
        canvas.roundRect(PAGE_W - 80 * mm, 30 * mm, 58 * mm, 12 * mm, 2 * mm, fill=1, stroke=0)
        canvas.setFillColor(INK)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawCentredString(PAGE_W - 51 * mm, 34.2 * mm, "DEMO - NOT VERIFIED FACTORS")

    canvas.setFillColor(HexColor("#a9c4b2"))
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(22 * mm, 24 * mm, f"Generated {_fmt_date(payload['generated_at'])} by CarbonLite")
    canvas.drawRightString(PAGE_W - 22 * mm, 24 * mm, "Scope 1 & 2 | kg CO2e | GHG Protocol")
    canvas.restoreState()


def _page_decorator(canvas, doc, payload):
    canvas.saveState()
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(20 * mm, PAGE_H - 15 * mm, f"CarbonLite  |  {payload['business']['name']}")
    canvas.drawRightString(PAGE_W - 20 * mm, PAGE_H - 15 * mm, "Carbon footprint report")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, PAGE_H - 18 * mm, PAGE_W - 20 * mm, PAGE_H - 18 * mm)
    canvas.drawString(
        20 * mm,
        11 * mm,
        (
            "DEMO ONLY - illustrative factor values, not for buyer reporting."
            if payload.get("demo")
            else f"Generated {_fmt_date(payload['generated_at'])}. Scope 1 & 2."
        ),
    )
    canvas.drawRightString(PAGE_W - 20 * mm, 11 * mm, f"Page {canvas.getPageNumber()}")
    if payload.get("watermark"):
        canvas.saveState()
        canvas.translate(PAGE_W / 2, PAGE_H / 2)
        canvas.rotate(32)
        canvas.setFillColor(Color(0.65, 0.25, 0.18, alpha=0.075))
        canvas.setFont("Helvetica-Bold", 58)
        canvas.drawCentredString(0, 0, "DEMO REPORT")
        canvas.restoreState()
    canvas.restoreState()


def _monthly_chart(monthly: list[dict], styles) -> Drawing:
    drawing = Drawing(480, 165)
    chart = VerticalBarChart()
    chart.x = 42
    chart.y = 28
    chart.width = 410
    chart.height = 115
    chart.data = [[round(row["kg_co2e"] / 1000, 3) for row in monthly]]
    chart.categoryAxis.categoryNames = [row["label"] for row in monthly]
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labelTextFormat = lambda value: f"{value:,.1f}"
    chart.valueAxis.valueMin = 0
    chart.barWidth = 15
    if len(monthly) > 7:
        chart.categoryAxis.labelAngle = 28
    chart.bars[0].fillColor = LEAF
    chart.bars[0].strokeColor = LEAF
    drawing.add(chart)
    drawing.add(
        String(
            225,
            8,
            "Monthly emissions (tonnes CO2e)",
            fontName="Helvetica",
            fontSize=7.5,
            textAnchor="middle",
            fillColor=MUTED,
        )
    )
    return drawing


def build_report_pdf(payload: dict) -> bytes:
    styles = _styles()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=25 * mm,
        bottomMargin=19 * mm,
        title=f"Carbon footprint report - {payload['business']['name']}",
        author="CarbonLite",
        subject="Scope 1 and 2 greenhouse gas report",
    )

    def on_first(canvas, document):
        _cover(canvas, document, payload)

    def on_later(canvas, document):
        _page_decorator(canvas, document, payload)

    story: list = [PageBreak()]
    content_width = PAGE_W - 40 * mm

    story.append(Paragraph("Executive summary", styles["CLH1"]))
    total_tonnes = payload["totals"]["tonnes_co2e"]
    scope_lookup = {row["scope"]: row for row in payload["by_scope"]}
    scope1 = scope_lookup.get(1, {"kg_co2e": 0, "share": 0})
    scope2 = scope_lookup.get(2, {"kg_co2e": 0, "share": 0})
    top = payload["totals"].get("top_emitter")
    top_sentence = (
        f"{top['label']} is the largest category at {top['share']:.0f}% of the counted footprint."
        if top
        else "No category dominates the counted footprint yet."
    )
    story.append(
        Paragraph(
            f"{_e(payload['business']['name'])} reported <b>{_fmt_num(total_tonnes)} t CO2e</b> across "
            f"<b>{payload['audit']['counted']}</b> verified records for "
            f"{_fmt_period(payload['period']['start'], payload['period']['end'])}. "
            f"Fuel (Scope 1) accounts for {scope1['share']:.0f}%; purchased electricity (Scope 2) "
            f"accounts for {scope2['share']:.0f}%. {top_sentence}",
            styles["CLBody"],
        )
    )

    kpi_data = [
        [
            Paragraph("TOTAL FOOTPRINT", styles["CLKpiLabel"]),
            Paragraph("FUEL · SCOPE 1", styles["CLKpiLabel"]),
            Paragraph("ELECTRICITY · SCOPE 2", styles["CLKpiLabel"]),
            Paragraph("DATA COMPLETENESS", styles["CLKpiLabel"]),
        ],
        [
            Paragraph(f"{_fmt_num(total_tonnes)} t", styles["CLKpiValue"]),
            Paragraph(f"{_fmt_num(scope1['kg_co2e'] / 1000)} t", styles["CLKpiValue"]),
            Paragraph(f"{_fmt_num(scope2['kg_co2e'] / 1000)} t", styles["CLKpiValue"]),
            Paragraph(f"{payload['completeness_pct']:.0f}%", styles["CLKpiValue"]),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[content_width / 4] * 4, hAlign="LEFT")
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SAND),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(Spacer(1, 4))
    story.append(kpi_table)
    story.append(Spacer(1, 6))
    quality = payload["quality"]
    story.append(
        Paragraph(
            f"Data quality score: <b>{quality['score']}/100</b>. "
            f"{quality['verified_documents']} of {quality['total_documents']} uploaded documents are verified and counted; "
            f"{quality['pending_documents']} are awaiting verification and are excluded from totals. "
            f"{quality['spend_estimates']} record(s) use spend-based estimates flagged low quality.",
            styles["CLBody"],
        )
    )

    story.append(Paragraph("Methodology", styles["CLH2"]))
    for item in payload["methodology"]:
        story.append(Paragraph(item, styles["CLBullet"], bulletText="•"))

    story.append(Paragraph("Results by category", styles["CLH2"]))
    if payload["by_category"]:
        rows = [
            [
                Paragraph("Category", styles["CLCellHead"]),
                Paragraph("Scope", styles["CLCellHead"]),
                Paragraph("Activity (kg CO2e)", styles["CLCellHead"]),
                Paragraph("Tonnes CO2e", styles["CLCellHead"]),
                Paragraph("Share", styles["CLCellHead"]),
            ]
        ]
        for item in payload["by_category"]:
            rows.append(
                [
                    Paragraph(_e(item["label"]), styles["CLCell"]),
                    Paragraph(f"Scope {item['scope']}", styles["CLCell"]),
                    Paragraph(_fmt_num(item["kg_co2e"], 2), styles["CLCell"]),
                    Paragraph(_fmt_num(item["kg_co2e"] / 1000, 3), styles["CLCell"]),
                    Paragraph(f"{item['share']:.1f}%", styles["CLCell"]),
                ]
            )
        rows.append(
            [
                Paragraph("<b>Total</b>", styles["CLCell"]),
                Paragraph("", styles["CLCell"]),
                Paragraph(f"<b>{_fmt_num(payload['totals']['kg_co2e'], 2)}</b>", styles["CLCell"]),
                Paragraph(f"<b>{_fmt_num(total_tonnes, 3)}</b>", styles["CLCell"]),
                Paragraph("<b>100%</b>", styles["CLCell"]),
            ]
        )
        story.append(_table(rows, [56 * mm, 25 * mm, 36 * mm, 27 * mm, 20 * mm]))
    else:
        story.append(Paragraph("No verified emissions results are available.", styles["CLBody"]))

    story.append(Paragraph("Monthly trend", styles["CLH2"]))
    if payload["monthly"]:
        story.append(_monthly_chart(payload["monthly"], styles))
        story.append(
            Paragraph(
                "Activity is assigned to the month in which the billing period ends. "
                "Bills that cross month boundaries are not pro-rated.",
                styles["CLSmall"],
            )
        )
    else:
        story.append(Paragraph("No dated records are available yet.", styles["CLBody"]))

    story.append(Paragraph("Intensity", styles["CLH2"]))
    intensity = payload["intensity"]
    intensity_rows = [
        [Paragraph("Metric", styles["CLCellHead"]), Paragraph("Value", styles["CLCellHead"])],
        [
            Paragraph("Units produced in the reporting period", styles["CLCell"]),
            Paragraph(_fmt_num(intensity.get("units_produced"), 0), styles["CLCell"]),
        ],
        [
            Paragraph("kg CO2e per unit produced", styles["CLCell"]),
            Paragraph(_fmt_num(intensity.get("kg_co2e_per_unit"), 4), styles["CLCell"]),
        ],
        [
            Paragraph("Revenue basis (annual, as provided)", styles["CLCell"]),
            Paragraph(
                f"Rs. {_fmt_num(intensity.get('annual_revenue'), 0)}"
                if intensity.get("annual_revenue")
                else "Not provided",
                styles["CLCell"],
            ),
        ],
        [
            Paragraph("kg CO2e per rupee of revenue", styles["CLCell"]),
            Paragraph(_fmt_num(intensity.get("kg_co2e_per_rupee"), 6), styles["CLCell"]),
        ],
    ]
    story.append(_table(intensity_rows, [100 * mm, 70 * mm]))
    story.append(
        Paragraph(
            "Intensity metrics are optional. They depend on production and revenue figures supplied by the business.",
            styles["CLSmall"],
        )
    )

    story.append(Paragraph("Data quality and completeness", styles["CLH2"]))
    mix = quality["mix"]
    quality_rows = [
        [Paragraph("Quality", styles["CLCellHead"]), Paragraph("Records", styles["CLCellHead"])],
        [Paragraph("High quality", styles["CLCell"]), Paragraph(str(mix.get("high", 0)), styles["CLCell"])],
        [Paragraph("Medium quality", styles["CLCell"]), Paragraph(str(mix.get("medium", 0)), styles["CLCell"])],
        [Paragraph("Low quality", styles["CLCell"]), Paragraph(str(mix.get("low", 0)), styles["CLCell"])],
        [
            Paragraph("Verification completeness", styles["CLCell"]),
            Paragraph(f"{payload['completeness_pct']:.1f}%", styles["CLCell"]),
        ],
        [
            Paragraph("Spend-based estimates", styles["CLCell"]),
            Paragraph(str(quality.get("spend_estimates", 0)), styles["CLCell"]),
        ],
    ]
    story.append(_table(quality_rows, [100 * mm, 70 * mm]))
    story.append(
        Paragraph(
            "High quality means activity-based data read with at least 85% overall confidence and no low-confidence critical field. "
            "Medium quality includes human-confirmed records with lower extraction confidence or review flags. "
            "Low quality means a spend-based estimate. All records shown below were manually verified before counting.",
            styles["CLSmall"],
        )
    )

    story.append(Paragraph("Emission factors used", styles["CLH2"]))
    if payload["factors"]:
        factor_rows = [
            [
                Paragraph("Activity", styles["CLCellHead"]),
                Paragraph("Factor", styles["CLCellHead"]),
                Paragraph("Source and version", styles["CLCellHead"]),
                Paragraph("Year", styles["CLCellHead"]),
                Paragraph("Status", styles["CLCellHead"]),
            ]
        ]
        for factor in payload["factors"]:
            status = factor["status"]
            colour = {1: "#2f6f4e", 2: "#b45309", 3: "#a33a2b"}.get(
                {"verified": 1, "demo": 2}.get(status, 3), "#14231c"
            )
            factor_rows.append(
                [
                    Paragraph(_e(factor["activity_key"]), styles["CLCell"]),
                    Paragraph(
                        f"{_fmt_num(factor['value'], 4)} kg CO2e/{_e(factor['unit'])}",
                        styles["CLCell"],
                    ),
                    Paragraph(
                        f"{_e(factor['source'])}<br/>{_e(factor.get('source_version') or '-')}",
                        styles["CLCell"],
                    ),
                    Paragraph(str(factor.get("year") or "-"), styles["CLCell"]),
                    Paragraph(f"<font color='{colour}'><b>{status.upper()}</b></font>", styles["CLCell"]),
                ]
            )
        story.append(_table(factor_rows, [34 * mm, 39 * mm, 61 * mm, 12 * mm, 24 * mm]))
        if any(factor["status"] != "verified" for factor in payload["factors"]):
            story.append(
                Paragraph(
                    "<b>Factor status notice:</b> some values above are DEMO or UNVERIFIED. "
                    "This report must not be used for buyer reporting until verified CEA/IPCC/DEFRA values are loaded "
                    "and the report is regenerated.",
                    styles["CLSmall"],
                )
            )
    else:
        story.append(Paragraph("No factors have been used yet.", styles["CLBody"]))

    story.append(Paragraph("Recommended actions", styles["CLH2"]))
    recommendations = payload.get("recommendations")
    if recommendations and recommendations.get("items"):
        story.append(Paragraph(_e(recommendations.get("summary", "")), styles["CLBody"]))
        for item in recommendations["items"]:
            metrics = []
            if item.get("est_tonnes_saved") is not None:
                metrics.append(f"{_fmt_num(item['est_tonnes_saved'], 3)} t CO2e / period")
            if item.get("est_rs_saved") is not None:
                metrics.append(f"Rs. {_fmt_num(item['est_rs_saved'], 0)} / period")
            heading = f"<b>{_e(item.get('title', 'Action'))}</b>"
            if metrics:
                heading += f" - estimate: {'; '.join(metrics)}"
            story.append(Paragraph(heading, styles["CLBody"]))
            story.append(Paragraph(_e(item.get("action", "")), styles["CLSmall"]))
            for assumption in item.get("assumptions", [])[:3]:
                story.append(Paragraph(_e(assumption), styles["CLBullet"], bulletText="-"))
        story.append(Paragraph(_e(recommendations.get("disclaimer", "")), styles["CLSmall"]))
    else:
        story.append(
            Paragraph(
                "No recommendations have been generated yet. Open the Recommendations screen to generate "
                "grounded actions from this footprint.",
                styles["CLBody"],
            )
        )

    story.append(Paragraph("Limitations and assumptions", styles["CLH2"]))
    for item in payload["limitations"]:
        story.append(Paragraph(item, styles["CLBullet"], bulletText="•"))

    story.append(PageBreak())
    story.append(Paragraph("Audit appendix", styles["CLH1"]))
    story.append(
        Paragraph(
            f"Every uploaded document is listed below with its source file, extracted activity data, and calculation. "
            f"{payload['audit']['counted']} counted, {payload['audit']['pending']} awaiting verification, "
            f"{payload['audit']['rejected']} rejected. Only counted records contribute to the totals.",
            styles["CLBody"],
        )
    )
    audit_rows = [
        [
            Paragraph("Record and source document", styles["CLCellHead"]),
            Paragraph("Calculation and factor", styles["CLCellHead"]),
            Paragraph("Result", styles["CLCellHead"]),
        ]
    ]
    for row in payload["audit"]["rows"]:
        document = row["document"]
        record = row["record"]
        result = row["result"]
        status = document["status"]
        source_cell = (
            f"<b>#{record.get('id') or document['id']}</b> {_e(record.get('vendor') or 'Vendor not set')}<br/>"
            f"{_fmt_period(record.get('billing_period_start'), record.get('billing_period_end'))}<br/>"
            f"{_e(document['original_filename'])}<br/>"
            f"Status: <b>{_e(status)}</b> | {_e(document.get('extraction_method') or '-')}"
        )
        if result:
            factor = result["factor"]
            calc_cell = (
                f"{_e(result['category_label'])} ({_e(result['scope_full_label'])})<br/>"
                f"{_e(result['formula_text'])}<br/>"
                f"Factor source: {_e(factor.get('source') or '-')}, {_e(factor.get('year') or '-')} "
                f"({_e(factor.get('status') or '-')})"
            )
            result_cell = (
                f"<b>{_fmt_num(result['kg_co2e'], 3)} kg CO2e</b><br/>"
                f"Quality: {_e(result['data_quality'])}<br/>Method: {_e(result['calc_method'])}"
            )
        else:
            reason = (
                "Awaiting human verification - not counted."
                if status in {"uploaded", "extracted"}
                else ("Rejected - excluded from totals." if status == "rejected" else "Not calculated.")
            )
            calc_cell = reason
            result_cell = "Not counted"
        audit_rows.append(
            [
                Paragraph(source_cell, styles["CLCell"]),
                Paragraph(calc_cell, styles["CLCell"]),
                Paragraph(result_cell, styles["CLCell"]),
            ]
        )
    story.append(_table(audit_rows, [62 * mm, 75 * mm, 33 * mm]))

    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Prepared with CarbonLite. The deterministic calculation engine and factor snapshots for each record "
            "are retained in the application database. Human verification is recorded per document.",
            styles["CLSmall"],
        )
    )

    doc.build(story, onFirstPage=on_first, onLaterPages=on_later)
    return buffer.getvalue()
