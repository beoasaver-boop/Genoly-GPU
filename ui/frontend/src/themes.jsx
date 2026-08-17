import { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = [
  {
    id: 'biolumen',
    name: 'Biolumen',
    tagline: 'Consola fluorescente',
    swatches: ['rgb(64 224 178)', 'rgb(244 114 182)', 'rgb(74 222 128)'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'CRT de fósforo',
    swatches: ['rgb(51 255 51)', 'rgb(255 196 66)', 'rgb(255 84 84)'],
  },
  {
    id: 'notebook',
    name: 'Cuaderno',
    tagline: 'Libreta de laboratorio',
    swatches: ['rgb(41 111 235)', 'rgb(220 38 38)', 'rgb(5 150 105)'],
  },
  {
    id: 'frutiger',
    name: 'Frutiger',
    tagline: 'Acuarela 2000s · día/noche',
    swatches: ['rgb(0 168 232)', 'rgb(255 255 255)', 'rgb(20 40 90)'],
  },
]

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('genoly-theme')
    return THEMES.some((t) => t.id === saved) ? saved : 'biolumen'
  })
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('genoly-frutiger-mode')
    return saved === 'night' ? 'night' : 'day'
  })

  useEffect(() => {
    document.documentElement.dataset.theme =
      theme === 'frutiger' ? `frutiger-${mode}` : theme
    localStorage.setItem('genoly-theme', theme)
    if (theme === 'frutiger') {
      localStorage.setItem('genoly-frutiger-mode', mode)
    }
  }, [theme, mode])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 6a6 6 0 100 12 6 6 0 000-12zm0 3.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM11 2h2v3h-2zM11 19h2v3h-2zM2 11h3v2H2zM19 11h3v2h-3zM4.9 4.9l2.1 2.1 1.4-1.4-2.1-2.1zM15.6 18.4l2.1 2.1 1.4-1.4-2.1-2.1zM19.1 4.9l-2.1 2.1-1.4-1.4 2.1-2.1zM7.4 18.4l-2.1 2.1-1.4-1.4 2.1-2.1z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M21 14.5A9 9 0 019.5 3a7 7 0 1011.5 11.5z" />
    </svg>
  )
}

export function DayNightToggle() {
  const { theme, mode, setMode } = useTheme()
  if (theme !== 'frutiger') return null
  const isNight = mode === 'night'
  return (
    <button
      type="button"
      onClick={() => setMode(isNight ? 'day' : 'night')}
      aria-label={isNight ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
      title={isNight ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
      className="frutiger-toggle"
    >
      <span className="frutiger-toggle-icon">{isNight ? <MoonIcon /> : <SunIcon />}</span>
      <span className="frutiger-toggle-label">{isNight ? 'Activar día' : 'Activar noche'}</span>
    </button>
  )
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return (
    <div role="radiogroup" aria-label="Estética de la interfaz" className="space-y-1.5">
      {THEMES.map((t) => {
        const active = t.id === theme
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(t.id)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
              active
                ? 'border-accent/60 bg-accent/10 shadow-glow'
                : 'border-line/40 hover:border-line-strong/70 hover:bg-panel-2/60'
            }`}
          >
            <span className="flex shrink-0 -space-x-1">
              {t.swatches.map((c) => (
                <span
                  key={c}
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-bg"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-xs font-semibold leading-tight ${
                  active ? 'text-accent-glow' : 'text-ink'
                }`}
              >
                {t.name}
              </span>
              <span className="block text-[10px] leading-tight text-ink-faint">{t.tagline}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}