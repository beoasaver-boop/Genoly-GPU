import torch
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Tuple

from Genoly.kmer.kmers import KmerCounter
from Genoly.io.fasta import FastaReader

from ui.backend.uploads import upload_path


router = APIRouter(prefix="/api/kmer", tags=["kmer"])

# Ventana y lote máximos por pasada (limitan VRAM con genomas completos)
UPLOAD_WINDOW = 5_000_000
UPLOAD_CHUNK = 4


class KmerRequest(BaseModel):
    sequences: List[str] = []
    k: int = 21
    canonical: bool = True
    min_abundance: int = 1
    top: int = 20
    upload_id: Optional[str] = None  # archivo FASTA subido (streaming)


class KmerResponse(BaseModel):
    k: int
    total_unique: int
    total_kmers: int
    top_kmers: List[dict]
    spectrum: dict
    genome_estimate: Optional[float] = None


def _count_upload(kc: KmerCounter, upload_id: str, k: int,
                  canonical: bool, min_abundance: int) -> Tuple[torch.Tensor, torch.Tensor]:
    """Cuenta k-mers de un FASTA subido en streaming (ventanas + lotes GPU)."""
    path = upload_path(upload_id)
    all_values = []
    all_counts = []

    for record in FastaReader(path).records():
        values, counts = kc.count(
            [record.sequence], k=k, canonical=canonical, min_abundance=1,
            window_size=UPLOAD_WINDOW, chunk_size=UPLOAD_CHUNK,
        )
        if values.numel() == 0:
            continue
        all_values.append(values)
        all_counts.append(counts)

    if not all_values:
        return torch.tensor([], dtype=torch.long), torch.tensor([], dtype=torch.long)

    values = torch.cat(all_values)
    counts = torch.cat(all_counts)
    values, counts = KmerCounter._aggregate(values, counts)

    keep = counts >= min_abundance
    values, counts = values[keep], counts[keep]

    order = torch.argsort(counts, descending=True)
    return values[order].cpu(), counts[order].cpu()


@router.post("/count", response_model=KmerResponse)
def count_kmers(req: KmerRequest) -> KmerResponse:
    """Conteo de k-mers sobre GPU."""
    kc = KmerCounter()

    if req.upload_id:
        values, counts = _count_upload(kc, req.upload_id, req.k,
                                       req.canonical, req.min_abundance)
    else:
        values, counts = kc.count(
            req.sequences, k=req.k, canonical=req.canonical,
            min_abundance=req.min_abundance,
        )

    top_kmers = [
        {"kmer": kc.decode_kmer(int(v), req.k), "count": int(c)}
        for v, c in zip(values[:req.top].tolist(), counts[:req.top].tolist())
    ]

    spectrum = KmerCounter.spectrum_from_counts(counts)

    estimate = None
    if req.min_abundance <= 1 and values.numel() > 0:
        size, _ = KmerCounter.estimate_from_counts(counts)
        estimate = round(size, 0) if size > 0 else None

    return KmerResponse(
        k=req.k,
        total_unique=len(values),
        total_kmers=int(counts.sum().item()) if len(counts) else 0,
        top_kmers=top_kmers,
        spectrum=spectrum,
        genome_estimate=estimate,
    )