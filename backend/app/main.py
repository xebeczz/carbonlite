from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from .config import settings
from .database import SessionLocal, init_db
from .routers import (
    business,
    buyer,
    calculate,
    dashboard,
    documents,
    factors,
    meta,
    recommendations,
    records,
    report,
    samples,
)
from .seed import ensure_demo_data
from .services.factors import load_factors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("carbonlite")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    with SessionLocal() as db:
        factor_summary = load_factors(db)
        seed_summary = ensure_demo_data(db)
    app.state.factor_summary = factor_summary
    app.state.seed_summary = seed_summary
    logger.info(
        "CarbonLite ready: factor_mode=%s factors=%s demo_seed=%s",
        settings.factor_mode,
        factor_summary.get("loaded"),
        seed_summary.get("created"),
    )
    yield


app = FastAPI(
    title="CarbonLite API",
    version=settings.version,
    description=(
        "Simple Scope 1 and Scope 2 carbon accounting for small suppliers. "
        "Documents are read by an extraction pipeline; every emission number is produced by a "
        "deterministic calculation engine with a source, factor year, and formula. "
        "Demo data is clearly labelled. Verify emission factors before real use."
    ),
    lifespan=lifespan,
    openapi_tags=[
        {"name": "System", "description": "Health and runtime configuration."},
        {"name": "Business", "description": "Create and list supplier businesses."},
        {"name": "Documents", "description": "Upload bills, receipts, and invoices and read extracted fields."},
        {"name": "Records", "description": "Human review, editing, confirmation, rejection, and audit trail."},
        {"name": "Calculation", "description": "Deterministic emissions recalculation."},
        {"name": "Dashboard", "description": "Footprint totals, scopes, monthly trend, and data quality."},
        {"name": "Emission factors", "description": "Factor table with source, year, region, and verification status."},
        {"name": "Recommendations", "description": "Grounded actions derived from counted emissions."},
        {"name": "Reports", "description": "Auditable PDF and CSV reports with finalization guards."},
        {"name": "Buyer view", "description": "Read-only aggregate view for buyers and their suppliers."},
        {"name": "Sample documents", "description": "Bundled sample bills for the demo golden path."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-CarbonLite-Demo"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for error in exc.errors():
        location = " → ".join(str(part) for part in error.get("loc", []) if part != "body")
        errors.append({"field": location, "message": error.get("msg", "Invalid value")})
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "message": "Some fields are invalid. Check the highlighted values.",
                "errors": errors,
            }
        },
    )


@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "message": "The database could not complete that request. Please try again.",
                "code": "database_error",
            }
        },
    )


for router in (
    meta.router,
    business.router,
    documents.router,
    records.router,
    calculate.router,
    dashboard.router,
    factors.router,
    recommendations.router,
    report.router,
    buyer.router,
    samples.router,
):
    app.include_router(router, prefix="/api")


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "app": settings.app_name,
        "version": settings.version,
        "api": "/api",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/health", include_in_schema=False)
def root_health() -> dict:
    return {"status": "ok", "version": settings.version}
