export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between">
          <div>
            {title && (
              <h2 className="text-sm font-bold text-white">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function StatCard({ label, value, hint, accent = false }) {
  return (
    <div
      className={`card flex flex-col p-4 ${
        accent ? 'border-accent/40 bg-accent/10' : ''
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-1 text-2xl font-extrabold text-white">{value}</span>
      {hint && <span className="mt-1 text-xs text-slate-500">{hint}</span>}
    </div>
  )
}

export function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-500/15 text-slate-300',
    green: 'bg-emerald-500/15 text-emerald-300',
    red: 'bg-rose-500/15 text-rose-300',
    indigo: 'bg-accent/15 text-accent-glow',
    amber: 'bg-amber-500/15 text-amber-300',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Bar({ value, color = 'bg-accent' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}