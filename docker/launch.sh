#!/bin/bash
# Lanzador inteligente para Genoly-GPU (bash)

set -e

DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd)"
DETECT_GPU_PY="$DIR_SCRIPT/detect_gpu.py"
cd "$DIR_SCRIPT"

PYTHON_BIN="$(command -v python3 || command -v python || true)"
[ -n "$PYTHON_BIN" ] || { echo "ERROR: se necesita python3 en el PATH"; exit 1; }

detect_gpu_mode() {
    "$PYTHON_BIN" "$DETECT_GPU_PY" --mode 2>/dev/null || echo "cpu"
}

list_gpus() {
    "$PYTHON_BIN" "$DETECT_GPU_PY" --list
}

best_gpu() {
    "$PYTHON_BIN" "$DETECT_GPU_PY" --best 2>/dev/null || echo -1
}

show_help() {
    cat << EOF
Lanzador inteligente para Genoly-GPU

Uso: $0 [OPCIONES]

Opciones:
  --cpu              Modo CPU
  --gpu              Modo GPU (todas)
  --gpu-id N         GPU específica (índice)
  --port N           Puerto (default: 8000)
  --list             Lista GPUs disponibles
  --help             Muestra ayuda

Ejemplos:
  $0 --cpu                    # Modo CPU
  $0 --gpu                    # Modo GPU (todas)
  $0 --gpu-id 1               # Usar GPU 1
  $0 --port 8080 --gpu        # Puerto 8080 con GPU
EOF
}

launch() {
    local mode="$1"
    local gpu_id="$2"
    local port="${3:-8000}"
    
    export GENOLY_PORT="$port"
    
    case "$mode" in
        cpu)
            CMD="docker compose up -d genoly-cpu"
            MSG="CPU"
            ;;
        gpu)
            CMD="docker compose --profile gpu up -d genoly-gpu"
            MSG="GPU (todas)"
            ;;
        gpu-select)
            export GPU_ID="$gpu_id"
            export CUDA_VISIBLE_DEVICES="$gpu_id"
            CMD="docker compose --profile gpu-select up -d genoly-gpu-selected"
            MSG="GPU $gpu_id"
            ;;
        *)
            echo "Modo invalido: $mode"
            return 1
            ;;
    esac
    
    echo "Lanzando Genoly-GPU en modo $MSG..."
    echo "   Comando: $CMD"
    
    eval $CMD
    echo "Contenedor iniciado en modo $MSG"
    echo "API disponible: http://localhost:$port"
}

# Argumentos
MODE=""
GPU_ID=""
PORT="8000"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --cpu) MODE="cpu"; shift ;;
        --gpu) MODE="gpu"; shift ;;
        --gpu-id) GPU_ID="$2"; MODE="gpu-select"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --list) list_gpus; exit 0 ;;
        --help|-h) show_help; exit 0 ;;
        *) echo "Opción desconocida: $1"; show_help; exit 1 ;;
    esac
done

# Si no se especificó modo, detectar automáticamente
if [ -z "$MODE" ]; then
    MODE=$(detect_gpu_mode)
    echo "Modo recomendado: ${MODE^^}"
    
    # Si hay GPUs, preguntar (solo en terminal interactiva)
    if [ "$MODE" = "gpu" ] && [ -t 0 ]; then
        list_gpus
        echo ""
        echo "Opciones:"
        echo "  [a] Usar TODAS las GPUs"
        echo "  [b] Usar la GPU con más VRAM libre (automático)"
        echo "  [c] Usar CPU"
        echo ""
        read -p "Selecciona (a/b/c): " choice || choice="a"
        
        case "$choice" in
            a|A) MODE="gpu" ;;
            b|B) GPU_ID=$(best_gpu); MODE="gpu-select" ;;
            c|C) MODE="cpu" ;;
            *) echo "Opción inválida, usando CPU"; MODE="cpu" ;;
        esac
    fi
fi

launch "$MODE" "$GPU_ID" "$PORT"