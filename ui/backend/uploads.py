"""
Gestión de archivos FASTA subidos por la UI.

Los archivos grandes se suben una sola vez (multipart) y se guardan en el
directorio temporal del sistema. Los endpoints de análisis los leen en
streaming vía FastaReader, sin cargarlos en memoria ni meterlos en JSON.
"""

import re
from pathlib import Path
from tempfile import gettempdir

from fastapi import HTTPException

UPLOAD_DIR = Path(gettempdir()) / "genoly_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_UPLOAD_RE = re.compile(r"^[0-9a-f]{32}$")


def upload_path(upload_id: str) -> Path:
    """Resuelve el archivo de una subida validando el identificador."""
    if not _UPLOAD_RE.match(upload_id or ""):
        raise HTTPException(status_code=400, detail="Identificador de subida inválido")
    path = UPLOAD_DIR / f"{upload_id}.fasta"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="El archivo subido ya no existe")
    return path