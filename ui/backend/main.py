"""
Genoly-GPU UI: API REST del backend.

Sirve los módulos de Genoly (GPU/CUDA) a través de FastAPI y, en
producción, el frontend React compilado (ui/frontend/dist).

Arranque (desde cualquier directorio, incluido ui/backend):
    uvicorn main:app --host 0.0.0.0 --port 8000
o desde la raíz del proyecto:
    python -m uvicorn ui.backend.main:app --host 0.0.0.0 --port 8000

Nota: usar --workers 1 (por defecto). El estado de los trabajos de fondo
y sus streams SSE vive en memoria del proceso, y los trabajos GPU ya se
serializan internamente; varios procesos competirían por la misma VRAM.
"""

import sys
from pathlib import Path

# Bootstrap de imports: añade la raíz del proyecto a sys.path para que
# `Genoly` y `ui.backend.*` resuelvan aunque uvicorn se ejecute desde
# ui/backend (o desde otro directorio de trabajo).
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from Genoly import __version__
from Genoly.core.gpu_setup import GpuSetup

from ui.backend.routers import device, qc, kmer, variants, upload, quantitative, gblup, jobs

app = FastAPI(
    title="Genoly-GPU API",
    description="API REST de análisis genómico acelerado por GPU (NVIDIA/CUDA)",
    version=__version__,
)

# CORS: permitir el dev server de Vite durante desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(device.router)
app.include_router(qc.router)
app.include_router(kmer.router)
app.include_router(variants.router)
app.include_router(quantitative.router)
app.include_router(gblup.router)
app.include_router(upload.router)
app.include_router(jobs.router)


@app.get("/api/health")
def health() -> dict:
    """Comprobación de salud del servicio."""
    return {"status": "ok", "version": __version__}


@app.get("/api/setup")
def setup_status() -> dict:
    """Estado de la GPU y build de PyTorch (compatibilidad CUDA)."""
    info = GpuSetup.detect_nvidia()
    status = GpuSetup.torch_status()
    tag = GpuSetup.recommend_cuda_tag(info.cuda_version) if info.available else None
    return {
        "nvidia": info.__dict__,
        "torch": status,
        "recommended_cuda_tag": tag,
        "install_command": GpuSetup.install_command(tag) if tag else None,
    }


# Montar el frontend compilado si existe (producción)
FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("ui.backend.main:app", host="0.0.0.0", port=8000, reload=True)