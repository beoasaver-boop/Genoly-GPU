"""
Subida de archivos FASTA en streaming asíncrono.

El archivo se recibe como un stream de chunks (nunca en memoria) y se
escribe a disco en un hilo de fondo para no bloquear el event loop. Las
estadísticas (nº de registros, bases totales, primer registro) se
calculan en streaming por bloques de 64 KiB, también fuera del event
loop, sin materializar ninguna secuencia completa.
"""

from pathlib import Path
from typing import AsyncIterator, Optional
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from Genoly.io.fasta import FastaReader

from ui.backend.uploads import UPLOAD_DIR

router = APIRouter(prefix="/api/upload", tags=["upload"])

CHUNK_BYTES = 1024 * 1024


async def _iter_chunks(file: UploadFile,
                       chunk_size: int = CHUNK_BYTES) -> AsyncIterator[bytes]:
    """
    Itera los chunks del archivo subido de forma asíncrona.

    Usa ``file.chunks()`` (async iterator nativo) si la versión de
    Starlette lo ofrece; en caso contrario cae a ``await file.read(n)``.
    """
    chunks = getattr(file, "chunks", None)
    if callable(chunks):
        async for chunk in chunks():
            if chunk:
                yield chunk
        return
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            return
        yield chunk


class UploadedMeta(BaseModel):
    id: str
    description: Optional[str] = None
    length: int


class UploadResponse(BaseModel):
    upload_id: str
    filename: str
    records: int
    total_bases: int
    first: UploadedMeta
    bytes_on_disk: int = 0


@router.post("", response_model=UploadResponse)
async def upload_fasta(file: UploadFile = File(...)) -> UploadResponse:
    """Guarda el FASTA en disco (streaming) y devuelve un identificador para analizarlo."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo sin nombre")

    upload_id = uuid4().hex
    dest = UPLOAD_DIR / f"{upload_id}.fasta"
    bytes_on_disk = 0

    try:
        with dest.open("wb") as fh:
            async for chunk in _iter_chunks(file):
                # Escritura en hilo de fondo: el event loop no se bloquea
                bytes_on_disk += await run_in_threadpool(fh.write, chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500,
                            detail="No se pudo guardar el archivo")

    try:
        stats = await run_in_threadpool(FastaReader(dest).scan_stats)
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400,
                            detail="El archivo no es un FASTA legible")

    if stats.records == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400,
                            detail="El archivo no contiene registros FASTA")

    return UploadResponse(
        upload_id=upload_id,
        filename=Path(file.filename).name,
        records=stats.records,
        total_bases=stats.total_bases,
        first=UploadedMeta(
            id=stats.first_id or "",
            description=stats.first_description,
            length=stats.first_length,
        ),
        bytes_on_disk=bytes_on_disk,
    )
