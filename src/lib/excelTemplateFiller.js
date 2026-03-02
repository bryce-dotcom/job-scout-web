import * as XLSX from 'xlsx'
import { resolveDataPath } from './dataPathResolver'

const TAG_REGEX = /\{\{([^}]+)\}\}/g

/**
 * Extract all {{tag}} placeholders from an Excel workbook.
 * Scans every cell in every sheet.
 * @param {ArrayBuffer} arrayBuffer - raw .xlsx file data
 * @returns {Array<{ tag: string, locations: Array<{ sheet: string, cell: string, fullText: string }> }>}
 */
export function extractExcelTags(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const tagMap = new Map() // tag → locations[]

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c })
        const cell = ws[cellAddr]
        if (!cell || cell.t !== 's') continue // only string cells

        const text = String(cell.v || '')
        let match
        TAG_REGEX.lastIndex = 0
        while ((match = TAG_REGEX.exec(text)) !== null) {
          const tag = match[1].trim()
          if (!tagMap.has(tag)) {
            tagMap.set(tag, [])
          }
          tagMap.get(tag).push({ sheet: sheetName, cell: cellAddr, fullText: text })
        }
      }
    }
  }

  return Array.from(tagMap.entries()).map(([tag, locations]) => ({ tag, locations }))
}

/**
 * Validate an Excel tag against known data paths.
 * @param {string} tag - the tag text (e.g. "customer.name")
 * @param {Array<{ value: string }>} validPaths - DATA_PATHS array
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateExcelTag(tag, validPaths) {
  const pathValues = new Set(validPaths.map(p => p.value).filter(Boolean))

  // Exact match
  if (pathValues.has(tag)) {
    return { valid: true, reason: 'Known data path' }
  }

  // Indexed line-item pattern: lines.0.item_name, lines.15.quantity, etc.
  if (/^lines\.\d+\.\w+$/.test(tag)) {
    return { valid: true, reason: 'Line item field' }
  }

  // Aggregation pattern: collection.field.sum/count/avg/min/max/join
  if (/^\w+\.\w+\.(sum|count|avg|min|max|join)$/.test(tag)) {
    return { valid: true, reason: 'Aggregation' }
  }

  return { valid: false, reason: 'Unknown data path' }
}

/**
 * Fill an Excel template by replacing all {{tag}} placeholders with resolved data.
 * @param {ArrayBuffer} xlsxBytes - raw .xlsx file data
 * @param {object} data - full data context for resolveDataPath
 * @returns {Uint8Array} - filled workbook bytes
 */
export function fillExcelTemplate(xlsxBytes, data) {
  const wb = XLSX.read(xlsxBytes, { type: 'array' })

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c })
        const cell = ws[cellAddr]
        if (!cell || cell.t !== 's') continue

        const text = String(cell.v || '')
        if (!TAG_REGEX.test(text)) continue

        TAG_REGEX.lastIndex = 0
        const filled = text.replace(TAG_REGEX, (_, tag) => {
          const resolved = resolveDataPath(tag.trim(), data)
          return resolved !== '' ? resolved : ''
        })

        cell.v = filled
        // If the filled value looks numeric, keep it as string to preserve formatting
        cell.t = 's'
      }
    }
  }

  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))
}

/**
 * Trigger a browser download of Excel bytes.
 * @param {Uint8Array} bytes
 * @param {string} filename
 */
export function downloadExcel(bytes, filename) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
