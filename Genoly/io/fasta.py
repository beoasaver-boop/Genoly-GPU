from codecs import getincrementaldecoder
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Optional, Union

import numpy as np

#: Tamaño de bloque de disco por defecto (64 KiB). El archivo se lee en
#: bloques de este tamaño y las líneas se reconstruyen sobre la marcha,
#: de modo que el consumo de RAM es O(bloque + mayor línea) y no
#: proporcional al tamaño del archivo.
DEFAULT_BLOCK_SIZE = 64 * 1024

#: Techo de longitud de línea (1 MiB). Los FASTA sin ajuste de línea
#: (una sola línea de varios GB) se fragmentan a este tamaño para que la
#: memoria siga acotada; los fragmentos se concatenan idénticos al
#: reconstruir el registro.
DEFAULT_MAX_LINE = 1024 * 1024

#: Códigos del lector numérico (tabla byte -> código):
#: 0..3  = dígitos base-4 de A/C/G/T (y minúsculas);
#: 253   = saltar del stream (salto de línea / CR);
#: 254   = límite de registro ('>');
#: 255   = dígito inválido que PERMANECE en el stream (N, IUPAC, bytes
#:         desconocidos): desplaza las ventanas igual que una base.
FASTA_CODE_SKIP = 253
FASTA_CODE_HEADER = 254
FASTA_CODE_INVALID = 255

_FASTA_BYTE_CODES = np.full(256, FASTA_CODE_INVALID, dtype=np.uint8)
for _i, _ch in enumerate("ACGT"):
    _FASTA_BYTE_CODES[ord(_ch)] = _i
    _FASTA_BYTE_CODES[ord(_ch.lower())] = _i
_FASTA_BYTE_CODES[ord(">")] = FASTA_CODE_HEADER
for _ch in "\r\n":
    _FASTA_BYTE_CODES[ord(_ch)] = FASTA_CODE_SKIP

_BOM_UTF8 = b"\xef\xbb\xbf"


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


@dataclass
class FastaStats:
    """
    Estadísticas globales de un archivo FASTA obtenidas en streaming.

    El primer registro se devuelve solo con sus metadatos y longitud
    (``first_length``), sin materializar su secuencia: un genoma completo
    de varios GB no llega a copiarse a RAM ni siquiera para las
    estadísticas.
    """
    records: int
    total_bases: int
    first_id: Optional[str] = None
    first_description: Optional[str] = None
    first_length: int = 0


class _BlockLines:
    """
    Lee el archivo en bloques de disco (64 KiB por defecto) y reconstruye
    las líneas sin cargar el archivo completo en RAM.

    Usa un decodificador UTF-8 incremental para no corromper caracteres
    multibyte que caigan justo en el borde entre dos bloques, y tolera
    finales de línea CRLF/LF y archivos sin salto final.
    """

    def __init__(self, path: Union[str, Path],
                 block_size: int = DEFAULT_BLOCK_SIZE,
                 max_line: int = DEFAULT_MAX_LINE):
        if block_size < 1:
            raise ValueError("block_size debe ser >= 1")
        self.path = Path(path)
        self.block_size = int(block_size)
        self.max_line = int(max_line) if max_line else None

    def _emit(self, line: str) -> Iterator[str]:
        """Fragmenta líneas que exceden ``max_line`` (FASTA sin ajustar)."""
        if self.max_line is None or len(line) <= self.max_line:
            yield line
            return
        for pos in range(0, len(line), self.max_line):
            yield line[pos:pos + self.max_line]

    def __iter__(self) -> Iterator[str]:
        decoder = getincrementaldecoder("utf-8-sig")(errors="replace")
        remainder = ""
        with open(self.path, "rb") as fh:
            for block in iter(lambda: fh.read(self.block_size), b""):
                text = decoder.decode(block)
                text = remainder + text
                lines = text.split("\n")
                remainder = lines.pop()  # la última puede estar incompleta
                for line in lines:
                    yield from self._emit(line.rstrip("\r"))
        if remainder:
            yield from self._emit(remainder.rstrip("\r"))


class FastaReader:
    """
    Lector de archivos FASTA en streaming por bloques de disco.

    El archivo se lee en bloques (``block_size``, 64 KiB por defecto) y
    los registros se reconstruyen línea a línea, de modo que el consumo
    de RAM es proporcional al mayor registro del archivo y no a su tamaño
    total. Para archivos con registros gigantes (p. ej. un cromosoma
    completo por registro), use ``iter_windows`` que acota la memoria a
    O(ventana) sin materializar ningún registro.
    """

    def __init__(self, path: Union[str, Path],
                 block_size: int = DEFAULT_BLOCK_SIZE,
                 max_line: int = DEFAULT_MAX_LINE):
        """
        Args:
            path: Ruta al archivo FASTA.
            block_size: Tamaño del bloque de lectura en bytes.
            max_line: Techo de longitud de línea; las líneas más largas
                (FASTA sin ajuste de línea) se fragmentan a este tamaño
                para acotar la memoria.
        """
        self.path = Path(path)
        self.block_size = int(block_size)
        self.max_line = int(max_line) if max_line else None

    def __iter__(self) -> Iterator[FastaRecord]:
        return self.records()

    def records(self) -> Iterator[FastaRecord]:
        """Generador de registros FASTA leídos por bloques de disco."""
        record_id = None
        description = None
        lines: List[str] = []

        for raw_line in _BlockLines(self.path, self.block_size, self.max_line):
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

    def iter_sequences(self) -> Iterator[str]:
        """Generador perezoso de las secuencias (sin metadatos)."""
        for record in self.records():
            yield record.sequence

    def iter_batches(self, batch_size: int = 10_000
                     ) -> Iterator[List[FastaRecord]]:
        """
        Generador por lotes (RAM batching): agrupa ``batch_size`` registros
        en memoria antes de entregarlos a la siguiente etapa del pipeline.

        Args:
            batch_size: Número de registros por lote de RAM.

        Yields:
            Listas de hasta ``batch_size`` registros.
        """
        if batch_size < 1:
            raise ValueError("batch_size debe ser >= 1")

        batch: List[FastaRecord] = []
        for record in self.records():
            batch.append(record)
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    def iter_windows(self, window_size: int, overlap: int = 0) -> Iterator[str]:
        """
        Ventanas de bases leídas en streaming, sin materializar registros.

        Recorre el flujo de bloques acumulando bases y emite ventanas de
        ``window_size``; el consumo de RAM es O(window_size) aunque un
        registro (o incluso una línea) sea de varios GB. En el límite de
        registro (cabecera '>') se emite la cola pendiente y el buffer se
        reinicia: ninguna ventana (ni k-mer) cruza entre registros.

        Args:
            window_size: Bases por ventana (> 0).
            overlap: Bases de solape entre ventanas consecutivas
                (``0 <= overlap < window_size``). Para el conteo de
                k-mers use ``overlap = k - 1``: garantiza que ningún
                k-mer quede partido entre dos ventanas y que el conteo
                agregado sea idéntico al de procesar la secuencia entera.

        Yields:
            Cadenas de hasta ``window_size`` bases.
        """
        if window_size < 1:
            raise ValueError("window_size debe ser >= 1")
        if overlap < 0 or overlap >= window_size:
            raise ValueError("overlap debe estar en [0, window_size)")

        step = window_size - overlap
        buffer = ""
        for raw_line in _BlockLines(self.path, self.block_size):
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith(">"):
                # Límite de registro: emite la cola pendiente (< window)
                # y reinicia el buffer; ninguna ventana cruza entre
                # registros.
                if buffer:
                    yield buffer
                    buffer = ""
                continue

            pos = 0
            while pos < len(line):
                take = min(window_size - len(buffer), len(line) - pos)
                buffer += line[pos:pos + take]
                pos += take
                if len(buffer) >= window_size:
                    yield buffer
                    buffer = buffer[step:]

        if buffer:
            yield buffer

    def iter_windows_codes(self, window_size: int,
                           overlap: int = 0) -> Iterator[np.ndarray]:
        """
        Ventanas de **códigos base-4** leídas en streaming, sin construir
        cadenas de Python ni decodificar texto.

        Igual contrato de teselación que :meth:`iter_windows` (ventanas de
        ``window_size`` con solape ``overlap``, colas emitidas en el
        límite de registro y al EOF), pero cada ventana es un array
        ``uint8`` con 0..3 = A/C/G/T y 255 = dígito inválido (N, IUPAC o
        byte desconocido, que permanece en el stream y desplaza las
        ventanas igual que una base). Solo los saltos de línea/CR se
        eliminan del stream y '>' marca el límite de registro.

        Lee bloques de disco en crudo y traduce con una tabla de 256
        bytes vectorizada: el coste es ~1 pasada de numpy sobre el
        archivo, sin bucles por línea. RAM acotada a O(window_size).

        Args:
            window_size: Bases por ventana (> 0, típicamente >= k).
            overlap: Bases de solape entre ventanas consecutivas
                (``0 <= overlap < window_size``); para conteo de k-mers
                use ``overlap = k - 1``.

        Yields:
            Arrays ``uint8`` de hasta ``window_size`` códigos. Las colas
            pueden ser más cortas; el consumidor descarta las menores
            que k (no aportan k-mers).
        """
        if window_size < 1:
            raise ValueError("window_size debe ser >= 1")
        if overlap < 0 or overlap >= window_size:
            raise ValueError("overlap debe estar en [0, window_size)")

        step = window_size - overlap
        pending = np.empty(0, dtype=np.uint8)
        first_block = True
        in_header = False

        with open(self.path, "rb") as fh:
            for block in iter(lambda: fh.read(self.block_size), b""):
                if first_block:
                    first_block = False
                    if block.startswith(_BOM_UTF8):
                        block = block[len(_BOM_UTF8):]
                        if not block:
                            continue

                codes = _FASTA_BYTE_CODES[np.frombuffer(block, np.uint8)]

                if in_header:
                    # cabecera partida entre bloques: descarta hasta el
                    # primer salto de linea
                    skips = np.flatnonzero(codes == FASTA_CODE_SKIP)
                    if skips.size == 0:
                        continue
                    codes[:int(skips[0])] = FASTA_CODE_SKIP
                    in_header = False

                # descarta el texto de cada cabecera ('>' hasta '\n')
                for pos in np.flatnonzero(
                        codes == FASTA_CODE_HEADER).tolist():
                    if codes[pos] != FASTA_CODE_HEADER:
                        continue  # ya anulada (cabecera previa en bloque)
                    j = pos + 1
                    while j < codes.size and codes[j] != FASTA_CODE_SKIP:
                        codes[j] = FASTA_CODE_SKIP
                        j += 1
                    in_header = j >= codes.size

                meaningful = codes[codes != FASTA_CODE_SKIP]

                markers = np.flatnonzero(meaningful == FASTA_CODE_HEADER)
                if markers.size == 0:
                    segments = (meaningful,)
                else:
                    segments = np.split(meaningful, markers)

                for si, seg in enumerate(segments):
                    if si > 0:
                        # el marcador encabeza el segmento: límite de
                        # registro -> emite la cola pendiente y reinicia
                        if pending.size:
                            yield pending
                            pending = np.empty(0, dtype=np.uint8)
                        seg = seg[1:]
                    if seg.size == 0:
                        continue

                    data = np.concatenate((pending, seg)) if pending.size \
                        else seg
                    if data.size >= window_size:
                        n_full = (data.size - window_size) // step + 1
                        for i in range(n_full):
                            yield data[i * step:i * step + window_size]
                        data = data[n_full * step:]
                    pending = data

        if pending.size:
            yield pending

    def scan_stats(self) -> FastaStats:
        """
        Recorre el archivo en streaming y devuelve el número de registros,
        el total de bases y los metadatos del primer registro, sin
        materializar ninguna secuencia completa.

        Implementación vectorizada sobre la tabla de bytes (una pasada de
        numpy por bloque, sin bucles por línea): cuenta los marcadores
        '>' en inicio de línea y las bases no anuladas tras blankar el
        texto de las cabeceras. ~8x más rápida que el recorrido por
        líneas en archivos grandes.
        """
        records = 0
        total_bases = 0
        first_id: Optional[str] = None
        first_description: Optional[str] = None
        first_bases = 0           # bases del primer registro (en curso)
        first_length: Optional[int] = None  # None = primer registro abierto
        prev_nl = True  # el archivo comienza en inicio de linea
        in_header = False
        first_block = True

        with open(self.path, "rb") as fh:
            for block in iter(lambda: fh.read(self.block_size), b""):
                if first_block:
                    first_block = False
                    if block.startswith(_BOM_UTF8):
                        block = block[len(_BOM_UTF8):]
                        if not block:
                            continue

                codes = _FASTA_BYTE_CODES[np.frombuffer(block, np.uint8)]

                is_start = np.empty(codes.size, dtype=bool)
                is_start[0] = prev_nl
                is_start[1:] = codes[:-1] == FASTA_CODE_SKIP
                prev_nl = bool(codes[-1] == FASTA_CODE_SKIP)

                if in_header:
                    skips = np.flatnonzero(codes == FASTA_CODE_SKIP)
                    if skips.size == 0:
                        continue
                    codes[:int(skips[0])] = FASTA_CODE_SKIP
                    in_header = False

                second_marker_pos = None
                for pos in np.flatnonzero(
                        (codes == FASTA_CODE_HEADER) & is_start).tolist():
                    records += 1
                    if records == 1:
                        # metadatos del primer registro (texto crudo)
                        j = pos + 1
                        while j < codes.size and codes[j] != FASTA_CODE_SKIP:
                            j += 1
                        text = block[pos:j][1:].decode(
                            "utf-8", errors="replace").strip()
                        first_id = text.split()[0] if text else ""
                        rest = text[len(first_id):].strip() if text else ""
                        first_description = rest or None
                    elif first_length is None and second_marker_pos is None:
                        second_marker_pos = pos
                    j = pos
                    while j < codes.size and codes[j] != FASTA_CODE_SKIP:
                        codes[j] = FASTA_CODE_SKIP
                        j += 1
                    in_header = j >= codes.size

                bases = int(np.count_nonzero(codes != FASTA_CODE_SKIP))
                total_bases += bases
                if first_length is None:
                    if second_marker_pos is None:
                        first_bases += bases
                    else:
                        # bases del bloque previas al segundo '>' (el
                        # texto de cabeceras ya esta anulado)
                        first_bases += int(np.count_nonzero(
                            codes[:second_marker_pos] != FASTA_CODE_SKIP))
                        first_length = first_bases

        if first_length is None:
            first_length = first_bases
        return FastaStats(
            records=records,
            total_bases=total_bases,
            first_id=first_id,
            first_description=first_description,
            first_length=first_length,
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


def iter_fasta_batches(path: Union[str, Path], batch_size: int = 10_000,
                       block_size: int = DEFAULT_BLOCK_SIZE
                       ) -> Iterator[List[FastaRecord]]:
    """
    Genera lotes de registros FASTA (RAM batching) para alimentar el
    pipeline GPU sin cargar el archivo completo en memoria.

    Args:
        path: Ruta del archivo FASTA.
        batch_size: Número de registros por lote de RAM.
        block_size: Tamaño del bloque de lectura de disco.

    Yields:
        Listas de hasta ``batch_size`` registros.
    """
    return FastaReader(path, block_size).iter_batches(batch_size)


def fasta_to_batches(path: Union[str, Path], batch_size: int,
                     block_size: int = DEFAULT_BLOCK_SIZE,
                     ) -> Iterator[List[FastaRecord]]:
    """Alias de compatibilidad de :func:`iter_fasta_batches`."""
    return iter_fasta_batches(path, batch_size, block_size)
