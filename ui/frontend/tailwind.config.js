/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: {
          950: '#070b14',
          900: '#0b1120',
          800: '#111a2e',
          700: '#1a2540',
        },
        accent: {
          DEFAULT: '#6366f1',
          soft: '#818cf8',
          glow: '#a5b4fc',
        },
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04), 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}