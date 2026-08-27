import { useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, PageHeader } from '../components/ui.jsx'
import FastaPanel from '../components/FastaPanel.jsx'
import {
  IconDna,
  IconCog,
  IconChart,
  IconScissors,
  IconPulse,
  IconPlay,
  IconStack,
} from '../components/icons.jsx'

const REF =
  'ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT'

const READS_SAMPLE = (() => {
  const lines = []
  for (let i = 0; i < 30; i++) {
    lines.push(`ACGTACGTACGTACGTACGTACGT,${(i * 2) % 20},+`)
  }
  return lines.join('\n')
})()

const TYPE_TONE = { SNV: 'warn', DEL: 'bad' }

export default function Variants() {
  const [reference, setReference] = useState(REF)
  const [readsText, setReadsText] = useState(READS_SAMPLE)
  const [minDepth, setMinDepth] = useState(5)
  const [minAltFreq, setMinAltFreq] = useState(0.2)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [bigFile, setBigFile] = useState(false)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const reads = readsText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => {
          const [sequence, start, strand = '+'] = l.split(',').map((p) => p.trim())
          if (!sequence || start === undefined) {
            throw new Error(`Lectura inválida: "${l}" (formato: secuencia,start,strand)`)
          }
          return { sequence: sequence.toUpperCase(), start: Number(start), strand }
        })
      if (!reads.length) throw new Error('Introduce al menos una lectura')
      const res = await api.callVariants({
        reference: reference.toUpperCase(),
        reads,
        min_depth: minDepth,
        min_alt_freq: minAltFreq,
      })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        index="05 · Análisis"
        title="Variantes"
        subtitle="Pileup y llamada de SNVs/deleciones sobre GPU"
        icon={<IconDna className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <FastaPanel
            disableUpload
            onLoaded={(info) => {
              if (info.mode === 'inline') {
                setBigFile(false)
                setReference(info.records[0].sequence)
              } else {
                setBigFile(true)
              }
            }}
          />

          {bigFile && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
              El archivo cargado es demasiado grande para el análisis de variantes; esta vista
              trabaja con referencia y lecturas pequeñas. Para genomas completos usa Control de
              calidad o K-mers.
            </div>
          )}

          <Card title="Entrada" icon={<IconCog className="h-5 w-5" />}>
            <label className="label">Referencia</label>
            <textarea
              className="input h-24 font-mono"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              spellCheck={false}
            />

            <label className="label mt-3">Lecturas — formato: secuencia,start,strand</label>
            <textarea
              className="input h-44 font-mono"
              value={readsText}
              onChange={(e) => setReadsText(e.target.value)}
              spellCheck={false}
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Prof. mínima</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={minDepth}
                  onChange={(e) => setMinDepth(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Frec. mínima</label>
                <input
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.05}
                  className="input"
                  value={minAltFreq}
                  onChange={(e) => setMinAltFreq(Number(e.target.value))}
                />
              </div>
            </div>

            <button className="group btn-primary mt-3 w-full" onClick={run} disabled={loading}>
              <IconPlay className="h-4 w-4 transition-transform duration-300 group-hover:scale-125" />
              {loading ? 'Llamando…' : 'Llamar variantes'}
            </button>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {error && (
            <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
              {error}
            </div>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Variantes" value={result.total_variants} accent icon={<IconDna className="h-4 w-4" />} />
                <StatCard label="SNVs" value={result.snvs} icon={<IconStack className="h-4 w-4" />} />
                <StatCard label="Deleciones" value={result.deletions} icon={<IconScissors className="h-4 w-4" />} />
                <StatCard label="Cobertura media" value={`${result.mean_depth}x`} icon={<IconChart className="h-4 w-4" />} />
              </div>

              <Card
                title="Variantes detectadas"
                subtitle="SNVs y deleciones sobre la referencia"
                icon={<IconPulse className="h-5 w-5" />}
                actions={<Badge tone="accent">{result.total_variants} resultados</Badge>}
              >
                {result.variants.length === 0 ? (
                  <p className="text-sm text-ink-faint">
                    No se detectaron variantes con los umbrales actuales.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table-base min-w-[30rem]">
                      <thead>
                        <tr>
                          <th>Pos</th>
                          <th>Ref</th>
                          <th>Alt</th>
                          <th>Tipo</th>
                          <th className="text-right">Frec.</th>
                          <th className="text-right">Depth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.variants.map((v, i) => (
                          <tr key={i}>
                            <td className="font-mono">{v.position}</td>
                            <td className="font-mono">{v.ref.slice(0, 25)}</td>
                            <td className="font-mono text-accent-glow">{v.alt}</td>
                            <td>
                              <Badge tone={TYPE_TONE[v.type]}>{v.type}</Badge>
                            </td>
                            <td className="text-right font-mono">{v.freq.toFixed(2)}</td>
                            <td className="text-right font-mono">{v.depth}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {!result && !error && (
            <Card title="Ayuda" icon={<IconDna className="h-5 w-5" />}>
              <p className="text-sm text-ink-faint">
                El pileup acumula las bases de cada lectura sobre la referencia usando operaciones
                de dispersión en GPU y compara el consenso contra la referencia.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-dim">
                <li>Las lecturas deben estar alineadas (posición 0-based y hebra).</li>
                <li>SNV: consenso ≠ referencia con profundidad y frecuencia suficientes.</li>
                <li>DEL: región de referencia sin cobertura flanqueada por lecturas.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}