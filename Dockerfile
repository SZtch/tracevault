FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Python deps (cached layer — only invalidated when requirements.txt changes)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# actian_vectorai SDK
#
# The wheel is NOT on PyPI. Two install paths:
#
#   PATH A (local build): Place actian_vectorai-0.1.0b2-py3-none-any.whl in
#           backend/ before building. Get it from:
#           https://github.com/hackmamba-io/actian-vectorAI-db-beta
#
#   PATH B (Railway / CI): Set VECTORAI_WHL_URL build arg to a direct download
#           URL in Railway -> Service -> Settings -> Build Arguments.
#
# If neither is provided the build fails immediately with a clear message.

ARG VECTORAI_WHL_URL=""

# Docker COPY has no shell fallback syntax (no || operator).
# Staging the full context first lets the RUN shell glob for the .whl safely.
COPY backend/ /tmp/backend_stage/

RUN if [ -n "$VECTORAI_WHL_URL" ]; then \
      echo "==> Downloading actian_vectorai SDK from $VECTORAI_WHL_URL" && \
      pip install "$VECTORAI_WHL_URL"; \
    elif ls /tmp/backend_stage/actian_vectorai*.whl 1>/dev/null 2>&1; then \
      echo "==> Installing actian_vectorai SDK from local wheel" && \
      pip install /tmp/backend_stage/actian_vectorai*.whl; \
    else \
      echo ""; \
      echo "BUILD ERROR: actian_vectorai SDK wheel not found."; \
      echo ""; \
      echo "  Fix: place actian_vectorai-0.1.0b2-py3-none-any.whl in backend/"; \
      echo "  Source: https://github.com/hackmamba-io/actian-vectorAI-db-beta"; \
      echo ""; \
      exit 1; \
    fi

# Application source — backend/ contents go to /app so uvicorn finds api.py directly
COPY backend/ ./

# Bake sample data into image — api.py resolves Path(__file__).parent.parent / "data"
# = /app/../data = /data when running from /app
COPY data/ /data/

# PORT is injected by Railway. Shell form is required — exec form ignores $PORT.
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
