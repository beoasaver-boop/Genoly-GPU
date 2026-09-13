"""
Exportación de variantes a formato VCF 4.2.
"""

from pathlib import Path
from typing import Dict, Iterable, List, Union


def _vcf_info(variant) -> str:
    return (f"DP={variant.depth};AD={variant.alt_count};"
            f"AF={variant.freq:.4f}")


def write_vcf(path: Union[str, Path],
              by_sequence: Dict[str, list],
              sequences: Iterable[dict] = ()) -> int:
    """
    Escribe un VCF 4.2 con las variantes agrupadas por secuencia.

    Args:
        path: Ruta de salida.
        by_sequence: ``{nombre_secuencia: [Variant, ...]}``.
        sequences: Resumen por secuencia (para los contigs @contig).

    Returns:
        Número de variantes escritas.
    """
    contigs = sequences or ({'name': k} for k in by_sequence)
    count = 0
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("##fileformat=VCFv4.2\n")
        fh.write('##source=Genoly-GPU\n')
        fh.write('##INFO=<ID=DP,Number=1,Type=Integer,Description="Total depth">\n')
        fh.write('##INFO=<ID=AD,Number=1,Type=Integer,Description="Alt allele depth">\n')
        fh.write('##INFO=<ID=AF,Number=1,Type=Float,Description="Alt allele frequency">\n')
        for c in contigs:
            name = c.get('name', c) if isinstance(c, dict) else c
            fh.write(f'##contig=<ID={name}>\n')
        fh.write('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n')
        for name, variants in by_sequence.items():
            for v in variants:
                fh.write(f"{name}\t{v.position}\t.\t{v.ref}\t{v.alt}\t."
                         f"\tPASS\t{_vcf_info(v)}\n")
                count += 1
    return count