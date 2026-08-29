"""
Trabajos de análisis de larga duración con progreso en tiempo real.

Los análisis sobre archivos multi-GB pueden tardar minutos: ejecutarlos
en el event loop de FastAPI bloquearía la API y la UI. Este módulo los
ejecuta en hilos de fondo (ThreadPoolExecutor) y emite el progreso por
una cola asyncio, que el endpoint SSE (/api/jobs/{id}/events) reenvía al
frontend en tiempo real (Server-Sent Events).

El hilo trabajador publica eventos con ``job.publish(...)``, seguro para
hilos: usa ``loop.call_soon_threadsafe`` para programar el ``put_nowait``
en el event loop sin bloquearlo.
"""

import asyncio
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional
from uuid import uuid4

from fastapi import HTTPException

#: Máximo de trabajos terminados retenidos en memoria (evicción FIFO).
MAX_FINISHED_JOBS = 50

#: Hilos de trabajo GPU del proceso (variable de entorno GENOLY_MAX_WORKERS).
#: El valor por defecto, 1, serializa los análisis: los micro-lotes de
#: VRAM asumen un único consumidor de la GPU del proceso.
MAX_JOB_WORKERS = max(1, int(os.environ.get("GENOLY_MAX_WORKERS", "1")))

_JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")


@dataclass
class Job:
    """Estado de un trabajo de análisis y su cola de eventos SSE."""

    id: str
    kind: str
    created_at: float
    status: str = "pending"  # pending | running | done | error
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    loop: Optional[asyncio.AbstractEventLoop] = field(
        default=None, repr=False)
    queue: "asyncio.Queue[Dict[str, Any]]" = field(
        default_factory=asyncio.Queue, repr=False)

    def publish(self, event: Dict[str, Any]) -> None:
        """
        Publica un evento en la cola desde cualquier hilo (thread-safe).

        La cola es ilimitada: ``put_nowait`` nunca bloquea el event loop.
        Los productores deben limitar la frecuencia (throttle) para no
        inundarla con archivos enormes.
        """
        loop = self.loop
        if loop is not None and loop.is_running():
            loop.call_soon_threadsafe(self.queue.put_nowait, dict(event))

    def snapshot(self) -> Dict[str, Any]:
        """Estado serializable del trabajo (para GET /api/jobs/{id})."""
        return {
            "job_id": self.id,
            "kind": self.kind,
            "status": self.status,
            "error": self.error,
            "result": self.result,
        }


class JobManager:
    """
    Registro y ejecución de trabajos de fondo.

    ``max_workers=1`` por defecto SERIALIZA los trabajos GPU: dos
    análisis simultáneos competirían por la misma VRAM y anularían el
    presupuesto del micro-batching adaptativo.
    """

    def __init__(self, max_workers: int = 1,
                 max_finished: int = MAX_FINISHED_JOBS):
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="genoly-job")
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
        self._max_finished = max_finished

    def create(self, kind: str) -> Job:
        """
        Crea un trabajo. Debe llamarse desde el event loop (necesita
        ``asyncio.get_running_loop()`` para publicar eventos).
        """
        job = Job(
            id=uuid4().hex,
            kind=kind,
            created_at=time.time(),
            loop=asyncio.get_running_loop(),
        )
        with self._lock:
            self._evict_locked()
            self._jobs[job.id] = job
        return job

    def submit(self, job: Job, work: Callable[[], Dict[str, Any]]) -> Job:
        """
        Ejecuta ``work`` en un hilo de fondo. El valor devuelto por
        ``work`` se publica como evento ``done`` y queda disponible en
        ``job.result`` / GET /api/jobs/{id}.
        """

        def runner() -> None:
            job.status = "running"
            job.publish({"type": "start", "kind": job.kind})
            try:
                job.result = work()
                job.status = "done"
                job.publish({"type": "done", "result": job.result})
            except Exception as exc:  # el mensaje viaja al cliente vía SSE
                job.status = "error"
                job.error = str(exc) or exc.__class__.__name__
                job.publish({"type": "error", "detail": job.error})

        self._executor.submit(runner)
        return job

    def get(self, job_id: str) -> Job:
        """Devuelve el trabajo o lanza 404 si no existe."""
        if not _JOB_ID_RE.match(job_id or ""):
            raise HTTPException(status_code=400,
                                detail="Identificador de trabajo inválido")
        job = self._jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404,
                                detail="Trabajo no encontrado")
        return job

    def _evict_locked(self) -> None:
        finished = [j for j in self._jobs.values()
                    if j.status in ("done", "error")]
        excess = len(finished) - self._max_finished
        for job in finished[:max(0, excess)]:
            self._jobs.pop(job.id, None)


#: Singleton del proceso: todos los routers comparten el mismo ejecutor.
manager = JobManager(max_workers=MAX_JOB_WORKERS)
