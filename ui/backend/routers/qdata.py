"""
Carga robusta de datos para genética cuantitativa (CSV/Excel sucios).

- POST /api/qdata/preview -> perfil del archivo subido (delimitador,
  cabecera, columnas con tipo y datos perdidos, filas de ejemplo).
- POST /api/qdata/clean    -> limpieza/imputación/filtrado en un proceso
  aislado; guarda la matriz limpia como subida (``clean_id``) y devuelve
  el reporte.
- GET  /api/qdata/{id}     -> matriz limpia {phenotypes, genotypes,
  markers, report} para enviar a los modelos.
"""

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from ui.backend import jobs
from ui.backend.uploads import UPLOAD_DIR, create_upload, get_upload, upload_path

router = APIRouter(prefix="/api/qdata", tags=["qdata"])


class QDataPreviewRequest(BaseModel):
    upload_id: str
    max_rows: int = 2000


class QDataCleanRequest(BaseModel):
    upload_id: str
    phenotype_col: int = 0
    impute_method: str = "media"
    max_column_missingness: float = 1.0
    min_individuals: int = 5
    min_markers: int = 2


class QDataJobResponse(BaseModel):
    job_id: str
    events_url: str
    clean_id: str


@router.post("/preview")
def preview(req: QDataPreviewRequest) -> dict:
    """Perfil del archivo subido para decidir la limpieza."""
    from Genoly.quantitative.preprocess import load_grid, profile_grid
    path = upload_path(req.upload_id)
    try:
        grid = load_grid(path, max_rows=req.max_rows)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Archivo ilegible: {exc}")

    profile = profile_grid(grid)
    sample = [row[:min(len(row), 12)] for row in grid[:15]]
    return {
        "rows_preview": len(grid),
        "sample_rows": sample,
        "columns": profile["columns"],
        "column_names": profile["column_names"],
        "header_detected": profile["header_detected"],
    }


@router.post("/clean", response_model=QDataJobResponse)
async def clean(req: QDataCleanRequest) -> QDataJobResponse:
    """Limpia, imputa y filtra la matriz en un proceso aislado."""
    path = upload_path(req.upload_id)
    if req.impute_method not in ("media", "moda"):
        raise HTTPException(status_code=422,
                            detail="impute_method debe ser 'media' o 'moda'")

    clean_id = uuid4().hex
    clean_path = UPLOAD_DIR / f"{clean_id}.json"
    create_upload(clean_id, "qdata", Path(clean_path), "limpio.json", 0)

    job = jobs.manager.create("qdata_clean")
    jobs.manager.submit_process(job, {
        "kind": "qdata_clean",
        "path": str(path),
        "out_path": str(clean_path),
        "out_upload_id": clean_id,
        "phenotype_col": req.phenotype_col,
        "impute_method": req.impute_method,
        "max_column_missingness": req.max_column_missingness,
        "min_individuals": req.min_individuals,
        "min_markers": req.min_markers,
    })
    return QDataJobResponse(job_id=job.id,
                            events_url=f"/api/jobs/{job.id}/events",
                            clean_id=clean_id)


@router.get("/{clean_id}")
def get_clean(clean_id: str) -> dict:
    """Matriz limpia (fenotipos, genotipos, marcadores, reporte)."""
    meta = get_upload(clean_id)
    if meta is None or meta.get("kind") != "qdata":
        raise HTTPException(status_code=404, detail="Datos limpios no encontrados")
    path = Path(meta["path"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="El archivo ya no existe")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise HTTPException(status_code=500,
                            detail="No se pudo leer la matriz limpia")
    data["clean_id"] = clean_id
    data["filename"] = meta.get("filename")
    return data