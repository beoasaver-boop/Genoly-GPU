import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { Card, StatCard, Badge, PageHeader } from '../components/ui.jsx'

const shortcuts = [
  { to: '/qc', title: 'Control de calidad', desc: 'GC content, composición y calidad Phred', icon: 'M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5zm2 5h10v2H7V8zm0 4h6v2H7v-2z' },
  { to: '/kmer', title: 'K-mers', desc: 'Conteo y espectro k-mer en GPU', icon: 'M4 7a3 3 0 016 0 3 3 0 016 0 3 3 0 016 0v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0V7zm0 6a3 3 0 016 0 3 3 0 016 0 3 3 0 016 0v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0v-2z' },
  { to: '/variants', title: 'Variantes', desc: 'Pileup y llamada SNV/deleciones', icon: 'M7 3a1 1 0 000 2h1.586l-3.793 3.793a1 1 0 001.414 1.414L10 6.414V8a1 1 0 002 0V4a1 1 0 00-1-1H7zm11 4a1 1 0 00-1 1v1.586L13.207 5.793a1 1 0 00-1.414 1.414L15.586 9H14a1 1 0 000 2h4a1 1 0 001-1V8a1 1 0 00-1-1zM6.207 14.793L10 18.586V17a1 1 0 012 0v4a1 1 0 01-1 1H7a1 1 0 010-2h1.586l-3.793-3.793a1 1 0 011.414-1.414z' },
]

export default function Dashboard() {
  const [health, setHealth] = useState(null)
  const [device, setDevice] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message))
    api.device().then(setDevice).catch(() => {})
  }, [])

  const cudaOk = device?.cuda_available
  const gpuName = device?.gpu?.name || device?.nvidia?.gpu_name

  return (
    <div className="space-y-8">
      <PageHeader
        index="01 · Sistema"
        title="Dashboard"
        subtitle="Análisis genómico acelerado por GPU (NVIDIA / CUDA)"
      />

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          No se pudo conectar con el backend: {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Backend" value={health?.status ?? '…'} accent />
        <StatCard label="Versión Genoly" value={health?.version ?? '…'} />
        <StatCard
          label="CUDA"
          value={cudaOk ? 'Activo' : 'No detectado'}
          hint={device?.torch_version}
          accent={cudaOk}
        />
        <StatCard
          label="GPU"
          value={gpuName ? gpuName.split(' ').slice(0, 2).join(' ') : '—'}
          hint={device?.gpu ? `${device.gpu.memory_total_gb} GB` : undefined}
        />
      </div>

      <Card
        title="Estado del dispositivo"
        subtitle="Detección automática con nvidia-smi y PyTorch/CUDA"
        actions={
          cudaOk === true ? (
            <Badge tone="ok">GPU en uso</Badge>
          ) : cudaOk === false ? (
            <Badge tone="bad">CPU fallback</Badge>
          ) : (
            <Badge>…</Badge>
          )
        }
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">Dispositivo</dt>
            <dd className="font-mono text-ink">{device?.device ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">PyTorch</dt>
            <dd className="font-mono text-ink">{device?.torch_version ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">Driver NVIDIA</dt>
            <dd className="font-mono text-ink">{device?.nvidia?.driver_version ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">CUDA del driver</dt>
            <dd className="font-mono text-ink">{device?.nvidia?.cuda_version ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">Compute capability</dt>
            <dd className="font-mono text-ink">
              {device?.compute_capability ? device.compute_capability.join('.') : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-faint">Memoria libre</dt>
            <dd className="font-mono text-ink">
              {device?.gpu?.memory_free_gb != null ? `${device.gpu.memory_free_gb} GB` : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Análisis</h2>
          <span className="h-px flex-1 bg-line/40" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="card group p-5 transition-all hover:border-accent/50 hover:shadow-glow"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent-glow shadow-glow transition-transform group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d={s.icon} />
                </svg>
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-ink group-hover:text-accent-glow">
                {s.title}
              </h3>
              <p className="mt-1 text-xs text-ink-faint">{s.desc}</p>
              <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
                Ejecutar →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}