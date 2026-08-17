import { useRef, useState } from 'react'
import { Card, Badge } from './ui.jsx'
import { parseFasta, parseHeader } from '../fasta.js'

const SAMPLE_ID = 'NM_007294.4'
const SAMPLE_DESC =
  'Homo sapiens BRCA1 DNA repair associated (BRCA1), transcript variant 1, mRNA'

const FIELDS = [
  { key: 'accession', label: 'Fragmento' },
  { key: 'species', label: 'Especie' },
  { key: 'gene', label: 'Gen asociado' },
  { key: 'variant', label: 'Variante' },
  { key: 'type', label: 'Tipo' },
]

export default function FastaPanel({ onLoaded }) {
  const inputRef = useRef(null)
  const [meta, setMeta] = useState(() => parseHeader(SAMPLE_ID, SAMPLE_DESC))
  const [source, setSource] = useState('BRCA1_humano.fasta (ejemplo)')
  const [recordCount, setRecordCount] = useState(1)
  const [error, setError] = useState(null)

  const handleFile = (file) => {
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const records = parseFasta(reader.result)
      if (!records.length) {
        setError('El archivo no contiene registros FASTA válidos.')
        return
      }
      const first = records[0]
      setMeta(parseHeader(first.id, first.description))
      setSource(file.name)
      setRecordCount(records.length)
      onLoaded?.(records)
    }
    reader.onerror = () => setError('No se pudo leer el archivo.')
    reader.readAsText(file)
  }

  return (
    <Card
      title="Fasta"
      subtitle="Carga un .fasta desde el dispositivo y analízalo sin copiar y pegar"
      actions={<Badge tone="accent">.fasta</Badge>}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".fasta,.fa,.fna,.txt"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
          Cargar .fasta
        </button>
        <span className="truncate font-mono text-xs text-ink-faint">{source}</span>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
          {error}
        </p>
      )}

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-faint">
            Cabecera del fasta
          </span>
          <span className="h-px flex-1 bg-line/40" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="rounded-lg border border-line/30 bg-panel-2/40 px-3 py-2">
              <div className="label">{f.label}</div>
              <div className="truncate font-mono text-sm text-ink">{meta[f.key] ?? '—'}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          {recordCount} {recordCount === 1 ? 'registro' : 'registros'}
        </p>
      </div>
    </Card>
  )
}