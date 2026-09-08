import { useMemo } from 'react'
import {
  EMPLOYEE_FIELDS,
  profileColumns,
  checkMapping,
  mappingPreview,
  setMappedColumn,
  attributeColumns,
  type ColumnMapping,
  type EmployeeField,
  type MappingConcern,
} from '../lib/column-mapping'
import { pluralize } from '../lib/format'

/**
 * Which column is which, and what the tool will read out of it.
 *
 * This is the screen that decides whether there is a second session. An HRIS
 * extract does not name its columns the way a spec does, and the previous
 * behaviour on a miss was an error message listing every header and no way to
 * act on it — the user had to go back to Excel, rename columns and paste again,
 * which most people do not do.
 *
 * It stays out of the way when it has nothing to say. A file whose columns all
 * matched cleanly collapses to a single line, because a confirmation step in
 * front of something that already worked is a tax on the common case.
 */
export function ColumnMapper({
  rows,
  mapping,
  onChange,
}: {
  rows: string[][]
  mapping: ColumnMapping
  onChange: (next: ColumnMapping) => void
}) {
  const profiles = useMemo(() => profileColumns(rows), [rows])
  const concerns = useMemo(() => checkMapping(mapping, profiles), [mapping, profiles])
  const preview = useMemo(() => mappingPreview(rows, mapping), [rows, mapping])
  const headers = useMemo(() => rows[0] ?? [], [rows])
  const attributes = useMemo(
    () => attributeColumns(mapping, headers),
    [mapping, headers],
  )

  const blocking = concerns.filter((c) => c.severity === 'blocking')
  const suspicious = concerns.filter((c) => c.severity === 'suspicious')
  const needsAttention = concerns.length > 0

  const concernFor = (field: EmployeeField) =>
    concerns.filter((c) => c.field === field)

  const body = (
    <div className="mt-2 space-y-2.5">
      {EMPLOYEE_FIELDS.map((descriptor) => (
        <FieldRow
          key={descriptor.field}
          label={descriptor.label}
          required={descriptor.required}
          purpose={descriptor.purpose}
          whenAbsent={descriptor.whenAbsent}
          headers={headers}
          selected={mapping.columns[descriptor.field]}
          quality={mapping.quality[descriptor.field]}
          preview={preview[descriptor.field]}
          concerns={concernFor(descriptor.field)}
          onSelect={(index) => onChange(setMappedColumn(mapping, descriptor.field, index))}
        />
      ))}

      <p className="border-t border-zinc-100 pt-2.5 text-[11px] leading-relaxed text-zinc-500">
        {attributes.length > 0 ? (
          <>
            Everything else becomes a dimension you can break results down by:{' '}
            <span className="text-zinc-700">
              {attributes.map((a) => a.header).join(', ')}
            </span>
            .
          </>
        ) : (
          'Any column you do not map here becomes a dimension you can break results down by.'
        )}
      </p>
    </div>
  )

  if (!needsAttention) {
    return (
      <details className="group rounded border border-zinc-200 bg-white px-3 py-2">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 text-[11px] text-zinc-500 hover:text-zinc-700">
          <span>
            <span className="text-emerald-700">✓</span> Columns read correctly
          </span>
          <span className="text-zinc-400">
            {mappedCount(mapping)} mapped
            {attributes.length > 0
              ? ` · ${pluralize(attributes.length, 'attribute')}`
              : ''}
            <span className="ml-1.5 text-zinc-300 group-open:hidden">change</span>
          </span>
        </summary>
        {body}
      </details>
    )
  }

  return (
    <div
      className={`rounded border px-3 py-2.5 ${
        blocking.length > 0
          ? 'border-amber-300 bg-amber-50'
          : 'border-zinc-200 bg-white'
      }`}
    >
      <div className="text-xs font-medium text-zinc-900">
        {blocking.length > 0
          ? 'Tell me which column is which'
          : 'Check these columns before trusting the numbers'}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
        {blocking.length > 0
          ? `Nothing in your file matches ${listFields(blocking)}. Pick the right column below — you do not need to go back and rename anything.`
          : `${pluralize(suspicious.length, 'column')} matched by name but could be something else. A wrong column still produces a budget, which is why this asks.`}
      </p>
      {body}
    </div>
  )
}

function FieldRow({
  label,
  required,
  purpose,
  whenAbsent,
  headers,
  selected,
  quality,
  preview,
  concerns,
  onSelect,
}: {
  label: string
  required: boolean
  purpose: string
  whenAbsent: string
  headers: string[]
  selected: number | null
  quality: string
  preview: { raw: string; read: string; ok: boolean }[]
  concerns: MappingConcern[]
  onSelect: (index: number | null) => void
}) {
  const blocking = concerns.some((c) => c.severity === 'blocking')
  const suspicious = concerns.length > 0 && !blocking

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="w-28 shrink-0 text-[11px] text-zinc-600" title={purpose}>
          {label}
          {required ? <span className="ml-0.5 text-amber-600">*</span> : null}
        </label>
        <select
          value={selected === null ? '' : String(selected)}
          onChange={(e) => onSelect(e.target.value === '' ? null : Number(e.target.value))}
          aria-label={`Column for ${label}`}
          className={`min-w-0 flex-1 rounded border bg-white px-1.5 py-0.5 text-[11px] focus:outline-none ${
            blocking
              ? 'border-amber-400 text-zinc-900 focus:border-amber-600'
              : suspicious
                ? 'border-amber-300 text-zinc-900 focus:border-zinc-500'
                : 'border-zinc-300 text-zinc-700 focus:border-zinc-500'
          }`}
        >
          <option value="">{required ? '— choose a column —' : '— not in my file —'}</option>
          {headers.map((header, index) => (
            <option key={index} value={index}>
              {header.trim() === '' ? `(column ${index + 1})` : header.trim()}
            </option>
          ))}
        </select>
        {quality === 'chosen' && selected !== null ? (
          <span className="shrink-0 text-[10px] text-zinc-400">yours</span>
        ) : null}
      </div>

      {selected !== null && preview.length > 0 ? (
        <div className="ml-30 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-0 text-[10px] tabular-nums">
          {preview.map((cell, i) => (
            <span key={i} className={cell.ok ? 'text-zinc-500' : 'text-amber-700'}>
              {cell.raw === '' ? <span className="text-zinc-300">blank</span> : cell.raw}
              {cell.read !== cell.raw ? (
                <span className={cell.ok ? 'text-zinc-400' : 'text-amber-700'}>
                  {' → '}
                  {cell.read}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {selected === null && !required && whenAbsent ? (
        <div className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
          {whenAbsent}
        </div>
      ) : null}

      {concerns.map((concern, i) => (
        <div key={i} className="mt-0.5 text-[10px] leading-relaxed text-amber-800">
          {concern.message}
        </div>
      ))}
    </div>
  )
}

function mappedCount(mapping: ColumnMapping): string {
  const n = Object.values(mapping.columns).filter((c) => c !== null).length
  return `${n} of ${EMPLOYEE_FIELDS.length} fields`
}

function listFields(concerns: MappingConcern[]): string {
  const labels = concerns.map(
    (c) =>
      EMPLOYEE_FIELDS.find((f) => f.field === c.field)?.label.toLowerCase() ?? c.field,
  )
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}
