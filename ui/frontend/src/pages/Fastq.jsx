import { useState, useRef } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, Bar, PageHeader } from '../components/ui.jsx'
import {
  IconFlask,
  IconList,
  IconPercent,
  IconRuler,
  IconStar,
  IconPlay,
  IconScissors,
  IconRefresh,
} from '../components/icons.jsx'

const CHUNK_SIZE = 32 * 1024 * 1024
const CHUNK_THRESHOLD = 1024 * 1024 * 1024

function fmt(n) {
  return n?.toLocaleString()
}

function QualityChart({ values }) {
  if (!values || values.length < 2) return null
  const W = 640
  const H = 220
  const PL = 36
  const PR = 10
  const PT = 12
  const PB = 24
  const PW = W - PL - PR
  const PH = H - PT - PB
  const maxQ = 45
  const X = (i) => PL + (i / (values.length - 1)) * PW
  const Y = (q) => PT + (1 - Math.min(q, maxQ) / maxQ) * PH
  const line = values
    .map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${X(values.length - 1).toFixed(1)},${PT + PH} L${X(0).toFixed(1)},${PT + PH} Z`
  const mid = values[Math.floor(values.length / 2)]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="q-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'rgb(var(--accent))', stopOpacity: 0.5 }} />
          <stop offset="100%" style={{ stopColor: 'rgb(var(--accent))', stopOpacity: 0.03 }} />
        </linearGradient>
      </defs>
      {[10, 20, 30, 40].map((g) => (
        <line key={g} x1={PL} x2={W - PR} y1={Y(g)} y2={Y(g)}
          stroke="rgb(var(--line) / 0.15)" strokeDasharray="2 4" />
      ))}
      <path d={area} fill="url(#q-area)" />
      <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 5px rgb(var(--accent) / 0.5))' }} />
      <line x1={PL} x2={W - PR} y1={PT + PH} y2={PT + PH} stroke="rgb(var(--line) / 0.4)" />
      <text x={PL} y={PT + PH + 16} className="font-mono" style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}>pos 1</text>
      <text x={W - PR} y={PT + PH + 16} textAnchor="end" className="font-mono"
        style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}>pos {values.length}</text>
      <text x={W / 2} y={PT + PH + 16} textAnchor="middle" className="font-mono"
        style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}>
        media {mid?.toFixed(1)} · Phred
      </text>
    </svg>
  )
}

function LengthHistogram({ values, binSize }) {
  if (!values || !values.length) return null
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-24 items-end gap-[2px]">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-t bg-accent/70 shadow-glow"
          style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
          title={`${(i + 1) * (binSize || 10)} pb: ${v} lecturas`} />
      ))}
    </div>
  )
}

export default function Fastq() {
  const inputRef = useRef(null)
  const [upload, setUpload] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [qcResult, setQcResult] = useState(null)
  const [qcProgress, setQcProgress] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [processResult, setProcessResult] = useState(null)
  const [processProgress, setProcessProgress] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [params, setParams] = useState({
    min_quality: 20,
    window_size: 5,
    min_length: 50,
    min_mean_quality: 20,
    max_n_ratio: 0.05,
  })

  const uploadChunked = async (file) => {
    const init = await api.uploadChunkedInit(file.name, file.size)
    const uploadId = init.upload_id
    let offset = init.received
    try {
      const st = await api.uploadChunkedGet(uploadId)
      offset = Math.min(st.received, file.size)
    } catch {
      // sin estado previo
    }
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size)
      const res = await api.uploadChunkedPut(uploadId, offset, file.slice(offset, end))
      offset = res.received
      setUploadProgress(offset / file.size)
    }
    return api.uploadChunkedComplete(uploadId, file.size)
  }

  const handleFile = async (file) => {
    if (!file) return
    setError(null)
    setQcResult(null)
    setProcessResult(null)
    setUploading(true)
    try {
      const res = file.size > CHUNK_THRESHOLD
        ? await uploadChunked(file)
        : await api.upload(file)
      setUpload(res)
      if (res.stats_status === 'pending') pollStats(res.upload_id)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const pollStats = async (uploadId) => {
    try {
      const st = await api.uploadStats(uploadId)
      if (st.stats_status === 'pending') {
        setTimeout(() => pollStats(uploadId), 2000)
        return
      }
      if (st.stats_status === 'error') {
        setError(st.error || 'No se pudieron calcular las estadísticas.')
        return
      }
      setUpload(st)
    } catch (e) {
      setError(e.message)
    }
  }

  const runQc = async (uploadId) => {
    setAnalyzing(true)
    setError(null)
    setQcResult(null)
    setQcProgress(null)
    try {
      const job = await api.fastqQc({ upload_id: uploadId })
      const res = await api.jobEvents(job.job_id, {
        onProgress: (p) => setQcProgress(p),
      })
      setQcResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const runProcess = async () => {
    if (!upload) return
    setProcessing(true)
    setError(null)
    setProcessResult(null)
    setProcessProgress(null)
    try {
      const job = await api.fastqProcess({ upload_id: upload.upload_id, ...params })
      const res = await api.jobEvents(job.job_id, {
        onProgress: (p) => setProcessProgress(p),
      })
      setProcessResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  const reanalyze = async () => {
    if (!processResult?.out_upload_id) return
    const st = await api.uploadStats(processResult.out_upload_id)
    setUpload(st)
    setProcessResult(null)
    setQcResult(null)
    runQc(processResult.out_upload_id)
  }

  const comp = qcResult?.base_composition ?? {}
  const total = Object.values(comp).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-8">
      <PageHeader
        index="01 · Preprocesamiento"
        title="FASTQ"
        subtitle="Control de calidad y limpieza de lecturas crudas (NGS / 3ª generación) en streaming"
        icon={<IconFlask className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card
            title="Lecturas crudas"
            subtitle="Sube un .fastq (los grandes se suben por partes y se analizan en streaming)"
            actions={<Badge tone="accent">.fastq</Badge>}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".fastq,.fq"
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
                {uploading ? 'Subiendo…' : 'Cargar .fastq'}
              </button>
              <span className="truncate font-mono text-xs text-ink-faint">
                {upload?.filename ?? '—'}
              </span>
            </div>

            {uploadProgress != null && uploadProgress < 1 && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-t bg-gradient-to-r from-accent-soft to-accent shadow-glow"
                  style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                />
              </div>
            )}

            {upload && (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-ink-faint">Lecturas</dt>
                  <dd className="font-mono">{fmt(upload.records) ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Bases</dt>
                  <dd className="font-mono">{fmt(upload.total_bases) ?? '—'}</dd>
                </div>
              </dl>
            )}

            {error && (
              <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
                {error}
              </p>
            )}
          </Card>

          <Card
            title="Preprocesamiento"
            subtitle="Trim por calidad (3') y filtrado de lecturas"
            icon={<IconScissors className="h-5 w-5" />}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Calidad mín. ventana</label>
                <input type="number" className="input" min={0} max={40}
                  value={params.min_quality}
                  onChange={(e) => setParams({ ...params, min_quality: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Ventana (pb)</label>
                <input type="number" className="input" min={1} max={20}
                  value={params.window_size}
                  onChange={(e) => setParams({ ...params, window_size: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Longitud mín.</label>
                <input type="number" className="input" min={0}
                  value={params.min_length}
                  onChange={(e) => setParams({ ...params, min_length: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Calidad media mín.</label>
                <input type="number" className="input" min={0} max={40} step={0.5}
                  value={params.min_mean_quality}
                  onChange={(e) => setParams({ ...params, min_mean_quality: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Máx. ratio N</label>
                <input type="number" className="input" min={0} max={1} step={0.01}
                  value={params.max_n_ratio}
                  onChange={(e) => setParams({ ...params, max_n_ratio: Number(e.target.value) })} />
              </div>
            </div>

            <button
              className="btn-primary mt-3 w-full"
              onClick={runProcess}
              disabled={processing || !upload}
            >
              <IconPlay className="h-4 w-4" />
              {processing ? 'Procesando…' : 'Procesar y filtrar'}
            </button>

            {processProgress && (
              <p className="mt-2 text-xs text-ink-faint">
                {fmt(processProgress.reads_in)} lecturas procesadas…
              </p>
            )}

            {processResult && (
              <div className="mt-3 rounded-lg border border-line/30 bg-panel-2/40 p-3">
                <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-ink-faint">Lecturas antes</dt>
                    <dd className="font-mono">{fmt(processResult.reads_in)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Lecturas limpias</dt>
                    <dd className="font-mono text-ok">{fmt(processResult.reads_out)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Bases antes</dt>
                    <dd className="font-mono">{fmt(processResult.bases_in)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Bases limpias</dt>
                    <dd className="font-mono text-ok">{fmt(processResult.bases_out)}</dd>
                  </div>
                </div>
                <button className="btn-ghost w-full" onClick={reanalyze} disabled={analyzing}>
                  <IconRefresh className="h-4 w-4" />
                  Re-analizar el FASTQ limpio
                </button>
              </div>
            )}
          </Card>

          <Card title="Analizar calidad" subtitle="Reporte FastQC-like en GPU/streaming"
            icon={<IconStar className="h-5 w-5" />}>
            <button
              className="btn-primary w-full"
              onClick={() => runQc(upload.upload_id)}
              disabled={analyzing || !upload}
            >
              <IconPlay className="h-4 w-4" />
              {analyzing ? 'Analizando…' : 'Analizar calidad'}
            </button>
            {analyzing && (
              <p className="mt-2 text-xs text-ink-faint">
                {fmt(qcProgress?.reads)} / {fmt(upload?.records ?? qcProgress?.reads)} lecturas…
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {qcResult ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <StatCard label="Lecturas" value={fmt(qcResult.num_reads)} icon={<IconList className="h-4 w-4" />} />
                <StatCard label="Bases" value={fmt(qcResult.total_bases)} icon={<IconList className="h-4 w-4" />} />
                <StatCard label="Calidad media" value={qcResult.mean_quality} accent icon={<IconStar className="h-4 w-4" />} />
                <StatCard label="GC" value={`${qcResult.gc_content_percent}%`} icon={<IconPercent className="h-4 w-4" />} />
                <StatCard label="Longitud media" value={`${qcResult.mean_read_length} pb`} icon={<IconRuler className="h-4 w-4" />} />
              </div>

              <Card title="Calidad por posición" subtitle="Media Phred por base (lecturas 5' → 3')"
                icon={<IconStar className="h-5 w-5" />}>
                <QualityChart values={qcResult.quality_by_position} />
              </Card>

              <Card title="Distribución de longitudes" subtitle={`Bin de ${qcResult.length_bin_size} pb`}
                icon={<IconRuler className="h-5 w-5" />}>
                <LengthHistogram values={qcResult.length_histogram} binSize={qcResult.length_bin_size} />
                <p className="mt-2 text-xs text-ink-faint">
                  min {qcResult.min_length} · max {fmt(qcResult.max_length)} pb
                </p>
              </Card>

              <Card title="Composición de bases" icon={<IconPercent className="h-5 w-5" />}>
                <div className="space-y-3">
                  {Object.entries(comp).map(([base, count]) => (
                    <div key={base} className="flex items-center gap-3">
                      <span className="w-5 font-mono font-bold text-ink">{base}</span>
                      <div className="flex-1">
                        <Bar value={total ? count / total : 0} color={base === 'N' ? 'bg-base-n' : 'bg-base-' + base.toLowerCase()} glow />
                      </div>
                      <span className="w-28 text-right font-mono text-xs text-ink-faint">
                        {fmt(count)} ({total ? ((count / total) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-sm text-ink-faint">
                Sube un .fastq y pulsa <span className="font-semibold text-accent-glow">Analizar calidad</span>
                para ver el reporte FastQC-like: calidad por posición, distribución de longitudes,
                GC y composición. Usa <span className="font-semibold text-accent-glow">Procesar y filtrar</span>
                para recortar por calidad y descartar lecturas de baja calidad.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}