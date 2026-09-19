// Payroll as a cost, on the Money tab. Runs and paystubs already exist;
// Books just never read them. Shows what payroll cost this month (runs whose
// pay date has arrived), what is queued for a coming pay date, what is owed
// to the agencies, whether Money Out already carries it — and calls out two
// runs on the same period, which is nearly always a duplicate to void.
import { useState } from 'react'
import { Users, AlertCircle, AlertTriangle } from 'lucide-react'
import HelpBadge from '../../components/HelpBadge'
import { summarizePayroll, taxLiabilitySummary, duplicatePeriods } from '../../lib/payrollBooks'

const fmtDate = (d) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

export default function PayrollCard({ theme, statCardStyle, formatCurrency, payrollRuns = [], paystubs = [], taxLiabilities = [], isThisMonth, accountingBasis, feedHasPayroll, navigate, onVoidRun }) {
  const [voiding, setVoiding] = useState(null)
  const month = summarizePayroll({ payrollRuns, paystubs }, isThisMonth)
  const year = new Date().getFullYear()
  const ytd = summarizePayroll({ payrollRuns, paystubs }, (d) => String(d || '').startsWith(`${year}-`))
  const agency = taxLiabilitySummary(taxLiabilities)
  const dupes = duplicatePeriods(payrollRuns)
  if (month.runs === 0 && month.upcoming.runs === 0 && ytd.runs === 0 && agency.open === 0) return null

  const stat = (label, value, color) => (
    <div style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px', minWidth: 0 }}>
      <div style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: color || theme.text }}>{value}</div>
    </div>
  )
  const howCounted = accountingBasis === 'accrual'
    ? 'On accrual, Money Out counts payroll as gross wages plus employer taxes for the runs paid this month; bank rows for net pay and tax deposits are set aside so nothing counts twice.'
    : feedHasPayroll
      ? 'On cash basis, Money Out already carries payroll through your bank feed (net pay and tax deposits). These figures are the runs behind those bank rows — they are not added again.'
      : 'On cash basis, Money Out normally takes payroll from the bank feed. No payroll shows in the feed this month, so the runs stand in for it.'

  const voidRun = async (run) => {
    if (!onVoidRun) return
    if (!confirm(`Void payroll run #${run.id} (${run.period_start} – ${run.period_end}, ${formatCurrency(run.total_gross)} gross)? Books stops counting it. Paystubs and tax rows are kept; the Payroll page is unchanged.`)) return
    setVoiding(run.id)
    await onVoidRun(run)
    setVoiding(null)
  }

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={16} style={{ color: theme.accent }} /> Payroll
          <HelpBadge text={`Wages and employer taxes from the payroll runs whose pay date has arrived this month, what is queued for a coming pay date, and what is still owed to the IRS and state. ${howCounted}`} />
        </h3>
        <button onClick={() => navigate('/payroll')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>
          Open Payroll
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
        {stat(`Paid this month · ${month.runs} run${month.runs === 1 ? '' : 's'}`, formatCurrency(month.totalCost))}
        {stat('Net pay to employees', formatCurrency(month.netPay))}
        {stat('Employer taxes', formatCurrency(month.employerTaxes))}
        {stat(`Year to date · ${ytd.runs} run${ytd.runs === 1 ? '' : 's'} paid`, formatCurrency(ytd.totalCost))}
      </div>
      {month.upcoming.runs > 0 && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textSecondary }}>
          Queued: {formatCurrency(month.upcoming.totalCost)} across {month.upcoming.runs} run{month.upcoming.runs === 1 ? '' : 's'}, next pay date {fmtDate(month.upcoming.nextPayDate)} — not counted until it is paid.
        </div>
      )}
      {dupes.length > 0 && (
        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.35)', fontSize: '13px', color: theme.text }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '4px' }}>
            <AlertTriangle size={14} style={{ color: '#b45309' }} /> Two runs cover the same pay period
          </div>
          {dupes.map(d => (
            <div key={`${d.period_start}|${d.period_end}`} style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
              {d.period_start} – {d.period_end}: {d.runs.map(r => (
                <span key={r.id} style={{ marginRight: '10px', whiteSpace: 'nowrap' }}>
                  run #{r.id} · {formatCurrency(r.total_gross)} · {r.employee_count ?? '?'} people
                  {onVoidRun && (
                    <button onClick={() => voidRun(r)} disabled={voiding === r.id} style={{ marginLeft: '6px', padding: '2px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: '#b45309', fontSize: '11px', cursor: 'pointer' }}>
                      {voiding === r.id ? 'Voiding…' : 'Void'}
                    </button>
                  )}
                </span>
              ))}
              <span style={{ color: theme.textMuted }}>Both are counted until one is voided. The later one is usually the re-run.</span>
            </div>
          ))}
        </div>
      )}
      {agency.open > 0 && (
        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: agency.overdue > 0 ? 'rgba(239,68,68,0.08)' : theme.accentBg, border: `1px solid ${agency.overdue > 0 ? 'rgba(239,68,68,0.3)' : theme.border}`, fontSize: '13px', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <AlertCircle size={14} style={{ color: agency.overdue > 0 ? '#ef4444' : theme.accent, flexShrink: 0 }} />
          <span>
            <strong>{formatCurrency(agency.total)}</strong> owed to tax agencies across {agency.open} deposit{agency.open === 1 ? '' : 's'}
            {agency.nextDue ? `, next due ${new Date(agency.nextDue + 'T00:00:00').toLocaleDateString()}` : ''}
            {agency.overdue > 0 ? <span style={{ color: '#ef4444' }}> · {formatCurrency(agency.overdue)} overdue</span> : ''}
          </span>
        </div>
      )}
      <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>{howCounted}</div>
    </div>
  )
}
