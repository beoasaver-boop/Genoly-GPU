from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from Genoly.variants.caller import VariantCaller, Read


router = APIRouter(prefix="/api/variants", tags=["variants"])


class ReadModel(BaseModel):
    sequence: str
    start: int
    strand: str = "+"


class VariantRequest(BaseModel):
    reference: str
    reads: List[ReadModel]
    qualities: Optional[List[str]] = None
    min_depth: int = 10
    min_alt_freq: float = 0.2


class VariantResponse(BaseModel):
    variants: List[dict]
    total_variants: int
    snvs: int
    deletions: int
    mean_depth: float


@router.post("/call", response_model=VariantResponse)
def call_variants(req: VariantRequest) -> VariantResponse:
    """Llamada de variantes (SNV y deleciones) sobre GPU."""
    vc = VariantCaller()
    reads = [Read(sequence=r.sequence, start=r.start, strand=r.strand)
             for r in req.reads]

    variants = vc.call_variants(
        req.reference, reads, req.qualities,
        min_depth=req.min_depth, min_alt_freq=req.min_alt_freq,
    )

    # Profundidad media
    pile = vc.pileup(req.reference, reads, req.qualities)
    depth = pile.depth
    mean_depth = float(depth.sum().item()) / max(1, len(depth))

    return VariantResponse(
        variants=[v.__dict__ for v in variants],
        total_variants=len(variants),
        snvs=sum(1 for v in variants if v.type == "SNV"),
        deletions=sum(1 for v in variants if v.type == "DEL"),
        mean_depth=round(mean_depth, 2),
    )