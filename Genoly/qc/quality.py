import torch
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from Genoly.core.device import DeviceManager
from Genoly.encoding.encoder import SequenceEncoder
from Genoly.io.fastq import FastqRecord


@dataclass
class QualityReport:
    """Resumen de calidad de un conjunto de lecturas."""
    num_reads: int
    total_bases: int
    mean_read_length: float
    mean_quality: float
    gc_content_percent: float
    base_composition: Dict[str, int] = field(default_factory=dict)
    quality_by_position: List[float] = field(default_factory=list)


class QualityAnalyzer:
    """
    Control de calidad y filtrado de lecturas acelerado por GPU.

    Calcula contenido GC, composición de bases y distribución de calidad
    Phred operando sobre tensores CUDA, y ofrece trimming/filtrado.
    """

    def __init__(self, device: Optional[str] = None,
                 phred_offset: int = 33):
        """
        Args:
            device: 'cuda', 'cpu' o None para auto-detectar.
            phred_offset: Offset Phred (33 para Sanger/Illumina 1.8+).
        """
        self.manager = DeviceManager(device)
        self.device = self.manager.device
        self.phred_offset = phred_offset
        self.encoder = SequenceEncoder(device)

        # Índices de bases canónicas
        self.idx_A = self.encoder.to_idx['A']
        self.idx_C = self.encoder.to_idx['C']
        self.idx_G = self.encoder.to_idx['G']
        self.idx_T = self.encoder.to_idx['T']
        self.idx_N = self.encoder.to_idx['N']

    # ------------------------------------------------------------------ #
    # GC content y composición (GPU)
    # ------------------------------------------------------------------ #
    def gc_content(self, sequences: List[str]) -> torch.Tensor:
        """
        Contenido GC por secuencia, calculado sobre GPU.

        Args:
            sequences: Lista de secuencias.

        Returns:
            Tensor (N,) con fracción GC en [0, 1] por secuencia.
        """
        encoded, lengths = self.encoder.encode(sequences)
        valid = encoded < self.idx_N  # solo A/C/G/T
        gc = ((encoded == self.idx_C) | (encoded == self.idx_G)) & valid

        gc_count = gc.sum(dim=1).float()
        total = valid.sum(dim=1).float()
        return torch.where(total > 0, gc_count / total, torch.zeros_like(total))

    def gc_content_percent(self, sequences: List[str]) -> torch.Tensor:
        """Contenido GC en porcentaje (0-100)."""
        return self.gc_content(sequences) * 100

    def base_composition(self, sequences: List[str]) -> Dict[str, int]:
        """
        Composición total de bases del conjunto de secuencias.

        Args:
            sequences: Lista de secuencias.

        Returns:
            Diccionario base -> número de ocurrencias.
        """
        encoded, _ = self.encoder.encode(sequences)
        valid = encoded < self.idx_N
        flat = encoded[valid].cpu()
        counts = torch.bincount(flat, minlength=5).tolist()
        bases = ['A', 'C', 'G', 'T', 'N']
        return {base: int(counts[i]) for i, base in enumerate(bases)}

    # ------------------------------------------------------------------ #
    # Calidad Phred
    # ------------------------------------------------------------------ #
    def quality_scores(self, records: List[FastqRecord]) -> torch.Tensor:
        """
        Convierte las cadenas de calidad ASCII de un lote a scores Phred.

        Args:
            records: Lista de lecturas FASTQ.

        Returns:
            Tensor (B, L) de scores enteros con padding a 0.
        """
        if not records:
            return torch.zeros((0, 0), dtype=torch.long, device=self.device)

        max_len = max(len(r.quality) for r in records)
        scores = torch.zeros((len(records), max_len), dtype=torch.long, device=self.device)

        for i, record in enumerate(records):
            row = torch.tensor(
                [ord(c) - self.phred_offset for c in record.quality],
                dtype=torch.long, device=self.device,
            )
            scores[i, :len(row)] = row
        return scores

    def quality_distribution(self, records: List[FastqRecord],
                             max_position: Optional[int] = None) -> List[float]:
        """
        Media de calidad Phred por posición de base.

        Args:
            records: Lista de lecturas FASTQ.
            max_position: Posición máxima a considerar.

        Returns:
            Lista con la media de calidad por posición.
        """
        if not records:
            return []

        max_len = max(len(r.quality) for r in records)
        if max_position:
            max_len = min(max_len, max_position)

        scores = self.quality_scores(records)[:, :max_len]
        nonzero = (scores > 0).float()
        means = scores.float().sum(dim=0) / nonzero.sum(dim=0).clamp(min=1)
        return means.cpu().tolist()

    # ------------------------------------------------------------------ #
    # Trimming y filtrado
    # ------------------------------------------------------------------ #
    def trim_by_quality(self, records: List[FastqRecord],
                        min_quality: int = 20,
                        window_size: int = 5) -> List[FastqRecord]:
        """
        Recorta las lecturas desde el extremo 3' usando ventana deslizante.

        El algoritmo elimina las posiciones desde el primer punto en el que
        la media de calidad de la ventana cae por debajo del umbral.

        Args:
            records: Lista de lecturas FASTQ.
            min_quality: Umbral mínimo de calidad media por ventana.
            window_size: Tamaño de la ventana deslizante.

        Returns:
            Lista de lecturas recortadas.
        """
        trimmed = []
        for record in records:
            scores = [ord(c) - self.phred_offset for c in record.quality]
            trim_pos = len(scores)

            for i in range(len(scores) - window_size + 1):
                window = scores[i:i + window_size]
                if sum(window) / len(window) < min_quality:
                    trim_pos = i
                    break

            if trim_pos > 0:
                trimmed.append(FastqRecord(
                    id=record.id,
                    sequence=record.sequence[:trim_pos],
                    quality=record.quality[:trim_pos],
                    plus=record.plus,
                ))
        return trimmed

    def filter_by_quality(self, records: List[FastqRecord],
                          min_mean_quality: float = 20.0,
                          min_length: int = 20,
                          max_n_ratio: float = 0.1) -> List[FastqRecord]:
        """
        Filtra lecturas por calidad media, longitud mínima y proporción de N.

        Args:
            records: Lista de lecturas FASTQ.
            min_mean_quality: Calidad media mínima requerida.
            min_length: Longitud mínima tras el recorte.
            max_n_ratio: Proporción máxima de bases N permitida (0-1).

        Returns:
            Lista de lecturas que superan los filtros.
        """
        kept = []
        for record in records:
            scores = [ord(c) - self.phred_offset for c in record.quality]
            if not scores:
                continue
            mean_q = sum(scores) / len(scores)
            if mean_q < min_mean_quality:
                continue
            if len(record.sequence) < min_length:
                continue
            n_ratio = record.sequence.upper().count('N') / len(record.sequence)
            if n_ratio > max_n_ratio:
                continue
            kept.append(record)
        return kept

    # ------------------------------------------------------------------ #
    # Reporte completo
    # ------------------------------------------------------------------ #
    def report(self, records: List[FastqRecord]) -> QualityReport:
        """
        Genera un reporte completo de calidad del conjunto de lecturas.

        Args:
            records: Lista de lecturas FASTQ.

        Returns:
            QualityReport con métricas agregadas.
        """
        if not records:
            return QualityReport(num_reads=0, total_bases=0, mean_read_length=0,
                                 mean_quality=0, gc_content_percent=0)

        sequences = [r.sequence for r in records]
        total_bases = sum(len(s) for s in sequences)

        gc = self.gc_content_percent(sequences).mean().item()
        composition = self.base_composition(sequences)

        all_scores = []
        for r in records:
            all_scores.extend(ord(c) - self.phred_offset for c in r.quality)
        mean_q = sum(all_scores) / len(all_scores) if all_scores else 0.0

        return QualityReport(
            num_reads=len(records),
            total_bases=total_bases,
            mean_read_length=total_bases / len(records),
            mean_quality=mean_q,
            gc_content_percent=gc,
            base_composition=composition,
            quality_by_position=self.quality_distribution(records),
        )

    def summarize(self, records: List[FastqRecord]) -> None:
        """Imprime un resumen legible del control de calidad."""
        report = self.report(records)
        print("=" * 60)
        print("REPORTE DE CONTROL DE CALIDAD")
        print("=" * 60)
        print(f"Lecturas: {report.num_reads}")
        print(f"Bases totales: {report.total_bases}")
        print(f"Longitud media: {report.mean_read_length:.1f} pb")
        print(f"Calidad media (Phred): {report.mean_quality:.1f}")
        print(f"Contenido GC: {report.gc_content_percent:.2f}%")
        print(f"Composición: {report.base_composition}")
        print("=" * 60)