# TraceVault

**Paste an error or stack trace. Find the last time something broke like this — and what fixed it.**

TraceVault indexes incident history as vectors and retrieves the closest past incidents from a new error, including root causes and proven fixes, using local embeddings and Actian VectorAI DB.

> Built for the **Actian VectorAI DB Build Challenge**  
> Local embeddings · Search runs independently of any cloud API · Deployable on Vercel + Railway · ARM-compatible

---

## The problem

When production breaks, the first question is usually: *has this happened before?*

The answer is almost always buried somewhere — a postmortem doc, a Slack thread, a Confluence page nobody remembers. Keyword search doesn't help much either, because the same failure gets described differently every time. `"HikariPool connection not available"` and `"connection pool exhausted"` mean the same thing, but a text search for one won't find the other.

So you spend 20 minutes reading the wrong incidents while something is actively on fire.

TraceVault uses vector search to fix this. Paste whatever you have — the raw error, the alert message, a fragment of the stack trace — and it finds what broke like this before, even when the same failure is described differently.

---

## How it works

Every search follows this flow:

1. **Local embedding** — the query is converted into a 384-dim vector using `all-MiniLM-L6-v2`, running locally. No API call required — runs locally once the embedding model is cached.
2. **VectorAI DB similarity search** — the vector is sent via gRPC to VectorAI DB, which runs HNSW cosine similarity across all indexed incidents. Optional filters (severity, service) are applied at this layer.
3. **Matched historical incidents** — results come back with a structured match explanation: what matched, which field it came from, and what failure category it belongs to.
4. **Optional triage brief** — generated from retrieved incidents only, using whichever provider you have: Anthropic (cloud) or Ollama (fully offline). Core retrieval runs without either.

VectorAI DB owns vector storage, the HNSW index, cosine search, and payload filtering. The FastAPI backend handles embedding and result enrichment. The Next.js frontend is a thin layer on top.

---

## What each result includes

- Similarity score (cosine, 0–1)
- Title, service, severity, date
- Root cause and fix from the matched incident
- `failure_mode` — inferred failure category (e.g. "connection pool exhaustion")
- `match_reason` — one sentence explaining what matched and where
- `context_hints` — short signals like "exception match", "same service", "stack overlap"
- `triage_brief` — optional grounded first-response summary when Anthropic is configured

---

## Stack

| Layer | Technology |
|-------|------------|
| Vector DB | **Actian VectorAI DB** — gRPC, HNSW, cosine similarity |
| Embedding | `all-MiniLM-L6-v2` via sentence-transformers, 384-dim, local |
| Triage brief | Anthropic Claude — optional, grounded on retrieved incidents only |
| Backend | FastAPI + Python 3.11, Pydantic v2 |
| Frontend | Next.js 14 |
| Offline | ✅ Embedding runs locally once the model is cached (~90MB, downloaded on first run) |
| Cloud | ✅ Vercel (frontend) + Railway (backend + DB) |
| ARM | ✅ VectorAI DB image includes ARM64 |

---

## Demo queries

Index the 45-incident sample dataset, then try these. Each one targets a real failure cluster in the data:

| Query | Expected results |
|-------|-----------------|
| `hikari pool exhausted during high traffic` | INC-001, INC-013, INC-019 — connection pool cluster |
| `gRPC deadline exceeded, ML service not responding` | INC-026, INC-009, INC-040 — gRPC deadline cluster |
| `checkout keeps getting 504s, payment provider timing out` | INC-022, INC-044, INC-024 — upstream cascade cluster |
| `kafka consumer lag growing, batch jobs falling behind` | INC-036, INC-011, INC-030 — queue backlog cluster |
| `analytics worker OOMKilled, pod keeps restarting` | INC-004, INC-034, INC-037 — OOM/memory cluster |

These use real engineer phrasing, not polished textbook terms. See [`docs/demo.md`](docs/demo.md) for full expected results and a severity-filter smoke test.

---

## Quick start

```bash
# 1. Clone and configure
git clone https://github.com/SZtch/tracevault && cd tracevault
cp .env.example .env          # defaults work for local dev; set ANTHROPIC_API_KEY for triage briefs

# 2. Start backend + VectorAI DB
docker compose up --build -d

# 3. Start the frontend
cd frontend && npm install && npm run dev   # add NEXT_PUBLIC_API_URL=http://localhost:8000 to frontend/.env.local

# 4. Seed data
curl -X POST http://localhost:8000/index/default
```

Open [http://localhost:3000](http://localhost:3000) and try a demo query. Full setup details below.

---

## Running locally (docker compose)

### Prerequisites

- Docker + Docker Compose
- Node.js 18+

### Steps

**1. Clone the repo and set up config**
```bash
git clone https://github.com/SZtch/tracevault
cd tracevault
cp .env.example .env
```
The defaults in `.env.example` work as-is for local dev. Set `ANTHROPIC_API_KEY` in `.env` if you want triage briefs.

**2. (Optional) Pre-download the embedding model**

The first `docker compose up --build` downloads `all-MiniLM-L6-v2` (~90MB) automatically. If you want search to work with no internet afterwards, cache it now while you still have a connection:

```bash
pip install sentence-transformers
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
```

After this the model is cached locally. Search runs independently of any cloud API.

**3. Start the backend + VectorAI DB**
```bash
docker compose up --build -d
```
This starts two containers: VectorAI DB on port 50051 and the FastAPI backend on port 8000.

**4. Check the backend is up**
```bash
curl http://localhost:8000/health
# → {"connected": true, "collection_exists": false, ...}
```

**5. Start the frontend**
```bash
cd frontend
npm install
npm run dev
```
Create `frontend/.env.local` with:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**6. Index the sample dataset**
```bash
curl -X POST http://localhost:8000/index/default
# → {"indexed": 45, "source": "sample_dataset", "status": "ok"}
```

**7. Open the app**

Go to [http://localhost:3000](http://localhost:3000) and try one of the demo queries above.

---

## Fully offline triage (Ollama)

If you want triage briefs without sending data to any cloud API, run Ollama locally and point TraceVault at it.

```bash
# Pull a model
ollama pull llama3

# Add to .env
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3   # optional, default is llama3
```

Provider priority: Anthropic takes precedence if both are set. If neither is configured, triage brief is skipped and core retrieval still works normally.

---

## Deploying online (Vercel + Railway)

### Architecture

```
Railway Project: tracevault
├── Service: vectoraidb   ← Docker image, internal gRPC only (not public)
│   └── Volume: /data     ← persistent — data survives redeployments
└── Service: backend      ← public HTTPS, PORT injected by Railway
    └── VECTORAI_DB_ADDR: vectoraidb.railway.internal:50051
```

VectorAI DB stays internal — Railway's public proxy is HTTP-only, but the DB speaks gRPC. Everything goes through the backend.

---

### Step 1 — Deploy VectorAI DB on Railway

1. Create a new Railway project
2. **New Service → Docker Image**
   - Image: `williamimoh/actian-vectorai-db:latest`
   - Service name: `vectoraidb`
3. **Do not** enable a public domain — internal only
4. **Volumes** tab → Add Volume, mount path `/data`
5. No env vars needed for this service

---

### Step 2 — Deploy the backend on Railway

1. **New Service → GitHub Repo** in the same project
   - Root directory: `/`
   - Railway auto-detects `railway.json` and `Dockerfile`
2. Set these environment variables:

| Variable | Value |
|----------|-------|
| `VECTORAI_DB_ADDR` | `vectoraidb.railway.internal:50051` |
| `VECTORAI_COLLECTION` | `tracevault_incidents` |
| `VECTORAI_DIM` | `384` |
| `FRONTEND_URL` | `https://your-app.vercel.app` ← fill in after Vercel deploy |
| `ANTHROPIC_API_KEY` | your key (optional — enables triage briefs) |

3. Enable a public domain and copy the URL
4. Wait for `/health` to return green

---

### Step 3 — Deploy the frontend on Vercel

```bash
cd frontend && npx vercel
```

Or import from the Vercel dashboard (Root Directory: `frontend/`).

Set this env var in Vercel:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.up.railway.app` |

---

### Step 4 — Lock CORS

Railway → backend → Variables:
```
FRONTEND_URL=https://your-actual-app.vercel.app
```
Redeploy. The backend will only accept requests from that origin.

---

### Step 5 — Seed data

```bash
curl -X POST https://your-backend.up.railway.app/index/default
# → {"indexed": 45, "source": "sample_dataset", "status": "ok"}
```

Or use the Index tab in the frontend.

---

## Deployment checklist

- [ ] Railway: `vectoraidb` running with `/data` volume mounted
- [ ] Railway: `backend` passing healthcheck at `/health`
- [ ] Railway: `VECTORAI_DB_ADDR=vectoraidb.railway.internal:50051`
- [ ] Railway: `VECTORAI_DIM=384`
- [ ] Vercel: `NEXT_PUBLIC_API_URL` set to Railway backend URL
- [ ] Railway: `FRONTEND_URL` updated to Vercel URL
- [ ] Data indexed: `POST /index/default` returns `{"indexed": 45}`

---

## API reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | DB connection status and collection info |
| `/meta` | GET | Distinct services and severities in the index |
| `/index/default` | POST | Index the built-in 45-incident sample dataset |
| `/index/file` | POST | Upload a JSON file of incidents |
| `/index` | POST | Index incidents from request body |
| `/search` | POST | Semantic search with match explanation |

### Search request

```json
{
  "query": "connection pool timeout during traffic spike",
  "top_k": 5,
  "severity": "critical",
  "service": "payment-service"
}
```

`severity` must be `critical`, `high`, `medium`, or `low`. `top_k` is capped at 50. Both filters are optional.

---

## Incident schema

Only `title` is required. The more fields you fill in, the better the retrieval quality.

```json
{
  "id": "INC-001",
  "title": "Database connection pool exhausted under traffic spike",
  "service": "user-service",
  "severity": "critical",
  "date": "2024-11-15",
  "error_message": "HikariPool - Connection is not available, request timed out after 30000ms",
  "root_cause": "Pool size set to 10; 50+ concurrent requests during traffic spike",
  "fix": "Increased pool size to 50, added circuit breaker pattern",
  "stack_trace": "...",
  "tags": ["database", "connection-pool", "timeout", "hikari"]
}
```

`date` accepts `YYYY-MM-DD` or full ISO-8601. `tags` accepts a list of strings or a comma-separated string.

---

## Environment variables

| Variable | Where | Default | Description |
|----------|-------|---------|-------------|
| `VECTORAI_DB_ADDR` | Backend | `localhost:50051` | gRPC address of VectorAI DB |
| `VECTORAI_COLLECTION` | Backend | `tracevault_incidents` | Collection name |
| `VECTORAI_DIM` | Backend | `384` | Embedding dimension |
| `FRONTEND_URL` | Backend (Railway) | — | Vercel URL — locks CORS in production |
| `ANTHROPIC_API_KEY` | Backend | — | Enables triage briefs via Claude (optional) |
| `ANTHROPIC_MODEL` | Backend | `claude-sonnet-4-6` | Anthropic model for triage briefs |
| `OLLAMA_URL` | Backend | — | Ollama base URL for offline triage (e.g. `http://localhost:11434`) |
| `OLLAMA_MODEL` | Backend | `llama3` | Ollama model for triage briefs |
| `NEXT_PUBLIC_API_URL` | Frontend (Vercel) | — | Railway backend public URL |
