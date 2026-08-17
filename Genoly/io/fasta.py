from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Optional, Union

from Genoly.core.device import DeviceManager


@dataclass
class FastaRecord:
    """Registro de una secuencia FASTA."""
    id: str
    sequence: str
    description: Optional[str] = None

    @property
    def header(self) -> str:
        """Cabecera completa (id + descripción)."""
        if self.description:
            return f"{self.id} {self.description}"
        return self.id

    def __len__(self) -> int:
        return len(self.sequence)


class FastaReader:
    """
    Lector de archivos FASTA en streaming.

    No carga el archivo completo en memoria: los registros se van
    generando uno a uno, lo que permite procesar genomas completos
    con un consumo de memoria reducido.
    """

    def __init__(self, path: Union[str, Path], chunk_lines: int = 4096):
        """
        Args:
            path: Ruta al archivo FASTA.
            chunk_lines: Tamaño de buffer de lectura por bloques.
        """
        self.path = Path(path)
        self.chunk_lines = chunk_lines

    def __iter__(self) -> Iterator[FastaRecord]:
        return self.records()

    def records(self) -> Iterator[FastaRecord]:
        """Generador de registros FASTA."""
        record_id = None
        description = None
        lines = []

        with open(self.path, "r", encoding="utf-8") as fh:
            for raw_line in fh:
                line = raw_line.strip()
                if not line:
                    continue

                if line.startswith(">"):
                    if record_id is not None:
                        yield FastaRecord(
                            id=record_id,
                            sequence="".join(lines),
                            description=description,
                        )
                    header = line[1:]
                    record_id = header.split()[0]
                    description = header[len(record_id):].strip() or None
                    lines = []
                else:
                    lines.append(line)

        if record_id is not None:
            yield FastaRecord(
                id=record_id,
                sequence="".join(lines),
                description=description,
            )

    def read_all(self) -> List[FastaRecord]:
        """Lee todos los registros de una vez (solo archivos pequeños)."""
        return list(self.records())


def read_fasta(path: Union[str, Path]) -> List[FastaRecord]:
    """Función de conveniencia: lee todos los registros FASTA."""
    return FastaReader(path).read_all()


def write_fasta(path: Union[str, Path], records: List[FastaRecord],
                line_width: int = 60) -> None:
    """
    Escribe registros FASTA a un archivo.

    Args:
        path: Ruta de salida.
        records: Lista de registros.
        line_width: Número de bases por línea (0 = sin cortar).
    """
    with open(path, "w", encoding="utf-8") as fh:
        for record in records:
            fh.write(f">{record.header}\n")
            seq = record.sequence
            if line_width and line_width > 0:
                for i in range(0, len(seq), line_width):
                    fh.write(seq[i:i + line_width] + "\n")
            else:
                fh.write(seq + "\n")


def fasta_to_batches(path: Union[str, Path], batch_size: int,
                     device: Optional[DeviceManager] = None) -> Iterator[List[FastaRecord]]:
    """
    Genera lotes de registros FASTA para alimentar el pipeline GPU.

    Args:
        path: Ruta del archivo FASTA.
        batch_size: Número de registros por lote.
        device: DeviceManager opcional (para reportar el dispositivo).

    Yields:
        Listas de hasta `batch_size` registros.
    """
    batch = []
    for record in FastaReader(path).records():
        batch.append(record)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch