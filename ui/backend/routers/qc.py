from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from Genoly.qc.quality import QualityAnalyzer
from Genoly.io.fastq import FastqRecord
from Genoly.io.fasta import FastaReader

from ui.backend.uploads import upload_path


router = APIRouter(prefix="/api/qc", tags=["qc"])

# Ventana máxima procesada a la vez (limita la VRAM con genomas completos)
UPLOAD_WINDOW = 1_000_000


class QcAnalyzeRequest(BaseModel):
    sequences: List[str] = []
    fastq_quality: Optional[List[str]] = None  # cadenas de calidad por lectura
    upload_id: Optional[str] = None  # archivo FASTA subido (streaming)


class QcAnalyzeResponse(BaseModel):
    num_sequences: int
    gc_content_percent: float
    base_composition: dict
    mean_length: float
    quality_mean: Optional[float] = None
    quality_by_position: Optional[List[float]] = None


def _analyze_upload(qa: QualityAnalyzer, upload_id: str) -> QcAnalyzeResponse:
    """Control de calidad de un FASTA subido, en streaming por ventanas."""
    path = upload_path(upload_id)
    total_bases = 0
    num_records = 0
    gc_bases = 0.0
    composition = {base: 0 for base in "ACGTN"}

    for record in FastaReader(path).records():
        num_records += 1
        length = len(record)
        total_bases += length
        for i in range(0, length, UPLOAD_WINDOW):
            window = record.sequence[i:i + UPLOAD_WINDOW]
            gc_bases += (
                qa.gc_content_percent([window]).mean().item()
                * len(window) / 100.0
            )
            for base, count in qa.base_composition([window]).items():
                composition[base] += count

    if num_records == 0 or total_bases == 0:
        return QcAnalyzeResponse(
            num_sequences=0, gc_content_percent=0.0,
            base_composition={}, mean_length=0.0,
        )

    return QcAnalyzeResponse(
        num_sequences=num_records,
        gc_content_percent=round(gc_bases / total_bases * 100.0, 4),
        base_composition=composition,
        mean_length=round(total_bases / num_records, 1),
    )


@router.post("/analyze", response_model=QcAnalyzeResponse)
def analyze(qc_req: QcAnalyzeRequest) -> QcAnalyzeResponse:
    """Análisis de control de calidad de las secuencias enviadas."""
    qa = QualityAnalyzer()

    if qc_req.upload_id:
        return _analyze_upload(qa, qc_req.upload_id)

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