import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Card, StatCard, Badge, PageHeader } from '../components/ui.jsx'

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-ink-faint">{label}</dt>
      <dd className="font-mono text-sm text-ink">{value ?? '—'}</dd>
    </div>
  )
}

export default function Device() {
  const [setup, setSetup] = useState(null)
  const [device, setDevice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([api.setup(), api.device()])
      .then(([s, d]) => {
        setSetup(s)
        setDevice(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const nv = setup?.nvidia
  const torch = setup?.torch
  const cudaOk = torch?.cuda_available

  return (
    <div className="space-y-8">
      <PageHeader
        index="02 · Sistema"
        title="Dispositivo"
        subtitle="Detección de GPU NVIDIA y compatibilidad CUDA de PyTorch"
        actions={
          <button className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? 'Comprobando…' : 'Comprobar de nuevo'}
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="GPU"
          value={nv?.gpu_name ?? '—'}
          hint={nv?.memory_total_gb ? `${nv.memory_total_gb} GB` : undefined}
          accent
        />
        <StatCard label="Driver" value={nv?.driver_version ?? '—'} />
        <StatCard label="CUDA driver" value={nv?.cuda_version ?? '—'} />
        <StatCard
          label="PyTorch CUDA"
          value={cudaOk ? 'Activo' : 'CPU-only'}
          hint={torch?.version}
          accent={cudaOk}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Sistema NVIDIA (nvidia-smi)"
          actions={
            nv?.available ? <Badge tone="ok">Detectada</Badge> : <Badge tone="bad">No</Badge>
          }
        >
          {nv?.available ? (
            <dl>
              <Row label="GPU" value={nv.gpu_name} />
              <Row label="Driver" value={nv.driver_version} />
              <Row label="CUDA soportado" value={nv.cuda_version} />
              <Row label="Memoria" value={nv.memory_total_gb ? `${nv.memory_total_gb} GB` : '—'} />
            </dl>
          ) : (
            <p className="text-sm text-ink-faint">{nv?.error ?? 'nvidia-smi no disponible'}</p>
          )}
        </Card>

        <Card
          title="PyTorch"
          actions={cudaOk ? <Badge tone="ok">CUDA</Badge> : <Badge tone="warn">CPU</Badge>}
        >
          <dl>
            <Row label="Versión" value={torch?.version} />
            <Row label="CUDA detectado" value={String(torch?.cuda_available)} />
            <Row label="Build CUDA" value={torch?.torch_cuda_version} />
            <Row label="Dispositivo activo" value={torch?.device ?? '—'} />
            {device?.gpu && (
              <>
                <Row label="GPU PyTorch" value={device.gpu.name} />
                <Row label="Compute capability" value={device.gpu.compute_capability} />
                <Row label="Memoria libre" value={`${device.gpu.memory_free_gb} GB`} />
              </>
            )}
          </dl>
        </Card>
      </div>

      {setup?.recommended_cuda_tag && (
        <Card
          title="Build de PyTorch recomendada"
          subtitle="Si PyTorch no detecta la GPU, reinstala con este comando"
        >
          <p className="mb-2 text-sm text-ink-dim">
            Para tu driver (CUDA {nv?.cuda_version}), la build más conveniente es{' '}
            <span className="font-mono font-semibold text-accent-glow">
              {setup.recommended_cuda_tag}
            </span>
            .
          </p>
          <pre className="overflow-x-auto rounded-lg bg-bg p-3 font-mono text-xs text-ok shadow-card">
            {setup.install_command}
          </pre>
        </Card>
      )}
    </div>
  )
}