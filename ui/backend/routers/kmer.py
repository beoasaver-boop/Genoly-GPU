"""
Conteo de k-mers sobre GPU.

- POST /api/kmer/count       -> síncrono (FastAPI lo ejecuta en el
  threadpool; no bloquea el event loop). Usa el pipeline de streaming
  para archivos subidos.
- POST /api/kmer/count-async -> encola un trabajo de fondo y devuelve un
  job_id; el progreso se consulta por SSE en /api/jobs/{id}/events.

Los archivos subidos se procesan con el pipeline de streaming completo:
lectura por bloques de disco (64 KiB) -> ventanas con solape k-1 ->
lotes de RAM -> micro-lotes adaptativos de GPU según la VRAM libre
(``KmerCounter.count_fasta``), con RAM y VRAM acotadas sea cual sea el
tamaño del archivo.
"""

import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from Genoly.io.fasta import FastaReader
from Genoly.kmer.kmers import KmerCounter

from ui.backend import jobs
from ui.backend.uploads import upload_path

router = APIRouter(prefix="/api/kmer", tags=["kmer"])

#: Frecuencia máxima de publicación de eventos de progreso (segundos).
PROGRESS_INTERVAL_SECONDS = 0.5


class KmerRequest(BaseModel):
    sequences: List[str] = []
    k: int = 21
    canonical: bool = True
    min_abundance: int = 1
    top: int = 20
    upload_id: Optional[str] = None  # archivo FASTA subido (streaming)


class KmerResponse(BaseModel):
    k: int
    total_unique: int
    total_kmers: int
    top_kmers: List[dict]
    spectrum: dict
    genome_estimate: Optional[float] = None


class KmerJobResponse(BaseModel):
    job_id: str
    events_url: str


def _validate(req: KmerRequest) -> None:
    if not 1 <= req.k <= 31:
        raise HTTPException(status_code=422,
                            detail="k debe estar entre 1 y 31")
    if not req.upload_id and not req.sequences:
        raise HTTPException(status_code=422,
                            detail="Indica secuencias o un archivo subido")


def _build_payload(kc: KmerCounter, req: KmerRequest,
                   values, counts) -> dict:
    top_kmers = [
        {"kmer": kc.decode_kmer(int(v), req.k), "count": int(c)}
        for v, c in zip(values[:req.top].tolist(), counts[:req.top].tolist())
    ]

    spectrum = KmerCounter.spectrum_from_counts(counts)

    estimate = None
    if req.min_abundance <= 1 and values.numel() > 0:
        size, _ = KmerCounter.estimate_from_counts(counts)
        estimate = round(size, 0) if size > 0 else None

    return {
        "k": req.k,
        "total_unique": len(values),
        "total_kmers": int(counts.sum().item()) if len(counts) else 0,
        "top_kmers": top_kmers,
        "spectrum": spectrum,
        "genome_estimate": estimate,
    }


def _finalize_estimate(payload: dict, req: KmerRequest) -> dict:
    """Añade la estimación de genoma al payload del modo agregado."""
    estimate = None
    if req.min_abundance <= 1 and payload["total_unique"] > 0:
        size, _ = KmerCounter.estimate_from_spectrum(payload["spectrum"])
        estimate = round(size, 0) if size > 0 else None
    payload["genome_estimate"] = estimate
    return payload


def _count_upload(kc: KmerCounter, path, req: KmerRequest,
                  on_progress=None) -> dict:
    """
    Conteo de k-mers de un FASTA subido con RAM y disco acotados.

    Usa el acumulador particionado con derrame a disco
    (``count_fasta_aggregated``): genomas completos con millones de
    k-mers únicos no materializan jamás el resultado completo en RAM.
    """
    payload = kc.count_fasta_aggregated(
        path, k=req.k, canonical=req.canonical,
        min_abundance=req.min_abundance, top=req.top,
        on_progress=on_progress)
    return _finalize_estimate(payload, req)


def _count_sync(req: KmerRequest) -> dict:
    """Conteo síncrono con el pipeline de streaming para uploads."""
    kc = KmerCounter()
    if req.upload_id:
        path = upload_path(req.upload_id)
        return _count_upload(kc, path, req)
    values, counts = kc.count(
        req.sequences, k=req.k, canonical=req.canonical,
        min_abundance=req.min_abundance)
    return _build_payload(kc, req, values, counts)


@router.post("/count", response_model=KmerResponse)
def count_kmers(req: KmerRequest) -> KmerResponse:
    """Conteo de k-mers sobre GPU (bloqueante, en threadpool)."""
    _validate(req)
    return KmerResponse(**_count_sync(req))


@router.post("/count-async", response_model=KmerJobResponse)
async def count_kmers_async(req: KmerRequest) -> KmerJobResponse:
    """
    Encola el conteo como trabajo de fondo y devuelve el job_id.

    Consume el stream SSE en ``/api/jobs/{job_id}/events`` para recibir
    el progreso (registros y bases leídas, micro-lotes GPU) y el
    resultado final.
    """
    _validate(req)

    if req.upload_id:
        path = upload_path(req.upload_id)  # valida y lanza 404/400 antes
    else:
        path = None

    job = jobs.manager.create("kmer")

    def work() -> dict:
        kc = KmerCounter()
        last = {"t": 0.0}
        totals: dict = {}

        def on_progress(info: dict) -> None:
            now = time.monotonic()
            if now - last["t"] >= PROGRESS_INTERVAL_SECONDS:
                last["t"] = now
                job.publish({"type": "progress", **totals, **info})

        if path is not None:
            # Pasada ligera de conteo (sin materializar secuencias) para
            # que la UI pueda calcular el porcentaje de avance.
            stats = FastaReader(path).scan_stats()
            totals = {"total_records": stats.records,
                      "total_bases": stats.total_bases}
            return _count_upload(kc, path, req, on_progress=on_progress)
        values, counts = kc.count(
            req.sequences, k=req.k, canonical=req.canonical,
            min_abundance=req.min_abundance)
        return _build_payload(kc, req, values, counts)

    jobs.manager.submit(job, work)
    return KmerJobResponse(job_id=job.id,
                           events_url=f"/api/jobs/{job.id}/events")
