// Re-parse the pricing XLSX with cell-style info so we can identify
// the rows London highlighted in green (the chosen replacements).
import XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'

const buf = readFileSync('C:/Users/bwest/Downloads/Pricing .xlsx')
const wb = XLSX.read(buf, { type: 'buffer', cellStyles: true })

// Helper: convert RRGGBB hex to "is this green-ish"?
// Green chars: G dominant (or close to R/B with high B mid-range), typical
// sheets greens fall in ranges like B7E1CD, D9EAD3, 93C47D, 00FF00.
function isGreenHex(hex) {
  if (!hex) return false
  const h = hex.toUpperCase().replace('#', '').replace(/^FF/, '').padStart(6, '0')
  if (h.length !== 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  // Green if G is dominant AND not just gray (R+B notably less than G), and not yellow (R close to G)
  return g >= 150 && g > r + 20 && g > b - 30 && r < 230
}

const allColors = new Set()
const greenRows = []
const allRows = []

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')

  // Walk row by row
  let currentSection = ''
  for (let R = range.s.r; R <= range.e.r; R++) {
    // Pull cells in this row
    const rowCells = []
    let rowFill = null
    for (let C = range.s.c; C <= range.e.c && C < 8; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr]
      const val = cell ? (cell.w || cell.v || '') : ''
      rowCells.push(typeof val === 'string' ? val.trim() : String(val))
      // Capture fill color of the FIRST cell with a fill (often A column or the name col)
      const fg = cell?.s?.fgColor?.rgb || cell?.s?.fill?.fgColor?.rgb || cell?.s?.bgColor?.rgb
      if (fg && !rowFill) rowFill = fg
    }

    const [c1, c2, c3, c4] = rowCells
    if (rowFill) allColors.add(rowFill)

    // Section heading: c1 empty, c2 present
    if (!c1 && c2 && !c4) {
      currentSection = c2
      continue
    }
    // Product row: c1 is numeric
    if (c1 && /^\d+$/.test(c1)) {
      const product = {
        sheet: sheetName,
        section: currentSection,
        sku: c1,
        name: c2,
        category: c3,
        price: c4,
        fill: rowFill || null,
        isGreen: isGreenHex(rowFill || ''),
      }
      allRows.push(product)
      if (product.isGreen) greenRows.push(product)
    }
  }
}

console.log(`Distinct fill colors seen: ${allColors.size}`)
console.log(`  ${[...allColors].sort().join('  ')}`)
console.log(`\nTotal product rows: ${allRows.length}`)
console.log(`Green-highlighted rows: ${greenRows.length}`)
console.log('\n=== Green rows (London\'s picks) ===')
for (const p of greenRows) {
  console.log(`[${p.sheet}] [${p.section}] ${p.sku}\t${p.name}\t${p.category}\t${p.price}\t#${p.fill}`)
}

writeFileSync('scripts/_mes_catalog_with_colors.json', JSON.stringify({ allRows, greenRows, colors: [...allColors] }, null, 2))
console.log('\nWrote scripts/_mes_catalog_with_colors.json')
