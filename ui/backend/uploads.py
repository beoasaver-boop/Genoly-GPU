"""
Gestión de archivos FASTA subidos por la UI.

Hay dos vías de carga, ambas con memoria acotada:

1. Multipart (``POST /api/upload``): el archivo se recibe como stream y
   se escribe a disco por bloques, nunca en RAM.
2. Registro de ruta del servidor (``POST /api/upload/register``): para
   archivos de decenas de GB (50-100 GB) lo correcto es apuntar a un
   archivo ya presente en el servidor en lugar de transmitirlo por HTTP.
   No se copia nada: el análisis lee la ruta original en streaming.

Las estadísticas (registros, bases totales, primer registro) se calculan
en un hilo de fondo tras la carga, de modo que la respuesta de la carga
no bloquea esperando un escaneo completo del archivo; el estado se
consulta en ``GET /api/upload/{id}``.

Toda la información de cada subida vive en un registro JSON
(``registry.json``) bajo ``UPLOAD_DIR``, persistente entre reinicios y
protegido con un candado de hilos (escritura atómica: temporal + rename).

Directorio de uploads: ``GENOLY_UPLOAD_DIR`` (por defecto, el temporal
del sistema; para archivos de decenas de GB apúntalo a un disco real,
p. ej. ``/var/tmp/genoly/uploads``). El derrame del conteo de k-mers se
configura por separado con ``GENOLY_SPILL_DIR`` (ver Genoly.kmer.kmers).
"""

import json
import os
import re
import threading
from pathlib import Path
from tempfile import gettempdir
from typing import Optional

from fastapi import HTTPException

UPLOAD_DIR = Path(
    os.environ.get("GENOLY_UPLOAD_DIR")
    or (Path(gettempdir()) / "genoly_uploads")
).expanduser()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_REGISTRY_PATH = UPLOAD_DIR / "registry.json"

_UPLOAD_RE = re.compile(r"^[0-9a-f]{32}$")

#: Directorios permitidos para el registro de rutas del servidor
#: (variable de entorno GENOLY_ALLOWED_DATA_DIRS, separada por comas).
#: Vacío = permitir cualquier archivo legible del servidor (herramienta
#: local; documentado como vía de ingestión de datos propios).
_ALLOWED_DATA_DIRS = [
    Path(p).expanduser().resolve()
    for p in os.environ.get("GENOLY_ALLOWED_DATA_DIRS", "").split(",")
    if p.strip()
]

_lock = threading.Lock()


def _load_registry() -> dict:
    if not _REGISTRY_PATH.is_file():
        return {}
    try:
        return json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_registry(data: dict) -> None:
    tmp = _REGISTRY_PATH.with_name(_REGISTRY_PATH.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    tmp.replace(_REGISTRY_PATH)


def get_upload(upload_id: str) -> Optional[dict]:
    """Metadatos de una subida, o None si no existe."""
    if not _UPLOAD_RE.match(upload_id or ""):
        raise HTTPException(status_code=400,
                            detail="Identificador de subida inválido")
    with _lock:
        return _load_registry().get(upload_id)


def create_upload(upload_id: str, kind: str, path: Path, filename: str,
                  bytes_on_disk: int = 0) -> dict:
    """Registra una subida nueva (multipart o ruta registrada) con
    estadísticas pendientes."""
    meta = {
        "upload_id": upload_id,
        "kind": kind,                  # multipart | registered
        "path": str(path),
        "filename": filename,
        "bytes_on_disk": bytes_on_disk,
        "stats_status": "pending",     # pending | ready | error
        "records": None,
        "total_bases": None,
        "first": None,
        "sha256": None,
        "error": None,
    }
    with _lock:
        data = _load_registry()
        data[upload_id] = meta
        _save_registry(data)
    return dict(meta)


def set_checksum(upload_id: str, sha256: Optional[str]) -> None:
    """Guarda el checksum SHA-256 (hex) de una subida ya registrada."""
    with _lock:
        data = _load_registry()
        meta = data.get(upload_id)
        if meta is None:
            return
        meta["sha256"] = sha256
        _save_registry(data)


def set_bytes(upload_id: str, bytes_on_disk: int) -> None:
    """Actualiza los bytes escritos de una subida en curso."""
    with _lock:
        data = _load_registry()
        meta = data.get(upload_id)
        if meta is None:
            return
        meta["bytes_on_disk"] = bytes_on_disk
        _save_registry(data)


def set_stats(upload_id: str, records: int, total_bases: int, first=None,
              *, error: Optional[str] = None) -> None:
    """Actualiza las estadísticas (o el error) de una subida ya registrada."""
    with _lock:
        data = _load_registry()
        meta = data.get(upload_id)
        if meta is None:
            return
        meta["records"] = records
        meta["total_bases"] = total_bases
        meta["first"] = first
        meta["stats_status"] = "error" if error else "ready"
        meta["error"] = error
        _save_registry(data)


def upload_path(upload_id: str) -> Path:
    """
    Resuelve la ruta real del archivo de una subida (multipart o
    registrada) validando el identificador. Las subidas antiguas (sin
    entrada de registro) se resuelven por el nombre en ``UPLOAD_DIR``.
    """
    if not _UPLOAD_RE.match(upload_id or ""):
        raise HTTPException(status_code=400,
                            detail="Identificador de subida inválido")
    meta = get_upload(upload_id)
    if meta is not None:
        path = Path(meta["path"])
        if path.is_file():
            return path
        raise HTTPException(status_code=404,
                            detail="El archivo subido ya no existe")
    legacy = UPLOAD_DIR / f"{upload_id}.fasta"
    if legacy.is_file():
        return legacy
    raise HTTPException(status_code=404,
                        detail="El archivo subido ya no existe")


def check_registrable(path: Path) -> Path:
    """
    Valida una ruta del servidor para el registro de subidas.

    - Debe existir y ser un archivo regular legible.
    - Si ``GENOLY_ALLOWED_DATA_DIRS`` está configurada, la ruta debe
      quedar dentro de uno de esos directorios.

    Devuelve la ruta resuelta y absoluta.
    """
    src = path.expanduser().resolve()
    if not src.is_file():
        raise HTTPException(status_code=400,
                            detail="La ruta no existe o no es un archivo")
    if not os.access(src, os.R_OK):
        raise HTTPException(status_code=400,
                            detail="El archivo no es legible")
    if _ALLOWED_DATA_DIRS:
        if not any(src.is_relative_to(base) for base in _ALLOWED_DATA_DIRS):
            raise HTTPException(
                status_code=403,
                detail="La ruta está fuera de los directorios de datos "
                       "permitidos (GENOLY_ALLOWED_DATA_DIRS)")
    return src