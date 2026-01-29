import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import { Badge } from './components/AdminStats'
import AdminModal from './components/AdminModal'
import { ScrollText, Search, RefreshCw, ChevronLeft, ChevronRight, Eye, Plus, Edit2, Trash2, Key } from 'lucide-react'

const ACTION_CONFIG = {
  INSERT: { label: 'Create', icon: Plus, color: 'success' },
  UPDATE: { label: 'Update', icon: Edit2, color: 'warning' },
  DELETE: { label: 'Delete', icon: Trash2, color: 'error' },
  LOGIN: { label: 'Login', icon: Key, color: 'accent' }
}

export default function DataConsoleAuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)

  // Filters
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [searchUser, setSearchUser] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail view
  const [selected, setSelected] = useState(null)

  // Available tables
  const [tables, setTables] = useState([])

  useEffect(() => {
    fetchLogs()
    fetchTables()
  }, [page, tableFilter, actionFilter, dateFrom, dateTo])

  const fetchTables = async () => {
    try {
      const { data } = await supabase
        .from('audit_log')
        .select('table_name')

      if (data) {
        const uniqueTables = [...new Set(data.map(d => d.table_name))].filter(Boolean).sort()
        setTables(uniqueTables)
      }
    } catch (err) {
      console.log('Error fetching tables:', err)
    }
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (tableFilter) {
        query = query.eq('table_name', tableFilter)
      }
      if (actionFilter) {
        query = query.eq('action', actionFilter)
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom)
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59')
      }

      query = query.range(page * pageSize, (page + 1) * pageSize - 1)

      const { data, count, error } = await query

      if (error) throw error

      setLogs(data || [])
      setTotal(count || 0)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getActionBadge = (action) => {
    const config = ACTION_CONFIG[action] || { label: action, color: 'default' }
    return <Badge color={config.color}>{config.label}</Badge>
  }

  const getActionIcon = (action) => {
    const config = ACTION_CONFIG[action]
    if (!config) return null
    const Icon = config.icon
    return <Icon size={14} />
  }

  const formatChanges = (changes) => {
    if (!changes) return null
    try {
      const parsed = typeof changes === 'string' ? JSON.parse(changes) : changes
      return JSON.stringify(parsed, null, 2)
    } catch {
      return String(changes)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700' }}>
          Audit Log
        </h1>
        <button
          onClick={fetchLogs}
          style={{
            padding: '8px 16px',
            backgroundColor: adminTheme.bgHover,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '8px',
            color: adminTheme.text,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
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
          {/* Table Filter */}
          <select
            value={tableFilter}
            onChange={(e) => { setTableFilter(e.target.value); setPage(0); }}
            style={{
              padding: '8px 12px',
              backgroundColor: adminTheme.bgInput,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '8px',
              color: adminTheme.text,
              fontSize: '13px',
              minWidth: '150px'
            }}
          >
            <option value="">All Tables</option>
            {tables.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            style={{
              padding: '8px 12px',
              backgroundColor: adminTheme.bgInput,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '8px',
              color: adminTheme.text,
              fontSize: '13px'
            }}
          >
            <option value="">All Actions</option>
            <option value="INSERT">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="LOGIN">Login</option>
          </select>

          {/* Date From */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: adminTheme.textMuted, fontSize: '12px' }}>From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              style={{
                padding: '8px 12px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '8px',
                color: adminTheme.text,
                fontSize: '13px'
              }}
            />
          </div>

          {/* Date To */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: adminTheme.textMuted, fontSize: '12px' }}>To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              style={{
                padding: '8px 12px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '8px',
                color: adminTheme.text,
                fontSize: '13px'
              }}
            />
          </div>

          {/* Clear Filters */}
          {(tableFilter || actionFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setTableFilter(''); setActionFilter(''); setDateFrom(''); setDateTo(''); setPage(0); }}
              style={{
                padding: '8px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                color: adminTheme.accent,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          )}

          <div style={{ marginLeft: 'auto', color: adminTheme.textMuted, fontSize: '13px' }}>
            {total} events
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '10px',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>No audit logs found</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Action</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Table</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Record ID</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>User</th>
                  <th style={{ padding: '12px 16px', width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr
                    key={log.id}
                    style={{ borderBottom: `1px solid ${adminTheme.border}` }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = adminTheme.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {getActionBadge(log.action)}
                    </td>
                    <td style={{ padding: '12px 16px', color: adminTheme.text, fontSize: '13px', fontFamily: 'monospace' }}>
                      {log.table_name}
                    </td>
                    <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px', fontFamily: 'monospace' }}>
                      {log.record_id || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                      {log.user_id ? log.user_id.substring(0, 8) + '...' : 'System'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => setSelected(log)}
                        style={{
                          padding: '6px',
                          background: 'none',
                          border: 'none',
                          color: adminTheme.accent,
                          cursor: 'pointer'
                        }}
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{
              padding: '12px 16px',
              borderTop: `1px solid ${adminTheme.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '12px'
            }}>
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
          </>
        )}
      </div>

      {/* Detail Modal */}
      <AdminModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Audit Log Detail"
        width="700px"
      >
        {selected && (
          <div>
            {/* Header Info */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: adminTheme.bgHover,
              borderRadius: '8px'
            }}>
              <div>
                <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginBottom: '4px' }}>ACTION</div>
                {getActionBadge(selected.action)}
              </div>
              <div>
                <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginBottom: '4px' }}>TABLE</div>
                <div style={{ color: adminTheme.text, fontSize: '14px', fontFamily: 'monospace' }}>{selected.table_name}</div>
              </div>
              <div>
                <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginBottom: '4px' }}>TIMESTAMP</div>
                <div style={{ color: adminTheme.text, fontSize: '14px' }}>{new Date(selected.created_at).toLocaleString()}</div>
              </div>
            </div>

            {/* Record ID */}
            {selected.record_id && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px' }}>Record ID</div>
                <div style={{ color: adminTheme.text, fontSize: '14px', fontFamily: 'monospace' }}>{selected.record_id}</div>
              </div>
            )}

            {/* User ID */}
            {selected.user_id && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px' }}>User ID</div>
                <div style={{ color: adminTheme.text, fontSize: '14px', fontFamily: 'monospace' }}>{selected.user_id}</div>
              </div>
            )}

            {/* Old Data */}
            {selected.old_data && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px' }}>Old Data</div>
                <pre style={{
                  padding: '12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  color: adminTheme.error,
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '200px',
                  margin: 0
                }}>
                  {formatChanges(selected.old_data)}
                </pre>
              </div>
            )}

            {/* New Data */}
            {selected.new_data && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px' }}>New Data</div>
                <pre style={{
                  padding: '12px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '8px',
                  color: adminTheme.success,
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '200px',
                  margin: 0
                }}>
                  {formatChanges(selected.new_data)}
                </pre>
              </div>
            )}

            {/* Metadata */}
            {selected.metadata && (
              <div>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px' }}>Metadata</div>
                <pre style={{
                  padding: '12px',
                  backgroundColor: adminTheme.bgHover,
                  borderRadius: '8px',
                  color: adminTheme.text,
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '150px',
                  margin: 0
                }}>
                  {formatChanges(selected.metadata)}
                </pre>
              </div>
            )}
          </div>
        )}
      </AdminModal>
    </div>
  )
}
