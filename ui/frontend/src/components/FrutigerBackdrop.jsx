import { useEffect, useRef } from 'react'
import { useTheme } from '../themes.jsx'

const CITY_BUILDINGS = (() => {
  const arr = []
  let x = -10
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  while (x < 1480) {
    const w = 34 + rnd() * 66
    const h = 60 + rnd() * 180
    arr.push({ x, w, h, antenna: rnd() < 0.3 })
    x += w + 4 + rnd() * 16
  }
  return arr
})()

function CitySvg({ night }) {
  return (
    <svg
      className="frutiger-city"
      viewBox="0 0 1500 260"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <pattern id="win-night" width="16" height="18" patternUnits="userSpaceOnUse">
          <rect x="2" y="2" width="5" height="6" fill="#ffd98a" opacity="0.85" />
          <rect x="9" y="9" width="5" height="6" fill="#ffd98a" opacity="0.45" />
          <rect x="2" y="11" width="5" height="6" fill="#7fb6ff" opacity="0.6" />
        </pattern>
        <linearGradient id="cityGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffc86a" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffb14d" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {night && <rect x="0" y="252" width="1500" height="8" fill="url(#cityGlow)" />}

      {CITY_BUILDINGS.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={260 - b.h}
            width={b.w}
            height={b.h}
            fill={night ? '#0a1730' : '#a9c8e4'}
            opacity={night ? 0.85 : 0.6}
          />
          {night && (
            <rect x={b.x} y={260 - b.h} width={b.w} height={b.h} fill="url(#win-night)" />
          )}
          {b.antenna && (
            <line
              x1={b.x + b.w / 2}
              y1={260 - b.h}
              x2={b.x + b.w / 2}
              y2={260 - b.h - 26}
              stroke={night ? '#0a1730' : '#a9c8e4'}
              strokeWidth={2}
            />
          )}
        </g>
      ))}
    </svg>
  )
}

function GrassSvg({ night }) {
  const back = night ? ['#123b33', '#0c2b29'] : ['#6cc56a', '#4ba860']
  const front = night ? ['#0e3328', '#08201d'] : ['#52ae57', '#328a49']
  return (
    <svg
      className="frutiger-grass"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="grassBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={back[0]} />
          <stop offset="100%" stopColor={back[1]} />
        </linearGradient>
        <linearGradient id="grassFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={front[0]} />
          <stop offset="100%" stopColor={front[1]} />
        </linearGradient>
      </defs>
      <circle cx="330" cy="280" r="300" fill="url(#grassBack)" />
      <circle cx="1150" cy="300" r="330" fill="url(#grassFront)" />
    </svg>
  )
}

function drawBubble(ctx, b, wob) {
  const r = b.r
  const g = ctx.createRadialGradient(b.x - r * 0.38, b.y - r * 0.42, r * 0.1, b.x, b.y, r)
  g.addColorStop(0, 'rgba(255,255,255,0.75)')
  g.addColorStop(0.45, 'rgba(190,228,255,0.35)')
  g.addColorStop(1, 'rgba(150,215,255,0.14)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
  ctx.stroke()

  const hx = b.x - r * 0.38 + Math.cos(wob) * r * 0.05
  const hy = b.y - r * 0.42 + Math.sin(wob) * r * 0.05
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.ellipse(hx, hy, r * 0.3, r * 0.18, -0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.arc(hx - r * 0.1, hy - r * 0.14, r * 0.06, 0, Math.PI * 2)
  ctx.fill()
}

export default function FrutigerBackdrop() {
  const { theme, mode } = useTheme()
  const canvasRef = useRef(null)
  const active = theme === 'frutiger'

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const rand = (a, b) => a + Math.random() * (b - a)
    const bubbles = []
    const particles = []
    let stars = []
    const BUBBLE_TARGET = 14

    const makeStar = () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: rand(0.6, 1.8),
      ph: Math.random() * Math.PI * 2,
      sp: rand(4, 14),
      ang: rand(0, Math.PI * 2),
    })

    const spawnBubble = () => {
      bubbles.push({
        x: rand(20, w - 20),
        y: rand(20, h - 20),
        r: rand(14, 42),
        vx: rand(-0.6, 0.6),
        vy: rand(-0.6, 0.6),
        wob: Math.random() * Math.PI * 2,
      })
    }

    if (mode === 'night') {
      stars = Array.from({ length: 140 }, makeStar)
    }
    if (mode === 'day') {
      for (let i = 0; i < BUBBLE_TARGET; i++) spawnBubble()
    }

    const explode = (b) => {
      const n = 10
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5
        const s = rand(1, 3.2)
        particles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 0.4,
          life: 0,
          max: rand(0.5, 1),
          r: rand(1.5, 3.5),
        })
      }
      particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0, max: 0.6, r: 0, ring: true, start: b.r })
    }

    const onPointer = (e) => {
      if (mode !== 'day') return
      const t = e.target
      if (t && t.closest && t.closest('button, input, textarea, select, a, [role="button"], [contenteditable]')) {
        return
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]
        const dx = e.clientX - b.x
        const dy = e.clientY - b.y
        if (dx * dx + dy * dy <= b.r * b.r) {
          explode(b)
          bubbles.splice(i, 1)
          spawnBubble()
          break
        }
      }
    }
    window.addEventListener('pointerdown', onPointer)

    let raf = 0
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      ctx.clearRect(0, 0, w, h)

      if (mode === 'night') {
        for (const s of stars) {
          s.x += Math.cos(s.ang) * s.sp * dt
          s.y += Math.sin(s.ang) * s.sp * dt
          if (s.x < -2) s.x = w + 2
          if (s.x > w + 2) s.x = -2
          if (s.y < -2) s.y = h + 2
          if (s.y > h + 2) s.y = -2
          s.ph += dt * 2
          const a = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(s.ph))
          ctx.globalAlpha = a
          ctx.fillStyle = '#eaf4ff'
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
          if (s.r > 1.4) {
            ctx.strokeStyle = 'rgba(234,244,255,0.5)'
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(s.x - s.r * 2.2, s.y)
            ctx.lineTo(s.x + s.r * 2.2, s.y)
            ctx.moveTo(s.x, s.y - s.r * 2.2)
            ctx.lineTo(s.x, s.y + s.r * 2.2)
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }

      if (mode === 'day') {
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i]
          b.x += b.vx * 60 * dt
          b.y += b.vy * 60 * dt
          if (b.x < b.r) {
            if (Math.random() < 0.5) {
              explode(b)
              bubbles.splice(i, 1)
              spawnBubble()
              continue
            }
            b.vx = Math.abs(b.vx)
            b.x = b.r
          }
          if (b.x > w - b.r) {
            if (Math.random() < 0.5) {
              explode(b)
              bubbles.splice(i, 1)
              spawnBubble()
              continue
            }
            b.vx = -Math.abs(b.vx)
            b.x = w - b.r
          }
          if (b.y < b.r) {
            if (Math.random() < 0.5) {
              explode(b)
              bubbles.splice(i, 1)
              spawnBubble()
              continue
            }
            b.vy = Math.abs(b.vy)
            b.y = b.r
          }
          if (b.y > h - b.r) {
            if (Math.random() < 0.5) {
              explode(b)
              bubbles.splice(i, 1)
              spawnBubble()
              continue
            }
            b.vy = -Math.abs(b.vy)
            b.y = h - b.r
          }
          b.wob += dt * 1.5
          drawBubble(ctx, b, b.wob)
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i]
          p.life += dt
          if (p.life >= p.max) {
            particles.splice(i, 1)
            continue
          }
          const k = p.life / p.max
          if (p.ring) {
            const rr = p.start + k * 55
            ctx.globalAlpha = (1 - k) * 0.7
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(p.x, p.y, rr, 0, Math.PI * 2)
            ctx.stroke()
            ctx.globalAlpha = 1
          } else {
            p.x += p.vx * 60 * dt
            p.y += p.vy * 60 * dt
            p.vy += 2.7 * dt
            ctx.globalAlpha = 1 - k
            ctx.fillStyle = 'rgba(200,235,255,0.95)'
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, Math.PI * 2)
            ctx.fill()
            ctx.globalAlpha = 1
          }
        }
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [active, mode])

  if (!active) return null

  const isDay = mode === 'day'
  return (
    <>
      <div className="frutiger-scene" aria-hidden="true">
        {isDay ? <div className="frutiger-sun" /> : <div className="frutiger-moon" />}
        {isDay && (
          <div className="frutiger-clouds">
            <div
              className="frutiger-cloud"
              style={{ top: '12%', animationDuration: '90s' }}
            />
            <div
              className="frutiger-cloud"
              style={{ top: '27%', animationDuration: '130s', animationDelay: '-45s', '--s': 0.8 }}
            />
            <div
              className="frutiger-cloud"
              style={{ top: '6%', animationDuration: '115s', animationDelay: '-70s', '--s': 0.6 }}
            />
          </div>
        )}
        <CitySvg night={!isDay} />
        <GrassSvg night={!isDay} />
      </div>
      <canvas ref={canvasRef} className="frutiger-canvas" aria-hidden="true" />
    </>
  )
}