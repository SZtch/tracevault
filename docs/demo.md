# TraceVault — Retrieval Demo & Evaluation Guide

> If you want to verify the search actually works and isn't just returning random noise, this is the doc.

---

## The problem this solves

The scenario is specific: you get paged at 2am and the first thing you want to know is *has this happened before?* Three things make that hard:

1. **Nobody writes incidents the same way** — "pool exhausted", "HikariPool timeout", "too many connections" are all the same failure, but keyword search won't connect them
2. **Confluence and Notion are keyword search** — they return everything containing the word, not the most relevant things
3. **The fix is somewhere else** — even when you find the incident, the resolution is in a separate doc, a Slack thread, or someone's head

TraceVault handles all three at once: the vector index deals with vocabulary mismatch, HNSW handles relevance ranking, and the incident schema keeps root cause and fix in the same place as the incident.

The queries below verify that retrieval is actually doing something useful — not just surfacing incidents that share one token with the query.

---

## The dataset: 45 incidents, 5 clusters

The sample data covers five real failure categories: connection pool exhaustion, gRPC deadline cascades, retry storms, Kafka/queue backlogs, and OOM/memory pressure. Every query below is written the way an on-call engineer would actually type it at 2am — not clean textbook terminology.

---

## How to run

**UI:** paste the query into the search box, set the severity filter if you want.

**curl:**
```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "<paste query here>", "top_k": 5}' | jq '.results[].title'
```

Index the sample data first if you haven't:
```bash
curl -s -X POST http://localhost:8000/index/default | jq .
# → {"indexed": 45, "source": "sample_dataset", "status": "ok"}
```

---

## Query 1 — Connection pool exhaustion

**Query**
```
hikari pool exhausted during high traffic
```

**Expected top results**

| Rank | ID | Title | Severity |
|------|----|-------|----------|
| 1 | INC-001 | Database connection pool exhausted under traffic spike | critical |
| 2 | INC-013 | Connection pool timeout in payment service during peak checkout | critical |
| 3 | INC-019 | connection pool exhausted billing svc | critical |
| 4 | INC-017 | DB pool leak after ORM version upgrade | medium |
| 5 | INC-014 | Postgres max_connections exceeded — all services degraded | critical |

**Why these come back**

INC-001, INC-013, INC-017, and INC-019 all have the `connection-pool` + `hikari` tag combo and "connection pool" in both the title and error message. INC-014 is the platform-level root cause — pgbouncer hitting max_connections — that sits underneath a lot of pool exhaustion incidents, so it showing up here makes sense.

Under the hood: retrieval text is built by repeating the most informative fields — title ×4, error message ×3, tags ×3. That makes `hikari`, `connection-pool`, and `timeout` dominate the input going into all-MiniLM-L6-v2, pulling those incident vectors close to the query.

**What bad retrieval looks like:** INC-005 (deadlock) or INC-015 (slow query) showing up — both are database incidents but completely different failure modes.

---

## Query 2 — gRPC deadline cascade

**Query**
```
gRPC deadline exceeded, ML service not responding
```

**Expected top results**

| Rank | ID | Title | Severity |
|------|----|-------|----------|
| 1 | INC-026 | gRPC channel exhaustion under sustained ML inference load | high |
| 2 | INC-009 | gRPC deadline exceeded on recommendation engine inference | medium |
| 3 | INC-040 | gRPC deadline exceeded — user-facing latency spike during model warmup | high |
| 4 | INC-021 | gRPC deadline exceeded on inventory availability check | high |
| 5 | INC-029 | Service mesh timeout misconfiguration cutting long-running export requests | medium |

**Why these come back**

INC-026, INC-009, and INC-040 all have both `grpc` + `ml` tags and "deadline exceeded" in their error messages. Because title and tags dominate the retrieval text, `grpc`, `deadline`, `ml`, and `latency` become the strongest signal — pulling their vectors near the query.

INC-021 comes in on `grpc` + `deadline` even though it's inventory, not ML. INC-029 is a genuine boundary case — service mesh gRPC timeout, not ML-related, but the `grpc` + `timeout` overlap is real and worth cross-referencing.

**What bad retrieval looks like:** every timeout incident mixing in regardless of protocol — HTTP 504s, Kafka lag, batch timeouts all showing up together.

---

## Query 3 — Upstream cascade / 504s

**Query**
```
checkout keeps getting 504s, payment provider timing out
```

**Expected top results**

| Rank | ID | Title | Severity |
|------|----|-------|----------|
| 1 | INC-022 | Upstream payment provider timeout causing checkout cascade failure | critical |
| 2 | INC-044 | API gateway upstream timeout — product search returning 504s | critical |
| 3 | INC-024 | HTTP 504 gateway timeout on search endpoint under load | high |
| 4 | INC-006 | API rate limit breach causing 429 cascade on payment batch | high |
| 5 | INC-028 | Exponential retry loop from shipping webhook causing provider block | high |

**Why these come back**

INC-022 is the closest match — "checkout", "payment provider", "timeout", and "cascade" all appear in the title and error message, and the `upstream-failure` + `payment` + `circuit-breaker` tags are very specific. Its vector lands nearest to the query.

INC-044 and INC-024 come in through `http-504` + `upstream-failure` + `gateway`. INC-006 and INC-028 are useful second-order matches — both are payment/provider failure modes worth reviewing when you're investigating checkout 504s, since rate limits and retry amplification tend to appear together.

**What bad retrieval looks like:** any 5xx or timeout incident returning without distinguishing upstream dependency failures from internal ones.

---

## Query 4 — Kafka / queue backlog

**Query**
```
kafka consumer lag growing, batch jobs falling behind schedule
```

**Expected top results**

| Rank | ID | Title | Severity |
|------|----|-------|----------|
| 1 | INC-036 | Kafka consumer group lag growing — batch event processor stuck behind | critical |
| 2 | INC-011 | Kafka consumer lag spike — messages not processing | critical |
| 3 | INC-030 | Kafka partition rebalance causing 12-minute consumer processing gap | high |
| 4 | INC-032 | Celery worker stuck on poison message — task queue fully backed up | high |
| 5 | INC-035 | Worker process hung on external geocoding API — batch import stalled | high |

**Why these come back**

INC-036 is almost a literal match — the title echoes "consumer lag growing" and "batch processor stuck", and `kafka` + `consumer-lag` + `batch-processing` dominate the retrieval text. INC-011 and INC-030 are the nearest siblings in embedding space, both carrying strong Kafka + consumer lag signal.

INC-032 and INC-035 are interesting because they're a different broker (Celery/SQS, not Kafka), but the failure mode is identical: queue backlog + worker stuck + batch processing. That's exactly the kind of cross-stack pattern the system should be surfacing — not just exact technology name matches.

**What bad retrieval looks like:** every "slow" or "delayed" incident returning, including unrelated DB slowdowns and HTTP timeouts.

---

## Query 5 — OOM / memory pressure

**Query**
```
analytics worker OOMKilled, pod keeps restarting
```

**Expected top results**

| Rank | ID | Title | Severity |
|------|----|-------|----------|
| 1 | INC-004 | Kubernetes pod OOMKilled loop in analytics worker | critical |
| 2 | INC-034 | Batch analytics job exhausting memory — OOM killed midway | critical |
| 3 | INC-037 | Memory pressure from unbounded in-memory session store | critical |
| 4 | INC-043 | Memory leak in PDF rendering worker causing weekly OOMKill | high |
| 5 | INC-039 | Worker queue backed up — email sends delayed 3 hours | high |

**Why these come back**

INC-004 is a direct hit — `kubernetes`, `oom`, `analytics`, `worker` are all in the title and tags, dominating the retrieval text going into all-MiniLM-L6-v2. INC-034 is the batch analytics sibling — same OOM symptom, no Kubernetes wrapper.

INC-037 comes in through `memory-pressure` + `oom` + `heap`. The root cause is different (unbounded session store), but from the outside a pod restarting repeatedly looks identical regardless of why. INC-043 matches via `memory-leak` + `oom` + `worker` — a leak-driven OOMKill and a load-driven one are indistinguishable from the outside.

INC-039 is the most interesting boundary case to probe: `memory-pressure` tag matches but the primary symptom is queue backlog. If you want to test how far the system can be confused by tag overlap, start here.

**What bad retrieval looks like:** every pod restart or service disruption returning regardless of whether memory is actually the root cause.

---

## What these results show

| | |
|--|--|
| **Cluster precision** | Top 3 for every query comes from the same failure category, not random incidents |
| **Clean cluster boundaries** | A gRPC deadline query doesn't pull in Kafka or OOM incidents |
| **Casual query tolerance** | Queries are written how engineers actually type at 2am — no field names, no tags — and still hit the right cluster |
| **Explainable boundary cases** | Rank 4–5 are always traceable overlaps (shared tags, sibling failure modes), not noise |
| **Severity filter doesn't break precision** | Adding `"severity": "critical"` narrows results without scrambling the ranking |

---

## Smoke test: severity filter

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "connection pool timeout", "top_k": 5, "severity": "critical"}' \
  | jq '.results[] | {id: .incident_id, severity: .severity, title: .title}'
```

Expected: only INC-001, INC-013, INC-019, INC-014. INC-017 and INC-041 are both `medium` — they should be gone.

---

## Edge case: query outside the dataset

```
DNS resolution failure in service mesh
```

There are no DNS incidents in the dataset. Expected: low similarity scores (< 0.25) across the board. The system should return its nearest matches (likely INC-029 service mesh timeout, INC-007 SSL/auth) with honest low scores — not a confident wrong answer. Check `results[].score` in the response.
