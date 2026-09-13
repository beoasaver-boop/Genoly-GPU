from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from Genoly.qc.quality import QualityAnalyzer
from Genoly.io.fastq import FastqRecord
from Genoly.io.fasta import FastaReader

from ui.backend.datasets import get_dataset
from ui.backend.uploads import upload_path


router = APIRouter(prefix="/api/qc", tags=["qc"])


class QcAnalyzeRequest(BaseModel):
    sequences: List[str] = []
    fastq_quality: Optional[List[str]] = None  # cadenas de calidad por lectura
    upload_id: Optional[str] = None  # archivo FASTA subido (streaming)
    dataset_id: Optional[str] = None  # dataset NCBI (varios FASTA a la vez)


class QcAnalyzeResponse(BaseModel):
    num_sequences: int
    gc_content_percent: float
    base_composition: dict
    mean_length: float
    quality_mean: Optional[float] = None
    quality_by_position: Optional[List[float]] = None


def _analyze_upload(upload_id: str) -> QcAnalyzeResponse:
    """
    Control de calidad de un FASTA subido, en streaming por bloques de
    disco sin materializar ninguna secuencia.

    Usa ``FastaReader.scan_composition``: una sola pasada numpy por
    bloques de 64 KiB (la misma técnica que ``scan_stats``) que anula las
    cabeceras y cuenta registros, A/C/G/T/N y bases GC. La RAM es
    O(block_size), de modo que un FASTA de un único registro de varios GB
    (p. ej. 50-100 GB) no llega a copiarse a memoria.
    """
    path = upload_path(upload_id)
    comp = FastaReader(path).scan_composition()

    if comp.records == 0 or comp.total_bases == 0:
        return QcAnalyzeResponse(
            num_sequences=0, gc_content_percent=0.0,
            base_composition={}, mean_length=0.0,
        )

    return QcAnalyzeResponse(
        num_sequences=comp.records,
        gc_content_percent=round(comp.gc_bases / comp.total_bases * 100.0, 4),
        base_composition=comp.composition(),
        mean_length=round(comp.total_bases / comp.records, 1),
    )


def _analyze_dataset(dataset_id: str) -> QcAnalyzeResponse:
    """
    Control de calidad **combinado** de todos los FASTA de un dataset NCBI.

    Recorre cada ensamblaje con ``scan_composition`` (una pasada numpy por
    bloques, RAM O(block_size)) y agrega registros, bases, composición y GC
    de todos los archivos en un solo resultado.
    """
    dataset = get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")

    total_records = 0
    total_bases = 0
    gc_bases = 0
    composition = {base: 0 for base in "ACGTN"}

    for finfo in dataset["files"]:
        comp = FastaReader(finfo["path"]).scan_composition()
        total_records += comp.records
        total_bases += comp.total_bases
        gc_bases += comp.gc_bases
        for base in "ACGTN":
            composition[base] += getattr(comp, base.lower())

    if total_records == 0 or total_bases == 0:
        return QcAnalyzeResponse(
            num_sequences=0, gc_content_percent=0.0,
            base_composition={}, mean_length=0.0,
        )

    return QcAnalyzeResponse(
        num_sequences=total_records,
        gc_content_percent=round(gc_bases / total_bases * 100.0, 4),
        base_composition=composition,
        mean_length=round(total_bases / total_records, 1),
    )


@router.post("/analyze", response_model=QcAnalyzeResponse)
def analyze(qc_req: QcAnalyzeRequest) -> QcAnalyzeResponse:
    """Análisis de control de calidad de las secuencias enviadas."""
    qa = QualityAnalyzer()

    if qc_req.upload_id:
        return _analyze_upload(qc_req.upload_id)
    if qc_req.dataset_id:
        return _analyze_dataset(qc_req.dataset_id)

    if not qc_req.sequences:
        return QcAnalyzeResponse(
            num_sequences=0, gc_content_percent=0.0,
            base_composition={}, mean_length=0.0,
        )

    gc = qa.gc_content_percent(qc_req.sequences).mean().item()
    comp = qa.base_composition(qc_req.sequences)
    lengths = [len(s) for s in qc_req.sequences]

    response = QcAnalyzeResponse(
        num_sequences=len(qc_req.sequences),
        gc_content_percent=round(gc, 4),
        base_composition=comp,
        mean_length=round(sum(lengths) / len(lengths), 1),
    )

    if qc_req.fastq_quality:
        records = [
            FastqRecord(id=str(i), sequence=seq, quality=qual)
            for i, (seq, qual) in enumerate(
                zip(qc_req.sequences, qc_req.fastq_quality)
            )
        ]
        response.quality_mean = round(
            qa.report(records).mean_quality, 2
        )
        response.quality_by_position = [
            round(q, 2) for q in qa.quality_distribution(records)
        ]

    return response