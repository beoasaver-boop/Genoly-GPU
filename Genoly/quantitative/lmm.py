"""
Modelos lineales mixtos (LMM) para genética cuantitativa acelerados por GPU.

Fachada de alto nivel del paquete: `grm` construye la matriz de parentesco,
`reml` estima las componentes de varianza y esta clase orquesta el ajuste
completo del modelo animal con predicción BLUP.

Modelo ajustado:

    y = Xβ + Zu + ε,   u ~ N(0, σ_g² K),   ε ~ N(0, σ_e² I)
"""

from dataclasses import dataclass
from typing import Optional

import torch

from Genoly.core.device import DeviceManager
from Genoly.quantitative.grm import build_kinship
from Genoly.quantitative.reml import solve_variance_components
from Genoly.quantitative.utils import prepare_model_inputs

__all__ = ['LMMResult', 'LinearMixedModel', 'build_kinship']


@dataclass
class LMMResult:
    """Resultado del ajuste de un modelo lineal mixto."""
    genetic_variance: float
    residual_variance: float
    heritability: float
    log_likelihood: float
    iterations: int
    converged: bool


class LinearMixedModel:
    """
    Modelo lineal mixto univariante para genética cuantitativa.

    Ajusta y = Xβ + Zu + ε con u ~ N(0, σ_g² K) y ε ~ N(0, σ_e² I),
    estima las componentes de varianza por REML o ML mediante puntuación
    de Fisher y predice los efectos aleatorios (valores de cría) con BLUP.
    Los cálculos internos se realizan en doble precisión sobre el
    dispositivo detectado.
    """

    def __init__(self, device: Optional[str] = None):
        """
        Args:
            device: 'cuda', 'cpu' o None para auto-detectar.
        """
        self.manager = DeviceManager(device)
        self.device = self.manager.device
        self.dtype = torch.float64
        self.beta_: Optional[torch.Tensor] = None
        self.u_: Optional[torch.Tensor] = None
        self.result_: Optional[LMMResult] = None

    def fit(self, y, X, K, Z=None, method: str = "reml",
            max_iter: int = 100, tol: float = 1e-8) -> LMMResult:
        """
        Ajusta el modelo y estima las componentes de varianza.

        Args:
            y: Fenotipos (n,).
            X: Diseño de efectos fijos (n, p), incluido el intercepto si procede.
            K: Matriz de parentesco (q, q); usar build_kinship para obtenerla
               a partir de genotipos.
            Z: Diseño de efectos aleatorios (n, q); None usa la identidad
               (modelo animal estándar).
            method: 'reml' (por defecto) o 'ml'.
            max_iter: Máximo de iteraciones de puntuación de Fisher.
            tol: Tolerancia de convergencia sobre el cambio relativo de las
                 componentes de varianza.

        Returns:
            LMMResult con las componentes estimadas, la heredabilidad y la
            verosimilitud del ajuste.

        Raises:
            ValueError: Si el método no es válido o las formas no son
                        consistentes.
        """
        y_t, X_t, K_t, Z_t = prepare_model_inputs(
            y, X, K, Z, device=self.device, dtype=self.dtype)

        est = solve_variance_components(y_t, X_t, K_t, Z_t,
                                        method=method,
                                        max_iter=max_iter,
                                        tol=tol)

        total = est.genetic_variance + est.residual_variance
        self.result_ = LMMResult(
            genetic_variance=est.genetic_variance,
            residual_variance=est.residual_variance,
            heritability=float(est.genetic_variance / total) if total > 0 else 0.0,
            log_likelihood=est.log_likelihood,
            iterations=est.iterations,
            converged=est.converged,
        )
        self.beta_ = est.fixed_effects
        self.u_ = est.random_effects
        self._X_cpu = X_t.detach().cpu()
        self._Z_cpu = Z_t.detach().cpu()
        self.manager.empty_cache()
        return self.result_

    def _require_fitted(self) -> None:
        if self.result_ is None:
            raise RuntimeError("El modelo debe ajustarse con fit() antes de usar esta operación")

    def blue(self) -> torch.Tensor:
        """
        Devuelve los estimadores BLUE de los efectos fijos (β).

        Returns:
            Tensor (p,) en CPU.
        """
        self._require_fitted()
        return self.beta_

    def blup(self) -> torch.Tensor:
        """
        Devuelve los valores de cría predichos BLUP de los efectos aleatorios (u).

        Returns:
            Tensor (q,) en CPU.
        """
        self._require_fitted()
        return self.u_

    def predict(self) -> torch.Tensor:
        """
        Devuelve los valores ajustados del modelo (Xβ + Zu).

        Returns:
            Tensor (n,) en CPU.
        """
        self._require_fitted()
        fitted = self._X_cpu @ self.beta_.unsqueeze(1) + self._Z_cpu @ self.u_.unsqueeze(1)
        return fitted.reshape(-1)
