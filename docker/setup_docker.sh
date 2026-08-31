#!/usr/bin/env bash
# Script: docker/setup_docker.sh
# Monta el contenedor de Genoly-GPU de forma automatica y robusta (Linux).
# Lanza el contenedor con acceso a las GPUs NVIDIA del equipo (--gpus /
# reserva de dispositivos de Compose) y verifica que PyTorch las vea.
# Uso: ./setup_docker.sh [--cpu | --gpu | --gpu-id N] [--puerto N] [--sin-cache] [--solo-comprobar] [--list] [--ayuda]

set -u -o pipefail

IMAGEN_CPU="genoly-gpu:cpu-latest"
IMAGEN_GPU="genoly-gpu:gpu-latest"

PUERTO="8000"
GPU_ID=""
MODO_CPU=0
SIN_CACHE=0
SOLO_COMPROBAR=0

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { printf "\n${CYAN}==>${NC} ${CYAN}%s${NC}\n" "$1"; }
ok()   { printf "  ${GREEN}OK${NC} %s\n" "$1"; }
warn() { printf "  ${YELLOW}AVISO:${NC} %s\n" "$1"; }
fail() { printf "\n${RED}ERROR:${NC} %s\n" "$1" >&2; exit 1; }

preguntar() {
    [ -t 0 ] || return 1
    local r
    read -r -p "$1 [s/N] " r
    [[ "${r,,}" == s* ]]
}

uso() {
    cat <<'USO'
Montaje automatico y robusto del contenedor de Genoly-GPU (Linux)

Uso: ./setup_docker.sh [OPCIONES]

Opciones:
  --gpu          Modo GPU con todas las tarjetas (por defecto si hay NVIDIA)
  --gpu-id N     Usar solo la GPU con indice N
  --cpu          Modo CPU (sin GPU)
  --puerto N     Puerto del host y del contenedor (por defecto 8000)
  --sin-cache    Reconstruir la imagen sin usar cache
  --solo-comprobar  Ejecutar solo las comprobaciones del entorno (diagnostico)
  --list         Listar las GPUs detectadas y salir
  --ayuda, -h    Mostrar esta ayuda

Ejemplos:
  ./setup_docker.sh                    # GPU (todas) o error si no hay NVIDIA
  ./setup_docker.sh --gpu-id 1         # Solo la GPU 1
  ./setup_docker.sh --cpu --puerto 8010
USO
}

trap 'c=$?; if [ "$c" -ne 0 ]; then printf "\n${RED}Montaje interrumpido (codigo %s). Revisa los mensajes anteriores y reejecuta el script.${NC}\n" "$c" >&2; fi' EXIT

while [ $# -gt 0 ]; do
    case "$1" in
        --cpu) MODO_CPU=1 ;;
        --gpu) : ;;
        --gpu-id) [ $# -ge 2 ] || fail "La opcion --gpu-id requiere un indice"; GPU_ID="$2"; shift ;;
        --gpu-id=*) GPU_ID="${1#*=}" ;;
        --puerto) [ $# -ge 2 ] || fail "La opcion --puerto requiere un numero"; PUERTO="$2"; shift ;;
        --puerto=*) PUERTO="${1#*=}" ;;
        --sin-cache) SIN_CACHE=1 ;;
        --solo-comprobar) SOLO_COMPROBAR=1 ;;
        --list)
            nvidia-smi --query-gpu=index,name,memory.total,memory.free,driver_version --format=csv,noheader 2>/dev/null \
                || echo "No se detectaron GPUs NVIDIA (o nvidia-smi no esta disponible)."
            exit 0 ;;
        --ayuda|-h) uso; exit 0 ;;
        *) uso >&2; fail "Argumento desconocido: $1" ;;
    esac
    shift
done

[[ "$PUERTO" =~ ^[0-9]+$ ]] || fail "Puerto invalido: $PUERTO"
if [ -n "$GPU_ID" ]; then
    [[ "$GPU_ID" =~ ^[0-9]+$ ]] || fail "Indice de GPU invalido: $GPU_ID"
fi

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$DIR_SCRIPT/.." && pwd)"
[ -f "$DIR_SCRIPT/Dockerfile" ] || fail "No se encuentra docker/Dockerfile"
[ -f "$RAIZ/requirements.txt" ] || fail "No se encuentra requirements.txt en la raiz del proyecto"
cd "$RAIZ"

MODO="cpu"
IMAGEN="$IMAGEN_CPU"
SERVICIO="genoly-cpu"
NOMBRE="genoly-gpu-cpu"
PERFIL=()
if [ "$MODO_CPU" -eq 0 ]; then
    MODO="gpu"
    IMAGEN="$IMAGEN_GPU"
    SERVICIO="genoly-gpu"
    NOMBRE="genoly-gpu-gpu"
    PERFIL=(--profile gpu)
    if [ -n "$GPU_ID" ]; then
        MODO="gpu-select"
        SERVICIO="genoly-gpu-selected"
        NOMBRE="genoly-gpu-gpu-$GPU_ID"
        PERFIL=(--profile gpu-select)
    fi
fi

printf "${CYAN}=========================================${NC}\n"
printf "${CYAN}  Montaje Docker de Genoly-GPU (modo %s)${NC}\n" "$MODO"
printf "${CYAN}=========================================${NC}\n"

# ---------------------------------------------------------------- 1. Docker
info "1/8 Comprobando Docker..."
command -v docker >/dev/null 2>&1 \
    || fail "Docker no esta instalado. Instalalo con: curl -fsSL https://get.docker.com | sh    y reejecuta el script"

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
    if sudo -n docker info >/dev/null 2>&1; then
        DOCKER=(sudo docker)
        warn "Tu usuario no accede al demonio de Docker: se usara sudo"
    else
        fail "El demonio Docker no esta accesible. Prueba: sudo systemctl start docker    y da permisos a tu usuario: sudo usermod -aG docker \$USER (cierra sesion y vuelve)"
    fi
fi
ok "Docker activo ($("${DOCKER[@]}" --version 2>/dev/null | head -n1))"

COMPOSE=()
if "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    COMPOSE=("${DOCKER[@]}" compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    warn "Docker Compose no disponible: se usara docker build/run directo"
fi
if [ "${#COMPOSE[@]}" -gt 0 ] && [ ! -f "$DIR_SCRIPT/docker-compose.yml" ]; then
    warn "No se encuentra docker/docker-compose.yml: se usara docker build/run directo"
    COMPOSE=()
fi

# ------------------------------------------- 2. Contenedores previos y puerto
info "2/8 Liberando contenedores anteriores y el puerto $PUERTO..."
VIEJOS=$("${DOCKER[@]}" ps -aq --filter "name=^genoly-gpu" 2>/dev/null || true)
if [ -n "$VIEJOS" ]; then
    warn "Eliminando $(wc -l <<< "$VIEJOS") contenedor(es) anterior(es) de Genoly"
    "${DOCKER[@]}" rm -f $VIEJOS >/dev/null 2>&1 || true
fi
if (exec 3<>"/dev/tcp/127.0.0.1/$PUERTO") 2>/dev/null; then
    exec 3>&- 3<&-
    fail "El puerto $PUERTO esta ocupado por otro proceso. Usa otro puerto: ./setup_docker.sh --puerto 8010"
fi
ok "Puerto $PUERTO libre y contenedores anteriores retirados"

# -------------------------------------------------------------- 3. GPU host
info "3/8 Comprobando la GPU NVIDIA del equipo..."
if [ "$MODO_CPU" -eq 1 ]; then
    warn "Modo CPU forzado con --cpu"
else
    command -v nvidia-smi >/dev/null 2>&1 \
        || fail "nvidia-smi no encontrado: instala el driver NVIDIA y reinicia el equipo, o reejecuta con --cpu"
    nvidia-smi --query-gpu=index,name,memory.total,driver_version --format=csv,noheader 2>/dev/null \
        || fail "nvidia-smi esta instalado pero no responde: revisa la instalacion del driver, o reejecuta con --cpu"
    ok "Driver NVIDIA accesible"
fi

# ----------------------------------------------- 4. Toolkit NVIDIA en Docker
if [ "$MODO_CPU" -eq 0 ]; then
    info "4/8 Comprobando soporte NVIDIA en Docker (NVIDIA Container Toolkit)..."
    if docker info 2>/dev/null | grep -qi nvidia; then
        ok "Runtime NVIDIA detectado en Docker"
    else
        warn "Docker no reporta el runtime NVIDIA: falta el NVIDIA Container Toolkit o no esta configurado"
        if preguntar "Quieres instalarlo y configurarlo ahora (necesita sudo)?"; then
            if command -v apt-get >/dev/null 2>&1; then
                command -v curl >/dev/null 2>&1 \
                    || fail "Se necesita curl para configurar el repositorio NVIDIA. Instalalo con: sudo apt-get install -y curl"
                if ! apt-cache show nvidia-container-toolkit >/dev/null 2>&1; then
                    info "Configurando el repositorio NVIDIA (el paquete no esta en los repos actuales)..."
                    sudo install -m 0755 -d /etc/apt/keyrings \
                        && curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg \
                        && curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null \
                        || fail "No se pudo configurar el repositorio NVIDIA. Guia manual: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
                    sudo apt-get update
                fi
                sudo apt-get install -y nvidia-container-toolkit \
                    || fail "No se pudo instalar nvidia-container-toolkit con apt. Guia manual: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
            elif command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y nvidia-container-toolkit \
                    || fail "No se pudo instalar nvidia-container-toolkit con dnf. Guia manual: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
            else
                fail "Gestor de paquetes no soportado (se esperaba apt o dnf). Guia manual: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
            fi
            sudo nvidia-ctk runtime configure --runtime=docker \
                || warn "nvidia-ctk no pudo configurar el runtime de Docker; revisa /etc/docker/daemon.json"
            if command -v systemctl >/dev/null 2>&1; then
                sudo systemctl restart docker || warn "No se pudo reiniciar Docker: hazlo a mano con sudo systemctl restart docker"
            fi
            if docker info 2>/dev/null | grep -qi nvidia; then
                ok "Runtime NVIDIA activo en Docker"
            else
                warn "Docker aun no muestra el runtime NVIDIA: se intentara lanzar igualmente"
            fi
        else
            fail "Sin el NVIDIA Container Toolkit el contenedor no puede usar la GPU. Instalalo y reejecuta este script, o usa --cpu. Guia: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
        fi
    fi
fi

# -------------------------------------------------------- 5. Espacio disco
info "5/8 Comprobando espacio en disco..."
RAIZ_DOCKER=$("${DOCKER[@]}" info --format '{{.DockerRootDir}}' 2>/dev/null || echo "/")
LIBRE_KB=$(df -Pk "$RAIZ_DOCKER" 2>/dev/null | awk 'NR==2 {print $4}' || true)
LIBRE_KB=${LIBRE_KB:-0}
LIBRE_GB=$((LIBRE_KB / 1024 / 1024))
if [ "$LIBRE_GB" -lt 10 ]; then
    warn "Espacio libre en $RAIZ_DOCKER: ${LIBRE_GB} GB (la imagen GPU necesita unos 10-15 GB)"
else
    ok "Espacio libre en $RAIZ_DOCKER: ${LIBRE_GB} GB"
fi

if [ "$SOLO_COMPROBAR" -eq 1 ]; then
    ok "Comprobaciones superadas (modo diagnostico: no se construira ni lanzara nada)"
    exit 0
fi

# ------------------------------------------------------------- 6. Build
export GENOLY_PORT="$PUERTO"
[ -n "$GPU_ID" ] && export GPU_ID
FLAGS_BUILD=()
[ "$SIN_CACHE" -eq 1 ] && FLAGS_BUILD+=(--no-cache)

info "6/8 Construyendo la imagen (modo $MODO; la primera vez descarga varios GB de PyTorch/CUDA)..."
if [ "${#COMPOSE[@]}" -gt 0 ]; then
    if ! "${COMPOSE[@]}" -f "$DIR_SCRIPT/docker-compose.yml" "${PERFIL[@]}" build "${FLAGS_BUILD[@]}" "$SERVICIO"; then
        fail "Fallo la construccion con Compose. Reproduce el error a mano con: ${COMPOSE[*]} -f $DIR_SCRIPT/docker-compose.yml ${PERFIL[*]} build --no-cache $SERVICIO"
    fi
    ok "Imagen construida con Compose"
else
    MODO_IMAGEN="cpu"
    [ "$MODO_CPU" -eq 0 ] && MODO_IMAGEN="gpu"
    if ! "${DOCKER[@]}" build "${FLAGS_BUILD[@]}" --build-arg "GENOLY_GPU_MODE=$MODO_IMAGEN" -t "$IMAGEN" -f "$DIR_SCRIPT/Dockerfile" "$RAIZ"; then
        fail "Fallo docker build. Reproduce el error a mano con: docker build --no-cache --build-arg GENOLY_GPU_MODE=$MODO_IMAGEN -t $IMAGEN -f $DIR_SCRIPT/Dockerfile $RAIZ"
    fi
    ok "Imagen construida con docker build"
fi

# ------------------------------------------------------------- 7. Lanzar
info "7/8 Lanzando el contenedor con acceso a las GPUs del sistema..."
if [ "${#COMPOSE[@]}" -gt 0 ]; then
    if ! "${COMPOSE[@]}" -f "$DIR_SCRIPT/docker-compose.yml" "${PERFIL[@]}" up -d "$SERVICIO"; then
        fail "Fallo al lanzar el servicio con Compose. Si el error menciona 'could not select device driver', falta el NVIDIA Container Toolkit (paso 4). Logs: ${COMPOSE[*]} -f $DIR_SCRIPT/docker-compose.yml logs $SERVICIO"
    fi
else
    RUN=(-d --name "$NOMBRE" -p "${PUERTO}:${PUERTO}" -e "GENOLY_PORT=${PUERTO}" --restart unless-stopped)
    if [ "$MODO_CPU" -eq 0 ]; then
        RUN+=(--gpus all -e NVIDIA_VISIBLE_DEVICES=all -e NVIDIA_DRIVER_CAPABILITIES=compute,utility)
        if [ -n "$GPU_ID" ]; then
            RUN+=(-e "CUDA_VISIBLE_DEVICES=${GPU_ID}")
        else
            RUN+=(-e CUDA_VISIBLE_DEVICES=all)
        fi
    fi
    RUN+=("$IMAGEN")
    if ! "${DOCKER[@]}" "${RUN[@]}"; then
        fail "Fallo docker run. Si el error menciona 'could not select device driver', falta el NVIDIA Container Toolkit. Revisa: ${DOCKER[*]} logs $NOMBRE"
    fi
fi
ok "Contenedor '$NOMBRE' lanzado"

# ---------------------------------------------------------- 8. Verificacion
info "8/8 Verificando el servicio y la GPU dentro del contenedor..."
LISTO=0
for _ in $(seq 1 30); do
    if "${DOCKER[@]}" exec "$NOMBRE" python -c "pass" >/dev/null 2>&1; then
        LISTO=1
        break
    fi
    sleep 2
done
[ "$LISTO" -eq 1 ] || fail "El contenedor no responde tras 60 s. Logs: ${DOCKER[*]} logs --tail 50 $NOMBRE"
ok "Servicio Python operativo dentro del contenedor"

if [ "$MODO_CPU" -eq 0 ]; then
    CODIGO_GPU=$'import torch, sys\nprint("PyTorch:", torch.__version__)\nok = torch.cuda.is_available()\nprint("CUDA disponible:", ok)\nif ok:\n    print("GPU visible:", torch.cuda.get_device_name(0))\n    t = torch.randn(1024, 1024, device="cuda")\n    print("Tensor de prueba en GPU:", tuple(t.shape))\nsys.exit(0 if ok else 1)\n'
    if ! "${DOCKER[@]}" exec "$NOMBRE" python -c "$CODIGO_GPU"; then
        "${DOCKER[@]}" exec "$NOMBRE" nvidia-smi 2>&1 | head -n 15 || true
        fail "PyTorch no ve la GPU dentro del contenedor. Comprueba: 1) nvidia-smi funciona en el host, 2) el NVIDIA Container Toolkit esta instalado y Docker reiniciado, 3) si usas WSL2: wsl --update"
    fi
    ok "GPU accesible desde el contenedor"
else
    "${DOCKER[@]}" exec "$NOMBRE" python -c 'import torch; print("PyTorch (CPU):", torch.__version__)' \
        || warn "No se pudo importar torch dentro del contenedor"
fi

"${DOCKER[@]}" exec "$NOMBRE" python -c 'import os, urllib.request; print("API /api/health ->", urllib.request.urlopen(f"http://127.0.0.1:{os.environ[\"GENOLY_PORT\"]}/api/health", timeout=5).status)' \
    || warn "La API aun no responde dentro del contenedor; mira los logs: ${DOCKER[*]} logs $NOMBRE"

printf "\n${GREEN}=========================================${NC}\n"
printf "${GREEN}  Genoly-GPU montado en Docker (modo %s)${NC}\n" "$MODO"
printf "${GREEN}=========================================${NC}\n"
cat <<RESUMEN

  Interfaz web y API : http://localhost:$PUERTO  (documentacion en /docs)
  Consola interactiva: ${DOCKER[*]} exec -it $NOMBRE bash
  Logs               : ${DOCKER[*]} logs -f $NOMBRE
  Copiar datos       : ${DOCKER[*]} cp archivo.fa $NOMBRE:/tmp/
  Parar y eliminar   : ${DOCKER[*]} rm -f $NOMBRE
  (${COMPOSE[*]:-} si usas Compose: ${COMPOSE[*]} -f $DIR_SCRIPT/docker-compose.yml ${PERFIL[*]} down)
RESUMEN
