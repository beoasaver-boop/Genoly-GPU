import sys
import os
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(root_dir)
from Genoly.alignment.alignment import GPUSequenceAligner

# ============================================================================
# EJEMPLO COMPLETO DE USO
# ============================================================================
def ejemplo_completo():
    """Demostración de todas las funcionalidades en una sola clase"""
    
    print("=== GPUSequenceAligner - Ejemplo Completo ===\n")
    
    # 1. Crear alineador
    aligner = GPUSequenceAligner()
    # 2. Secuencias de ejemplo (BRCA1)
    referencia = "GATCTTTCTCCACAGCACGGGGAACAGCTCCGGAAAGAGTGTCT"
    paciente =   "GATCTTTCTCCACAGCACGGGGAACAGCTCCGGAAAGAGTGTCA"  # Mutación T→A
    print("1. Alineamiento simple:")
    resultado = aligner.align_pair(paciente, referencia)
    print(f"   Score: {resultado.score:.1f}")
    print(f"   Identidad: {resultado.identity_percent:.1f}%")
    print(f"   CIGAR: {resultado.cigar_string}")
    print(f"   Alineado: {resultado.aligned_target}")
    print(f"            {resultado.aligned_query}")
    # 3. Análisis de mutaciones
    print("\n2. Análisis de mutaciones:")
    # Base de datos de variantes conocidas
    variantes_conocidas = [
        {'position': 37, 'ref': 'T', 'alt': 'A', 'gene': 'BRCA1', 'rsid': 'rs80357906'},
        {'position': 42, 'ref': 'C', 'alt': 'T', 'gene': 'BRCA1', 'rsid': 'rs80357907'},
    ]

    analisis = aligner.analyze_mutations(
        query=paciente,
        target=referencia,
        known_variants=variantes_conocidas
    )
    
    print(f"   Variantes encontradas: {analisis['statistics']['total_variants']}")
    print(f"   SNVs: {analisis['statistics']['snvs']}")
    print(f"   Coincidencias conocidas: {analisis['statistics']['known_matches']}")
    
    for variante in analisis['variants']:
        print(f"   - Pos {variante['position']}: {variante['ref']}→{variante['alt']} ({variante['type']})")
    
    # 4. Batch processing
    print("\n3. Procesamiento por lotes:")
    queries = [referencia] * 5 + [paciente] * 5
    targets = [referencia] * 10
    
    resultados_batch = aligner.align_batch(queries, targets)
    print(f"   Procesados {len(resultados_batch)} pares de secuencias")
    
    # 5. Benchmark
    print("\n4. Benchmark de rendimiento:")
    if aligner.device.type == 'cuda':
        metrics = aligner.benchmark(sequence_length=100, num_pairs=50)
        print(f"   GPU: {metrics['gpu_time']:.2f}s")
        print(f"   CPU: {metrics['cpu_time']:.2f}s")
        print(f"   Speedup: {metrics['speedup']:.1f}x")
        print(f"   Pares/segundo: {metrics['pairs_per_second']:.0f}")
    
    # 6. Métodos útiles adicionales
    print("\n5. Métodos adicionales disponibles:")
    print("   - align_pair(): Alineamiento de un par")
    print("   - align_batch(): Alineamiento por lotes")
    print("   - find_variants(): Detección de variantes")
    print("   - analyze_mutations(): Análisis completo")
    print("   - benchmark(): Test de rendimiento")
    print("   - encode_sequence(): Codificación a tensor")
    print("   - encode_batch(): Codificación por lotes")
    
    return aligner

if __name__ == "__main__":
    # Ejecutar ejemplo
    aligner = ejemplo_completo()
    
    print("\n" + "="*60)
    print("✅ Clase unificada lista para usar")
    print("\nPosibles extensiones:")
    print("1. add_quality_scores(): Incorporar calidades Phred")
    print("2. load_fasta(): Cargar secuencias desde archivo")
    print("3. save_results(): Exportar a formato estándar")
    print("4. stream_from_fastq(): Procesamiento en streaming")
    print("="*60)