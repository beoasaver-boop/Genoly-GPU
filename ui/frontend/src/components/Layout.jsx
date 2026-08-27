import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ThemeSwitcher, DayNightToggle } from '../themes.jsx'
import DnaBackdrop from './DnaBackdrop.jsx'
import FrutigerBackdrop from './FrutigerBackdrop.jsx'
import {
  IconGauge,
  IconChip,
  IconFlask,
  IconHash,
  IconDna,
  IconChart,
  IconTarget,
} from './icons.jsx'

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
      { to: '/quantitative', label: 'Genética cuantitativa', icon: <IconChart className="h-5 w-5" /> },
      { to: '/gblup', label: 'GBLUP', icon: <IconTarget className="h-5 w-5" /> },
    ],
  },
]

function NavItem({ item, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
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
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="relative flex min-h-screen">
      <DnaBackdrop />
      <FrutigerBackdrop />
      <div className="crt-overlay" aria-hidden="true" />
      <div className="crt-band" aria-hidden="true" />
      <DayNightToggle />

      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line/40 bg-panel/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-mono text-base font-bold text-on-accent shadow-glow">
            G
          </div>
          <div>
            <div className="font-display text-xs font-bold uppercase tracking-wider text-ink">
              Genoly-GPU
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              Análisis genómico
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          className="btn-ghost !px-2.5"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line/40 bg-panel/95 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 lg:bg-panel/70 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent font-mono text-lg font-bold text-on-accent shadow-glow">
            G
          </div>
          <div className="flex-1">
            <div className="font-display text-sm font-bold uppercase tracking-wider text-ink">
              Genoly-GPU
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              Análisis genómico
            </div>
          </div>
          <button
            type="button"
            onClick={closeMenu}
            aria-label="Cerrar menú"
            className="btn-ghost !px-2 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
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
                  <NavItem key={item.to} item={item} onNavigate={closeMenu} />
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

      <main className="relative z-10 flex-1 px-4 pb-10 pt-20 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  )
}