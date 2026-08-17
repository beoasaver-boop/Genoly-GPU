"""
Pipeline completo de analisis genomico acelerado por GPU con Genoly.

Recorre el flujo estandar:
  I/O FASTA/FASTQ -> QC -> k-mers -> llamada de variantes

Uso:
    python examples/pipeline_completo.py
"""

import random
import sys
import os

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(root_dir)

import torch

from Genoly import (
    DeviceManager,
    FastaReader,
    SequenceEncoder,
    QualityAnalyzer,
    KmerCounter,
    VariantCaller,
    Read,
)


def leer_genoma(path):
    """Lee el genoma/referencia desde FASTA (streaming)."""
    registros = list(FastaReader(path).records())
    print(f"Registros FASTA leidos: {len(registros)}")

    # El archivo contiene isoformas del gen BRCA1; usamos la variante principal
    principal = registros[0]
    print(f"Referencia: {principal.id} ({len(principal)} pb)")
    return principal.sequence.upper()


def simular_lecturas(referencia, num_reads=300, read_len=80, error_rate=0.01,
                     snv_positions=None):
    """Simula lecturas a partir de la referencia con errores y SNVs."""
    snv_positions = snv_positions or {}
    lecturas = []
    calidades = []
    max_start = max(0, len(referencia) - read_len)
    for _ in range(num_reads):
        start = random.randint(0, max_start)
        seq = list(referencia[start:start + read_len])
        qual = []
        for i, base in enumerate(seq):
            if (start + i) in snv_positions:
                seq[i] = snv_positions[start + i]
            elif random.random() < error_rate:
                seq[i] = random.choice([b for b in 'ACGT' if b != base])
            qual.append(chr(33 + random.randint(30, 40)))
        lecturas.append(Read(sequence="".join(seq), start=start))
        calidades.append("".join(qual))
    return lecturas, calidades


def main():
    print("=" * 70)
    print("PIPELINE COMPLETO GENOLY-GPU (aceleracion NVIDIA/CUDA)")
    print("=" * 70)

    # 1. Dispositivo
    manager = DeviceManager()
    manager.print_info()

    # 2. I/O FASTA y codificacion a tensores GPU
    print("\n[1] I/O FASTA y codificacion")
    referencia = leer_genoma(os.path.join(root_dir, "examples", "seqdump.txt"))
    encoder = SequenceEncoder()
    tensor, longitudes = encoder.encode([referencia[:1000], referencia[1000:2000]])
    print(f"Tensor codificado: {tuple(tensor.shape)} en {tensor.device}")
    onehot = encoder.encode_one_hot([referencia[:1000]])
    print(f"One-hot: {tuple(onehot.shape)}")
    decodificado = encoder.decode(tensor, longitudes)
    assert decodificado[0] == referencia[:1000], "Round-trip de codificacion fallo"
    print("Round-trip secuencia -> tensor -> secuencia OK")

    # 3. Control de calidad (contenido GC, composicion)
    print("\n[2] Control de calidad")
    qa = QualityAnalyzer()
    gc = qa.gc_content_percent([referencia[:5000]]).item()
    comp = qa.base_composition([referencia[:5000]])
    print(f"Contenido GC (5kb): {gc:.2f}%")
    print(f"Composicion de bases: {comp}")

    # 4. K-mers
    print("\n[3] Analisis de k-mers")
    kc = KmerCounter()
    # Fragmentos contiguos de 10kb que cubren todo el genoma
    window = 10000
    fragmentos = [
        referencia[i:i + window]
        for i in range(0, len(referencia), window)
        if len(referencia[i:i + window]) >= 21
    ]
    valores, conteos = kc.count(fragmentos, k=21, canonical=True)
    print(f"K-mers unicos (k=21): {len(valores):,}")
    print("Top 5 mas frecuentes:")
    for v, c in zip(valores[:5].tolist(), conteos[:5].tolist()):
        print(f"  {kc.decode_kmer(v, 21)}  x{c}")
    tamano, cobertura = kc.estimate_genome_size(fragmentos, k=21, min_abundance=1)
    print(f"Estimacion genoma: {tamano:,.0f} pb (cobertura ~{cobertura:.0f}x)")

    # 5. Llamada de variantes
    print("\n[4] Llamada de variantes")
    ref_region = referencia[:5000]
    # Introducir 3 SNVs en posiciones concretas
    snvs = {1000: 'T', 2500: 'G', 4000: 'C'}
    # Aplicar los SNV a la referencia para que las lecturas los lleven
    ref_con_snv = list(ref_region)
    for pos, base in snvs.items():
        ref_con_snv[pos] = base
    ref_con_snv = "".join(ref_con_snv)

    # Cobertura ~9.6x sobre la region de 5kb
    lecturas, calidades = simular_lecturas(
        ref_con_snv, num_reads=600, read_len=80, snv_positions=snvs
    )
    vc = VariantCaller()
    variantes = vc.call_variants(ref_region, lecturas, calidades,
                                 min_depth=5, min_alt_freq=0.5)
    print(f"Variantes llamadas: {len(variantes)}")
    for v in variantes:
        print(f"  {v.position}  {v.ref}->{v.alt}  tipo={v.type}  "
              f"frec={v.freq:.2f}  depth={v.depth}")

    # 6. Uso del alineador de secuencias original
    print("\n[5] Alineamiento (modulo original)")
    from Genoly.alignment.alignment import GPUSequenceAligner
    alineador = GPUSequenceAligner()
    resultado = alineador.align_pair(
        "ACGTACGTACGTTT", "ACGTACGTACGTTT"
    )
    print(f"Identidad: {resultado.identity_percent:.1f}%  "
          f"CIGAR: {resultado.cigar_string}")

    print("\n" + "=" * 70)
    print("PIPELINE COMPLETADO EXITOSAMENTE")
    print("=" * 70)


if __name__ == "__main__":
    random.seed(42)
    main()