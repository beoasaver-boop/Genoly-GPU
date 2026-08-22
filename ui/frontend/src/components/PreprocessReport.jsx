export default function PreprocessReport({ report }) {
  if (!report) return null
  const items = [
    ['Archivo', report.source],
    ['Filas leídas', report.rows_read],
    ['Cabecera detectada', report.header_detected ? 'Sí' : 'No'],
    [
      'Columnas eliminadas',
      report.dropped_columns.length
        ? report.dropped_columns.join(', ')
        : 'Ninguna',
    ],
    ['Filas sin fenotipo eliminadas', report.dropped_rows_no_phenotype],
    [
      `Celdas imputadas (${report.impute_method})`,
      report.imputed_cells,
    ],
    ['Individuos finales', report.final_rows],
    ['Marcadores finales', report.final_markers],
  ]
  return (
    <div className="rounded-lg border border-ok/40 bg-ok/10 px-4 py-3 text-sm">
      <div className="mb-1 font-bold text-ok">Datos preprocesados</div>
      <ul className="space-y-0.5">
        {items.map(([label, value]) => (
          <li key={label} className="flex justify-between gap-4">
            <span className="text-ink-faint">{label}</span>
            <span className="truncate font-mono text-ink">{String(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
