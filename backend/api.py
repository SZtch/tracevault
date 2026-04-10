"""
TraceVault - FastAPI backend
Endpoints for indexing and searching incidents via VectorAI DB.

Deployment targets:
  - Local dev: uvicorn api:app --reload --port 8000
  - Railway:   PORT injected by Railway; CMD reads it via shell form in Dockerfile
"""

import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, TypeAdapter, field_validator

# Load .env for local dev; no-op in Railway (Railway injects env vars directly)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from vectordb import index_incidents, search_incidents, get_status, get_collection_meta, get_incident_count
from triage import generate_triage_brief

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("tracevault")

app = FastAPI(title="TraceVault API", version="1.0.0")


# ── CORS ──────────────────────────────────────────────────────────────────────
# Production: set FRONTEND_URL=https://your-app.vercel.app in Railway backend env.
# Development: ALLOWED_ORIGINS=* (default) or leave both vars unset.

_ENV          = os.getenv("RAILWAY_ENVIRONMENT_NAME", os.getenv("ENV", "development"))
_FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip()

if _FRONTEND_URL:
    _ORIGINS = [_FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"]
    log.info("CORS restricted to: %s", _ORIGINS)
else:
    _raw = os.getenv("ALLOWED_ORIGINS", "*")
    _ORIGINS = _raw.split(",") if _raw != "*" else ["*"]
    log.info("CORS open (set FRONTEND_URL to restrict in production)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=_FRONTEND_URL != "",
)


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    """Log config on boot — critical for debugging Railway deployments."""
    from vectordb import DB_ADDR, COLLECTION, DIM
    log.info("TraceVault backend starting")
    log.info("  VectorAI DB : %s", DB_ADDR)
    log.info("  Collection  : %s", COLLECTION)
    log.info("  Dim         : %d", DIM)
    log.info("  Environment : %s", _ENV)
    log.info("  Frontend URL: %s", _FRONTEND_URL or "(not set — CORS open)")
    from triage import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
    log.info("  Triage brief: %s", f"enabled (model={ANTHROPIC_MODEL})" if ANTHROPIC_API_KEY else "disabled (ANTHROPIC_API_KEY not set)")


# ── Severity ──────────────────────────────────────────────────────────────────

# Canonical severity levels — any value outside this set is rejected at the
# schema layer, both for indexing (IncidentInput) and search filters (SearchRequest).
SeverityLiteral = Literal["critical", "high", "medium", "low"]

_ISO_DATE_RE      = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO_DATETIME_RE  = re.compile(r"^(\d{4}-\d{2}-\d{2})T")


# ── Schema: IncidentInput ─────────────────────────────────────────────────────

class IncidentInput(BaseModel):
    """
    Canonical schema for a single incident document.

    Validation rules:
    - title is the only required field.
    - All string fields are stripped; length caps prevent payload bloat in the vector DB.
    - severity is constrained to four canonical levels; defaults to "medium".
    - tags is a typed List[str] — not a free-form dict blob.
    - date, when provided, must be ISO-8601 (YYYY-MM-DD) and a valid calendar date.
    """

    id:            Optional[str]       = Field(None,             max_length=128)
    title:         str                  = Field(..., min_length=1, max_length=300)
    service:       Optional[str]       = Field(None,             max_length=100)
    component:     Optional[str]       = Field(None,             max_length=100)
    severity:      SeverityLiteral     = "medium"
    date:          Optional[str]       = None
    error_message: Optional[str]       = Field(None,             max_length=2000)
    root_cause:    Optional[str]       = Field(None,             max_length=5000)
    fix:           Optional[str]       = Field(None,             max_length=5000)
    stack_trace:   Optional[str]       = Field(None,             max_length=10000)
    tags:          List[str]           = Field(default_factory=list)

    # ── Strip whitespace from all string fields before other validators run ──

    @field_validator(
        "id", "title", "service", "component",
        "error_message", "root_cause", "fix", "stack_trace",
        mode="before",
    )
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v

    # ── Tags: accept list-of-strings or a comma-joined string ───────────────

    @field_validator("tags", mode="before")
    @classmethod
    def _coerce_tags(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        if isinstance(v, list):
            result = []
            for i, tag in enumerate(v):
                if not isinstance(tag, str):
                    raise ValueError(
                        f"tags[{i}] must be a string, got {type(tag).__name__!r}"
                    )
                stripped = tag.strip()
                if len(stripped) > 80:
                    raise ValueError(
                        f"tags[{i}] is too long (max 80 chars): {stripped[:40]!r}…"
                    )
                if stripped:
                    result.append(stripped)
            if len(result) > 30:
                raise ValueError(f"too many tags: got {len(result)}, max 30")
            return result
        raise ValueError("tags must be a list of strings or a comma-separated string")

    # ── Date: require ISO-8601 YYYY-MM-DD or None ───────────────────────────

    @field_validator("date", mode="after")
    @classmethod
    def _validate_date(cls, v: Optional[str]) -> Optional[str]:
        """
        Accept either YYYY-MM-DD or ISO-8601 datetime (YYYY-MM-DDTHH:MM:SSZ).
        Datetimes are normalised to the date portion so the DB stores a
        consistent format regardless of what the upstream system provides.
        """
        if not v:
            return None
        # Normalise datetime → date  (e.g. "2024-11-15T03:22:00Z" → "2024-11-15")
        dt_match = _ISO_DATETIME_RE.match(v)
        if dt_match:
            v = dt_match.group(1)
        if not _ISO_DATE_RE.match(v):
            raise ValueError(
                f"date must be ISO-8601 YYYY-MM-DD or a full datetime, got {v!r}"
            )
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"date is not a valid calendar date: {v!r}")
        return v

    # ── title must not be blank after stripping ──────────────────────────────

    @field_validator("title", mode="after")
    @classmethod
    def _title_not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("title cannot be blank or whitespace only")
        return v

    def to_dict(self) -> Dict[str, Any]:
        """Serialise to the plain dict that vectordb.index_incidents expects."""
        return self.model_dump(exclude_none=False)


# ── Schema: SearchRequest ─────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    """
    Search parameters.

    - query must be non-empty and non-whitespace (max 1000 chars).
    - top_k is capped to [1, 50] — prevents accidental full-collection scans.
    - severity must be one of the four canonical levels or omitted.
    - service is a freeform string filter (matched by the DB).
    """

    query:    str                                         = Field(..., min_length=1, max_length=1000)
    top_k:    Annotated[int, Field(ge=1, le=50)]         = 5
    severity: Optional[SeverityLiteral]                  = None
    service:  Optional[str]                              = Field(None, max_length=100)

    @field_validator("query", mode="after")
    @classmethod
    def _query_not_whitespace(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("query cannot be blank or whitespace only")
        return stripped

    @field_validator("service", mode="before")
    @classmethod
    def _strip_service(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip() or None
        return v


# ── Schema: IndexRequest ──────────────────────────────────────────────────────

class IndexRequest(BaseModel):
    """Batch index request. Every incident is fully validated before any DB write."""

    incidents: Annotated[List[IncidentInput], Field(min_length=1)]


# ── Typed adapter for file / default-dataset routes ──────────────────────────

# Validates a bare JSON array as List[IncidentInput] without a wrapper model.
_IncidentListTA: TypeAdapter[List[IncidentInput]] = TypeAdapter(
    Annotated[List[IncidentInput], Field(min_length=1)]
)


# ── Error handling ─────────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def _validation_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Flatten FastAPI's default 422 body into human-readable field paths.

    Default format buries field locations in nested tuples; this makes them
    readable at a glance in the browser, in Railway logs, and in curl output.

    Shape:
      { "detail": "Request validation failed",
        "errors": [ { "field": "incidents → 0 → severity", "message": "…", "type": "…" } ] }
    """
    errors = []
    for e in exc.errors():
        loc = " → ".join(str(p) for p in e["loc"] if p != "body")
        errors.append({
            "field":   loc or "(root)",
            "message": e["msg"],
            "type":    e["type"],
        })
    log.warning(
        "Validation error on %s %s: %s",
        request.method, request.url.path, errors,
    )
    return JSONResponse(
        status_code=422,
        content={"detail": "Request validation failed", "errors": errors},
    )


def _db_error(e: Exception) -> HTTPException:
    """
    503 for DB connectivity issues (Railway misconfigured VECTORAI_DB_ADDR, DB service
    not started, etc.), 500 for everything else.
    """
    msg = str(e)
    if any(kw in msg.lower() for kw in ("not installed", "connection", "unavailable", "refused", "timeout")):
        log.error("VectorAI DB unreachable: %s", msg)
        return HTTPException(
            status_code=503,
            detail=f"VectorAI DB not reachable — check VECTORAI_DB_ADDR ({msg})",
        )
    log.error("Internal error: %s", msg)
    return HTTPException(status_code=500, detail=msg)


def _to_dicts(incidents: List[IncidentInput]) -> List[Dict[str, Any]]:
    return [inc.to_dict() for inc in incidents]


def _pydantic_errors_to_list(exc: Exception) -> list:
    """Extract a flat list of field-error dicts from a Pydantic ValidationError."""
    if not hasattr(exc, "errors"):
        return [{"field": "(root)", "message": str(exc)}]
    return [
        {
            "field":   " → ".join(str(p) for p in e["loc"]),
            "message": e["msg"],
            "type":    e["type"],
        }
        for e in exc.errors()
    ]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """DB connection + collection status. Used by Railway healthcheck and StatusBar."""
    status = get_status()
    status["incident_count"] = get_incident_count()
    return status


@app.get("/meta")
def meta():
    """Distinct services and severities currently indexed. Drives frontend filter dropdowns."""
    return get_collection_meta()


@app.post("/index")
def index(req: IndexRequest):
    """
    Index a list of incidents into VectorAI DB.
    Every incident is schema-validated before any DB write is attempted.
    """
    try:
        count = index_incidents(_to_dicts(req.incidents))
        return {"indexed": count, "status": "ok"}
    except Exception as e:
        raise _db_error(e)


@app.post("/index/file")
async def index_from_file(file: UploadFile = File(...)):
    """
    Upload a JSON file of incidents and index them.
    Accepts a JSON array; each element is validated against IncidentInput
    before any data reaches the vector DB.
    """
    try:
        content = await file.read()
        raw = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"File is not valid JSON: {exc.msg} (line {exc.lineno}, col {exc.colno})",
        )

    if not isinstance(raw, list):
        raise HTTPException(
            status_code=422,
            detail="Expected a JSON array of incident objects at the top level",
        )

    try:
        incidents = _IncidentListTA.validate_python(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "One or more incidents failed validation",
                "errors":  _pydantic_errors_to_list(exc),
            },
        )

    try:
        count = index_incidents(_to_dicts(incidents))
        return {"indexed": count, "filename": file.filename, "status": "ok"}
    except Exception as e:
        raise _db_error(e)


@app.post("/index/default")
def index_default():
    """
    Index the built-in sample incident dataset.
    Works both locally (reads from ../data/incidents.json) and on Railway
    (data/ is baked into the Docker image via COPY . .).
    The dataset is run through IncidentInput validation before indexing.
    """
    sample_path = Path(__file__).parent.parent / "data" / "incidents.json"
    if not sample_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Sample dataset not found inside container",
        )

    try:
        raw = json.loads(sample_path.read_text())
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Sample dataset is not valid JSON: {exc.msg}",
        )

    try:
        incidents = _IncidentListTA.validate_python(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Sample dataset failed validation — check data/incidents.json",
                "errors":  _pydantic_errors_to_list(exc),
            },
        )

    try:
        count = index_incidents(_to_dicts(incidents))
        return {"indexed": count, "source": "sample_dataset", "status": "ok"}
    except Exception as e:
        raise _db_error(e)


@app.post("/search")
def search(req: SearchRequest):
    """Semantic similarity search with match explanation and optional triage brief."""
    try:
        results = search_incidents(
            query    = req.query,
            top_k    = req.top_k,
            severity = req.severity,
            service  = req.service,
        )
        # Generate triage brief from retrieved incidents only.
        # Returns None if ANTHROPIC_API_KEY is unset or the call fails —
        # in either case the normal results are returned unaffected.
        triage_brief = generate_triage_brief(query=req.query, results=results)
        return {
            "query":        req.query,
            "results":      results,
            "count":        len(results),
            "triage_brief": triage_brief,
        }
    except Exception as e:
        raise _db_error(e)


# ── Webhook: PagerDuty ingest ─────────────────────────────────────────────────
#
# Accepts a simplified PagerDuty-style webhook payload and indexes it directly
# into VectorAI DB. No signature validation, no lifecycle sync, no deduplication.
# Designed for demo use and real ingest when PagerDuty webhooks are configured.
#
# PagerDuty webhook setup:
#   Service → Integrations → Add webhook → URL: https://your-backend/webhooks/pagerduty
#
# Local demo (offline):
#   curl -X POST http://localhost:8000/webhooks/pagerduty \
#     -H "Content-Type: application/json" \
#     -d '{
#       "event": {
#         "event_type": "incident.triggered",
#         "data": {
#           "id": "Q1A2B3C4",
#           "title": "HikariPool connection not available — user-service",
#           "urgency": "high",
#           "service": {"name": "user-service"},
#           "created_at": "2025-04-10T03:22:00Z",
#           "body": {"details": "HikariPool-1 - Connection is not available, request timed out after 30000ms"}
#         }
#       }
#     }'

_PD_URGENCY_MAP: Dict[str, str] = {
    "critical": "critical",
    "high":     "high",
    "low":      "low",
    "medium":   "medium",
}


class PagerDutyWebhook(BaseModel):
    """
    Simplified PagerDuty V3 webhook envelope.
    Only the fields TraceVault needs for ingest are extracted.
    Extra fields are ignored.
    """
    class Config:
        extra = "allow"

    event: Dict[str, Any]


def _normalize_pd(payload: PagerDutyWebhook) -> Dict[str, Any]:
    """
    Map PagerDuty webhook fields to TraceVault's internal incident schema.
    Safe placeholders are used for fields unavailable at ingest time.
    """
    data = payload.event.get("data", {})

    # ID — PagerDuty incident ID or fallback
    incident_id = str(data.get("id", "")).strip() or None

    # Title — required; fall back to event type if missing
    title = (
        str(data.get("title", "")).strip()
        or payload.event.get("event_type", "Untitled PagerDuty incident")
    )

    # Service name
    svc_block = data.get("service", {})
    service = (
        str(svc_block.get("name", "")).strip()
        if isinstance(svc_block, dict) else None
    ) or None

    # Severity — map PagerDuty urgency to TraceVault severity
    urgency  = str(data.get("urgency", "")).lower().strip()
    severity = _PD_URGENCY_MAP.get(urgency, "medium")

    # Date — normalize ISO-8601 datetime to YYYY-MM-DD
    raw_date = str(data.get("created_at", "")).strip()
    date: Optional[str] = None
    if raw_date:
        dt_match = _ISO_DATETIME_RE.match(raw_date)
        date = dt_match.group(1) if dt_match else (raw_date[:10] if len(raw_date) >= 10 else None)

    # Error message — from body.details or summary
    body        = data.get("body", {})
    err_details = str(body.get("details", "")).strip() if isinstance(body, dict) else ""
    summary     = str(data.get("summary", "")).strip()
    error_message = (err_details or summary or None)
    if error_message:
        error_message = error_message[:2000]

    return {
        "id":            incident_id,
        "title":         title[:300],
        "service":       service,
        "severity":      severity,
        "date":          date,
        "error_message": error_message,
        "root_cause":    "Unknown at ingest time — update after investigation.",
        "fix":           "Pending investigation.",
        "tags":          ["pagerduty", "webhook"],
    }


@app.post("/webhooks/pagerduty")
def webhook_pagerduty(payload: PagerDutyWebhook):
    """
    Ingest a PagerDuty webhook and index it into VectorAI DB.

    The incident is immediately searchable after this call returns.
    Existing manual indexing flows (/index, /index/file, /index/default) are unchanged.

    Local demo:
      curl -X POST http://localhost:8000/webhooks/pagerduty \\
        -H "Content-Type: application/json" \\
        -d '{
          "event": {
            "event_type": "incident.triggered",
            "data": {
              "id": "Q1A2B3C4",
              "title": "HikariPool connection not available — user-service",
              "urgency": "high",
              "service": {"name": "user-service"},
              "created_at": "2025-04-10T03:22:00Z",
              "body": {"details": "HikariPool-1 - Connection is not available, request timed out after 30000ms"}
            }
          }
        }'
    """
    try:
        normalized = _normalize_pd(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Payload normalization failed: {e}")

    try:
        incident = IncidentInput(**normalized)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Normalized payload failed schema validation",
                "errors":  _pydantic_errors_to_list(exc),
            },
        )

    try:
        count = index_incidents([incident.to_dict()])
        return {
            "status":      "ok",
            "indexed":     count,
            "incident_id": normalized.get("id") or "(generated)",
            "source":      "pagerduty_webhook",
        }
    except Exception as e:
        raise _db_error(e)
