import { useState } from 'react'
import { api } from '../api.js'
import { Card, Badge, PageHeader } from '../components/ui.jsx'
import {
  IconChart,
  IconPulse,
  IconNote,
  IconPlay,
  IconList,
} from '../components/icons.jsx'

export default function Report() {
  const [matrixText, setMatrixText] = useState('')
  const [volcanoText, setVolcanoText] = useState('')
  const [title, setTitle] = useState('Reporte de análisis')
  const [thresholds, setThresholds] = useState({ fc_threshold: 1.0, p_threshold: 0.05 })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const parseMatrix = () =>
    matrixText
      .trim()
      .split('\n')
      .map((l) => l.split(/[,;\t ]+/).filter(Boolean).map(Number))
      .filter((r) => r.length && r.every(Number.isFinite))

  const parseVolcano = () =>
    volcanoText
      .trim()
      .split('\n')
      .map((l) => l.split(/[,;\t ]+/).filter(Boolean).map(Number))
      .filter((r) => r.length >= 2 && r.every(Number.isFinite))
      .map((r) => [r[0], r[1]])

  const run = async () => {
    const matrix = parseMatrix()
    const volcano = parseVolcano()
    if (!matrix.length && !volcano.length) {
      setError('Añade una matriz (heatmap) o pares FC/p (volcano).')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const job = await api.buildReport({
        title,
        matrix: matrix.length ? matrix : null,
        fold_changes: volcano.length ? volcano.map((v) => v[0]) : null,
        p_values: volcano.length ? volcano.map((v) => v[1]) : null,
        ...thresholds,
        sections: {
          Entrada: {
            filas_matriz: matrix.length,
            columnas_matriz: matrix[0]?.length ?? 0,
            puntos_volcano: volcano.length,
          },
        },
      })
      const res = await api.jobEvents(job.job_id, {})
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const sampleMatrix = () => {
    const rows = []
    for (let i = 0; i < 12; i++) {
      rows.push(Array.from({ length: 8 }, () =>
        (Math.sin(i / 2) * 2 + (Math.random() - 0.5)).toFixed(2)).join(','))
    }
    setMatrixText(rows.join('\n'))
  }

  const sampleVolcano = () => {
    const rows = []
    for (let i = 0; i < 200; i++) {
      const fc = (Math.random() - 0.5) * 8
      const p = Math.random() ** 3 * 0.9 + 1e-4
      rows.push(`${fc.toFixed(3)},${p.toExponential(2)}`)
    }
    setVolcanoText(rows.join('\n'))
  }

  return (
    <div className="space-y-8">
      <PageHeader
        index="06 · Visualización"
        title="Reporte"
        subtitle="Heatmap, volcano plot y resumen descargable de tus análisis"
        icon={<IconNote className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Heatmap" subtitle="Matriz de expresión/genotipos (una fila por muestra)"
            icon={<IconChart className="h-5 w-5" />}
            actions={<button className="btn-ghost" onClick={sampleMatrix}>Ejemplo</button>}>
            <textarea className="input h-40 font-mono text-xs" value={matrixText}
              onChange={(e) => setMatrixText(e.target.value)}
              placeholder="0.1,2.0,1.1\n..." spellCheck={false} />
          </Card>

          <Card title="Volcano" subtitle="Una línea por punto: fold-change, p-valor"
            icon={<IconPulse className="h-5 w-5" />}
            actions={<button className="btn-ghost" onClick={sampleVolcano}>Ejemplo</button>}>
            <textarea className="input h-32 font-mono text-xs" value={volcanoText}
              onChange={(e) => setVolcanoText(e.target.value)}
              placeholder="2.5,0.001\n-3.1,0.0001\n..." spellCheck={false} />
          </Card>

          <Card title="Opciones" icon={<IconList className="h-5 w-5" />}>
            <label className="label">Título</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">|log2FC| mín.</label>
                <input type="number" step={0.1} className="input" value={thresholds.fc_threshold}
                  onChange={(e) => setThresholds({ ...thresholds, fc_threshold: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">p máx.</label>
                <input type="number" step={0.01} className="input" value={thresholds.p_threshold}
                  onChange={(e) => setThresholds({ ...thresholds, p_threshold: Number(e.target.value) })} />
              </div>
            </div>
            <button className="btn-primary mt-3 w-full" onClick={run} disabled={running}>
              <IconPlay className="h-4 w-4" />
              {running ? 'Generando…' : 'Generar reporte'}
            </button>
            {result?.md_upload_id && (
              <a className="btn-ghost mt-2 flex justify-center"
                href={api.downloadUrl(result.md_upload_id)} download>
                Descargar reporte (Markdown)
              </a>
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
              {result.heatmap_svg && (
                <Card title="Heatmap" subtitle="Valores reescalados (z-score por columna)"
                  icon={<IconChart className="h-5 w-5" />}>
                  <div className="overflow-x-auto rounded-lg border border-line/30"
                    dangerouslySetInnerHTML={{ __html: result.heatmap_svg }} />
                </Card>
              )}
              {result.volcano_svg && (
                <Card title="Volcano plot" subtitle="Significativos resaltados"
                  icon={<IconPulse className="h-5 w-5" />}
                  actions={<Badge tone="accent">log2FC vs p</Badge>}>
                  <div className="overflow-x-auto rounded-lg border border-line/30"
                    dangerouslySetInnerHTML={{ __html: result.volcano_svg }} />
                </Card>
              )}
              <Card title="Resumen" subtitle="Secciones del reporte"
                icon={<IconNote className="h-5 w-5" />}>
                <div className="space-y-3">
                  {result.sections?.map((s) => (
                    <div key={s.name}>
                      <p className="mb-1 font-mono text-xs font-bold uppercase tracking-wider text-accent-glow">
                        {s.name}
                      </p>
                      <ul className="space-y-0.5">
                        {s.rows.map((r) => (
                          <li key={r.metric} className="flex justify-between text-sm">
                            <span className="text-ink-faint">{r.metric}</span>
                            <span className="font-mono">{String(r.value)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-sm text-ink-faint">
                Pega una matriz para el <span className="font-semibold text-accent-glow">heatmap</span> y/o
                pares fold-change/p-valor para el <span className="font-semibold text-accent-glow">volcano plot</span>
                (o usa los botones "Ejemplo"), y pulsa
                <span className="font-semibold text-accent-glow"> Generar reporte</span>.
                Obtendrás las figuras SVG y un resumen Markdown descargable.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}