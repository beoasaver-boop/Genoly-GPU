import { useMemo } from 'react'

// La gráfica se dibuja en un único SVG (poli-línea + área), no en miles de
// nodos DOM: un espectro de genoma completo (k=21 en un genoma de 2.86 GB)
// tiene ~10^3 multiplicidades y hasta 10^9 k-mers; se reduce a un máximo de
// MAX_POINTS bins sumando frecuencias y se representa en escala logarítmica.
const MAX_POINTS = 256

const W = 640
const H = 300
const PL = 48
const PR = 18
const PT = 14
const PB = 36
const PW = W - PL - PR
const PH = H - PT - PB

function fmt(n) {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}G`
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`
  return String(n)
}

function pows(lo, hi, base = 10) {
  const out = []
  let p = Math.pow(base, Math.floor(Math.log(lo) / Math.log(base)))
  while (p <= hi) {
    if (p >= lo) out.push(p)
    p *= base
  }
  return out
}

export default function SpectrumChart({ spectrum, className = '' }) {
  const view = useMemo(() => {
    const raw = Object.entries(spectrum ?? {})
      .map(([m, f]) => [Number(m), Number(f)])
      .filter(([m, f]) => Number.isFinite(m) && Number.isFinite(f) && m > 0 && f > 0)
      .sort((a, b) => a[0] - b[0])
    if (!raw.length) return null

    // Downsampling: agrupa multiplicidades en <= MAX_POINTS bins lineales.
    let series = raw
    if (raw.length > MAX_POINTS) {
      const minM = raw[0][0]
      const span = raw[raw.length - 1][0] - minM || 1
      const sums = new Array(MAX_POINTS).fill(0)
      const cnt = new Array(MAX_POINTS).fill(0)
      for (const [m, f] of raw) {
        const i = Math.min(
          MAX_POINTS - 1,
          Math.floor(((m - minM) / span) * MAX_POINTS),
        )
        sums[i] += f
        cnt[i] += 1
      }
      series = []
      for (let i = 0; i < MAX_POINTS; i++) {
        if (cnt[i]) series.push([minM + ((i + 0.5) / MAX_POINTS) * span, sums[i]])
      }
    }

    const minM = series[0][0]
    const maxM = series[series.length - 1][0]
    const maxF = Math.max(...series.map(([, f]) => f))
    const log10 = Math.log10

    // Escalas: x lineal en log10(multiplicidad), y lineal en log10(frecuencia).
    const x0 = log10(Math.max(1, minM))
    const x1 = Math.max(x0 + 1e-9, log10(maxM))
    const y1 = Math.max(1e-6, log10(maxF))

    const X = (m) => PL + ((log10(Math.max(1, m)) - x0) / (x1 - x0)) * PW
    const Y = (f) => PT + (1 - log10(Math.max(1, f)) / y1) * PH

    const line = series
      .map(([m, f], i) => `${i ? 'L' : 'M'}${X(m).toFixed(2)},${Y(f).toFixed(2)}`)
      .join(' ')

    const firstX = X(series[0][0])
    const lastX = X(series[series.length - 1][0])
    const bottom = PT + PH
    const area = `${line} L${lastX.toFixed(2)},${bottom} L${firstX.toFixed(2)},${bottom} Z`

    let peakM = null
    let peakF = -1
    for (const [m, f] of series) {
      if (f > peakF) {
        peakF = f
        peakM = m
      }
    }

    const ticksX = pows(Math.max(1, minM), maxM).map((m) => ({
      m,
      x: X(m),
      label: fmt(m),
    }))
    const ticksY = pows(1, maxF).map((f) => ({ f, y: Y(f), label: fmt(f) }))

    return {
      line,
      area,
      firstX,
      lastX,
      bottom,
      peakX: X(peakM),
      peakY: Y(peakF),
      peakM,
      ticksX,
      ticksY,
      maxF,
      maxM,
      single: series.length === 1,
    }
  }, [spectrum])

  if (!view) {
    return (
      <p className="text-sm text-ink-faint">
        Sin datos de espectro para representar.
      </p>
    )
  }

  const peakLabelAnchor =
    view.peakX > W - 90 ? 'end' : view.peakX < 60 ? 'start' : 'middle'

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full ${className}`}
      role="img"
      aria-label="Espectro k-mer (multiplicidad vs número de k-mers)"
    >
      <defs>
        <linearGradient id="spec-area" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{ stopColor: 'rgb(var(--accent))', stopOpacity: 0.55 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: 'rgb(var(--accent))', stopOpacity: 0.02 }}
          />
        </linearGradient>
        <linearGradient id="spec-line" x1="0" y1="0" x2="1" y2="0">
          <stop
            offset="0%"
            style={{ stopColor: 'rgb(var(--accent-soft))', stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: 'rgb(var(--accent))', stopOpacity: 1 }}
          />
        </linearGradient>
      </defs>

      {/* rejilla horizontal (y, potencias de 10) */}
      {view.ticksY.map((t) => (
        <line
          key={`gy${t.f}`}
          x1={PL}
          x2={W - PR}
          y1={t.y}
          y2={t.y}
          stroke="rgb(var(--line) / 0.18)"
          strokeDasharray="2 4"
        />
      ))}
      {/* rejilla vertical (x, potencias de 10) */}
      {view.ticksX.map((t) => (
        <line
          key={`gx${t.m}`}
          x1={t.x}
          x2={t.x}
          y1={PT}
          y2={view.bottom}
          stroke="rgb(var(--line) / 0.12)"
          strokeDasharray="2 4"
        />
      ))}

      {/* área bajo la curva */}
      <path d={view.area} fill="url(#spec-area)" />
      {/* curva */}
      {view.single ? (
        <circle
          cx={view.firstX}
          cy={view.peakY}
          r={3.5}
          fill="rgb(var(--accent))"
          style={{ filter: 'drop-shadow(0 0 5px rgb(var(--accent) / 0.8))' }}
        />
      ) : (
        <path
          d={view.line}
          fill="none"
          stroke="url(#spec-line)"
          strokeWidth={2}
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 6px rgb(var(--accent) / 0.45))' }}
        />
      )}

      {/* pico: línea punteada + punto */}
      <line
        x1={view.peakX}
        x2={view.peakX}
        y1={view.peakY}
        y2={view.bottom}
        stroke="rgb(var(--accent-glow) / 0.6)"
        strokeDasharray="3 3"
      />
      <circle
        cx={view.peakX}
        cy={view.peakY}
        r={4}
        fill="rgb(var(--accent-glow))"
        style={{ filter: 'drop-shadow(0 0 6px rgb(var(--accent) / 0.9))' }}
      />

      {/* ejes */}
      <line
        x1={PL}
        x2={W - PR}
        y1={view.bottom}
        y2={view.bottom}
        stroke="rgb(var(--line) / 0.4)"
      />
      <line
        x1={PL}
        x2={PL}
        y1={PT}
        y2={view.bottom}
        stroke="rgb(var(--line) / 0.4)"
      />

      {/* etiquetas del eje x (multiplicidad) */}
      {view.ticksX.map((t) => (
        <text
          key={`tx${t.m}`}
          x={t.x}
          y={view.bottom + 20}
          textAnchor="middle"
          className="font-mono"
          style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}
        >
          {t.label}
        </text>
      ))}
      {/* etiquetas del eje y (frecuencia) */}
      {view.ticksY.map((t) => (
        <text
          key={`ty${t.f}`}
          x={PL - 6}
          y={t.y + 3}
          textAnchor="end"
          className="font-mono"
          style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}
        >
          {t.label}
        </text>
      ))}

      {/* anotación del pico */}
      <text
        x={view.peakX + (peakLabelAnchor === 'start' ? 8 : peakLabelAnchor === 'end' ? -8 : 0)}
        y={Math.max(12, view.peakY - 10)}
        textAnchor={peakLabelAnchor}
        className="font-mono"
        style={{ fill: 'rgb(var(--accent-glow))', fontSize: 11, fontWeight: 700 }}
      >
        pico {fmt(view.peakM)}×
      </text>

      {/* nombres de ejes */}
      <text
        x={PL + PW / 2}
        y={H - 4}
        textAnchor="middle"
        style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}
      >
        multiplicidad
      </text>
      <text
        x={16}
        y={PT + PH / 2}
        textAnchor="middle"
        transform={`rotate(-90 16 ${PT + PH / 2})`}
        style={{ fill: 'rgb(var(--ink-faint))', fontSize: 10 }}
      >
        nº de k-mers
      </text>
    </svg>
  )
}