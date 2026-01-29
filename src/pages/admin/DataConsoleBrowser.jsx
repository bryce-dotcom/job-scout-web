import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminModal, { FormField, FormInput, FormTextarea, ModalFooter } from './components/AdminModal'
import { RefreshCw, Download, X, ChevronLeft, ChevronRight, Edit2, Trash2 } from 'lucide-react'

const TABLES = [
  'companies', 'employees', 'customers', 'leads', 'jobs', 'quotes', 'invoices',
  'lighting_audits', 'audit_areas', 'utility_providers', 'utility_programs', 'rebate_rates',
  'agents', 'company_agents', 'products_services', 'feedback', 'audit_log', 'system_settings'
]

const OPERATORS = [
  { value: 'eq', label: '=' },
  { value: 'ilike', label: 'contains' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' }
]

export default function DataConsoleBrowser() {
  const [table, setTable] = useState('companies')
  const [data, setData] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Pagination
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  // Filters
  const [filters, setFilters] = useState([])
  const [filterColumn, setFilterColumn] = useState('')
  const [filterOperator, setFilterOperator] = useState('eq')
  const [filterValue, setFilterValue] = useState('')

  // Sorting
  const [sortColumn, setSortColumn] = useState('id')
  const [sortAsc, setSortAsc] = useState(false)

  // Editing
  const [editingRow, setEditingRow] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [table, page, pageSize, filters, sortColumn, sortAsc])

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      let query = supabase.from(table).select('*', { count: 'exact' })

      // Apply filters
      filters.forEach(f => {
        if (f.operator === 'ilike') {
          query = query.ilike(f.column, `%${f.value}%`)
        } else if (f.operator === 'eq') {
          query = query.eq(f.column, f.value)
        } else if (f.operator === 'gt') {
          query = query.gt(f.column, f.value)
        } else if (f.operator === 'lt') {
          query = query.lt(f.column, f.value)
        }
      })

      // Apply sorting
      query = query.order(sortColumn, { ascending: sortAsc })

      // Apply pagination
      query = query.range(page * pageSize, (page + 1) * pageSize - 1)

      const { data: result, count, error: queryError } = await query

      if (queryError) throw queryError

      setData(result || [])
      setTotal(count || 0)

      // Get columns from first row or empty
      if (result && result.length > 0) {
        setColumns(Object.keys(result[0]))
      } else {
        // Try to get column info from a single row query
        const { data: singleRow } = await supabase.from(table).select('*').limit(1)
        if (singleRow && singleRow.length > 0) {
          setColumns(Object.keys(singleRow[0]))
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addFilter = () => {
    if (!filterColumn || !filterValue) return
    setFilters([...filters, { column: filterColumn, operator: filterOperator, value: filterValue }])
    setFilterColumn('')
    setFilterValue('')
    setPage(0)
  }

  const removeFilter = (index) => {
    setFilters(filters.filter((_, i) => i !== index))
    setPage(0)
  }

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortAsc(!sortAsc)
    } else {
      setSortColumn(column)
      setSortAsc(true)
    }
  }

  const handleSave = async () => {
    if (!editingRow) return
    setSaving(true)

    try {
      const { error } = await supabase
        .from(table)
        .update(editingRow)
        .eq('id', editingRow.id)

      if (error) throw error

      await fetchData()
      setEditingRow(null)
    } catch (err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row) => {
    if (!confirm('Delete this row? This cannot be undone.')) return

    try {
      const { error } = await supabase.from(table).delete().eq('id', row.id)
      if (error) throw error
      await fetchData()
    } catch (err) {
      alert('Error deleting: ' + err.message)
    }
  }

  const exportCSV = () => {
    if (data.length === 0) return

    const headers = columns.join(',')
    const rows = data.map(row =>
      columns.map(col => {
        const val = row[col]
        if (val === null) return ''
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(',')
    )

    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${table}_export.csv`
    a.click()
  }

  const formatValue = (val) => {
    if (val === null) return <span style={{ color: adminTheme.textMuted }}>null</span>
    if (typeof val === 'boolean') return val ? 'true' : 'false'
    if (typeof val === 'object') return JSON.stringify(val).substring(0, 50) + '...'
    const str = String(val)
    return str.length > 40 ? str.substring(0, 40) + '...' : str
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>
        Data Browser
      </h1>

      {/* Top Bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <select
          value={table}
          onChange={(e) => { setTable(e.target.value); setPage(0); setFilters([]); }}
          style={{
            padding: '10px 12px',
            backgroundColor: adminTheme.bgInput,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '8px',
            color: adminTheme.text,
            fontSize: '14px',
            minWidth: '180px'
          }}
        >
          {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <button
          onClick={fetchData}
          style={{
            padding: '10px 16px',
            backgroundColor: adminTheme.bgHover,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '8px',
            color: adminTheme.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <RefreshCw size={16} /> Refresh
        </button>

        <button
          onClick={exportCSV}
          disabled={data.length === 0}
          style={{
            padding: '10px 16px',
            backgroundColor: adminTheme.accentBg,
            border: 'none',
            borderRadius: '8px',
            color: adminTheme.accent,
            cursor: data.length ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Download size={16} /> Export CSV
        </button>

        <div style={{ marginLeft: 'auto', color: adminTheme.textMuted, fontSize: '13px' }}>
          {total} rows
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={filterColumn}
            onChange={(e) => setFilterColumn(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: adminTheme.bgInput,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '6px',
              color: adminTheme.text,
              fontSize: '13px'
            }}
          >
            <option value="">Column...</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filterOperator}
            onChange={(e) => setFilterOperator(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: adminTheme.bgInput,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '6px',
              color: adminTheme.text,
              fontSize: '13px'
            }}
          >
            {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <input
            type="text"
            placeholder="Value..."
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: adminTheme.bgInput,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '6px',
              color: adminTheme.text,
              fontSize: '13px',
              width: '150px'
            }}
          />

          <button
            onClick={addFilter}
            disabled={!filterColumn || !filterValue}
            style={{
              padding: '8px 16px',
              backgroundColor: adminTheme.accent,
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              cursor: filterColumn && filterValue ? 'pointer' : 'not-allowed'
            }}
          >
            Add Filter
          </button>
        </div>

        {filters.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {filters.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px 4px 12px',
                  backgroundColor: adminTheme.accentBg,
                  borderRadius: '16px',
                  fontSize: '12px',
                  color: adminTheme.accent
                }}
              >
                {f.column} {OPERATORS.find(o => o.value === f.operator)?.label} "{f.value}"
                <button
                  onClick={() => removeFilter(i)}
                  style={{ background: 'none', border: 'none', color: adminTheme.accent, cursor: 'pointer', padding: '2px' }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Table */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '10px',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.error }}>{error}</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>No data found</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                  {columns.map(col => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        color: adminTheme.textMuted,
                        fontSize: '11px',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {col} {sortColumn === col && (sortAsc ? '↑' : '↓')}
                    </th>
                  ))}
                  <th style={{ padding: '12px 16px', width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr
                    key={row.id || i}
                    style={{ borderBottom: `1px solid ${adminTheme.border}` }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = adminTheme.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {columns.map(col => (
                      <td
                        key={col}
                        style={{
                          padding: '12px 16px',
                          color: adminTheme.text,
                          fontSize: '13px',
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                      >
                        {formatValue(row[col])}
                      </td>
                    ))}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => setEditingRow({ ...row })}
                          style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${adminTheme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: adminTheme.textMuted, fontSize: '13px' }}>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              style={{
                padding: '4px 8px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '4px',
                color: adminTheme.text,
                fontSize: '13px'
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: adminTheme.textMuted, fontSize: '13px' }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '6px',
                backgroundColor: adminTheme.bgHover,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '4px',
                color: page === 0 ? adminTheme.textMuted : adminTheme.text,
                cursor: page === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              style={{
                padding: '6px',
                backgroundColor: adminTheme.bgHover,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '4px',
                color: page >= totalPages - 1 ? adminTheme.textMuted : adminTheme.text,
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <AdminModal isOpen={!!editingRow} onClose={() => setEditingRow(null)} title="Edit Row" width="600px">
        {editingRow && (
          <>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {columns.filter(c => c !== 'id').map(col => (
                <FormField key={col} label={col}>
                  {typeof editingRow[col] === 'object' ? (
                    <FormTextarea
                      value={JSON.stringify(editingRow[col], null, 2)}
                      onChange={(v) => {
                        try {
                          setEditingRow({ ...editingRow, [col]: JSON.parse(v) })
                        } catch { }
                      }}
                      rows={4}
                    />
                  ) : typeof editingRow[col] === 'boolean' ? (
                    <select
                      value={editingRow[col] ? 'true' : 'false'}
                      onChange={(e) => setEditingRow({ ...editingRow, [col]: e.target.value === 'true' })}
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
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <FormInput
                      value={editingRow[col]}
                      onChange={(v) => setEditingRow({ ...editingRow, [col]: v })}
                    />
                  )}
                </FormField>
              ))}
            </div>
            <ModalFooter onCancel={() => setEditingRow(null)} onSave={handleSave} saving={saving} />
          </>
        )}
      </AdminModal>
    </div>
  )
}
