"""
Proceso trabajador GPU aislado.

Los trabajos de análisis pesado (conteo de k-mers sobre GPU, genomas de
varios GB) se ejecutan en un PROCESO aparte. Si el trabajo revienta —
OOM del kernel, segfault de una librería nativa, un ``os._exit`` — el
proceso del servidor sobrevive y el trabajo se marca como error en lugar
de tumbar la API.

Protocolo sobre la conexión (Pipe multiprocessing):
    ("progress", info)    progreso parcial (el padre lo fusiona con los
                          totales y lo publica como SSE, con throttling)
    ("result",   result)  resultado final (dict JSON-serializable)
    ("error",    detail)  error controlado

Si el proceso muere sin enviar mensaje, el lector del padre recibe EOF y
marca el trabajo como "error (crash)".

Este módulo no importa la app ni torch en el arranque: las dependencias
pesadas se cargan dentro de la ejecución del trabajo, para que el
proceso hijo arranque ligero.
"""

import multiprocessing as mp


def _progress(conn: "mp.connection.Connection"):
    """Callback de progreso que reenvía los mensajes por la Pipe."""
    def cb(info: dict) -> None:
        conn.send(("progress", dict(info)))
    return cb


def _finalize_estimate(payload: dict, min_abundance: int) -> dict:
    """Añade la estimación de genoma al payload agregado (Lander-Waterman)."""
    from Genoly.kmer.kmers import KmerCounter
    estimate = None
    if min_abundance <= 1 and payload["total_unique"] > 0:
        size, _ = KmerCounter.estimate_from_spectrum(payload["spectrum"])
        estimate = round(size, 0) if size > 0 else None
    payload["genome_estimate"] = estimate
    return payload


def _build_payload(kc, spec: dict, values, counts) -> dict:
    """Payload de la ruta por secuencias (en memoria, tamaños pequeños)."""
    from Genoly.kmer.kmers import KmerCounter
    k = spec["k"]
    top = spec["top"]
    top_kmers = [
        {"kmer": kc.decode_kmer(int(v), k), "count": int(c)}
        for v, c in zip(values[:top].tolist(), counts[:top].tolist())
    ]
    spectrum = KmerCounter.spectrum_from_counts(counts)
    estimate = None
    if spec["min_abundance"] <= 1 and values.numel() > 0:
        size, _ = KmerCounter.estimate_from_counts(counts)
        estimate = round(size, 0) if size > 0 else None
    return {
        "k": k,
        "total_unique": len(values),
        "total_kmers": int(counts.sum().item()) if len(counts) else 0,
        "top_kmers": top_kmers,
        "spectrum": spectrum,
        "genome_estimate": estimate,
    }


def _run_kmer(spec: dict, progress) -> dict:
    """Conteo de k-mers sobre GPU (dataset, archivo o secuencias)."""
    from Genoly.kmer.kmers import KmerCounter
    kc = KmerCounter()
    k = spec["k"]
    canonical = spec["canonical"]
    min_abundance = spec["min_abundance"]
    top = spec["top"]

    if spec.get("paths"):
        payload = kc.count_fastas_aggregated(
            spec["paths"], k=k, canonical=canonical,
            min_abundance=min_abundance, top=top, on_progress=progress)
    elif spec.get("path"):
        payload = kc.count_fasta_aggregated(
            spec["path"], k=k, canonical=canonical,
            min_abundance=min_abundance, top=top, on_progress=progress)
    else:
        values, counts = kc.count(
            spec["sequences"], k=k, canonical=canonical,
            min_abundance=min_abundance)
        payload = _build_payload(kc, spec, values, counts)
    return _finalize_estimate(payload, min_abundance)


def _crash_test(spec: dict) -> None:
    """Simula distintos tipos de muerte del trabajador (solo tests)."""
    mode = spec.get("mode", "raise")
    if mode == "exit":
        import os
        os._exit(1)  # muere sin mensaje (como un OOM)
    if mode == "segv":
        import ctypes
        ctypes.string_at(0)  # segfault: el proceso hijo muere, no el padre
    raise RuntimeError("crash simulado (error controlado)")


def run_job(spec: dict, conn: "mp.connection.Connection") -> None:
    """
    Entrypoint del proceso hijo: despacha el trabajo y reporta por ``conn``.

    Args:
        spec: Especificación picklable del trabajo
            (``{"kind": "kmer", ...}`` o ``{"kind": "crash_test", ...}``).
        conn: Conexión de escritura hacia el padre.
    """
    try:
        kind = spec["kind"]
        if kind == "kmer":
            result = _run_kmer(spec, _progress(conn))
        elif kind == "crash_test":
            _crash_test(spec)
            result = {"ok": True}
        else:
            raise ValueError(f"tipo de trabajo desconocido: {kind!r}")
        conn.send(("result", result))
    except Exception as exc:
        try:
            conn.send(("error", f"{exc.__class__.__name__}: {exc}"))
        except Exception:
            pass