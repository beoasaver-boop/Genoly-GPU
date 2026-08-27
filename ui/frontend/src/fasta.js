export function parseFasta(text) {
  const records = []
  let id = null
  let description = null
  let lines = []

  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('>')) {
      if (id !== null) {
        records.push({ id, description, sequence: lines.join('') })
      }
      const header = line.slice(1).trim()
      const parts = header.split(/\s+/)
      id = parts[0] || null
      description = parts.length > 1 ? parts.slice(1).join(' ') : null
      lines = []
    } else {
      lines.push(line)
    }
  }

  if (id !== null) {
    records.push({ id, description, sequence: lines.join('') })
  }

  return records
}

export function parseHeader(id, description) {
  const meta = { accession: id, species: null, gene: null, variant: null, type: null }
  if (!description) return meta

  const text = description.trim()

  const vm = text.match(/(transcript\s+variant|variant)\s+(\d+)/i)
  if (vm) {
    const label = vm[1][0].toUpperCase() + vm[1].slice(1).toLowerCase()
    meta.variant = `${label} ${vm[2]}`
  }

  const last = text.split(/\s+/).pop().replace(/[,.;]+$/, '')
  if (/^(mRNA|RNA|DNA|protein|genomic|CDS)$/i.test(last)) meta.type = last

  const gm = text.match(/\b([A-Z][A-Z0-9]*\d+[A-Z0-9]*)\b/)
  if (gm) meta.gene = gm[1]

  const sm = text.match(/^([A-Z][a-z]+)\s+([a-z]+)/)
  if (sm) meta.species = `${sm[1]} ${sm[2]}`

  return meta
}