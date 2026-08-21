# CONTEXTO DEL PROYECTO — TRANSFER CONTEXT PARA IA

> [!IMPORTANT]
> Lee este documento COMPLETO antes de tocar cualquier cosa en el proyecto.
> Este archivo existe para que otra IA (o tú mismo) pueda trabajar en Genoly-GPU
> sin romper nada y sin hacer cambios inútiles.

---

## 1. Qué es el proyecto

**Genoly-GPU** es un software de análisis de genómica (grandes datos del genoma)
acelerado por **GPUs NVIDIA** usando **PyTorch + CUDA**. Incluye un pipeline
completo: I/O de FASTA/FASTQ, control de calidad, conteo de k-mers, alineamiento,
llamada de variantes y una interfaz web (React + FastAPI).

- Hardware de desarrollo: **RTX 3050 6GB** (compute capability 8.6).
- Driver NVIDIA: **591.59** — soporta CUDA **13.1**.
- Build de PyTorch instalada: **`torch 2.13.0+cu126`** + `torchvision 0.28.0+cu126`
  (instaladas con `--index-url https://download.pytorch.org/whl/cu126`).
- `torchaudio` se desinstaló por conflicto de versiones: **NO reinstalar**.

Si PyTorch no detecta la GPU (cae a CPU), ejecutar:
`python -m Genoly.core.gpu_setup` (detecta nvidia-smi y recomienda/instala la build).

---

## 2. Reglas de oro (LEER Y RESPETAR)

1. **Idioma**: todo el código, docstrings, comentarios y documentación están en
   **español**. Mantenerlo.
2. **Sin emojis** en el README ni en archivos de documentación (.md). El código
   nuevo tampoco debe incluir emojis.
3. El README usa **callouts de GitHub** (`> [!NOTE]`, `> [!IMPORTANT]`,
   `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`). Mantener el estilo.
4. **No añadir comentarios al código** salvo que el usuario lo pida.
5. **No commitear ni hacer push** salvo que el usuario lo pida explícitamente.
6. **Siempre ejecutar los tests** antes y después de cualquier cambio:
   `python tests/test_smoke.py` (esperado: 19 tests, OK).
7. Respetar el estilo existente: docstrings en español, tipado con type hints,
   dataclasses, f-strings.
8. Las operaciones pesadas deben ir al **dispositivo correcto**: usar
   `DeviceManager`/`SequenceEncoder` para auto-detectar CUDA. No forzar `.cpu()`
   en la lógica principal.
9. **No borrar módulos** aunque parezcan redundantes (p. ej. `alignment_wExa.py`).
   Es código legacy que el usuario conserva.
10. Si un cambio rompe la GPU (fallback a CPU), revisar
    `Genoly/core/gpu_setup.py` antes que asumir un bug del modelo.

---

## 3. Estructura de carpetas

```
Genoly-GPU/
├── .env/
│   └── contexto.md             # ESTE ARCHIVO (no commitear secretos aquí)
├── .gitignore
├── README.md
├── setup.py                    # setup del paquete pip (genoly-gpu)
├── setup_genoly.ps1            # script legacy de estructura (Windows)
├── requirements.txt            # deps de Python
├── fetchingfasta.py            # descarga FASTA desde NCBI (accession)
├── clean_fetching.py           # descarga FASTA desde URL directa
│
├── Genoly/                     # PAQUETE PRINCIPAL (núcleo de análisis)
│   ├── __init__.py             # expone la API pública (DeviceManager, ...)
│   ├── core/
│   │   ├── device.py           # DeviceManager, GPUInfo, get_device
│   │   └── gpu_setup.py        # GpuSetup: nvidia-smi + auto-instalación CUDA
│   ├── io/
│   │   ├── fasta.py            # FastaRecord, FastaReader, read/write_fasta
│   │   └── fastq.py            # FastqRecord, FastqReader, read/write_fastq
│   ├── encoding/
│   │   └── encoder.py          # SequenceEncoder (int + one-hot a tensores GPU)
│   ├── qc/
│   │   └── quality.py          # QualityAnalyzer, QualityReport
│   ├── kmer/
│   │   └── kmers.py            # KmerCounter (conteo k-mers en GPU)
│   ├── variants/
│   │   └── caller.py           # VariantCaller, Variant, Read, PileupResult
│   └── alignment/
│       ├── alignment.py        # GPUSequenceAligner (Smith-Waterman) — activo
│       └── alignment_wExa.py   # versión LEGACY (no tocar salvo que se pida)
│
├── ui/                         # INTERFAZ GRÁFICA (rama user-interface)
│   ├── backend/
│   │   ├── main.py             # app FastAPI (monta el frontend compilado)
│   │   ├── requirements.txt
│   │   └── routers/
│   │       ├── device.py       # GET /api/device, /api/setup
│   │       ├── qc.py           # POST /api/qc/analyze
│   │       ├── kmer.py         # POST /api/kmer/count
│   │       └── variants.py     # POST /api/variants/call
│   └── frontend/
│       ├── package.json
│       ├── vite.config.js      # proxy /api -> http://127.0.0.1:8000
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── index.html
│       └── src/
│           ├── main.jsx / App.jsx / api.js / index.css
│           ├── components/     # Layout.jsx (sidebar), ui.jsx (Card, StatCard...)
│           └── pages/          # Dashboard, Device, Qc, Kmer, Variants
│
├── examples/
│   ├── pipeline_completo.py    # demo del pipeline completo (I/O->QC->kmer->variantes)
│   ├── examp1.py               # demo del alineador
│   ├── analisis1.py            # análisis FASTA (Biopython)
│   ├── analisis2.py            # sitios de restricción (Biopython)
│   └── seqdump.txt             # 100 isoformas del gen BRCA1 (NO borrar)
│
└── tests/
    └── test_smoke.py           # 19 tests de humo (pytest o unittest)
```

---

## 4. Clases y módulos clave (no romper su API)

| Módulo | Clases / funciones | Uso |
|---|---|---|
| `Genoly/core/device.py` | `DeviceManager`, `GPUInfo`, `get_device` | Gestión de dispositivo (cuda/cpu). |
| `Genoly/core/gpu_setup.py` | `GpuSetup`, `recommend_cuda_tag` | Detección nvidia-smi + auto-instalación de PyTorch CUDA. |
| `Genoly/io/fasta.py` | `FastaReader`, `read_fasta`, `write_fasta`, `fasta_to_batches` | I/O FASTA en streaming. |
| `Genoly/io/fastq.py` | `FastqReader`, `read_fastq`, `write_fastq`, `fastq_to_batches` | I/O FASTQ (scores Phred). |
| `Genoly/encoding/encoder.py` | `SequenceEncoder` | Secuencias → tensores int/one-hot en GPU. |
| `Genoly/qc/quality.py` | `QualityAnalyzer`, `QualityReport` | GC content, composición, calidad Phred, trimming/filtrado. |
| `Genoly/kmer/kmers.py` | `KmerCounter` | Conteo/spectrum de k-mers (convolución 1D) + estimación de genoma. |
| `Genoly/variants/caller.py` | `VariantCaller`, `Variant`, `Read`, `PileupResult` | Pileup + llamada de SNV/DEL en GPU. |
| `Genoly/alignment/alignment.py` | `GPUSequenceAligner` | Smith-Waterman, variantes, CIGAR, benchmark. |
| `Genoly/__init__.py` | — | Exporta la API pública; **mantener los `__all__` coherentes**. |

---

## 5. Comandos útiles

```bash
# Tests (obligatorio antes/después de cambios)
python tests/test_smoke.py

# Pipeline completo (CPU o GPU según hardware)
python examples/pipeline_completo.py

# Comprobación de GPU y build de PyTorch
python -m Genoly.core.gpu_setup

# Backend de la UI (http://localhost:8000, docs en /docs)
python -m uvicorn ui.backend.main:app --host 0.0.0.0 --port 8000

# Frontend en desarrollo (hot-reload, http://localhost:5173)
cd ui/frontend
npm install
npm run dev

# Frontend en producción (genera ui/frontend/dist, que el backend sirve en /)
cd ui/frontend
npm run build
```

---

## 6. Convenciones y trampas conocidas (gotchas)

- **Git**: las ramas no admiten espacios → la UI vive en la rama **`user-interface`**
  (no `User Interface`). `main` contiene el núcleo de análisis.
- **`node_modules/` y `ui/frontend/dist/`** están en `.gitignore`: no commitearlos.
- **`.env`** está ignorado en `.gitignore` (sección "Environments"); este archivo
  (`contexto.md`) tiene una excepción `!.env/contexto.md` para que sí viaje con el repo.
- **`pantera`** es un dump HTML de NCBI (87 KB) y está ignorado: no es código.
- **`seqdump.txt`** son 100 isoformas de BRCA1: el ejemplo `pipeline_completo.py`
  usa SOLO la primera (NM_007294.4, 7.088 pb). No cambiar esa lógica sin avisar.
- **K-mers**: la codificación es base-4 (A=0, C=1, G=2, T=3) con convolución 1D.
  `k` está limitado a 31 (cabe en int64). `canonical=True` cuenta revcomp como una
  sola entidad (usa `min(code, rc)`).
- **Variantes**: `VariantCaller` asume lecturas YA alineadas (`Read(sequence, start, strand)`),
  `start` es 0-based y las posiciones reportadas son **1-based**. La llamada de
  **inserciones** aún NO está implementada (solo SNV y DEL). No afirmar lo contrario.
- **Deleciones**: heurística conservadora (región con depth 0 flanqueada por lecturas).
  Evitar volver al comportamiento agresivo anterior que reportaba gaps como deleciones.
- **GPU vs CPU**: todo auto-detecta con `DeviceManager`. En máquinas sin CUDA el
  pipeline funciona en CPU. No "arreglar" metiendo `.to('cuda')` a pelo.
- **`setup.py`**: el paquete se llama `genoly-gpu`. Los ejemplos agregan la raíz a
  `sys.path` (no requieren instalación previa). No eliminar esa lógica.
- **Legacy**: `alignment_wExa.py` contiene una versión antigua con `run_safe_demo()`.
  No eliminar, no "modernizar" sin orden explícita.

---

## 7. Hoja de ruta pendiente (ideas ya planteadas en el README)

- [ ] Paralelización real por lotes (batch) en GPU para el alineador Smith-Waterman.
- [ ] Llamada de inserciones mediante CIGAR (lecturas alineadas).
- [ ] Procesamiento en streaming para datasets masivos (chunks GPU).
- [ ] Exportación a formatos estándar (SAM/BAM, VCF).

---

## 8. Cómo trabajar aquí (checklist para la IA)

1. Leer este archivo + `README.md` antes de escribir código.
2. Revisar el módulo a tocar (`Genoly/...` o `ui/...`) para respetar su estilo.
3. Hacer el cambio mínimo y coherente con la arquitectura existente.
4. Ejecutar `python tests/test_smoke.py` y arreglar cualquier regresión.
5. Si es UI: verificar que `npm run build` compila y que la API responde.
6. No commitear ni crear ramas sin que el usuario lo pida.
7. Si hay duda sobre el propósito, PREGUNTAR antes de implementar.