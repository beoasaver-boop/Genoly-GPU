import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { to: '/device', label: 'Dispositivo', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 4.8a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM12 18c-3 0-5.5-2-6-5h12c-.5 3-3 5-6 5z' },
  { to: '/qc', label: 'Control de calidad', icon: 'M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5zm2 5h10v2H7V8zm0 4h6v2H7v-2z' },
  { to: '/kmer', label: 'K-mers', icon: 'M4 7a3 3 0 016 0 3 3 0 016 0 3 3 0 016 0v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0V7zm0 6a3 3 0 016 0 3 3 0 016 0 3 3 0 016 0v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0v-2z' },
  { to: '/variants', label: 'Variantes', icon: 'M7 3a1 1 0 000 2h1.586l-3.793 3.793a1 1 0 001.414 1.414L10 6.414V8a1 1 0 002 0V4a1 1 0 00-1-1H7zm11 4a1 1 0 00-1 1v1.586L13.207 5.793a1 1 0 00-1.414 1.414L15.586 9H14a1 1 0 000 2h4a1 1 0 001-1V8a1 1 0 00-1-1zM6.207 14.793L10 18.586V17a1 1 0 012 0v4a1 1 0 01-1 1H7a1 1 0 010-2h1.586l-3.793-3.793a1 1 0 011.414-1.414z' },
]

function NavItem({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-accent/15 text-accent-glow'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        }`
      }
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
        <path d={item.icon} />
      </svg>
      {item.label}
    </NavLink>
  )
}

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-white/10 bg-surface-900">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-mono text-lg font-bold text-white shadow-card">
            G
          </div>
          <div>
            <div className="text-sm font-bold text-white">Genoly-GPU</div>
            <div className="text-[11px] text-slate-500">Análisis genómico</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {links.map((l) => (
            <NavItem key={l.to} item={l} />
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-[11px] text-slate-500">
          GPU · NVIDIA · PyTorch CUDA
        </div>
      </aside>

      <main className="ml-60 flex-1 px-8 py-8">{children}</main>
    </div>
  )
}