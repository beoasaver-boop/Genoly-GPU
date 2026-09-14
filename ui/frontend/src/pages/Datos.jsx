import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { Card, StatCard, Badge, Bar, PageHeader } from '../components/ui.jsx'
import { useQData } from '../qdata.jsx'
import {
  IconServer,
  IconList,
  IconCog,
  IconPercent,
  IconStack,
  IconPlay,
  IconTarget,
  IconRefresh,
} from '../components/icons.jsx'

const CHUNK_SIZE = 32 * 1024 * 1024
const CHUNK_THRESHOLD = 1024 * 1024 * 1024

function fmt(n) {
  return n?.toLocaleString()
}

const TYPE_TONE = { numeric: 'ok', text: 'slate', mixed: 'warn', empty: 'bad' }

export default function Datos() {
  const inputRef = useRef(null)
  const { qdata, setQdata } = useQData()
  const navigate = useNavigate()
  const [upload, setUpload] = useState(null)
  const [serverPath, setServerPath] = useState('')
  const [preview, setPreview] = useState(null)
  const [options, setOptions] = useState({
    phenotype_col: 0,
    impute_method: 'media',
    max_column_missingness: 1.0,
    min_individuals: 5,
    min_markers: 2,
  })
  const [running, setRunning] = useState(false)
  const [cleanResult, setCleanResult] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const uploadFile = async (file) => {
    if (file.size > CHUNK_THRESHOLD) {
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
      }
      return api.uploadChunkedComplete(uploadId, file.size)
    }
    return api.upload(file)
  }

  const handleFile = async (file) => {
    if (!file) return
    setError(null)
    setPreview(null)
    setCleanResult(null)
    try {
      const res = await uploadFile(file)
      setUpload(res)
      if (res.stats_status === 'pending') pollStats(res.upload_id)
      else loadPreview(res.upload_id)
    } catch (e) {
      setError(e.message)
    }
  }

  const pollStats = async (id) => {
    const st = await api.uploadStats(id)
    if (st.stats_status === 'pending') {
      setTimeout(() => pollStats(id), 2000)
      return
    }
    setUpload(st)
    loadPreview(id)
  }

  const registerServer = async (path) => {
    setError(null)
    setPreview(null)
    setCleanResult(null)
    try {
      const res = await api.registerUpload(path)
      setUpload(res)
      if (res.stats_status === 'pending') pollStats(res.upload_id)
      else loadPreview(res.upload_id)
    } catch (e) {
      setError(e.message)
    }
  }

  const loadPreview = async (id) => {
    try {
      setPreview(await api.qdataPreview(id))
    } catch (e) {
      setError(e.message)
    }
  }

  // mantener la columna de fenotipo válida al cargar el perfil
  useEffect(() => {
    if (!preview?.columns?.length) return
    const max = preview.columns.length - 1
    setOptions((o) => ({ ...o, phenotype_col: Math.min(o.phenotype_col, max) }))
  }, [preview])

  const run = async () => {
    if (!upload) return
    setRunning(true)
    setError(null)
    setCleanResult(null)
    try {
      const job = await api.qdataClean({
        upload_id: upload.upload_id,
        ...options,
      })
      const res = await api.jobEvents(job.job_id, { onProgress: (p) => setProgress(p) })
      const matrix = await api.qdataGet(res.clean_id)
      setQdata({ ...matrix, source: upload.filename })
      setCleanResult({ ...res, n_individuals: matrix.phenotypes.length })
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const sendTo = (path) => navigate(path)

  const columns = preview?.columns ?? []
  const maxMissing = Math.max(...columns.map((c) => c.missing_pct), 0)
  const report = cleanResult?.report

  return (
    <div className="space-y-8">
      <PageHeader
        index="Datos · Genética cuantitativa"
        title="Carga y limpieza"
        subtitle="CSV/Excel robusto: perfilado, limpieza, imputación y filtrado antes de modelar"
        icon={<IconServer className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Archivo" subtitle="CSV/TSV/Excel (los grandes se suben por partes)"
            icon={<IconServer className="h-5 w-5" />}>
            <div className="flex items-center gap-2">
              <button className="btn-primary" onClick={() => inputRef.current?.click()}>
                Cargar CSV / Excel
              </button>
              <span className="truncate font-mono text-xs text-ink-faint">
                {upload?.filename ?? '—'}
              </span>
            </div>
            <input ref={inputRef} type="file" accept=".csv,.tsv,.xlsx,.xls" className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
            <div className="mt-2 flex items-center gap-2">
              <input className="input flex-1 font-mono text-xs" placeholder="/ruta/datos.csv"
                value={serverPath} onChange={(e) => setServerPath(e.target.value)} spellCheck={false} />
              <button className="btn-ghost" onClick={() => registerServer(serverPath.trim())}
                disabled={!serverPath.trim()}>Registrar</button>
            </div>
            {upload?.records != null && (
              <p className="mt-1 text-[10px] text-ink-faint">
                {fmt(upload.records)} filas · {upload.total_bases != null && upload.records
                  ? `${Math.round(upload.total_bases / Math.max(1, upload.records))} columnas`
                  : ''}
              </p>
            )}
          </Card>

          <Card title="Limpieza" subtitle="Opciones aplicadas al limpiar"
            icon={<IconCog className="h-5 w-5" />}>
            <label className="label">Columna de fenotipo</label>
            <select className="input" value={options.phenotype_col}
              onChange={(e) => setOptions({ ...options, phenotype_col: Number(e.target.value) })}>
              {columns.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.index}: {c.name} ({c.type})
                </option>
              ))}
            </select>
            <label className="label mt-3">Imputación de dosis perdidas</label>
            <select className="input" value={options.impute_method}
              onChange={(e) => setOptions({ ...options, impute_method: e.target.value })}>
              <option value="media">Media</option>
              <option value="moda">Moda</option>
            </select>
            <label className="label mt-3">Máx. datos perdidos por marcador ({Math.round(options.max_column_missingness * 100)}%)</label>
            <input type="range" min={0} max={1} step={0.05} className="w-full accent-accent"
              value={options.max_column_missingness}
              onChange={(e) => setOptions({ ...options, max_column_missingness: Number(e.target.value) })} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Mín. individuos</label>
                <input type="number" min={3} className="input" value={options.min_individuals}
                  onChange={(e) => setOptions({ ...options, min_individuals: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Mín. marcadores</label>
                <input type="number" min={1} className="input" value={options.min_markers}
                  onChange={(e) => setOptions({ ...options, min_markers: Number(e.target.value) })} />
              </div>
            </div>

            <button className="btn-primary mt-3 w-full" onClick={run} disabled={running || !upload}>
              <IconPlay className="h-4 w-4" />
              {running ? 'Limpiando…' : 'Limpiar y preparar'}
            </button>
            {running && progress?.stage === 'clean' && (
              <p className="mt-2 text-xs text-ink-faint">
                {fmt(progress.rows)} individuos · {progress.markers} marcadores
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
                {error}
              </p>
            )}
          </Card>

          {cleanResult && (
            <Card title="Enviar al análisis" subtitle="La matriz limpia está lista"
              icon={<IconTarget className="h-5 w-5" />}>
              <button className="btn-primary w-full" onClick={() => sendTo('/quantitative')}>
                Enviar a Modelos mixtos
              </button>
              <button className="btn-ghost mt-2 w-full" onClick={() => sendTo('/gblup')}>
                Enviar a GBLUP
              </button>
              {qdata?.source && (
                <p className="mt-2 text-[11px] text-ink-faint">
                  En sesión: <span className="font-mono text-accent-glow">{qdata.source}</span>
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {cleanResult && report && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Individuos" value={fmt(report.final_rows)} icon={<IconList className="h-4 w-4" />} />
                <StatCard label="Marcadores" value={fmt(report.final_markers)} icon={<IconStack className="h-4 w-4" />} />
                <StatCard label="Celdas imputadas" value={fmt(report.imputed_cells)} accent icon={<IconPercent className="h-4 w-4" />} />
                <StatCard label="Filas sin fenotipo" value={fmt(report.dropped_rows_no_phenotype)} icon={<IconList className="h-4 w-4" />} />
              </div>

              <Card title="Reporte de limpieza" icon={<IconRefresh className="h-5 w-5" />}
                subtitle={`Fenotipo: ${report.phenotype_column} · imputación: ${report.impute_method}`}>
                <p className="mb-1 text-xs text-ink-faint">Columnas descartadas</p>
                {report.dropped_columns?.length ? (
                  <ul className="mb-3 space-y-1">
                    {report.dropped_columns.map((dc, i) => (
                      <li key={i} className="flex justify-between rounded border border-line/30 bg-panel-2/40 px-3 py-1 text-xs">
                        <span className="font-mono">{dc.name}</span>
                        <span className="text-ink-faint">{dc.reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-3 text-xs text-ink-faint">Ninguna.</p>
                )}
                <div className="space-y-1">
                  {columns.map((c) => (
                    <div key={c.index} className="flex items-center gap-3">
                      <span className="w-28 truncate font-mono text-xs">{c.name}</span>
                      <Badge tone={TYPE_TONE[c.type] || 'slate'}>{c.type}</Badge>
                      <div className="flex-1">
                        <Bar value={c.missing_pct / Math.max(maxMissing, 1)}
                          color={c.missing_pct > 50 ? 'bg-bad/70' : 'bg-accent/70'} glow />
                      </div>
                      <span className="w-14 text-right font-mono text-[10px] text-ink-faint">
                        {c.missing_pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {preview && (
            <Card title="Vista previa" subtitle={`Delimitador y cabecera detectados · ${fmt(preview.rows_preview)} filas`}
              icon={<IconList className="h-5 w-5" />}
              actions={<Badge tone={preview.header_detected ? 'ok' : 'warn'}>
                {preview.header_detected ? 'cabecera' : 'sin cabecera'}</Badge>}>
              <div className="overflow-x-auto">
                <table className="table-base min-w-[30rem]">
                  <thead>
                    <tr>
                      {preview.sample_rows[0]?.map((_, j) => (
                        <th key={j} className="text-xs">{preview.column_names[j] ?? `col_${j + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample_rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="font-mono text-xs">{cell ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!preview && !cleanResult && (
            <Card>
              <p className="text-sm text-ink-faint">
                Sube o registra un <span className="font-semibold text-accent-glow">.csv / .tsv / .xlsx</span> sucio
                (cabeceras raras, decimales con coma, celdas vacías, columnas de texto…). Genoly lo perfilará,
                te dejará elegir la columna de fenotipo y los criterios, y lo limpiará/imputará para enviarlo a
                Modelos mixtos o GBLUP.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}