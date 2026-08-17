import { useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge } from '../components/ui.jsx'

const SAMPLE =
  'ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT\n' +
  'GGGGCCCCAAAATTTTGGGGCCCCAAAATTTTGGGGCCCCAAAATTTTGGGGCCCCAAAATTTT\n' +
  'TATATATATATATATATATATATATATATATATATATATATATATATATATATATATATATATA\n' +
  'CGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCG'

export default function Kmer() {
  const [sequences, setSequences] = useState(SAMPLE)
  const [k, setK] = useState(21)
  const [canonical, setCanonical] = useState(true)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const seqs = sequences
        .split('\n')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0)
      if (!seqs.length) throw new Error('Introduce al menos una secuencia')
      const res = await api.countKmers({ sequences: seqs, k, canonical, min_abundance: 1, top: 25 })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const spectrum = result?.spectrum ?? {}
  const maxMult = Math.max(...Object.keys(spectrum).map(Number), 1)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-white">K-mers</h1>
        <p className="mt-1 text-sm text-slate-400">
          Conteo y espectro de k-mers acelerado por GPU (convolución 1D)
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Parámetros">
            <label className="label">Secuencias</label>
            <textarea
              className="input h-40 font-mono"
              value={sequences}
              onChange={(e) => setSequences(e.target.value)}
              spellCheck={false}
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">k</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="input"
                  value={k}
                  onChange={(e) => setK(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-500"
                    checked={canonical}
                    onChange={(e) => setCanonical(e.target.checked)}
                  />
                  Canónico
                </label>
              </div>
            </div>

            <button className="btn-primary mt-3 w-full" onClick={run} disabled={loading}>
              {loading ? 'Contando…' : 'Contar k-mers'}
            </button>
          </Card>

          {result && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="K-mers únicos" value={result.total_unique.toLocaleString()} accent />
              <StatCard label="Total instancias" value={result.total_kmers.toLocaleString()} />
              {result.genome_estimate && (
                <StatCard
                  label="Estimación genoma"
                  value={`${Math.round(result.genome_estimate).toLocaleString()} pb`}
                />
              )}
              <StatCard label="k" value={result.k} />
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {result && (
            <>
              <Card
                title="Top k-mers"
                subtitle="Los más frecuentes"
                actions={<Badge tone="indigo">k={result.k}</Badge>}
              >
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>K-mer</th>
                      <th className="text-right">Frecuencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.top_kmers.map((km, i) => (
                      <tr key={i}>
                        <td className="text-slate-500">{i + 1}</td>
                        <td className="font-mono text-accent-glow">{km.kmer}</td>
                        <td className="text-right font-mono">{km.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card title="Espectro k-mer" subtitle="Distribución de multiplicidades">
                <div className="flex h-32 items-end gap-1">
                  {Object.entries(spectrum)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([mult, freq]) => (
                      <div key={mult} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-accent to-accent-soft"
                          style={{ height: `${(freq / Math.max(...Object.values(spectrum))) * 100}%` }}
                          title={`multiplicidad ${mult}: ${freq} k-mers`}
                        />
                        {Object.keys(spectrum).length <= 20 && (
                          <span className="text-[10px] text-slate-500">{mult}</span>
                        )}
                      </div>
                    ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  El pico del espectro estima la cobertura media de la muestra.
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}