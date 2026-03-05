import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from './Layout'
import { Upload, X, ArrowRight, CheckCircle, AlertCircle, Loader, FileSpreadsheet } from 'lucide-react'
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

  const reqField = requiredField || fields.find(f => f.required)?.field || fields[0]?.field

  // File handler — reads CSV/XLSX/XLS/TSV
  const handleFile = async (file) => {
    setImportFile(file)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      if (json.length < 2) {
        alert('File must have at least a header row and one data row')
        return
      }

      const fileHeaders = json[0].map(h => String(h).trim())
      const fileRows = json.slice(1).filter(row => row.some(cell => cell !== ''))

      setHeaders(fileHeaders)
      setRows(fileRows)
      setStep('mapping')
      setMappingLoading(true)

      // Build targetFields for the edge function
      const targetFields = fields.map(f => ({
        field: f.field,
        type: f.type,
        required: !!f.required,
        desc: f.desc || f.label,
      }))

      // Call AI to map columns
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

  const getMappedValue = (row, field) => {
    const idx = mapping[field]
    if (idx === undefined || idx === null) return defaults[field] ?? ''
    const raw = row[idx]
    if (raw === undefined || raw === null || raw === '') return defaults[field] ?? ''
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

  // Execute the import
  const executeImport = async () => {
    if (!isMappingValid) {
      alert(`${fields.find(f => f.field === reqField)?.label || reqField} mapping is required`)
      return
    }

    setStep('importing')
    const total = rows.length
    setProgress({ done: 0, total, errors: [] })
    const errors = []
    const BATCH_SIZE = 25

    for (let i = 0; i < total; i += BATCH_SIZE) {
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

      if (records.length > 0) {
        const { error } = await supabase.from(tableName).insert(records)
        if (error) {
          errors.push(`Rows ${i + 1}-${i + batch.length}: ${error.message}`)
        }
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, total), total, errors: [...errors] })
    }

    setStep('done')
    setProgress(prev => ({ ...prev, done: total, errors }))
    if (onImportComplete) onImportComplete()
  }

  const activeFields = fields.filter(f => mapping[f.field] !== undefined || defaults[f.field] !== undefined)

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
                  </div>
                  {notes && (
                    <div style={{
                      padding: '8px 12px', marginBottom: '16px', borderRadius: '8px',
                      backgroundColor: 'rgba(59,130,246,0.08)', fontSize: '12px', color: '#3b82f6'
                    }}>
                      {notes}
                    </div>
                  )}

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

                  {/* Defaults section */}
                  {Object.keys(defaults).length > 0 && (
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
              <CheckCircle size={40} style={{ color: '#22c55e', marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '6px' }}>
                Import Complete
              </div>
              <div style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '16px' }}>
                {progress.total - progress.errors.length} {entityName.toLowerCase()} imported successfully
              </div>
              {progress.errors.length > 0 && (
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
              <button onClick={onClose} style={{
                padding: '10px 16px', border: 'none', borderRadius: '8px',
                backgroundColor: theme.accent, color: '#fff', fontSize: '14px', fontWeight: '500',
                cursor: 'pointer', width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
