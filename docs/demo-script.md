# TraceVault — Live Demo Script

*~90 seconds. Works best with the Index tab done before you walk up.*

---

## Before you start (30 seconds of setup, do this privately)

```bash
# Backend + DB running?
curl -s http://localhost:8000/health | jq .connected   # → true

# Dataset indexed?
curl -s -X POST http://localhost:8000/index/default    # → {"indexed": 45}
```

Open `http://localhost:3000`. You should see the status dot green and "45 incidents indexed" in the sidebar.

---

## The 60-second demo

### Opening line (say this while the page loads)

> "When you get paged at 2am, the fastest path to a fix is almost always:
> has this happened before? That answer is usually buried in a postmortem
> nobody can find in time. TraceVault indexes your incident history as vectors —
> paste the error you're seeing and get back the closest past incidents,
> with their root causes and fixes."

---

### Demo 1 — Connection pool (15 seconds)

Click the **"Connection pool →"** chip.

*Results appear.*

> "I typed the HikariPool error I'm seeing. It immediately surfaces three past incidents
> where the same thing happened — all critical severity, across different services.
> The top match is 91% similarity. Notice it shows me the failure mode label
> — connection pool exhaustion — and exactly which terms drove the match.
> Most importantly: root cause and fix, right there."

Point at the **Fix Applied** box on the top card. It should read something about increasing pool size and separating batch traffic.

---

### Demo 2 — Kafka lag (15 seconds)

Click **"Kafka consumer lag →"** chip.

*Results appear.*

> "Completely different failure mode. Kafka consumer group falling behind.
> The top match is INC-036 — the system found it because the title is almost identical
> to what I typed. But look at results two and three: partition rebalance and schema
> serialization failure. Same symptom — consumer lag — three different root causes.
> That's exactly what you want when you're on-call and don't know which one you have."

---

### Demo 3 — gRPC / ML (15 seconds)

Click **"gRPC / ML inference →"** chip.

*Results appear.*

> "Third cluster: gRPC deadline exceeded on an ML inference service.
> Look at the three services returned: ml-service, recommendation-service, personalization-service.
> Three separate teams had this exact problem. Each has a different root cause —
> channel pool exhaustion, deadline too tight, cold-start latency.
> The system found the cross-service pattern automatically."

---

### Closing (10 seconds)

> "Forty-five incidents, five failure clusters, runs completely offline —
> no cloud model, no API key, no nondeterminism.
> The embedding is local. VectorAI DB owns the HNSW index and the cosine search.
> Everything you just saw runs on a laptop with zero internet after image pull."

---

## If a judge asks: "isn't this just text search?"

> "It's vector similarity over a hashing embedding — closer to approximate nearest-neighbor
> search than to a keyword index. There's no inverted index, no BM25, no exact-match requirement.
> The query and the incident both get embedded to float vectors, and VectorAI DB finds the
> closest vectors in the collection.
>
> That said, the embedding is token-based — bag of words plus bigrams — so token overlap
> is still the main signal. The honest claim is that bigram encoding gives some tolerance
> for phrasing variation (\"connection pool exhausted\" vs \"pool not available\"), not full
> semantic paraphrase. You can verify the match signals on every result card — it shows
> exactly which terms overlapped and in which fields."

*(Don't say "understands meaning" or "semantically aware" — the embedding is a hashing trick, not a language model. The honest claim is: fast, deterministic, offline nearest-neighbor search over incident vocabulary — which is enough for the problem.)*

---

## Demo queries cheat sheet (if chips break)

| Query to type | Expected #1 result |
|---------------|-------------------|
| `HikariPool connection not available, requests timing out under load` | INC-001 — DB connection pool exhausted |
| `Kafka consumer group lag growing, batch processor stuck behind` | INC-036 — Kafka consumer group lag growing |
| `gRPC deadline exceeded on ML inference service, requests failing` | INC-026 — gRPC channel exhaustion ML inference |
