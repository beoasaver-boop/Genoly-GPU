"""
Mapeo de lecturas a un genoma de referencia (seed-and-extend).

- POST /api/map -> encola el mapeo como trabajo aislado (proceso aparte);
  el progreso y el resultado llegan por el stream SSE de ``events_url``.
  Con ``produce_sam`` escribe el SAM resultante en una subida descargable.
"""

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ui.backend import jobs
from ui.backend.uploads import UPLOAD_DIR, create_upload, upload_path

router = APIRouter(prefix="/api/map", tags=["map"])


class MapRequest(BaseModel):
    ref_upload_id: str          # FASTA de referencia (upload o ruta registrada)
    reads_upload_id: str        # FASTQ de lecturas
    k: int = 15
    stride: int = 1
    min_seeds: int = 2
    sample_limit: int = 500
    produce_sam: bool = True    # escribe el SAM en una subida descargable


class MapJobResponse(BaseModel):
    job_id: str
    events_url: str


@router.post("", response_model=MapJobResponse)
async def map_reads(req: MapRequest) -> MapJobResponse:
    """Mapea las lecturas contra la referencia en un proceso aislado."""
    if not 1 <= req.k <= 31:
        raise HTTPException(status_code=422, detail="k debe estar entre 1 y 31")
    if req.stride < 1:
        raise HTTPException(status_code=422, detail="stride debe ser >= 1")

    ref_path = upload_path(req.ref_upload_id)
    reads_path = upload_path(req.reads_upload_id)

    spec = {
        "kind": "map",
        "ref_path": str(ref_path),
        "reads_path": str(reads_path),
        "k": req.k,
        "stride": req.stride,
        "min_seeds": req.min_seeds,
        "sample_limit": req.sample_limit,
        "sam_path": None,
        "sam_upload_id": None,
    }
    if req.produce_sam:
        sam_id = uuid4().hex
        spec["sam_path"] = str(UPLOAD_DIR / f"{sam_id}.sam")
        spec["sam_upload_id"] = sam_id
        create_upload(sam_id, "sam", Path(spec["sam_path"]), "map.sam", 0)

    job = jobs.manager.create("map")
    jobs.manager.submit_process(job, spec)
    return MapJobResponse(job_id=job.id,
                          events_url=f"/api/jobs/{job.id}/events")