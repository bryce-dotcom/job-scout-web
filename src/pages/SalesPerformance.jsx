import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { TrendingUp, Users, FileText, CheckCircle2, DollarSign } from 'lucide-react'
import { computeSalesFunnel, funnelTotals, funnelWindow, salesWonBridge } from '../lib/salesFunnel'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8', text: '#2c3530',
  textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const RANGES = [
  { id: 'mtd', label: 'This month' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
]

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')

export default function SalesPerformance() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const companyId = useStore((s) => s.companyId)
  const quotes = useStore((s) => s.quotes)
  const leads = useStore((s) => s.leads)
  const appointments = useStore((s) => s.appointments)
  const storeJobs = useStore((s) => s.jobs)
  const storeEmployees = useStore((s) => s.employees)
  // The jobs behind the estimates — where closed value and a last-resort rep
  // come from. The store keeps only the newest 1,000 jobs, so an estimate that
  // became a job last year (or at a busier company) would find no job in it.
  // Fetch exactly the ones the estimates point at; a few hundred rows.
  const [quoteJobs, setQuoteJobs] = useState([])
  useEffect(() => {
    if (!companyId) return
    let alive = true
    const ids = [...new Set((quotes || []).map((q) => q?.job_id).filter((v) => v != null))]
    const cols = 'id, quote_id, lead_id, salesperson_id, job_total'
    const chunks = []
    for (let i = 0; i < ids.length; i += 300) chunks.push(ids.slice(i, i + 300))
    Promise.all([
      supabase.from('jobs').select(cols).eq('company_id', companyId).not('quote_id', 'is', null).limit(1000),
      ...chunks.map((c) => supabase.from('jobs').select(cols).eq('company_id', companyId).in('id', c)),
    ]).then((results) => {
      if (!alive) return
      const seen = new Map()
      for (const r of results) for (const j of r?.data || []) seen.set(j.id, j)
      setQuoteJobs([...seen.values()])
    })
    return () => { alive = false }
  }, [companyId, quotes])
  const jobs = useMemo(() => {
    const byId = new Map((storeJobs || []).filter(Boolean).map((j) => [j.id, j]))
    for (const j of quoteJobs) byId.set(j.id, j)
    return [...byId.values()]
  }, [storeJobs, quoteJobs])
  // The store holds active employees only; a rep who has since left still
  // sold this year's work and should be named, not shown as "#118".
  const [allEmployees, setAllEmployees] = useState(null)
  useEffect(() => {
    if (!companyId) return
    let alive = true
    supabase.from('employees').select('id, name').eq('company_id', companyId)
      .then(({ data }) => { if (alive && data?.length) setAllEmployees(data) })
    return () => { alive = false }
  }, [companyId])
  const employees = allEmployees || storeEmployees

  const [range, setRange] = useState('ytd')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  // Every job created in the window — the dashboard's "Sales Won" set,
  // estimate or not — so the two pages can be read against each other. The
  // store's newest 1,000 is not the whole year at a busy company; fetch by
  // created_at, a page at a time.
  const [windowJobs, setWindowJobs] = useState([])
  useEffect(() => {
    if (!companyId) return
    let alive = true
    const { sinceIso } = funnelWindow(range)
    const cols = 'id, quote_id, job_total, created_at'
    ;(async () => {
      const all = []
      for (let from = 0; from < 20000; from += 1000) {
        let q = supabase.from('jobs').select(cols).eq('company_id', companyId).order('created_at', { ascending: false }).range(from, from + 999)
        if (sinceIso) q = q.gte('created_at', sinceIso)
        const { data } = await q
        all.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      if (alive) setWindowJobs(all)
    })()
    return () => { alive = false }
  }, [companyId, range])

  const rows = useMemo(
    () => computeSalesFunnel({ appointments, quotes, leads, employees, jobs }, funnelWindow(range))
      .filter((r) => r.meetings || r.takeoffs),
    [appointments, quotes, leads, employees, jobs, range],
  )
  const totals = useMemo(() => funnelTotals(rows), [rows])
  const bridge = useMemo(() => salesWonBridge({ jobs: windowJobs, quotes }, funnelWindow(range)), [windowJobs, quotes, range])
  const maxClosedValue = Math.max(1, ...rows.map((r) => r.closedValue))

  const stat = (icon, label, value, color) => (
    <div style={{ flex: 1, minWidth: 150, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.textMuted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || theme.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )

  const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `2px solid ${theme.border}`, whiteSpace: 'nowrap' }
  const td = { padding: '12px', fontSize: 14, color: theme.text, borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendingUp size={22} color={theme.accent} />
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: theme.text }}>Sales Performance</h1>
      </div>
      <p style={{ margin: '0 0 18px', color: theme.textMuted, fontSize: 14 }}>
        The funnel by rep — meetings set → estimates written → deals closed.
      </p>

      {/* Range filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setRange(r.id)}
            style={{ padding: '8px 14px', minHeight: 40, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${range === r.id ? theme.accent : theme.border}`,
              backgroundColor: range === r.id ? theme.accent : 'transparent',
              color: range === r.id ? '#fff' : theme.textSecondary }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Company totals */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        {stat(<Users size={13} />, 'Meetings set', totals.meetings)}
        {stat(<FileText size={13} />, 'Estimates sent', totals.takeoffs)}
        {stat(<CheckCircle2 size={13} />, 'Closed', totals.closed, '#16a34a')}
        {stat(<DollarSign size={13} />, 'Closed value', money(totals.closedValue), theme.accent)}
        {stat(<TrendingUp size={13} />, 'Close rate', `${totals.closeRate}%`)}
      </div>

      {/* Against the dashboard. The dashboard counts every job created in the
          window as a sale, estimate or not; this page can only see the ones
          that came through an estimate. Show its number and name the gap. */}
      {bridge.wonCount > 0 && (
        <div style={{ marginBottom: 22, padding: '12px 16px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: theme.text }}>Against the dashboard:</span>{' '}
          sales won in this window <b style={{ color: theme.text }}>{money(bridge.wonTotal)}</b> across {bridge.wonCount} job{bridge.wonCount === 1 ? '' : 's'} —{' '}
          <b style={{ color: theme.accent }}>{money(bridge.viaEstimateTotal)}</b> ({bridge.viaEstimateCount}) through estimates on this page
          {bridge.directCount > 0 && (
            <>, <b style={{ color: theme.text }}>{money(bridge.directTotal)}</b> ({bridge.directCount}) from jobs created without an estimate — service calls, recurring visits and work booked straight in, which no rep's funnel can show</>
          )}.
          {totals.closedValue !== bridge.viaEstimateTotal && (
            <span style={{ color: theme.textMuted }}> Closed value above can differ from the through-estimates figure by an estimate approved but not yet a job, or a job whose estimate was approved in another window.</span>
          )}
        </div>
      )}

      {/* Per-rep table */}
      {rows.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: theme.textMuted, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
          No sales activity in this window yet. Try a wider range.
        </div>
      ) : (
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={th}>Rep</th>
                  <th style={{ ...th, textAlign: 'right' }}>Meetings</th>
                  <th style={{ ...th, textAlign: 'right' }}>Estimates&nbsp;sent</th>
                  <th style={{ ...th, textAlign: 'right' }}>Closed</th>
                  <th style={{ ...th, textAlign: 'right' }}>Close&nbsp;%</th>
                  <th style={{ ...th, textAlign: 'right' }}>Closed&nbsp;value</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice().sort((a, b) => (a.repId == null) - (b.repId == null) || b.closedValue - a.closedValue || b.closed - a.closed).map((r) => (
                  <tr key={r.repId ?? 'unattributed'} style={r.repId == null ? { backgroundColor: theme.accentBg } : undefined}>
                    <td style={{ ...td, fontWeight: 600, color: r.repId == null ? theme.textMuted : theme.text }}>
                      {r.repName}
                      {r.repId == null && <div style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted }}>estimates with no rep on the estimate, its lead, or its job</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{r.meetings || '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{r.takeoffs || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{r.closed || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: theme.textMuted }}>{r.takeoffs ? `${r.closeRate}%` : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ flex: 1, maxWidth: 90, height: 6, borderRadius: 3, backgroundColor: theme.accentBg, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.round((r.closedValue / maxClosedValue) * 100)}%`, backgroundColor: theme.accent }} />
                        </div>
                        <span style={{ fontWeight: 700, minWidth: 64, textAlign: 'right' }}>{money(r.closedValue)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 12, color: theme.textMuted }}>
        Meetings = sales appointments in the window (blocked time and job visits excluded). Estimates sent = every estimate except drafts, by the date it was written. Closed = approved, or turned into a job, counted in the window it closed (the job's creation, or the approval) — an estimate sent last month that closed this month closes this month, so close rate can top 100% in a strong month. Closed value is the job's total once there is one. Credit follows the estimate's rep, then its lead's rep, then the rep on the job it became — the same rule as the pipeline and commissions.
      </p>
    </div>
  )
}
