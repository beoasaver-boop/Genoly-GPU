from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from Genoly.io.fasta import FastaReader

from ui.backend.uploads import UPLOAD_DIR


router = APIRouter(prefix="/api/upload", tags=["upload"])

CHUNK_BYTES = 1024 * 1024


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


@router.post("", response_model=UploadResponse)
async def upload_fasta(file: UploadFile = File(...)) -> UploadResponse:
    """Guarda el FASTA en disco y devuelve un identificador para analizarlo."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo sin nombre")

    upload_id = uuid4().hex
    dest = UPLOAD_DIR / f"{upload_id}.fasta"

    try:
        with dest.open("wb") as fh:
            while True:
                chunk = await file.read(CHUNK_BYTES)
                if not chunk:
                    break
                fh.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="No se pudo guardar el archivo")

    records = 0
    total_bases = 0
    first = None
    for rec in FastaReader(dest).records():
        records += 1
        total_bases += len(rec)
        if first is None:
            first = rec

    if first is None:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="El archivo no contiene registros FASTA")

    return UploadResponse(
        upload_id=upload_id,
        filename=Path(file.filename).name,
        records=records,
        total_bases=total_bases,
        first=UploadedMeta(id=first.id, description=first.description, length=len(first)),
    )