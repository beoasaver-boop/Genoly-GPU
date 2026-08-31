# Script: docker/setup_docker.ps1
# Monta el contenedor de Genoly-GPU de forma automatica y robusta (Windows, Docker Desktop).
# Lanza el contenedor con acceso a las GPUs NVIDIA del equipo (--gpus) y verifica
# que PyTorch las vea desde dentro.
# Ejecutar: powershell -ExecutionPolicy Bypass -File .\docker\setup_docker.ps1 [-Cpu] [-GpuId N] [-Puerto N] [-SinCache] [-Listar] [-Ayuda]

param(
    [switch]$Cpu,
    [switch]$Gpu,
    [int]$GpuId = -1,
    [int]$Puerto = 8000,
    [switch]$SinCache,
    [switch]$Listar,
    [switch]$SoloComprobar,
    [switch]$Ayuda
)

$ErrorActionPreference = 'Continue'

function Info([string]$Mensaje) { Write-Host ("`n==> " + $Mensaje) -ForegroundColor Cyan }
function Ok([string]$Mensaje)   { Write-Host ("  OK " + $Mensaje) -ForegroundColor Green }
function Warn([string]$Mensaje) { Write-Host ("  AVISO: " + $Mensaje) -ForegroundColor Yellow }
function Abort([string]$Mensaje) { Write-Host ("`nERROR: " + $Mensaje) -ForegroundColor Red; exit 1 }

function Uso {
    Write-Host @"
Montaje automatico y robusto del contenedor de Genoly-GPU (Windows, Docker Desktop)

Uso: powershell -ExecutionPolicy Bypass -File .\docker\setup_docker.ps1 [OPCIONES]

Opciones:
  -Gpu            Modo GPU con todas las tarjetas (por defecto si hay NVIDIA)
  -GpuId N        Usar solo la GPU con indice N
  -Cpu            Modo CPU (sin GPU)
  -Puerto N       Puerto del host y del contenedor (por defecto 8000)
  -SinCache       Reconstruir la imagen sin usar cache
  -Listar         Listar las GPUs detectadas y salir
  -SoloComprobar  Ejecutar solo las comprobaciones del entorno (diagnostico)
  -Ayuda          Mostrar esta ayuda

Ejemplos:
  .\docker\setup_docker.ps1                     # GPU (todas) o error si no hay NVIDIA
  .\docker\setup_docker.ps1 -GpuId 1            # Solo la GPU 1
  .\docker\setup_docker.ps1 -Cpu -Puerto 8010
"@
}

if ($Ayuda) { Uso; exit 0 }

if ($Puerto -lt 1 -or $Puerto -gt 65535) { Abort ("Puerto invalido: " + $Puerto) }

$DirScript = $PSScriptRoot
if (-not $DirScript) { $DirScript = Split-Path -Parent $MyInvocation.MyCommand.Path }
$Raiz = Split-Path -Parent $DirScript
if (-not (Test-Path (Join-Path $DirScript 'Dockerfile'))) { Abort "No se encuentra docker/Dockerfile" }
if (-not (Test-Path (Join-Path $Raiz 'requirements.txt'))) { Abort "No se encuentra requirements.txt en la raiz del proyecto" }
Set-Location $Raiz

$modo = 'cpu'
if (-not $Cpu) { $modo = 'gpu'; if ($GpuId -ge 0) { $modo = 'gpu-select' } }
$imagen = 'genoly-gpu:cpu-latest'
if (-not $Cpu) { $imagen = 'genoly-gpu:gpu-latest' }
$nombre = 'genoly-gpu-cpu'
if (-not $Cpu) { $nombre = 'genoly-gpu-gpu'; if ($GpuId -ge 0) { $nombre = "genoly-gpu-gpu-$GpuId" } }

Write-Host ("`n=========================================") -ForegroundColor Cyan
Write-Host ("  Montaje Docker de Genoly-GPU (modo " + $modo + ")") -ForegroundColor Cyan
Write-Host ("=========================================") -ForegroundColor Cyan

if ($Listar) {
    $gpusListado = nvidia-smi --query-gpu=index,name,memory.total,memory.free,driver_version --format=csv,noheader 2>$null
    if ($gpusListado) { $gpusListado } else { Write-Host "No se detectaron GPUs NVIDIA (o nvidia-smi no esta disponible)." }
    exit 0
}

# ---------------------------------------------------------------- 1. Docker
Info "1/8 Comprobando Docker..."
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Abort "Docker no esta instalado. Instala Docker Desktop con backend WSL2: https://www.docker.com/products/docker-desktop/ y reejecuta el script"
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Abort "El demonio de Docker no esta accesible. Abre Docker Desktop, espera a que este en ejecucion y reejecuta el script"
}
Ok ("Docker activo (" + (docker --version) + ")")

$TieneCompose = $false
$Compose = $null
docker compose version *> $null
if ($LASTEXITCODE -eq 0) {
    $TieneCompose = $true
    $Compose = { & docker compose @args }
} elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $TieneCompose = $true
    $Compose = { & docker-compose @args }
} else {
    Warn "Docker Compose no disponible: se usara docker build/run directo"
}
if ($TieneCompose -and -not (Test-Path (Join-Path $DirScript 'docker-compose.yml'))) {
    Warn "No se encuentra docker/docker-compose.yml: se usara docker build/run directo"
    $TieneCompose = $false
}

# ------------------------------------------- 2. Contenedores previos y puerto
Info ("2/8 Liberando contenedores anteriores y el puerto " + $Puerto + "...")
$viejos = docker ps -aq --filter "name=^genoly-gpu" 2>$null
if ($viejos) {
    Warn ("Eliminando " + @($viejos).Count + " contenedor(es) anterior(es) de Genoly")
    docker rm -f @($viejos) *> $null
}
$ocupado = $false
try { $ocupado = [bool](Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) } catch { $ocupado = $false }
if ($ocupado) {
    Abort ("El puerto " + $Puerto + " esta ocupado por otro proceso. Usa otro puerto: .\docker\setup_docker.ps1 -Puerto 8010")
}
Ok ("Puerto " + $Puerto + " libre y contenedores anteriores retirados")

# -------------------------------------------------------------- 3. GPU host
Info "3/8 Comprobando la GPU NVIDIA del equipo..."
if ($Cpu) {
    Warn "Modo CPU forzado con -Cpu"
} else {
    if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
        Abort "nvidia-smi no encontrado: instala el driver NVIDIA y reinicia el equipo, o reejecuta con -Cpu"
    }
    $gpusHost = nvidia-smi --query-gpu=index,name,memory.total,driver_version --format=csv,noheader 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $gpusHost) {
        Abort "nvidia-smi esta instalado pero no responde: revisa la instalacion del driver, o reejecuta con -Cpu"
    }
    $gpusHost | ForEach-Object { Write-Host ("    " + $_) }
    Ok "Driver NVIDIA accesible"
}

# ----------------------------------------------- 4. Soporte NVIDIA en Docker
if (-not $Cpu) {
    Info "4/8 Comprobando soporte NVIDIA en Docker..."
    $runtimeNvidia = $false
    try { $runtimeNvidia = [bool](docker info 2>$null | Select-String -Pattern 'nvidia' -Quiet) } catch { $runtimeNvidia = $false }
    if ($runtimeNvidia) {
        Ok "Runtime NVIDIA detectado en Docker"
    } else {
        Warn "Docker no reporta el runtime NVIDIA; en Windows se resuelve con:"
        Write-Host "    1) Driver NVIDIA reciente" -ForegroundColor Yellow
        Write-Host "    2) Docker Desktop con backend WSL2 (ajustes de Docker Desktop)" -ForegroundColor Yellow
        Write-Host "    3) 'wsl --update' en PowerShell y reiniciar Docker Desktop" -ForegroundColor Yellow
        Warn "Se continuara el montaje; al final se verifica si PyTorch ve la GPU"
    }
}

# -------------------------------------------------------- 5. Espacio en disco
Info "5/8 Comprobando espacio en disco..."
try {
    $disco = Get-PSDrive -Name $Raiz.Substring(0, 1) -ErrorAction SilentlyContinue
    if ($disco) {
        $libreGb = [math]::Round($disco.Free / 1GB, 1)
        if ($libreGb -lt 10) {
            Warn ("Espacio libre en " + $Raiz.Substring(0, 1) + ": " + $libreGb + " GB (la imagen GPU necesita unos 10-15 GB)")
        } else {
            Ok ("Espacio libre: " + $libreGb + " GB")
        }
    } else {
        Warn "No se pudo comprobar el espacio en disco"
    }
} catch {
    Warn "No se pudo comprobar el espacio en disco"
}

if ($SoloComprobar) {
    Ok "Comprobaciones superadas (modo diagnostico: no se construyo ni lanzo nada)"
    exit 0
}

# ------------------------------------------------------------- 6. Build
$env:GENOLY_PORT = "$Puerto"
if ($GpuId -ge 0) { $env:GPU_ID = "$GpuId" }
$archivoCompose = Join-Path $DirScript 'docker-compose.yml'
$Servicio = 'genoly-cpu'
$Perfil = @()
if (-not $Cpu) {
    $Servicio = 'genoly-gpu'
    $Perfil = @('--profile', 'gpu')
    if ($GpuId -ge 0) { $Servicio = 'genoly-gpu-selected'; $Perfil = @('--profile', 'gpu-select') }
}

Info ("6/8 Construyendo la imagen (modo " + $modo + "; la primera vez descarga varios GB de PyTorch/CUDA)...")
if ($TieneCompose) {
    $buildFlags = @()
    if ($SinCache) { $buildFlags = @('--no-cache') }
    & $Compose -f $archivoCompose @Perfil build @buildFlags $Servicio
    if ($LASTEXITCODE -ne 0) {
        Abort ("Fallo la construccion con Compose. Reproduce el error a mano con: docker compose -f " + $archivoCompose + " build --no-cache " + $Servicio)
    }
    Ok "Imagen construida con Compose"
} else {
    $modoImagen = 'gpu'
    if ($Cpu) { $modoImagen = 'cpu' }
    $buildArgs = @('build')
    if ($SinCache) { $buildArgs += '--no-cache' }
    $buildArgs += @('--build-arg', ("GENOLY_GPU_MODE=" + $modoImagen), '-t', $imagen, '-f', (Join-Path $DirScript 'Dockerfile'), $Raiz)
    & docker @buildArgs
    if ($LASTEXITCODE -ne 0) {
        Abort ("Fallo docker build. Reproduce el error a mano con: docker build --no-cache --build-arg GENOLY_GPU_MODE=" + $modoImagen + " -t " + $imagen + " -f " + (Join-Path $DirScript 'Dockerfile') + " " + $Raiz)
    }
    Ok "Imagen construida con docker build"
}

# ------------------------------------------------------------- 7. Lanzar
Info "7/8 Lanzando el contenedor con acceso a las GPUs del sistema..."
if ($TieneCompose) {
    & $Compose -f $archivoCompose @Perfil up -d $Servicio
    if ($LASTEXITCODE -ne 0) {
        Abort ("Fallo al lanzar el servicio con Compose. Si el error menciona 'could not select device driver', falta el soporte NVIDIA (paso 4). Logs: docker compose -f " + $archivoCompose + " logs " + $Servicio)
    }
} else {
    docker rm -f $nombre *> $null
    $runArgs = @('run', '-d', '--name', $nombre, '-p', "${Puerto}:${Puerto}", '-e', "GENOLY_PORT=$Puerto", '--restart', 'unless-stopped')
    if (-not $Cpu) {
        $runArgs += @('--gpus', 'all', '-e', 'NVIDIA_VISIBLE_DEVICES=all', '-e', 'NVIDIA_DRIVER_CAPABILITIES=compute,utility')
        if ($GpuId -ge 0) { $runArgs += @('-e', "CUDA_VISIBLE_DEVICES=$GpuId") } else { $runArgs += @('-e', 'CUDA_VISIBLE_DEVICES=all') }
    }
    $runArgs += $imagen
    & docker @runArgs
    if ($LASTEXITCODE -ne 0) {
        Abort ("Fallo docker run. Si el error menciona 'could not select device driver', falta el soporte NVIDIA (paso 4). Revisa: docker logs " + $nombre)
    }
}
Ok ("Contenedor '" + $nombre + "' lanzado")

# ---------------------------------------------------------- 8. Verificacion
Info "8/8 Verificando el servicio y la GPU dentro del contenedor..."
$listo = $false
for ($i = 1; $i -le 30; $i++) {
    docker exec $nombre python -c "pass" *> $null
    if ($LASTEXITCODE -eq 0) { $listo = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $listo) {
    Abort ("El contenedor no responde tras 60 s. Logs: docker logs --tail 50 " + $nombre)
}
Ok "Servicio Python operativo dentro del contenedor"

if (-not $Cpu) {
    $codigoGpu = @'
import torch, sys
print("PyTorch:", torch.__version__)
ok = torch.cuda.is_available()
print("CUDA disponible:", ok)
if ok:
    print("GPU visible:", torch.cuda.get_device_name(0))
    t = torch.randn(1024, 1024, device="cuda")
    print("Tensor de prueba en GPU:", tuple(t.shape))
sys.exit(0 if ok else 1)
'@
    docker exec $nombre python -c $codigoGpu
    if ($LASTEXITCODE -ne 0) {
        docker exec $nombre nvidia-smi 2>$null | Select-Object -First 15
        Abort "PyTorch no ve la GPU dentro del contenedor. Comprueba: 1) driver NVIDIA reciente en Windows, 2) Docker Desktop con backend WSL2 ('wsl --update'), 3) reinicia Docker Desktop y reejecuta. Alternativa: -Cpu"
    }
    Ok "GPU accesible desde el contenedor"
} else {
    docker exec $nombre python -c 'import torch; print("PyTorch (CPU):", torch.__version__)'
    if ($LASTEXITCODE -ne 0) { Warn "No se pudo importar torch dentro del contenedor" }
}

$codigoSalud = 'import os, urllib.request; print("API /api/health ->", urllib.request.urlopen(f"http://127.0.0.1:{os.environ[\"GENOLY_PORT\"]}/api/health", timeout=5).status)'
docker exec $nombre python -c $codigoSalud
if ($LASTEXITCODE -ne 0) { Warn ("La API aun no responde dentro del contenedor; mira los logs: docker logs " + $nombre) }

Write-Host ("`n=========================================") -ForegroundColor Green
Write-Host ("  Genoly-GPU montado en Docker (modo " + $modo + ")") -ForegroundColor Green
Write-Host ("=========================================") -ForegroundColor Green
Write-Host @"

  Interfaz web y API : http://localhost:$Puerto  (documentacion en /docs)
  Consola interactiva: docker exec -it $nombre bash
  Logs               : docker logs -f $nombre
  Copiar datos       : docker cp archivo.fa ${nombre}:/tmp/
  Parar y eliminar   : docker rm -f $nombre
"@ 
