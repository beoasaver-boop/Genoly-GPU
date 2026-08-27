export function Card({ title, subtitle, actions, icon, children, className = '' }) {
  return (
    <section className={`card group p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line/40 bg-panel-2/60 text-accent-glow icon-pop">
                {icon}
              </span>
            )}
            <div>
              {title && (
                <h2 className="pt-0.5 font-display text-lg font-semibold leading-tight text-ink">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function StatCard({ label, value, hint, accent = false, icon }) {
  return (
    <div
      className={`card group relative flex flex-col justify-between overflow-hidden p-4 ${
        accent
          ? 'border-accent/50 bg-accent/10 shadow-glow'
          : ''
      }`}
    >
      {icon && (
        <span className="pointer-events-none absolute right-3 top-3 text-accent-glow/80 icon-fade">
          {icon}
        </span>
      )}
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </span>
      <span
        className={`mt-1 font-display text-2xl font-semibold leading-none ${
          accent ? 'text-accent-glow' : 'text-ink'
        }`}
      >
        {value}
      </span>
      {hint && <span className="mt-2 text-xs text-ink-faint">{hint}</span>}
    </div>
  )
}

export function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-line/25 text-ink-dim',
    ok: 'bg-ok/15 text-ok',
    bad: 'bg-bad/15 text-bad',
    accent: 'bg-accent/15 text-accent-glow',
    warn: 'bg-warn/15 text-warn',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-line/40 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Bar({ value, color = 'bg-accent', glow = false }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line/15">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color} ${
          glow ? 'shadow-glow' : ''
        }`}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}

export function PageHeader({ index, title, subtitle, actions, icon }) {
  return (
    <header className="page-header group flex items-end justify-between gap-4 pb-6">
      <div className="flex items-end gap-4">
        {icon && (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line/40 bg-panel-2/60 text-accent-glow shadow-glow icon-pop">
            {icon}
          </span>
        )}
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
            {index}
          </div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-dim">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  )
}