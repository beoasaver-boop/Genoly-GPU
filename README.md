# Genoly-GPU

Software de aceleración por tecnología de GPU (NVIDIA por ahora) para el análisis de grandes datos del genoma.

Genoly-GPU ofrece herramientas de alineamiento de secuencias de ADN/ARN, detección de variantes y análisis de mutaciones, aprovechando la aceleración de GPUs NVIDIA a través de PyTorch y CUDA.

## Caracteristicas

- Alineamiento de secuencias con el algoritmo Smith-Waterman implementado sobre PyTorch.
- Detección automática de variantes: SNVs, inserciones y deleciones.
- Análisis completo de mutaciones contra una referencia y comparación con variantes conocidas.
- Procesamiento por lotes (batch) de pares de secuencias.
- Codificación de secuencias a tensores numéricos para operar en GPU o CPU.
- Generación de CIGAR strings.
- Benchmark de rendimiento GPU vs CPU.
- Utilidades para descargar secuencias FASTA desde NCBI.

> [!NOTE]
> Actualmente el soporte de GPU está orientado a NVIDIA (CUDA). Si el dispositivo no dispone de GPU CUDA, el software funciona igualmente sobre CPU.

> [!IMPORTANT]
> El alineamiento Smith-Waterman es un algoritmo de programación dinámica con coste cuadrático O(n*m). En secuencias de gran tamaño o volúmenes de datos masivos, es fundamental disponer de una GPU con memoria suficiente y usar el procesamiento por lotes.

## Estructura del proyecto

```
Genoly-GPU/
├── Genoly/
│   ├── __init__.py
│   └── alignment/
│       ├── alignment.py         # Clase principal GPUSequenceAligner
│       ├── alignment_wExa.py    # Versión con analizador de mutaciones simplificado
│       └── __init__.py
├── examples/
│   ├── examp1.py                # Ejemplo completo de uso del alineador
│   ├── analisis1.py             # Análisis FASTA: composición y contenido GC
│   ├── analisis2.py             # Sitios de restricción y motivos consenso
│   └── seqdump.txt              # Secuencia de ejemplo
├── fetchingfasta.py             # Descarga de FASTA desde NCBI por accession
├── clean_fetching.py            # Descarga de FASTA desde una URL directa
└── setup_genoly.ps1             # Script de instalación/estructura para Windows
```

## Requisitos

- Python 3.8 o superior.
- NVIDIA GPU con drivers CUDA (recomendado, no obligatorio).
- Dependencias:

| Paquete | Mínimo |
|---|---|
| torch | >= 2.0.0 |
| numpy | >= 1.20.0 |

Dependencias opcionales para los ejemplos:

- Biopython (para analisis1.py y analisis2.py)
- matplotlib (para los gráficos de analisis1.py)
- requests (para clean_fetching.py)

> [!TIP]
> Si ya tienes una GPU NVIDIA pero PyTorch fue instalado sin soporte CUDA, reinstálalo con el índice correcto:
>
> ```bash
> pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
> ```

## Instalación

### Windows (script de setup)

```powershell
powershell -ExecutionPolicy Bypass -File .\setup_genoly.ps1
```

### Manual

```bash
# Clona o copia el proyecto, luego instala las dependencias
pip install -r requirements.txt
```

> [!TIP]
> Se recomienda encarecidamente usar un entorno virtual para aislar las dependencias del proyecto:
>
> ```bash
> python -m venv genoly_env
> # Windows
> genoly_env\Scripts\activate
> # Linux/macOS
> source genoly_env/bin/activate
> pip install -r requirements.txt
> ```

## Uso rápido

```python
from Genoly.alignment.alignment import GPUSequenceAligner

aligner = GPUSequenceAligner()

referencia = "GATCTTTCTCCACAGCACGGGGAACAGCTCCGGAAAGAGTGTCT"
paciente = "GATCTTTCTCCACAGCACGGGGAACAGCTCCGGAAAGAGTGTCA"

# Alineamiento simple
resultado = aligner.align_pair(paciente, referencia)
print(f"Score: {resultado.score:.1f}")
print(f"Identidad: {resultado.identity_percent:.1f}%")
print(f"CIGAR: {resultado.cigar_string}")

# Análisis de mutaciones con variantes conocidas
analisis = aligner.analyze_mutations(
    query=paciente,
    target=referencia,
    known_variants=[{'position': 37, 'ref': 'T', 'alt': 'A'}]
)
print(analisis['statistics'])
```

## Ejemplos

```bash
# Ejemplo completo del alineador
python examples/examp1.py

# Análisis de archivos FASTA (requiere Biopython y matplotlib)
python examples/analisis1.py

# Sitios de restricción y motivos consenso (requiere Biopython)
python examples/analisis2.py

# Descargar una secuencia FASTA desde NCBI por accession
python fetchingfasta.py
```

> [!WARNING]
> Los ejemplos `analisis1.py` y `analisis2.py` leen archivos locales (`seqdump.txt` y `ejemplo.fasta`). Asegúrate de que dichos archivos existan en el directorio de trabajo antes de ejecutarlos.

## Clases principales

### GPUSequenceAligner

Alineador de secuencias genómicas con aceleración GPU. Unifica funcionalidades de alineamiento y análisis básico.

| Método | Descripción |
|---|---|
| `align_pair(query, target)` | Alinea un par de secuencias con Smith-Waterman. |
| `align_batch(queries, targets)` | Alinea múltiples pares de secuencias. |
| `find_variants(aligned_q, aligned_t)` | Detecta SNVs, inserciones y deleciones. |
| `analyze_mutations(query, target, known_variants)` | Análisis completo de mutaciones. |
| `encode_sequence(sequence)` | Codifica una secuencia a tensor numérico. |
| `encode_batch(sequences)` | Codifica un lote de secuencias con padding. |
| `benchmark(sequence_length, num_pairs)` | Test de rendimiento GPU vs CPU. |

Los parámetros de scoring del alineador son configurables en el constructor:

```python
aligner = GPUSequenceAligner(
    match_score=2.0,
    mismatch_penalty=-1.0,
    gap_open=-2.0,
    gap_extend=-0.5,
    device="cuda"  # "cuda", "cpu" o None para auto-detectar
)
```

> [!IMPORTANT]
> Para secuencias de gran tamaño el procesamiento por lotes (`align_batch`) aún procesa en serie cuando el número de pares es reducido. La verdadera paralelización por lotes en GPU es un trabajo en curso.

## Descarga de secuencias

`fetchingfasta.py` descarga una secuencia FASTA desde NCBI usando el número de acceso:

```bash
python fetchingfasta.py
# Descarga el gen BRCA1 humano (NM_007294) como BRCA1_humano.fasta
```

`clean_fetching.py` permite descargar desde una URL directa de un archivo FASTA:

```bash
python clean_fetching.py
```

> [!CAUTION]
> Al descargar secuencias grandes desde NCBI, respeta los límites de uso de la API de E-utilities de NCBI (como máximo 3 solicitudes por segundo).

## Hoja de ruta

- [ ] Soporte real de paralelización por lotes en GPU.
- [ ] Carga de archivos FASTQ/FASTA directamente.
- [ ] Análisis de calidad (scores Phred).
- [ ] Procesamiento en streaming para datasets masivos.
- [ ] Exportación a formatos estándar (SAM/BAM, VCF).

## Licencia

MIT

> [!NOTE]
> Este proyecto está en fase alpha (Development Status 3 - Alpha). Las APIs pueden cambiar en futuras versiones.