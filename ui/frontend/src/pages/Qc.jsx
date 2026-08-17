import { useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, Bar } from '../components/ui.jsx'

const SAMPLE =
  'ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT\n' +
  'GCGCGCGCGCATATATATATAGCGGCGCCGATATATATA\n' +
  'TTTTGGGGCCCCAAAATTTTGGGGCCCCAAAATTTTGGGG\n' +
  'AACCGGTTAACCGGTTAACCGGTTAACCGGTTAACCGGTT'

const COLORS = { A: 'bg-sky-500', C: 'bg-emerald-500', G: 'bg-amber-500', T: 'bg-rose-500', N: 'bg-slate-500' }

export default function Qc() {
  const [sequences, setSequences] = useState(SAMPLE)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const analyze = async () => {
    setLoading(true)
    setError(null)
    try {
      const seqs = sequences
        .split('\n')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0)
      const res = await api.analyzeQc({ sequences: seqs })
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-white">Control de calidad</h1>
        <p className="mt-1 text-sm text-slate-400">
          GC content, composición de bases y calidad sobre GPU
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Secuencias" subtitle="Una secuencia por línea (FASTA sin cabeceras)">
          <textarea
            className="input h-56 font-mono"
            value={sequences}
            onChange={(e) => setSequences(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {sequences.trim() ? sequences.trim().split('\n').length : 0} secuencias
            </span>
            <button className="btn-primary" onClick={analyze} disabled={loading}>
              {loading ? 'Analizando…' : 'Analizar'}
            </button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {!result && !error && (
            <Card>
              <p className="text-sm text-slate-500">
                Introduce secuencias y pulsa <span className="font-semibold text-slate-300">Analizar</span>{' '}
                para calcular el contenido GC y la composición de bases en GPU.
              </p>
            </Card>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Secuencias" value={result.num_sequences} />
                <StatCard
                  label="GC"
                  value={`${result.gc_content_percent.toFixed(2)}%`}
                  accent
                />
                <StatCard label="Longitud media" value={`${result.mean_length} pb`} />
                <StatCard
                  label="Calidad media"
                  value={result.quality_mean != null ? result.quality_mean.toFixed(1) : '—'}
                />
              </div>

              <Card title="Composición de bases">
                <div className="space-y-3">
                  {Object.entries(comp).map(([base, count]) => (
                    <div key={base} className="flex items-center gap-3">
                      <span className="w-5 font-mono font-bold text-slate-300">{base}</span>
                      <div className="flex-1">
                        <Bar value={total ? count / total : 0} color={COLORS[base]} />
                      </div>
                      <span className="w-24 text-right font-mono text-xs text-slate-400">
                        {count} ({total ? ((count / total) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {result.quality_by_position && (
                <Card title="Calidad por posición" subtitle="Media Phred por base">
                  <div className="flex h-24 items-end gap-0.5">
                    {result.quality_by_position.map((q, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-accent/60"
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