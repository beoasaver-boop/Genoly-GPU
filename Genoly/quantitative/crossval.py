"""
Validación cruzada de la predicción genómica (GBLUP/LMM).

K-fold: en cada pliegue se ajusta el modelo mixto nulo con los fenotipos de
entrenamiento y se predice el pliegue de validación mediante la fórmula de
Henderson usando la matriz de parentesco completa:

    u_val = σ_g² K_val,tr (σ_g² K_tr + σ_e² I)^{-1} (y_tr - β₀)

Se reportan la correlación predicho-observado (r), RMSE y la exactitud de
predicción (Falconer-Mackay: r / sqrt(h²)) por pliegue, con opción de
repetir el proceso con distintas semillas.
"""

import math
import random
from typing import Callable, List, Optional

import torch

from Genoly.core.device import DeviceManager
from Genoly.quantitative.grm import build_kinship
from Genoly.quantitative.lmm import LinearMixedModel
from Genoly.quantitative.utils import cholesky_regularized


def _pearson(a: torch.Tensor, b: torch.Tensor) -> float:
    ma = a.mean()
    mb = b.mean()
    num = float(((a - ma) * (b - mb)).sum().item())
    den = math.sqrt(float(((a - ma) ** 2).sum().item())
                    * float(((b - mb) ** 2).sum().item()))
    return num / den if den > 0 else 0.0


def _predict_new(g: float, e: float, beta0: float,
                 K_tr: torch.Tensor, K_val_tr: torch.Tensor,
                 y_tr: torch.Tensor, device) -> torch.Tensor:
    """Predice el valor genético de individuos nuevos (fórmula de Henderson)."""
    n_tr = K_tr.shape[0]
    eye = torch.eye(n_tr, dtype=torch.float64, device=device)
    V = g * K_tr + e * eye
    L = cholesky_regularized(V)
    resid = y_tr - beta0
    t = torch.cholesky_solve(resid.unsqueeze(1), L)
    u_val = g * (K_val_tr @ t)
    return (beta0 + u_val).reshape(-1)


def crossval(phenotypes: List[float],
             genotypes: List[List[float]],
             kinship: str = "vanraden",
             n_folds: int = 5,
             n_repeats: int = 1,
             seed: int = 0,
             on_progress: Optional[Callable[[dict], None]] = None) -> dict:
    """
    Validación cruzada K-fold de la predicción genómica.

    Args:
        phenotypes: Fenotipos (n,).
        genotypes: Dosis alélicas (n x marcadores).
        kinship: 'vanraden' o 'gcta'.
        n_folds: Número de pliegues.
        n_repeats: Repeticiones con distinta semilla.
        seed: Semilla aleatoria.
        on_progress: Callback ``fn(info)`` por pliegue.

    Returns:
        Dict con métricas medias (mean_r, mean_rmse, mean_accuracy),
        ``per_fold`` y ``per_individual`` (obs, pred, fold).
    """
    device = DeviceManager().device
    y = torch.tensor(phenotypes, dtype=torch.float64, device=device)
    G = torch.tensor(genotypes, dtype=torch.float64, device=device)
    n = y.shape[0]

    if n_folds < 2:
        raise ValueError("n_folds debe ser >= 2")
    if n_folds > n:
        raise ValueError("n_folds no puede superar el número de individuos")
    if n < 5:
        raise ValueError("se necesitan al menos 5 individuos")

    K = build_kinship(G, method=kinship).to(device)
    rng = random.Random(seed)

    per_fold: List[dict] = []
    per_individual: List[dict] = []
    for rep in range(n_repeats):
        idx = list(range(n))
        rng.shuffle(idx)
        folds = [idx[k::n_folds] for k in range(n_folds)]
        for fi, val in enumerate(folds):
            vset = set(val)
            train = [i for i in idx if i not in vset]
            t_idx = torch.tensor(train, device=device)
            v_idx = torch.tensor(val, device=device)

            y_tr = y[t_idx]
            y_val = y[v_idx]
            K_tr = K[t_idx][:, t_idx]
            K_val_tr = K[v_idx][:, t_idx]
            X_tr = torch.ones(len(train), 1, dtype=torch.float64,
                              device=device)

            model = LinearMixedModel()
            res = model.fit(y_tr, X_tr, K_tr)
            g = res.genetic_variance
            e = res.residual_variance
            beta0 = float(model.beta_[0])
            pred = _predict_new(g, e, beta0, K_tr, K_val_tr, y_tr,
                                device).cpu()
            obs = y_val.cpu()

            r = _pearson(pred, obs)
            rmse = float((((pred - obs) ** 2).mean()).item() ** 0.5)
            h2 = res.heritability
            acc = (r / math.sqrt(h2)) if h2 > 1e-6 else None
            for o, p in zip(obs.tolist(), pred.tolist()):
                per_individual.append(
                    {"obs": round(o, 4), "pred": round(p, 4), "fold": fi + 1})
            per_fold.append({
                "fold": fi + 1, "repeat": rep + 1,
                "r": round(r, 4), "rmse": round(rmse, 4),
                "accuracy": round(acc, 4) if acc is not None else None,
                "n_val": len(val),
            })
            if on_progress is not None:
                on_progress({"fold": fi + 1, "folds": n_folds,
                             "repeat": rep + 1})

    rs = [f["r"] for f in per_fold]
    rmses = [f["rmse"] for f in per_fold]
    accs = [f["accuracy"] for f in per_fold if f["accuracy"] is not None]
    mean_r = sum(rs) / len(rs)
    r_sd = (sum((r - mean_r) ** 2 for r in rs) / len(rs)) ** 0.5 \
        if len(rs) > 1 else 0.0

    return {
        "n_individuals": n,
        "n_markers": int(G.shape[1]),
        "kinship": kinship,
        "n_folds": n_folds,
        "n_repeats": n_repeats,
        "mean_r": round(mean_r, 4),
        "r_sd": round(r_sd, 4),
        "mean_rmse": round(sum(rmses) / len(rmses), 4),
        "mean_accuracy": round(sum(accs) / len(accs), 4) if accs else None,
        "per_fold": per_fold,
        "per_individual": per_individual,
    }