const MISSING_TOKENS = new Set(['', 'na', 'nan', 'null', 'none', '-', 'nd'])

export function detectDelimiter(line) {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = -1
  for (const c of candidates) {
    const count = line.split(c).length - 1
    if (count > bestCount) {
      best = c
      bestCount = count
    }
  }
  return best
}

function toNumber(cell) {
  if (cell == null || MISSING_TOKENS.has(String(cell).toLowerCase())) return null
  let s = String(cell).trim()
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.')
  const v = Number(s)
  return Number.isFinite(v) ? v : NaN
}

export function parseTextGrid(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) throw new Error('El archivo no contiene datos')
  const delim = detectDelimiter(lines[0])
  return lines.map((l) => l.split(delim).map((c) => c.trim()))
}

export async function parseFileGrid(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) throw new Error('El archivo Excel no contiene hojas de datos')
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    return rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim())))
  }
  return parseTextGrid(await file.text())
}

export function preprocessGrid(rawGrid, { imputeMethod = 'media' } = {}) {
  if (!['media', 'moda'].includes(imputeMethod)) {
    throw new Error('Método de imputación inválido: usa media o moda')
  }
  let grid = rawGrid.filter((r) => r.some((c) => c != null && String(c) !== ''))
  if (!grid.length) throw new Error('El archivo no contiene filas de datos')

  const rowsRead = grid.length
  const width = Math.max(...grid.map((r) => r.length))
  grid = grid.map((r) => {
    const row = [...r]
    while (row.length < width) row.push('')
    return row
  })

  const isNonNumeric = (c) => {
    const v = toNumber(c)
    return v !== null && Number.isNaN(v)
  }
  const headerDetected = grid[0].some(isNonNumeric)
  let columnNames = grid[0].map((c, j) =>
    headerDetected && String(c) !== '' ? String(c) : `col_${j + 1}`,
  )
  if (headerDetected) grid = grid.slice(1)

  const bodyNumeric = grid.map((row) => row.map(toNumber))

  const droppedColumns = []
  const validColumns = []
  for (let j = 0; j < width; j++) {
    if (j === 0) {
      validColumns.push(0)
      continue
    }
    const hasData = bodyNumeric.some((row) => row[j] !== null && !Number.isNaN(row[j]))
    const allNumeric = bodyNumeric.every(
      (row) => row[j] === null || !Number.isNaN(row[j]),
    )
    if (hasData && allNumeric) {
      validColumns.push(j)
    } else {
      droppedColumns.push(columnNames[j])
    }
  }

  const phenotypes = []
  const genotypes = []
  let droppedRowsNoPhenotype = 0
  for (const row of bodyNumeric) {
    const pheno = row[0]
    if (pheno === null || Number.isNaN(pheno)) {
      droppedRowsNoPhenotype++
      continue
    }
    phenotypes.push(pheno)
    genotypes.push(validColumns.slice(1).map((j) => {
      const v = row[j]
      return v === null ? null : v
    }))
  }

  if (phenotypes.length < 5) {
    throw new Error(
      `Tras la limpieza quedan ${phenotypes.length} individuos; se necesitan al menos 5`,
    )
  }
  if (validColumns.length < 3) {
    throw new Error(
      `Tras la limpieza quedan ${validColumns.length - 1} marcadores; se necesitan al menos 2`,
    )
  }

  let imputedCells = 0
  const nMarkers = genotypes[0].length
  for (let j = 0; j < nMarkers; j++) {
    const observed = genotypes
      .map((row) => row[j])
      .filter((v) => v !== null)
    if (!observed.length) continue
    let fill
    if (imputeMethod === 'moda') {
      const counts = new Map()
      for (const v of observed) counts.set(v, (counts.get(v) ?? 0) + 1)
      fill = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    } else {
      fill = observed.reduce((s, v) => s + v, 0) / observed.length
    }
    for (const row of genotypes) {
      if (row[j] === null) {
        row[j] = fill
        imputedCells++
      }
    }
  }

  return {
    phenotypes,
    genotypes,
    report: {
      rows_read: rowsRead,
      header_detected: headerDetected,
      columns_total: width,
      dropped_columns: droppedColumns,
      dropped_rows_no_phenotype: droppedRowsNoPhenotype,
      imputed_cells: imputedCells,
      impute_method: imputeMethod,
      final_rows: phenotypes.length,
      final_markers: nMarkers,
    },
  }
}
