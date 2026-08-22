"""
Utilidades de validación y preparación de datos para genética cuantitativa.

Funciones compartidas por los módulos del paquete (grm, reml, lmm, gblup):
conversión de entradas a tensores del dispositivo, validación de formas y
factorización de Cholesky con regularización progresiva.
"""

from typing import Optional, Tuple

import torch

from Genoly.core.device import DeviceManager


def prepare_model_inputs(y, X, K, Z=None,
                         device: Optional[str] = None,
                         dtype: torch.dtype = torch.float64,
                         ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Convierte y valida las entradas de un modelo lineal mixto.

    Args:
        y: Fenotipos (n,) o convertible a tensor.
        X: Diseño de efectos fijos (n, p).
        K: Matriz de parentesco (q, q), simétrica.
        Z: Diseño de efectos aleatorios (n, q); None usa la identidad
           (modelo animal estándar).
        device: 'cuda', 'cpu' o None para auto-detectar.
        dtype: Tipo de dato para los cálculos internos.

    Returns:
        Tupla (y, X, K, Z) como tensores en el dispositivo indicado, con K
        simetrizada.

    Raises:
        ValueError: Si alguna forma o propiedad no es consistente.
    """
    manager = DeviceManager(device)
    y_t = manager.to(torch.as_tensor(y, dtype=dtype)).reshape(-1)
    X_t = manager.to(torch.as_tensor(X, dtype=dtype))
    K_t = manager.to(torch.as_tensor(K, dtype=dtype))

    if y_t.dim() != 1:
        raise ValueError("y debe ser un vector de fenotipos (n,)")
    n = y_t.shape[0]
    if X_t.dim() != 2 or X_t.shape[0] != n:
        raise ValueError("X debe ser una matriz de diseño (n, p)")
    if X_t.shape[1] >= n:
        raise ValueError("X debe tener menos columnas que observaciones")
    if K_t.dim() != 2 or K_t.shape[0] != K_t.shape[1]:
        raise ValueError("K debe ser una matriz cuadrada (q, q)")
    if not torch.allclose(K_t, K_t.T, atol=1e-8):
        raise ValueError("K debe ser simétrica")

    if Z is None:
        Z_t = torch.eye(n, dtype=dtype, device=manager.device)
    else:
        Z_t = manager.to(torch.as_tensor(Z, dtype=dtype))
    if Z_t.shape != (n, K_t.shape[0]):
        raise ValueError("Z debe tener forma (n, q) con q igual al tamaño de K")

    return y_t, X_t, (K_t + K_t.T) / 2.0, Z_t


def cholesky_regularized(matrix: torch.Tensor, attempts: int = 10) -> torch.Tensor:
    """
    Factorización de Cholesky con regularización diagonal progresiva.

    Intenta la factorización directa y, si la matriz no es definida positiva,
    reintenta añadiendo jitter creciente a la diagonal.

    Args:
        matrix: Matriz simétrica (cuasi) definida positiva.
        attempts: Número máximo de intentos con jitter creciente.

    Returns:
        Factor triangular inferior L tal que L L' aproxima la matriz.

    Raises:
        RuntimeError: Si la factorización falla tras todos los intentos.
    """
    jitter = 0.0
    scale = float(matrix.diagonal().abs().mean().item()) or 1.0
    eye = torch.eye(matrix.shape[0], dtype=matrix.dtype, device=matrix.device)
    for _ in range(attempts):
        try:
            if jitter == 0.0:
                return torch.linalg.cholesky(matrix)
            return torch.linalg.cholesky(matrix + jitter * eye)
        except Exception:
            jitter = 1e-10 * scale if jitter == 0.0 else jitter * 100.0
    raise RuntimeError("La matriz no es definida positiva incluso tras regularizar")
