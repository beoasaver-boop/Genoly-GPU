const RUNGS = Array.from({ length: 16 }, (_, i) => {
  const pair = i % 2 === 0 ? 'at' : 'cg'
  return {
    id: i,
    pair,
    x: `${6 + ((i * 37) % 88)}%`,
    y: `${20 + ((i * 53) % 60)}%`,
    len: 60 + ((i * 29) % 120),
    dur: 16 + ((i * 7) % 12),
    delay: (i * 3.4) % 20,
  }
})

export default function DnaBackdrop() {
  return (
    <div className="dna-backdrop fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {RUNGS.map((r) => (
        <span
          key={r.id}
          className={`rung ${r.pair === 'cg' ? 'rung--cg' : ''}`}
          style={{
            '--x': r.x,
            '--y': r.y,
            '--len': `${r.len}px`,
            '--dur': `${r.dur}s`,
            '--delay': `-${r.delay}s`,
          }}
        />
      ))}
    </div>
  )
}