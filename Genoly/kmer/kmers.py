import torch
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple

from Genoly.core.device import DeviceManager
from Genoly.encoding.encoder import SequenceEncoder


class KmerCounter:
    """
    Conteo de k-mers y análisis de espectro acelerado por GPU.

    Codifica cada k-mer como un entero en base 4 (A=0, C=1, G=2, T=3) y
    usa operaciones de convolución 1D sobre CUDA para extraer todos los
    k-mers de un lote de secuencias de forma vectorizada.
    """

    def __init__(self, device: Optional[str] = None):
        """
        Args:
            device: 'cuda', 'cpu' o None para auto-detectar.
        """
        self.manager = DeviceManager(device)
        self.device = self.manager.device
        self.encoder = SequenceEncoder(device)

    def _kmer_powers(self, k: int) -> torch.Tensor:
        """Kernel de potencias de 4 para la convolución (MSB primero)."""
        return torch.tensor(
            [4 ** (k - 1 - j) for j in range(k)],
            dtype=torch.float32, device=self.device,
        ).view(1, 1, k)

    def _encode_kmers(self, sequences: List[str],
                      k: int) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Codifica todos los k-mers de un lote de secuencias.

        Args:
            sequences: Lista de secuencias.
            k: Longitud del k-mer.

        Returns:
            Tuple (codes (B, L-k+1), máscara válida (B, L-k+1)).
        """
        if k < 1:
            raise ValueError("k debe ser >= 1")
        if k > 31:
            raise ValueError("k > 31 no cabe en enteros de 64 bits")

        encoded, lengths = self.encoder.encode(sequences)

        # Dígitos base-4 válidos (A/C/G/T); inválidos (N/ambigüedad) -> -1
        base4 = encoded.where(
            encoded < 4, torch.tensor(-1, device=self.device)
        ).float()

        # Convolución con las potencias de 4 -> códigos enteros de k-mer
        x = base4.unsqueeze(1)  # (B, 1, L)
        codes = F.conv1d(x, self._kmer_powers(k)).squeeze(1).long()

        # Validez: todos los dígitos de la ventana son canónicos
        valid_digits = (base4 >= 0).float()
        window_count = F.conv1d(
            valid_digits.unsqueeze(1),
            torch.ones(1, 1, k, device=self.device),
        ).squeeze(1)
        valid = window_count == k

        # Ventanas que caben dentro de la longitud real de cada secuencia
        lens = (lengths - k + 1).clamp(min=0)
        pos = torch.arange(codes.shape[1], device=self.device).unsqueeze(0)
        valid &= pos < lens.unsqueeze(1)

        return codes, valid

    def _reverse_complement_codes(self, codes: torch.Tensor, k: int) -> torch.Tensor:
        """
        Calcula el código del reverse complement de cada k-mer.

        El complemento de un dígito es `3 - dígito` y el orden se invierte.
        """
        digits = []
        x = codes
        for _ in range(k):
            digits.append(x % 4)
            x = x // 4

        rc = torch.zeros_like(codes)
        for d in reversed(digits):  # de MSB a LSB
            rc = rc * 4 + (3 - d)
        return rc

    def count(self, sequences: List[str], k: int,
              canonical: bool = True,
              min_abundance: int = 1,
              chunk_size: Optional[int] = None,
              window_size: Optional[int] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Cuenta la frecuencia de cada k-mer en las secuencias.

        Args:
            sequences: Lista de secuencias.
            k: Longitud del k-mer.
            canonical: Si True, cuenta cada k-mer y su reverse complement
                      como una sola entidad (usa el código mínimo).
            min_abundance: Frecuencia mínima para incluir un k-mer.
            chunk_size: Procesar en lotes de este tamaño para limitar memoria.
            window_size: Máximo de bases por ventana. Las secuencias más
                         largas se parten en ventanas con solape de k-1
                         bases para limitar el consumo de VRAM/RAM al
                         procesar genomas completos.

        Returns:
            Tuple (valores únicos, conteos) ordenados por frecuencia
            descendente (tensores CPU).
        """
        if not sequences:
            return torch.tensor([], dtype=torch.long), torch.tensor([], dtype=torch.long)

        if window_size is not None:
            expanded = []
            for seq in sequences:
                expanded.extend(self.split_sequence_windows(seq, k, window_size))
            sequences = expanded

        # Las secuencias más cortas que k no aportan ningún k-mer y romperían
        # la convolución (kernel > entrada)
        sequences = [s for s in sequences if len(s) >= k]
        if not sequences:
            return torch.tensor([], dtype=torch.long), torch.tensor([], dtype=torch.long)

        if chunk_size is None:
            chunk_size = len(sequences)

        all_values = []
        all_counts = []

        for start in range(0, len(sequences), chunk_size):
            chunk = sequences[start:start + chunk_size]
            codes, valid = self._encode_kmers(chunk, k)

            if canonical:
                rc = self._reverse_complement_codes(codes, k)
                codes = torch.minimum(codes, rc)

            flat = codes[valid]
            if flat.numel() == 0:
                continue

            values, counts = torch.unique(flat, return_counts=True)
            all_values.append(values)
            all_counts.append(counts)

        if not all_values:
            return torch.tensor([], dtype=torch.long), torch.tensor([], dtype=torch.long)

        values = torch.cat(all_values)
        counts = torch.cat(all_counts)

        # Agregar conteos de k-mers repetidos entre chunks
        values, counts = self._aggregate(values, counts)

        # Filtrar por abundancia mínima
        keep = counts >= min_abundance
        values, counts = values[keep], counts[keep]

        # Ordenar por frecuencia descendente
        order = torch.argsort(counts, descending=True)
        return values[order].cpu(), counts[order].cpu()

    @staticmethod
    def _aggregate(values: torch.Tensor, counts: torch.Tensor
                   ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Suma los conteos de valores duplicados entre chunks."""
        unique_vals, inverse = torch.unique(values, return_inverse=True)
        summed = torch.zeros_like(unique_vals)
        summed.scatter_add_(0, inverse, counts)
        return unique_vals, summed

    def decode_kmer(self, code: int, k: int) -> str:
        """Convierte un código entero de k-mer a su secuencia de texto."""
        digits = []
        for _ in range(k):
            digits.append(code % 4)
            code //= 4
        bases = {0: 'A', 1: 'C', 2: 'G', 3: 'T'}
        return ''.join(bases[d] for d in reversed(digits))

    @staticmethod
    def split_sequence_windows(sequence: str, k: int,
                               window_size: int) -> List[str]:
        """
        Divide una secuencia en ventanas con solape de k-1 bases.

        El solape garantiza que ningún k-mer de la secuencia original quede
        partido entre dos ventanas, por lo que los conteos agregados son
        idénticos a procesar la secuencia completa.
        """
        if window_size <= 0:
            raise ValueError("window_size debe ser >= 1")
        length = len(sequence)
        if length <= window_size:
            return [sequence]
        step = max(1, window_size - k + 1)
        windows = []
        pos = 0
        while pos < length:
            windows.append(sequence[pos:pos + window_size])
            pos += step
        return windows

    @staticmethod
    def spectrum_from_counts(counts: torch.Tensor) -> Dict[int, int]:
        """Espectro (multiplicidad -> nº de k-mers) a partir de conteos agregados."""
        if counts.numel() == 0:
            return {}
        multiplicities, freq = torch.unique(counts, return_counts=True)
        return {int(m): int(f) for m, f in zip(multiplicities.tolist(), freq.tolist())}

    @staticmethod
    def estimate_from_counts(counts: torch.Tensor) -> Tuple[float, float]:
        """Tamaño de genoma y cobertura a partir de conteos agregados (Lander-Waterman)."""
        if counts.numel() == 0:
            return 0.0, 0.0
        total_kmers = int(counts.sum().item())
        multiplicities, freq = torch.unique(counts, return_counts=True)
        peak_index = int(freq.argmax().item())
        coverage = float(multiplicities[peak_index].item())
        genome_size = total_kmers / coverage if coverage > 0 else 0.0
        return genome_size, coverage

    def spectrum(self, sequences: List[str], k: int,
                 min_abundance: int = 1,
                 chunk_size: Optional[int] = None,
                 window_size: Optional[int] = None) -> Dict[int, int]:
        """
        Espectro de k-mers: distribución del número de k-mers por multiplicidad.

        Args:
            sequences: Lista de secuencias.
            k: Longitud del k-mer.
            min_abundance: Frecuencia mínima para incluir un k-mer.
            chunk_size: Procesar en lotes para limitar memoria.
            window_size: Máximo de bases por ventana (genomas completos).

        Returns:
            Diccionario multiplicidad -> número de k-mers con esa multiplicidad.
        """
        _, counts = self.count(sequences, k, canonical=True,
                               min_abundance=min_abundance,
                               chunk_size=chunk_size, window_size=window_size)
        return self.spectrum_from_counts(counts)

    def estimate_genome_size(self, sequences: List[str], k: int,
                             min_abundance: int = 2,
                             chunk_size: Optional[int] = None,
                             window_size: Optional[int] = None) -> Tuple[float, float]:
        """
        Estima el tamaño del genoma a partir del espectro k-mer.

        Usa la aproximación de Lander-Waterman: G = N_k / C, donde N_k es el
        número total de k-mers (tras filtrar errores) y C es la cobertura
        media estimada como la multiplicidad pico del espectro.

        Args:
            sequences: Lista de secuencias.
            k: Longitud del k-mer.
            min_abundance: Abundancia mínima para descartar k-mers con errores.
            chunk_size: Procesar en lotes para limitar memoria.
            window_size: Máximo de bases por ventana (genomas completos).

        Returns:
            Tuple (tamaño estimado del genoma, cobertura media estimada).
        """
        _, counts = self.count(sequences, k, canonical=True,
                               min_abundance=min_abundance,
                               chunk_size=chunk_size, window_size=window_size)
        return self.estimate_from_counts(counts)