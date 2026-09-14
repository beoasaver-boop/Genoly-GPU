import { useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, PageHeader } from '../components/ui.jsx'
import {
  IconChart,
  IconTarget,
  IconGlobe,
  IconPlay,
  IconList,
  IconSparkle,
} from '../components/icons.jsx'

const CLUSTER_COLORS = [
  '#40e0b2', '#60a5fa', '#f472b6', '#facc15', '#a78bfa',
  '#fb923c', '#34d399', '#f87171', '#38bdf8', '#c084fc',
]

function Scatter({ points, labels, xLabel, yLabel, title }) {
  if (!points?.length) return null
  const W = 520
  const H = 420
  const P = 34
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const sx = (v) => P + ((v - minX) / (maxX - minX || 1)) * (W - 2 * P)
  const sy = (v) => H - P - ((v - minY) / (maxY - minY || 1)) * (H - 2 * P)
  return (
    <div>
      <p className="mb-2 text-xs text-ink-faint">{title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="rgb(var(--line) / 0.4)" />
        <line x1={P} x2={P} y1={P} y2={H - P} stroke="rgb(var(--line) / 0.4)" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sx(p[0])}
            cy={sy(p[1])}
            r={4}
            fill={CLUSTER_COLORS[(labels?.[i] ?? 0) % CLUSTER_COLORS.length]}
            fillOpacity={0.85}
            style={{ filter: 'drop-shadow(0 0 3px rgb(var(--accent) / 0.4))' }}
          />
        ))}
        <text x={W / 2} y={H - 6} textAnchor="middle" className="font-mono"
          style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}>{xLabel}</text>
        <text x={12} y={H / 2} textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}
          className="font-mono" style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}>{yLabel}</text>
      </svg>
    </div>
  )
}

export default function Downstream() {
  const [matrixText, setMatrixText] = useState('')
  const [params, setParams] = useState({
    pca_components: 2,
    run_tsne: true,
    tsne_perplexity: 30,
    tsne_iter: 500,
    k: 3,
    standardize: true,
  })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const parseMatrix = () => {
    const rows = matrixText
      .trim()
      .split('\n')
      .map((line) => line.split(/[,;\t ]+/).filter((v) => v !== '').map(Number))
      .filter((r) => r.length && r.every((v) => Number.isFinite(v)))
    return rows
  }

  const run = async () => {
    const matrix = parseMatrix()
    if (matrix.length < 3) {
      setError('Introduce al menos 3 individuos (una fila por individuo).')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const job = await api.runDownstream({ matrix, ...params })
      const res = await api.jobEvents(job.job_id, { onProgress: (p) => setProgress(p) })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const sample = () => {
    // 3 grupos sintéticos para probar
    const rows = []
    for (let g = 0; g < 3; g++) {
      for (let i = 0; i < 40; i++) {
        rows.push(Array.from({ length: 12 }, () =>
          (g * 4 + (Math.random() - 0.5) * 1.5).toFixed(2)).join(','))
      }
    }
    setMatrixText(rows.join('\n'))
  }

  const n = result?.n
  const k = result?.clusters?.labels?.length
    ? Math.max(...result.clusters.labels) + 1
    : params.k
  const pcaPts = result?.pca?.scores?.map((s) => [s[0], s[1] ?? 0])
  const tsnePts = result?.tsne?.map((s) => [s[0], s[1] ?? 0])

  return (
    <div className="space-y-8">
      <PageHeader
        index="04 · Downstream"
        title="Análisis descendente"
        subtitle="PCA, t-SNE y clustering K-Means sobre perfiles ómicos (GPU)"
        icon={<IconChart className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card
            title="Matriz de rasgos"
            subtitle="Una fila por individuo; columnas = marcadores/conteos"
            icon={<IconList className="h-5 w-5" />}
            actions={<button className="btn-ghost" onClick={sample}>Ejemplo</button>}
          >
            <textarea
              className="input h-56 font-mono text-xs"
              value={matrixText}
              onChange={(e) => setMatrixText(e.target.value)}
              placeholder={'0.1,2.0,1.1,...\n1.9,0.2,0.8,...\n...'}
              spellCheck={false}
            />
            <p className="mt-1 text-[10px] text-ink-faint">
              Separador coma, punto y coma, tabulador o espacio.
            </p>
          </Card>

          <Card title="Parámetros" icon={<IconTarget className="h-5 w-5" />}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Componentes PCA</label>
                <input type="number" min={2} max={50} className="input"
                  value={params.pca_components}
                  onChange={(e) => setParams({ ...params, pca_components: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Clusters (k)</label>
                <input type="number" min={1} className="input"
                  value={params.k}
                  onChange={(e) => setParams({ ...params, k: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Perplexity t-SNE</label>
                <input type="number" min={2} className="input"
                  value={params.tsne_perplexity}
                  onChange={(e) => setParams({ ...params, tsne_perplexity: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Iteraciones t-SNE</label>
                <input type="number" min={50} className="input"
                  value={params.tsne_iter}
                  onChange={(e) => setParams({ ...params, tsne_iter: Number(e.target.value) })} />
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink-dim">
              <input type="checkbox" className="h-4 w-4 accent-accent"
                checked={params.run_tsne}
                onChange={(e) => setParams({ ...params, run_tsne: e.target.checked })} />
              Calcular t-SNE
            </label>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink-dim">
              <input type="checkbox" className="h-4 w-4 accent-accent"
                checked={params.standardize}
                onChange={(e) => setParams({ ...params, standardize: e.target.checked })} />
              Estandarizar rasgos
            </label>

            <button className="btn-primary mt-3 w-full" onClick={run} disabled={running}>
              <IconPlay className="h-4 w-4" />
              {running ? 'Analizando…' : 'Ejecutar análisis'}
            </button>
            {running && progress && (
              <p className="mt-2 text-xs text-ink-faint">
                {progress.stage === 'pca' && `PCA: ${progress.n} × ${progress.p}`}
                {progress.stage === 'tsne' && `t-SNE iter ${progress.iter}/${progress.n_iter}`}
                {progress.stage === 'kmeans' && `K-Means ${progress.init}/${progress.n_init}`}
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
                <StatCard label="Individuos" value={n} icon={<IconList className="h-4 w-4" />} />
                <StatCard label="Rasgos" value={result.p} icon={<IconList className="h-4 w-4" />} />
                <StatCard label="Clusters" value={k} icon={<IconTarget className="h-4 w-4" />} />
                <StatCard
                  label="PC1 var."
                  value={`${(result.pca.explained_variance_ratio[0] * 100).toFixed(1)}%`}
                  accent icon={<IconChart className="h-4 w-4" />}
                />
              </div>

              <Card title="PCA" subtitle={`PC1 + PC2 (varianza ${(result.pca.explained_variance_ratio[0] * 100).toFixed(1)}% + ${(result.pca.explained_variance_ratio[1] * 100).toFixed(1)}%)`}
                icon={<IconChart className="h-5 w-5" />}>
                <Scatter points={pcaPts} labels={result.clusters.labels}
                  xLabel="PC1" yLabel="PC2" title="Proyección PCA (color = cluster)" />
              </Card>

              {tsnePts && (
                <Card title="t-SNE" subtitle="Incrustación no lineal (perplexity)"
                  icon={<IconGlobe className="h-5 w-5" />}>
                  <Scatter points={tsnePts} labels={result.clusters.labels}
                    xLabel="dim 1" yLabel="dim 2" title="t-SNE (color = cluster)" />
                </Card>
              )}

              <Card title="Resumen de clusters" icon={<IconSparkle className="h-5 w-5" />}
                subtitle={`K-Means · inercia ${result.clusters.inertia} · ${result.clusters.n_iter} iter`}>
                <div className="space-y-2">
                  {Array.from({ length: k }, (_, c) => {
                    const count = result.clusters.labels.filter((l) => l === c).length
                    return (
                      <div key={c} className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ background: CLUSTER_COLORS[c % CLUSTER_COLORS.length] }} />
                        <span className="w-20 font-mono text-sm">Cluster {c}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/15">
                          <div className="h-full rounded-full" style={{
                            width: `${(count / n) * 100}%`,
                            background: CLUSTER_COLORS[c % CLUSTER_COLORS.length],
                          }} />
                        </div>
                        <span className="w-16 text-right font-mono text-xs text-ink-faint">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-sm text-ink-faint">
                Pega una matriz de rasgos (una fila por individuo) o pulsa{' '}
                <span className="font-semibold text-accent-glow">Ejemplo</span>, ajusta los
                parámetros y pulsa <span className="font-semibold text-accent-glow">Ejecutar análisis</span>.
                Obtendrás PCA, t-SNE y clustering K-Means en GPU, útil para explorar estructura
                poblacional o perfiles de expresión.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}