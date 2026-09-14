"""
Matriz de parentesco genómico (GRM) y estructura poblacional.

- ``grm_analysis``: heatmap SVG de la GRM, PCA de la GRM (proyección de los
  individuos) y pares más relacionados, para detectar estructura
  poblacional y parentesco antes de modelar.
"""

from typing import List

import torch

from Genoly.quantitative.grm import build_kinship


def grm_analysis(genotypes: List[List[float]],
                 kinship: str = "vanraden",
                 top_relatives: int = 10) -> dict:
    """
    Analiza la matriz de parentesco de un conjunto de genotipos.

    Args:
        genotypes: Dosis alélicas (n x marcadores).
        kinship: 'vanraden' o 'gcta'.
        top_relatives: Número de pares más relacionados a reportar.

    Returns:
        Dict con ``heatmap_svg``, ``pca`` (n x 2), ``eigenvalues`` y
        ``top_pairs`` (i, j, valor).
    """
    from Genoly.report.plots import heatmap_svg

    G = torch.tensor(genotypes, dtype=torch.float64)
    K = build_kinship(G, method=kinship)
    n = K.shape[0]

    heatmap = heatmap_svg(K.tolist(), title="Matriz de parentesco (GRM)",
                          max_cells=2500)

    lam, U = torch.linalg.eigh(K)
    pc1 = U[:, -1].tolist()
    pc2 = U[:, -2].tolist()

    pairs = []
    for i in range(n):
        for j in range(i + 1, n):
            pairs.append((float(K[i, j].item()), i, j))
    pairs.sort(key=lambda x: -x[0])

    return {
        "n": n,
        "kinship": kinship,
        "heatmap_svg": heatmap,
        "pca": [[round(pc1[i], 4), round(pc2[i], 4)] for i in range(n)],
        "eigenvalues": [round(float(v), 4) for v in lam.tolist()],
        "top_pairs": [
            {"i": i, "j": j, "value": round(v, 3)}
            for v, i, j in pairs[:top_relatives]
        ],
    }