"""
GBLUP: predicción genómica de valores de cría acelerada por GPU.

Dados las componentes de varianza (fijadas por el usuario o estimadas por
REML), resuelve el modelo mixto en un solo paso y calcula la fiabilidad de
cada valor de cría a partir del error de predicción (PEV):

    û = σ_g² K Z' V⁻¹ (y - Xβ̂),   V = σ_g² Z K Z' + σ_e² I
    PEV(u) = σ_g² K - σ_g⁴ K Z' P Z K
    fiabilidad_i = 1 - PEV_i / (σ_g² K_ii)
"""

from dataclasses import dataclass
from typing import Optional

import torch

from Genoly.core.device import DeviceManager
from Genoly.quantitative.reml import solve_variance_components
from Genoly.quantitative.utils import cholesky_regularized, prepare_model_inputs

__all__ = ['GBLUPResult', 'GenomicBLUP']


@dataclass
class GBLUPResult:
    """Resultado de la predicción genómica GBLUP."""
    breeding_values: torch.Tensor
    fixed_effects: torch.Tensor
    reliabilities: torch.Tensor
    genetic_variance: float
    residual_variance: float
    log_likelihood: Optional[float]
    variance_source: str


class GenomicBLUP:
    """
    Predicción genómica GBLUP sobre GPU.

    A diferencia de LinearMixedModel (que siempre estima las componentes de
    varianza), permite fijarlas directamente: si se conocen de estudios
    previos la solución es directa, sin iterar, e incluye la fiabilidad y la
    precisión de cada valor de cría. Si no se proporcionan, se estiman por
    REML antes de resolver.

    Los efectos fijos se ESTIMAN por BLUE (beta_hat) y los valores de cría
    son u = G Z' V^-1 (y - X beta_hat). Las fiabilidades usan el PEV del BLUP
    con efectos fijos estimados, equivalente al bloque inferior derecho de la
    inversa de las ecuaciones del modelo mixto de Henderson:

        PEV(u) = diag(G - G Z' P Z G)
        P = V^-1 - V^-1 X (X' V^-1 X)^-1 X' V^-1,  G = sigma_g^2 K

    y reliability_i = 1 - PEV(u)_i / (sigma_g^2 * k_ii), truncado a [0, 1].
    La diferencia entre T1 y T2 del PEV se calcula fusionada dentro de P para
    evitar la cancelación catastrófica de restar diagonales grandes por
    separado.
    """

    def __init__(self, device: Optional[str] = None):
        """
        Args:
            device: 'cuda', 'cpu' o None para auto-detectar.
        """
        self.manager = DeviceManager(device)
        self.device = self.manager.device
        self.dtype = torch.float64
        self.result_: Optional[GBLUPResult] = None

    def fit(self, y, X, K, Z=None,
            genetic_variance: Optional[float] = None,
            residual_variance: Optional[float] = None,
            max_iter: int = 100, tol: float = 1e-8) -> GBLUPResult:
        """
        Ajusta el modelo y predice los valores de cría.

        Args:
            y: Fenotipos (n,).
            X: Diseño de efectos fijos (n, p), incluido el intercepto si procede.
            K: Matriz de parentesco (q, q); usar build_kinship para obtenerla.
            Z: Diseño de efectos aleatorios (n, q); None usa la identidad.
            genetic_variance: Varianza genética conocida (σ_g²). Si se indica,
                              debe indicarse también residual_variance.
            residual_variance: Varianza residual conocida (σ_e²).
            max_iter: Iteraciones máximas si hay que estimar por REML.
            tol: Tolerancia de convergencia si hay que estimar por REML.

        Returns:
            GBLUPResult con valores de cría, efectos fijos, fiabilidades y
            varianzas empleadas.

        Raises:
            ValueError: Si se proporciona una sola varianza o las formas no
                        son consistentes.
        """
        given = (genetic_variance is not None, residual_variance is not None)
        if any(given) and not all(given):
            raise ValueError(
                "Proporciona ambas varianzas (genética y residual) o ninguna "
                "para estimarlas por REML"
            )

        y_t, X_t, K_t, Z_t = prepare_model_inputs(
            y, X, K, Z, device=self.device, dtype=self.dtype)

        loglik = None
        if genetic_variance is None:
            est = solve_variance_components(y_t, X_t, K_t, Z_t,
                                            method="reml",
                                            max_iter=max_iter,
                                            tol=tol)
            var_g = est.genetic_variance
            var_e = est.residual_variance
            loglik = est.log_likelihood
            source = "reml"
        else:
            var_g = float(genetic_variance)
            var_e = float(residual_variance)
            source = "dadas"

        n = y_t.shape[0]
        q = K_t.shape[0]
        eye_n = torch.eye(n, dtype=self.dtype, device=self.device)

        V = var_g * (Z_t @ K_t @ Z_t.T) + var_e * eye_n
        L = cholesky_regularized(V)
        Vinv = torch.cholesky_solve(eye_n, L)
        Vinv_X = Vinv @ X_t
        XtViX = X_t.T @ Vinv_X
        L_fix = cholesky_regularized(XtViX)
        beta = torch.cholesky_solve(X_t.T @ (Vinv @ y_t.unsqueeze(1)),
                                    L_fix).reshape(-1)
        resid = y_t.unsqueeze(1) - X_t @ beta.unsqueeze(1)
        breeding_values = var_g * (K_t @ (Z_t.T @ (Vinv @ resid))).reshape(-1)

        proj = Vinv - Vinv_X @ torch.cholesky_solve(Vinv_X.T, L_fix)
        kz = K_t @ Z_t.T
        if var_g > 0.0:
            pev = var_g * torch.diagonal(K_t) \
                - var_g ** 2 * torch.diagonal(kz @ proj @ Z_t @ K_t)
            k_diag = torch.diagonal(K_t).clamp(min=1e-12)
            reliability = (1.0 - pev / (var_g * k_diag)).clamp(0.0, 1.0)
        else:
            reliability = torch.zeros(q, dtype=self.dtype, device=self.device)

        self.result_ = GBLUPResult(
            breeding_values=breeding_values.detach().cpu(),
            fixed_effects=beta.detach().cpu(),
            reliabilities=reliability.detach().cpu(),
            genetic_variance=float(var_g),
            residual_variance=float(var_e),
            log_likelihood=loglik,
            variance_source=source,
        )
        self._X_cpu = X_t.detach().cpu()
        self._Z_cpu = Z_t.detach().cpu()
        self.manager.empty_cache()
        return self.result_

    def _require_fitted(self) -> None:
        if self.result_ is None:
            raise RuntimeError("El modelo debe ajustarse con fit() antes de usar esta operación")

    def blup(self) -> torch.Tensor:
        """
        Devuelve los valores de cría genómicos predichos (GEBV).

        Returns:
            Tensor (q,) en CPU.
        """
        self._require_fitted()
        return self.result_.breeding_values

    def blue(self) -> torch.Tensor:
        """
        Devuelve los estimadores de los efectos fijos (β).

        Returns:
            Tensor (p,) en CPU.
        """
        self._require_fitted()
        return self.result_.fixed_effects

    def reliabilities(self) -> torch.Tensor:
        """
        Devuelve la fiabilidad de cada valor de cría (1 - PEV/Var(u)).

        Returns:
            Tensor (q,) en [0, 1], en CPU.
        """
        self._require_fitted()
        return self.result_.reliabilities

    def accuracies(self) -> torch.Tensor:
        """
        Devuelve la precisión de cada valor de cría (raíz de la fiabilidad).

        Returns:
            Tensor (q,) en [0, 1], en CPU.
        """
        self._require_fitted()
        return torch.sqrt(self.result_.reliabilities)

    def predict(self) -> torch.Tensor:
        """
        Devuelve los valores ajustados del modelo (Xβ + Zu).

        Returns:
            Tensor (n,) en CPU.
        """
        self._require_fitted()
        fitted = self._X_cpu @ self.result_.fixed_effects.unsqueeze(1) \
            + self._Z_cpu @ self.result_.breeding_values.unsqueeze(1)
        return fitted.reshape(-1)
