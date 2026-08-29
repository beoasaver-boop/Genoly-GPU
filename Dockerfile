
#   docker run -d --name genoly -p 8000:8000 genoly-gpu:latest
#   # con puerto distinto:  docker run -d --name genoly -p 8080:8000 genoly-gpu:latest
#
# O con docker-compose (ya lo hace en ports: "8000:8000").
# ============================================================================ #

# ============================================================================ #
# STAGE 1: build del frontend React (Vite + Tailwind)
# Vite 8 exige Node 20.19+/22.12+ (node:20-alpine flotante ya cae en 20.19+,
# pero fijamos 22 LTS para builds reproducibles)
# ============================================================================ #
FROM node:22-alpine AS frontend-build

WORKDIR /app/ui/frontend

# Instalar dependencias con lockfile para builds reproducibles
COPY ui/frontend/package.json ui/frontend/package-lock.json ./
RUN npm ci

# Compilar el frontend (genera ui/frontend/dist)
COPY ui/frontend/ ./
RUN npm run build

# ============================================================================ #
# STAGE 2: runtime (API FastAPI + PyTorch CUDA)
# ============================================================================ #
FROM python:3.12-slim

# Puerto en el que escuchará uvicorn dentro del contenedor (configurable).
ARG GENOLY_PORT=8000
ENV GENOLY_PORT=$GENOLY_PORT \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    GENOLY_DEVICE=auto

WORKDIR /app

# PyTorch con soporte CUDA 12.6 (build probada con RTX 3050).
# Si el host no expone la GPU (nvidia-container-toolkit), PyTorch
# cae automáticamente a CPU gracias a la auto-detección de Genoly.
RUN pip install --no-cache-dir torch torchvision \
    --index-url https://download.pytorch.org/whl/cu126

# Dependencias del proyecto
COPY requirements.txt .
COPY ui/backend/requirements.txt ./ui/backend/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r ui/backend/requirements.txt

# Código de la aplicación
COPY Genoly ./Genoly
COPY ui/backend ./ui/backend

# Frontend compilado (servido por FastAPI en /)
COPY --from=frontend-build /app/ui/frontend/dist ./ui/frontend/dist

# Usuario no root
RUN useradd --create-home --shell /usr/sbin/nologin genoly \
    && chown -R genoly:genoly /app
USER genoly

EXPOSE $GENOLY_PORT

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"GENOLY_PORT\"]}/api/health')" || exit 1

CMD uvicorn ui.backend.main:app --host 0.0.0.0 --port $GENOLY_PORT