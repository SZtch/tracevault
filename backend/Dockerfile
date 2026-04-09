FROM python:3.11-slim

WORKDIR /app

# ── System deps ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps ───────────────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── actian_vectorai SDK install ───────────────────────────────────────────────
# Two paths:
#
# PATH A — Local .whl (for local Docker builds and Railway if whl is committed):
#   Place actian_vectorai-0.1.0b2-py3-none-any.whl in backend/
#   It is picked up automatically here.
#
# PATH B — Download URL (for Railway builds without committing the whl):
#   Set VECTORAI_WHL_URL build arg in Railway → Settings → Build → Build Arguments
#   e.g. VECTORAI_WHL_URL=https://your-host/actian_vectorai-0.1.0b2-py3-none-any.whl

ARG VECTORAI_WHL_URL=""

# Try URL first (Railway path), then local file (local build path)
RUN if [ -n "$VECTORAI_WHL_URL" ]; then \
      echo "Downloading actian_vectorai from $VECTORAI_WHL_URL" && \
      pip install "$VECTORAI_WHL_URL"; \
    elif ls actian_vectorai*.whl 2>/dev/null; then \
      echo "Installing actian_vectorai from local .whl" && \
      pip install actian_vectorai*.whl; \
    else \
      echo ""; \
      echo "ERROR: actian_vectorai SDK not found."; \
      echo "  Option A: Place actian_vectorai-0.1.0b2-py3-none-any.whl in backend/"; \
      echo "  Option B: Set VECTORAI_WHL_URL build arg to a download URL"; \
      echo ""; \
      exit 1; \
    fi

# ── Application code ──────────────────────────────────────────────────────────
# Copies backend/ contents. data/ is added via WORKDIR context — see docker-compose.
COPY . .

# ── Runtime ───────────────────────────────────────────────────────────────────
# PORT is injected by Railway (varies per deployment).
# Shell form is required here — exec form ["uvicorn", ..., "8000"] ignores $PORT.
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
