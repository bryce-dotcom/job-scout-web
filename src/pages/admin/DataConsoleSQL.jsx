import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import { Play, Save, Clock, Trash2, Download, AlertCircle, CheckCircle } from 'lucide-react'

export default function DataConsoleSQL() {
  const [query, setQuery] = useState('SELECT * FROM companies LIMIT 10;')
  const [results, setResults] = useState(null)
  const [columns, setColumns] = useState([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [executionTime, setExecutionTime] = useState(null)

  // Saved queries
  const [savedQueries, setSavedQueries] = useState([])
  const [queryName, setQueryName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  useEffect(() => {
    fetchSavedQueries()
  }, [])

  const fetchSavedQueries = async () => {
    try {
      const { data } = await supabase
        .from('saved_queries')
        .select('*')
        .order('created_at', { ascending: false })
      setSavedQueries(data || [])
    } catch (err) {
      // Table might not exist yet
      console.log('Saved queries table not ready')
    }
  }

  const runQuery = async () => {
    if (!query.trim()) return

    setRunning(true)
    setError(null)
    setResults(null)
    const startTime = Date.now()

    try {
      // Use rpc to run raw SQL (requires a database function)
      // For now, we'll parse simple SELECT queries
      const trimmedQuery = query.trim().toLowerCase()

      if (!trimmedQuery.startsWith('select')) {
        throw new Error('Only SELECT queries are allowed in the Data Console')
      }

      // Parse table name from query
      const fromMatch = query.match(/from\s+(\w+)/i)
      if (!fromMatch) {
        throw new Error('Could not parse table name from query')
      }

      const tableName = fromMatch[1]

      // Parse limit
      const limitMatch = query.match(/limit\s+(\d+)/i)
      const limit = limitMatch ? parseInt(limitMatch[1]) : 100

      // Parse where clause (simple implementation)
      let supabaseQuery = supabase.from(tableName).select('*')

      const whereMatch = query.match(/where\s+(.+?)(?:\s+order|\s+limit|;|$)/i)
      if (whereMatch) {
        // Very simple where parsing - just for demo
        const whereClause = whereMatch[1].trim()
        const eqMatch = whereClause.match(/(\w+)\s*=\s*'?([^']+)'?/i)
        if (eqMatch) {
          supabaseQuery = supabaseQuery.eq(eqMatch[1], eqMatch[2])
        }
      }

      // Parse order by
      const orderMatch = query.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i)
      if (orderMatch) {
        supabaseQuery = supabaseQuery.order(orderMatch[1], { ascending: orderMatch[2]?.toLowerCase() !== 'desc' })
      }

      supabaseQuery = supabaseQuery.limit(limit)

      const { data, error: queryError } = await supabaseQuery

      if (queryError) throw queryError

      setResults(data || [])
      if (data && data.length > 0) {
        setColumns(Object.keys(data[0]))
      }
      setExecutionTime(Date.now() - startTime)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const saveQuery = async () => {
    if (!queryName.trim()) return

    try {
      await supabase.from('saved_queries').insert({
        name: queryName,
        query: query,
        created_by: (await supabase.auth.getUser()).data.user?.id
      })
      await fetchSavedQueries()
      setShowSaveDialog(false)
      setQueryName('')
    } catch (err) {
      alert('Error saving query: ' + err.message)
    }
  }

  const deleteQuery = async (id) => {
    if (!confirm('Delete this saved query?')) return

    try {
      await supabase.from('saved_queries').delete().eq('id', id)
      await fetchSavedQueries()
    } catch (err) {
      alert('Error deleting: ' + err.message)
    }
  }

  const exportResults = () => {
    if (!results || results.length === 0) return

    const headers = columns.join(',')
    const rows = results.map(row =>
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
    a.download = `query_results_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700' }}>
          SQL Runner
        </h1>
        <div style={{ color: adminTheme.warning, fontSize: '12px', backgroundColor: 'rgba(234, 179, 8, 0.1)', padding: '6px 12px', borderRadius: '6px' }}>
          Read-only mode - SELECT queries only
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Query Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Query Input */}
          <div style={{
            backgroundColor: adminTheme.bgCard,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your SQL query..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '8px',
                color: adminTheme.text,
                fontSize: '14px',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  runQuery()
                }
              }}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button
                onClick={runQuery}
                disabled={running}
                style={{
                  padding: '10px 20px',
                  backgroundColor: adminTheme.accent,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: running ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Play size={16} /> {running ? 'Running...' : 'Run Query'}
              </button>

              <button
                onClick={() => setShowSaveDialog(true)}
                style={{
                  padding: '10px 16px',
                  backgroundColor: adminTheme.bgHover,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '8px',
                  color: adminTheme.text,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Save size={16} /> Save
              </button>

              {results && results.length > 0 && (
                <button
                  onClick={exportResults}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: adminTheme.bgHover,
                    border: `1px solid ${adminTheme.border}`,
                    borderRadius: '8px',
                    color: adminTheme.text,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Download size={16} /> Export
                </button>
              )}

              {executionTime && (
                <div style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: adminTheme.textMuted,
                  fontSize: '13px'
                }}>
                  <Clock size={14} /> {executionTime}ms
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div style={{
            flex: 1,
            backgroundColor: adminTheme.bgCard,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {error ? (
              <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AlertCircle size={20} style={{ color: adminTheme.error }} />
                <span style={{ color: adminTheme.error }}>{error}</span>
              </div>
            ) : results === null ? (
              <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>
                Run a query to see results
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle size={20} style={{ color: adminTheme.success }} />
                <span style={{ color: adminTheme.text }}>Query executed successfully. No rows returned.</span>
              </div>
            ) : (
              <>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${adminTheme.border}`,
                  color: adminTheme.textMuted,
                  fontSize: '13px'
                }}>
                  {results.length} rows returned
                </div>
                <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                        {columns.map(col => (
                          <th
                            key={col}
                            style={{
                              padding: '10px 16px',
                              textAlign: 'left',
                              color: adminTheme.textMuted,
                              fontSize: '11px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                              position: 'sticky',
                              top: 0,
                              backgroundColor: adminTheme.bgCard
                            }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                          {columns.map(col => (
                            <td
                              key={col}
                              style={{
                                padding: '10px 16px',
                                color: adminTheme.text,
                                fontSize: '13px',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                            >
                              {row[col] === null ? (
                                <span style={{ color: adminTheme.textMuted }}>null</span>
                              ) : typeof row[col] === 'object' ? (
                                JSON.stringify(row[col]).substring(0, 50) + '...'
                              ) : typeof row[col] === 'boolean' ? (
                                row[col] ? 'true' : 'false'
                              ) : (
                                String(row[col]).substring(0, 50)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Saved Queries Sidebar */}
        <div style={{
          width: '280px',
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ color: adminTheme.text, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
            Saved Queries
          </div>

          {savedQueries.length === 0 ? (
            <div style={{ color: adminTheme.textMuted, fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
              No saved queries yet
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {savedQueries.map(sq => (
                <div
                  key={sq.id}
                  style={{
                    padding: '12px',
                    backgroundColor: adminTheme.bgHover,
                    borderRadius: '8px',
                    marginBottom: '8px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setQuery(sq.query)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>{sq.name}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteQuery(sq.id); }}
                      style={{ background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer', padding: '2px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{
                    color: adminTheme.textMuted,
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {sq.query}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: adminTheme.bgCard,
            borderRadius: '12px',
            padding: '24px',
            width: '400px'
          }}>
            <div style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              Save Query
            </div>
            <input
              type="text"
              placeholder="Query name..."
              value={queryName}
              onChange={(e) => setQueryName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '8px',
                color: adminTheme.text,
                fontSize: '14px',
                marginBottom: '16px'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowSaveDialog(false); setQueryName(''); }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: adminTheme.bgHover,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '8px',
                  color: adminTheme.text,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveQuery}
                disabled={!queryName.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: adminTheme.accent,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: queryName.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
