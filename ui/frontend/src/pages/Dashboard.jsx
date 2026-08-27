import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { Card, StatCard, Badge, PageHeader } from '../components/ui.jsx'
import {
  IconGauge,
  IconServer,
  IconTag,
  IconPulse,
  IconChip,
  IconArrow,
  IconFlask,
  IconHash,
  IconDna,
} from '../components/icons.jsx'

const shortcuts = [
  { to: '/qc', title: 'Control de calidad', desc: 'GC content, composición y calidad Phred', icon: <IconFlask className="h-5 w-5" /> },
  { to: '/kmer', title: 'K-mers', desc: 'Conteo y espectro k-mer en GPU', icon: <IconHash className="h-5 w-5" /> },
  { to: '/variants', title: 'Variantes', desc: 'Pileup y llamada SNV/deleciones', icon: <IconDna className="h-5 w-5" /> },
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
        icon={<IconGauge className="h-6 w-6" />}
      />

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          No se pudo conectar con el backend: {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Backend" value={health?.status ?? '…'} accent icon={<IconServer className="h-4 w-4" />} />
        <StatCard label="Versión Genoly" value={health?.version ?? '…'} icon={<IconTag className="h-4 w-4" />} />
        <StatCard label="CUDA" value={cudaOk ? 'Activo' : 'No detectado'} hint={device?.torch_version} accent={cudaOk} icon={<IconPulse className="h-4 w-4" />} />
        <StatCard label="GPU" value={gpuName ? gpuName.split(' ').slice(0, 2).join(' ') : '—'} hint={device?.gpu ? `${device.gpu.memory_total_gb} GB` : undefined} icon={<IconChip className="h-4 w-4" />} />
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
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent-glow shadow-glow icon-pop">
                {s.icon}
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-ink group-hover:text-accent-glow">
                {s.title}
              </h3>
              <p className="mt-1 text-xs text-ink-faint">{s.desc}</p>
              <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-glow opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100">
                <IconArrow className="h-3.5 w-3.5" />
                Ejecutar
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}