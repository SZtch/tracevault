"""
TraceVault - VectorAI DB client wrapper
Uses actian_vectorai SDK (b2 API)
"""

import os
import re
import hashlib
import logging
import numpy as np
from typing import List, Dict, Any, Optional

_log = logging.getLogger("tracevault.vectordb")

try:
    from actian_vectorai import (
        VectorAIClient,
        Distance,
        Field,
        FilterBuilder,
        PointStruct,
        VectorParams,
    )
    VECTORAI_AVAILABLE = True
except ImportError:
    VECTORAI_AVAILABLE = False
    print("⚠️  actian_vectorai not installed — run: pip install actian_vectorai-0.1.0b2-py3-none-any.whl")

# ── Config — all overridable via environment variables ────────────────────────
DB_ADDR    = os.getenv("VECTORAI_DB_ADDR", "localhost:50051")
COLLECTION = os.getenv("VECTORAI_COLLECTION", "tracevault_incidents")
DIM        = int(os.getenv("VECTORAI_DIM", "384"))  # all-MiniLM-L6-v2 outputs 384-dim vectors


def stable_id(incident_id: str) -> int:
    """
    Deterministic integer ID from incident string ID.
    Using loop index (id=i) silently corrupts data when reindexing partial
    datasets or adding incidents to an existing collection.
    """
    return int(hashlib.sha256(incident_id.encode()).hexdigest(), 16) % (2 ** 31)


try:
    from sentence_transformers import SentenceTransformer
    _st_model = SentenceTransformer("all-MiniLM-L6-v2")
    _ST_AVAILABLE = True
except ImportError:
    _st_model = None
    _ST_AVAILABLE = False
    print("⚠️  sentence-transformers not installed — run: pip install sentence-transformers")


def embed(text: str, dim: int = DIM) -> List[float]:
    """
    Semantic embedding using sentence-transformers (all-MiniLM-L6-v2).
    - Fully offline after first model download (~80MB)
    - 384-dim output, cosine-normalized
    - Understands paraphrases: "pool exhausted" ≈ "ran out of connections"
    Falls back to hash trick if sentence-transformers is unavailable.
    """
    if _ST_AVAILABLE and _st_model is not None:
        return _st_model.encode(text, normalize_embeddings=True).tolist()

    # Fallback: hash trick (offline, no dependencies)
    tokens = re.findall(r"[a-zA-Z0-9]+", text.lower())
    vec = np.zeros(dim, dtype=np.float32)
    for t in tokens:
        vec[hash(t) % dim] += 1.0
        if len(t) > 3:
            vec[hash(t[:3]) % dim] += 0.5
    for a, b in zip(tokens, tokens[1:]):
        vec[hash(f"{a}_{b}") % dim] += 0.75
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec.tolist()


# ── Stack trace mining ────────────────────────────────────────────────────────

def _extract_exception_class(stack_trace: str) -> str:
    """
    Extract the short exception class name from the first line of a stack trace.
    Handles both Java (com.foo.SomeException: message) and Python formats.

    Examples:
      "com.zaxxer.hikari.pool.HikariPool$PoolInitializationException: ..."
        → "PoolInitializationException"
      "grpc._channel._InactiveRpcError: <_InactiveRpcError ..."
        → "_InactiveRpcError"
      "org.apache.kafka.common.errors.SerializationException: ..."
        → "SerializationException"
    """
    if not stack_trace:
        return ""
    first_line = stack_trace.strip().splitlines()[0]
    class_part = first_line.split(":")[0].strip()
    # Short name: last component after dots, then after $ (inner classes)
    short = class_part.split(".")[-1].split("$")[-1]
    # Accept only if it looks like a class/exception identifier:
    # starts with capital or underscore, longer than 3 chars, no spaces
    if len(short) > 3 and " " not in short and re.match(r"[A-Z_]", short):
        return short
    # Fallback: full dotted identifier — only if it has no spaces (qualified name)
    if " " not in class_part and ("." in class_part or "_" in class_part):
        return class_part
    return ""


def _extract_stack_methods(stack_trace: str, max_frames: int = 4) -> List[str]:
    """
    Extract ClassName.methodName pairs from stack frames.
    Prefers app-level frames over framework/stdlib internals.
    Skips lines that look like pure infrastructure (java.lang, sun., etc.).

    Used for:
    1. Adding to retrieval text (boosted method token signal)
    2. Storing in payload for match explanation
    """
    if not stack_trace:
        return []
    methods: List[str] = []
    skip_prefixes = ("java.lang", "java.util", "sun.", "jdk.", "com.sun",
                     "org.springframework.cglib", "net.sf.cglib")
    for line in stack_trace.splitlines()[1:]:
        line = line.strip()
        if line.startswith("at "):
            # Java: "at com.app.payment.PaymentRepo.save(PaymentRepo.java:42)"
            m = re.match(r"at\s+([\w.$]+)\(", line)
            if m:
                full = m.group(1)
                if any(full.startswith(p) for p in skip_prefixes):
                    continue
                parts = full.split(".")
                method     = parts[-1] if parts else full
                class_name = parts[-2] if len(parts) > 1 else ""
                if class_name:
                    methods.append(f"{class_name}.{method}")
        elif line.startswith("File "):
            # Python: "File "path/to/file.py", line 42, in method_name"
            m = re.search(r'in\s+(\w+)\s*$', line)
            if m and m.group(1) not in ("__init__", "<module>"):
                methods.append(m.group(1))
        if len(methods) >= max_frames:
            break
    return methods


# ── Retrieval text construction ───────────────────────────────────────────────

def build_searchable_text(incident: Dict[str, Any], exception_class: str = "") -> str:
    """
    Build the text that gets embedded for vector retrieval.

    Field weights (by repetition count):
      title          ×4   — most informative, densest signal
      error_message  ×3   — raw error string; directly matches what engineers search
      tags           ×3   — precision-labeled by engineers; each token is high-value
      service        ×2   — primary grouping dimension; also hyphen-normalized
      exception_class×2   — unique type identifier extracted from stack trace
      root_cause     ×1   — first sentence only (avoids prose dilution)
      stack_head     ×1   — top 3 lines of trace (exception + nearest frames)

    Intentionally excluded:
      fix            —  solution text pollutes problem-space retrieval.
                        "Added circuit breaker" in fix makes an incident rank for
                        circuit-breaker queries even if the problem is unrelated.
      root_cause (full)— narrative prose adds generic words (increased, deployed,
                        added, caused) that overlap across unrelated incidents.
    """
    title         = (incident.get("title")         or "").strip()
    error_message = (incident.get("error_message") or "").strip()
    service       = (incident.get("service")       or "").strip()
    service_norm  = service.replace("-", " ")  # "payment-service" → "payment service"
    tags          = " ".join(incident.get("tags") or [])

    # First sentence of root_cause — problem context without full narrative
    raw_cause      = (incident.get("root_cause") or "").strip()
    first_sentence = re.split(r'(?<=[.!?])\s', raw_cause)[0] if raw_cause else ""

    # Stack trace: exception line + top 2 frames only
    raw_trace  = incident.get("stack_trace") or ""
    stack_head = "\n".join(raw_trace.splitlines()[:3]) if raw_trace else ""

    parts = [
        # ── Tier 1 — highest signal ───────────────────────────────────────
        title, title, title, title,
        error_message, error_message, error_message,
        tags, tags, tags,
        # ── Tier 2 — structural identifiers ──────────────────────────────
        service, service, service_norm,
        exception_class, exception_class,
        # ── Tier 3 — supporting context ──────────────────────────────────
        first_sentence,
        stack_head,
    ]
    return " ".join(p.strip() for p in parts if p.strip())


# ── Match explanation ─────────────────────────────────────────────────────────

_STOPWORDS = {
    "the", "a", "an", "and", "or", "in", "on", "at", "to", "for",
    "of", "is", "was", "with", "after", "caused", "by", "due",
    "its", "all", "had", "not", "from", "this", "that", "but",
}

# Map tag subsets → human-readable failure mode labels.
# Checked in order; first match wins.
_FAILURE_MODES: List[tuple] = [
    ({"connection-pool", "hikari"},                              "connection pool exhaustion"),
    ({"connection-pool", "pgbouncer"},                          "connection pool exhaustion"),
    ({"connection-pool", "timeout"},                            "connection pool timeout"),
    ({"max-connections", "postgres"},                           "Postgres connection limit"),
    ({"deadlock", "transaction"},                               "database deadlock"),
    ({"slow-query", "query-plan"},                              "query plan regression"),
    ({"slow-query", "index"},                                   "missing index / slow query"),
    ({"n-plus-one"},                                            "N+1 query pattern"),
    ({"replication", "read-replica"},                           "read replica lag"),
    ({"grpc", "deadline"},                                      "gRPC deadline exceeded"),
    ({"retry-storm", "rate-limit"},                             "retry storm / rate limiting"),
    ({"retry-storm"},                                           "retry storm"),
    ({"upstream-failure", "circuit-breaker"},                   "circuit breaker / upstream failure"),
    ({"api-timeout", "http-504"},                               "gateway timeout (504)"),
    ({"api-timeout", "upstream-failure"},                       "upstream service timeout"),
    ({"kafka", "consumer-lag", "rebalance"},                    "Kafka rebalance / consumer lag"),
    ({"kafka", "consumer-lag"},                                 "Kafka consumer lag"),
    ({"kafka", "schema"},                                       "Kafka schema mismatch"),
    ({"rabbitmq", "queue-backlog"},                             "RabbitMQ queue backlog"),
    ({"celery", "worker-stuck"},                                "stuck Celery worker"),
    ({"celery", "poison-message"},                              "poison message in task queue"),
    ({"sqs", "queue-backlog"},                                  "SQS queue backlog"),
    ({"memory-leak", "heap"},                                   "JVM heap memory leak"),
    ({"memory-leak", "oom"},                                    "memory leak → OOM"),
    ({"memory-pressure", "oom"},                                "memory pressure / OOM"),
    ({"oom", "kubernetes"},                                     "Kubernetes OOMKill"),
    ({"batch-processing", "etl"},                               "slow ETL / batch job"),
    ({"batch-processing", "worker-stuck"},                      "stuck batch worker"),
    ({"queue-backlog", "worker"},                               "worker queue backlog"),
]


def _infer_failure_mode(tags: List[str]) -> str:
    tag_set = set(tags)
    for keywords, label in _FAILURE_MODES:
        if keywords.issubset(tag_set):
            return label
    # Fallback: single-tag match
    for keywords, label in _FAILURE_MODES:
        if keywords & tag_set:
            return label
    return ""


def _tok(text: str) -> set:
    """Tokenise text, lowercase, strip stopwords, min length 3."""
    if not text:
        return set()
    return {t for t in re.findall(r"[a-zA-Z0-9]+", text.lower())
            if t not in _STOPWORDS and len(t) > 2}


def build_match_reason(query: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a structured match explanation by checking query tokens against
    individual payload fields, not a single merged blob.

    Returns a dict with:
      matched_terms  — list[str]   all tokens that matched (backward-compat)
      match_reason   — str         one readable sentence: what matched and where
      failure_mode   — str         inferred failure class ("connection pool exhaustion")
      primary_signal — str         what drove the match most (exception_class / error_message / …)
      context_hints  — list[str]   short chips: ["same service", "exception match", …]
      match_signals  — dict        full structured breakdown for frontend inspection
    """
    q_tokens = _tok(query)

    title_match   = sorted(q_tokens & _tok(payload.get("title", "")),          key=lambda x: -len(x))
    error_match   = sorted(q_tokens & _tok(payload.get("error_message", "")), key=lambda x: -len(x))
    service_match = sorted(q_tokens & _tok(payload.get("service", "").replace("-", " ")), key=lambda x: -len(x))
    exc_match     = sorted(q_tokens & _tok(payload.get("exception_class", "")), key=lambda x: -len(x))
    stack_match   = sorted(q_tokens & _tok(payload.get("stack_methods_text", "")), key=lambda x: -len(x))

    tags_list  = [t for t in payload.get("tags", "").split(",") if t]
    tags_match = sorted(q_tokens & _tok(" ".join(tags_list)), key=lambda x: -len(x))

    failure_mode = _infer_failure_mode(tags_list)
    service      = payload.get("service", "")
    exc_class    = payload.get("exception_class", "")
    severity     = payload.get("severity", "")

    # ── Primary signal — highest-specificity hit wins ─────────────────────────
    # Ordered: exact type > raw error > service+mode > mode only > title > semantic
    if exc_match and exc_class:
        primary_signal = "exception_class"
    elif error_match:
        primary_signal = "error_message"
    elif service_match and failure_mode:
        primary_signal = "service_failure"
    elif tags_match and failure_mode:
        primary_signal = "failure_mode"
    elif title_match:
        primary_signal = "title"
    else:
        primary_signal = "semantic"

    # ── match_reason — one sentence, scannable in under 2 seconds ─────────────
    # Pattern: "{identifier} in {service} — {failure mode}"
    # Prefer the actual exception class name (specific, not a token fragment)
    # over raw matched error tokens, which can look like noise.
    subject = ""
    if exc_class:
        # Use the stored exception class whether or not it token-matched the query.
        # It's the most precise identifier for what went wrong in this incident.
        subject = exc_class
    elif error_match:
        # Most informative matched error tokens as a short phrase
        subject = " ".join(error_match[:2])

    location = f"in {service}" if service and service_match else ""
    mode_clause = f"— {failure_mode}" if failure_mode else ""

    if subject and location and mode_clause:
        match_reason = f"{subject} {location} {mode_clause}"
    elif subject and mode_clause:
        match_reason = f"{subject} {mode_clause}"
    elif subject and location:
        match_reason = f"{subject} {location}"
    elif failure_mode and service_match:
        match_reason = f"{failure_mode} in {service}"
    elif failure_mode:
        match_reason = failure_mode
    elif title_match:
        match_reason = f"Similar incident — {', '.join(title_match[:3])}"
    else:
        match_reason = "Semantically similar failure pattern"

    # ── context_hints — short chips that surface alignment factors ────────────
    # Each hint answers "in what way is this result relevant?"
    context_hints: List[str] = []

    if exc_match and exc_class:
        context_hints.append("exception match")
    if service_match:
        context_hints.append("same service")
    if stack_match:
        context_hints.append("stack overlap")
    if error_match and not exc_match:
        context_hints.append("error message match")
    if tags_match and not failure_mode:
        context_hints.append("tag overlap")
    elif tags_match:
        context_hints.append("tag overlap")
    if severity == "critical":
        context_hints.append("critical severity")

    # ── All matched terms (flat list for backward compat) ────────────────────
    seen: Dict[str, None] = {}
    for term in (exc_match + error_match + title_match + tags_match +
                 service_match + stack_match):
        seen[term] = None
    all_matched = list(seen.keys())[:8]

    return {
        "matched_terms":  all_matched,
        "match_reason":   match_reason,
        "failure_mode":   failure_mode,
        "primary_signal": primary_signal,
        "context_hints":  context_hints[:4],  # cap for visual cleanliness
        "match_signals": {
            "title":        title_match[:3],
            "error":        error_match[:3],
            "tags":         tags_match[:4],
            "service":      service_match[:2],
            "exception":    exc_match[:2],
            "stack":        stack_match[:2],
            "failure_mode": failure_mode,
            "severity":     severity,
        },
    }


def get_client():
    if not VECTORAI_AVAILABLE:
        raise RuntimeError(
            "actian_vectorai not installed — "
            "run: pip install actian_vectorai-0.1.0b2-py3-none-any.whl"
        )
    return VectorAIClient(DB_ADDR)


def init_collection(client, recreate: bool = False):
    if recreate and client.collections.exists(COLLECTION):
        client.collections.delete(COLLECTION)
    if not client.collections.exists(COLLECTION):
        client.collections.create(
            COLLECTION,
            vectors_config=VectorParams(size=DIM, distance=Distance.Cosine),
        )
        print(f"✅ Collection '{COLLECTION}' created (dim={DIM})")


def _get_existing_incident_ids(client) -> set:
    """Return the set of all incident_id strings currently in the collection."""
    existing = set()
    offset = None
    while True:
        batch, next_offset = client.points.scroll(
            COLLECTION, limit=100, offset=offset, with_payload=True,
        )
        for pt in batch:
            inc_id = pt.payload.get("incident_id")
            if inc_id and inc_id != "UNKNOWN":
                existing.add(inc_id)
        if next_offset is None:
            break
        offset = next_offset
    return existing


def index_incidents(
    incidents: List[Dict[str, Any]],
    skip_duplicates: bool = False,
) -> Dict[str, Any]:
    """
    Index incidents into VectorAI DB.

    skip_duplicates (default False):
      False — upsert all. Same incident_id overwrites existing (safe for re-index).
      True  — skip incidents whose incident_id already exists. Incidents without
              an ID are always indexed (no dedup key available).

    Returns:
      {"indexed": int, "skipped": int, "duplicate_ids": List[str]}
    """
    with get_client() as client:
        init_collection(client)

        existing_ids: set = set()
        if skip_duplicates:
            existing_ids = _get_existing_incident_ids(client)

        points      = []
        skipped_ids = []

        for inc in incidents:
            incident_id = inc.get("id", "")

            if skip_duplicates and incident_id and incident_id in existing_ids:
                skipped_ids.append(incident_id)
                _log.info("Dedup: skipping already-indexed %r", incident_id)
                continue

            exception_class    = _extract_exception_class(inc.get("stack_trace", ""))
            stack_methods      = _extract_stack_methods(inc.get("stack_trace", ""))
            stack_methods_text = " ".join(stack_methods)
            retrieval_text     = build_searchable_text(inc, exception_class=exception_class)

            # stable_id on retrieval_text for no-ID incidents — consistent across runs
            id_source = incident_id if incident_id else retrieval_text
            point_id  = stable_id(id_source)

            points.append(PointStruct(
                id=point_id,
                vector=embed(retrieval_text),
                payload={
                    "incident_id":       incident_id or "UNKNOWN",
                    "title":             inc.get("title", ""),
                    "error_message":     inc.get("error_message", ""),
                    "root_cause":        inc.get("root_cause", ""),
                    "fix":               inc.get("fix", ""),
                    "service":           inc.get("service", "unknown"),
                    "severity":          inc.get("severity", "medium"),
                    "date":              inc.get("date", ""),
                    "tags":              ",".join(inc.get("tags", [])),
                    "exception_class":   exception_class,
                    "stack_methods_text": stack_methods_text,
                    "retrieval_text":    retrieval_text,
                },
            ))

        if points:
            client.points.upsert(COLLECTION, points)

        result = {
            "indexed":       len(points),
            "skipped":       len(skipped_ids),
            "duplicate_ids": skipped_ids,
        }
        print(f"✅ Indexed {result['indexed']} incidents, skipped {result['skipped']} duplicates")
        return result


def search_incidents(
    query: str,
    top_k: int = 5,
    severity: Optional[str] = None,
    service: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    with get_client() as client:
        if not client.collections.exists(COLLECTION):
            return []

        qv = embed(query)
        # Fetch extra candidates when post-filtering by date/tags
        fetch_limit = top_k * 4 if (date_from or date_to or tags) else top_k

        if severity or service:
            fb = FilterBuilder()
            if severity:
                fb = fb.must(Field("severity").eq(severity))
            if service:
                fb = fb.must(Field("service").eq(service))
            results = client.points.search(
                COLLECTION, vector=qv, filter=fb.build(),
                limit=fetch_limit, with_payload=True,
            )
        else:
            results = client.points.search(
                COLLECTION, vector=qv,
                limit=fetch_limit, with_payload=True,
            )

        out = []
        for r in results:
            # ── Python-side date filter ──────────────────────────────────
            inc_date = r.payload.get("date") or ""
            if date_from and inc_date and inc_date < date_from:
                continue
            if date_to and inc_date and inc_date > date_to:
                continue

            # ── Python-side tags filter ──────────────────────────────────
            if tags:
                stored = [t.strip().lower() for t in (r.payload.get("tags") or "").split(",") if t.strip()]
                if not any(t.lower() in stored for t in tags):
                    continue

            explanation = build_match_reason(query, r.payload)
            confirmed_fix = r.payload.get("confirmed_fix") or None
            out.append({
                "id":            r.id,
                "score":         round(float(r.score), 4),
                "incident_id":   r.payload.get("incident_id"),
                "title":         r.payload.get("title"),
                "error_message": r.payload.get("error_message"),
                "root_cause":    r.payload.get("root_cause"),
                "fix":           confirmed_fix or r.payload.get("fix"),
                "fix_confirmed": confirmed_fix is not None,
                "service":       r.payload.get("service"),
                "severity":      r.payload.get("severity"),
                "date":          r.payload.get("date"),
                "tags":          r.payload.get("tags", "").split(","),
                # ── Resolution tracking ─────────────────────────────────────
                "resolution_status": r.payload.get("resolution_status", "open"),
                "resolved_at":       r.payload.get("resolved_at"),
                "resolved_by":       r.payload.get("resolved_by"),
                # ── Explanation layer ───────────────────────────────────────
                "matched_terms":  explanation["matched_terms"],
                "match_reason":   explanation["match_reason"],
                "failure_mode":   explanation["failure_mode"],
                "primary_signal": explanation["primary_signal"],
                "context_hints":  explanation["context_hints"],
                "match_signals":  explanation["match_signals"],
            })
            if len(out) >= top_k:
                break
        return out


def get_status() -> Dict[str, Any]:
    embedding_status = (
        "all-MiniLM-L6-v2"
        if _ST_AVAILABLE
        else "hash-fallback (sentence-transformers not loaded — semantic quality degraded)"
    )
    try:
        with get_client() as client:
            exists      = client.collections.exists(COLLECTION)
            point_count = None
            if exists:
                try:
                    info        = client.collections.get(COLLECTION)
                    point_count = getattr(info, "points_count", None)
                except Exception:
                    pass
            return {
                "connected":         True,
                "collection_exists": exists,
                "points_count":      point_count,
                "db_addr":           DB_ADDR,
                "collection":        COLLECTION,
                "dim":               DIM,
                "embedding_model":   embedding_status,
            }
    except Exception as e:
        return {
            "connected":       False,
            "error":           str(e),
            "db_addr":         DB_ADDR,
            "embedding_model": embedding_status,
        }


def get_collection_meta() -> Dict[str, Any]:
    """
    Return distinct services and severities currently indexed.
    Drives dynamic filter dropdowns in the frontend.
    """
    try:
        with get_client() as client:
            if not client.collections.exists(COLLECTION):
                return {"services": [], "severities": []}

            services:   set = set()
            severities: set = set()
            offset = None

            while True:
                batch, next_offset = client.points.scroll(
                    COLLECTION,
                    limit=100,
                    offset=offset,
                    with_payload=True,
                )
                for pt in batch:
                    svc = pt.payload.get("service")
                    sev = pt.payload.get("severity")
                    if svc:
                        services.add(svc)
                    if sev:
                        severities.add(sev)
                if next_offset is None:
                    break
                offset = next_offset

            severity_order = ["critical", "high", "medium", "low"]
            return {
                "services":   sorted(services),
                "severities": [s for s in severity_order if s in severities],
            }
    except Exception as e:
        return {"services": [], "severities": [], "error": str(e)}


def get_all_incidents() -> List[Dict[str, Any]]:
    """Scroll through all incidents and return their full payloads."""
    try:
        with get_client() as client:
            if not client.collections.exists(COLLECTION):
                return []
            incidents = []
            offset = None
            while True:
                batch, next_offset = client.points.scroll(
                    COLLECTION,
                    limit=100,
                    offset=offset,
                    with_payload=True,
                )
                for pt in batch:
                    incidents.append(pt.payload)
                if next_offset is None:
                    break
                offset = next_offset
            return incidents
    except Exception as e:
        _log.error("get_all_incidents error: %s", e)
        return []


def get_incident_count() -> int:
    """Count total incidents by scrolling the collection."""
    try:
        with get_client() as client:
            if not client.collections.exists(COLLECTION):
                return 0
            total = 0
            offset = None
            while True:
                batch, next_offset = client.points.scroll(
                    COLLECTION,
                    limit=100,
                    offset=offset,
                    with_payload=False,
                )
                total += len(batch)
                if next_offset is None:
                    break
                offset = next_offset
            return total
    except Exception:
        return 0




def update_incident_resolution(
    incident_id: str,
    resolution_status: str,
    confirmed_fix: Optional[str] = None,
    resolved_by: Optional[str] = None,
) -> bool:
    """
    Update resolution metadata on an existing incident payload.

    Uses Python-side filtering (scroll all → match incident_id) to avoid
    FilterBuilder compatibility issues with the VectorAI SDK on scroll.
    Re-embeds using the stored retrieval_text so the vector stays consistent.

    Returns True if found and updated, False if incident_id not found.
    """
    from datetime import datetime, timezone

    with get_client() as client:
        if not client.collections.exists(COLLECTION):
            return False

        # Scroll all points, find by incident_id in Python
        found_point = None
        offset = None
        while True:
            batch, next_offset = client.points.scroll(
                COLLECTION,
                limit=100,
                offset=offset,
                with_payload=True,
            )
            for pt in batch:
                if pt.payload.get("incident_id") == incident_id:
                    found_point = pt
                    break
            if found_point or next_offset is None:
                break
            offset = next_offset

        if not found_point:
            _log.warning("update_incident_resolution: incident_id %r not found", incident_id)
            return False

        # Merge resolution fields into existing payload
        payload = dict(found_point.payload)
        payload["resolution_status"] = resolution_status
        payload["resolved_at"]       = datetime.now(timezone.utc).isoformat()
        if confirmed_fix is not None:
            payload["confirmed_fix"] = confirmed_fix.strip()
        if resolved_by is not None:
            payload["resolved_by"] = resolved_by.strip()

        # Upsert with stored retrieval_text — no re-embedding drift
        retrieval_text = payload.get("retrieval_text") or payload.get("title", "")
        client.points.upsert(COLLECTION, [PointStruct(
            id=found_point.id,
            vector=embed(retrieval_text),
            payload=payload,
        )])
        _log.info("Resolution updated: %s → %s", incident_id, resolution_status)
        return True


def delete_incident(incident_id: str) -> bool:
    """
    Delete an incident from the collection by its string incident_id.

    Scrolls to find the internal integer point ID, then deletes by that ID.
    Returns True if found and deleted, False if not found.
    """
    with get_client() as client:
        if not client.collections.exists(COLLECTION):
            return False

        found_point = None
        offset = None
        while True:
            batch, next_offset = client.points.scroll(
                COLLECTION,
                limit=100,
                offset=offset,
                with_payload=True,
            )
            for pt in batch:
                if pt.payload.get("incident_id") == incident_id:
                    found_point = pt
                    break
            if found_point or next_offset is None:
                break
            offset = next_offset

        if not found_point:
            _log.warning("delete_incident: incident_id %r not found", incident_id)
            return False

        client.points.delete_by_ids(COLLECTION, [found_point.id])
        _log.info("Deleted incident: %s (point_id=%s)", incident_id, found_point.id)
        return True


def update_incident_fields(
    incident_id: str,
    fields: Dict[str, Any],
) -> bool:
    """
    Update editable fields on an existing incident and re-embed.

    Editable fields: title, service, component, severity, date,
                     error_message, root_cause, fix, stack_trace, tags.

    The vector is re-embedded from scratch using the updated retrieval text
    so search results stay accurate after the update.

    Returns True if found and updated, False if incident_id not found.
    """
    with get_client() as client:
        if not client.collections.exists(COLLECTION):
            return False

        found_point = None
        offset = None
        while True:
            batch, next_offset = client.points.scroll(
                COLLECTION,
                limit=100,
                offset=offset,
                with_payload=True,
            )
            for pt in batch:
                if pt.payload.get("incident_id") == incident_id:
                    found_point = pt
                    break
            if found_point or next_offset is None:
                break
            offset = next_offset

        if not found_point:
            _log.warning("update_incident_fields: incident_id %r not found", incident_id)
            return False

        payload = dict(found_point.payload)

        # ── Apply field updates ───────────────────────────────────────────────
        _EDITABLE = {
            "title", "service", "component", "severity",
            "date", "error_message", "root_cause", "fix",
            "stack_trace", "tags",
        }
        for key, value in fields.items():
            if key not in _EDITABLE:
                continue
            if key == "tags":
                # Normalize tags to comma-joined string (internal storage format)
                if isinstance(value, list):
                    payload["tags"] = ",".join(str(t).strip() for t in value if str(t).strip())
                else:
                    payload["tags"] = str(value)
            elif value is None:
                payload[key] = ""
            else:
                payload[key] = str(value).strip()

        # ── Re-extract stack signals if stack_trace changed ───────────────────
        stack_trace = payload.get("stack_trace") or ""
        exception_class    = _extract_exception_class(stack_trace)
        stack_methods      = _extract_stack_methods(stack_trace)
        stack_methods_text = " ".join(stack_methods)
        payload["exception_class"]    = exception_class
        payload["stack_methods_text"] = stack_methods_text

        # ── Re-build retrieval text and re-embed ──────────────────────────────
        # Reconstruct the incident dict from updated payload for build_searchable_text
        inc_snapshot = {
            "title":         payload.get("title", ""),
            "error_message": payload.get("error_message", ""),
            "service":       payload.get("service", ""),
            "tags":          [t.strip() for t in payload.get("tags", "").split(",") if t.strip()],
            "root_cause":    payload.get("root_cause", ""),
            "stack_trace":   payload.get("stack_trace", ""),
        }
        retrieval_text          = build_searchable_text(inc_snapshot, exception_class=exception_class)
        payload["retrieval_text"] = retrieval_text

        from datetime import datetime, timezone
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()

        client.points.upsert(COLLECTION, [PointStruct(
            id=found_point.id,
            vector=embed(retrieval_text),
            payload=payload,
        )])
        _log.info("Updated incident fields: %s → %s", incident_id, list(fields.keys()))
        return True


def get_resolved_incidents() -> List[Dict[str, Any]]:
    """
    Return all incidents marked resolved or confirmed.
    Filters in Python to avoid FilterBuilder/scroll compatibility issues.
    """
    all_incidents = get_all_incidents()
    return [
        i for i in all_incidents
        if i.get("resolution_status") in ("resolved", "confirmed")
    ]
