# Root Dockerfile — used by Railway (build context = project root)
# Gives the image access to both backend/ and data/ in one build.
#
# For local backend-only builds, backend/Dockerfile still works independently.

FROM python:3.11-slim

WORKDIR /app

# ── System deps ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd curl \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps ───────────────────────────────────────────────────────────────
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── actian_vectorai SDK ───────────────────────────────────────────────────────
# PATH A: Set VECTORAI_WHL_URL build arg → downloaded at Railway build time
# PATH B: Commit actian_vectorai-0.1.0b2-py3-none-any.whl into backend/ → picked up here
# One of these MUST be set or the build fails.

ARG VECTORAI_WHL_URL=""

# Docker COPY doesn't support shell operators (|| etc), so we use a two-step approach:
# 1. Copy the entire backend dir to a staging location (always succeeds)
# 2. Let the RUN step check for the .whl and decide what to do
COPY backend/ /tmp/backend_stage/

RUN if [ -n "$VECTORAI_WHL_URL" ]; then \
      echo "Downloading SDK from $VECTORAI_WHL_URL" && \
      pip install "$VECTORAI_WHL_URL"; \
    elif ls /tmp/backend_stage/actian_vectorai*.whl 1>/dev/null 2>&1; then \
      echo "Installing SDK from committed .whl" && \
      pip install /tmp/backend_stage/actian_vectorai*.whl; \
    else \
      echo ""; \
      echo "BUILD ERROR: actian_vectorai SDK not found."; \
      echo "  Fix A: Set VECTORAI_WHL_URL build arg in Railway → Service → Settings → Build"; \
      echo "  Fix B: Commit actian_vectorai-0.1.0b2-py3-none-any.whl to backend/"; \
      echo ""; \
      exit 1; \
    fi

# ── Application source ────────────────────────────────────────────────────────
COPY backend/ ./

# Bake sample data into image. api.py resolves Path(__file__).parent.parent / "data"
# which is /app/../data = /data when running from /app.
COPY data/ /data/

# ── Runtime ───────────────────────────────────────────────────────────────────
# Shell form required — exec form ignores $PORT (Railway injects this).
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
