import { useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, Bar, PageHeader } from '../components/ui.jsx'

const N_SAMPLE = 80
const M_SAMPLE = 40

function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-9)
  const v = Math.max(rand(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const SAMPLE = (() => {
  const rand = mulberry32(20260821)
  const lines = []
  for (let i = 0; i < N_SAMPLE; i++) {
    const doses = []
    let genetic = 0
    for (let j = 0; j < M_SAMPLE; j++) {
      const d = Math.floor(rand() * 3)
      genetic += (d - 1) * gaussian(rand) * 0.12
      doses.push(d)
    }
    const pheno = genetic + gaussian(rand)
    lines.push(`${pheno.toFixed(3)},${doses.join(',')}`)
  }
  return lines.join('\n')
})()

function parseData(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (!lines.length) throw new Error('Introduce al menos un individuo')
  let width = null
  const phenotypes = []
  const genotypes = []
  lines.forEach((line, idx) => {
    const cells = line.split(',').map((c) => c.trim())
    if (width === null) width = cells.length
    if (cells.length !== width) {
      throw new Error(
        `La línea ${idx + 1} tiene ${cells.length} columnas (se esperaban ${width})`,
      )
    }
    if (width < 3) {
      throw new Error('Cada línea debe ser: fenotipo,dosis_1,dosis_2,...')
    }
    const pheno = Number(cells[0])
    if (!Number.isFinite(pheno)) {
      throw new Error(`Fenotipo inválido en la línea ${idx + 1}: "${cells[0]}"`)
    }
    const doses = cells.slice(1).map((c, j) => {
      if (c === '' || c.toLowerCase() === 'na') return null
      const v = Number(c)
      if (!Number.isFinite(v)) {
        throw new Error(
          `Genotipo inválido en la línea ${idx + 1}, columna ${j + 2}: "${c}"`,
        )
      }
      return v
    })
    phenotypes.push(pheno)
    genotypes.push(doses)
  })
  return { phenotypes, genotypes }
}

export default function Quantitative() {
  const [dataText, setDataText] = useState(SAMPLE)
  const [method, setMethod] = useState('reml')
  const [maxIter, setMaxIter] = useState(100)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const { phenotypes, genotypes } = parseData(dataText)
      const res = await api.fitLmm({ phenotypes, genotypes, method, max_iter: maxIter })
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
                de cría con matriz de parentesco genómica K (VanRaden). Las componentes de
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
