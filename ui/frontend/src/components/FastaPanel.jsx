import { useRef, useState } from 'react'
import { Card, Badge } from './ui.jsx'
import { parseFasta, parseHeader } from '../fasta.js'
import { api } from '../api.js'

const SAMPLE_ID = 'NM_007294.4'
const SAMPLE_DESC =
  'Homo sapiens BRCA1 DNA repair associated (BRCA1), transcript variant 1, mRNA'

// Los archivos mayores se suben al backend (streaming) en lugar de cargarse
// en memoria; un genoma completo (p. ej. NC_000001.11) petaría el navegador.
const INLINE_LIMIT = 2 * 1024 * 1024

// Por encima de este tamaño la subida se hace por partes reanudables
// (chunks de CHUNK_SIZE MB), para que una caída de red no reinicie el
// envío de decenas de GB desde cero.
const CHUNK_THRESHOLD = 1024 * 1024 * 1024
const CHUNK_SIZE = 32 * 1024 * 1024

const FIELDS = [
  { key: 'accession', label: 'Fragmento' },
  { key: 'species', label: 'Especie' },
  { key: 'gene', label: 'Gen asociado' },
  { key: 'variant', label: 'Variante' },
  { key: 'type', label: 'Tipo' },
]

export default function FastaPanel({ onLoaded, disableUpload = false }) {
  const inputRef = useRef(null)
  const [meta, setMeta] = useState(() => parseHeader(SAMPLE_ID, SAMPLE_DESC))
  const [source, setSource] = useState('BRCA1_humano.fasta (ejemplo)')
  const [recordCount, setRecordCount] = useState(1)
  const [totalBases, setTotalBases] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [statsPending, setStatsPending] = useState(false)
  const [serverPath, setServerPath] = useState('')
  const [datasetPath, setDatasetPath] = useState('')
  const [dataset, setDataset] = useState(null)
  const [error, setError] = useState(null)

  const handleFile = (file) => {
    if (!file) return
    setError(null)
    setDataset(null)
    if (file.size > INLINE_LIMIT) {
      if (disableUpload) {
        setError(
          'Archivo demasiado grande para esta vista; úsalo en Control de calidad o K-mers (se procesa en streaming).',
        )
        return
      }
      uploadLarge(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const records = parseFasta(reader.result)
      if (!records.length) {
        setError('El archivo no contiene registros FASTA válidos.')
        return
      }
      const first = records[0]
      setMeta(parseHeader(first.id, first.description))
      setSource(file.name)
      setRecordCount(records.length)
      setTotalBases(null)
      onLoaded?.({ mode: 'inline', records })
    }
    reader.onerror = () => setError('No se pudo leer el archivo.')
    reader.readAsText(file)
  }

  const applyMeta = (res) => {
    setMeta(parseHeader(res.first?.id ?? null, res.first?.description ?? null))
    setSource(res.filename)
    setRecordCount(res.records)
    setTotalBases(res.total_bases)
  }

  const emitUpload = (res) =>
    onLoaded?.({
      mode: 'upload',
      uploadId: res.upload_id,
      source: res.filename,
      recordCount: res.records,
      totalBases: res.total_bases,
    })

  const pollStats = async (uploadId) => {
    try {
      const st = await api.uploadStats(uploadId)
      if (st.stats_status === 'pending') {
        setTimeout(() => pollStats(uploadId), 2000)
        return
      }
      setStatsPending(false)
      if (st.stats_status === 'error') {
        setError(st.error || 'No se pudieron calcular las estadísticas del archivo.')
        return
      }
      applyMeta(st)
      emitUpload(st)
    } catch (e) {
      setStatsPending(false)
      setError(e.message)
    }
  }

  const finalizeUpload = async (res) => {
    applyMeta(res)
    emitUpload(res)
    if (res.stats_status === 'pending') {
      setStatsPending(true)
      pollStats(res.upload_id)
    }
  }

  const uploadLarge = async (file) => {
    setUploading(true)
    setStatsPending(false)
    setDataset(null)
    try {
      if (file.size > CHUNK_THRESHOLD) {
        finalizeUpload(await uploadChunked(file))
      } else {
        finalizeUpload(await api.upload(file))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const uploadChunked = async (file) => {
    const init = await api.uploadChunkedInit(file.name, file.size)
    const uploadId = init.upload_id
    // reanuda si el servidor ya tiene bytes de un intento anterior
    let offset = init.received
    try {
      const st = await api.uploadChunkedGet(uploadId)
      offset = Math.min(st.received, file.size)
    } catch {
      // sin estado previo: empieza desde el offset del init
    }
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size)
      const blob = file.slice(offset, end)
      const res = await api.uploadChunkedPut(uploadId, offset, blob)
      offset = res.received
      setUploadProgress(offset / file.size)
    }
    return api.uploadChunkedComplete(uploadId, file.size)
  }

  const registerServer = async (path) => {
    setUploading(true)
    setStatsPending(false)
    setDataset(null)
    try {
      finalizeUpload(await api.registerUpload(path))
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const emitDataset = (res) =>
    onLoaded?.({
      mode: 'dataset',
      datasetId: res.dataset_id,
      kind: res.kind,
      fileCount: res.file_count,
      files: res.files.map((f) => ({
        filename: f.filename,
        records: f.records,
        total_bases: f.total_bases,
        stats_status: f.stats_status,
      })),
      status: res.status,
    })

  const pollDataset = async (datasetId) => {
    try {
      const st = await api.datasetStatus(datasetId)
      if (st.status === 'pending') {
        setTimeout(() => pollDataset(datasetId), 2000)
        return
      }
      setStatsPending(false)
      if (st.status === 'error') {
        setError(st.error || 'No se pudieron calcular las estadísticas del dataset.')
        return
      }
      setDataset(st)
      emitDataset(st)
    } catch (e) {
      setStatsPending(false)
      setError(e.message)
    }
  }

  const registerDataset = async (path) => {
    setUploading(true)
    setStatsPending(false)
    try {
      const res = await api.registerDataset(path)
      setDataset(res)
      setSource(`${res.file_count} archivos FASTA (dataset)`)
      emitDataset(res)
      if (res.status === 'pending') {
        setStatsPending(true)
        pollDataset(res.dataset_id)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const datasetReady = dataset && dataset.files.every((f) => f.stats_status !== 'pending')
  const datasetRecords = dataset
    ? dataset.files.reduce((a, f) => a + (f.records ?? 0), 0)
    : 0
  const datasetBases = dataset
    ? dataset.files.reduce((a, f) => a + (f.total_bases ?? 0), 0)
    : 0

  return (
    <Card
      title="Fasta"
      subtitle="Carga un .fasta y analízalo sin copiar y pegar (los archivos grandes se procesan en streaming)"
      actions={<Badge tone="accent">.fasta</Badge>}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".fasta,.fa,.fna,.txt"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Subiendo…' : 'Cargar .fasta'}
        </button>
        <span className="truncate font-mono text-xs text-ink-faint">{source}</span>
      </div>

      {uploadProgress != null && uploadProgress < 1 && (
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full rounded-t bg-gradient-to-r from-accent-soft to-accent shadow-glow transition-all"
              style={{ width: `${Math.round(uploadProgress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-ink-faint">
            Subiendo por partes… {Math.round(uploadProgress * 100)}%
          </p>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          className="input flex-1 font-mono text-xs"
          value={serverPath}
          onChange={(e) => setServerPath(e.target.value)}
          placeholder="/ruta/en/el/servidor/genoma.fna"
          spellCheck={false}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => registerServer(serverPath.trim())}
          disabled={uploading || !serverPath.trim()}
        >
          Registrar ruta
        </button>
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">
        Para genomas de decenas de GB: registra un archivo ya presente en el servidor en vez de
        subirlo por HTTP.
      </p>

      <div className="mt-2 flex items-center gap-2">
        <input
          className="input flex-1 font-mono text-xs"
          value={datasetPath}
          onChange={(e) => setDatasetPath(e.target.value)}
          placeholder="/ruta/al/dataset/ncbi (carpeta o .zip)"
          spellCheck={false}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => registerDataset(datasetPath.trim())}
          disabled={uploading || !datasetPath.trim()}
        >
          Registrar dataset
        </button>
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">
        Dataset NCBI (descarga .zip de NCBI): descubre todos sus FASTA y analízalos a la vez
        (p. ej. GCA + GCF del mismo genoma).
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
          {error}
        </p>
      )}

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-faint">
            Cabecera del fasta
          </span>
          <span className="h-px flex-1 bg-line/40" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="rounded-lg border border-line/30 bg-panel-2/40 px-3 py-2">
              <div className="label">{f.label}</div>
              <div className="truncate font-mono text-sm text-ink">{meta[f.key] ?? '—'}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          {statsPending
            ? 'Calculando estadísticas del dataset…'
            : dataset
              ? `${dataset.file_count} archivos FASTA${
                  datasetReady
                    ? ` · ${datasetRecords.toLocaleString()} registros · ${datasetBases.toLocaleString()} pb`
                    : ''
                }`
              : `${recordCount} ${recordCount === 1 ? 'registro' : 'registros'}${
                  totalBases != null ? ` · ${totalBases.toLocaleString()} pb` : ''
                }`}
        </p>
      </div>
    </Card>
  )
}