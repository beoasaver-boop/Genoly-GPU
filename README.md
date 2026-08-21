# Genoly-GPU

Software de aceleración por tecnología de GPU (NVIDIA por ahora) para el análisis de grandes datos del genoma.

Genoly-GPU ofrece las herramientas de un pipeline de genómica estándar —I/O de FASTA/FASTQ, control de calidad, conteo de k-mers, alineamiento, codificación a tensores y llamada de variantes— todo acelerado por GPUs NVIDIA a través de PyTorch y CUDA.

## Caracteristicas

- Lectura/escritura de FASTA y FASTQ en streaming (consumo de memoria reducido).
- Codificación de secuencias a tensores enteros y one-hot sobre GPU.
- Control de calidad: contenido GC, composición de bases y distribución de calidad Phred, con trimming y filtrado de lecturas.
- Conteo de k-mers y espectro k-mer acelerado por GPU (convolución 1D vectorizada), con estimación de tamaño de genoma (Lander-Waterman).
- Pileup y llamada de variantes (SNV y deleciones) sobre GPU mediante operaciones de dispersión.
- Genética cuantitativa sobre GPU: modelos lineales mixtos (LMM) con estimación REML/ML, matriz de parentesco genómica (VanRaden) y predicción de valores de cría (BLUP).
- Detección automática de la GPU NVIDIA con nvidia-smi e instalación automática de la build de PyTorch con CUDA más conveniente.
- Alineamiento con el algoritmo Smith-Waterman implementado sobre PyTorch.
- Análisis completo de mutaciones contra una referencia y comparación con variantes conocidas.
- Generación de CIGAR strings y benchmark de rendimiento GPU vs CPU.
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
│   ├── core/
│   │   ├── device.py             # DeviceManager: detección y gestión de GPU/CUDA
│   │   └── gpu_setup.py          # Auto-detección nvidia-smi e instalación de PyTorch CUDA
│   ├── io/
│   │   ├── fasta.py              # Lectura/escritura FASTA en streaming
│   │   └── fastq.py              # Lectura/escritura FASTQ con calidad Phred
│   ├── encoding/
│   │   └── encoder.py            # Codificación a tensores enteros y one-hot
│   ├── qc/
│   │   └── quality.py            # GC content, composición, calidad y filtrado
│   ├── kmer/
│   │   └── kmers.py              # Conteo de k-mers y espectro en GPU
│   ├── variants/
│   │   └── caller.py             # Pileup y llamada de variantes en GPU
│   ├── quantitative/
│   │   └── lmm.py                # Modelos lineales mixtos (REML/ML) y BLUP
│   └── alignment/
│       ├── alignment.py          # Clase principal GPUSequenceAligner
│       └── alignment_wExa.py     # Versión con analizador de mutaciones simplificado
├── examples/
│   ├── pipeline_completo.py      # Pipeline completo: I/O -> QC -> k-mers -> variantes
│   ├── examp1.py                 # Ejemplo de uso del alineador
│   ├── analisis1.py              # Análisis FASTA: composición y contenido GC
│   ├── analisis2.py              # Sitios de restricción y motivos consenso
│   └── seqdump.txt               # Isoformas del gen BRCA1 (ejemplo)
├── tests/
│   └── test_smoke.py             # Tests de humo de todos los módulos
├── ui/
│   ├── backend/                  # API REST FastAPI
│   │   ├── main.py
│   │   └── routers/              # device, qc, kmer, variants
│   └── frontend/                 # UI React + Vite + Tailwind
│       └── src/                  # páginas y componentes
├── fetchingfasta.py              # Descarga de FASTA desde NCBI por accession
├── clean_fetching.py             # Descarga de FASTA desde una URL directa
├── setup_genoly.ps1              # Script de instalación/estructura para Windows
├── Dockerfile                    # Imagen multi-stage (frontend + API con CUDA)
├── .dockerignore
├── docker-compose.yml            # Orquesta el contenedor (GPU opcional)
└── requirements.txt
```

## Interfaz gráfica (UI)

Genoly-GPU incluye una interfaz web moderna construida con **React + Vite + Tailwind** y un backend **FastAPI** que expone los módulos GPU como API REST.

| Ruta | Funcionalidad |
|---|---|
| `/` | Dashboard con estado del dispositivo y accesos. |
| `/device` | Detección de GPU NVIDIA (nvidia-smi), driver, CUDA y build de PyTorch recomendada. |
| `/qc` | Control de calidad: GC content, composición y calidad Phred. |
| `/kmer` | Conteo de k-mers, espectro y estimación de tamaño de genoma. |
| `/variants` | Pileup y llamada de variantes (SNV/deleciones). |

### Puesta en marcha

Requisitos: Node.js 18+ y las dependencias de Python (ver arriba).

```bash
# 1. Backend (FastAPI + uvicorn)
pip install -r ui/backend/requirements.txt
python -m uvicorn ui.backend.main:app --host 0.0.0.0 --port 8000
# Documentación de la API: http://localhost:8000/docs

# 2. Frontend (dev con hot-reload)
cd ui/frontend
npm install
npm run dev        # http://localhost:5173

# 3. Producción: compilar y servir desde el backend
npm run build      # genera ui/frontend/dist
# el backend sirve el frontend compilado en http://localhost:8000
```

> [!TIP]
> Durante desarrollo, Vite redirige `/api/*` a `http://127.0.0.1:8000` automáticamente, así que no necesitas configurar CORS manualmente.

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
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
> ```

## Setup de GPU NVIDIA (auto-detección e instalación)

Genoly-GPU incluye un módulo que consulta `nvidia-smi` para detectar el driver y la versión de CUDA, y recomienda (o instala) automáticamente la build de PyTorch con CUDA más conveniente. Esto evita que PyTorch no detecte la GPU de NVIDIA y el pipeline caiga a CPU.

### Comprobación

```bash
python -m Genoly.core.gpu_setup
```

Salida de ejemplo:

```
GPU: GeForce RTX 3050
Driver: 591.59 | CUDA del driver: 13.1
Build de PyTorch compatible recomendada: cu130
PyTorch: 2.13.0+cu126 | torch.cuda.is_available()=True
GPU activa: NVIDIA GeForce RTX 3050 6GB Laptop GPU (compute (8, 6))
Estado OK: PyTorch usa CUDA.
```

### Instalación automática

```bash
# Ver el comando pip recomendado sin ejecutarlo
python -m Genoly.core.gpu_setup --install --dry-run

# Ejecutar la instalación de la build recomendada
python -m Genoly.core.gpu_setup --install

# Forzar una build concreta
python -m Genoly.core.gpu_setup --install --tag cu126
```

> [!IMPORTANT]
> El driver NVIDIA es retrocompatible: una build `cuXXX` de PyTorch funciona si el driver soporta CUDA >= XXX (lo que reporta `nvidia-smi`). El módulo elige la build más reciente que tu driver soporte.

> [!CAUTION]
> `--install` modifica el entorno Python actual (reinstala `torch`/`torchvision`). Se recomienda ejecutarlo dentro de un entorno virtual. Usa `--dry-run` primero para revisar el comando.

### Uso programático

```python
from Genoly import GpuSetup

# Verificar y, si hace falta, instalar la build correcta
GpuSetup.ensure_cuda_torch(auto_install=True)

# Solo inspeccionar
info = GpuSetup.detect_nvidia()
print(info.gpu_name, info.driver_version, info.cuda_version)
```

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

## Docker

Genoly-GPU incluye un `Dockerfile` (multi-stage), `.dockerignore` y `docker-compose.yml` listos para levantar la API y el frontend en un contenedor.

> [!TIP]
> La imagen construye el frontend React en una primera etapa y en la segunda instala Python + PyTorch con CUDA 12.6 (la misma build probada con la RTX 3050). La API queda servida en `http://localhost:8000` con el frontend compilado en `/`.

### Construir y arrancar

```bash
# Build + arranque en un solo paso
docker compose up --build -d

# Ver logs
docker compose logs -f

# Detener
docker compose down
```

### Solo el Dockerfile

```bash
docker build -t genoly-gpu:latest .
docker run -d --name genoly -p 8000:8000 genoly-gpu:latest
# API:      http://localhost:8000
# Frontend: http://localhost:8000
# Docs:     http://localhost:8000/docs
```

### Comprobaciones

```bash
docker compose ps                  # estado y healthcheck
curl http://localhost:8000/api/health   # {"status":"ok",...}
curl http://localhost:8000/api/device   # GPU y CUDA detectados
```

### GPU dentro del contenedor

La API funciona sin GPU (PyTorch cae a CPU automáticamente gracias a la auto-detección de Genoly). Para exponer la GPU NVIDIA al contenedor, descomenta el bloque `deploy` de `docker-compose.yml`:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

> [!IMPORTANT]
> Usar GPU en Docker requiere **nvidia-container-toolkit** en el host. En Windows con WSL2 hay que instalarlo dentro de la distro WSL2 y reiniciar Docker Desktop: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/

> [!NOTE]
> En Docker Desktop con WSL2, si la distro ya tiene configurado el toolkit, la GPU puede estar disponible incluso sin el bloque `deploy`. Comprueba con `curl http://localhost:8000/api/device` (campo `cuda_available`).

## Uso rápido

```python
from Genoly import (
    DeviceManager,
    SequenceEncoder,
    QualityAnalyzer,
    KmerCounter,
    VariantCaller,
    Read,
    LinearMixedModel,
    build_kinship,
)
from Genoly.alignment.alignment import GPUSequenceAligner

# 1. Dispositivo
manager = DeviceManager()          # auto-detecta CUDA
manager.print_info()

# 2. Codificación a tensores GPU
encoder = SequenceEncoder()
tensor, lengths = encoder.encode(["ACGTACGTACGT", "TTTTGGGGCCCC"])
one_hot = encoder.encode_one_hot(["ACGTACGTACGT"])
print(tensor.device, tuple(one_hot.shape))

# 3. Control de calidad
qa = QualityAnalyzer()
gc = qa.gc_content_percent(["GCGCATACGTACGT"]).item()
print(f"GC: {gc:.1f}%")

# 4. K-mers
kc = KmerCounter()
values, counts = kc.count(["ACGTACGTACGTACGTACGTACGT"], k=8)

# 5. Llamada de variantes
vc = VariantCaller()
reads = [Read(sequence="ACGTACGTTCGTACGT", start=0) for _ in range(20)]
variants = vc.call_variants("ACGTACGTACGTACGT", reads, min_depth=5)

# 6. Alineamiento
aligner = GPUSequenceAligner()
result = aligner.align_pair("ACGTACGT", "ACGTTCGT")
print(result.cigar_string)

# 7. Genética cuantitativa: LMM + BLUP
grm = build_kinship(genotipos)      # genotipos: matriz (individuos x marcadores), dosis {0,1,2}
lmm = LinearMixedModel()            # auto-detecta CUDA
resultado = lmm.fit(fenotipos, efectos_fijos, grm)   # REML por defecto
print(resultado.heritability)
valores_cria = lmm.blup()
```

## Ejemplos

```bash
# Pipeline completo: I/O -> QC -> k-mers -> variantes
python examples/pipeline_completo.py

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

## Tests

```bash
python tests/test_smoke.py
# o con pytest
python -m pytest tests -v
```

## Clases principales

### GpuSetup

Detección de la GPU NVIDIA con `nvidia-smi` e instalación automática de la build de PyTorch con CUDA adecuada.

| Método | Descripción |
|---|---|
| `detect_nvidia()` | Consulta nvidia-smi: driver, CUDA, GPU y memoria. |
| `recommend_cuda_tag(cuda_version)` | Elige la build `cuXXX` más conveniente para el driver. |
| `torch_status()` | Estado del PyTorch instalado (¿detecta CUDA?). |
| `install_command(cuda_tag)` | Genera el comando pip correspondiente. |
| `install_cuda_torch(cuda_tag, dry_run)` | Instala (o muestra) la build recomendada. |
| `ensure_cuda_torch(auto_install)` | Orquesta verificación + instalación automática. |

También existe la función de conveniencia `recommend_cuda_tag(cuda_version)`.

### DeviceManager

Gestión del dispositivo de cómputo (CUDA/NVIDIA o CPU). Centraliza la auto-detección.

| Método | Descripción |
|---|---|
| `print_info()` | Imprime GPU, memoria, compute capability y versión CUDA. |
| `get_gpu_info()` | Devuelve `GPUInfo` con los datos del dispositivo. |
| `synchronize()` | Sincroniza CUDA (para mediciones de tiempo). |
| `empty_cache()` | Libera memoria caché de CUDA. |

### SequenceEncoder

Codifica secuencias de ADN/ARN a tensores listos para GPU.

| Método | Descripción |
|---|---|
| `encode(sequences)` | Codifica un lote a tensor entero (B, L) + longitudes. |
| `encode_one_hot(sequences)` | Codifica un lote a one-hot (B, L, C). |
| `decode(tensor, lengths)` | Convierte índices de vuelta a secuencias de texto. |

### QualityAnalyzer

Control de calidad sobre GPU.

| Método | Descripción |
|---|---|
| `gc_content(sequences)` | Contenido GC por secuencia (tensor). |
| `base_composition(sequences)` | Conteo total de A/C/G/T/N. |
| `quality_distribution(records)` | Media de calidad Phred por posición. |
| `trim_by_quality(records, ...)` | Recorte 3' por ventana deslizante. |
| `filter_by_quality(records, ...)` | Filtro por calidad, longitud y ratio de N. |
| `report(records)` / `summarize(records)` | Reporte completo / resumen impreso. |

### KmerCounter

Conteo de k-mers acelerado por GPU (codificación base-4 + convolución 1D).

| Método | Descripción |
|---|---|
| `count(sequences, k, canonical)` | Frecuencia de cada k-mer (canónico opcional). |
| `decode_kmer(code, k)` | Convierte un código entero a secuencia de texto. |
| `spectrum(sequences, k)` | Distribución de k-mers por multiplicidad. |
| `estimate_genome_size(sequences, k)` | Estimación de tamaño de genoma (Lander-Waterman). |

> [!TIP]
> Los k-mers se codifican como enteros en base 4 (A=0, C=1, G=2, T=3). Con `canonical=True` se cuenta cada k-mer junto a su reverse complement, lo que evita dobles conteos en datos de doble hebra.

### VariantCaller

Pileup y llamada de variantes acelerado por GPU.

| Método | Descripción |
|---|---|
| `pileup(reference, reads)` | Cobertura y conteos de bases por posición. |
| `call_variants(reference, reads, ...)` | Llama SNVs y deleciones con umbrales de profundidad y frecuencia. |

> [!IMPORTANT]
> El caller asume lecturas ya alineadas a la referencia: cada `Read` indica su secuencia, la posición 0-based de inicio y la hebra (`+`/`-`). Las posiciones reportadas en las variantes son 1-based.

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

### LinearMixedModel

Modelos lineales mixtos univariantes para genética cuantitativa sobre GPU. Ajusta el modelo animal `y = Xβ + Zu + ε` con u ~ N(0, σg²K), estima las componentes de varianza por REML o ML (puntuación de Fisher con búsqueda de línea) y predice los efectos aleatorios con BLUP.

| Método | Descripción |
|---|---|
| `fit(y, X, K, Z=None, method)` | Ajusta el modelo; devuelve `LMMResult` con varianzas genética/residual, heredabilidad, log-verosimilitud e iteraciones. |
| `blue()` | Estimadores BLUE de los efectos fijos (β). |
| `blup()` | Valores de cría predichos BLUP de los efectos aleatorios (u). |
| `predict()` | Valores ajustados del modelo (Xβ + Zu). |

La función `build_kinship(genotypes)` construye la matriz de relación genómica (GRM) por el método de VanRaden a partir de dosis alélicas {0, 1, 2}, imputando los valores perdidos con la media del marcador:

```python
from Genoly import LinearMixedModel, build_kinship

grm = build_kinship(genotipos)             # (individuos x marcadores)
modelo = LinearMixedModel()                # auto-detecta CUDA
resultado = modelo.fit(fenotipos, X, grm)  # method="reml" por defecto
print(resultado.genetic_variance, resultado.heritability)
valores_cria = modelo.blup()
```

> [!IMPORTANT]
> El ajuste interno se realiza en doble precisión (float64) para garantizar la estabilidad numérica de la optimización, aunque el resto del paquete trabaje en float32. En GPUs de consumo esto es más lento, pero el coste es asumible: las operaciones son O(n³) sobre matrices de tamaño n = número de individuos.

> [!TIP]
> Con `Z=None` se usa el modelo animal estándar (Z igual a la identidad). Puedes pasar tu propia matriz Z (n x q) para modelar efectos aleatorios arbitrarios: efectos de grupo, medidas repetidas, etc.

> [!CAUTION]
> La matriz K debe ser simétrica y el diseño X debe tener menos columnas que observaciones; en caso contrario `fit()` lanza `ValueError`. Los métodos `blue()`, `blup()` y `predict()` requieren haber llamado antes a `fit()`.

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

- [x] Carga de archivos FASTQ/FASTA en streaming.
- [x] Análisis de calidad (scores Phred), trimming y filtrado.
- [x] Conteo de k-mers y espectro k-mer en GPU.
- [x] Llamada de variantes (SNV/deleciones) en GPU.
- [x] Genética cuantitativa: modelos lineales mixtos (REML/ML) y BLUP sobre GPU.
- [x] Auto-detección de la GPU e instalación automática de PyTorch CUDA.
- [x] Despliegue en contenedor Docker (API + frontend, CUDA opcional).
- [ ] Soporte real de paralelización por lotes en GPU para el alineador.
- [ ] Llamada de inserciones mediante CIGAR (lecturas alineadas).
- [ ] Procesamiento en streaming para datasets masivos (chunks GPU).
- [ ] Exportación a formatos estándar (SAM/BAM, VCF).

## Licencia

MIT

> [!NOTE]
> Este proyecto está en fase alpha (Development Status 3 - Alpha). Las APIs pueden cambiar en futuras versiones.