# Script: setup_genoly.ps1
# Guardar con codificación UTF-8 con BOM
# Ejecutar: powershell -ExecutionPolicy Bypass -File .\setup_genoly.ps1

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Creando estructura de Genoly-GPU" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Crear directorio principal
$projectName = "genoly_gpu"
New-Item -ItemType Directory -Force -Path $projectName | Out-Null
Set-Location $projectName

Write-Host "✓ Directorio principal creado: $projectName" -ForegroundColor Green

# ============================================================================
# 1. ARCHIVOS DE CONFIGURACIÓN DEL PROYECTO
# ============================================================================

Write-Host "`n1. Creando archivos de configuración..." -ForegroundColor Yellow

# .gitignore
$gitignoreContent = @'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# PyInstaller
*.manifest
*.spec

# Unit test / coverage reports
htmlcov/
.tox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
.hypothesis/

# Jupyter Notebook
.ipynb_checkpoints

# Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Datos grandes
*.fastq
*.fastq.gz
*.bam
*.bai
*.vcf
*.vcf.gz

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# Windows
Desktop.ini
'@

$gitignoreContent | Out-File -FilePath .gitignore -Encoding UTF8
Write-Host "  ✓ .gitignore" -ForegroundColor Green

# setup.py
$setupContent = @'
from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="genoly-gpu",
    version="0.1.0",
    author="Tu Nombre",
    author_email="tu@email.com",
    description="Accelerated genomic sequence analysis using GPU",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/tuusuario/genoly-gpu",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering :: Bio-Informatics",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
    ],
    python_requires=">=3.8",
    install_requires=[
        "torch>=2.0.0",
        "numpy>=1.20.0",
    ],
)
'@

$setupContent | Out-File -FilePath setup.py -Encoding UTF8
Write-Host "  ✓ setup.py" -ForegroundColor Green

# requirements.txt
$requirementsContent = @'
torch>=2.0.0
numpy>=1.20.0
'@

$requirementsContent | Out-File -FilePath requirements.txt -Encoding UTF8
Write-Host "  ✓ requirements.txt" -ForegroundColor Green

# README.md
$readmeContent = @'
# Genoly-GPU

GPU-accelerated genomic sequence analysis.

## Installation

```bash
pip install -e .