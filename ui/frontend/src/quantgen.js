const DEFAULT_SAMPLE = { n: 80, m: 40, seed: 20260821, effectSd: 0.12 }

export function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-9)
  const v = Math.max(rand(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function makeSampleData({ n, m, seed, effectSd } = {}) {
  const opts = { ...DEFAULT_SAMPLE, ...{ n, m, seed, effectSd } }
  const rand = mulberry32(opts.seed)
  const lines = []
  for (let i = 0; i < opts.n; i++) {
    const doses = []
    let genetic = 0
    for (let j = 0; j < opts.m; j++) {
      const d = Math.floor(rand() * 3)
      genetic += (d - 1) * gaussian(rand) * opts.effectSd
      doses.push(d)
    }
    const pheno = genetic + gaussian(rand)
    lines.push(`${pheno.toFixed(3)},${doses.join(',')}`)
  }
  return lines.join('\n')
}

export function parseQuantData(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (!lines.length) throw new Error('Introduce al menos un individuo')
  let width = null
  const phenotypes = []
  const genotypes = []
  lines.forEach((line, idx) => {
    const cells = line.split(',').map((c) => c.trim())
    if (width === null) width = cells.length
    if (cells.length !== width) {
      throw new Error(
        `La línea ${idx + 1} tiene ${cells.length} columnas (se esperaban ${width})`,
      )
    }
    if (width < 3) {
      throw new Error('Cada línea debe ser: fenotipo,dosis_1,dosis_2,...')
    }
    const pheno = Number(cells[0])
    if (!Number.isFinite(pheno)) {
      throw new Error(`Fenotipo inválido en la línea ${idx + 1}: "${cells[0]}"`)
    }
    const doses = cells.slice(1).map((c, j) => {
      if (c === '' || c.toLowerCase() === 'na') return null
      const v = Number(c)
      if (!Number.isFinite(v)) {
        throw new Error(
          `Genotipo inválido en la línea ${idx + 1}, columna ${j + 2}: "${c}"`,
        )
      }
      return v
    })
    phenotypes.push(pheno)
    genotypes.push(doses)
  })
  return { phenotypes, genotypes }
}
