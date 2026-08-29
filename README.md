# Genoly-GPU

Software de aceleración por tecnología de GPU (NVIDIA por ahora) para el análisis de grandes datos del genoma.

Genoly-GPU ofrece las herramientas de un pipeline de genómica estándar —I/O de FASTA/FASTQ, control de calidad, conteo de k-mers, alineamiento, codificación a tensores y llamada de variantes— todo acelerado por GPUs NVIDIA a través de PyTorch y CUDA.

## Caracteristicas

- **Pipeline de streaming para archivos multi-GB**: lectura por bloques de disco (64 KiB), RAM batching de registros, micro-lotes adaptativos de GPU según la VRAM libre y liberación de memoria tras cada micro-lote. Procesa genomas completos sin OOM (ver [Pipeline de streaming](#pipeline-de-streaming-archivos-multi-gb)).
- Lectura/escritura de FASTA y FASTQ en streaming (consumo de memoria reducido), con soporte de FASTQ multi-registro y multilínea Illumina.
- Codificación de secuencias a tensores enteros y one-hot sobre GPU.
- Control de calidad: contenido GC, composición de bases y distribución de calidad Phred, con trimming y filtrado de lecturas.
- Conteo de k-mers y espectro k-mer acelerado por GPU (codificación base-4 entera en int64, exacta hasta k=31), con estimación de tamaño de genoma (Lander-Waterman).
- Pileup y llamada de variantes (SNV y deleciones) sobre GPU mediante operaciones de dispersión.
- Genética cuantitativa sobre GPU: modelos lineales mixtos (LMM) con estimación REML/ML, matriz de parentesco genómica (VanRaden o GCTA) y predicción de valores de cría (BLUP).
- Predicción genómica GBLUP en un paso con varianzas conocidas o estimadas por REML, incluyendo fiabilidad y precisión por individuo (PEV).
- Carga de tablas CSV o Excel con preprocesamiento: detección de cabecera y delimitador, conversión de decimales con coma, limpieza de columnas/filas no válidas e imputación de dosis perdidas por media o moda.
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
│   │   ├── gpu_setup.py          # Auto-detección nvidia-smi e instalación de PyTorch CUDA
│   │   └── vram.py               # VRAMManager: micro-batching adaptativo y VRAM dinámica
│   ├── io/
│   │   ├── fasta.py              # FASTA por bloques de disco, lotes de RAM y ventanas
│   │   └── fastq.py              # Lectura/escritura FASTQ con calidad Phred
│   ├── encoding/
│   │   └── encoder.py            # Codificación a tensores enteros y one-hot (+ encode_stream)
│   ├── qc/
│   │   └── quality.py            # GC content, composición, calidad y filtrado
│   ├── kmer/
│   │   └── kmers.py              # Conteo de k-mers en GPU (+ streaming count_stream/count_fasta)
│   ├── variants/
│   │   └── caller.py             # Pileup y llamada de variantes en GPU
│   ├── quantitative/
│   │   ├── lmm.py                # LinearMixedModel: fachada LMM (REML/ML + BLUP)
│   │   ├── grm.py                # Matriz de parentesco genómica (VanRaden, GCTA)
│   │   ├── reml.py               # Estimación REML/ML por puntuación de Fisher
│   │   ├── gblup.py              # GenomicBLUP con fiabilidad y precisión
│   │   ├── preprocess.py         # Carga CSV/Excel con limpieza e imputación
│   │   └── utils.py              # Validación de datos y Cholesky regularizada
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
│   ├── test_smoke.py             # Tests de humo de todos los módulos
│   └── test_streaming.py         # Tests del pipeline de streaming (RAM/VRAM acotadas)
├── ui/
│   ├── backend/                  # API REST FastAPI
│   │   ├── main.py
│   │   ├── jobs.py               # Trabajos de fondo con progreso en tiempo real
│   │   ├── uploads.py            # Gestión de archivos subidos
│   │   └── routers/              # device, qc, kmer, variants, quantitative, gblup, upload, jobs
│   └── frontend/                 # UI React + Vite + Tailwind
│       └── src/                  # páginas y componentes
├── fetchingfasta.py              # Descarga de FASTA desde NCBI por accession
├── clean_fetching.py             # Descarga de FASTA desde una URL directa
├── descargar_datos_test.py       # Descarga datos reales para pruebas (datos_reales/, ignorado)
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
| `/quantitative` | Genética cuantitativa: LMM (REML/ML) y valores de cría BLUP. |
| `/gblup` | Predicción genómica GBLUP con fiabilidad y precisión por individuo. |

Además, los análisis de larga duración sobre archivos subidos se ejecutan como **trabajos de fondo con progreso en tiempo real**:

| Endpoint | Funcionalidad |
|---|---|
| `POST /api/kmer/count-async` | Encola el conteo de k-mers y devuelve un `job_id`. |
| `GET /api/jobs/{id}` | Estado y resultado del trabajo (JSON, para polling). |
| `GET /api/jobs/{id}/events` | Progreso en tiempo real vía **Server-Sent Events** (registros/bases leídas, micro-lotes GPU). |

### Puesta en marcha

Requisitos: Node.js 18+ y las dependencias de Python (ver arriba).

```bash
# 1. Backend (FastAPI + uvicorn) — desde la RAÍZ del proyecto
pip install -r ui/backend/requirements.txt
python -m uvicorn ui.backend.main:app --host 0.0.0.0 --port 8000
# Documentación de la API: http://localhost:8000/docs

# 1b. Alternativa desde ui/backend (con su propio .venv)
#     el bootstrap de main.py añade la raíz al sys.path automáticamente
cd ui/backend
uvicorn main:app --host 0.0.0.0 --port 8000

# 2. Frontend (dev con hot-reload)
cd ui/frontend
npm install
npm run dev        # http://localhost:5173

# 3. Producción: compilar y servir desde el backend
npm run build      # genera ui/frontend/dist
# el backend sirve el frontend compilado en http://localhost:8000
```

> [!IMPORTANT]
> **No uses `--workers` mayor que 1.** El estado de los trabajos de fondo y sus streams de progreso SSE viven en la memoria del proceso: con varios workers, el `POST` que crea el trabajo podría aterrizar en un proceso y el `GET` de eventos en otro (404). Además, cada proceso ejecutaría análisis GPU en paralelo compitiendo por la misma VRAM, anulando el micro-batching adaptativo. La concurrencia ya se gestiona dentro del proceso (los trabajos GPU se serializan y las peticiones HTTP no bloquean el event loop); ajusta el paralelismo con la variable de entorno `GENOLY_MAX_WORKERS` si lo necesitas.

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
| openpyxl | >= 3.1 |

> [!NOTE]
> `openpyxl` solo se necesita para leer archivos de Excel (`.xlsx`/`.xls`) con el módulo de preprocesamiento; los CSV funcionan sin él.

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

## Pipeline de streaming (archivos multi-GB)

Para genomas completos y datos crudos de varios GB, Genoly-GPU procesa bajo demanda con RAM y VRAM acotadas sea cual sea el tamaño de la fuente:

```
FASTA en disco ──bloques 64 KiB──> registros/ventanas ──> LOTE DE RAM (batch_size)
                                                                       │
                                              VRAMManager.plan_micro_batches()
                                                                       │
                                                            MICRO-LOTE GPU (n * L_max * b <= presupuesto)
                                                                       │
                                              gc.collect() + torch.cuda.empty_cache()
```

- **Archivo → RAM**: `FastaReader` lee por bloques de disco (64 KiB) y reconstruye los registros sin cargar el archivo. `iter_batches(batch_size)` agrupa registros (RAM batching); `iter_windows(w, overlap)` y `iter_windows_codes(w, overlap)` emiten ventanas (texto o códigos uint8 vectorizados) sin materializar ni siquiera un registro; `scan_stats` cuenta registros/bases vectorizadamente.
- **RAM → VRAM**: `VRAMManager` divide cada lote en micro-lotes que caben en una fracción segura (25 % por defecto) de la VRAM libre, y tras cada micro-lote libera memoria (`gc.collect()` + `torch.cuda.empty_cache()`).
- **Agregación**: en genomas reales casi todos los k-mers son únicos y el resultado exacto puede pesar varios GB. `count_fasta_aggregated` reparte los conteos en 256 particiones por bits bajos, derrama a `.npy` y deduplica partición a partición en la GPU: resultado **exacto** con pico de RAM `O(total_únicos / 256)` — nunca materializa la lista completa de k-mers.

Los detalles de implementación (aritmética int32 de dos palabras, coste por base por etapa, límites matemáticos del planificador) están documentados en los docstrings de `Genoly/core/vram.py` y `Genoly/kmer/kmers.py`.

### Uso programático

```python
from Genoly import KmerCounter, FastaReader

kc = KmerCounter()

# Archivo FASTA de cualquier tamaño: RAM ~ lote de ventanas, VRAM ~ presupuesto
values, counts = kc.count_fasta("genoma_completo.fasta", k=31, canonical=True)

# Genomas completos con millones de k-mers únicos: estadísticas exactas
# (total, espectro, top-k) con RAM acotada por derrame a disco
resumen = kc.count_fasta_aggregated("cromosoma.fasta", k=21, canonical=True, top=25)
print(resumen["total_unique"], resumen["total_kmers"], resumen["top_kmers"][0])

# Iterable perezoso de secuencias (streaming manual)
values, counts = kc.count_stream(FastaReader("datos.fasta").iter_sequences(), k=21)

# Registros con progreso (registros y bases leídos)
values, counts = kc.count_records(
    FastaReader("datos.fasta").records(), k=21,
    on_progress=lambda info: print(info))
# -> {"stage": "kmer", "records": 120, "bases": 9600, "units_done": ...,
#     "bases_done": 9600, "micro_batches": 7, "window_size": 1048576}

# Codificación en streaming con micro-lotes adaptativos
from Genoly import SequenceEncoder
enc = SequenceEncoder()
for chunk in enc.encode_stream(FastaReader("datos.fasta").iter_batches(10_000)):
    ...  # chunk.tensor en GPU, chunk.lengths, chunk.indices
```

Los conteos del pipeline de streaming son **idénticos** a los de `count()` (verificado en `tests/test_streaming.py`), incluido el modo canónico y k=31.

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

Los tests de `tests/test_streaming.py` verifican la equivalencia exacta entre el pipeline de streaming y el conteo en memoria, la matemática del planificador de VRAM y el ventanado con solape `k-1`.

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

### VRAMManager

Gestión dinámica de VRAM: presupuesto por micro-lote, planificación adaptativa y liberación de memoria. En CPU usa la RAM libre del sistema como presupuesto. Ver [Pipeline de streaming](#pipeline-de-streaming-archivos-multi-gb) para los límites matemáticos.

| Método | Descripción |
|---|---|
| `free_bytes()` | Memoria libre del dispositivo (`torch.cuda.mem_get_info()` o RAM del sistema). |
| `budget_bytes()` | Presupuesto por micro-lote: `libre * safety_fraction` (por defecto 25 %). |
| `plan_micro_batches(lengths, bytes_per_base)` | Divide longitudes en grupos de índices que caben en el presupuesto. |
| `suggest_window_bases(bytes_per_base)` | Tamaño de ventana sugerido (objetivo 128 MiB, potencia de 2). |
| `release()` | Fuerza `gc.collect()` + `torch.cuda.empty_cache()`. |
| `stats()` | Instantánea de memoria para telemetría/logs. |

Las funciones `estimate_kmer_bytes_per_base(k, canonical)` y `estimate_encode_bytes_per_base(num_classes, one_hot)` calculan el coste `b` (bytes/base) de cada etapa para alimentar el planificador.

### SequenceEncoder

Codifica secuencias de ADN/ARN a tensores listos para GPU.

| Método | Descripción |
|---|---|
| `encode(sequences)` | Codifica un lote a tensor entero (B, L) + longitudes. |
| `encode_one_hot(sequences)` | Codifica un lote a one-hot (B, L, C). |
| `encode_stream(batches, one_hot)` | Micro-lotes adaptativos de GPU según la VRAM libre; libera memoria tras cada lote. |
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

Conteo de k-mers acelerado por GPU (codificación base-4 entera en int64, exacta hasta k=31).

| Método | Descripción |
|---|---|
| `count(sequences, k, canonical)` | Frecuencia de cada k-mer (canónico opcional). |
| `count_stream(sequences, k, ...)` | Conteo en streaming sobre un iterable perezoso, con RAM/VRAM acotadas. |
| `count_records(records, k, ...)` | Streaming sobre registros FASTA con progreso de la fuente. |
| `count_fasta(path, k, ...)` | Streaming directo del archivo (ventanas desde bloques de disco, sin materializar registros). |
| `count_fasta_aggregated(path, k, ...)` | Estadísticas exactas (total, espectro, top-k) con acumulador particionado y derrame a disco: procesa genomas completos en máquinas modestas. |
| `decode_kmer(code, k)` | Convierte un código entero a secuencia de texto. |
| `spectrum(sequences, k)` | Distribución de k-mers por multiplicidad. |
| `estimate_genome_size(sequences, k)` | Estimación de tamaño de genoma (Lander-Waterman). |

> [!TIP]
> Los k-mers se codifican como enteros en base 4 (A=0, C=1, G=2, T=3) mediante aritmética entera exacta, válida para todo k <= 31. Con `canonical=True` se cuenta cada k-mer junto a su reverse complement, lo que evita dobles conteos en datos de doble hebra.

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

La función `build_kinship(genotypes, method)` construye la matriz de relación genómica (GRM) a partir de dosis alélicas {0, 1, 2}, imputando los valores perdidos con la media del marcador. Admite dos métodos: `vanraden` (por defecto) y `gcta` (columnas estandarizadas, excluye marcadores monórficos):

```python
from Genoly import LinearMixedModel, build_kinship

grm = build_kinship(genotipos)             # (individuos x marcadores)
grm = build_kinship(genotipos, method="gcta")
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

### GenomicBLUP

Predicción genómica GBLUP sobre GPU. A diferencia de `LinearMixedModel`, permite fijar directamente las componentes de varianza (solución en un paso, sin iterar) y calcula la fiabilidad y la precisión de cada valor de cría a partir del error de predicción (PEV).

| Método | Descripción |
|---|---|
| `fit(y, X, K, Z=None, genetic_variance=None, residual_variance=None)` | Predice los valores de cría; si no se indican las varianzas, las estima por REML. Devuelve `GBLUPResult`. |
| `blup()` / `blue()` | Valores de cría genómicos (GEBV) / efectos fijos. |
| `reliabilities()` | Fiabilidad de cada individuo: 1 − PEV/Var(u), en [0, 1]. |
| `accuracies()` | Precisión de cada individuo (√fiabilidad). |
| `predict()` | Valores ajustados del modelo (Xβ + Zu). |

> [!NOTE]
> La fiabilidad usa el PEV del BLUP con efectos fijos **estimados** (β̂ se obtiene por BLUE): equivale al bloque inferior derecho de la inversa de las ecuaciones del modelo mixto de Henderson, es decir, PEV(u) = diag(G − GZ'PZG) con P = V⁻¹ − V⁻¹X(X'V⁻¹X)⁻¹X'V⁻¹ y G = σg²K. |

```python
from Genoly import GenomicBLUP

gblup = GenomicBLUP()
resultado = gblup.fit(fenotipos, X, grm,
                      genetic_variance=0.5, residual_variance=0.9)
print(resultado.variance_source)     # "dadas" o "reml"
print(gblup.blup(), gblup.accuracies())
```

### Preprocesamiento de CSV/Excel

`prepare_quantitative_data(path)` carga una tabla de fenotipos y genotipos (`.csv`, `.tsv`, `.txt`, `.xlsx` o `.xls`) aplicando la limpieza estándar antes del análisis: detección automática de cabecera y delimitador (coma, punto y coma o tabulador), conversión de decimales con coma, descarte de columnas no numéricas y de filas sin fenotipo, e imputación de dosis perdidas por media o moda.

```python
from Genoly import prepare_quantitative_data

fenotipos, genotipos, informe = prepare_quantitative_data("datos.csv", impute_method="media")
print(informe.final_rows, informe.imputed_cells, informe.dropped_columns)
```

> [!TIP]
> La primera columna numérica se interpreta como fenotipo y el resto como marcadores. Excel requiere `openpyxl` (incluido en requirements.txt); los CSV usan solo la librería estándar.

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

`descargar_datos_test.py` descarga datos **reales** para probar todos los análisis: genomas completos de NCBI (*E. coli* K-12 MG1655 y SARS-CoV-2 Wuhan-Hu-1), lecturas FASTQ reales de Illumina (datasets de prueba de nf-core) y el panel cuantitativo de maíz de GAPIT (fenotipos, genotipos numéricos y matriz de parentesco publicada):

```bash
python descargar_datos_test.py
# Deja todo en datos_reales/ (ignorada por git)
```

> [!TIP]
> La carpeta `datos_reales/` está en `.gitignore`: los datos descargados (~10 MB) nunca se suben al repositorio.

> [!CAUTION]
> Al descargar secuencias grandes desde NCBI, respeta los límites de uso de la API de E-utilities de NCBI (como máximo 3 solicitudes por segundo).

## Hoja de ruta

- [x] Carga de archivos FASTQ/FASTA en streaming.
- [x] Análisis de calidad (scores Phred), trimming y filtrado.
- [x] Conteo de k-mers y espectro k-mer en GPU.
- [x] Llamada de variantes (SNV/deleciones) en GPU.
- [x] Genética cuantitativa: modelos lineales mixtos (REML/ML) y BLUP sobre GPU.
- [x] Predicción genómica GBLUP con fiabilidad y precisión por individuo.
- [x] Carga de tablas CSV/Excel con limpieza e imputación de valores perdidos.
- [x] Auto-detección de la GPU e instalación automática de PyTorch CUDA.
- [x] Despliegue en contenedor Docker (API + frontend, CUDA opcional).
- [x] Pipeline de streaming para datasets masivos: chunking de disco, RAM batching, micro-batching adaptativo de VRAM y progreso en tiempo real (SSE).
- [ ] Soporte real de paralelización por lotes en GPU para el alineador.
- [ ] Llamada de inserciones mediante CIGAR (lecturas alineadas).
- [ ] Exportación a formatos estándar (SAM/BAM, VCF).

## Licencia

MIT

> [!NOTE]
> Este proyecto está en fase alpha (Development Status 3 - Alpha). Las APIs pueden cambiar en futuras versiones.