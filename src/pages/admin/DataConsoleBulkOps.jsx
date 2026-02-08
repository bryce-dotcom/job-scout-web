import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import { Upload, Download, FileText, CheckCircle, AlertCircle, X } from 'lucide-react'

const TABLES = [
  'companies', 'employees', 'customers', 'leads', 'jobs', 'quotes', 'invoices',
  'lighting_audits', 'audit_areas', 'utility_providers', 'utility_programs', 'incentive_measures',
  'agents', 'company_agents', 'products_services'
]

export default function DataConsoleBulkOps() {
  // Import state
  const [importTable, setImportTable] = useState('leads')
  const [csvFile, setCsvFile] = useState(null)
  const [csvData, setCsvData] = useState([])
  const [csvHeaders, setCsvHeaders] = useState([])
  const [columnMapping, setColumnMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  // Export state
  const [exportTable, setExportTable] = useState('leads')
  const [exporting, setExporting] = useState(false)

  // Available columns for target table
  const [tableColumns, setTableColumns] = useState([])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setCsvFile(file)
    setImportResult(null)

    // Parse CSV
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
      const values = []
      let current = ''
      let inQuotes = false

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())
      return values
    })

    setCsvHeaders(headers)
    setCsvData(rows)

    // Initialize mapping
    const initialMapping = {}
    headers.forEach(h => {
      initialMapping[h] = h.toLowerCase().replace(/\s+/g, '_')
    })
    setColumnMapping(initialMapping)

    // Fetch target table columns
    await fetchTableColumns(importTable)
  }

  const fetchTableColumns = async (table) => {
    try {
      const { data } = await supabase.from(table).select('*').limit(1)
      if (data && data.length > 0) {
        setTableColumns(Object.keys(data[0]))
      }
    } catch (err) {
      console.error('Error fetching columns:', err)
    }
  }

  const handleTableChange = async (table) => {
    setImportTable(table)
    await fetchTableColumns(table)
  }

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)

    try {
      let successCount = 0
      let errorCount = 0
      const errors = []

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i]
        const record = {}

        csvHeaders.forEach((header, index) => {
          const targetCol = columnMapping[header]
          if (targetCol && targetCol !== 'skip' && row[index]) {
            let value = row[index]
            // Try to parse numbers and booleans
            if (value === 'true') value = true
            else if (value === 'false') value = false
            else if (!isNaN(value) && value !== '') value = Number(value)

            record[targetCol] = value
          }
        })

        if (Object.keys(record).length > 0) {
          const { error } = await supabase.from(importTable).insert(record)
          if (error) {
            errorCount++
            if (errors.length < 5) {
              errors.push(`Row ${i + 1}: ${error.message}`)
            }
          } else {
            successCount++
          }
        }
      }

      setImportResult({
        success: successCount,
        errors: errorCount,
        errorMessages: errors
      })
    } catch (err) {
      setImportResult({
        success: 0,
        errors: csvData.length,
        errorMessages: [err.message]
      })
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)

    try {
      const { data, error } = await supabase.from(exportTable).select('*')
      if (error) throw error

      if (!data || data.length === 0) {
        alert('No data to export')
        return
      }

      const headers = Object.keys(data[0])
      const rows = data.map(row =>
        headers.map(h => {
          const val = row[h]
          if (val === null) return ''
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`
          }
          return val
        }).join(',')
      )

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportTable}_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
    } catch (err) {
      alert('Export error: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const clearImport = () => {
    setCsvFile(null)
    setCsvData([])
    setCsvHeaders([])
    setColumnMapping({})
    setImportResult(null)
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>
        Bulk Operations
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Import Section */}
        <div style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '12px',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              backgroundColor: adminTheme.accentBg,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Upload size={20} style={{ color: adminTheme.accent }} />
            </div>
            <div>
              <div style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>Import Data</div>
              <div style={{ color: adminTheme.textMuted, fontSize: '13px' }}>Upload CSV to import records</div>
            </div>
          </div>

          {/* Target Table */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px', display: 'block' }}>
              Target Table
            </label>
            <select
              value={importTable}
              onChange={(e) => handleTableChange(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '8px',
                color: adminTheme.text,
                fontSize: '14px'
              }}
            >
              {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* File Upload */}
          {!csvFile ? (
            <label style={{
              display: 'block',
              padding: '40px',
              border: `2px dashed ${adminTheme.border}`,
              borderRadius: '10px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = adminTheme.accent}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = adminTheme.border}
            >
              <FileText size={32} style={{ color: adminTheme.textMuted, marginBottom: '12px' }} />
              <div style={{ color: adminTheme.text, marginBottom: '4px' }}>Click to upload CSV</div>
              <div style={{ color: adminTheme.textMuted, fontSize: '12px' }}>or drag and drop</div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          ) : (
            <>
              {/* File Info */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                backgroundColor: adminTheme.bgHover,
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={18} style={{ color: adminTheme.accent }} />
                  <div>
                    <div style={{ color: adminTheme.text, fontSize: '14px' }}>{csvFile.name}</div>
                    <div style={{ color: adminTheme.textMuted, fontSize: '12px' }}>{csvData.length} rows</div>
                  </div>
                </div>
                <button
                  onClick={clearImport}
                  style={{ background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Column Mapping */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '8px' }}>Column Mapping</div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {csvHeaders.map(header => (
                    <div key={header} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ color: adminTheme.text, fontSize: '13px', width: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {header}
                      </div>
                      <span style={{ color: adminTheme.textMuted }}>→</span>
                      <select
                        value={columnMapping[header] || 'skip'}
                        onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          backgroundColor: adminTheme.bgInput,
                          border: `1px solid ${adminTheme.border}`,
                          borderRadius: '6px',
                          color: adminTheme.text,
                          fontSize: '13px'
                        }}
                      >
                        <option value="skip">Skip</option>
                        {tableColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Import Result */}
              {importResult && (
                <div style={{
                  padding: '12px',
                  backgroundColor: importResult.errors > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '8px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    {importResult.errors > 0 ? (
                      <AlertCircle size={16} style={{ color: adminTheme.error }} />
                    ) : (
                      <CheckCircle size={16} style={{ color: adminTheme.success }} />
                    )}
                    <span style={{ color: adminTheme.text, fontSize: '14px' }}>
                      {importResult.success} imported, {importResult.errors} failed
                    </span>
                  </div>
                  {importResult.errorMessages.length > 0 && (
                    <div style={{ color: adminTheme.error, fontSize: '12px', marginTop: '8px' }}>
                      {importResult.errorMessages.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </div>
              )}

              {/* Import Button */}
              <button
                onClick={handleImport}
                disabled={importing || csvData.length === 0}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: adminTheme.accent,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: importing ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {importing ? 'Importing...' : <>
                  <Upload size={16} /> Import {csvData.length} Records
                </>}
              </button>
            </>
          )}
        </div>

        {/* Export Section */}
        <div style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '12px',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Download size={20} style={{ color: adminTheme.success }} />
            </div>
            <div>
              <div style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>Export Data</div>
              <div style={{ color: adminTheme.textMuted, fontSize: '13px' }}>Download table as CSV</div>
            </div>
          </div>

          {/* Table Selection */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px', display: 'block' }}>
              Select Table
            </label>
            <select
              value={exportTable}
              onChange={(e) => setExportTable(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '8px',
                color: adminTheme.text,
                fontSize: '14px'
              }}
            >
              {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: adminTheme.success,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: exporting ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {exporting ? 'Exporting...' : <>
              <Download size={16} /> Export All Records
            </>}
          </button>

          {/* Info */}
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: adminTheme.bgHover, borderRadius: '8px' }}>
            <div style={{ color: adminTheme.textMuted, fontSize: '13px', lineHeight: '1.5' }}>
              <strong style={{ color: adminTheme.text }}>Export Notes:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                <li>Exports all records from selected table</li>
                <li>JSON columns are stringified</li>
                <li>Dates are in ISO format</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
