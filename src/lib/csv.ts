/**
 * A minimal CSV reader.
 *
 * Written rather than installed: the whole dependency here is about forty lines,
 * and a parser is the one place a data-privacy tool should not be handing user
 * pay data to third-party code it has not read.
 *
 * Handles quoted fields, commas and newlines inside quotes, doubled quotes as an
 * escape, and both line-ending conventions. Tabs are accepted as a delimiter
 * too, because pasting a column range straight out of a spreadsheet produces
 * tab-separated text rather than commas.
 */
export function parseDelimitedText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let fieldWasQuoted = false

  const delimiter = detectDelimiter(text)

  const endField = () => {
    row.push(fieldWasQuoted ? field : field.trim())
    field = ''
    fieldWasQuoted = false
  }

  const endRow = () => {
    endField()
    // Skip rows that are entirely empty, which trailing newlines produce.
    if (row.some((cell) => cell !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      fieldWasQuoted = true
      continue
    }
    if (char === delimiter) {
      endField()
      continue
    }
    if (char === '\r') continue
    if (char === '\n') {
      endRow()
      continue
    }
    field += char
  }

  if (field !== '' || row.length > 0) endRow()
  return rows
}

/** Tabs win if the first line has more of them than commas. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const tabs = (firstLine.match(/\t/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  return tabs > commas ? '\t' : ','
}

/**
 * Reduce a header to a comparable form: lowercase, and anything that is not a
 * letter or digit removed. So "Employee ID", "employee_id" and "EmployeeId" all
 * collapse to "employeeid".
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}
