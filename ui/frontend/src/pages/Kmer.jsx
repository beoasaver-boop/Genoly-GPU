import { useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, PageHeader } from '../components/ui.jsx'
import { IconHash, IconStack, IconGlobe, IconType, IconPlay, IconChart } from '../components/icons.jsx'

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
    <div className="space-y-8">
      <PageHeader
        index="04 · Análisis"
        title="K-mers"
        subtitle="Conteo y espectro de k-mers acelerado por GPU (convolución 1D)"
        icon={<IconHash className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Parámetros" icon={<IconHash className="h-5 w-5" />}>
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
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-dim">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={canonical}
                    onChange={(e) => setCanonical(e.target.checked)}
                  />
                  Canónico
                </label>
              </div>
            </div>

            <button className="group btn-primary mt-3 w-full" onClick={run} disabled={loading}>
              <IconPlay className="h-4 w-4 transition-transform duration-300 group-hover:scale-125" />
              {loading ? 'Contando…' : 'Contar k-mers'}
            </button>
          </Card>

          {result && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="K-mers únicos" value={result.total_unique.toLocaleString()} accent icon={<IconHash className="h-4 w-4" />} />
              <StatCard label="Total instancias" value={result.total_kmers.toLocaleString()} icon={<IconStack className="h-4 w-4" />} />
              {result.genome_estimate && (
                <StatCard
                  label="Estimación genoma"
                  value={`${Math.round(result.genome_estimate).toLocaleString()} pb`}
                  icon={<IconGlobe className="h-4 w-4" />}
                />
              )}
              <StatCard label="k" value={result.k} icon={<IconType className="h-4 w-4" />} />
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {error && (
            <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
              {error}
            </div>
          )}

          {result && (
            <>
              <Card
                title="Top k-mers"
                subtitle="Los más frecuentes"
                icon={<IconHash className="h-5 w-5" />}
                actions={<Badge tone="accent">k={result.k}</Badge>}
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
                        <td className="text-ink-faint">{i + 1}</td>
                        <td className="font-mono text-accent-glow">{km.kmer}</td>
                        <td className="text-right font-mono">{km.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card title="Espectro k-mer" icon={<IconChart className="h-5 w-5" />} subtitle="Distribución de multiplicidades">
                <div className="flex h-32 items-end gap-1">
                  {Object.entries(spectrum)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([mult, freq]) => (
                      <div key={mult} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-accent to-accent-soft shadow-glow"
                          style={{
                            height: `${(freq / Math.max(...Object.values(spectrum))) * 100}%`,
                          }}
                          title={`multiplicidad ${mult}: ${freq} k-mers`}
                        />
                        {Object.keys(spectrum).length <= 20 && (
                          <span className="text-[10px] text-ink-faint">{mult}</span>
                        )}
                      </div>
                    ))}
                </div>
                <p className="mt-2 text-xs text-ink-faint">
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