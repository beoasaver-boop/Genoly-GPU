"""
Endpoints de seguimiento de trabajos de fondo.

- GET /api/jobs/{id}         -> estado y resultado (JSON, polling).
- GET /api/jobs/{id}/events  -> progreso en tiempo real vía SSE.

El stream SSE envía cada evento de la cola del trabajo como
``data: {json}\\n\\n`` con keep-alives cada 15 s para atravesar proxies.
El stream termina al recibir el evento ``done`` o ``error``.
"""

import asyncio
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ui.backend import jobs

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

KEEP_ALIVE_SECONDS = 15.0


@router.get("/{job_id}")
async def job_status(job_id: str) -> dict:
    """Estado y, si terminó, resultado del trabajo (para polling)."""
    return jobs.manager.get(job_id).snapshot()


@router.get("/{job_id}/events")
async def job_events(job_id: str) -> StreamingResponse:
    """Stream Server-Sent Events con el progreso del trabajo."""
    job = jobs.manager.get(job_id)

    async def event_stream():
        snapshot = job.snapshot()
        yield f"data: {json.dumps({'type': 'status', 'status': snapshot['status'], 'kind': snapshot['kind']})}\n\n"
        while True:
            try:
                event = await asyncio.wait_for(
                    job.queue.get(), timeout=KEEP_ALIVE_SECONDS)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
                continue
            yield f"data: {json.dumps(event, default=str)}\n\n"
            if event.get("type") in ("done", "error"):
                return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
