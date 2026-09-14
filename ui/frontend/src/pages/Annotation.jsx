import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, Bar, PageHeader } from '../components/ui.jsx'
import {
  IconTag,
  IconList,
  IconServer,
  IconPlay,
  IconDna,
  IconPercent,
} from '../components/icons.jsx'

function fmt(n) {
  return n?.toLocaleString()
}

export default function Annotation() {
  const gffRef = useRef(null)
  const [gff, setGff] = useState(null)
  const [gffPath, setGffPath] = useState('')
  const [variantsText, setVariantsText] = useState(
    'chr1,300,A,T\nchr1,1500,A,G\nchr1,8500,T,A',
  )
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const uploadGff = async (file) => {
    if (!file) return
    setError(null)
    try {
      const res = await api.upload(file)
      setGff(res)
      if (res.stats_status === 'pending') pollGff(res.upload_id)
    } catch (e) {
      setError(e.message)
    }
  }

  const pollGff = async (id) => {
    const st = await api.uploadStats(id)
    if (st.stats_status === 'pending') {
      setTimeout(() => pollGff(id), 2000)
      return
    }
    setGff(st)
  }

  const registerGff = async (path) => {
    setError(null)
    try {
      const res = await api.registerUpload(path)
      setGff(res)
      if (res.stats_status === 'pending') pollGff(res.upload_id)
    } catch (e) {
      setError(e.message)
    }
  }

  const parseVariants = () =>
    variantsText
      .trim()
      .split('\n')
      .map((line) => line.split(/[,;\t ]+/).filter(Boolean))
      .filter((p) => p.length >= 2)
      .map((p) => ({
        sequence: p[0],
        position: Number(p[1]),
        ref: p[2] || null,
        alt: p[3] || null,
      }))
      .filter((v) => v.sequence && Number.isFinite(v.position))

  const run = async () => {
    const variants = parseVariants()
    if (!gff || !variants.length) {
      setError('Sube/registra un GFF y añade variantes (secuencia,posición,...).')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const job = await api.annotateVariants({
        gff_upload_id: gff.upload_id,
        variants,
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

  const total = result?.annotated_count || 0

  return (
    <div className="space-y-8">
      <PageHeader
        index="05 · Anotación"
        title="Anotación funcional"
        subtitle="Mapea variantes a genes, regiones (CDS/intrón) y términos GO desde GFF/GTF"
        icon={<IconTag className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Anotación" subtitle="GFF3/GTF (o .gz) de la referencia"
            icon={<IconServer className="h-5 w-5" />}>
            <div className="flex items-center gap-2">
              <button className="btn-primary" onClick={() => gffRef.current?.click()}>
                Cargar GFF
              </button>
              <span className="truncate font-mono text-xs text-ink-faint">
                {gff?.filename ?? '—'}
              </span>
            </div>
            <input ref={gffRef} type="file" accept=".gff,.gff3,.gtf,.gz" className="hidden"
              onChange={(e) => { uploadGff(e.target.files?.[0]); e.target.value = '' }} />
            <div className="mt-2 flex items-center gap-2">
              <input className="input flex-1 font-mono text-xs" placeholder="/ruta/ann.gff3"
                value={gffPath} onChange={(e) => setGffPath(e.target.value)} spellCheck={false} />
              <button className="btn-ghost" onClick={() => registerGff(gffPath.trim())}
                disabled={!gffPath.trim()}>Registrar</button>
            </div>
          </Card>

          <Card title="Variantes" subtitle="Una por línea: secuencia,posición,ref,alt"
            icon={<IconDna className="h-5 w-5" />}>
            <textarea className="input h-40 font-mono text-xs" value={variantsText}
              onChange={(e) => setVariantsText(e.target.value)} spellCheck={false} />
            <button className="btn-primary mt-3 w-full" onClick={run} disabled={running || !gff}>
              <IconPlay className="h-4 w-4" />
              {running ? 'Anotando…' : 'Anotar variantes'}
            </button>
            {running && progress && (
              <p className="mt-2 text-xs text-ink-faint">
                {progress.features != null && `features: ${fmt(progress.features)} · `}
                {progress.annotated != null && `anotadas: ${fmt(progress.annotated)}`}
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
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Variantes" value={fmt(result.total)} icon={<IconList className="h-4 w-4" />} />
                <StatCard label="Anotadas" value={fmt(result.annotated_count)} accent icon={<IconTag className="h-4 w-4" />} />
                <StatCard label="Genes" value={Object.keys(result.by_gene).length} icon={<IconDna className="h-4 w-4" />} />
                <StatCard label="Términos GO" value={Object.keys(result.go_terms).length} icon={<IconPercent className="h-4 w-4" />} />
              </div>

              <Card title="Variantes anotadas" subtitle="Gen, región y términos GO"
                icon={<IconList className="h-5 w-5" />}>
                <div className="overflow-x-auto">
                  <table className="table-base min-w-[34rem]">
                    <thead>
                      <tr>
                        <th>Secuencia</th>
                        <th className="text-right">Pos</th>
                        <th>Gen</th>
                        <th>Región</th>
                        <th>Hebra</th>
                        <th>GO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.annotated.slice(0, 100).map((a, i) => (
                        <tr key={i}>
                          <td className="font-mono text-ink-faint">{a.seqid}</td>
                          <td className="text-right font-mono">{fmt(a.position)}</td>
                          <td className="font-mono">{a.gene_name || a.gene || '—'}</td>
                          <td><Badge tone={a.region === 'CDS' ? 'accent' : a.region === 'intron' ? 'warn' : 'slate'}>{a.region}</Badge></td>
                          <td className="font-mono">{a.strand}</td>
                          <td className="font-mono text-xs text-ink-faint">{a.go_terms.join(', ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {result.go_summary?.length > 0 && (
                <Card title="Ontología génica (GO)" subtitle="Términos más frecuentes en las variantes"
                  icon={<IconPercent className="h-5 w-5" />}>
                  <div className="space-y-2">
                    {result.go_summary.slice(0, 10).map((g) => (
                      <div key={g.id} className="flex items-center gap-3">
                        <span className="w-40 truncate font-mono text-xs text-ink">{g.name}</span>
                        <div className="flex-1"><Bar value={g.count / total} glow /></div>
                        <span className="w-12 text-right font-mono text-xs text-ink-faint">{g.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <p className="text-sm text-ink-faint">
                Sube la anotación (GFF3/GTF) de la referencia y pega variantes
                (una por línea: <span className="font-mono">secuencia,posición,ref,alt</span>).
                Genoly las mapeará a genes, región relativa (CDS/intrón/UTR) y términos GO.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}