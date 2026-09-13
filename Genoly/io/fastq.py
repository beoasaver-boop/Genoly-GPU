from codecs import getincrementaldecoder
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Optional, Union

from Genoly.core.device import DeviceManager

#: Tamaño de bloque de disco para la lectura de FASTQ (64 KiB).
DEFAULT_BLOCK_SIZE = 64 * 1024


@dataclass
class FastqRecord:
    """Registro de una lectura FASTQ con calidad Phred."""
    id: str
    sequence: str
    quality: str
    plus: Optional[str] = None

    @property
    def scores(self) -> List[int]:
        """Convierte la cadena de calidad ASCII a scores Phred (offset 33)."""
        return [ord(c) - 33 for c in self.quality]

    @property
    def mean_score(self) -> float:
        """Score Phred medio de la lectura."""
        if not self.quality:
            return 0.0
        return sum(self.scores) / len(self.quality)

    def __len__(self) -> int:
        return len(self.sequence)


@dataclass
class FastqStats:
    """Estadísticas globales de un archivo FASTQ obtenidas en streaming."""
    reads: int
    total_bases: int
    first_id: Optional[str] = None
    first_length: int = 0


def _iter_lines(path: Union[str, Path], block_size: int = DEFAULT_BLOCK_SIZE,
                ) -> Iterator[str]:
    """
    Recorre las líneas de un archivo por bloques de disco (64 KiB), con
    decodificación incremental UTF-8 y tolerancia CRLF/sin salto final.
    """
    decoder = getincrementaldecoder("utf-8-sig")(errors="replace")
    remainder = ""
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(block_size), b""):
            text = decoder.decode(block)
            text = remainder + text
            lines = text.split("\n")
            remainder = lines.pop()
            for line in lines:
                yield line.rstrip("\r")
    if remainder:
        yield remainder.rstrip("\r")


class _LineReader:
    """Iterador de líneas con peek (para la calidad multilínea de Illumina)."""

    def __init__(self, path):
        self._it = iter(_iter_lines(path))
        self._peeked = None

    def __iter__(self) -> "_LineReader":
        return self

    def __next__(self) -> str:
        if self._peeked is not None:
            value = self._peeked
            self._peeked = None
            return value
        return next(self._it)

    def peek(self) -> Optional[str]:
        if self._peeked is None:
            try:
                self._peeked = next(self._it)
            except StopIteration:
                return None
        return self._peeked


class FastqReader:
    """
    Lector de archivos FASTQ en streaming (formato 4 líneas por lectura).

    Lee por bloques de disco y reconstruye las líneas sobre la marcha, de
    modo que el consumo de RAM es O(bloque) y no proporcional al tamaño del
    archivo (FASTQ de 50-100 GB incluidos). Soporta cabeceras opcionales
    adicionales (formato Illumina multilínea) fusionándolas en la calidad.
    """

    def __init__(self, path: Union[str, Path]):
        self.path = Path(path)

    def __iter__(self) -> Iterator[FastqRecord]:
        return self.records()

    def records(self) -> Iterator[FastqRecord]:
        """Generador de registros FASTQ en streaming."""
        reader = _LineReader(self.path)
        while True:
            try:
                header = next(reader).strip()
            except StopIteration:
                return
            if not header:
                continue  # línea en blanco entre registros / EOF
            if not header.startswith("@"):
                raise ValueError(
                    f"Formato FASTQ inválido: se esperaba '@' en {self.path}")

            try:
                sequence = next(reader).strip()
                plus = next(reader).strip()
                quality = next(reader).strip()
            except StopIteration:
                raise ValueError(f"Lectura FASTQ incompleta: {header}")

            # Formato multilínea Illumina: consumir líneas extra de calidad
            extra = reader.peek()
            while extra is not None and extra.strip() and \
                    not extra.startswith("@"):
                next(reader)  # consumir
                quality += extra.strip()
                extra = reader.peek()

            if not sequence or not quality:
                raise ValueError(f"Lectura FASTQ incompleta: {header}")
            if len(quality) != len(sequence):
                raise ValueError(
                    f"Longitud de secuencia y calidad no coinciden en {header}")

            record_id = header.split()[0][1:]
            yield FastqRecord(
                id=record_id,
                sequence=sequence,
                quality=quality[:len(sequence)],
                plus=plus,
            )

    def read_all(self) -> List[FastqRecord]:
        """Lee todos los registros de una vez (solo archivos pequeños)."""
        return list(self.records())

    def scan_stats(self) -> FastqStats:
        """
        Recorre el archivo en streaming y devuelve el número de lecturas,
        el total de bases y los metadatos de la primera lectura, sin
        materializar el archivo en memoria.
        """
        reads = 0
        total_bases = 0
        first_id: Optional[str] = None
        first_length = 0
        for record in self.records():
            reads += 1
            length = len(record)
            total_bases += length
            if reads == 1:
                first_id = record.id
                first_length = length
        return FastqStats(reads=reads, total_bases=total_bases,
                          first_id=first_id, first_length=first_length)


def read_fastq(path: Union[str, Path]) -> List[FastqRecord]:
    """Función de conveniencia: lee todos los registros FASTQ."""
    return FastqReader(path).read_all()


def write_fastq(path: Union[str, Path], records: List[FastqRecord]) -> None:
    """Escribe registros FASTQ a un archivo (formato 4 líneas)."""
    with open(path, "w", encoding="utf-8") as fh:
        for record in records:
            fh.write(f"@{record.id}\n")
            fh.write(record.sequence + "\n")
            plus = record.plus or "+"
            fh.write(plus + "\n")
            fh.write(record.quality + "\n")


def fastq_to_batches(path: Union[str, Path], batch_size: int,
                     device: Optional[DeviceManager] = None) -> Iterator[List[FastqRecord]]:
    """
    Genera lotes de lecturas FASTQ para alimentar el pipeline GPU.

    Args:
        path: Ruta del archivo FASTQ.
        batch_size: Número de lecturas por lote.
        device: DeviceManager opcional.

    Yields:
        Listas de hasta `batch_size` lecturas.
    """
    batch = []
    for record in FastqReader(path).records():
        batch.append(record)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch