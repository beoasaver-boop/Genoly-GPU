"""
Modelos lineales mixtos (LMM) para genética cuantitativa acelerados por GPU.

Implementa el modelo animal clásico:

    y = Xβ + Zu + ε,   u ~ N(0, σ_g² K),   ε ~ N(0, σ_e² I)

donde K es la matriz de parentesco genómico (GRM). Las componentes de
varianza se estiman por máxima verosimilitud restringida (REML) o máxima
verosimilitud (ML) mediante ascenso por puntuación de Fisher con búsqueda
de línea, y los efectos aleatorios se predicen con BLUP (Best Linear
Unbiased Prediction). Todas las operaciones matriciales (Cholesky,
resoluciones, productos) se ejecutan en el dispositivo detectado por
DeviceManager (CUDA si está disponible).
"""

import math
from dataclasses import dataclass
from typing import Dict, Optional

import torch

from Genoly.core.device import DeviceManager

_LOG_2PI = math.log(2.0 * math.pi)


@dataclass
class LMMResult:
    """Resultado del ajuste de un modelo lineal mixto."""
    genetic_variance: float
    residual_variance: float
    heritability: float
    log_likelihood: float
    iterations: int
    converged: bool


def build_kinship(genotypes: torch.Tensor,
                  device: Optional[str] = None) -> torch.Tensor:
    """
    Construye la matriz de relación genómica (GRM) por el método de VanRaden.

    G = M M' / Σ_j 2 p_j (1 - p_j), donde M es la matriz de dosis alélicas
    centrada por la frecuencia alélica de cada marcador.

    Args:
        genotypes: Tensor (individuos x marcadores) con dosis alélicas en
                   {0, 1, 2}. Los valores NaN se imputan con la media del
                   marcador (equivalente a centrarlos a cero).
        device: 'cuda', 'cpu' o None para auto-detectar.

    Returns:
        Matriz simétrica (n, n) en doble precisión (CPU).
    """
    manager = DeviceManager(device)
    gt = manager.to(torch.as_tensor(genotypes, dtype=torch.float64))

    if gt.dim() != 2:
        raise ValueError("genotypes debe ser una matriz (individuos x marcadores)")

    mean_dosage = torch.nanmean(gt, dim=0)
    allele_freq = mean_dosage / 2.0
    centered = torch.nan_to_num(gt - mean_dosage.unsqueeze(0), nan=0.0)

    denom = torch.sum(2.0 * allele_freq * (1.0 - allele_freq))
    if not torch.isfinite(denom) or denom.item() <= 0.0:
        raise ValueError("Los marcadores no aportan variación (todos monórficos o vacíos)")

    grm = centered @ centered.T / denom
    return grm.cpu()


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

    def _prepare(self, y, X, K, Z) -> tuple:
        y_t = self.manager.to(torch.as_tensor(y, dtype=self.dtype)).reshape(-1)
        X_t = self.manager.to(torch.as_tensor(X, dtype=self.dtype))
        K_t = self.manager.to(torch.as_tensor(K, dtype=self.dtype))

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
            Z_t = torch.eye(n, dtype=self.dtype, device=self.device)
        else:
            Z_t = self.manager.to(torch.as_tensor(Z, dtype=self.dtype))
        if Z_t.shape != (n, K_t.shape[0]):
            raise ValueError("Z debe tener forma (n, q) con q igual al tamaño de K")

        K_t = (K_t + K_t.T) / 2.0
        return y_t, X_t, K_t, Z_t

    def _cholesky(self, matrix: torch.Tensor) -> torch.Tensor:
        jitter = 0.0
        scale = float(matrix.diagonal().abs().mean().item()) or 1.0
        for _ in range(10):
            try:
                if jitter == 0.0:
                    return torch.linalg.cholesky(matrix)
                return torch.linalg.cholesky(
                    matrix + jitter * torch.eye(matrix.shape[0], dtype=self.dtype,
                                                device=self.device)
                )
            except Exception:
                jitter = 1e-10 * scale if jitter == 0.0 else jitter * 100.0
        raise RuntimeError("La matriz no es definida positiva incluso tras regularizar")

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
        """
        if method not in ("reml", "ml"):
            raise ValueError("method debe ser 'reml' o 'ml'")
        reml = method == "reml"

        y_t, X_t, K_t, Z_t = self._prepare(y, X, K, Z)
        n = y_t.shape[0]
        p = X_t.shape[1]

        eye_n = torch.eye(n, dtype=self.dtype, device=self.device)
        W = Z_t @ K_t @ Z_t.T

        var_total = max(float(y_t.var(unbiased=False).item()), 1e-6)
        var_g = var_total / 2.0
        var_e = var_total / 2.0
        floor = 1e-10

        def solve_state(g: float, e: float) -> Dict[str, object]:
            V = g * W + e * eye_n
            L = self._cholesky(V)
            Vinv = torch.cholesky_solve(eye_n, L)
            Vinv_X = Vinv @ X_t
            XtViX = X_t.T @ Vinv_X
            L_fix = self._cholesky(XtViX)
            beta = torch.cholesky_solve(X_t.T @ (Vinv @ y_t.unsqueeze(1)),
                                        L_fix).reshape(-1)
            resid = y_t.unsqueeze(1) - X_t @ beta.unsqueeze(1)
            t = Vinv @ resid
            quad = float((resid * t).sum().item())
            logdet_v = 2.0 * torch.log(torch.diagonal(L)).sum().item()
            logdet_fix = 2.0 * torch.log(torch.diagonal(L_fix)).sum().item()
            df = n - p if reml else n
            extra = logdet_fix if reml else 0.0
            loglik = -0.5 * (df * _LOG_2PI + logdet_v + extra + quad)
            u = g * (K_t @ (Z_t.T @ t)).reshape(-1)
            proj = Vinv - Vinv_X @ torch.cholesky_solve(Vinv_X.T, L_fix) if reml else Vinv
            return {"beta": beta, "u": u, "loglik": loglik, "t": t,
                    "proj": proj}

        converged = False
        iterations = 0
        for iterations in range(1, max_iter + 1):
            state = solve_state(var_g, var_e)
            proj = state["proj"]
            t = state["t"]

            proj_w = proj @ W
            tr_pw = float((proj * W).sum().item())
            tr_p = float(proj.diagonal().sum().item())
            score_g = -0.5 * (tr_pw - float((t * (W @ t)).sum().item()))
            score_e = -0.5 * (tr_p - float((t * t).sum().item()))

            info_gg = 0.5 * float((proj_w * proj_w).sum().item())
            info_ge = 0.5 * float((proj_w * proj).sum().item())
            info_ee = 0.5 * float((proj * proj).sum().item())

            det = info_gg * info_ee - info_ge * info_ge
            if abs(det) < 1e-12 * max(info_gg * info_ee, 1.0):
                ridge = 1e-8 * max(info_gg + info_ee, 1.0)
                info_gg += ridge
                info_ee += ridge
                det = info_gg * info_ee - info_ge * info_ge

            delta_g = (info_ee * score_g - info_ge * score_e) / det
            delta_e = (info_gg * score_e - info_ge * score_g) / det

            base_loglik = float(state["loglik"])
            step = 1.0
            improved = False
            new_g, new_e = var_g, var_e
            while step >= 1e-6:
                new_g = var_g + step * delta_g
                new_e = var_e + step * delta_e
                if new_g > floor and new_e > floor:
                    trial = solve_state(new_g, new_e)
                    if float(trial["loglik"]) >= base_loglik - 1e-12:
                        improved = True
                        break
                step *= 0.5

            if not improved:
                converged = True
                break

            rel_change = max(abs(new_g - var_g) / (abs(var_g) + 1e-12),
                             abs(new_e - var_e) / (abs(var_e) + 1e-12))
            var_g, var_e = new_g, new_e
            if rel_change < tol:
                converged = True
                break

        final = solve_state(var_g, var_e)
        total = var_g + var_e
        self.result_ = LMMResult(
            genetic_variance=float(var_g),
            residual_variance=float(var_e),
            heritability=float(var_g / total) if total > 0 else 0.0,
            log_likelihood=float(final["loglik"]),
            iterations=iterations,
            converged=converged,
        )
        self.beta_ = final["beta"].detach().cpu()
        self.u_ = final["u"].detach().cpu()
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
