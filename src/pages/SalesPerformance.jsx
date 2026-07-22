import { useState, useMemo } from 'react'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { TrendingUp, Users, FileText, CheckCircle2, DollarSign } from 'lucide-react'
import { computeSalesFunnel, funnelTotals, funnelSince } from '../lib/salesFunnel'

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
  const quotes = useStore((s) => s.quotes)
  const leads = useStore((s) => s.leads)
  const appointments = useStore((s) => s.appointments)
  const employees = useStore((s) => s.employees)

  const [range, setRange] = useState('ytd')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const rows = useMemo(
    () => computeSalesFunnel({ appointments, quotes, leads, employees }, { sinceIso: funnelSince(range) })
      .filter((r) => r.meetings || r.takeoffs),
    [appointments, quotes, leads, employees, range],
  )
  const totals = useMemo(() => funnelTotals(rows), [rows])
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
        {stat(<FileText size={13} />, 'Estimates', totals.takeoffs)}
        {stat(<CheckCircle2 size={13} />, 'Closed', totals.closed, '#16a34a')}
        {stat(<DollarSign size={13} />, 'Closed value', money(rows.reduce((s, r) => s + r.closedValue, 0)), theme.accent)}
        {stat(<TrendingUp size={13} />, 'Close rate', `${totals.closeRate}%`)}
      </div>

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
                  <th style={{ ...th, textAlign: 'right' }}>Estimates</th>
                  <th style={{ ...th, textAlign: 'right' }}>Closed</th>
                  <th style={{ ...th, textAlign: 'right' }}>Close&nbsp;%</th>
                  <th style={{ ...th, textAlign: 'right' }}>Closed&nbsp;value</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice().sort((a, b) => b.closedValue - a.closedValue || b.closed - a.closed).map((r) => (
                  <tr key={r.repId}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.repName}</td>
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
        Meetings = appointments booked for the rep. Estimates &amp; closed are attributed through the lead owner when the quote itself has no rep. Closed = approved estimates.
      </p>
    </div>
  )
}
