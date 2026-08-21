"""
Carga y preprocesamiento de tablas de fenotipos y genotipos (CSV o Excel).

Replica en el núcleo el preprocesamiento que aplica la interfaz web antes
de ajustar un modelo: detección de cabecera y delimitador, conversión de
decimales con coma, eliminación de columnas no numéricas y filas sin
fenotipo, e imputación de dosis perdidas por media o moda del marcador.
"""

import csv
import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

IMPUTE_METHODS = ("media", "moda")
_MISSING_TOKENS = {"", "na", "nan", "null", "none", "-", "nd"}
_DECIMAL_COMMA = re.compile(r"^-?\d+,\d+$")


@dataclass
class PreprocessReport:
    """Resumen de las operaciones de limpieza aplicadas a una tabla."""
    archivo: Optional[str] = None
    rows_read: int = 0
    header_detected: bool = False
    columns_total: int = 0
    dropped_columns: List[str] = field(default_factory=list)
    dropped_rows_no_phenotype: int = 0
    imputed_cells: int = 0
    impute_method: str = "media"
    final_rows: int = 0
    final_markers: int = 0


def _sniff_delimiter(line: str) -> str:
    best, best_count = ",", -1
    for candidate in (",", ";", "\t"):
        count = line.count(candidate)
        if count > best_count:
            best, best_count = candidate, count
    return best


def _to_number(cell: Optional[str]) -> Optional[float]:
    """Convierte una celda a número: None si falta, NaN si no es numérica."""
    if cell is None or cell.strip().lower() in _MISSING_TOKENS:
        return None
    s = cell.strip()
    if _DECIMAL_COMMA.match(s):
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return float("nan")


def _is_non_numeric(cell: Optional[str]) -> bool:
    v = _to_number(cell)
    return v is not None and v != v


def load_grid(path) -> List[List[Optional[str]]]:
    """
    Lee un archivo CSV/TSV/TXT o Excel y devuelve una matriz de celdas.

    Para CSV se detecta el delimitador (coma, punto y coma o tabulador);
    para Excel (.xlsx/.xls) se requiere el paquete opcional openpyxl.

    Args:
        path: Ruta del archivo de datos.

    Returns:
        Matriz de cadenas (celdas vacías como cadena vacía).

    Raises:
        ValueError: Si la extensión no está soportada o el archivo está vacío.
        ImportError: Si se lee Excel sin openpyxl instalado.
    """
    p = Path(path)
    suffix = p.suffix.lower()

    if suffix in (".xlsx", ".xls"):
        try:
            import openpyxl
        except ImportError as exc:
            raise ImportError(
                "Instala openpyxl para leer archivos de Excel: pip install openpyxl"
            ) from exc
        workbook = openpyxl.load_workbook(p, read_only=True, data_only=True)
        sheet = workbook.active
        grid = [
            [("" if cell is None else str(cell).strip()) for cell in row]
            for row in sheet.iter_rows(values_only=True)
        ]
        workbook.close()
    elif suffix in (".csv", ".tsv", ".txt"):
        text = p.read_text(encoding="utf-8-sig")
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            raise ValueError("El archivo no contiene datos")
        delimiter = _sniff_delimiter(lines[0])
        reader = csv.reader(io.StringIO("\n".join(lines)), delimiter=delimiter)
        grid = [[cell.strip() for cell in row] for row in reader]
    else:
        raise ValueError(
            f"Formato no soportado: '{suffix}'. Usa .csv, .tsv, .txt, .xlsx o .xls"
        )

    grid = [row for row in grid if any(str(c).strip() for c in row)]
    if not grid:
        raise ValueError("El archivo no contiene filas de datos")
    width = max(len(row) for row in grid)
    return [row + [""] * (width - len(row)) for row in grid]


def preprocess_grid(grid: List[List[Optional[str]]],
                    impute_method: str = "media",
                    ) -> Tuple[List[float], List[List[float]], PreprocessReport]:
    """
    Limpia e imputa una matriz de celdas para los análisis cuantitativos.

    Pasos aplicados: detección de cabecera, eliminación de columnas no
    numéricas (salvo la primera, usada como fenotipo), descarte de filas sin
    fenotipo y rellenado de dosis perdidas con la media o la moda de cada
    marcador.

    Args:
        grid: Matriz de celdas crudas (cadenas).
        impute_method: 'media' o 'moda'.

    Returns:
        Tupla (fenotipos, genotipos_imputados, informe).

    Raises:
        ValueError: Si el método es inválido, quedan menos de 5 individuos
                    o menos de 2 marcadores útiles.
    """
    if impute_method not in IMPUTE_METHODS:
        raise ValueError(f"impute_method debe ser uno de: {', '.join(IMPUTE_METHODS)}")

    grid = [list(row) for row in grid]
    rows_read = len(grid)
    if not grid:
        raise ValueError("El archivo no contiene filas de datos")
    width = max(len(row) for row in grid)

    header_detected = any(_is_non_numeric(c) for c in grid[0])
    if header_detected:
        column_names = [
            str(c).strip() if str(c).strip() else f"col_{j + 1}"
            for j, c in enumerate(grid[0])
        ]
        grid = grid[1:]
    else:
        column_names = [f"col_{j + 1}" for j in range(width)]

    body = [[_to_number(c) for c in row] for row in grid]

    valid_columns: List[int] = []
    dropped_columns: List[str] = []
    for j in range(width):
        if j == 0:
            valid_columns.append(0)
            continue
        values = [row[j] for row in body if row[j] is not None]
        all_numeric = all(v == v for v in values)
        if values and all_numeric:
            valid_columns.append(j)
        else:
            dropped_columns.append(column_names[j])

    phenotypes: List[float] = []
    genotypes: List[List[Optional[float]]] = []
    dropped_rows = 0
    for row in body:
        pheno = row[0]
        if pheno is None or pheno != pheno:
            dropped_rows += 1
            continue
        phenotypes.append(pheno)
        genotypes.append([row[j] for j in valid_columns[1:]])

    if len(phenotypes) < 5:
        raise ValueError(
            f"Tras la limpieza quedan {len(phenotypes)} individuos; "
            "se necesitan al menos 5"
        )
    if len(valid_columns) < 3:
        raise ValueError(
            f"Tras la limpieza quedan {len(valid_columns) - 1} marcadores; "
            "se necesitan al menos 2"
        )

    imputed_cells = 0
    n_markers = len(genotypes[0])
    for j in range(n_markers):
        observed = [row[j] for row in genotypes if row[j] is not None]
        if not observed:
            continue
        if impute_method == "moda":
            fill = max(set(observed), key=observed.count)
        else:
            fill = sum(observed) / len(observed)
        for row in genotypes:
            if row[j] is None:
                row[j] = fill
                imputed_cells += 1

    report = PreprocessReport(
        rows_read=rows_read,
        header_detected=header_detected,
        columns_total=width,
        dropped_columns=dropped_columns,
        dropped_rows_no_phenotype=dropped_rows,
        imputed_cells=imputed_cells,
        impute_method=impute_method,
        final_rows=len(phenotypes),
        final_markers=n_markers,
    )
    return phenotypes, genotypes, report


def prepare_quantitative_data(path,
                              impute_method: str = "media",
                              ) -> Tuple[List[float], List[List[float]], PreprocessReport]:
    """
    Carga un archivo CSV/Excel, lo limpia y lo deja listo para los modelos.

    Args:
        path: Ruta del archivo (.csv, .tsv, .txt, .xlsx o .xls). Primera
              columna = fenotipo, resto = dosis alélicas por marcador.
        impute_method: 'media' o 'moda' para las dosis perdidas.

    Returns:
        Tupla (fenotipos, genotipos_imputados, PreprocessReport).
    """
    grid = load_grid(path)
    phenotypes, genotypes, report = preprocess_grid(grid, impute_method=impute_method)
    report.archivo = Path(path).name
    return phenotypes, genotypes, report
