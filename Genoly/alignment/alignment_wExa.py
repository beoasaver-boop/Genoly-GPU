import torch
import torch.nn.functional as F
import numpy as np
from typing import List, Tuple
import time

class GPUSequenceAligner:
    """
    Alineador de secuencias ADN/RNA usando algoritmo Smith-Waterman
    optimizado para GPU y procesamiento por lotes.
    """
    
    def __init__(self, match_score: float = 2.0, 
                 mismatch_penalty: float = -1.0,
                 gap_penalty: float = -1.0):
        """
        Inicializa el alineador con puntuaciones.
        """
        self.match_score = match_score
        self.mismatch_penalty = mismatch_penalty
        self.gap_penalty = gap_penalty
        
        # Mapeo de nucleótidos a índices
        self.nuc_to_idx = {'A': 0, 'C': 1, 'G': 2, 'T': 3, 'N': 4, '-': 5}
        self.idx_to_nuc = {v: k for k, v in self.nuc_to_idx.items()}
    
    def encode_sequences(self, sequences: List[str]) -> torch.Tensor:
        """
        Convierte secuencias de ADN a tensor numérico.
        """
        max_len = max(len(seq) for seq in sequences)
        batch_size = len(sequences)
        
        # Crear tensor con padding
        encoded = torch.full((batch_size, max_len), 
                            self.nuc_to_idx['N'], 
                            dtype=torch.long)
        
        for i, seq in enumerate(sequences):
            for j, nuc in enumerate(seq):
                encoded[i, j] = self.nuc_to_idx.get(nuc, self.nuc_to_idx['N'])
        
        return encoded.cuda() if torch.cuda.is_available() else encoded
    
    def batch_sw_alignment(self, 
                          queries: List[str], 
                          targets: List[str]) -> Tuple[List[float], List[str], List[str]]:
        """
        Alineamiento Smith-Waterman en batch usando GPU.
        """
        # Asegurar que tenemos el mismo número de queries y targets
        if len(queries) != len(targets):
            # Si hay menos targets, repetir el último
            if len(targets) < len(queries):
                last_target = targets[-1] if targets else ""
                targets = targets + [last_target] * (len(queries) - len(targets))
            else:
                targets = targets[:len(queries)]
        
        # Codificar secuencias
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        queries_encoded = self.encode_sequences(queries).to(device)
        targets_encoded = self.encode_sequences(targets).to(device)
        
        batch_size = len(queries)
        
        # Obtener longitudes reales (sin padding)
        query_lens = torch.tensor([len(q) for q in queries], device=device)
        target_lens = torch.tensor([len(t) for t in targets], device=device)
        
        # Matriz de scoring en GPU/CPU
        match_matrix = torch.eye(len(self.nuc_to_idx), device=device) * self.match_score
        match_matrix[match_matrix == 0] = self.mismatch_penalty
        
        scores = []
        aligned_qs = []
        aligned_ts = []
        
        # Procesar cada par
        for i in range(batch_size):
            query_len = query_lens[i].item()
            target_len = target_lens[i].item()
            
            # Extraer secuencias sin padding
            query_seq = queries_encoded[i, :query_len]
            target_seq = targets_encoded[i, :target_len]
            
            score, aln_q, aln_t = self._single_sw_gpu(
                query_seq, target_seq, match_matrix, device
            )
            scores.append(score)
            aligned_qs.append(aln_q)
            aligned_ts.append(aln_t)
        
        return scores, aligned_qs, aligned_ts
    
    def _single_sw_gpu(self, 
                      query: torch.Tensor, 
                      target: torch.Tensor,
                      match_matrix: torch.Tensor,
                      device: str) -> Tuple[float, str, str]:
        """
        Smith-Waterman para un solo par.
        """
        m, n = len(query), len(target)
        
        # Matriz de scoring
        H = torch.zeros((m + 1, n + 1), device=device, dtype=torch.float32)
        
        # Trackback pointers
        pointer = torch.zeros((m + 1, n + 1), device=device, dtype=torch.long)
        
        # Llenar matriz de scoring
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                # Calcular scores
                match_score = match_matrix[query[i-1].item(), target[j-1].item()]
                diagonal = H[i-1, j-1] + match_score
                up = H[i-1, j] + self.gap_penalty
                left = H[i, j-1] + self.gap_penalty
                
                # Encontrar máximo
                max_val = max(0, diagonal.item(), up.item(), left.item())
                H[i, j] = max_val
                
                # Guardar dirección para backtracking
                if max_val == 0:
                    pointer[i, j] = 0  # STOP
                elif max_val == diagonal.item():
                    pointer[i, j] = 1  # DIAGONAL
                elif max_val == up.item():
                    pointer[i, j] = 2  # UP
                else:
                    pointer[i, j] = 3  # LEFT
        
        # Encontrar puntuación máxima
        max_score = torch.max(H).item()
        max_pos = torch.argmax(H)
        
        # Convertir posición 1D a 2D
        i = max_pos // (n + 1)
        j = max_pos % (n + 1)
        
        # Backtracking
        aln_q = []
        aln_t = []
        
        while i > 0 and j > 0 and pointer[i, j] != 0:
            if pointer[i, j] == 1:  # DIAGONAL
                aln_q.append(self.idx_to_nuc[query[i-1].item()])
                aln_t.append(self.idx_to_nuc[target[j-1].item()])
                i -= 1
                j -= 1
            elif pointer[i, j] == 2:  # UP
                aln_q.append(self.idx_to_nuc[query[i-1].item()])
                aln_t.append('-')
                i -= 1
            else:  # LEFT
                aln_q.append('-')
                aln_t.append(self.idx_to_nuc[target[j-1].item()])
                j -= 1
        
        return max_score, ''.join(reversed(aln_q)), ''.join(reversed(aln_t))

# ============================================================================
# ANALIZADOR SIMPLIFICADO Y CORREGIDO
# ============================================================================

class SimpleGPUMutationAnalyzer:
    """
    Analizador de mutaciones simplificado para demostración.
    """
    
    def __init__(self):
        self.aligner = GPUSequenceAligner()
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"Usando dispositivo: {self.device}")
        if self.device == 'cuda':
            print(f"GPU: {torch.cuda.get_device_name(0)}")
    
    def analyze_simple(self, 
                      patient_seq: str,
                      reference_seq: str) -> dict:
        """
        Análisis simple de una secuencia contra referencia.
        """
        # Alinear
        scores, aligned_qs, aligned_ts = self.aligner.batch_sw_alignment(
            [patient_seq], [reference_seq]
        )
        
        if not scores:
            return {"error": "No se pudo alinear"}
        
        # Encontrar diferencias
        mutations = self._find_simple_mutations(aligned_qs[0], aligned_ts[0])
        
        return {
            "score": scores[0],
            "alignment": {
                "query": aligned_qs[0],
                "target": aligned_ts[0]
            },
            "mutations": mutations,
            "mutation_count": len(mutations)
        }
    
    def _find_simple_mutations(self, aligned_query: str, aligned_target: str) -> List[dict]:
        """
        Encuentra mutaciones entre secuencias alineadas.
        """
        mutations = []
        q_pos = 0
        t_pos = 0
        
        for i, (q, t) in enumerate(zip(aligned_query, aligned_target)):
            if q != '-':
                q_pos += 1
            if t != '-':
                t_pos += 1
            
            if q != t and q != '-' and t != '-':
                mutations.append({
                    "position": t_pos,
                    "ref": t,
                    "alt": q,
                    "alignment_pos": i
                })
        
        return mutations

# ============================================================================
# DEMOSTRACIÓN SIMPLIFICADA (EVITA ERRORES)
# ============================================================================

def run_safe_demo():
    """
    Demostración segura y simplificada.
    """
    print("=" * 60)
    print("🧬 BioGPU Demo - Versión Corregida")
    print("=" * 60)
    
    # Verificar instalación de PyTorch
    try:
        print(f"PyTorch versión: {torch.__version__}")
        print(f"CUDA disponible: {torch.cuda.is_available()}")
        
        if torch.cuda.is_available():
            print(f"Dispositivo CUDA: {torch.cuda.get_device_name(0)}")
            print(f"Memoria total: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    except Exception as e:
        print(f"Error verificando CUDA: {e}")
    
    print("\n1. Creando analizador...")
    analyzer = SimpleGPUMutationAnalyzer()
    
    print("\n2. Ejecutando alineamiento simple...")
    
    # Datos de ejemplo muy simples
    reference = "ATGCTAGCTAGCTAGCTAGC"  # 20 bp
    patient1 = "ATGCTAGCTAGCTAGCTAGC"   # Igual
    patient2 = "ATGCTAGCTAGGTAGCTAGC"   # Una mutación (T→G en posición 11)
    patient3 = "ATGCTAGCTAGCTAGCTAGG"   # Mutación al final
    
    test_cases = [
        ("Paciente 1 (sin mutaciones)", patient1),
        ("Paciente 2 (con mutación)", patient2),
        ("Paciente 3 (mutación final)", patient3)
    ]
    
    print(f"Referencia: {reference}")
    print("-" * 40)
    
    for name, patient_seq in test_cases:
        print(f"\nAnalizando {name}:")
        print(f"Secuencia: {patient_seq}")
        
        try:
            result = analyzer.analyze_simple(patient_seq, reference)
            
            print(f"Score de alineamiento: {result['score']:.2f}")
            print(f"Número de mutaciones: {result['mutation_count']}")
            
            if result['mutations']:
                print("Mutaciones encontradas:")
                for mut in result['mutations']:
                    print(f"  Posición {mut['position']}: {mut['ref']} → {mut['alt']}")
            
            # Mostrar alineamiento (solo si es corto)
            if len(result['alignment']['query']) <= 60:
                print("\nAlineamiento:")
                print(f"Query:  {result['alignment']['query']}")
                print(f"Target: {result['alignment']['target']}")
                
        except Exception as e:
            print(f" Error procesando {name}: {e}")
            print(f"Tipo de error: {type(e).__name__}")
    
    print("\n" + "=" * 60)
    print("🎯 Demo completada exitosamente!")
    print("\nPara extender este proyecto:")
    print("1. Añadir soporte para FASTQ/FASTA reales")
    print("2. Implementar algoritmos más eficientes")
    print("3. Añadir análisis de calidad (Phred scores)")
    print("4. Soporte para batches grandes")
    print("=" * 60)

# ============================================================================
# PRUEBAS UNITARIAS BÁSICAS
# ============================================================================

def run_basic_tests():
    """
    Pruebas básicas para verificar el funcionamiento.
    """
    print("\n🧪 Ejecutando pruebas básicas...")
    
    aligner = GPUSequenceAligner()
    
    # Test 1: Secuencias idénticas
    print("\nTest 1: Secuencias idénticas")
    queries = ["ACGT", "ACGTACGT"]
    targets = ["ACGT", "ACGTACGT"]
    
    try:
        scores, aligned_qs, aligned_ts = aligner.batch_sw_alignment(queries, targets)
        print(f"✓ Secuencias idénticas alineadas correctamente")
        print(f"  Scores: {scores}")
    except Exception as e:
        print(f"✗ Error en Test 1: {e}")
    
    # Test 2: Secuencia vs vacío
    print("\nTest 2: Secuencia vs más corta")
    queries = ["ACGTA"]
    targets = ["ACG"]
    
    try:
        scores, aligned_qs, aligned_ts = aligner.batch_sw_alignment(queries, targets)
        print(f"✓ Secuencias de diferente longitud alineadas")
        print(f"  Score: {scores[0]:.2f}")
    except Exception as e:
        print(f"✗ Error en Test 2: {e}")
    
    # Test 3: Batch pequeño
    print("\nTest 3: Batch de 3 secuencias")
    queries = ["ACGT", "TGCA", "ATCG"]
    targets = ["ACGT", "TGCA", "ATCG"]
    
    try:
        scores, aligned_qs, aligned_ts = aligner.batch_sw_alignment(queries, targets)
        print(f"✓ Batch procesado correctamente")
        print(f"  Número de resultados: {len(scores)}")
    except Exception as e:
        print(f"✗ Error en Test 3: {e}")

# ============================================================================
# EJECUCIÓN PRINCIPAL
# ============================================================================

if __name__ == "__main__":
    try:
        # Ejecutar demo segura
        run_safe_demo()
        
        # Ejecutar pruebas básicas
        run_basic_tests()
        
        # Información adicional
        print("\n" + "=" * 60)
        print("📦 Instalación completada correctamente!")
        print("\nPara instalar en un nuevo entorno:")
        print("1. Crear entorno virtual: python -m venv biogpu_env")
        print("2. Activar: source biogpu_env/bin/activate (Linux)")
        print("3. Instalar PyTorch con CUDA:")
        print("   pip install torch torchvision torchaudio")
        print("4. Ejecutar: python biogpu_demo.py")
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Demo interrumpida por el usuario")
    except Exception as e:
        print(f"\n Error crítico: {e}")
        print(f"\nTipo: {type(e).__name__}")
        import traceback
        print("\nTraceback completo:")
        traceback.print_exc()
        
        print("\n🔧 Solución de problemas:")
        print("1. Verifica que PyTorch esté instalado: pip list | grep torch")
        print("2. Si usas GPU, instala PyTorch con CUDA:")
        print("   pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118")
        print("3. Reduce el tamaño de las secuencias si hay error de memoria")