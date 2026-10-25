# CarbonLite

**Simple, auditable Scope 1 + Scope 2 carbon accounting for Tamil Nadu SMEs.**

CarbonLite turns electricity bills, diesel/petrol receipts, and LPG invoices into a buyer-ready footprint report. The AI reads documents. Python does the maths. A person confirms every record before it counts.

- **Frontend:** React + Vite + TypeScript + Tailwind + Recharts
- **Backend:** FastAPI + Pydantic + SQLAlchemy + SQLite (PostgreSQL-ready)
- **Reports:** ReportLab PDF and CSV with a full audit appendix
- **Demo:** a seeded Tamil Nadu textile supplier and a five-supplier buyer portfolio

> **Demo factor warning:** by default CarbonLite runs in `demo` factor mode. The values in `factors.demo.csv` are illustrative placeholders, **not** CEA/IPCC/DEFRA figures. Every demo report carries a DEMO watermark. The strict factor file contains `VERIFY_ME` placeholders; the app refuses to count or finalize a report while a used factor is unresolved.

---

## Why this is auditable

1. **The LLM only extracts.** The extraction prompt and Pydantic schema contain document fields (vendor, period, quantity, unit, amount, confidence). The model never receives a request to calculate or estimate emissions.
2. **Python does the maths.** A pure calculation engine (`backend/app/services/calculation.py`) multiplies confirmed activity data by a stored factor. It is deterministic and unit-tested.
3. **Every result is a snapshot.** Value, unit, source, version, year, region, and status are copied onto the emission result. Each result also stores an exact human-readable formula.
4. **A person confirms first.** Extracted records sit in a review queue. Confirming is what moves a record into totals; edits trigger recalculation; blocking edits remove it from totals again.
5. **Nothing is hidden.** The audit appendix lists every document, including pending and rejected ones, with its factor and formula.
6. **Bad factors stop the report.** A factor marked `VERIFY_ME` is treated as missing, never as zero. Records that need it cannot be counted and PDF/CSV downloads return HTTP 409 with the blocking problems.

Scope mapping: grid electricity is **Scope 2**; diesel, petrol, and LPG burned on site are **Scope 1**. Scope 3 is deliberately out of scope.

---

## Quick start

### Requirements

- Python **3.11+**
- Node.js **18+** (Node 24 was used here)
- Optional: a Tesseract binary if you want server-side OCR for phone photos
- Optional: an OpenAI-compatible API key for vision/text extraction

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API starts on `http://127.0.0.1:8000`; OpenAPI docs are at `/docs`.

On first start with `AUTO_SEED=true`, the app creates:
- **Sri Meenakshi Fabrics** (Tiruppur) — 6 months of electricity, diesel, and LPG records; the latest electricity bill is intentionally pending review.
- **Bharat Textiles Sourcing** — a buyer linked to five demo suppliers.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the backend.

### 3. Configuration

`backend/.env` is the live local configuration (no secrets needed). A documented template lives at the project root in `.env.example`; copy values from there if you rebuild the environment. Key settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FACTOR_MODE` | `demo` | `demo` = illustrative values + watermark; `strict` = real factor CSV + `VERIFY_ME` guard |
| `DATABASE_URL` | `sqlite:///./carbonlite.db` | SQLite by default; swap for `postgresql+psycopg://…` |
| `UPLOAD_DIR` | `./uploads` | Uploaded source documents (private to the supplier) |
| `AUTO_SEED` | `true` | Seed the clearly labelled demo supplier/buyer |
| `LLM_API_KEY` | empty | Optional OpenAI-compatible key; blank keeps the app fully usable via offline readers |
| `LLM_VISION_MODEL` / `LLM_TEXT_MODEL` | `gpt-4o` / `gpt-4o-mini` | Models used when a key is supplied |
| `MAX_UPLOAD_MB` | `15` | Per-file upload limit |
| `CORS_ORIGINS` | localhost:5173, 127.0.0.1:5173 | Allowed frontend origins |

No real emission factors or API keys are included.

### 4. Tests

```bash
# backend — 42 tests, uses a temporary database and upload directory
cd backend
python -m pytest -q

# frontend — typecheck and production build
cd frontend
npm run typecheck
npm run build
```

---

## Golden-path demo (under 60 seconds)

1. Open `http://127.0.0.1:5173`; choose **Open the demo supplier** (or go straight to `/dashboard`). Note the demo badge, factor notice, and seeded totals.
2. Go to **Upload bills** and click the **TNEB electricity bill May 2026** sample.
3. The offline PDF reader extracts **1,250 kWh**, TANGEDCO, 01–31 May 2026, and the bill amount. No AI key is required. The document is **not counted yet**.
4. Review the side-by-side fields, click **Confirm & count**.
5. The record now shows the calculation: `1,250 kWh × 0.71 kg CO2e/kWh (2026, IN) = 887.500 kg CO2e`, Scope 2, high quality, factor source and version. The audit trail records upload, read, confirmation, and calculation.
6. Edit the quantity to `1300` and save: the result recalculates to 923 kg CO2e and the audit trail records the edit. Clear the quantity and save: the record returns to **Needs review**, is removed from totals, and a blocking issue is shown. Restore it and confirm again when done.
7. Open **Report**: confirm “Ready to finalize”, the DEMO watermark, audit appendix, factor table, methodology and limitations. Download the PDF and CSV.
8. Open **Buyer view**: the portfolio and each supplier detail expose aggregates only — no bills, file URLs, or field values.

Try the same flow with the diesel and LPG samples. A duplicate file is rejected by content hash.

---

## Screens

| Route | What it does |
| --- | --- |
| `/` | Welcome: demo supplier or set up a business |
| `/onboarding` | Create a business, reporting period, optional intensity inputs |
| `/dashboard` | Simple totals, electricity vs fuel, monthly trend, quality, recent documents |
| `/upload` | Drag/drop, phone camera capture, or generated sample documents |
| `/verify` | Pending queue with low-confidence highlighting |
| `/records` | Every document, search/filter, audit activity |
| `/records/:id` | Side-by-side original vs extracted fields, recalculate, reject, full audit trail |
| `/recommendations` | Grounded actions from counted categories, with assumptions |
| `/report` | Buyer-ready report preview, methodology, factor table, audit appendix, PDF/CSV |
| `/factors` | Loaded factor CSV, source/year/region/status, `VERIFY_ME` guard explainer |
| `/buyer` | Buyer portfolio (aggregates only) |
| `/buyer/:buyerId/suppliers/:businessId` | Supplier disclosure (aggregates only) |

The layout is mobile-first: camera upload, bottom navigation, collapsible drawer, responsive tables/cards. English/Tamil navigation toggle is included; extraction supports Tamil and English documents with day-first dates.

---

## Architecture

```
backend/
  app/
    main.py                  FastAPI app, CORS, startup seed, /api prefix
    config.py                env loading (root .env then backend/.env)
    models.py                Business, Document, ExtractedRecord, EmissionFactor,
                             EmissionResult, AuditLog, Buyer, SupplierLink
    schemas.py               request/response models
    seed.py                  clearly labelled demo supplier + buyer
    routers/                 meta, business, documents, records, dashboard,
                             calculate, recommendations, report, factors, buyer, samples
    services/
      calculation.py         pure deterministic engine (frozen inputs, no DB, no LLM)
      factors.py             CSV loading, latest-year/region resolution, VERIFY_ME guard
      extraction/            LLM client, offline PDF parser, OCR, JSON repair, retry
      validation.py          severity-based issues, duplicates, sanity ranges
      dashboard.py           aggregation, quality/completeness, verify/recalc logic
      reporting/             report payloads + ReportLab PDF + CSV
      recommendations.py     deterministic, data-grounded actions
      buyer.py               aggregate-only buyer disclosure
      audit.py               append-only audit events
    data/
      factors.csv            strict placeholders, all VERIFY_ME
      factors.demo.csv       clearly labelled illustrative values
    tests/                   calculation + API flow tests (42)
frontend/
  src/
    pages/                   Welcome, Onboarding, Dashboard, Upload, VerifyQueue,
                             Records, RecordDetail, Recommendations, Report,
                             Factors, Buyer, NotFound
    components/              app shell, ui primitives, charts, error boundary
    lib/                     typed API client, types, formatting, i18n
sample_bills/                TNEB, diesel, and LPG samples (PDF + PNG)
```

### Calculation

`kg CO2e = activity data × emission factor`

- Electricity: units (kWh) × grid factor.
- Diesel/petrol: litres × fuel factor.
- LPG: kg × LPG factor.
- Missing quantity on a fuel bill: amount × spend proxy, explicitly marked `spend_estimate` with `low` data quality.
- Missing quantity on an electricity bill: blocking issue; no spend fallback is invented.
- Factor selection: newest year, preferred region, fallback to `ALL`.
- Quality: high/medium/low from field confidence, human edits, and fallback usage.

### API overview

All routes are under `/api`:

- `GET /health`, `GET /meta`, `GET /samples`
- `POST /business`, `GET /businesses`, `GET /business/{id}`
- `POST /documents/upload`, `GET /documents`, `GET /documents/{id}`, preview/file
- `GET /records`, `GET /records/{id}`, `PUT /records/{id}`
- `POST /records/{id}/verify`, `/reject`, `/reopen`
- `GET /business/{id}/audit`, `GET /dashboard/{id}`, `POST /calculate/{id}`
- `GET|POST /recommendations/{id}`
- `GET /report/{id}`, `/report/{id}/pdf`, `/report/{id}/csv`
- `GET /factors`, `POST /factors/reload`
- `GET /buyers`, `GET /buyer/{id}/suppliers`, `GET /buyer/{id}/suppliers/{businessId}`

Errors are structured. The report endpoints return **409** with `report_blocked` and a list of problems when a used factor is `VERIFY_ME` or a document is missing a result.

---

## Factor policy and strict mode

- `FACTOR_MODE=demo` loads `factors.demo.csv`. Values are illustrative; results carry `status=demo`, and PDFs/CSVs are watermarked DEMO.
- `FACTOR_MODE=strict` loads `factors.csv`, where every value is currently `VERIFY_ME`.
- A `VERIFY_ME` row has no usable value. Attempting to count a record that needs it raises a `FactorUnavailable` error. A report using such a record cannot finalize; PDF and CSV return 409 until a real value is supplied.
- Replace the placeholder values in `backend/app/data/factors.csv`, set `FACTOR_MODE=strict`, restart (or call `POST /factors/reload`), then recalculate records. Results snapshot the new provenance.

No emission factor values are recalled from model memory or estimated by the LLM.

---

## Testing and verified behaviour

Verified in this build:

- **42 backend tests pass** (deterministic engine + API flow), including:
  - electricity Scope 2 and diesel Scope 1 calculations, latest-year factor selection, region fallback
  - `VERIFY_ME` refusal, missing-factor refusal, unit-mismatch rejection, spend fallback quality
  - aggregation by scope/category/month, quality mix/score, intensity metrics
  - upload → extract → edit → verify → result → report flow using an actual sample PDF
  - duplicate upload rejection, blocking validation and report 409
  - unverified-factor report lock and recalculation error
  - buyer aggregate-only privacy (no file URLs or field values)
- **Frontend typecheck and production build pass.**
- **Live browser walkthrough:** seeded dashboard, review queue, record detail, edit/recalculate, blocking validation, records search/filter/audit, recommendations generation, factor search/filter/reload, buyer portfolio and supplier disclosure, report preview, PDF/CSV downloads, onboarding, mobile drawer, Tamil navigation toggle, and 404.
- **No AI calculation anywhere**; with no key configured, sample PDFs are read by the offline text-layer parser and images fall back to OCR if Tesseract is installed, otherwise manual entry.

The vision/text LLM path is implemented and validated against the Pydantic schema with one retry, but was not exercised here because no API key was supplied. The app remains fully usable without it.

---

## Out of scope and honest limitations

- Scope 3 categories, product-level footprints, benchmarking, offline-first sync, WhatsApp bot, and real authentication are not included.
- The demo is single-user and has no auth; do not expose it publicly as-is.
- Activity data is self-reported and human-confirmed, not third-party assured.
- Factors in demo mode are illustrative. Strict mode deliberately ships with placeholders that block finalization until edited.
- Spend-based estimates are directionally useful but low quality and cannot replace measured activity data.
- OCR of phone photos requires a Tesseract binary; without it, photos use manual entry rather than a guess.
- Intensity metrics rely on business-supplied production/revenue inputs and are not audited.
- The JavaScript bundle currently loads as one 834 kB chunk (229 kB gzip); route-level code splitting is the next performance improvement.

---

## Phase reports

### Phase 1 — Backend foundation, data model, factors
**Built:** FastAPI app, SQLAlchemy models for all eight entities, config/env handling, SQLite storage, CORS, health/meta endpoints, factor CSV loading and summarisation, clearly labelled demo seed.
**How to run and test:** start uvicorn, open `/docs`, `GET /api/meta`, `GET /api/factors`; inspect `factors.csv` vs `factors.demo.csv`.
**Next:** authentication and per-user businesses; factor provenance UI for editing without hand-editing CSVs.

### Phase 2 — Deterministic engine and unit tests
**Built:** pure calculation module with unit normalisation, activity/spend calculation paths, factor selection, quality grading, aggregation, intensity metrics, and explicit exceptions. 19 engine tests.
**How to run and test:** `cd backend && python -m pytest tests/test_calculation.py -q`.
**Next:** configurable factor regions beyond IN; additional activity types (natural gas, refrigerants) with the same snapshot contract.

### Phase 3 — Extraction pipeline and validation
**Built:** vision → text → offline PDF → OCR → manual fallback chain; strict JSON prompt; Pydantic validation with one retry; no arithmetic in prompts; offline parser for sample bills; duplicate detection; sanity/unit/fuel validation with errors vs warnings.
**How to run and test:** upload the sample PDFs via the API or UI; confirm the offline reader path and blocking/warning behaviour; attempt a duplicate upload.
**Next:** exercise against real Tamil receipts with an AI key and tune parser heuristics; image preprocessing for phone photos.

### Phase 4 — API flow and human review
**Built:** upload/list/detail, field editing with recalculation, verify/reject/reopen, audit events, dashboard, manual recalculation, structured errors. Identity-map bug fixed so verify responses include the freshly created result.
**How to run and test:** `cd backend && python -m pytest tests/test_api_flow.py -q`; walk the UI from upload to confirmed result.
**Next:** optimistic locking for concurrent reviewers; background queues for large batches.

### Phase 5 — PDF and CSV reports
**Built:** ReportLab PDF with cover, KPIs, monthly/category breakdowns, quality, factor table, recommendations, audit appendix, methodology, limitations; DEMO watermark; CSV with BOM; 409 guard with blocking problems.
**How to run and test:** open `/report`, download both formats; or `curl -i http://127.0.0.1:8000/api/report/1/pdf`.
**Next:** data-driven report templates for different buyer formats; signed report hashes.

### Phase 6 — Recommendations, buyer view, demo data
**Built:** deterministic recommendations grounded in counted categories with explicit assumptions; buyer portfolio and supplier detail exposing aggregates only; seeded five-supplier buyer portfolio; privacy whitelist for buyer payloads.
**How to run and test:** generate actions on `/recommendations`; open `/buyer` and a supplier detail; run the buyer privacy test in `test_api_flow.py`.
**Next:** buyer sharing links with expiry; supplier-requested data quality actions.

### Phase 7 — Frontend
**Built:** mobile-first React app with all screens, review side-by-side layout, charts, confidence highlighting, factor explorer, buyer view, onboarding, EN/Tamil navigation, error boundary, query caching, production build.
**How to run and test:** `cd frontend && npm run dev`; use a mobile viewport for camera/bottom nav; `npm run build`.
**Next:** route-level code splitting; full Tamil translation of page copy; service worker for PWA installability.

### Phase 8 — End-to-end verification and docs
**Built:** live browser verification of the golden path and edge cases, copy/percentage/link-label fixes, privacy and factor-guard tests, README and phase log.
**How to run and test:** `cd backend && python -m pytest -q`; `cd frontend && npm run typecheck && npm run build`; follow the golden-path demo above.
**Next:** deployment hardening (auth, Postgres, object storage, backups), independent factor verification, and accessibility audit.

---

**CarbonLite principle:** the AI reads documents, Python calculates emissions, a person confirms the record, and every number keeps its receipt.
