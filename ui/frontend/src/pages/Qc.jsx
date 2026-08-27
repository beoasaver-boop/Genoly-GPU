import { useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Bar, Badge, PageHeader } from '../components/ui.jsx'
import FastaPanel from '../components/FastaPanel.jsx'
import {
  IconFlask,
  IconList,
  IconPercent,
  IconRuler,
  IconStar,
  IconPlay,
  IconServer,
} from '../components/icons.jsx'

const SAMPLE =
  'ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT\n' +
  'GCGCGCGCGCATATATATATAGCGGCGCCGATATATATA\n' +
  'TTTTGGGGCCCCAAAATTTTGGGGCCCCAAAATTTTGGGG\n' +
  'AACCGGTTAACCGGTTAACCGGTTAACCGGTTAACCGGTT'

const COLORS = {
  A: 'bg-base-a shadow-glow',
  C: 'bg-base-c shadow-glow',
  G: 'bg-base-g shadow-glow',
  T: 'bg-base-t shadow-glow',
  N: 'bg-base-n',
}

function FileRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-ink-faint">{label}</dt>
      <dd className="truncate font-mono text-sm text-ink">{value ?? '—'}</dd>
    </div>
  )
}

export default function Qc() {
  const [sequences, setSequences] = useState(SAMPLE)
  const [upload, setUpload] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const analyze = async () => {
    setLoading(true)
    setError(null)
    try {
      let payload
      if (upload) {
        payload = { upload_id: upload.uploadId }
      } else {
        const seqs = sequences
          .split('\n')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length > 0)
        payload = { sequences: seqs }
      }
      const res = await api.analyzeQc(payload)
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const comp = result?.base_composition ?? {}
  const total = Object.values(comp).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-8">
      <PageHeader
        index="03 · Análisis"
        title="Control de calidad"
        subtitle="GC content, composición de bases y calidad sobre GPU"
        icon={<IconFlask className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <FastaPanel
            onLoaded={(info) => {
              if (info.mode === 'inline') {
                setUpload(null)
                setSequences(info.records.map((r) => r.sequence).join('\n'))
              } else {
                setUpload(info)
                setResult(null)
              }
            }}
          />

          {upload ? (
            <Card
              title="Archivo cargado"
              subtitle="Se analiza en streaming desde el servidor, sin cargar el archivo en memoria"
              icon={<IconServer className="h-5 w-5" />}
              actions={<Badge tone="ok">streaming</Badge>}
            >
              <dl>
                <FileRow label="Archivo" value={upload.source} />
                <FileRow label="Registros" value={upload.recordCount} />
                <FileRow label="Bases totales" value={upload.totalBases?.toLocaleString()} />
              </dl>
              <button className="btn-ghost mt-3 w-full" onClick={() => setUpload(null)}>
                Usar texto manual
              </button>
            </Card>
          ) : (
            <Card title="Secuencias" subtitle="Una secuencia por línea (FASTA sin cabeceras)" icon={<IconList className="h-5 w-5" />}>
              <textarea
                className="input h-56 font-mono"
                value={sequences}
                onChange={(e) => setSequences(e.target.value)}
                spellCheck={false}
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-ink-faint">
                  {sequences.trim() ? sequences.trim().split('\n').length : 0} secuencias
                </span>
                <button className="group btn-primary" onClick={analyze} disabled={loading}>
                  <IconPlay className="h-4 w-4 transition-transform duration-300 group-hover:scale-125" />
                  {loading ? 'Analizando…' : 'Analizar'}
                </button>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {error && (
            <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
              {error}
            </div>
          )}

          {!result && !error && (
            <Card>
              <p className="text-sm text-ink-faint">
                Introduce secuencias o carga un .fasta y pulsa{' '}
                <span className="font-semibold text-accent-glow">Analizar</span> para calcular el
                contenido GC y la composición de bases en GPU.
              </p>
            </Card>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Secuencias" value={result.num_sequences} icon={<IconList className="h-4 w-4" />} />
                <StatCard
                  label="GC"
                  value={`${result.gc_content_percent.toFixed(2)}%`}
                  accent
                  icon={<IconPercent className="h-4 w-4" />}
                />
                <StatCard label="Longitud media" value={`${result.mean_length} pb`} icon={<IconRuler className="h-4 w-4" />} />
                <StatCard
                  label="Calidad media"
                  value={result.quality_mean != null ? result.quality_mean.toFixed(1) : '—'}
                  icon={<IconStar className="h-4 w-4" />}
                />
              </div>

              <Card title="Composición de bases" icon={<IconPercent className="h-5 w-5" />} subtitle="Tintes fluorescentes por nucleótido">
                <div className="space-y-3">
                  {Object.entries(comp).map(([base, count]) => (
                    <div key={base} className="flex items-center gap-3">
                      <span className="w-5 font-mono font-bold text-ink">{base}</span>
                      <div className="flex-1">
                        <Bar value={total ? count / total : 0} color={COLORS[base]} glow />
                      </div>
                      <span className="w-28 text-right font-mono text-xs text-ink-faint">
                        {count} ({total ? ((count / total) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {result.quality_by_position && (
                <Card title="Calidad por posición" icon={<IconStar className="h-5 w-5" />} subtitle="Media Phred por base">
                  <div className="flex h-24 items-end gap-0.5">
                    {result.quality_by_position.map((q, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-accent/70 shadow-glow"
                        style={{ height: `${Math.max(4, (q / 45) * 100)}%` }}
                        title={`Pos ${i + 1}: ${q}`}
                      />
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}