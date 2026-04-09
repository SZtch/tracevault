# TraceVault

**Paste an error or stack trace. Find the last time something broke like this — and what fixed it.**

TraceVault is an incident similarity search tool powered by Actian VectorAI DB. It indexes your incident history as vectors and retrieves the closest past incidents to whatever you're seeing right now, ranked by similarity, with root causes and fixes attached.

> Built for the **Actian VectorAI DB Build Challenge**
> Runs fully offline · Deployable on Vercel + Railway · ARM-compatible

---

## The problem

When production breaks, the fastest path to a fix is usually: *has this happened before?*

That answer is buried in postmortems, Slack threads, and Confluence pages. Keyword search fails because incidents are described differently every time — `"HikariPool connection not available"` and `"connection pool exhausted"` describe the same failure, but a text search for one won't find the other. So you spend 20 minutes reading the wrong incidents while something is actively broken.

TraceVault indexes incident history as vectors. Paste the raw error, the alert text, or a fragment of the stack trace. It finds what broke like this before — across services, across time, across different words for the same problem.

---

## Why VectorAI DB is the core

The search hot path has three steps:

1. **Embed** — query converted locally to a 512-dim float vector (deterministic hashing, no API call, no internet)
2. **Search** — vector sent via gRPC to VectorAI DB, which runs HNSW cosine similarity across all indexed incidents
3. **Return** — VectorAI DB returns ranked payloads; backend attaches match explanations

VectorAI DB owns the HNSW index, the cosine search, and the payload filtering (severity + service). Remove it and there is no search — no fallback, no in-memory substitute. The persistent index is what makes retrieval instant as incident history grows, and what makes severity + service filters composable with similarity without a full scan.

---

## What you get per result

- Similarity score (cosine, 0–1)
- Title, service, severity, date
- Root cause and fix from the matched incident
- `failure_mode` — inferred failure category ("connection pool exhaustion", "gRPC deadline exceeded")
- `match_reason` — one sentence: what matched and where ("PoolInitializationException in user-service — connection pool exhaustion")
- `context_hints` — specific alignment signals ("exception match", "same service", "stack overlap")

---

## How a search works

```
User types: "hikari pool exhausted during peak traffic"
                │
                ▼
        embed() — hashing + bigrams → float[512]
                │
                ▼ gRPC
      Actian VectorAI DB
        HNSW cosine search
        optional payload filter (severity / service)
                │
                ▼
        Top-K incident payloads
                │
                ▼
        build_match_reason()
        → matched terms, failure mode label, per-field signals
                │
                ▼
        JSON response → ResultCard in browser
```

VectorAI DB owns the hot path: vector storage, HNSW index, cosine similarity, and payload filtering. The FastAPI backend handles embedding (local, no network), request validation, and result enrichment. The Next.js frontend is a thin client.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Vector DB | **Actian VectorAI DB** — gRPC, HNSW, cosine similarity |
| Embedding | Local hashing + bigrams, 512-dim — deterministic, no API key |
| Backend | FastAPI + Python 3.11, Pydantic v2 validation |
| Frontend | Next.js 14 |
| Offline | ✅ Zero internet after image pull |
| Online | ✅ Vercel (frontend) + Railway (backend + DB) |
| ARM | ✅ VectorAI DB image includes ARM64 |

---

## Demo story

Index the 45-incident sample dataset, then try these queries. Each targets a real failure cluster in the data:

| Query | What it should surface |
|-------|----------------------|
| `hikari pool exhausted during high traffic` | INC-001, INC-013, INC-019 — connection pool incidents |
| `gRPC deadline exceeded, ML service not responding` | INC-026, INC-009, INC-040 — gRPC + ML deadline cluster |
| `checkout keeps getting 504s, payment provider timing out` | INC-022, INC-044, INC-024 — upstream cascade cluster |
| `kafka consumer lag growing, batch jobs falling behind` | INC-036, INC-011, INC-030 — queue backlog cluster |
| `analytics worker OOMKilled, pod keeps restarting` | INC-004, INC-034, INC-037 — OOM / memory cluster |

Queries use engineer phrasing, not field names. The embedding still finds the right cluster. See [`docs/demo.md`](docs/demo.md) for full expected results, match explanations, and a severity-filter smoke test.

---

## Option A — Local / Offline (docker-compose)

### Prerequisites

- Docker + Docker Compose
- Node.js 18+
- `actian_vectorai-0.1.0b2-py3-none-any.whl` from the hackathon kit

### Steps

```bash
# 1. Clone and configure
git clone <repo>
cd tracevault
cp .env.example .env          # defaults work for local

# 2. Place the SDK .whl in backend/
cp /path/to/actian_vectorai-0.1.0b2-py3-none-any.whl backend/
# OR set VECTORAI_WHL_URL in .env if you have a download link

# 3. Start VectorAI DB + backend
docker-compose up --build -d

# 4. Start frontend
cd frontend
cp .env.local.example .env.local
npm install && npm run dev

# 5. Index the sample dataset (45 incidents)
curl -X POST http://localhost:8000/index/default

# 6. Open http://localhost:3000
```

### Without Docker (backend only)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
pip install actian_vectorai-0.1.0b2-py3-none-any.whl

# VectorAI DB must be running separately
docker run -d -p 50051:50051 -v tracevault_data:/data williamimoh/actian-vectorai-db:latest

uvicorn api:app --reload --port 8000
```

---

## Option B — Online Deployment (Vercel + Railway)

### Railway topology

```
Railway Project: tracevault
├── Service: vectoraidb   ← Docker image, internal gRPC only (not public)
│   └── Volume: /data     ← persistent embeddings across redeployments
└── Service: backend      ← Dockerfile, public HTTPS, PORT injected by Railway
    └── VECTORAI_DB_ADDR: vectoraidb.railway.internal:50051
```

VectorAI DB is internal-only because it speaks gRPC (port 50051) and Railway's public proxy is HTTP only. All DB access goes through the backend — which is the correct architecture regardless.

---

### Step 1 — Deploy VectorAI DB on Railway

1. New Railway project → **New Service → Docker Image**
   - Image: `williamimoh/actian-vectorai-db:latest`
   - Service name: `vectoraidb`
2. **Do not enable a public domain** — internal gRPC only
3. **Volumes** tab → Add Volume, mount path `/data`
4. No env vars needed for this service

---

### Step 2 — Deploy backend on Railway

1. Same project → **New Service → GitHub Repo**
   - Root directory: `/` (project root)
   - Railway auto-detects `railway.json` and `Dockerfile`
2. Environment variables:

| Variable | Value |
|----------|-------|
| `VECTORAI_DB_ADDR` | `vectoraidb.railway.internal:50051` |
| `VECTORAI_COLLECTION` | `tracevault_incidents` |
| `VECTORAI_DIM` | `512` |
| `FRONTEND_URL` | `https://your-app.vercel.app` ← set after Vercel deploy |

3. If the `.whl` is not committed, add a build argument:

| Build Arg | Value |
|-----------|-------|
| `VECTORAI_WHL_URL` | `https://your-host/actian_vectorai-0.1.0b2-py3-none-any.whl` |

4. Enable a public domain, copy the URL
5. Healthcheck hits `/health` — wait for green before proceeding

---

### Step 3 — Deploy frontend on Vercel

```bash
cd frontend && npx vercel
```

Or: Vercel dashboard → Import Git Repository → Root Directory: `frontend/`

**Required env var in Vercel:**

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://tracevault-backend.up.railway.app` |

The build will fail with a clear error if this is missing — intentional, see `next.config.js`.

---

### Step 4 — Lock CORS to your Vercel URL

Railway → Service: backend → Variables:

```
FRONTEND_URL=https://your-actual-app.vercel.app
```

Redeploy. CORS then accepts only that origin.

---

### Step 5 — Seed data

```bash
curl -X POST https://tracevault-backend.up.railway.app/index/default
# → {"indexed": 45, "source": "sample_dataset", "status": "ok"}
```

Or use the Index tab in the deployed frontend.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | DB connection status, collection info, point count |
| `/meta` | GET | Distinct services and severities currently indexed |
| `/index/default` | POST | Index the built-in 45-incident sample dataset |
| `/index/file` | POST | Upload a JSON file of incidents |
| `/index` | POST | Index incidents from request body |
| `/search` | POST | Vector similarity search with match explanation |

### Search request

```json
{
  "query": "connection pool timeout during traffic spike",
  "top_k": 5,
  "severity": "critical",
  "service": "payment-service"
}
```

`top_k` is capped to [1, 50]. `severity` must be `critical`, `high`, `medium`, or `low` — anything else is rejected with a 422 and a field-level error message.

### Search response (per result)

```json
{
  "incident_id": "INC-001",
  "score": 0.9341,
  "title": "Database connection pool exhausted under traffic spike",
  "service": "user-service",
  "severity": "critical",
  "date": "2024-11-15",
  "root_cause": "Pool size set to 10; 50+ concurrent requests during spike",
  "fix": "Increased pool size to 50, added circuit breaker",
  "failure_mode": "connection pool exhaustion",
  "match_reason": "PoolInitializationException in user-service — connection pool exhaustion",
  "primary_signal": "error_message",
  "context_hints": ["exception match", "same service", "critical severity"],
  "match_signals": {
    "title": ["connection", "pool", "exhausted"],
    "error": ["connection", "pool", "timeout"],
    "tags": ["database", "connection-pool", "timeout"],
    "exception": ["PoolInitializationException"],
    "failure_mode": "connection pool exhaustion",
    "severity": "critical"
  }
}
```

---

## Incident Schema

All fields validated by `IncidentInput` in `backend/api.py`. Only `title` is required.

```json
{
  "id": "INC-001",
  "title": "Database connection pool exhausted under traffic spike",
  "service": "user-service",
  "component": "db-layer",
  "severity": "critical",
  "date": "2024-11-15",
  "error_message": "HikariPool - Connection is not available, request timed out after 30000ms",
  "root_cause": "Pool size set to 10; 50+ concurrent requests during traffic spike",
  "fix": "Increased pool size to 50, added circuit breaker pattern",
  "stack_trace": "...",
  "tags": ["database", "connection-pool", "timeout", "hikari"]
}
```

`severity` must be `critical`, `high`, `medium`, or `low`. `date` accepts `YYYY-MM-DD` or a full ISO-8601 datetime (time portion is discarded). `tags` accepts a list of strings or a comma-separated string.

---

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `VECTORAI_DB_ADDR` | Backend | gRPC address of VectorAI DB, e.g. `localhost:50051` |
| `VECTORAI_COLLECTION` | Backend | Collection name (default: `tracevault_incidents`) |
| `VECTORAI_DIM` | Backend | Embedding dimension (default: `512`) |
| `FRONTEND_URL` | Backend (Railway) | Vercel URL — restricts CORS in production |
| `NEXT_PUBLIC_API_URL` | Frontend (Vercel) | Railway backend public URL |
| `VECTORAI_WHL_URL` | Backend build arg | SDK `.whl` download URL if not committed to repo |
| `PORT` | **Do not set** | Railway injects this automatically |

See `.env.example` for full documentation.

---

## Deployment Checklist

- [ ] `actian_vectorai-0.1.0b2-py3-none-any.whl` in `backend/` OR `VECTORAI_WHL_URL` build arg set
- [ ] Railway: `vectoraidb` service running with `/data` volume mounted
- [ ] Railway: `backend` service passing healthcheck at `/health`
- [ ] Railway: `VECTORAI_DB_ADDR=vectoraidb.railway.internal:50051`
- [ ] Vercel: `NEXT_PUBLIC_API_URL` set to Railway backend URL
- [ ] Railway: `FRONTEND_URL` updated to Vercel URL (triggers CORS lock)
- [ ] Sample data indexed: `POST /index/default` returns `{"indexed": 45}`

---

## Judging Notes

**VectorAI DB is not a peripheral.** Every search goes: embed locally → gRPC to VectorAI DB → HNSW cosine search → ranked payloads back. The backend does three things: embed the query (local, deterministic), validate requests, and build match explanations. Everything else — vector storage, nearest-neighbor search, payload filtering — is VectorAI DB. There is no search path that bypasses it.

**The embedding is a deliberate trade-off.** A hashing trick (bag-of-words + bigrams, 512-dim) is weaker than a neural model on paraphrase recall, but it is deterministic, fully offline, and fast. For incident retrieval, where titles, error messages, tags, and stack traces already use precise technical vocabulary, token overlap is a strong signal. The match explanation layer (`build_match_reason()` in `vectordb.py`) makes every result auditable: `failure_mode` shows the inferred failure category, `match_reason` names what specifically matched, and `context_hints` lists the alignment signals (exception match, same service, stack overlap). No black-box scores.

**Retrieval quality is verifiable.** [`docs/demo.md`](docs/demo.md) has five demo queries with expected top results, per-query rationale, a severity-filter smoke test, and an out-of-distribution edge case with expected low scores. Any of them can be reproduced with the curl commands provided in under 60 seconds.
