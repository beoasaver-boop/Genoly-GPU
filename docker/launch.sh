#!/bin/bash
# Lanzador inteligente para Genoly-GPU (bash)
# Versión robusta con detección de errores y fallbacks

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Obtener el directorio raíz del proyecto
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DETECT_GPU_PY="$SCRIPT_DIR/detect_gpu.py"

# ============================================================
# FUNCIONES DE DETECCIÓN Y DIAGNÓSTICO
# ============================================================

check_nvidia_drivers() {
    echo -e "${BLUE}🔍 Verificando drivers NVIDIA...${NC}"
    if command -v nvidia-smi &> /dev/null; then
        if nvidia-smi &> /dev/null; then
            echo -e "${GREEN}✅ Drivers NVIDIA instalados y funcionando${NC}"
            nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1
            return 0
        else
            echo -e "${RED}❌ nvidia-smi existe pero no funciona. Posible problema de drivers.${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ nvidia-smi no encontrado. Drivers NVIDIA no instalados.${NC}"
        return 1
    fi
}

check_nvidia_container_toolkit() {
    echo -e "${BLUE}🔍 Verificando NVIDIA Container Toolkit...${NC}"
    if command -v nvidia-container-toolkit &> /dev/null; then
        echo -e "${GREEN}✅ NVIDIA Container Toolkit instalado${NC}"
        return 0
    elif docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✅ NVIDIA Container Toolkit funcionando (probado con Docker)${NC}"
        return 0
    else
        echo -e "${RED}❌ NVIDIA Container Toolkit no instalado o no funcionando${NC}"
        return 1
    fi
}

check_docker() {
    echo -e "${BLUE}🔍 Verificando Docker...${NC}"
    if command -v docker &> /dev/null; then
        if docker info &> /dev/null; then
            echo -e "${GREEN}✅ Docker instalado y funcionando${NC}"
            return 0
        else
            echo -e "${RED}❌ Docker instalado pero no funciona. ¿El servicio está corriendo?${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Docker no instalado${NC}"
        return 1
    fi
}

check_docker_compose() {
    echo -e "${BLUE}🔍 Verificando Docker Compose...${NC}"
    if docker compose version &> /dev/null; then
        echo -e "${GREEN}✅ Docker Compose (plugin) disponible${NC}"
        return 0
    elif command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}✅ Docker Compose (standalone) disponible${NC}"
        return 0
    else
        echo -e "${RED}❌ Docker Compose no disponible${NC}"
        return 1
    fi
}

check_gpu_availability() {
    echo -e "${BLUE}🔍 Verificando disponibilidad de GPUs para Docker...${NC}"
    if docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✅ GPUs disponibles para Docker${NC}"
        return 0
    else
        echo -e "${RED}❌ No se pueden usar GPUs con Docker${NC}"
        return 1
    fi
}

detect_gpu_mode() {
    if [[ -f "$DETECT_GPU_PY" ]]; then
        python3 "$DETECT_GPU_PY" --mode 2>/dev/null || echo "cpu"
    else
        echo "cpu"
    fi
}

list_gpus() {
    if [[ -f "$DETECT_GPU_PY" ]]; then
        python3 "$DETECT_GPU_PY" --list 2>/dev/null || echo "No se pudo detectar GPUs"
    else
        nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader 2>/dev/null || echo "No se pudo detectar GPUs"
    fi
}

best_gpu() {
    if [[ -f "$DETECT_GPU_PY" ]]; then
        python3 "$DETECT_GPU_PY" --best 2>/dev/null || echo -1
    else
        echo 0
    fi
}

# ============================================================
# FUNCIONES DE INSTALACIÓN
# ============================================================

install_nvidia_drivers() {
    echo -e "${YELLOW}📦 Instalando drivers NVIDIA...${NC}"
    echo -e "${YELLOW}Esto requiere permisos de sudo y puede tomar varios minutos.${NC}"
    
    sudo apt update
    sudo apt install -y nvidia-driver-535 nvidia-utils-535
    
    echo -e "${YELLOW}⚠️ Se requiere reiniciar el sistema para completar la instalación.${NC}"
    echo -e "${YELLOW}Después de reiniciar, ejecuta nuevamente este script.${NC}"
    read -p "¿Reiniciar ahora? (s/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        sudo reboot
    else
        echo -e "${YELLOW}Por favor reinicia manualmente cuando sea conveniente.${NC}"
    fi
}

install_nvidia_container_toolkit() {
    echo -e "${YELLOW}📦 Instalando NVIDIA Container Toolkit...${NC}"
    echo -e "${YELLOW}Esto requiere permisos de sudo.${NC}"
    
    # Para Ubuntu 22.04+
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
        && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    
    sudo apt-get update
    sudo apt-get install -y nvidia-container-toolkit
    sudo systemctl restart docker
    
    echo -e "${GREEN}✅ NVIDIA Container Toolkit instalado${NC}"
}

install_docker() {
    echo -e "${YELLOW}📦 Instalando Docker...${NC}"
    echo -e "${YELLOW}Esto requiere permisos de sudo.${NC}"
    
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    
    echo -e "${GREEN}✅ Docker instalado${NC}"
    echo -e "${YELLOW}⚠️ Es posible que necesites cerrar sesión y volver a abrirla para usar Docker sin sudo.${NC}"
}

# ============================================================
# FUNCIÓN DE DIAGNÓSTICO COMPLETO
# ============================================================

run_diagnostics() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   DIAGNÓSTICO DEL SISTEMA${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    local all_ok=true
    
    check_docker || all_ok=false
    check_docker_compose || all_ok=false
    check_nvidia_drivers || all_ok=false
    check_nvidia_container_toolkit || all_ok=false
    check_gpu_availability || all_ok=false
    
    echo -e "${BLUE}========================================${NC}"
    
    if $all_ok; then
        echo -e "${GREEN}✅ Todos los componentes están funcionando correctamente.${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️ Algunos componentes no están funcionando.${NC}"
        return 1
    fi
}

# ============================================================
# FUNCIÓN DE AUTO-REPARACIÓN
# ============================================================

auto_fix() {
    echo -e "${BLUE}🔧 Intentando reparar automáticamente...${NC}"
    
    local fixed=false
    
    # Verificar e instalar Docker
    if ! check_docker; then
        echo -e "${YELLOW}Instalando Docker...${NC}"
        install_docker
        fixed=true
    fi
    
    # Verificar Docker Compose
    if ! check_docker_compose; then
        echo -e "${YELLOW}Docker Compose no encontrado. Instalando plugin...${NC}"
        sudo apt update && sudo apt install -y docker-compose-plugin
        fixed=true
    fi
    
    # Verificar NVIDIA Container Toolkit
    if ! check_nvidia_container_toolkit; then
        if check_nvidia_drivers; then
            echo -e "${YELLOW}Instalando NVIDIA Container Toolkit...${NC}"
            install_nvidia_container_toolkit
            fixed=true
        else
            echo -e "${RED}❌ No se pueden instalar el NVIDIA Container Toolkit sin drivers NVIDIA.${NC}"
            echo -e "${YELLOW}¿Deseas instalar los drivers NVIDIA? (s/N)${NC}"
            read -p "> " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Ss]$ ]]; then
                install_nvidia_drivers
                fixed=true
            fi
        fi
    fi
    
    if $fixed; then
        echo -e "${GREEN}✅ Se aplicaron reparaciones. Ejecuta el script nuevamente.${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️ No se pudieron aplicar reparaciones automáticas.${NC}"
        return 1
    fi
}

# ============================================================
# FUNCIÓN DE AYUDA
# ============================================================

show_help() {
    cat << EOF
${BLUE}Lanzador inteligente para Genoly-GPU${NC}

Uso: $0 [OPCIONES]

Opciones:
  --cpu              Modo CPU (no requiere GPU)
  --gpu              Modo GPU (todas las GPUs disponibles)
  --gpu-id N         GPU específica (índice)
  --port N           Puerto (default: 8000)
  --list             Lista GPUs disponibles
  --diagnose         Ejecuta diagnóstico completo del sistema
  --fix              Intenta reparar problemas automáticamente
  --help             Muestra esta ayuda

Ejemplos:
  $0 --cpu                    # Modo CPU
  $0 --gpu                    # Modo GPU (todas)
  $0 --gpu-id 1               # Usar GPU 1
  $0 --port 8080 --gpu        # Puerto 8080 con GPU
  $0 --diagnose               # Diagnóstico completo
  $0 --fix                    # Reparación automática

${YELLOW}Nota:${NC} En modo GPU, si no se detectan drivers, se usará CPU automáticamente.
EOF
}

# ============================================================
# FUNCIÓN PRINCIPAL DE LANZAMIENTO
# ============================================================

launch() {
    local mode="$1"
    local gpu_id="$2"
    local port="${3:-8000}"
    
    export GENOLY_PORT="$port"
    
    # Cambiar al directorio raíz del proyecto
    cd "$PROJECT_ROOT"
    
    case "$mode" in
        cpu)
            CMD="docker compose -f docker/docker-compose.yml up -d genoly-cpu"
            MSG="CPU"
            ;;
        gpu)
            CMD="docker compose -f docker/docker-compose.yml --profile gpu up -d genoly-gpu"
            MSG="GPU (todas)"
            ;;
        gpu-select)
            export GPU_ID="$gpu_id"
            export CUDA_VISIBLE_DEVICES="$gpu_id"
            CMD="docker compose -f docker/docker-compose.yml --profile gpu-select up -d genoly-gpu-selected"
            MSG="GPU $gpu_id"
            ;;
        *)
            echo -e "${RED}❌ Modo inválido: $mode${NC}"
            return 1
            ;;
    esac
    
    echo -e "${BLUE}🚀 Lanzando Genoly-GPU en modo $MSG...${NC}"
    echo -e "   Comando: $CMD"
    echo -e "   Directorio: $(pwd)"
    
    if eval $CMD; then
        echo -e "${GREEN}✅ Contenedor iniciado en modo $MSG${NC}"
        echo -e "${GREEN}🌐 API disponible: http://localhost:$port${NC}"
        echo -e "${YELLOW}📋 Para ver logs: docker logs -f genoly-gpu-gpu${NC}"
        return 0
    else
        echo -e "${RED}❌ Error al iniciar el contenedor${NC}"
        return 1
    fi
}

# ============================================================
# PROCESAMIENTO DE ARGUMENTOS
# ============================================================

MODE=""
GPU_ID=""
PORT="8000"
DIAGNOSE=false
FIX=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --cpu) MODE="cpu"; shift ;;
        --gpu) MODE="gpu"; shift ;;
        --gpu-id) GPU_ID="$2"; MODE="gpu-select"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --list) list_gpus; exit 0 ;;
        --diagnose) DIAGNOSE=true; shift ;;
        --fix) FIX=true; shift ;;
        --help|-h) show_help; exit 0 ;;
        *) echo -e "${RED}❌ Opción desconocida: $1${NC}"; show_help; exit 1 ;;
    esac
done

# ============================================================
# EJECUCIÓN
# ============================================================

# Si se solicita diagnóstico
if $DIAGNOSE; then
    run_diagnostics
    exit $?
fi

# Si se solicita reparación
if $FIX; then
    auto_fix
    exit $?
fi

# Verificar requisitos mínimos
if ! check_docker; then
    echo -e "${YELLOW}⚠️ Docker no está instalado o no funciona.${NC}"
    echo -e "${YELLOW}Ejecuta: $0 --fix para intentar reparar.${NC}"
    exit 1
fi

if ! check_docker_compose; then
    echo -e "${YELLOW}⚠️ Docker Compose no está disponible.${NC}"
    echo -e "${YELLOW}Ejecuta: $0 --fix para intentar reparar.${NC}"
    exit 1
fi

# Si se especificó GPU y no se detectan drivers, cambiar a CPU
if [[ "$MODE" == "gpu" ]] || [[ "$MODE" == "gpu-select" ]]; then
    echo -e "${BLUE}🔍 Verificando soporte GPU...${NC}"
    
    if ! check_gpu_availability; then
        echo -e "${YELLOW}⚠️ No se detectó soporte para GPU en Docker.${NC}"
        echo -e "${YELLOW}🔄 Cambiando a modo CPU automáticamente...${NC}"
        MODE="cpu"
        echo -e "${YELLOW}💡 Para usar GPU, instala el NVIDIA Container Toolkit con: $0 --fix${NC}"
    else
        echo -e "${GREEN}✅ GPU disponible y funcionando${NC}"
    fi
fi

# Si no se especificó modo, detectar automáticamente
if [ -z "$MODE" ]; then
    echo -e "${BLUE}🔍 Detectando modo óptimo...${NC}"
    
    if check_gpu_availability; then
        echo -e "${GREEN}✅ GPU detectada. Usando modo GPU.${NC}"
        MODE="gpu"
    else
        echo -e "${YELLOW}⚠️ No se detectó GPU. Usando modo CPU.${NC}"
        MODE="cpu"
    fi
fi

# Lanzar el servicio
launch "$MODE" "$GPU_ID" "$PORT"