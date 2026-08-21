import { describe, it, expect } from 'vitest'
import {
  workbookToText, sheetToText, trimGrid, SHEET_MAX_ROWS, SHEET_MAX_COLS, SHEET_MAX_CHARS,
} from './sheetText'

const rows = (n, make) => Array.from({ length: n }, (_, i) => make(i))

describe('trimming the empty edges off an export', () => {
  it('drops trailing empty rows and columns', () => {
    // Exported sheets trail blank admin columns and a run of empty rows.
    // Sending them wastes the budget that real rows need.
    expect(trimGrid([['a', 'b', '', ''], ['c', 'd', '', ''], ['', '', '', '']]))
      .toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps blanks that sit inside the data', () => {
    // A missing manufacturer is the answer to "what's missing" — losing it
    // would hide exactly what someone is auditing for.
    expect(trimGrid([['sku', 'mfr'], ['A1', ''], ['A2', 'MES']]))
      .toEqual([['sku', 'mfr'], ['A1', ''], ['A2', 'MES']])
  })

  it('returns nothing for a sheet with nothing in it', () => {
    expect(trimGrid([['', ''], ['', '']])).toEqual([])
    expect(trimGrid([])).toEqual([])
  })
})

describe('a sheet becomes readable text', () => {
  it('names the columns and states the real size', () => {
    const out = sheetToText('Price List', [['SKU', 'Cost'], ['A1', '10.50']])
    expect(out.text).toContain('Columns: SKU | Cost')
    expect(out.text).toContain('2 rows × 2 columns')
    expect(out.text).toContain('A1,10.50')
    expect(out.truncated).toBe(false)
  })

  it('quotes cells that would otherwise break the row', () => {
    const out = sheetToText('S', [['name'], ['Panel, 2x4 "Flat"']])
    expect(out.text).toContain('"Panel, 2x4 ""Flat"""')
  })

  it('labels an unnamed column instead of leaving a gap', () => {
    const out = sheetToText('S', [['SKU', ''], ['A1', 'x']])
    expect(out.text).toContain('SKU | (unnamed)')
  })

  it('returns null for an empty sheet rather than an empty table', () => {
    expect(sheetToText('Blank', [['', '']])).toBeNull()
  })
})

describe('saying so when the view is partial', () => {
  it('warns, and says how many rows it is not showing', () => {
    // This is the failure this whole session kept finding: a partial view
    // presented as the whole thing. A supplier list is the ideal place for
    // "every item is from MES" to be said about the first 400 rows.
    const out = sheetToText('Big', [['SKU'], ...rows(SHEET_MAX_ROWS + 50, i => [`A${i}`])])
    expect(out.truncated).toBe(true)
    expect(out.text).toMatch(new RegExp(`only the first ${SHEET_MAX_ROWS} of ${SHEET_MAX_ROWS + 50} data rows`))
    expect(out.text).toMatch(/do NOT total a column/)
  })

  it('still reports the true row count in the header', () => {
    const out = sheetToText('Big', [['SKU'], ...rows(SHEET_MAX_ROWS + 50, i => [`A${i}`])])
    expect(out.text).toContain(`${SHEET_MAX_ROWS + 51} rows`)
  })

  it('keeps the header row when it caps columns', () => {
    // Without the header the remaining numbers are unlabelled, and anything
    // said about them is invention.
    const wide = ['SKU', ...rows(SHEET_MAX_COLS + 10, i => `C${i}`)]
    const out = sheetToText('Wide', [wide, wide.map(() => 'v')])
    expect(out.text).toContain('Columns: SKU')
    expect(out.text).toMatch(new RegExp(`only the first ${SHEET_MAX_COLS} of ${wide.length} columns`))
  })
})

describe('a whole workbook', () => {
  it('lists every sheet up front, including the empty ones', () => {
    const { text } = workbookToText('supplier.xlsx', [
      { name: 'Prices', rows: [['SKU'], ['A1']] },
      { name: 'Notes', rows: [['', '']] },
    ])
    expect(text).toContain('SPREADSHEET: supplier.xlsx')
    expect(text).toContain('"Prices" 2×1')
    expect(text).toContain('"Notes" (empty)')
  })

  it('counts data rows across sheets, not header rows', () => {
    const { dataRows } = workbookToText('x.xlsx', [
      { name: 'A', rows: [['h'], ['1'], ['2']] },
      { name: 'B', rows: [['h'], ['3']] },
    ])
    expect(dataRows).toBe(3)
  })

  it('cuts an oversized workbook on a row boundary and says where it stopped', () => {
    // The per-sheet row cap handles one long sheet. The character ceiling is
    // the backstop for the shape it cannot catch: a workbook of many sheets,
    // each individually under the cap. Cutting mid-row would hand over a
    // malformed line that still reads as real data — worse than stopping.
    const sheet = (n) => ({
      name: `Tab${n}`,
      rows: [['SKU', 'Description'], ...rows(300, i => [`A${n}-${i}`, 'x'.repeat(80)])],
    })
    const { text, truncated } = workbookToText('huge.xlsx', rows(8, i => sheet(i)))
    expect(truncated).toBe(true)
    expect(text.length).toBeLessThanOrEqual(SHEET_MAX_CHARS + 400)
    expect(text).toMatch(/cut off here because it is too large/)
    // The final content line is a complete row, not half of one.
    const lines = text.split('\n')
    const lastData = lines[lines.findIndex(l => l.startsWith('WARNING: the file was cut off')) - 2]
    expect(lastData).not.toMatch(/,$/)
  })

  it('leaves a workbook that fits well alone', () => {
    const { text, truncated } = workbookToText('small.xlsx', [
      { name: 'S', rows: [['SKU', 'Cost'], ['A1', '10'], ['A2', '12']] },
    ])
    expect(truncated).toBe(false)
    expect(text).not.toMatch(/cut off/)
    expect(text).toContain('A2,12')
  })

  it('says a file is empty rather than pretending it read something', () => {
    const { text, dataRows } = workbookToText('blank.xlsx', [{ name: 'S', rows: [['']] }])
    expect(text).toMatch(/nothing in this file/)
    expect(dataRows).toBe(0)
  })
})
