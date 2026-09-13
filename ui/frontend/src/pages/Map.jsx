import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, PageHeader } from '../components/ui.jsx'
import {
  IconDna,
  IconList,
  IconTarget,
  IconPercent,
  IconStar,
  IconPlay,
  IconServer,
  IconScissors,
  IconStack,
} from '../components/icons.jsx'

const CHUNK_SIZE = 32 * 1024 * 1024
const CHUNK_THRESHOLD = 1024 * 1024 * 1024

function fmt(n) {
  return n?.toLocaleString()
}

// Sube un archivo (multipart o por partes si es > 1 GB) y devuelve su upload_id
async function uploadFile(file, onProgress) {
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
      onProgress?.(offset / file.size)
    }
    return api.uploadChunkedComplete(uploadId, file.size)
  }
  return api.upload(file)
}

function UploadRow({ label, accept, onUploaded, color }) {
  const ref = useRef(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)

  const handle = async (file) => {
    if (!file) return
    setBusy(true)
    setProgress(null)
    try {
      const res = await uploadFile(file, setProgress)
      setInfo(res)
      onUploaded?.(res)
      if (res.stats_status === 'pending') poll(res.upload_id)
    } finally {
      setBusy(false)
    }
  }

  const poll = async (uploadId) => {
    const st = await api.uploadStats(uploadId)
    if (st.stats_status === 'pending') {
      setTimeout(() => poll(uploadId), 2000)
      return
    }
    setInfo(st)
    onUploaded?.(st)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label">{label}</span>
        {info && <Badge tone={color}>{info.stats_status === 'ready' ? 'listo' : '…'}</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={`btn ${color === 'ok' ? 'btn-ghost' : 'btn-primary'}`}
          onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? 'Subiendo…' : 'Cargar'}
        </button>
        <span className="truncate font-mono text-xs text-ink-faint">{info?.filename ?? '—'}</span>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }} />
      {progress != null && progress < 1 && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
          <div className="h-full bg-accent shadow-glow" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {info?.records != null && (
        <p className="mt-1 text-[10px] text-ink-faint">
          {fmt(info.records)} {info.kind === 'fastq' ? 'lecturas' : 'registros'} · {fmt(info.total_bases)} pb
        </p>
      )}
    </div>
  )
}

function StrandBadge({ strand }) {
  return strand === '-' ? <Badge tone="bad">−</Badge> : <Badge tone="ok">+</Badge>
}

export default function Map() {
  const [refUpload, setRefUpload] = useState(null)
  const [readsUpload, setReadsUpload] = useState(null)
  const [serverPath, setServerPath] = useState('')
  const [params, setParams] = useState({ k: 15, stride: 1, min_seeds: 2 })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [callParams, setCallParams] = useState({ min_depth: 10, min_alt_freq: 0.2 })
  const [calling, setCalling] = useState(false)
  const [callProgress, setCallProgress] = useState(null)
  const [variants, setVariants] = useState(null)
  const [callError, setCallError] = useState(null)

  const registerRef = async (path) => {
    setError(null)
    try {
      const res = await api.registerUpload(path)
      setRefUpload(res)
      if (res.stats_status === 'pending') {
        const st = await api.uploadStats(res.upload_id)
        setRefUpload(st)
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const run = async () => {
    if (!refUpload || !readsUpload) return
    setRunning(true)
    setError(null)
    setResult(null)
    setVariants(null)
    try {
      const job = await api.mapReads({
        ref_upload_id: refUpload.upload_id,
        reads_upload_id: readsUpload.upload_id,
        produce_sam: true,
        ...params,
      })
      const res = await api.jobEvents(job.job_id, { onProgress: (p) => setProgress(p) })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const callVariants = async () => {
    if (!result?.sam_upload_id || !refUpload) return
    setCalling(true)
    setCallError(null)
    setVariants(null)
    try {
      const job = await api.callVariantsFile({
        ref_upload_id: refUpload.upload_id,
        sam_upload_id: result.sam_upload_id,
        ...callParams,
      })
      const res = await api.jobEvents(job.job_id, { onProgress: (p) => setCallProgress(p) })
      setVariants(res)
    } catch (e) {
      setCallError(e.message)
    } finally {
      setCalling(false)
      setCallProgress(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        index="02 · Alineamiento"
        title="Mapeo"
        subtitle="Ubica lecturas limpias en un genoma de referencia (seed-and-extend, GPU)"
        icon={<IconDna className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Entrada" subtitle="Referencia y lecturas (ambas subidas al servidor)"
            icon={<IconServer className="h-5 w-5" />}>
            <div className="space-y-4">
              <UploadRow label="Referencia (.fasta/.fna)"
                accept=".fasta,.fa,.fna,.txt" color="accent" onUploaded={setRefUpload} />
              <div className="flex items-center gap-2">
                <input className="input flex-1 font-mono text-xs" placeholder="/ruta/ref.fna"
                  value={serverPath}
                  onChange={(e) => setServerPath(e.target.value)} spellCheck={false} />
                <button className="btn-ghost" onClick={() => registerRef(serverPath.trim())}
                  disabled={!serverPath.trim()}>Registrar ruta</button>
              </div>
              <UploadRow label="Lecturas (.fastq)"
                accept=".fastq,.fq" color="ok" onUploaded={setReadsUpload} />
            </div>
          </Card>

          <Card title="Parámetros" icon={<IconTarget className="h-5 w-5" />}>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">k (seed)</label>
                <input type="number" min={1} max={31} className="input" value={params.k}
                  onChange={(e) => setParams({ ...params, k: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">stride</label>
                <input type="number" min={1} className="input" value={params.stride}
                  onChange={(e) => setParams({ ...params, stride: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">min. seeds</label>
                <input type="number" min={1} className="input" value={params.min_seeds}
                  onChange={(e) => setParams({ ...params, min_seeds: Number(e.target.value) })} />
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ink-faint">
              Mayor stride reduce memoria del índice para genomas grandes.
            </p>
            <button className="btn-primary mt-3 w-full" onClick={run}
              disabled={running || !refUpload || !readsUpload}>
              <IconPlay className="h-4 w-4" />
              {running ? 'Mapeando…' : 'Mapear lecturas'}
            </button>
            {progress?.stage === 'index' && (
              <p className="mt-2 text-xs text-ink-faint">
                Indexando referencia… {fmt(progress.bases)} pb ({fmt(progress.seeds)} seeds)
              </p>
            )}
            {progress?.stage === 'map' && (
              <p className="mt-2 text-xs text-ink-faint">
                Mapeando… {fmt(progress.reads)} lecturas
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
                {error}
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <StatCard label="Lecturas" value={fmt(result.total_reads)} icon={<IconList className="h-4 w-4" />} />
                <StatCard label="Mapeadas" value={fmt(result.mapped)} icon={<IconTarget className="h-4 w-4" />} />
                <StatCard label="% mapeo" value={`${result.mapping_rate}%`} accent icon={<IconPercent className="h-4 w-4" />} />
                <StatCard label="Identidad media" value={`${result.mean_identity}%`} icon={<IconStar className="h-4 w-4" />} />
                <StatCard label="Bases ref." value={fmt(result.ref_bases)} icon={<IconDna className="h-4 w-4" />} />
              </div>

              <Card title="Lecturas mapeadas (muestra)"
                subtitle={`k=${result.k} · stride=${result.stride} · ${result.hits.length} de ${result.mapped}`}
                icon={<IconList className="h-5 w-5" />}>
                <div className="overflow-x-auto">
                  <table className="table-base min-w-[36rem]">
                    <thead>
                      <tr>
                        <th>Lectura</th>
                        <th>Referencia</th>
                        <th className="text-right">Posición</th>
                        <th>Hebra</th>
                        <th className="text-right">Identidad</th>
                        <th className="text-right">Score</th>
                        <th>CIGAR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.hits.map((h, i) => (
                        <tr key={i}>
                          <td className="font-mono text-ink-faint">{h.read_id}</td>
                          <td className="font-mono">{h.ref_name}</td>
                          <td className="text-right font-mono">{fmt(h.ref_start)}</td>
                          <td><StrandBadge strand={h.strand} /></td>
                          <td className="text-right font-mono">{h.identity_percent}%</td>
                          <td className="text-right font-mono">{h.score}</td>
                          <td className="font-mono text-accent-glow">{h.cigar}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Coordenadas 0-based en la hebra forward (convención SAM). La salida SAM/BAM completa llega en la fase de procesamiento.
                </p>
              </Card>

              <Card title="Llamada de variantes" subtitle="SNV y deleciones desde el SAM mapeado (GPU)"
                icon={<IconScissors className="h-5 w-5" />}>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label">Profundidad mín.</label>
                    <input type="number" className="input w-28" min={1}
                      value={callParams.min_depth}
                      onChange={(e) => setCallParams({ ...callParams, min_depth: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="label">Frec. alt. mín.</label>
                    <input type="number" className="input w-28" min={0} max={1} step={0.05}
                      value={callParams.min_alt_freq}
                      onChange={(e) => setCallParams({ ...callParams, min_alt_freq: Number(e.target.value) })} />
                  </div>
                  <button className="btn-primary" onClick={callVariants}
                    disabled={calling || !result?.sam_upload_id}>
                    <IconPlay className="h-4 w-4" />
                    {calling ? 'Llamando…' : 'Llamar variantes'}
                  </button>
                  {result?.sam_upload_id && (
                    <a className="btn-ghost" href={api.downloadUrl(result.sam_upload_id)} download>
                      Descargar SAM
                    </a>
                  )}
                </div>
                {calling && callProgress && (
                  <p className="mt-2 text-xs text-ink-faint">
                    {callProgress.sequence} · región {callProgress.region}/{callProgress.regions} · {fmt(callProgress.variants)} variantes
                  </p>
                )}
                {callError && (
                  <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
                    {callError}
                  </p>
                )}
                {variants && (
                  <div className="mt-4">
                    <div className="mb-3 grid grid-cols-3 gap-3">
                      <StatCard label="Variantes" value={fmt(variants.total_variants)} accent icon={<IconStack className="h-4 w-4" />} />
                      <StatCard label="SNVs" value={fmt(variants.snvs)} icon={<IconDna className="h-4 w-4" />} />
                      <StatCard label="Deleciones" value={fmt(variants.deletions)} icon={<IconScissors className="h-4 w-4" />} />
                    </div>
                    {variants.vcf_upload_id && (
                      <a className="btn-ghost mb-3 inline-flex" href={api.downloadUrl(variants.vcf_upload_id)} download>
                        Descargar VCF
                      </a>
                    )}
                    <div className="overflow-x-auto">
                      <table className="table-base min-w-[34rem]">
                        <thead>
                          <tr>
                            <th>Secuencia</th>
                            <th className="text-right">Pos</th>
                            <th>Ref</th>
                            <th>Alt</th>
                            <th>Tipo</th>
                            <th className="text-right">Prof.</th>
                            <th className="text-right">Frec.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variants.sample.slice(0, 100).map((v, i) => (
                            <tr key={i}>
                              <td className="font-mono text-ink-faint">{v.sequence}</td>
                              <td className="text-right font-mono">{fmt(v.position)}</td>
                              <td className="font-mono">{v.ref}</td>
                              <td className="font-mono text-accent-glow">{v.alt}</td>
                              <td><Badge tone={v.type === 'SNV' ? 'accent' : 'warn'}>{v.type}</Badge></td>
                              <td className="text-right font-mono">{v.depth}</td>
                              <td className="text-right font-mono">{(v.freq * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-sm text-ink-faint">
                Sube una <span className="font-semibold text-accent-glow">referencia</span> (FASTA)
                y las <span className="font-semibold text-accent-glow">lecturas</span> (FASTQ), ajusta
                k/stride y pulsa <span className="font-semibold text-accent-glow">Mapear lecturas</span>.
                El mapeo usa seeds k-mer + extensión con el alineador nativo (parasail), aislado en un
                proceso propio para no tumbar la API.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}