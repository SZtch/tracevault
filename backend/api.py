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

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, UploadFile, File
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

from vectordb import index_incidents, search_incidents, get_status, get_collection_meta, get_incident_count, get_all_incidents, update_incident_resolution, get_resolved_incidents, delete_incident, update_incident_fields
from triage import generate_triage_brief
from slack_notifier import notify_slack_autopilot


# ── Autopilot helper ──────────────────────────────────────────────────────────
# Shared by both webhook endpoints. Runs in a FastAPI BackgroundTask so the
# webhook caller receives 200 immediately — Anthropic + Slack latency never
# blocks the response.

def _run_autopilot(normalized: dict) -> None:
    """Search for similar incidents, generate triage brief, and notify Slack."""
    try:
        query = " ".join(filter(None, [normalized.get("title"), normalized.get("error_message")]))
        if not query.strip():
            return
        similar = search_incidents(query=query, top_k=3)
        brief   = generate_triage_brief(query=query, results=similar)
        notify_slack_autopilot(incident=normalized, results=similar, brief=brief)
    except Exception as e:
        log.warning("Autopilot error (non-fatal): %s", e)

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

    # Auto-index sample dataset on first boot if collection is empty.
    # Controlled by AUTO_INDEX_DEFAULT=true (env var) — off by default in prod.
    if os.getenv("AUTO_INDEX_DEFAULT", "false").lower() == "true":
        try:
            from vectordb import get_incident_count, index_incidents
            if get_incident_count() == 0:
                sample_path = Path(__file__).parent.parent / "data" / "incidents.json"
                if sample_path.exists():
                    raw = json.loads(sample_path.read_text())
                    result = index_incidents(raw)
                    log.info("Auto-indexed %d sample incidents from data/incidents.json", result["indexed"])
                else:
                    log.warning("AUTO_INDEX_DEFAULT=true but data/incidents.json not found")
            else:
                log.info("Auto-index skipped — collection already has data")
        except Exception as e:
            log.warning("Auto-index failed (non-fatal): %s", e)


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
    - date_from / date_to are inclusive YYYY-MM-DD bounds (Python-side filtered).
    - tags is a list of tag strings; incident must match at least one.
    """

    query:     str                                         = Field(..., min_length=1, max_length=1000)
    top_k:     Annotated[int, Field(ge=1, le=50)]         = 5
    severity:  Optional[SeverityLiteral]                  = None
    service:   Optional[str]                              = Field(None, max_length=100)
    date_from: Optional[str]                              = None
    date_to:   Optional[str]                              = None
    tags:      Optional[List[str]]                        = None

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

    @field_validator("date_from", "date_to", mode="after")
    @classmethod
    def _validate_date_filter(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        if not _ISO_DATE_RE.match(v):
            raise ValueError(f"date filter must be YYYY-MM-DD, got {v!r}")
        return v


# ── Schema: IndexRequest ──────────────────────────────────────────────────────

class IndexRequest(BaseModel):
    """Batch index request. Every incident is fully validated before any DB write."""

    incidents:       Annotated[List[IncidentInput], Field(min_length=1)]
    skip_duplicates: bool = Field(False, description="Skip incidents whose ID already exists in the index.")


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


@app.get("/incidents")
def list_incidents():
    """Return all incident IDs and titles for frontend dropdowns (delete/update panels)."""
    try:
        incidents = get_all_incidents()
        return {
            "incidents": [
                {
                    "incident_id": i.get("incident_id"),
                    "title":       i.get("title", ""),
                    "severity":    i.get("severity", "medium"),
                }
                for i in incidents
                if i.get("incident_id") and i.get("incident_id") != "UNKNOWN"
            ]
        }
    except Exception as e:
        raise _db_error(e)



@app.post("/extract-from-image")
async def extract_from_image(file: UploadFile = File(...)):
    """
    Accept an image file (PNG, JPG, WEBP, GIF) and use Claude Vision to extract
    any error messages, stack traces, or log text visible in the screenshot.
    Returns the extracted text ready to paste into the search box.
    Requires ANTHROPIC_API_KEY.
    """
    from triage import ANTHROPIC_API_KEY, ANTHROPIC_MODEL

    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Image extraction requires ANTHROPIC_API_KEY — not configured on this instance.",
        )

    # Validate content type
    ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    content_type = file.content_type or ""
    if content_type not in ALLOWED:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{content_type}'. Upload a PNG, JPG, WEBP, or GIF.",
        )

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large — maximum 5MB.")

    import base64
    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed.")

    image_data = base64.standard_b64encode(content).decode("utf-8")

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type":       "base64",
                                "media_type": content_type,
                                "data":       image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Extract all error messages, exception names, stack trace lines, and log output "
                                "visible in this screenshot. Output only the raw extracted text — no commentary, "
                                "no formatting, no explanation. If there is no error or log content visible, "
                                "output exactly: NO_ERROR_CONTENT_FOUND"
                            ),
                        },
                    ],
                }
            ],
        )
        extracted = message.content[0].text.strip()
        if extracted == "NO_ERROR_CONTENT_FOUND" or not extracted:
            raise HTTPException(
                status_code=422,
                detail="No error or log content found in the image. Try a clearer screenshot.",
            )
        return {"extracted_text": extracted}
    except HTTPException:
        raise
    except Exception as e:
        log.error("Image extraction failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")


@app.post("/index")
def index(req: IndexRequest):
    """
    Index a list of incidents into VectorAI DB.
    Every incident is schema-validated before any DB write is attempted.
    """
    try:
        result = index_incidents(_to_dicts(req.incidents), skip_duplicates=req.skip_duplicates)
        return {"indexed": result["indexed"], "skipped": result["skipped"], "duplicate_ids": result["duplicate_ids"], "status": "ok"}
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
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="File too large — maximum upload size is 10 MB",
            )
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
        result = index_incidents(_to_dicts(incidents))
        return {"indexed": result["indexed"], "skipped": result["skipped"], "duplicate_ids": result["duplicate_ids"], "filename": file.filename, "status": "ok"}
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
        result = index_incidents(_to_dicts(incidents), skip_duplicates=True)
        return {"indexed": result["indexed"], "skipped": result["skipped"], "duplicate_ids": result["duplicate_ids"], "source": "sample_dataset", "status": "ok"}
    except Exception as e:
        raise _db_error(e)


@app.post("/search")
def search(req: SearchRequest):
    """Semantic similarity search with match explanation and optional triage brief."""
    try:
        results = search_incidents(
            query     = req.query,
            top_k     = req.top_k,
            severity  = req.severity,
            service   = req.service,
            date_from = req.date_from,
            date_to   = req.date_to,
            tags      = req.tags or None,
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


@app.get("/analytics/recurring")
def recurring_failures(top_k: int = 10):
    """
    Detect recurring failure patterns across all indexed incidents.
    Groups by failure_mode if available, falls back to keyword clustering
    from title + error_message. Returns the most frequent patterns.
    """
    try:
        incidents = get_all_incidents()
    except Exception as e:
        raise _db_error(e)

    if not incidents:
        return {"patterns": [], "total_incidents": 0}

    # ── Keyword-based failure family detection ────────────────────────────────
    _FAILURE_KEYWORDS = [
        ("connection pool exhaustion",  ["hikari", "pool", "connection not available", "connection timeout"]),
        ("memory / OOM",               ["oom", "out of memory", "memory pressure", "heap", "killed"]),
        ("grpc / timeout",             ["grpc", "deadline exceeded", "timeout", "latency spike"]),
        ("queue / kafka backlog",       ["kafka", "consumer lag", "queue", "backlog", "batch"]),
        ("upstream / 5xx cascade",     ["504", "502", "upstream", "gateway", "payment", "cascade"]),
        ("disk / storage",             ["disk", "storage", "inode", "volume", "full"]),
        ("auth / token",               ["auth", "token", "jwt", "session", "login", "forbidden"]),
        ("database / query",           ["database", "query", "slow query", "index", "deadlock", "db"]),
        ("deployment / rollout",       ["deploy", "rollout", "pod", "restart", "crashloop", "readiness"]),
        ("search / indexing",          ["search", "elastic", "index", "reindex"]),
    ]

    def _detect_family(inc: dict) -> str:
        # failure_mode is computed dynamically during search, not stored in payload.
        # Use keyword matching on title + error_message + root_cause.
        haystack = " ".join([
            (inc.get("title") or ""),
            (inc.get("error_message") or ""),
            (inc.get("root_cause") or ""),
        ]).lower()

        for family, keywords in _FAILURE_KEYWORDS:
            if any(kw in haystack for kw in keywords):
                return family

        return "other"

    from collections import defaultdict
    groups: dict = defaultdict(list)
    for inc in incidents:
        family = _detect_family(inc)
        groups[family].append(inc)

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    patterns = []
    for mode, incs in groups.items():
        severities   = [i.get("severity", "medium") for i in incs]
        services     = sorted({i.get("service") for i in incs if i.get("service")})
        dates        = sorted([i.get("date") for i in incs if i.get("date")], reverse=True)
        top_severity = min(severities, key=lambda s: severity_order.get(s, 99))

        samples = [
            {
                "id":       i.get("incident_id"),
                "title":    i.get("title"),
                "date":     i.get("date"),
                "severity": i.get("severity"),
                "service":  i.get("service"),
                "fix":      i.get("fix"),
            }
            for i in incs[:3]
        ]

        patterns.append({
            "failure_mode":      mode,
            "count":             len(incs),
            "top_severity":      top_severity,
            "affected_services": services,
            "latest_date":       dates[0] if dates else None,
            "samples":           samples,
        })

    patterns.sort(key=lambda x: x["count"], reverse=True)

    return {
        "patterns":        patterns[:top_k],
        "total_incidents": len(incidents),
        "total_patterns":  len(patterns),
    }



# ── Resolution Tracking ───────────────────────────────────────────────────────

class ResolveRequest(BaseModel):
    """
    Payload for marking an incident as resolved.

    resolution_status:
      "resolved"  — fix was applied, incident closed.
      "confirmed" — fix has been verified to work (stronger signal).

    confirmed_fix:
      Optional. Engineer-provided fix text. When set, overrides the original
      'fix' field in search results — it's treated as the ground-truth solution.

    resolved_by:
      Optional. Free-text identifier (name, team, Slack handle).
    """
    resolution_status: Literal["resolved", "confirmed"] = "resolved"
    confirmed_fix:     Optional[str] = Field(None, max_length=5000)
    resolved_by:       Optional[str] = Field(None, max_length=100)


@app.patch("/incidents/{incident_id}/resolve")
def resolve_incident(incident_id: str, req: ResolveRequest):
    """
    Mark an incident as resolved and optionally confirm what fix worked.

    When confirmed_fix is provided, search results for similar future incidents
    will surface this as the verified fix — making the DB progressively smarter.

    Example:
      curl -X PATCH http://localhost:8000/incidents/INC-001/resolve \\
        -H 'Content-Type: application/json' \\
        -d '{"resolution_status": "confirmed", "confirmed_fix": "Increased HikariCP pool size to 30", "resolved_by": "platform-team"}'
    """
    try:
        found = update_incident_resolution(
            incident_id       = incident_id,
            resolution_status = req.resolution_status,
            confirmed_fix     = req.confirmed_fix,
            resolved_by       = req.resolved_by,
        )
    except Exception as e:
        raise _db_error(e)

    if not found:
        raise HTTPException(
            status_code = 404,
            detail      = f"Incident '{incident_id}' not found in the index.",
        )

    return {
        "incident_id":      incident_id,
        "resolution_status": req.resolution_status,
        "confirmed_fix":    req.confirmed_fix,
        "resolved_by":      req.resolved_by,
        "message":          f"Incident marked as {req.resolution_status}.",
    }


@app.delete("/incidents/{incident_id}")
def delete_incident_endpoint(incident_id: str):
    """
    Delete an incident from the index by its string ID (e.g. "INC-001").

    Use this to remove incorrectly indexed incidents, duplicates, or test data.
    This operation is irreversible — the incident cannot be recovered after deletion.

    Example:
      curl -X DELETE http://localhost:8000/incidents/INC-001
    """
    try:
        found = delete_incident(incident_id)
    except Exception as e:
        raise _db_error(e)

    if not found:
        raise HTTPException(
            status_code=404,
            detail=f"Incident '{incident_id}' not found in the index.",
        )

    return {
        "incident_id": incident_id,
        "deleted":     True,
        "message":     f"Incident '{incident_id}' deleted from index.",
    }


class UpdateIncidentRequest(BaseModel):
    """
    Payload for updating editable fields on an existing incident.

    All fields are optional — only provided fields are updated.
    Omitted fields retain their current values.

    Editable: title, service, component, severity, date,
              error_message, root_cause, fix, stack_trace, tags.

    Read-only (managed by system): id, resolution_status, confirmed_fix,
              resolved_by, resolved_at, retrieval_text, exception_class.

    When stack_trace is updated, exception_class and stack_methods are
    automatically re-extracted. The vector is always re-embedded from the
    updated content so search accuracy is preserved.
    """
    title:         Optional[str]           = Field(None, min_length=1, max_length=300)
    service:       Optional[str]           = Field(None, max_length=100)
    component:     Optional[str]           = Field(None, max_length=100)
    severity:      Optional[SeverityLiteral] = None
    date:          Optional[str]           = None
    error_message: Optional[str]           = Field(None, max_length=2000)
    root_cause:    Optional[str]           = Field(None, max_length=5000)
    fix:           Optional[str]           = Field(None, max_length=5000)
    stack_trace:   Optional[str]           = Field(None, max_length=10000)
    tags:          Optional[List[str]]     = None

    @field_validator("title", mode="after")
    @classmethod
    def _title_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("title cannot be blank or whitespace only")
        return v

    @field_validator("date", mode="after")
    @classmethod
    def _validate_date(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        dt_match = _ISO_DATETIME_RE.match(v)
        if dt_match:
            v = dt_match.group(1)
        if not _ISO_DATE_RE.match(v):
            raise ValueError(f"date must be ISO-8601 YYYY-MM-DD, got {v!r}")
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"date is not a valid calendar date: {v!r}")
        return v

    @field_validator("tags", mode="before")
    @classmethod
    def _coerce_tags(cls, v: Any) -> Any:
        # Reuse the same coercion logic as IncidentInput
        if v is None:
            return None
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        if isinstance(v, list):
            result = []
            for i, tag in enumerate(v):
                if not isinstance(tag, str):
                    raise ValueError(f"tags[{i}] must be a string")
                stripped = tag.strip()
                if len(stripped) > 80:
                    raise ValueError(f"tags[{i}] too long (max 80 chars)")
                if stripped:
                    result.append(stripped)
            if len(result) > 30:
                raise ValueError(f"too many tags: got {len(result)}, max 30")
            return result
        raise ValueError("tags must be a list of strings or comma-separated string")

    def to_update_dict(self) -> Dict[str, Any]:
        """Return only explicitly provided fields.

        Uses model_fields_set (Pydantic v2) instead of filtering by None so
        that a caller can intentionally clear a field by sending an empty
        string or empty list — omitted fields are simply not included.
        """
        return {k: v for k, v in self.model_dump().items() if k in self.model_fields_set}


@app.patch("/incidents/{incident_id}")
def update_incident_endpoint(incident_id: str, req: UpdateIncidentRequest):
    """
    Update editable fields on an existing incident and re-embed.

    Only provided fields are changed. The search vector is re-computed from
    the updated content so retrieval accuracy is preserved after the update.

    Use this to add postmortem data (root_cause, fix) after an incident closes,
    correct mislabeled severity, or update tags for better clustering.

    Example:
      curl -X PATCH http://localhost:8000/incidents/INC-001 \\
        -H 'Content-Type: application/json' \\
        -d '{
          "root_cause": "HikariCP max-pool-size set too low (10) for peak traffic.",
          "fix": "Increased max-pool-size to 30, added connection timeout alert.",
          "tags": ["connection-pool", "hikari", "performance"]
        }'
    """
    fields = req.to_update_dict()
    if not fields:
        raise HTTPException(
            status_code=422,
            detail="No updatable fields provided — include at least one field to update.",
        )

    try:
        found = update_incident_fields(incident_id=incident_id, fields=fields)
    except Exception as e:
        raise _db_error(e)

    if not found:
        raise HTTPException(
            status_code=404,
            detail=f"Incident '{incident_id}' not found in the index.",
        )

    return {
        "incident_id":    incident_id,
        "updated_fields": list(fields.keys()),
        "message":        f"Incident '{incident_id}' updated and re-embedded.",
    }


@app.get("/analytics/resolutions")
def resolution_stats():
    """
    Summarise confirmed fix patterns across all resolved incidents.

    Returns:
      - resolved_count / confirmed_count totals
      - fix_patterns: grouped by failure_mode, with confirmed fixes surfaced
      - top_resolvers: who's been closing incidents most
      - recent: last 10 resolved incidents

    This endpoint is what makes TraceVault progressively smarter:
    the more incidents are confirmed, the richer the fix-pattern library becomes.
    """
    try:
        incidents = get_resolved_incidents()
    except Exception as e:
        raise _db_error(e)

    if not incidents:
        return {
            "resolved_count":  0,
            "confirmed_count": 0,
            "fix_patterns":    [],
            "top_resolvers":   [],
            "recent":          [],
        }

    resolved_count  = sum(1 for i in incidents if i.get("resolution_status") == "resolved")
    confirmed_count = sum(1 for i in incidents if i.get("resolution_status") == "confirmed")

    # ── Group confirmed fixes by failure_mode ─────────────────────────────────
    from collections import defaultdict, Counter
    by_mode: Dict[str, list] = defaultdict(list)
    for inc in incidents:
        mode = (inc.get("failure_mode") or "other").strip() or "other"
        by_mode[mode].append(inc)

    fix_patterns = []
    for mode, incs in by_mode.items():
        confirmed = [i for i in incs if i.get("resolution_status") == "confirmed" and i.get("confirmed_fix")]
        fixes = [
            {
                "incident_id":  i.get("incident_id"),
                "title":        i.get("title"),
                "confirmed_fix": i.get("confirmed_fix"),
                "service":      i.get("service"),
                "resolved_by":  i.get("resolved_by"),
                "resolved_at":  i.get("resolved_at"),
            }
            for i in confirmed
        ]
        fix_patterns.append({
            "failure_mode":    mode,
            "total_resolved":  len(incs),
            "confirmed_fixes": len(confirmed),
            "fixes":           fixes,
        })

    fix_patterns.sort(key=lambda x: x["confirmed_fixes"], reverse=True)

    # ── Top resolvers ─────────────────────────────────────────────────────────
    resolvers = [i.get("resolved_by") for i in incidents if i.get("resolved_by")]
    top_resolvers = [
        {"resolver": name, "count": count}
        for name, count in Counter(resolvers).most_common(10)
    ]

    # ── Recent resolutions (last 10, newest first) ────────────────────────────
    dated = sorted(
        [i for i in incidents if i.get("resolved_at")],
        key=lambda x: x["resolved_at"],
        reverse=True,
    )
    recent = [
        {
            "incident_id":      i.get("incident_id"),
            "title":            i.get("title"),
            "resolution_status": i.get("resolution_status"),
            "confirmed_fix":    i.get("confirmed_fix"),
            "resolved_by":      i.get("resolved_by"),
            "resolved_at":      i.get("resolved_at"),
            "service":          i.get("service"),
            "severity":         i.get("severity"),
        }
        for i in dated[:10]
    ]

    return {
        "resolved_count":  resolved_count,
        "confirmed_count": confirmed_count,
        "fix_patterns":    fix_patterns,
        "top_resolvers":   top_resolvers,
        "recent":          recent,
    }



# ── Analytics: Dashboard ──────────────────────────────────────────────────────

@app.get("/analytics/dashboard")
def dashboard():
    """
    Aggregated incident metrics for the dashboard view.
    Returns severity breakdown, top services, resolution stats, and recent incidents.
    """
    try:
        incidents = get_all_incidents()
    except Exception as e:
        raise _db_error(e)

    if not incidents:
        return {
            "total_incidents":  0,
            "by_severity":      {},
            "by_service":       [],
            "resolution_rate":  0.0,
            "open_count":       0,
            "resolved_count":   0,
            "confirmed_count":  0,
            "recent_incidents": [],
        }

    from collections import Counter

    severity_counts = Counter(i.get("severity", "medium") for i in incidents)
    service_counts  = Counter(i.get("service") for i in incidents if i.get("service"))

    statuses        = [i.get("resolution_status", "open") for i in incidents]
    resolved_count  = sum(1 for s in statuses if s in ("resolved", "confirmed"))
    confirmed_count = sum(1 for s in statuses if s == "confirmed")
    open_count      = len(incidents) - resolved_count
    resolution_rate = round(resolved_count / len(incidents) * 100, 1)

    sorted_by_date = sorted(
        [i for i in incidents if i.get("date")],
        key=lambda x: x.get("date", ""),
        reverse=True,
    )
    recent_incidents = [
        {
            "incident_id":       i.get("incident_id") or i.get("id"),
            "title":             i.get("title"),
            "service":           i.get("service"),
            "severity":          i.get("severity"),
            "date":              i.get("date"),
            "resolution_status": i.get("resolution_status", "open"),
        }
        for i in sorted_by_date[:10]
    ]

    top_services = [
        {"service": svc, "count": cnt}
        for svc, cnt in service_counts.most_common(10)
    ]

    return {
        "total_incidents":  len(incidents),
        "by_severity":      dict(severity_counts),
        "by_service":       top_services,
        "resolution_rate":  resolution_rate,
        "open_count":       open_count,
        "resolved_count":   resolved_count,
        "confirmed_count":  confirmed_count,
        "recent_incidents": recent_incidents,
    }


# ── Webhook: Slack ingest ─────────────────────────────────────────────────────

class SlackWebhook(BaseModel):
    """
    Accepts Slack alert-style webhook payloads. Two supported formats:

    Simple (alert manager / Slack app):
      {"text": "CRITICAL: pool exhausted", "username": "my-service",
       "attachments": [{"title": "...", "text": "...", "color": "danger"}]}

    Rich structured (direct incident ingest):
      {"incident": {"title": "...", "service": "...", "severity": "high", ...}}
    """
    class Config:
        extra = "allow"

    text:        Optional[str]                  = None
    username:    Optional[str]                  = None
    attachments: Optional[List[Dict[str, Any]]] = None
    incident:    Optional[Dict[str, Any]]       = None


def _normalize_slack(payload: SlackWebhook) -> Dict[str, Any]:
    """Map Slack webhook fields to TraceVault incident schema."""
    if payload.incident:
        inc = payload.incident
        return {
            "id":            inc.get("id"),
            "title":         (inc.get("title") or "Untitled Slack alert")[:300],
            "service":       inc.get("service"),
            "severity":      inc.get("severity", "medium"),
            "date":          inc.get("date"),
            "error_message": (inc.get("error_message") or inc.get("description", ""))[:2000] or None,
            "root_cause":    inc.get("root_cause", "Unknown at ingest time — update after investigation."),
            "fix":           inc.get("fix", "Pending investigation."),
            "tags":          inc.get("tags", ["slack", "webhook"]),
        }

    # Simple Slack text/attachment path
    title = ""
    description = ""
    severity = "medium"

    if payload.attachments:
        att         = payload.attachments[0]
        title       = att.get("title") or att.get("fallback") or ""
        description = att.get("text") or att.get("pretext") or ""
        color       = att.get("color", "")
        severity    = {"danger": "high", "warning": "medium", "good": "low"}.get(color, "medium")

    if not title:
        title = (payload.text or "")[:300] or "Untitled Slack alert"
    if not description and payload.text:
        description = payload.text

    return {
        "id":            None,
        "title":         title[:300],
        "service":       payload.username or None,
        "severity":      severity,
        "date":          None,
        "error_message": description[:2000] if description else None,
        "root_cause":    "Unknown at ingest time — update after investigation.",
        "fix":           "Pending investigation.",
        "tags":          ["slack", "webhook"],
    }


@app.post("/webhooks/slack")
def webhook_slack(payload: SlackWebhook, background_tasks: BackgroundTasks):
    """
    Ingest a Slack alert webhook and index it into VectorAI DB.

    Simple format (alert manager):
      curl -X POST http://localhost:8000/webhooks/slack \\
        -H "Content-Type: application/json" \\
        -d '{"text": "CRITICAL: HikariPool exhausted",
             "username": "user-service",
             "attachments": [{"title": "DB pool exhausted",
                              "text": "Connection not available after 30s",
                              "color": "danger"}]}'

    Rich structured:
      curl -X POST http://localhost:8000/webhooks/slack \\
        -H "Content-Type: application/json" \\
        -d '{"incident": {"title": "DB pool exhausted", "service": "user-service",
                          "severity": "high", "error_message": "HikariPool timeout"}}'
    """
    if payload.text is None and payload.attachments is None and payload.incident is None:
        raise HTTPException(
            status_code=422,
            detail="Unrecognized Slack webhook format — expected 'text', 'attachments', or 'incident'",
        )

    try:
        normalized = _normalize_slack(payload)
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
        result = index_incidents([incident.to_dict()], skip_duplicates=True)
        background_tasks.add_task(_run_autopilot, normalized)
        return {
            "status":      "ok",
            "indexed":     result["indexed"],
            "skipped":     result["skipped"],
            "incident_id": normalized.get("id") or "(generated)",
            "source":      "slack_webhook",
            "autopilot":   "triggered",
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
    Auto-detects PagerDuty V2 and V3 webhook formats.
    - V3: {"event": {"event_type": "...", "data": {...}}}
    - V2: {"messages": [{"type": "...", "data": {"incident": {...}}}]}
    Extra fields are ignored.
    """
    class Config:
        extra = "allow"

    # V3 field
    event: Optional[Dict[str, Any]] = None
    # V2 field
    messages: Optional[List[Dict[str, Any]]] = None


def _extract_pd_data(payload: PagerDutyWebhook) -> tuple[Dict[str, Any], str]:
    """
    Auto-detect V2 vs V3 and return (data_dict, event_type).
    V3: payload.event.data
    V2: payload.messages[0].data.incident
    """
    # ── V3 format ────────────────────────────────────────────────────────
    if payload.event:
        data       = payload.event.get("data", {})
        event_type = payload.event.get("event_type", "")
        log.info("PagerDuty webhook detected: V3 format (event_type=%s)", event_type)
        return data, event_type

    # ── V2 format ────────────────────────────────────────────────────────
    if payload.messages:
        msg        = payload.messages[0] if payload.messages else {}
        event_type = msg.get("type", "")
        # V2 nests incident under data.incident
        raw_data   = msg.get("data", {})
        data       = raw_data.get("incident", raw_data)
        log.info("PagerDuty webhook detected: V2 format (type=%s)", event_type)
        return data, event_type

    log.warning("PagerDuty webhook: unrecognized format — no 'event' or 'messages' key")
    return {}, ""


def _normalize_pd(payload: PagerDutyWebhook) -> Dict[str, Any]:
    """
    Map PagerDuty V2/V3 webhook fields to TraceVault's internal incident schema.
    Safe placeholders are used for fields unavailable at ingest time.
    """
    data, event_type = _extract_pd_data(payload)

    def _s(val) -> str:
        """Safely convert any value to stripped string."""
        return str(val).strip() if val is not None else ""

    # ID — PagerDuty incident ID or fallback
    incident_id = _s(data.get("id")) or None

    # Title — required; fall back to event type if missing
    title = (
        _s(data.get("title"))
        or _s(data.get("summary"))
        or _s(event_type)
        or "Untitled PagerDuty incident"
    )

    # Service name — V3: data.service.name / V2: data.service.name or data.service.summary
    svc_block = data.get("service") or {}
    service = (
        _s(svc_block.get("name") or svc_block.get("summary"))
        if isinstance(svc_block, dict) else ""
    ) or None

    # Severity — map PagerDuty urgency to TraceVault severity
    urgency  = _s(data.get("urgency")).lower()
    severity = _PD_URGENCY_MAP.get(urgency, "medium")

    # Date — V3: data.created_at / V2: data.created_on
    raw_date = _s(data.get("created_at") or data.get("created_on"))
    date: Optional[str] = None
    if raw_date:
        dt_match = _ISO_DATETIME_RE.match(raw_date)
        date = dt_match.group(1) if dt_match else (raw_date[:10] if len(raw_date) >= 10 else None)

    # Error message — V3: body.details / V2: body.details or summary
    body        = data.get("body") or {}
    err_details = _s(body.get("details")) if isinstance(body, dict) else ""
    summary     = _s(data.get("summary"))
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
def webhook_pagerduty(payload: PagerDutyWebhook, background_tasks: BackgroundTasks):
    """
    Ingest a PagerDuty webhook and index it into VectorAI DB.
    Auto-detects V2 and V3 webhook formats.

    V3 (manual/curl demo):
      curl -X POST http://localhost:8000/webhooks/pagerduty \\
        -H "Content-Type: application/json" \\
        -d '{"event": {"event_type": "incident.triggered", "data": {"id": "Q1A2B3C4",
             "title": "HikariPool timeout", "urgency": "high",
             "service": {"name": "user-service"},
             "created_at": "2025-04-10T03:22:00Z",
             "body": {"details": "Connection timed out after 30000ms"}}}}'

    V2 (PagerDuty webhook subscription):
      Payload auto-detected from messages[0].data.incident structure.
    """
    if payload.event is None and payload.messages is None:
        raise HTTPException(
            status_code=422,
            detail="Unrecognized PagerDuty webhook format — expected 'event' (V3) or 'messages' (V2)",
        )

    try:
        normalized = _normalize_pd(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Payload normalization failed: {e}")

    # Guard against payloads that parsed correctly but contained no usable data
    # (e.g. event={} or messages=[]) — avoids silently indexing empty incidents.
    _FALLBACK_TITLE = "Untitled PagerDuty incident"
    if (
        normalized.get("title") == _FALLBACK_TITLE
        and not normalized.get("id")
        and not normalized.get("error_message")
    ):
        raise HTTPException(
            status_code=422,
            detail="PagerDuty payload contained no usable incident data — check 'event.data' (V3) or 'messages[0].data.incident' (V2)",
        )

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
        result = index_incidents([incident.to_dict()], skip_duplicates=True)
        background_tasks.add_task(_run_autopilot, normalized)
        return {
            "status":      "ok",
            "indexed":     result["indexed"],
            "skipped":     result["skipped"],
            "incident_id": normalized.get("id") or "(generated)",
            "source":      "pagerduty_webhook",
            "autopilot":   "triggered",
        }
    except Exception as e:
        raise _db_error(e)
