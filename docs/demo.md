# TraceVault — Retrieval Demo & Evaluation Guide

> For hackathon judges and reviewers who want to verify that the search
> returns **meaningful** results, not just random noise.

---

## Why this matters

The scenario TraceVault targets is specific: an engineer is paged on a live incident and wants to know whether it's happened before. The blockers to finding a prior incident fast are:

1. **Vocabulary mismatch** — the same failure gets described differently every time ("pool exhausted" vs "HikariPool timeout" vs "too many connections")
2. **No similarity ranking** — Confluence and Notion search by keyword; they return everything that contains the word, not the most relevant things
3. **No fix attached** — even when you find the prior incident, the resolution is in a different doc, a Slack thread, or someone's memory

TraceVault addresses all three: the vector index handles vocabulary mismatch, HNSW ranking handles relevance ordering, and the incident schema keeps root cause and fix co-located with the incident record.

The demo below verifies that retrieval is actually working — that the system surfaces the right failure cluster for each query, not random incidents with one token in common.

---

## The 45-incident dataset

The sample dataset is clustered around five real failure categories:
connection pool exhaustion, gRPC deadline cascades, retry storms, Kafka/queue
backlogs, and OOM/memory pressure. Each demo query below uses the kind of
phrasing an on-call engineer would actually type at 2 AM — not polished
textbook terminology — and should surface the right cluster as top results.

---

## How to run these queries

**UI:** paste the query into the search box, optionally set the severity filter.

**curl:**
```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "<paste query here>", "top_k": 5}' | jq '.results[].title'
```

First index the sample dataset if you haven't already:
```bash
curl -s -X POST http://localhost:8000/index/default | jq .
# → {"indexed": 45, "source": "sample_dataset", "status": "ok"}
```

---

## Demo Query 1 — Connection pool exhaustion

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

**Why these are correct**

INC-001, INC-013, INC-017, and INC-019 all share the `connection-pool` +
`hikari` tag combination and contain "connection pool" in their title and error
message. INC-014 is the platform-level root cause (pgbouncer + max_connections)
that sits behind many pool exhaustion incidents. The retrieval text for all five
is boosted with `hikari`, `connection-pool`, and `timeout` tokens — the exact
terms in the query — so they cluster tightly in embedding space.

**What a bad retrieval system would return instead:** generic database incidents
unrelated to pooling (INC-005 deadlock, INC-015 slow query) or nothing at all.

---

## Demo Query 2 — gRPC deadline cascade

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

**Why these are correct**

INC-026, INC-009, and INC-040 all carry both `grpc` + `ml` tags and contain
"deadline exceeded" in their error messages. The embedding for each incident
repeats the `grpc`, `deadline`, `ml`, and `latency` tokens at high weight.
INC-021 matches on `grpc` + `deadline` (different domain). INC-029 is a
legitimate boundary case — service mesh gRPC timeout, not ML, but the
`grpc` + `timeout` overlap is real and useful for cross-referencing.

**What a bad retrieval system would return instead:** all timeout incidents
regardless of protocol (HTTP 504s, Kafka lag, batch timeouts).

---

## Demo Query 3 — Retry storm / upstream cascade

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

**Why these are correct**

INC-022 is the canonical match: "checkout", "payment provider", "timeout", and
"cascade" all appear in its title and error message, and the `upstream-failure` +
`payment` + `circuit-breaker` tags align perfectly. INC-044 and INC-024 share
`http-504` + `upstream-failure` + `gateway` — the 504 signal in the query pulls
them in. INC-006 and INC-028 are correct second-order matches: both describe
payment/provider failure modes that an engineer investigating checkout 504s
should also review (rate limits, retry amplification).

**What a bad retrieval system would return instead:** any 5xx or timeout
incident without distinguishing upstream dependency failures from internal ones.

---

## Demo Query 4 — Kafka / queue backlog

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

**Why these are correct**

INC-036 is a near-literal match: its title echoes "consumer lag growing" and
"batch processor stuck." INC-011 and INC-030 share `kafka` + `consumer-lag` +
`queue` and are the closest siblings in embedding space. INC-032 and INC-035
match on `queue-backlog` + `worker-stuck` + `batch-processing` — different
broker (Celery/SQS) but the same failure mode, which is exactly the kind of
cross-system pattern retrieval should surface.

**What a bad retrieval system would return instead:** all "slow" or "delayed"
incidents, including unrelated DB slowdowns and HTTP timeouts.

---

## Demo Query 5 — OOM / memory pressure

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

**Why these are correct**

INC-004 is a direct hit: `kubernetes`, `oom`, `analytics`, `worker` all match.
INC-034 is the batch analytics sibling — same service cluster, same OOM symptom
without the Kubernetes wrapper. INC-037 matches on `memory-pressure` + `oom` +
`heap`; the root cause (unbounded store) is a plausible prior incident to check
when pods restart repeatedly. INC-043 matches via `memory-leak` + `oom` +
`worker` — a leak-driven OOMKill looks identical to a load-driven one from the
outside. INC-039 is the boundary case: `memory-pressure` tag matches but the
primary symptom is queue backlog — useful for judges to probe whether the system
can be confused by tag overlap.

**What a bad retrieval system would return:** any pod restart or service
disruption incident regardless of the memory root cause.

---

## What these results demonstrate

| Property | Evidence |
|----------|----------|
| **Intra-cluster precision** | Top 3 results for every query come from the same failure category, not random incidents |
| **Cross-cluster boundary sharpness** | A "gRPC deadline" query does not return Kafka or OOM incidents in the top 5 |
| **Realistic query tolerance** | Queries use casual engineer phrasing ("keeps getting 504s", "falling behind schedule") — not field names or tags — and still retrieve the right cluster |
| **Legitimate boundary cases** | Rank 4–5 results are explainable overlaps (shared tags, sibling failure modes), not noise |
| **Severity-filter composability** | Adding `"severity": "critical"` to any query narrows to the most urgent incidents in that cluster without breaking precision |

---

## Severity filter smoke test

Run the connection pool query with a severity filter to verify the filter layer works end to end:

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "connection pool timeout", "top_k": 5, "severity": "critical"}' \
  | jq '.results[] | {id: .incident_id, severity: .severity, title: .title}'
```

Expected: only INC-001, INC-013, INC-019, INC-014 — all `critical`. INC-017
(medium) and INC-041 (medium) should be absent.

---

## Edge case: query outside the dataset

```
DNS resolution failure in service mesh
```

Expected: low similarity scores (< 0.25) across all results. No incident in the
dataset is about DNS. The system should return its closest matches (likely
INC-029 service mesh timeout, INC-007 SSL/auth) with honest low scores rather
than hallucinating a confident wrong answer. Check `results[].score` in the
response.
