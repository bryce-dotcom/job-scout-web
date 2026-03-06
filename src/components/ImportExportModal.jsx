import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from './Layout'
import { Upload, X, ArrowRight, CheckCircle, AlertCircle, Loader, FileSpreadsheet, Undo2 } from 'lucide-react'
import * as XLSX from 'xlsx'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

// Parse a raw string value into the correct JS type based on field definition
function parseValue(raw, fieldDef) {
  if (raw === undefined || raw === null || raw === '') return null
  const str = String(raw).trim()
  if (!str) return null

  switch (fieldDef.type) {
    case 'number': {
      const cleaned = str.replace(/[$,]/g, '')
      const n = parseFloat(cleaned)
      return isNaN(n) ? null : n
    }
    case 'boolean': {
      const lower = str.toLowerCase()
      if (['true', 'yes', '1', 'y'].includes(lower)) return true
      if (['false', 'no', '0', 'n', 'inactive'].includes(lower)) return false
      return true // default to true for boolean fields
    }
    case 'date': {
      const d = new Date(str)
      return isNaN(d.getTime()) ? null : d.toISOString()
    }
    default:
      return str
  }
}

/**
 * Export data to CSV and trigger download.
 * @param {Array} data - Array of objects to export
 * @param {Array} fields - Field definitions array with { field, label }
 * @param {string} filename - Download filename (without .csv extension)
 */
export function exportToCSV(data, fields, filename) {
  if (!data || data.length === 0) {
    alert('No data to export')
    return
  }

  const headers = fields.map(f => f.label)
  const rows = data.map(item =>
    fields.map(f => {
      const val = item[f.field]
      if (val === null || val === undefined) return ''
      const str = String(val)
      // Escape values containing commas, quotes, or newlines
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    })
  )

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export data to a multi-sheet XLSX workbook with related child data.
 * @param {Array} data - Array of parent entity objects to export
 * @param {Array} fields - Field definitions for the parent entity
 * @param {string} filename - Download filename (without .xlsx extension)
 * @param {Object} options - { relatedTables, parentRefField, mainSheetName, companyId }
 *   relatedTables: [{ tableName, sheetName, parentIdField, parentRefLabel, fields, fetchData }]
 *   parentRefField: field on parent that serves as a human-readable reference (e.g. 'job_id')
 *   mainSheetName: name for the first/parent sheet (e.g. 'Jobs')
 *   companyId: company ID for fetching related data
 */
export async function exportToXLSX(data, fields, filename, options = {}) {
  const { relatedTables = [], parentRefField, mainSheetName = 'Data', companyId } = options

  if (!data || data.length === 0) {
    alert('No data to export')
    return
  }

  const wb = XLSX.utils.book_new()

  // Sheet 1: parent entities
  const mainHeaders = [...fields.map(f => f.label)]
  const mainRows = data.map(item =>
    fields.map(f => {
      const val = item[f.field]
      return val === null || val === undefined ? '' : val
    })
  )
  const mainSheet = XLSX.utils.aoa_to_sheet([mainHeaders, ...mainRows])
  mainSheet['!cols'] = mainHeaders.map(h => ({ wch: Math.max(h.length + 2, 14) }))
  XLSX.utils.book_append_sheet(wb, mainSheet, mainSheetName)

  // Build parent ID → reference value map
  const parentIds = data.map(item => item.id).filter(Boolean)
  const parentRefMap = {} // id → human-readable ref
  if (parentRefField) {
    data.forEach(item => {
      if (item.id) parentRefMap[item.id] = item[parentRefField] || `#${item.id}`
    })
  }

  // Sheets 2+: related/child tables
  for (const rt of relatedTables) {
    let childRows = []
    if (rt.fetchData && parentIds.length > 0) {
      try {
        childRows = await rt.fetchData(parentIds, companyId)
      } catch (e) {
        console.error(`Failed to fetch ${rt.tableName}:`, e)
      }
    }

    const childHeaders = [rt.parentRefLabel || 'Parent Ref', ...rt.fields.map(f => f.label)]
    const childData = childRows.map(row => {
      const refVal = parentRefMap[row[rt.parentIdField]] || row[rt.parentIdField] || ''
      return [refVal, ...rt.fields.map(f => {
        const val = row[f.field]
        return val === null || val === undefined ? '' : val
      })]
    })

    const childSheet = XLSX.utils.aoa_to_sheet([childHeaders, ...childData])
    childSheet['!cols'] = childHeaders.map(h => ({ wch: Math.max(String(h).length + 2, 14) }))
    XLSX.utils.book_append_sheet(wb, childSheet, rt.sheetName)
  }

  // Download
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Shared Import/Export Modal component.
 *
 * Props:
 * - tableName: Supabase table name (e.g. "leads")
 * - entityName: Display name (e.g. "Leads")
 * - fields: Field definitions array from importExportFields.js
 * - companyId: Company ID for multi-tenant isolation
 * - requiredField: The field that must be mapped (e.g. "customer_name")
 * - defaultValues: Object auto-set on every imported row (e.g. { company_id, status: 'New' })
 * - extraContext: Extra context string for AI mapping prompt
 * - onImportComplete: Callback after import finishes
 * - onClose: Close the modal
 */
export default function ImportExportModal({
  tableName,
  entityName,
  fields,
  companyId,
  requiredField,
  defaultValues = {},
  extraContext = '',
  relatedTables = [],
  parentRefField,
  onImportComplete,
  onClose,
}) {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Import state
  const [step, setStep] = useState('upload') // upload | mapping | preview | importing | done
  const [importFile, setImportFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [defaults, setDefaults] = useState({})
  const [notes, setNotes] = useState('')
  const [mappingLoading, setMappingLoading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] })
  const [insertedIds, setInsertedIds] = useState([])
  const [undoing, setUndoing] = useState(false)
  const [undone, setUndone] = useState(false)

  // Multi-sheet state
  const [isMultiSheet, setIsMultiSheet] = useState(false)
  const [childSheets, setChildSheets] = useState({}) // { tableName: { headers, rows, mapping, sheetName } }
  const [activeTab, setActiveTab] = useState(0) // 0 = main, 1+ = child tables
  const [childInsertedIds, setChildInsertedIds] = useState({}) // { tableName: [ids] }
  const [importSummary, setImportSummary] = useState({}) // { tableName: { count, errors } }

  const reqField = requiredField || fields.find(f => f.required)?.field || fields[0]?.field

  // File handler — reads CSV/XLSX/XLS/TSV
  const handleFile = async (file) => {
    setImportFile(file)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })

      // Detect multi-sheet XLSX when relatedTables are configured
      const hasMultipleSheets = workbook.SheetNames.length > 1 && relatedTables.length > 0
      setIsMultiSheet(hasMultipleSheets)

      // Parse first (main) sheet
      const mainSheetName = workbook.SheetNames[0]
      const mainSheet = workbook.Sheets[mainSheetName]
      const mainJson = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: '' })

      if (mainJson.length < 2) {
        alert('File must have at least a header row and one data row')
        return
      }

      const fileHeaders = mainJson[0].map(h => String(h).trim())
      const fileRows = mainJson.slice(1).filter(row => row.some(cell => cell !== ''))
      setHeaders(fileHeaders)
      setRows(fileRows)

      // Parse child sheets if multi-sheet
      if (hasMultipleSheets) {
        const childData = {}
        for (const rt of relatedTables) {
          // Auto-match sheet by name (case-insensitive, partial match)
          const matchedSheet = workbook.SheetNames.find(sn =>
            sn.toLowerCase() === rt.sheetName.toLowerCase() ||
            sn.toLowerCase().includes(rt.sheetName.toLowerCase()) ||
            rt.sheetName.toLowerCase().includes(sn.toLowerCase())
          )
          if (matchedSheet) {
            const sheet = workbook.Sheets[matchedSheet]
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
            if (json.length >= 1) {
              const cHeaders = json[0].map(h => String(h).trim())
              const cRows = json.slice(1).filter(row => row.some(cell => cell !== ''))
              childData[rt.tableName] = { headers: cHeaders, rows: cRows, mapping: {}, sheetName: matchedSheet }
            }
          }
        }
        setChildSheets(childData)
      }

      setStep('mapping')
      setMappingLoading(true)

      // Build targetFields for the edge function
      const targetFields = fields.map(f => ({
        field: f.field,
        type: f.type,
        required: !!f.required,
        desc: f.desc || f.label,
      }))

      // Call AI to map main columns
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-map-columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
          body: JSON.stringify({
            headers: fileHeaders,
            sampleRows: fileRows.slice(0, 5),
            targetFields,
            requiredField: reqField,
            extraContext: extraContext || undefined,
          }),
        })
        const result = await resp.json()
        if (result.mapping) {
          setMapping(result.mapping)
          setDefaults(result.defaults || {})
          setNotes(result.notes || '')
        }
      } catch (_) {
        setNotes('AI mapping unavailable — please map columns manually')
      }

      // AI-map child sheets too
      if (hasMultipleSheets) {
        for (const rt of relatedTables) {
          const cd = childSheets[rt.tableName] || {}
          // Try to auto-map child sheets too (re-read from childData since state may not be set yet)
          const matchedSheet = workbook.SheetNames.find(sn =>
            sn.toLowerCase() === rt.sheetName.toLowerCase() ||
            sn.toLowerCase().includes(rt.sheetName.toLowerCase()) ||
            rt.sheetName.toLowerCase().includes(sn.toLowerCase())
          )
          if (matchedSheet) {
            const sheet = workbook.Sheets[matchedSheet]
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
            if (json.length >= 2) {
              const cHeaders = json[0].map(h => String(h).trim())
              const cRows = json.slice(1).filter(row => row.some(cell => cell !== ''))
              const childTargetFields = [
                { field: '_parentRef', type: 'text', required: true, desc: rt.parentRefLabel || 'Parent reference ID' },
                ...rt.fields.map(f => ({ field: f.field, type: f.type, required: !!f.required, desc: f.desc || f.label }))
              ]
              try {
                const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
                const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
                const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-map-columns`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
                  body: JSON.stringify({
                    headers: cHeaders,
                    sampleRows: cRows.slice(0, 5),
                    targetFields: childTargetFields,
                    requiredField: '_parentRef',
                  }),
                })
                const result = await resp.json()
                if (result.mapping) {
                  setChildSheets(prev => ({
                    ...prev,
                    [rt.tableName]: { ...prev[rt.tableName], headers: cHeaders, rows: cRows, mapping: result.mapping, sheetName: matchedSheet }
                  }))
                }
              } catch (_) { /* manual mapping fallback */ }
            }
          }
        }
      }

      setMappingLoading(false)
    } catch (err) {
      alert('Could not read file: ' + err.message)
    }
  }

  const updateMapping = (targetField, sourceIdx) => {
    setMapping(prev => {
      const next = { ...prev }
      if (sourceIdx === '' || sourceIdx === null) {
        delete next[targetField]
      } else {
        next[targetField] = parseInt(sourceIdx)
      }
      return next
    })
  }

  const updateChildMapping = (tableName, targetField, sourceIdx) => {
    setChildSheets(prev => {
      const child = prev[tableName] || {}
      const nextMapping = { ...child.mapping }
      if (sourceIdx === '' || sourceIdx === null) {
        delete nextMapping[targetField]
      } else {
        nextMapping[targetField] = parseInt(sourceIdx)
      }
      return { ...prev, [tableName]: { ...child, mapping: nextMapping } }
    })
  }

  const getMappedValue = (row, field) => {
    const idx = mapping[field]
    if (idx === undefined || idx === null) return defaults[field] ?? ''
    const raw = row[idx]
    if (raw === undefined || raw === null || raw === '') return defaults[field] ?? ''
    return raw
  }

  const getChildMappedValue = (row, field, childMapping) => {
    const idx = childMapping[field]
    if (idx === undefined || idx === null) return ''
    const raw = row[idx]
    if (raw === undefined || raw === null || raw === '') return ''
    return raw
  }

  const getPreviewRows = () => {
    return rows.slice(0, 10).map(row => {
      const mapped = {}
      fields.forEach(f => {
        mapped[f.field] = getMappedValue(row, f.field)
      })
      return mapped
    })
  }

  const isMappingValid = mapping[reqField] !== undefined || mapping[reqField] === 0

  // Execute the import (handles both single-sheet and multi-sheet)
  const executeImport = async () => {
    if (!isMappingValid) {
      alert(`${fields.find(f => f.field === reqField)?.label || reqField} mapping is required`)
      return
    }

    setStep('importing')
    const childRowCount = isMultiSheet ? Object.values(childSheets).reduce((sum, cs) => sum + (cs.rows?.length || 0), 0) : 0
    const total = rows.length + childRowCount
    setProgress({ done: 0, total, errors: [] })
    const errors = []
    const allInsertedIds = []
    const BATCH_SIZE = 25

    // --- Phase 1: Insert parent records ---
    // Track ref value → index mapping so we can link parents to children
    const parentRefValues = [] // ordered list of ref values, matching insertion order

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const records = batch.map(row => {
        const record = { ...defaultValues }

        fields.forEach(f => {
          const raw = getMappedValue(row, f.field)
          const parsed = parseValue(raw, f)
          if (parsed !== null) {
            record[f.field] = parsed
          }
        })

        // Check required field exists
        const reqVal = record[reqField]
        if (reqVal === null || reqVal === undefined || reqVal === '') return null

        return record
      }).filter(Boolean)

      // Track parent ref values for linking
      if (isMultiSheet && parentRefField) {
        batch.forEach(row => {
          const record = {}
          fields.forEach(f => {
            const raw = getMappedValue(row, f.field)
            const parsed = parseValue(raw, f)
            if (parsed !== null) record[f.field] = parsed
          })
          const reqVal = record[reqField]
          if (reqVal !== null && reqVal !== undefined && reqVal !== '') {
            parentRefValues.push(record[parentRefField] || '')
          }
        })
      }

      if (records.length > 0) {
        const { data, error } = await supabase.from(tableName).insert(records).select('id')
        if (error) {
          errors.push(`${entityName} rows ${i + 1}-${i + batch.length}: ${error.message}`)
        } else if (data) {
          allInsertedIds.push(...data.map(r => r.id))
        }
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, rows.length), total, errors: [...errors] })
    }

    setInsertedIds(allInsertedIds)

    // --- Phase 2: Insert child records (multi-sheet only) ---
    if (isMultiSheet && allInsertedIds.length > 0) {
      // Build ref value → new DB ID lookup
      const refToId = {}
      parentRefValues.forEach((refVal, idx) => {
        if (refVal && allInsertedIds[idx]) {
          refToId[String(refVal).trim()] = allInsertedIds[idx]
        }
      })

      const allChildInserted = {}
      const summary = {}

      for (const rt of relatedTables) {
        const cs = childSheets[rt.tableName]
        if (!cs || !cs.rows || cs.rows.length === 0) continue

        const childIds = []
        let childErrors = 0

        for (let i = 0; i < cs.rows.length; i += BATCH_SIZE) {
          const batch = cs.rows.slice(i, i + BATCH_SIZE)
          const records = batch.map(row => {
            // Resolve parent reference
            const refVal = String(getChildMappedValue(row, '_parentRef', cs.mapping)).trim()
            const parentId = refToId[refVal]
            if (!parentId) return null // skip rows that can't be linked

            const record = { company_id: companyId, [rt.parentIdField]: parentId }

            rt.fields.forEach(f => {
              const raw = getChildMappedValue(row, f.field, cs.mapping)
              const parsed = parseValue(raw, f)
              if (parsed !== null) {
                record[f.field] = parsed
              }
            })
            return record
          }).filter(Boolean)

          if (records.length > 0) {
            const { data, error } = await supabase.from(rt.tableName).insert(records).select('id')
            if (error) {
              errors.push(`${rt.sheetName} rows ${i + 1}-${i + batch.length}: ${error.message}`)
              childErrors++
            } else if (data) {
              childIds.push(...data.map(r => r.id))
            }
          }
          setProgress(prev => ({
            ...prev,
            done: Math.min(prev.done + BATCH_SIZE, total),
            errors: [...errors]
          }))
        }

        allChildInserted[rt.tableName] = childIds
        summary[rt.tableName] = { count: childIds.length, errors: childErrors }
      }

      setChildInsertedIds(allChildInserted)
      setImportSummary(summary)
    }

    setStep('done')
    setProgress(prev => ({ ...prev, done: total, errors }))
    if (onImportComplete) onImportComplete()
  }

  const activeFields = fields.filter(f => mapping[f.field] !== undefined || defaults[f.field] !== undefined)

  // Tabs config for multi-sheet mapping
  const mappingTabs = isMultiSheet
    ? [{ label: entityName, key: 'main' }, ...relatedTables.filter(rt => childSheets[rt.tableName]).map(rt => ({ label: rt.sheetName, key: rt.tableName }))]
    : []

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        backgroundColor: theme.bgCard,
        borderRadius: '16px',
        border: `1px solid ${theme.border}`,
        width: '100%',
        maxWidth: step === 'preview' ? '800px' : '560px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 51
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${theme.border}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={20} style={{ color: '#3b82f6' }} />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: theme.text }}>
              {step === 'upload' && `Import ${entityName}`}
              {step === 'mapping' && 'Map Columns'}
              {step === 'preview' && 'Preview Import'}
              {step === 'importing' && 'Importing...'}
              {step === 'done' && 'Import Complete'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6' }}
                onDragLeave={e => { e.currentTarget.style.borderColor = theme.border }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = theme.border
                  const file = e.dataTransfer.files[0]
                  if (file) handleFile(file)
                }}
                style={{
                  border: `2px dashed ${theme.border}`,
                  borderRadius: '12px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.csv,.xlsx,.xls,.tsv'
                  input.onchange = e => { const f = e.target.files?.[0]; if (f) handleFile(f) }
                  input.click()
                }}
              >
                <Upload size={36} style={{ color: '#3b82f6', marginBottom: '12px' }} />
                <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '6px' }}>
                  Drop a file here or click to browse
                </div>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  CSV, Excel (.xlsx, .xls), or TSV — any column format
                </div>
                <div style={{
                  marginTop: '16px', padding: '10px 16px',
                  backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: '8px',
                  fontSize: '12px', color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}>
                  <AlertCircle size={14} />
                  AI will automatically map your columns to the right fields
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: MAPPING */}
          {step === 'mapping' && (
            <div>
              {mappingLoading ? (
                <div style={{ textAlign: 'center', padding: '32px' }}>
                  <Loader size={28} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite' }} />
                  <div style={{ fontSize: '14px', color: theme.textSecondary, marginTop: '12px' }}>AI is analyzing your columns...</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
                    {importFile?.name} — {rows.length} rows found
                    {isMultiSheet && ` + ${Object.values(childSheets).reduce((s, cs) => s + (cs.rows?.length || 0), 0)} child rows across ${Object.keys(childSheets).length} sheet(s)`}
                  </div>
                  {notes && (
                    <div style={{
                      padding: '8px 12px', marginBottom: '16px', borderRadius: '8px',
                      backgroundColor: 'rgba(59,130,246,0.08)', fontSize: '12px', color: '#3b82f6'
                    }}>
                      {notes}
                    </div>
                  )}

                  {/* Tabs for multi-sheet */}
                  {isMultiSheet && mappingTabs.length > 1 && (
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '0' }}>
                      {mappingTabs.map((tab, idx) => (
                        <button key={tab.key} onClick={() => setActiveTab(idx)} style={{
                          padding: '8px 14px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                          border: 'none', borderBottom: `2px solid ${activeTab === idx ? '#3b82f6' : 'transparent'}`,
                          backgroundColor: 'transparent',
                          color: activeTab === idx ? '#3b82f6' : theme.textMuted,
                        }}>
                          {tab.label}
                          {idx > 0 && childSheets[tab.key]?.rows && (
                            <span style={{ marginLeft: '4px', fontSize: '11px', color: theme.textMuted }}>({childSheets[tab.key].rows.length})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Main sheet mapping (tab 0 or single-sheet) */}
                  {(!isMultiSheet || activeTab === 0) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {fields.map(f => (
                        <div key={f.field} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: '500',
                            color: f.required ? theme.text : theme.textSecondary
                          }}>
                            {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
                          </div>
                          <ArrowRight size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
                          <select
                            value={mapping[f.field] ?? ''}
                            onChange={e => updateMapping(f.field, e.target.value)}
                            style={{
                              flex: 1, padding: '8px 10px', borderRadius: '8px',
                              border: `1px solid ${mapping[f.field] !== undefined ? '#3b82f6' : theme.border}`,
                              backgroundColor: mapping[f.field] !== undefined ? 'rgba(59,130,246,0.04)' : theme.bgCard,
                              fontSize: '13px', color: theme.text
                            }}
                          >
                            <option value="">— skip —</option>
                            {headers.map((h, i) => (
                              <option key={i} value={i}>{h} {rows[0]?.[i] !== undefined ? `(e.g. "${String(rows[0][i]).substring(0, 30)}")` : ''}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Child sheet mapping (tabs 1+) */}
                  {isMultiSheet && activeTab > 0 && (() => {
                    const rt = relatedTables.filter(r => childSheets[r.tableName])[activeTab - 1]
                    if (!rt) return null
                    const cs = childSheets[rt.tableName]
                    if (!cs) return null
                    const allChildFields = [
                      { field: '_parentRef', label: rt.parentRefLabel || 'Parent Ref', type: 'text', required: true },
                      ...rt.fields
                    ]
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {allChildFields.map(f => (
                          <div key={f.field} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: '500',
                              color: f.required ? theme.text : theme.textSecondary
                            }}>
                              {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
                            </div>
                            <ArrowRight size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
                            <select
                              value={cs.mapping?.[f.field] ?? ''}
                              onChange={e => updateChildMapping(rt.tableName, f.field, e.target.value)}
                              style={{
                                flex: 1, padding: '8px 10px', borderRadius: '8px',
                                border: `1px solid ${cs.mapping?.[f.field] !== undefined ? '#3b82f6' : theme.border}`,
                                backgroundColor: cs.mapping?.[f.field] !== undefined ? 'rgba(59,130,246,0.04)' : theme.bgCard,
                                fontSize: '13px', color: theme.text
                              }}
                            >
                              <option value="">— skip —</option>
                              {cs.headers?.map((h, i) => (
                                <option key={i} value={i}>{h} {cs.rows?.[0]?.[i] !== undefined ? `(e.g. "${String(cs.rows[0][i]).substring(0, 30)}")` : ''}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Defaults section */}
                  {Object.keys(defaults).length > 0 && (!isMultiSheet || activeTab === 0) && (
                    <div style={{ marginTop: '16px', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px' }}>Default Values</div>
                      {Object.entries(defaults).map(([field, val]) => (
                        <div key={field} style={{ fontSize: '12px', color: theme.textSecondary }}>
                          {fields.find(f => f.field === field)?.label || field}: <strong>{String(val)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                    <button onClick={() => setStep('upload')} style={{
                      flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`, borderRadius: '8px',
                      backgroundColor: 'transparent', color: theme.textSecondary, fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}>
                      Back
                    </button>
                    <button
                      onClick={() => setStep('preview')}
                      disabled={!isMappingValid}
                      style={{
                        flex: 2, padding: '10px 16px', border: 'none', borderRadius: '8px',
                        backgroundColor: '#3b82f6', color: '#fff', fontSize: '14px', fontWeight: '500',
                        cursor: isMappingValid ? 'pointer' : 'not-allowed',
                        opacity: isMappingValid ? 1 : 0.5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                      }}
                    >
                      Preview Import
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 'preview' && (
            <div>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                Showing first {Math.min(10, rows.length)} of {rows.length} {entityName.toLowerCase()} to import
                {isMultiSheet && Object.keys(childSheets).length > 0 && (
                  <span> + {relatedTables.filter(rt => childSheets[rt.tableName]?.rows?.length > 0).map(rt =>
                    `${childSheets[rt.tableName].rows.length} ${rt.sheetName.toLowerCase()}`
                  ).join(', ')}</span>
                )}
              </div>
              <div style={{ overflow: 'auto', maxHeight: '400px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: theme.bg, position: 'sticky', top: 0 }}>
                      {(activeFields.length > 0 ? activeFields : fields).map(f => (
                        <th key={f.field} style={{
                          padding: '8px 10px', textAlign: 'left', fontWeight: '600',
                          color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`,
                          whiteSpace: 'nowrap'
                        }}>
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getPreviewRows().map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        {(activeFields.length > 0 ? activeFields : fields).map(f => (
                          <td key={f.field} style={{
                            padding: '6px 10px', color: theme.text,
                            maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {String(row[f.field] || '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                <button onClick={() => setStep('mapping')} style={{
                  flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`, borderRadius: '8px',
                  backgroundColor: 'transparent', color: theme.textSecondary, fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                  Back
                </button>
                <button onClick={executeImport} style={{
                  flex: 2, padding: '10px 16px', border: 'none', borderRadius: '8px',
                  backgroundColor: '#22c55e', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                  <CheckCircle size={16} />
                  Import {rows.length} {entityName}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: IMPORTING */}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Loader size={28} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
                Importing {entityName.toLowerCase()}...
              </div>
              <div style={{
                width: '100%', height: '8px', backgroundColor: theme.bg,
                borderRadius: '4px', overflow: 'hidden', marginBottom: '8px'
              }}>
                <div style={{
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                  height: '100%', backgroundColor: '#3b82f6', borderRadius: '4px', transition: 'width 0.3s'
                }} />
              </div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                {progress.done} of {progress.total} rows processed
              </div>
            </div>
          )}

          {/* STEP 5: DONE */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              {undone ? (
                <>
                  <Undo2 size={40} style={{ color: '#3b82f6', marginBottom: '12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '6px' }}>
                    Import Undone
                  </div>
                  <div style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '16px' }}>
                    {insertedIds.length} {entityName.toLowerCase()} have been removed
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle size={40} style={{ color: '#22c55e', marginBottom: '12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '6px' }}>
                    Import Complete
                  </div>
                  <div style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '16px' }}>
                    {insertedIds.length || (progress.total - progress.errors.length)} {entityName.toLowerCase()} imported successfully
                    {isMultiSheet && Object.keys(importSummary).length > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '13px' }}>
                        {relatedTables.filter(rt => importSummary[rt.tableName]).map(rt => (
                          <div key={rt.tableName}>{importSummary[rt.tableName].count} {rt.sheetName.toLowerCase()} linked</div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {progress.errors.length > 0 && !undone && (
                <div style={{
                  textAlign: 'left', padding: '10px 14px', backgroundColor: '#fef2f2',
                  borderRadius: '8px', marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#dc2626', marginBottom: '4px' }}>
                    {progress.errors.length} error{progress.errors.length > 1 ? 's' : ''}:
                  </div>
                  {progress.errors.slice(0, 10).map((err, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#991b1b' }}>{err}</div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                {insertedIds.length > 0 && !undone && (
                  <button
                    onClick={async () => {
                      const totalCount = insertedIds.length + Object.values(childInsertedIds).reduce((s, ids) => s + ids.length, 0)
                      if (!confirm(`Undo this import? This will delete all ${totalCount} imported records.`)) return
                      setUndoing(true)
                      const BATCH = 100
                      // Delete children first (FK constraints)
                      for (const rt of relatedTables) {
                        const ids = childInsertedIds[rt.tableName] || []
                        for (let i = 0; i < ids.length; i += BATCH) {
                          await supabase.from(rt.tableName).delete().in('id', ids.slice(i, i + BATCH))
                        }
                      }
                      // Then delete parents
                      for (let i = 0; i < insertedIds.length; i += BATCH) {
                        const batch = insertedIds.slice(i, i + BATCH)
                        await supabase.from(tableName).delete().in('id', batch)
                      }
                      setUndoing(false)
                      setUndone(true)
                      if (onImportComplete) onImportComplete()
                    }}
                    disabled={undoing}
                    style={{
                      flex: 1, padding: '10px 16px', borderRadius: '8px',
                      backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '14px', fontWeight: '500',
                      cursor: undoing ? 'not-allowed' : 'pointer', border: '1px solid rgba(220,38,38,0.2)',
                      opacity: undoing ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                  >
                    <Undo2 size={16} />
                    {undoing ? 'Undoing...' : 'Undo Import'}
                  </button>
                )}
                <button onClick={onClose} style={{
                  flex: 1, padding: '10px 16px', border: 'none', borderRadius: '8px',
                  backgroundColor: theme.accent, color: '#fff', fontSize: '14px', fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
