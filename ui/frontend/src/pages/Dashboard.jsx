import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { Card, StatCard, Badge } from '../components/ui.jsx'

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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Análisis genómico acelerado por GPU (NVIDIA/CUDA)
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
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
            <Badge tone="green">GPU en uso</Badge>
          ) : cudaOk === false ? (
            <Badge tone="red">CPU fallback</Badge>
          ) : (
            <Badge>…</Badge>
          )
        }
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Dispositivo</dt>
            <dd className="font-mono text-slate-200">{device?.device ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">PyTorch</dt>
            <dd className="font-mono text-slate-200">{device?.torch_version ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Driver NVIDIA</dt>
            <dd className="font-mono text-slate-200">{device?.nvidia?.driver_version ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">CUDA del driver</dt>
            <dd className="font-mono text-slate-200">{device?.nvidia?.cuda_version ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Compute capability</dt>
            <dd className="font-mono text-slate-200">
              {device?.compute_capability ? device.compute_capability.join('.') : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Memoria libre</dt>
            <dd className="font-mono text-slate-200">
              {device?.gpu?.memory_free_gb != null ? `${device.gpu.memory_free_gb} GB` : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-bold text-white">Análisis</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="card group p-5 transition-colors hover:border-accent/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent-glow">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d={s.icon} />
                </svg>
              </div>
              <h3 className="mt-3 text-sm font-bold text-white group-hover:text-accent-glow">
                {s.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{s.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}