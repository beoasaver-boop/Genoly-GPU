import { NavLink } from 'react-router-dom'
import { ThemeSwitcher, DayNightToggle } from '../themes.jsx'
import DnaBackdrop from './DnaBackdrop.jsx'
import FrutigerBackdrop from './FrutigerBackdrop.jsx'
import { IconGauge, IconChip, IconFlask, IconHash, IconDna } from './icons.jsx'

const groups = [
  {
    label: 'Sistema',
    items: [
      { to: '/', label: 'Dashboard', icon: <IconGauge className="h-5 w-5" /> },
      { to: '/device', label: 'Dispositivo', icon: <IconChip className="h-5 w-5" /> },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { to: '/qc', label: 'Control de calidad', icon: <IconFlask className="h-5 w-5" /> },
      { to: '/kmer', label: 'K-mers', icon: <IconHash className="h-5 w-5" /> },
      { to: '/variants', label: 'Variantes', icon: <IconDna className="h-5 w-5" /> },
    ],
  },
]

function NavItem({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
          isActive
            ? 'border-accent/50 bg-accent/10 text-accent-glow shadow-glow'
            : 'border-transparent text-ink-dim hover:border-line/40 hover:bg-panel-2/60 hover:text-ink'
        }`
      }
    >
      <span className="icon-pop text-current">{item.icon}</span>
      <span>{item.label}</span>
    </NavLink>
  )
}

export default function Layout({ children }) {
  return (
    <div className="relative flex min-h-screen">
      <DnaBackdrop />
      <FrutigerBackdrop />
      <div className="crt-overlay" aria-hidden="true" />
      <div className="crt-band" aria-hidden="true" />
      <DayNightToggle />

      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-line/40 bg-panel/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent font-mono text-lg font-bold text-on-accent shadow-glow">
            G
          </div>
          <div>
            <div className="font-display text-sm font-bold uppercase tracking-wider text-ink">
              Genoly-GPU
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              Análisis genómico
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-2">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 flex items-center gap-2 px-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ink-faint">
                  {g.label}
                </span>
                <span className="h-px flex-1 bg-line/40" />
              </div>
              <div className="space-y-1">
                {g.items.map((item) => (
                  <NavItem key={item.to} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-4 border-t border-line/40 p-4">
          <div>
            <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ink-faint">
              Estética
            </div>
            <ThemeSwitcher />
          </div>
          <div className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ok shadow-glow" />
            GPU · NVIDIA · CUDA
          </div>
        </div>
      </aside>

      <main className="relative z-10 ml-64 flex-1 px-10 py-8">{children}</main>
    </div>
  )
}