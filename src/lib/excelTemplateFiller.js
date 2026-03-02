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
 * Extract labeled input cells from an Excel workbook that has no {{tag}} placeholders.
 * Scans the first ~25 rows of each sheet for label-like text cells and detects
 * their corresponding input cells using merged cell ranges or adjacent empty cells.
 *
 * @param {ArrayBuffer} arrayBuffer - raw .xlsx file data
 * @returns {Array<{ sheet: string, labelCell: string, labelText: string, inputCell: string|null, inputRef: string|null }>}
 */
export function extractExcelCellLabels(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const results = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const ref = ws['!ref']
    if (!ref) continue
    const range = XLSX.utils.decode_range(ref)
    const merges = ws['!merges'] || []
    const maxRow = Math.min(range.e.r, 25)

    // Build a set of cells that are part of full-width merged ranges (section headers)
    const fullWidthMergedCells = new Set()
    const sheetColSpan = range.e.c - range.s.c + 1
    for (const m of merges) {
      const mergeColSpan = m.e.c - m.s.c + 1
      if (mergeColSpan >= sheetColSpan * 0.8) {
        for (let r = m.s.r; r <= m.e.r; r++) {
          for (let c = m.s.c; c <= m.e.c; c++) {
            fullWidthMergedCells.add(XLSX.utils.encode_cell({ r, c }))
          }
        }
      }
    }

    for (let r = 0; r <= maxRow; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c })
        const cell = ws[cellAddr]

        // Must be a non-empty string cell, not a formula
        if (!cell || cell.t !== 's' || cell.f) continue
        const text = String(cell.v || '').trim()
        if (text.length < 3 || text.length > 60) continue

        // Skip section headers (full-width merged cells)
        if (fullWidthMergedCells.has(cellAddr)) continue

        // Find the input cell
        let inputCell = null

        // Strategy 1: Look for merged ranges on the same row, starting column > label column
        const samRowMerges = merges
          .filter(m => m.s.r <= r && m.e.r >= r && m.s.c > c)
          .sort((a, b) => a.s.c - b.s.c)

        if (samRowMerges.length > 0) {
          const nearest = samRowMerges[0]
          const candidate = XLSX.utils.encode_cell({ r: nearest.s.r, c: nearest.s.c })
          const candidateCell = ws[candidate]
          // Accept if the cell is empty or has a value but no formula
          if (!candidateCell || !candidateCell.f) {
            inputCell = candidate
          }
        }

        // Strategy 2: Scan right for an empty non-formula cell
        if (!inputCell) {
          for (let dc = 1; dc <= 3; dc++) {
            const nc = c + dc
            if (nc > range.e.c) break
            const addr = XLSX.utils.encode_cell({ r, c: nc })
            const adj = ws[addr]
            if (!adj || (adj.t !== 's' || !String(adj.v || '').trim())) {
              // Empty cell or non-string — good candidate
              if (!adj || !adj.f) {
                inputCell = addr
                break
              }
            }
          }
        }

        results.push({
          sheet: sheetName,
          labelCell: cellAddr,
          labelText: text,
          inputCell,
          inputRef: inputCell ? `${sheetName}!${inputCell}` : null
        })
      }
    }
  }

  return results
}

/**
 * Fill an Excel workbook by writing resolved data to specific cell addresses.
 * Used for cell-mapping mode (structured utility forms without {{tag}} placeholders).
 *
 * @param {ArrayBuffer} xlsxBytes - raw .xlsx file data
 * @param {object} cellMapping - { "_mode": "cell_mapping", "SheetName!CellRef": "data.path", ... }
 * @param {object} data - full data context for resolveDataPath
 * @returns {Uint8Array} - filled workbook bytes
 */
export function fillExcelCellMapping(xlsxBytes, cellMapping, data) {
  const wb = XLSX.read(xlsxBytes, { type: 'array' })

  for (const [key, dataPath] of Object.entries(cellMapping)) {
    // Skip the mode marker
    if (key === '_mode') continue
    if (!dataPath) continue

    // Parse "SheetName!CellRef"
    const bangIdx = key.lastIndexOf('!')
    if (bangIdx < 0) continue
    const sheetName = key.substring(0, bangIdx)
    const cellRef = key.substring(bangIdx + 1)

    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    // Never overwrite formula cells
    const existing = ws[cellRef]
    if (existing && existing.f) continue

    const resolved = resolveDataPath(dataPath, data)
    if (resolved === '') continue

    // Use numeric type if the value is a number, so formulas referencing it work
    const numVal = Number(resolved)
    if (!isNaN(numVal) && resolved.trim() !== '') {
      ws[cellRef] = { t: 'n', v: numVal }
    } else {
      ws[cellRef] = { t: 's', v: resolved }
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
