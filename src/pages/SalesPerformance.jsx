import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Users, FileText, DollarSign, ChevronRight, ChevronDown, AlertTriangle, Briefcase } from 'lucide-react'
import { computeSalesFunnel, funnelWindow } from '../lib/salesFunnel'
import { soldByRep, periodBounds } from '../lib/soldTotals'
import { isFieldTech } from '../lib/accessControl'

// Why this page was rewritten (Cole, 2026-09-28: "he wants to know where his
// guys are at for the month and it doesnt even show the dollar ammount... it
// also seems way off from the dashboard number"):
//
// It was built entirely out of the ESTIMATE funnel — rows came from quotes and
// appointments, and anyone with neither in the window was filtered out. But
// only 86 of HHH's 7,143 jobs have ever had an estimate. For September that
// meant the page reported $174,267 of a real $327,551: Doug Webb showed
// $80,162 against the $211,376 he had sold, Christopher Lyman's 23 jobs showed
// as $0, and across the year London Miller ($87,223), Cameron McDonough
// ($12,569) and Bryce Westcott ($19,688) did not appear at all.
//
// So the headline is now SOLD — every job, estimate or not, through
// lib/soldTotals, which is the same rule the dashboard and the pipeline now
// use. The funnel is still here, beside it, as the coaching detail it always
// was: meetings, estimates out, close rate. And every rep row opens to the
// deals behind it, because a number a manager cannot take apart is a number
// they end up rebuilding in a spreadsheet.

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8', text: '#2c3530',
  textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const RANGES = [
  { id: 'mtd', label: 'This month' },
  { id: 'lastmonth', label: 'Last month' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
]

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')

export default function SalesPerformance() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const user = useStore((s) => s.user)
  const quotes = useStore((s) => s.quotes)
  const appointments = useStore((s) => s.appointments)
  const storeEmployees = useStore((s) => s.employees)

  const [range, setRange] = useState('mtd')   // a manager asks about THIS month
  const [openRep, setOpenRep] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [jobs, setJobs] = useState([])
  const [leads, setLeads] = useState([])
  const [allEmployees, setAllEmployees] = useState(null)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  // Field techs see their own work only — everyone else (sales, managers,
  // admins, owners) sees the whole team, same rule as the pipeline.
  const canViewAll = !isFieldTech(user)

  // The store keeps only the newest jobs and PostgREST caps a response at 1000
  // rows whatever .limit() says, so both are paginated here. Reading the board's
  // card set instead is what produced numbers nobody could reconcile.
  useEffect(() => {
    if (!companyId) return
    let alive = true
    setLoading(true)
    setLoadError(null)
    const { start, end } = periodBounds(range)
    const page = async (table, select, tweak = (q) => q) => {
      const out = []
      for (let from = 0; ; from += 1000) {
        let q = supabase.from(table).select(select).eq('company_id', companyId)
          .order('id', { ascending: true }).range(from, from + 999)
        q = tweak(q)
        const { data, error } = await q
        if (error) throw error
        out.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      return out
    }
    ;(async () => {
      try {
        const [jobRows, leadRows] = await Promise.all([
          page('jobs', 'id, job_id, job_title, job_total, status, created_at, salesperson_id, lead_id, quote_id, customer_id, customers(name)',
            (q) => {
              let x = start ? q.gte('created_at', start) : q
              return end ? x.lt('created_at', end) : x
            }),
          page('leads', 'id, salesperson_id, lead_owner_id, salesperson_ids'),
        ])
        if (!alive) return
        setJobs(jobRows)
        setLeads(leadRows)
      } catch (e) {
        // Say so rather than rendering a confident wrong total.
        if (alive) setLoadError(e?.message || 'Could not load sales')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [companyId, range])

  // A rep who has left still sold this year's work and should be named.
  useEffect(() => {
    if (!companyId) return
    let alive = true
    supabase.from('employees').select('id, name').eq('company_id', companyId)
      .then(({ data }) => { if (alive && data?.length) setAllEmployees(data) })
    return () => { alive = false }
  }, [companyId])
  const employees = allEmployees || storeEmployees

  const sold = useMemo(() => {
    const { start, end } = periodBounds(range)
    return soldByRep(jobs, leads, { start, end, employees })
  }, [jobs, leads, employees, range])

  // The funnel, keyed by rep, to hang beside the money.
  const funnelByRep = useMemo(() => {
    const rows = computeSalesFunnel({ appointments, quotes, leads, employees, jobs }, funnelWindow(range))
    return new Map(rows.map((r) => [r.repId == null ? 'unattributed' : String(r.repId), r]))
  }, [appointments, quotes, leads, employees, jobs, range])

  const rows = useMemo(() => {
    const mine = String(user?.id ?? '')
    return sold.rows
      .filter((r) => canViewAll || String(r.ownerId ?? '') === mine)
      .map((r) => {
        const f = funnelByRep.get(r.ownerId == null ? 'unattributed' : String(r.ownerId))
        return { ...r, meetings: f?.meetings || 0, takeoffs: f?.takeoffs || 0, closeRate: f?.closeRate || 0 }
      })
  }, [sold, funnelByRep, canViewAll, user?.id])

  const visibleTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows])
  const visibleCount = useMemo(() => rows.reduce((s, r) => s + r.count, 0), [rows])
  const maxTotal = Math.max(1, ...rows.map((r) => r.total))
  const meetings = rows.reduce((s, r) => s + r.meetings, 0)
  const takeoffs = rows.reduce((s, r) => s + r.takeoffs, 0)

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12 }
  const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `2px solid ${theme.border}`, whiteSpace: 'nowrap' }
  const td = { padding: '12px', fontSize: 14, color: theme.text, borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: 'tabular-nums' }

  const stat = (icon, label, value, color, sub) => (
    <div style={{ ...card, flex: '1 1 150px', minWidth: 0, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.textMuted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || theme.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendingUp size={22} color={theme.accent} />
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: theme.text }}>Sales Performance</h1>
      </div>
      <p style={{ margin: '0 0 18px', color: theme.textMuted, fontSize: 14 }}>
        What each rep has sold, and the funnel behind it. Tap a rep to see the deals.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => { setRange(r.id); setOpenRep(null) }}
            style={{ padding: '8px 14px', minHeight: 44, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${range === r.id ? theme.accent : theme.border}`,
              backgroundColor: range === r.id ? theme.accent : 'transparent',
              color: range === r.id ? '#fff' : theme.textSecondary }}>
            {r.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: 18, borderColor: '#ef4444', color: '#ef4444', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={16} /> Could not load sales: {loadError}. Nothing below is complete — reload before relying on it.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        {stat(<DollarSign size={13} />, 'Sold', money(visibleTotal), theme.accent, `${visibleCount} job${visibleCount === 1 ? '' : 's'}`)}
        {stat(<Briefcase size={13} />, 'Average deal', money(visibleCount ? visibleTotal / visibleCount : 0))}
        {stat(<Users size={13} />, 'Meetings', meetings)}
        {stat(<FileText size={13} />, 'Estimates sent', takeoffs)}
      </div>

      {/* Sold is every job. The funnel columns can only describe the ones that
          came through an estimate, and saying so here is cheaper than having a
          manager discover it by arithmetic. */}
      {!loading && sold.count > 0 && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: theme.textSecondary, lineHeight: 1.6 }}>
          <b style={{ color: theme.text }}>{money(sold.total)}</b> sold across {sold.count} job{sold.count === 1 ? '' : 's'} — the same figure as the dashboard for this window.{' '}
          {(() => {
            const viaEstimate = sold.rows.reduce((s, r) => s + r.viaEstimate, 0)
            const direct = sold.count - viaEstimate
            return direct > 0
              ? <>{direct} of them came in without an estimate — service calls, recurring visits and work booked straight in — so they count in Sold but cannot show in Meetings, Estimates or Close&nbsp;%.</>
              : <>Every one came through an estimate.</>
          })()}
          {sold.unpriced > 0 && (
            <>{' '}<b style={{ color: '#eab308' }}>{sold.unpriced} job{sold.unpriced === 1 ? ' has' : 's have'} no price on {sold.unpriced === 1 ? 'it' : 'them'} yet</b> and count as $0 here rather than being valued from an old estimate.</>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: theme.textMuted }}>Loading sales…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: theme.textMuted }}>
          No sales in this window yet. Try a wider range.
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
              <thead>
                <tr>
                  <th style={th}>Rep</th>
                  <th style={{ ...th, textAlign: 'right' }}>Jobs</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sold</th>
                  <th style={{ ...th, textAlign: 'right' }}>Avg&nbsp;deal</th>
                  <th style={{ ...th, textAlign: 'right' }}>Meetings</th>
                  <th style={{ ...th, textAlign: 'right' }}>Estimates</th>
                  <th style={{ ...th, textAlign: 'right' }}>Close&nbsp;%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = r.ownerId == null ? 'unattributed' : String(r.ownerId)
                  const open = openRep === key
                  return [
                    <tr key={key} onClick={() => setOpenRep(open ? null : key)}
                      style={{ cursor: 'pointer', backgroundColor: open ? theme.accentBg : r.ownerId == null ? 'rgba(234,179,8,0.07)' : undefined }}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          {open ? <ChevronDown size={15} color={theme.textMuted} /> : <ChevronRight size={15} color={theme.textMuted} />}
                          <span style={{ color: r.ownerId == null ? theme.textMuted : theme.text }}>{r.name}</span>
                        </div>
                        {r.ownerId == null && (
                          <div style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted, marginLeft: 21 }}>
                            no rep on the job or its lead — assign these and they move to a rep
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.count}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ flex: 1, maxWidth: 80, height: 6, borderRadius: 3, backgroundColor: theme.accentBg, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((r.total / maxTotal) * 100)}%`, backgroundColor: theme.accent }} />
                          </div>
                          <span style={{ fontWeight: 800, minWidth: 74, textAlign: 'right' }}>{money(r.total)}</span>
                        </div>
                        {r.unpriced > 0 && <div style={{ fontSize: 11, color: '#eab308' }}>{r.unpriced} unpriced</div>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: theme.textSecondary }}>{money(r.avg)}</td>
                      <td style={{ ...td, textAlign: 'right', color: theme.textMuted }}>{r.meetings || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: theme.textMuted }}>{r.takeoffs || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: theme.textMuted }}>{r.takeoffs ? `${r.closeRate}%` : '—'}</td>
                    </tr>,
                    open && (
                      <tr key={key + '-detail'}>
                        <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.bg }}>
                          <RepDetail rows={r.jobs} theme={theme} navigate={navigate} isMobile={isMobile} />
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 12, color: theme.textMuted, lineHeight: 1.6 }}>
        Sold counts every job created in the window at its own job total, cancelled and archived work excluded — the one rule
        in lib/soldTotals that the dashboard and the sales pipeline also use, so these three pages give the same answer.
        A job with no price on it counts as $0 and is flagged, never valued from its estimate. Credit goes to the rep on the
        job, else the rep on its lead, one rep per deal, so the rows add up to the company total. Meetings, Estimates and
        Close&nbsp;% describe only the deals that went through an estimate.
      </p>
    </div>
  )
}

/** The deals behind a rep's number. Same rows the total was built from — not a
 *  second query that could scope differently and disagree with the line above. */
function RepDetail({ rows, theme, navigate, isMobile }) {
  const money2 = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dth = { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
  const dtd = { padding: '9px 12px', fontSize: 13, color: theme.textSecondary, borderTop: `1px solid ${theme.border}`, fontVariantNumeric: 'tabular-nums' }
  if (!rows?.length) return <div style={{ padding: 16, color: theme.textMuted, fontSize: 13 }}>No deals.</div>
  return (
    <div style={{ padding: isMobile ? '4px 0 10px' : '6px 0 12px' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={dth}>Sold</th>
              <th style={dth}>Job</th>
              <th style={dth}>Customer</th>
              <th style={dth}>Status</th>
              <th style={{ ...dth, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} onClick={() => navigate(`/jobs/${j.id}`)} style={{ cursor: 'pointer' }}>
                <td style={{ ...dtd, whiteSpace: 'nowrap' }}>{shortDate(j.created_at)}</td>
                <td style={{ ...dtd, color: theme.text }}>
                  <div style={{ fontWeight: 600 }}>{j.job_title || j.job_id || `#${j.id}`}</div>
                  {j.job_title && j.job_id && <div style={{ fontSize: 11, color: theme.textMuted }}>{j.job_id}</div>}
                </td>
                <td style={dtd}>{j.customers?.name || '—'}</td>
                <td style={{ ...dtd, whiteSpace: 'nowrap' }}>
                  {j.status || '—'}
                  {j.quote_id == null && <span style={{ marginLeft: 6, fontSize: 10, color: theme.textMuted }}>no estimate</span>}
                </td>
                <td style={{ ...dtd, textAlign: 'right', fontWeight: 700, color: Number(j.job_total) > 0 ? theme.text : '#eab308' }}>
                  {Number(j.job_total) > 0 ? money2(j.job_total) : 'unpriced'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
