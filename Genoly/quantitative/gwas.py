"""
GWAS de marcador único (EMMAX-like).

Ajusta el modelo mixto nulo (y = μ + u + ε, u ~ N(0, σ_g² K)) una sola vez,
obtiene la estructura de varianza por descomposición espectral de K y
transforma (blanquea) el fenotipo y cada marcador; cada marcador se prueba
entonces con una regresión simple en el espacio blanqueado (test F con 1 y
n-2 grados de libertad). Salida: p-valor, efecto y Manhattan plot.
"""

from typing import Callable, List, Optional

import torch
from scipy import stats as sps

from Genoly.core.device import DeviceManager
from Genoly.quantitative.grm import build_kinship
from Genoly.quantitative.reml import solve_variance_components
from Genoly.quantitative.utils import prepare_model_inputs


def gwas(phenotypes: List[float],
         genotypes: List[List[float]],
         kinship: str = "vanraden",
         min_maf: float = 0.01,
         max_iter: int = 100,
         sig_threshold: float = 5e-8,
         on_progress: Optional[Callable[[dict], None]] = None) -> dict:
    """
    Asociación de marcador único bajo el modelo mixto (EMMAX).

    Args:
        phenotypes: Fenotipos (n,).
        genotypes: Dosis alélicas (n x marcadores).
        kinship: 'vanraden' o 'gcta'.
        min_maf: Frecuencia alélica menor mínima para probar el marcador.
        max_iter: Iteraciones máximas del REML nulo.
        sig_threshold: Umbral de significancia para el Manhattan.
        on_progress: Callback ``fn(info)``.

    Returns:
        Dict con ``markers`` (índice, MAF, beta, p, -log10 p), ``top_hits``,
        ``manhattan_svg`` y las varianzas del modelo nulo.
    """
    device = DeviceManager().device
    y = torch.tensor(phenotypes, dtype=torch.float64, device=device)
    G = torch.tensor(genotypes, dtype=torch.float64, device=device)
    n, p = G.shape
    if n < 3:
        raise ValueError("se necesitan al menos 3 individuos")

    # imputar NaN con la media del marcador y calcular MAF
    col_mean = torch.nanmean(G, dim=0, keepdim=True)
    G_imp = torch.where(torch.isnan(G), col_mean, G)
    freq = G_imp.mean(0) / 2.0
    maf = torch.where(freq <= 0.5, freq, 1.0 - freq)
    valid = maf >= min_maf
    n_tested = int(valid.sum().item())
    if n_tested == 0:
        raise ValueError("No quedan marcadores con MAF >= umbral")

    if on_progress:
        on_progress({"stage": "grm"})
    K = build_kinship(G_imp, method=kinship).to(device)

    # estandarizar fenotipo
    yc = y - y.mean()
    ystd = yc / yc.std(unbiased=False).clamp(min=1e-12)

    # modelo nulo por REML
    if on_progress:
        on_progress({"stage": "reml"})
    X = torch.ones(n, 1, dtype=torch.float64, device=device)
    y_t, X_t, K_t, Z_t = prepare_model_inputs(
        ystd, X, K, None, device=device, dtype=torch.float64)
    est = solve_variance_components(y_t, X_t, K_t, Z_t, max_iter=max_iter)
    g = est.genetic_variance
    e = est.residual_variance

    # blanqueo EMMAX: K = U Λ U^T, escala por sqrt(λ + σ_e²/σ_g²)
    if on_progress:
        on_progress({"stage": "transform"})
    lam, U = torch.linalg.eigh(K_t)
    delta = e / max(g, 1e-12)
    scale = torch.sqrt(lam + delta)
    yt = (U.T @ ystd) / scale

    # marcadores estandarizados (z-score) y transformados
    Xv = G_imp[:, valid]
    Xc = Xv - Xv.mean(0)
    Xs = Xc / Xc.std(0, unbiased=False).clamp(min=1e-12)
    Xt = (U.T @ Xs) / scale.unsqueeze(1)          # (n, m)
    c = (U.T @ torch.ones(n, dtype=torch.float64, device=device)) / scale  # intercepto transformado

    # regresión por marcador con intercepto (2x2 vectorizado)
    cc = float((c * c).sum().item())
    cyt = float((c * yt).sum().item())
    cxt = c @ Xt                                    # (m,)
    xtxt = (Xt * Xt).sum(0)                         # (m,)
    xty = Xt.T @ yt                                 # (m,)
    det = cc * xtxt - cxt * cxt
    b = (cc * xty - cxt * cyt) / det
    a = (xtxt * cyt - cxt * xty) / det
    resid = yt.unsqueeze(1) - a.unsqueeze(0) - Xt * b.unsqueeze(0)
    rss = (resid * resid).sum(0)
    tss = float((yt * yt).sum().item())
    F = ((tss - rss) / 1.0) / (rss.clamp(min=1e-12) / (n - 2))
    pv = torch.from_numpy(sps.f.sf(F.cpu().numpy(), 1, n - 2)).to(device)

    idxs = torch.nonzero(valid).squeeze(1).tolist()
    maf_list = maf[valid].tolist()
    markers = [
        {
            "index": idx,
            "maf": round(maf_list[k], 4),
            "beta": round(float(b[k].item()), 5),
            "p": float(pv[k].item()),
            "neglogp": round(float(-torch.log10(pv[k]).item()), 3),
        }
        for k, idx in enumerate(idxs)
    ]
    markers.sort(key=lambda m: m["p"])
    top_hits = [m for m in markers if m["p"] < sig_threshold]

    manhattan_svg = ""
    if markers:
        from Genoly.report.plots import manhattan_svg as _man
        manhattan_svg = _man(
            [m["index"] for m in markers], [m["p"] for m in markers],
            sig_threshold=sig_threshold,
            title=f"GWAS · {n} individuos · {n_tested} marcadores")

    return {
        "n_individuals": n,
        "n_markers": p,
        "n_tested": n_tested,
        "genetic_variance": round(g, 6),
        "residual_variance": round(e, 6),
        "heritability": round(g / (g + e), 4) if (g + e) > 0 else 0.0,
        "markers": markers[:2000],
        "top_hits": top_hits[:100],
        "manhattan_svg": manhattan_svg,
    }