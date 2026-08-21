"""
Construcción de matrices de parentesco genómico (GRM) acelerada por GPU.

Implementa los dos estimadores estándar de la matriz de relación genómica
a partir de dosis alélicas {0, 1, 2}: VanRaden y GCTA.
"""

from typing import Optional

import torch

from Genoly.core.device import DeviceManager

GRM_METHODS = ("vanraden", "gcta")


def build_kinship(genotypes: torch.Tensor,
                  method: str = "vanraden",
                  device: Optional[str] = None) -> torch.Tensor:
    """
    Construye la matriz de relación genómica (GRM) desde dosis alélicas.

    Métodos disponibles:
        - 'vanraden': G = M M' / Σ_j 2 p_j (1 - p_j), con M centrada por la
          frecuencia alélica de cada marcador.
        - 'gcta': columnas estandarizadas por sqrt(2 p_j (1 - p_j)) y
          G = M_std M_std' / m, excluyendo los marcadores monórficos.

    En ambos casos los valores NaN se imputan con la media del marcador
    (equivalente a centrarlos a cero).

    Args:
        genotypes: Tensor (individuos x marcadores) con dosis alélicas en
                   {0, 1, 2}.
        method: 'vanraden' (por defecto) o 'gcta'.
        device: 'cuda', 'cpu' o None para auto-detectar.

    Returns:
        Matriz simétrica (n, n) en doble precisión (CPU).

    Raises:
        ValueError: Si el método no existe o los marcadores no aportan
                    variación.
    """
    if method not in GRM_METHODS:
        raise ValueError(f"method debe ser uno de: {', '.join(GRM_METHODS)}")

    manager = DeviceManager(device)
    gt = manager.to(torch.as_tensor(genotypes, dtype=torch.float64))

    if gt.dim() != 2:
        raise ValueError("genotypes debe ser una matriz (individuos x marcadores)")

    mean_dosage = torch.nanmean(gt, dim=0)
    allele_freq = mean_dosage / 2.0
    centered = torch.nan_to_num(gt - mean_dosage.unsqueeze(0), nan=0.0)

    if method == "vanraden":
        denom = torch.sum(2.0 * allele_freq * (1.0 - allele_freq))
        if not torch.isfinite(denom) or denom.item() <= 0.0:
            raise ValueError("Los marcadores no aportan variación (todos monórficos o vacíos)")
        grm = centered @ centered.T / denom
        return grm.cpu()

    weight_sq = 2.0 * allele_freq * (1.0 - allele_freq)
    valid = torch.isfinite(weight_sq) & (weight_sq > 0.0)
    if not bool(valid.any()):
        raise ValueError("Los marcadores no aportan variación (todos monórficos o vacíos)")
    standardized = centered[:, valid] / torch.sqrt(weight_sq[valid]).unsqueeze(0)
    grm = standardized @ standardized.T / int(valid.sum().item())
    return grm.cpu()
