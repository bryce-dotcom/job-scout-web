import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import {
  DollarSign, Clock, Users, User, PieChart, Building, TrendingUp,
  Briefcase, Download, ChevronRight, Calendar, FileText,
} from 'lucide-react'
import {
  STANDARD_REPORTS, formatReportCell, downloadReportCsv,
} from '../lib/reports'

// Reusable Reports panel — same data wiring + UI used by Books → Reports
// and Frankie → Reports. Pure-function reports library does the actual
// math (src/lib/reports.js) so both surfaces show identical numbers.

const ICONS = { DollarSign, Clock, Users, User, PieChart, Building, TrendingUp, Briefcase }

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const ytdStart = () => `${new Date().getFullYear()}-01-01`

export default function ReportsPanel({ theme = defaultTheme, isMobile = false, introHidden = false }) {
  const companyId = useStore(s => s.companyId)
  const invoices = useStore(s => s.invoices) || []
  const payments = useStore(s => s.payments) || []
  const customers = useStore(s => s.customers) || []
  const jobs = useStore(s => s.jobs) || []
  const employees = useStore(s => s.employees) || []
  const expenses = useStore(s => s.expenses) || []
  const plaidTransactions = useStore(s => s.plaidTransactions) || []
  const fetchPlaidTransactions = useStore(s => s.fetchPlaidTransactions)

  const [from, setFrom] = useState(ytdStart())
  const [to, setTo] = useState(todayISO())
  const [activeId, setActiveId] = useState('pl')

  // Lazy-load the data job costing needs (job_lines + products_services
  // cost + material_or_labor classification + product_components for
  // bundle walking). These can be large so we only pull them on demand —
  // any other report never triggers this network round-trip.
  const [jobLines, setJobLines] = useState([])
  const [products, setProducts] = useState([])
  const [productComponents, setProductComponents] = useState([])
  const [jobCostingLoading, setJobCostingLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    // Most reports want plaid txns (for combined expenses). Pre-fetch.
    fetchPlaidTransactions?.()
  }, [companyId])

  useEffect(() => {
    if (activeId !== 'job-costing') return
    if (!companyId) return
    if (jobLines.length > 0 && products.length > 0 && productComponents.length >= 0) return
    let cancelled = false
    setJobCostingLoading(true)
    ;(async () => {
      const [{ data: lines }, { data: prods }, { data: comps }] = await Promise.all([
        supabase.from('job_lines').select('id, job_id, item_id, quantity, line_total, labor_cost').eq('company_id', companyId).limit(20000),
        // material_or_labor needed so classifyProduct credits each
        // component cost to the right column (parts vs labor).
        supabase.from('products_services').select('id, cost, material_or_labor').eq('company_id', companyId).limit(10000),
        supabase.from('product_components').select('parent_product_id, component_product_id, quantity').eq('company_id', companyId).limit(20000),
      ])
      if (cancelled) return
      setJobLines(lines || [])
      setProducts(prods || [])
      setProductComponents(comps || [])
      setJobCostingLoading(false)
    })()
    return () => { cancelled = true }
  }, [activeId, companyId])

  const activeReport = useMemo(() => {
    const def = STANDARD_REPORTS.find(r => r.id === activeId)
    if (!def) return null
    return def.run({
      invoices,
      payments,
      customers,
      jobs,
      employees,
      manualExpenses: expenses,
      plaidTransactions,
      jobLines,
      products,
      productComponents,
      from: new Date(from),
      to: new Date(to + 'T23:59:59'),
      now: new Date(),
    })
  }, [activeId, invoices, payments, customers, jobs, employees, expenses, plaidTransactions, jobLines, products, productComponents, from, to])

  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`,
    backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px',
  }

  const presets = [
    { label: 'YTD', fn: () => { setFrom(ytdStart()); setTo(todayISO()) } },
    {
      label: 'Last Q', fn: () => {
        const n = new Date()
        const qStartMonth = Math.floor((n.getMonth() - 3) / 3) * 3
        const y = n.getFullYear() - (qStartMonth < 0 ? 1 : 0)
        const ms = ((qStartMonth + 12) % 12)
        const me = ms + 2
        setFrom(new Date(y, ms, 1).toISOString().slice(0, 10))
        setTo(new Date(y, me + 1, 0).toISOString().slice(0, 10))
      }
    },
    {
      label: 'Last Yr', fn: () => {
        const y = new Date().getFullYear() - 1
        setFrom(`${y}-01-01`); setTo(`${y}-12-31`)
      }
    },
    {
      label: '30d', fn: () => {
        const t = new Date()
        const f = new Date(t.getTime() - 30 * 86400000)
        setFrom(f.toISOString().slice(0, 10)); setTo(todayISO())
      }
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {!introHidden && (
        <div style={{
          padding: '16px 20px',
          backgroundColor: 'rgba(90, 99, 73, 0.06)',
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <FileText size={18} style={{ color: theme.accent }} />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: theme.text }}>
              Standard reports — one click, real numbers
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>
            Pick a report, pick a date range, and you're done. Each one downloads as a CSV with a single click.
            Use the date presets (YTD / Last Q / Last Yr / 30d) for the most common windows, or pick custom dates.
          </p>
        </div>
      )}

      {/* Date range controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end' }}>
          {presets.map(p => (
            <button key={p.label} onClick={p.fn} style={{
              padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard, color: theme.textSecondary, fontSize: '12px', cursor: 'pointer',
            }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Layout: report picker + active report side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', gap: '16px' }}>
        {/* Report picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Reports
          </div>
          {STANDARD_REPORTS.map(r => {
            const Icon = ICONS[r.icon] || FileText
            const active = r.id === activeId
            return (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '8px',
                  border: `1px solid ${active ? theme.accent : theme.border}`,
                  backgroundColor: active ? theme.accentBg : theme.bgCard,
                  color: theme.text, fontSize: '13px', fontWeight: active ? 600 : 500,
                  textAlign: 'left', cursor: 'pointer',
                }}
                title={r.description}
              >
                <Icon size={15} style={{ color: theme.accent, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{r.name}</span>
                {active && <ChevronRight size={14} style={{ color: theme.accent }} />}
              </button>
            )
          })}
        </div>

        {/* Active report panel */}
        <div style={{
          backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px',
        }}>
          {activeId === 'job-costing' && jobCostingLoading ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', padding: '40px', textAlign: 'center' }}>
              Loading job lines + product costs…
            </p>
          ) : !activeReport ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', padding: '20px', textAlign: 'center' }}>
              Pick a report to get started.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 700, color: theme.text }}>
                    {activeReport.name}
                  </h3>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', color: theme.textMuted }}>
                    {activeReport.description}
                  </p>
                  <p style={{ margin: 0, fontSize: '11px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={11} />
                    {activeReport.period.from ? new Date(activeReport.period.from).toLocaleDateString() : '—'}
                    {' → '}
                    {activeReport.period.to ? new Date(activeReport.period.to).toLocaleDateString() : '—'}
                  </p>
                </div>
                <button
                  onClick={() => downloadReportCsv(activeReport)}
                  disabled={!activeReport.rows?.length}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '8px', border: 'none',
                    backgroundColor: theme.accent, color: '#fff', fontSize: '13px', fontWeight: 600,
                    cursor: activeReport.rows?.length ? 'pointer' : 'not-allowed',
                    opacity: activeReport.rows?.length ? 1 : 0.5,
                  }}
                  title="Download this report as a CSV file"
                >
                  <Download size={14} /> Download CSV
                </button>
              </div>

              {/* Headline summary numbers when present */}
              {activeReport.summary && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {Object.entries(activeReport.summary).map(([k, v]) => {
                    const isMoney = ['revenue', 'expenses', 'netIncome', 'total', 'Current', '1-30', '31-60', '61-90', '90+', 'avgMonthlyRevenue', 'avgMonthlyExpenses'].includes(k)
                    const label = k
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, c => c.toUpperCase())
                    return (
                      <div key={k} style={{
                        padding: '10px 14px', backgroundColor: theme.bg, borderRadius: '8px',
                        border: `1px solid ${theme.border}`, minWidth: '110px',
                      }}>
                        <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text, marginTop: '2px' }}>
                          {isMoney ? formatReportCell(v, 'currency') : formatReportCell(v, 'number')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Body table */}
              {activeReport.rows?.length === 0 ? (
                <p style={{ color: theme.textMuted, fontSize: '13px', padding: '24px', textAlign: 'center' }}>
                  No data for this report in the selected date range.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                        {activeReport.columns.map(c => (
                          <th key={c.key} style={{
                            padding: '8px 8px 8px 0', textAlign: c.align === 'right' ? 'right' : 'left',
                            fontSize: '11px', fontWeight: 600, color: theme.textMuted,
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                          }}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(activeReport.rows || []).map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          {activeReport.columns.map(c => (
                            <td key={c.key} style={{
                              padding: '8px 8px 8px 0',
                              textAlign: c.align === 'right' ? 'right' : 'left',
                              color: theme.text,
                              fontVariantNumeric: c.format === 'currency' || c.format === 'number' ? 'tabular-nums' : 'normal',
                            }}>
                              {formatReportCell(row[c.key], c.format)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {activeReport.totals && (
                        <tr style={{ borderTop: `2px solid ${theme.border}`, fontWeight: 700 }}>
                          {activeReport.columns.map(c => (
                            <td key={c.key} style={{
                              padding: '12px 8px 8px 0',
                              textAlign: c.align === 'right' ? 'right' : 'left',
                              color: theme.text,
                              fontVariantNumeric: c.format === 'currency' || c.format === 'number' ? 'tabular-nums' : 'normal',
                            }}>
                              {formatReportCell(activeReport.totals[c.key], c.format)}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
