from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from Genoly.qc.quality import QualityAnalyzer
from Genoly.io.fastq import FastqRecord


router = APIRouter(prefix="/api/qc", tags=["qc"])


class QcAnalyzeRequest(BaseModel):
    sequences: List[str] = []
    fastq_quality: Optional[List[str]] = None  # cadenas de calidad por lectura


class QcAnalyzeResponse(BaseModel):
    num_sequences: int
    gc_content_percent: float
    base_composition: dict
    mean_length: float
    quality_mean: Optional[float] = None
    quality_by_position: Optional[List[float]] = None


@router.post("/analyze", response_model=QcAnalyzeResponse)
def analyze(qc_req: QcAnalyzeRequest) -> QcAnalyzeResponse:
    """Análisis de control de calidad de las secuencias enviadas."""
    qa = QualityAnalyzer()

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