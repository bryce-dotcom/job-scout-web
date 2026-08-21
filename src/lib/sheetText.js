// Turning a spreadsheet into something Arnie can actually read.
//
// A model cannot see an .xlsx. The file is a zip of XML, and handing it over
// as a document block gets us nothing. So the sheet is parsed in the browser
// and sent as TEXT — which means the interesting decisions are all about what
// to leave out, and saying so when we do.
//
// The rule this file follows is the one the rest of Arnie now follows: a
// partial view is fine, a partial view presented as the whole thing is not.
// A supplier price list is exactly the kind of document where "every product
// is from MES" gets said about the first hundred rows.

/** Rows sent per sheet before we start truncating. */
export const SHEET_MAX_ROWS = 400
/** Columns kept. Wide export sheets trail dozens of empty admin columns. */
export const SHEET_MAX_COLS = 40
/** Whole-payload ceiling, so one enormous file cannot blow up the request. */
export const SHEET_MAX_CHARS = 60000

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Drop trailing rows and columns that are entirely empty. */
export function trimGrid(rows) {
  const grid = (rows || []).map(r => (Array.isArray(r) ? r : []))
  let lastRow = -1
  let lastCol = -1
  grid.forEach((row, i) => {
    row.forEach((cell, j) => {
      if (cell != null && String(cell).trim() !== '') {
        if (i > lastRow) lastRow = i
        if (j > lastCol) lastCol = j
      }
    })
  })
  if (lastRow < 0) return []
  return grid.slice(0, lastRow + 1).map(r => {
    const out = r.slice(0, lastCol + 1)
    while (out.length < lastCol + 1) out.push('')
    return out
  })
}

/**
 * One sheet as text: a header line, then CSV rows.
 * Returns null for a sheet with nothing in it.
 */
export function sheetToText(name, rows) {
  const grid = trimGrid(rows)
  if (!grid.length) return null

  const totalRows = grid.length
  const totalCols = grid[0].length
  const colCapped = totalCols > SHEET_MAX_COLS
  const clipped = colCapped ? grid.map(r => r.slice(0, SHEET_MAX_COLS)) : grid

  // The header row is the one thing that must always survive — without it the
  // numbers below are unlabelled and everything said about them is a guess.
  const header = clipped[0]
  const body = clipped.slice(1)
  const rowCapped = body.length > SHEET_MAX_ROWS
  const shown = rowCapped ? body.slice(0, SHEET_MAX_ROWS) : body

  const lines = [
    `### Sheet "${name}" — ${totalRows} rows × ${totalCols} columns`,
    `Columns: ${header.map(h => String(h ?? '').trim() || '(unnamed)').join(' | ')}`,
  ]
  if (rowCapped || colCapped) {
    const parts = []
    if (rowCapped) parts.push(`only the first ${SHEET_MAX_ROWS} of ${body.length} data rows`)
    if (colCapped) parts.push(`only the first ${SHEET_MAX_COLS} of ${totalCols} columns`)
    lines.push(
      `WARNING: this is ${parts.join(' and ')}. Do NOT describe the file as a whole from this, ` +
      `and do NOT total a column from it. Say what you can see and offer to work through the rest.`,
    )
  }
  lines.push('```csv', clipped[0].map(csvCell).join(','))
  for (const r of shown) lines.push(r.map(csvCell).join(','))
  lines.push('```')
  return { text: lines.join('\n'), totalRows, totalCols, truncated: rowCapped || colCapped }
}

/**
 * A whole workbook as one text block.
 * `sheets` is [{ name, rows }] with rows as arrays of cell values.
 */
export function workbookToText(fileName, sheets) {
  const parts = []
  const summary = []
  let truncated = false
  let dataRows = 0

  for (const s of sheets || []) {
    const out = sheetToText(s.name, s.rows)
    if (!out) { summary.push(`"${s.name}" (empty)`); continue }
    parts.push(out.text)
    summary.push(`"${s.name}" ${out.totalRows}×${out.totalCols}`)
    truncated = truncated || out.truncated
    dataRows += Math.max(0, out.totalRows - 1)
  }

  if (!parts.length) {
    return { text: `SPREADSHEET: ${fileName}\n(There is nothing in this file.)`, truncated: false, dataRows: 0 }
  }

  let text = [
    `SPREADSHEET: ${fileName}`,
    `Sheets: ${summary.join(', ')}`,
    '',
    parts.join('\n\n'),
  ].join('\n')

  // Last-resort ceiling. Cutting mid-row would hand over a malformed line that
  // reads as real data, so the cut lands on a row boundary and announces itself.
  if (text.length > SHEET_MAX_CHARS) {
    const cut = text.lastIndexOf('\n', SHEET_MAX_CHARS)
    text = text.slice(0, cut > 0 ? cut : SHEET_MAX_CHARS)
      + '\n```\nWARNING: the file was cut off here because it is too large to send in full. '
      + 'Everything below this point is missing. Do not draw conclusions about the whole file.'
    truncated = true
  }

  return { text, truncated, dataRows }
}
