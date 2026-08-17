import torch
from typing import List, Optional, Tuple, Dict

from Genoly.core.device import DeviceManager, get_device

# Alfabeto canónico para cómputo núcleo
CANONICAL = ['A', 'C', 'G', 'T', 'N']

# Alfabeto IUPAC completo
IUPAC = ['A', 'C', 'G', 'T', 'N', 'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V']


class SequenceEncoder:
    """
    Codificación de secuencias de ADN/ARN a tensores numéricos.

    Transforma secuencias de texto en tensores enteros o one-hot listos
    para operar sobre GPU (CUDA/NVIDIA), acelerando el resto del pipeline.
    """

    def __init__(self, device: Optional[str] = None,
                 include_iupac: bool = True):
        """
        Args:
            device: 'cuda', 'cpu' o None para auto-detectar.
            include_iupac: incluir códigos de ambigüedad IUPAC en el alfabeto.
        """
        self.manager = DeviceManager(device)
        self.device = self.manager.device

        self.alphabet = IUPAC if include_iupac else CANONICAL
        self.to_idx: Dict[str, int] = {b: i for i, b in enumerate(self.alphabet)}
        self.idx_to_base: Dict[int, str] = {i: b for b, i in self.to_idx.items()}

        # U -> T (ARN a ADN) para simplificar el cómputo
        self.to_idx.setdefault('U', self.to_idx['T'])
        self.num_classes = len(self.alphabet)

    # ------------------------------------------------------------------ #
    # Codificación a enteros
    # ------------------------------------------------------------------ #
    def encode_char(self, char: str) -> int:
        """Codifica un carácter a índice entero (IUPAC desconocido -> N)."""
        return self.to_idx.get(char.upper(), self.to_idx['N'])

    def encode_sequence(self, sequence: str) -> torch.Tensor:
        """
        Codifica una secuencia a tensor 1D en el dispositivo.

        Args:
            sequence: Secuencia de ADN/ARN.

        Returns:
            Tensor de tipo long con la secuencia codificada.
        """
        encoded = torch.zeros(len(sequence), dtype=torch.long, device=self.device)
        for i, nuc in enumerate(sequence.upper()):
            encoded[i] = self.encode_char(nuc)
        return encoded

    def encode(self, sequences: List[str],
               padding: Optional[int] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Codifica un lote de secuencias con padding.

        Args:
            sequences: Lista de secuencias.
            padding: Índice de padding (por defecto el de 'N').

        Returns:
            Tuple (tensor (B, L), tensor de longitudes).
        """
        if not sequences:
            raise ValueError("La lista de secuencias está vacía")

        lengths = [len(s) for s in sequences]
        max_len = max(lengths)
        pad_idx = self.to_idx['N'] if padding is None else padding

        encoded = torch.full((len(sequences), max_len), pad_idx,
                             dtype=torch.long, device=self.device)

        for i, seq in enumerate(sequences):
            seq_enc = self.encode_sequence(seq)
            encoded[i, :len(seq_enc)] = seq_enc

        lengths_tensor = torch.tensor(lengths, dtype=torch.long, device=self.device)
        return encoded, lengths_tensor

    # ------------------------------------------------------------------ #
    # Codificación one-hot
    # ------------------------------------------------------------------ #
    def encode_one_hot(self, sequences: List[str],
                       include_n: bool = True) -> torch.Tensor:
        """
        Codifica un lote de secuencias a one-hot (B, L, C).

        Args:
            sequences: Lista de secuencias.
            include_n: Incluir columna para 'N' (5 clases canónicas).
                      Si False, usa solo A/C/G/T (4 clases).

        Returns:
            Tensor de tipo float32.
        """
        if not sequences:
            raise ValueError("La lista de secuencias está vacía")

        encoded, lengths = self.encode(sequences)
        # Mapear canónicas: A,C,G,T,N -> 0,1,2,3,4
        canonical_idx = encoded % 5 if self.num_classes == 15 else encoded
        num_classes = 5 if include_n else 4

        one_hot = torch.zeros(
            (*encoded.shape, num_classes), dtype=torch.float32, device=self.device
        )
        mask = canonical_idx < num_classes
        canonical_idx = canonical_idx.clamp(0, num_classes - 1)
        one_hot.scatter_(-1, canonical_idx.unsqueeze(-1), 1.0)
        # Ceros en posiciones padding
        one_hot = one_hot * mask.unsqueeze(-1).float()
        return one_hot

    # ------------------------------------------------------------------ #
    # Decodificación
    # ------------------------------------------------------------------ #
    def decode(self, tensor: torch.Tensor,
               lengths: Optional[torch.Tensor] = None) -> List[str]:
        """
        Convierte un tensor de índices de vuelta a secuencias de texto.

        Args:
            tensor: Tensor (B, L) o (L,) de índices enteros.
            lengths: Longitudes reales por secuencia (para recortar padding).

        Returns:
            Lista de secuencias decodificadas.
        """
        if tensor.dim() == 2:
            decoded = []
            for i in range(tensor.shape[0]):
                length = lengths[i].item() if lengths is not None else tensor.shape[1]
                row = tensor[i, :length]
                decoded.append(self._row_to_string(row))
            return decoded

        return [self._row_to_string(tensor)]

    def _row_to_string(self, row: torch.Tensor) -> str:
        return "".join(self.idx_to_base.get(int(v), 'N') for v in row.tolist())


def encode_to_tensor(sequences: List[str],
                     device: Optional[str] = None,
                     one_hot: bool = False) -> torch.Tensor:
    """
    Función de conveniencia para codificar secuencias a tensores.

    Args:
        sequences: Lista de secuencias.
        device: 'cuda', 'cpu' o None.
        one_hot: Si True devuelve one-hot, si False devuelve enteros.

    Returns:
        Tensor codificado.
    """
    encoder = SequenceEncoder(device)
    if one_hot:
        return encoder.encode_one_hot(sequences)
    encoded, _ = encoder.encode(sequences)
    return encoded