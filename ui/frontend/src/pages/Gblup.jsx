import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, Bar, PageHeader } from '../components/ui.jsx'
import PreprocessReport from '../components/PreprocessReport.jsx'
import { makeSampleData, parseQuantData } from '../quantgen.js'
import { parseFileGrid, preprocessGrid } from '../tabular.js'

const SAMPLE = makeSampleData()

export default function Gblup() {
  const fileInputRef = useRef(null)
  const [dataText, setDataText] = useState(SAMPLE)
  const [kinshipMethod, setKinshipMethod] = useState('vanraden')
  const [varGenetic, setVarGenetic] = useState('')
  const [varResidual, setVarResidual] = useState('')
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
      const payload = {
        phenotypes,
        genotypes,
        kinship_method: kinshipMethod,
        max_iter: maxIter,
      }
      if (varGenetic !== '' || varResidual !== '') {
        const g = Number(varGenetic)
        const e = Number(varResidual)
        if (!Number.isFinite(g) || g <= 0) {
          throw new Error('Varianza genética inválida: introduce un número positivo o deja ambas vacías')
        }
        if (!Number.isFinite(e) || e <= 0) {
          throw new Error('Varianza residual inválida: introduce un número positivo o deja ambas vacías')
        }
        payload.genetic_variance = g
        payload.residual_variance = e
      }
      const res = await api.predictGblup(payload)
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
  const meanAcc = result
    ? result.blup.reduce((s, b) => s + b.accuracy, 0) / result.blup.length
    : 0
  const implicitH2 =
    result && result.genetic_variance + result.residual_variance > 0
      ? result.genetic_variance / (result.genetic_variance + result.residual_variance)
      : 0

  return (
    <div className="space-y-8">
      <PageHeader
        index="07 · Análisis"
        title="GBLUP"
        subtitle="Predicción genómica de valores de cría con fiabilidad y precisión"
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
              Mismo formato que en Genética cuantitativa. Las celdas vacías se imputan.
            </p>
          </Card>

          <Card title="Parámetros">
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

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">σ² genética</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="REML"
                  className="input"
                  value={varGenetic}
                  onChange={(e) => setVarGenetic(e.target.value)}
                />
              </div>
              <div>
                <label className="label">σ² residual</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="REML"
                  className="input"
                  value={varResidual}
                  onChange={(e) => setVarResidual(e.target.value)}
                />
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
              {loading ? 'Prediciendo…' : 'Predecir valores de cría'}
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
                <StatCard label="Var. genética" value={result.genetic_variance.toFixed(4)} accent />
                <StatCard label="Var. residual" value={result.residual_variance.toFixed(4)} />
                <StatCard label="h² implícita" value={implicitH2.toFixed(3)} />
                <StatCard label="Precisión media" value={meanAcc.toFixed(3)} />
              </div>

              <Card
                title="Valores de cría genómicos (GEBV)"
                subtitle={`${result.n_individuals} individuos · ${result.n_markers} marcadores · parentesco ${kinshipMethod}`}
                actions={
                  <>
                    <Badge tone="accent">
                      {result.variance_source === 'dadas' ? 'Varianzas dadas' : 'REML'}
                    </Badge>
                    {result.converged != null && (
                      <Badge tone={result.converged ? 'ok' : 'warn'}>
                        {result.converged ? 'Convergido' : 'Sin converger'}
                      </Badge>
                    )}
                  </>
                }
              >
                <div className="overflow-x-auto">
                  <table className="table-base min-w-[34rem]">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Individuo</th>
                        <th className="text-right">Valor de cría</th>
                        <th className="text-right">Fiabilidad</th>
                        <th className="text-right">Precisión</th>
                        <th className="w-28">Fiab.</th>
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
                          <td className="text-right font-mono">{b.reliability.toFixed(3)}</td>
                          <td className="text-right font-mono">{b.accuracy.toFixed(3)}</td>
                          <td>
                            <Bar value={b.reliability} glow />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Se muestran los 15 mayores valores de cría predichos, ordenados por mérito genético.
                </p>
              </Card>
            </>
          )}

          {!result && !error && (
            <Card title="Ayuda">
              <p className="text-sm text-ink-faint">
                GBLUP resuelve el modelo animal en un solo paso y calcula la fiabilidad de cada
                valor de cría a partir del error de predicción (PEV): fiabilidad =
                1 − PEV/Var(u), con precisión = √fiabilidad.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-dim">
                <li>Si indicas σ² genética y residual (de estudios previos), la solución es directa sin iterar.</li>
                <li>Si los dejas vacíos, las varianzas se estiman por REML automáticamente.</li>
                <li>La fiabilidad mide cuánta información aporta cada individuo al predictor.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
