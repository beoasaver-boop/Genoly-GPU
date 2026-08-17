from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from Genoly.kmer.kmers import KmerCounter


router = APIRouter(prefix="/api/kmer", tags=["kmer"])


class KmerRequest(BaseModel):
    sequences: List[str]
    k: int = 21
    canonical: bool = True
    min_abundance: int = 1
    top: int = 20


class KmerResponse(BaseModel):
    k: int
    total_unique: int
    total_kmers: int
    top_kmers: List[dict]
    spectrum: dict
    genome_estimate: Optional[float] = None


@router.post("/count", response_model=KmerResponse)
def count_kmers(req: KmerRequest) -> KmerResponse:
    """Conteo de k-mers sobre GPU."""
    kc = KmerCounter()
    values, counts = kc.count(
        req.sequences, k=req.k, canonical=req.canonical,
        min_abundance=req.min_abundance,
    )

    top_kmers = [
        {"kmer": kc.decode_kmer(int(v), req.k), "count": int(c)}
        for v, c in zip(values[:req.top].tolist(), counts[:req.top].tolist())
    ]

    spectrum = kc.spectrum(
        req.sequences, k=req.k, min_abundance=req.min_abundance,
    )

    estimate = None
    if req.min_abundance <= 1 and len(req.sequences) > 0:
        size, cov = kc.estimate_genome_size(
            req.sequences, k=req.k, min_abundance=max(1, req.min_abundance),
        )
        estimate = round(size, 0) if size > 0 else None

    return KmerResponse(
        k=req.k,
        total_unique=len(values),
        total_kmers=int(counts.sum().item()) if len(counts) else 0,
        top_kmers=top_kmers,
        spectrum=spectrum,
        genome_estimate=estimate,
    )