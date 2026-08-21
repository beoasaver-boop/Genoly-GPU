import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, Bar, PageHeader } from '../components/ui.jsx'
import PreprocessReport from '../components/PreprocessReport.jsx'
import { makeSampleData, parseQuantData } from '../quantgen.js'
import { parseFileGrid, preprocessGrid } from '../tabular.js'

const SAMPLE = makeSampleData()

export default function Quantitative() {
  const fileInputRef = useRef(null)
  const [dataText, setDataText] = useState(SAMPLE)
  const [method, setMethod] = useState('reml')
  const [kinshipMethod, setKinshipMethod] = useState('vanraden')
  const [imputeMethod, setImputeMethod] = useState('media')
  const [maxIter, setMaxIter] = useState(100)
  const [report, setReport] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setResult(null)
    try {
      const grid = await parseFileGrid(file)
      const out = preprocessGrid(grid, { imputeMethod })
      setDataText(
        out.phenotypes
          .map((p, i) => [p, ...out.genotypes[i]].join(','))
          .join('\n'),
      )
      setReport({ ...out.report, source: file.name })
    } catch (err) {
      setReport(null)
      setError(err.message)
    }
  }

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const { phenotypes, genotypes } = parseQuantData(dataText)
      const res = await api.fitLmm({
        phenotypes,
        genotypes,
        method,
        kinship_method: kinshipMethod,
        max_iter: maxIter,
      })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const blupTop = result
    ? [...result.blup].sort((a, b) => b.value - a.value).slice(0, 15)
    : []
  const blupMin = blupTop.length ? blupTop[blupTop.length - 1].value : 0
  const blupMax = blupTop.length ? blupTop[0].value : 1

  return (
    <div className="space-y-8">
      <PageHeader
        index="06 · Análisis"
        title="Genética cuantitativa"
        subtitle="Modelos lineales mixtos (REML/ML) y valores de cría BLUP sobre GPU"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Datos de entrada">
            <label className="label">Individuos — formato: fenotipo,dosis_1,dosis_2,…</label>
            <textarea
              className="input h-72 font-mono"
              value={dataText}
              onChange={(e) => setDataText(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => fileInputRef.current?.click()}
              >
                Cargar CSV / Excel
              </button>
              <select
                className="input !w-36"
                value={imputeMethod}
                onChange={(e) => setImputeMethod(e.target.value)}
                title="Imputación de valores perdidos al cargar archivos"
              >
                <option value="media">Imputar media</option>
                <option value="moda">Imputar moda</option>
              </select>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />
            {report && (
              <div className="mt-3">
                <PreprocessReport report={report} />
              </div>
            )}
            <p className="mt-2 text-xs text-ink-faint">
              Una fila por individuo: fenotipo y dosis alélicas por marcador (0/1/2).
              Deja una celda vacía o "na" para imputar el valor perdido.
            </p>
          </Card>

          <Card title="Parámetros">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Método</label>
                <select
                  className="input"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="reml">REML</option>
                  <option value="ml">ML</option>
                </select>
              </div>
              <div>
                <label className="label">Parentesco</label>
                <select
                  className="input"
                  value={kinshipMethod}
                  onChange={(e) => setKinshipMethod(e.target.value)}
                >
                  <option value="vanraden">VanRaden</option>
                  <option value="gcta">GCTA</option>
                </select>
              </div>
              <div>
                <label className="label">Máx. iteraciones</label>
                <input
                  type="number"
                  min={10}
                  max={1000}
                  className="input"
                  value={maxIter}
                  onChange={(e) => setMaxIter(Number(e.target.value))}
                />
              </div>
            </div>

            <button className="btn-primary mt-3 w-full" onClick={run} disabled={loading}>
              {loading ? 'Ajustando…' : 'Ajustar modelo'}
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
                <StatCard label="Heredabilidad h²" value={result.heritability.toFixed(3)} accent />
                <StatCard label="Var. genética" value={result.genetic_variance.toFixed(4)} />
                <StatCard label="Var. residual" value={result.residual_variance.toFixed(4)} />
                <StatCard label="Log-verosimilitud" value={result.log_likelihood.toFixed(2)} />
              </div>

              <Card
                title="Valores de cría (BLUP)"
                subtitle={`${result.n_individuals} individuos · ${result.n_markers} marcadores · ${result.iterations} iteraciones`}
                actions={
                  <Badge tone={result.converged ? 'ok' : 'warn'}>
                    {result.converged ? 'Convergido' : 'Sin converger'}
                  </Badge>
                }
              >
                <div className="overflow-x-auto">
                  <table className="table-base min-w-[28rem]">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Individuo</th>
                        <th className="text-right">Valor de cría</th>
                        <th className="w-40">Efecto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blupTop.map((b) => (
                        <tr key={b.individual}>
                          <td className="text-ink-faint">{b.individual}</td>
                          <td className="font-mono">IND-{String(b.individual).padStart(4, '0')}</td>
                          <td className="text-right font-mono text-accent-glow">
                            {b.value.toFixed(4)}
                          </td>
                          <td>
                            <Bar
                              value={
                                (b.value - blupMin) /
                                Math.max(blupMax - blupMin, 1e-9)
                              }
                              glow
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Se muestran los 15 mayores valores de cría predichos.
                </p>
              </Card>
            </>
          )}

          {!result && !error && (
            <Card title="Ayuda">
              <p className="text-sm text-ink-faint">
                El módulo ajusta el modelo animal y = Xβ + Zu + ε, donde u son los valores
                de cría con matriz de parentesco genómica K (VanRaden o GCTA). Las componentes de
                varianza se estiman por máxima verosimilitud restringida (REML) o máxima
                verosimilitud (ML) mediante puntuación de Fisher sobre GPU.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-dim">
                <li>Cada fila es un individuo: fenotipo primero, después las dosis alélicas.</li>
                <li>La heredabilidad h² = σ²g / (σ²g + σ²e) se muestra al ajustar.</li>
                <li>El BLUP ordena los individuos por su mérito genético predicho.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
