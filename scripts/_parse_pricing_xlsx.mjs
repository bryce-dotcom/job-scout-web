// Parse the pricing XLSX file: extract every product row from every
// sheet/tab, normalize, dump as a structured JSON object we can use
// to build the current→new mapping for HHH electrical bundles.
import XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'

const buf = readFileSync('C:/Users/bwest/Downloads/Pricing .xlsx')
const wb = XLSX.read(buf, { type: 'buffer' })

const result = { sheets: {}, totalProducts: 0 }
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  // Find the header row — should contain "Internal ID" or "ID" + "Product"-ish
  let products = []
  let currentSection = ''
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const [c1, c2, c3, c4, c5] = r.map(x => (x == null ? '' : String(x).trim()))
    // Section header rows: first col empty, second col has a name
    if (!c1 && c2 && !c4) {
      currentSection = c2
      continue
    }
    // Product rows: c1 looks like a numeric ID
    if (c1 && /^\d+$/.test(c1)) {
      products.push({
        sku: c1,
        name: c2,
        category: c3,
        price: c4 || c5 || '',
        section: currentSection || '(unsectioned)',
      })
    }
  }
  result.sheets[sheetName] = { rowCount: rows.length, products, sections: [...new Set(products.map(p => p.section))] }
  result.totalProducts += products.length
}

writeFileSync('scripts/_mes_catalog.json', JSON.stringify(result, null, 2))

// Summary print
console.log(`workbook: ${wb.SheetNames.length} sheets`)
for (const [name, info] of Object.entries(result.sheets)) {
  console.log(`  ${name.padEnd(22)}  ${info.rowCount.toString().padStart(4)} rows · ${info.products.length} products · sections: ${info.sections.length}`)
  for (const s of info.sections) {
    const n = info.products.filter(p => p.section === s).length
    console.log(`     - ${s} (${n})`)
  }
}
console.log(`\nTotal products across all tabs: ${result.totalProducts}`)
console.log('Wrote scripts/_mes_catalog.json')
