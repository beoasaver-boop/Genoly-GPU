from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Optional, Union

from Genoly.core.device import DeviceManager


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


class FastqReader:
    """
    Lector de archivos FASTQ en streaming (formato 4 líneas por lectura).

    Soporta cabeceras opcionales adicionales (read 2 y 3, formato Illumina
    multilínea) fusionándolas en el identificador.
    """

    def __init__(self, path: Union[str, Path]):
        self.path = Path(path)

    def __iter__(self) -> Iterator[FastqRecord]:
        return self.records()

    def records(self) -> Iterator[FastqRecord]:
        """Generador de registros FASTQ."""
        with open(self.path, "r", encoding="utf-8") as fh:
            siguiente: Optional[str] = None
            while True:
                header = siguiente if siguiente is not None else fh.readline()
                siguiente = None
                if not header:
                    break
                header = header.strip()
                if not header.startswith("@"):
                    raise ValueError(f"Formato FASTQ inválido: se esperaba '@' en {self.path}")

                sequence = fh.readline().strip()
                plus = fh.readline().strip()
                quality = fh.readline().strip()

                if not sequence or not quality:
                    raise ValueError(f"Lectura FASTQ incompleta: {header}")

                # Formato multilínea Illumina: consumir líneas extra de calidad
                siguiente = fh.readline()
                while siguiente and siguiente.strip() and not siguiente.startswith("@"):
                    quality += siguiente.strip()
                    siguiente = fh.readline()
                if len(quality) != len(sequence):
                    raise ValueError(
                        f"Longitud de secuencia y calidad no coinciden en {header}"
                    )

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