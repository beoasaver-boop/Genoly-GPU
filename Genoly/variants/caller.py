import torch
import torch.nn.functional as F
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from Genoly.core.device import DeviceManager
from Genoly.encoding.encoder import SequenceEncoder


@dataclass
class Read:
    """Lectura alineada contra una referencia."""
    sequence: str
    start: int              # Posición 0-based en la referencia
    strand: str = '+'       # '+' o '-'


@dataclass
class Variant:
    """Variante llamada entre lecturas y la referencia."""
    position: int           # Posición 1-based en la referencia
    ref: str
    alt: str
    type: str               # 'SNV' o 'DEL'
    depth: int
    alt_count: int
    freq: float
    bases: Dict[str, int] = field(default_factory=dict)


@dataclass
class PileupResult:
    """Resultado del pileup: cobertura y conteos de bases por posición."""
    reference: str
    depth: torch.Tensor
    base_counts: torch.Tensor    # (L, 4) en orden A,C,G,T
    consensus: str


class VariantCaller:
    """
    Pileup y llamada de variantes acelerado por GPU.

    Acumula los conteos de bases de todas las lecturas sobre cada posición
    de la referencia usando operaciones de dispersión (scatter) sobre CUDA,
    y llama variantes comparando el consenso con la referencia.
    """

    def __init__(self, device: Optional[str] = None,
                 min_base_quality: Optional[int] = None):
        """
        Args:
            device: 'cuda', 'cpu' o None para auto-detectar.
            min_base_quality: Score Phred mínimo por base; las bases por
                              debajo se ignoran en el pileup.
        """
        self.manager = DeviceManager(device)
        self.device = self.manager.device
        self.encoder = SequenceEncoder(device)
        self.min_base_quality = min_base_quality

    @staticmethod
    def reverse_complement(sequence: str) -> str:
        """Reverse complement de una secuencia."""
        complement = {'A': 'T', 'C': 'G', 'G': 'C', 'T': 'A',
                      'N': 'N', 'U': 'A'}
        return ''.join(complement.get(b, 'N') for b in reversed(sequence.upper()))

    # ------------------------------------------------------------------ #
    # Pileup en GPU
    # ------------------------------------------------------------------ #
    def pileup(self, reference: str,
               reads: List[Read],
               qualities: Optional[List[str]] = None) -> PileupResult:
        """
        Calcula la cobertura y los conteos de bases por posición.

        Args:
            reference: Secuencia de referencia.
            reads: Lecturas alineadas (secuencia + posición 0-based + strand).
            qualities: Cadenas de calidad Phred opcionales, una por lectura,
                       para filtrar bases de baja calidad.

        Returns:
            PileupResult con profundidad y conteos de bases.
        """
        if not reads:
            return PileupResult(reference, torch.zeros(0, device=self.device),
                                torch.zeros((0, 4), device=self.device), '')

        ref_len = len(reference)

        # Normalizar lecturas según la hebra
        sequences = []
        for read in reads:
            seq = read.sequence
            if read.strand == '-':
                seq = self.reverse_complement(seq)
            sequences.append(seq)

        encoded, lengths = self.encoder.encode(sequences)
        b, max_len = encoded.shape

        # Posición en la referencia de cada base
        positions = torch.arange(max_len, device=self.device).unsqueeze(0) \
            + torch.tensor([r.start for r in reads], device=self.device).unsqueeze(1)

        # Máscara válida: base canónica, posición dentro de la referencia y
        # dentro de la longitud real de la lectura
        valid = encoded < 4
        valid &= (positions >= 0) & (positions < ref_len)
        valid &= torch.arange(max_len, device=self.device).unsqueeze(0) < lengths.unsqueeze(1)

        # Filtro por calidad de base
        if self.min_base_quality is not None and qualities is not None:
            qual = torch.zeros((b, max_len), dtype=torch.long, device=self.device)
            for i, q in enumerate(qualities):
                if q:
                    row = torch.tensor([ord(c) - 33 for c in q],
                                       dtype=torch.long, device=self.device)
                    qual[i, :len(row)] = row
            valid &= qual >= self.min_base_quality

        # Acumular conteos de bases (A=0, C=1, G=2, T=3) con scatter
        counts = torch.zeros((ref_len, 4), dtype=torch.float32, device=self.device)
        if valid.any():
            flat_pos = positions[valid]
            flat_base = encoded[valid]
            one_hot = F.one_hot(flat_base, num_classes=4).float()
            counts.index_add_(0, flat_pos, one_hot)

        depth = counts.sum(dim=1).long()

        # Consenso por posición
        consensus_chars = []
        max_counts, max_bases = counts.max(dim=1)
        bases = ['A', 'C', 'G', 'T']
        for i in range(ref_len):
            if depth[i].item() > 0:
                consensus_chars.append(bases[int(max_bases[i].item())])
            else:
                consensus_chars.append('N')
        consensus = ''.join(consensus_chars)

        return PileupResult(reference, depth, counts, consensus)

    # ------------------------------------------------------------------ #
    # Llamada de variantes
    # ------------------------------------------------------------------ #
    def call_variants(self, reference: str,
                      reads: List[Read],
                      qualities: Optional[List[str]] = None,
                      min_depth: int = 10,
                      min_alt_freq: float = 0.2) -> List[Variant]:
        """
        Llama variantes comparando el consenso de lecturas con la referencia.

        Args:
            reference: Secuencia de referencia.
            reads: Lecturas alineadas.
            qualities: Calidades Phred opcionales por lectura.
            min_depth: Cobertura mínima para considerar una posición.
            min_alt_freq: Frecuencia mínima del alelo alternativo (0-1).

        Returns:
            Lista de variantes (SNV y DEL).
        """
        pile = self.pileup(reference, reads, qualities)
        variants = []

        counts = pile.base_counts
        depth = pile.depth

        # SNVs: consenso != referencia con cobertura suficiente
        for i, (ref_base, cons_base) in enumerate(zip(reference, pile.consensus)):
            pos = i + 1  # coordenadas 1-based en la salida
            ref_base = ref_base.upper()
            if ref_base == 'N':
                continue
            d = depth[i].item()
            if d < min_depth:
                continue
            if cons_base == ref_base or cons_base == 'N':
                continue

            base_counts = {
                b: int(counts[i, j].item())
                for j, b in enumerate(['A', 'C', 'G', 'T'])
            }
            alt_count = base_counts[cons_base]
            freq = alt_count / d if d > 0 else 0.0
            if freq < min_alt_freq:
                continue

            variants.append(Variant(
                position=pos,
                ref=ref_base,
                alt=cons_base,
                type='SNV',
                depth=d,
                alt_count=alt_count,
                freq=freq,
                bases=base_counts,
            ))

        # Deleciones: regiones sin cobertura interior flanqueadas por lecturas
        variants.extend(self._call_deletions(reference, depth))

        variants.sort(key=lambda v: v.position)
        return variants

    def _call_deletions(self, reference: str, depth: torch.Tensor,
                        min_del_len: int = 2,
                        min_flank_depth: int = 2) -> List[Variant]:
        """
        Detecta deleciones: regiones de referencia completamente sin
        cobertura (depth == 0) flanqueadas por posiciones con lecturas.

        Es una heurística conservadora: solo se reporta una deleción cuando
        existe un tramo interior con cobertura nula de al menos `min_del_len`
        bases, con posiciones a ambos lados cubiertas.
        """
        deletions = []
        ref_len = len(reference)
        depth_cpu = depth.cpu()

        covered = depth_cpu >= min_flank_depth
        in_deletion = False
        start = None

        for i in range(ref_len):
            if not covered[i] and depth_cpu[i].item() == 0:
                if not in_deletion:
                    in_deletion = True
                    start = i
            else:
                if in_deletion:
                    end = i - 1
                    run_len = end - start + 1
                    if run_len >= min_del_len:
                        # Comprobar cobertura de los flancos
                        left_ok = start == 0 or depth_cpu[start - 1].item() >= min_flank_depth
                        right_ok = end == ref_len - 1 or depth_cpu[end + 1].item() >= min_flank_depth
                        if left_ok and right_ok:
                            deletions.append(Variant(
                                position=start + 1,
                                ref=reference[start:end + 1],
                                alt='-',
                                type='DEL',
                                depth=0,
                                alt_count=0,
                                freq=1.0,
                            ))
                    in_deletion = False
                    start = None

        return deletions