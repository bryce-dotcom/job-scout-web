// Payroll as a cost, on the Money tab. Runs and paystubs already exist;
// Books just never read them. Shows what payroll cost this month, what is
// owed to the agencies, and whether Money Out already carries it.
import { Users, AlertCircle } from 'lucide-react'
import HelpBadge from '../../components/HelpBadge'
import { summarizePayroll, taxLiabilitySummary } from '../../lib/payrollBooks'

export default function PayrollCard({ theme, statCardStyle, formatCurrency, payrollRuns = [], paystubs = [], taxLiabilities = [], isThisMonth, accountingBasis, feedHasPayroll, navigate }) {
  const month = summarizePayroll({ payrollRuns, paystubs }, isThisMonth)
  const year = new Date().getFullYear()
  const ytd = summarizePayroll({ payrollRuns, paystubs }, (d) => String(d || '').startsWith(`${year}-`))
  const agency = taxLiabilitySummary(taxLiabilities)
  if (month.runs === 0 && ytd.runs === 0 && agency.open === 0) return null

  const stat = (label, value, color) => (
    <div style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px', minWidth: 0 }}>
      <div style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: color || theme.text }}>{value}</div>
    </div>
  )
  const howCounted = accountingBasis === 'accrual'
    ? 'On accrual, Money Out counts payroll as gross wages plus employer taxes for the runs paid this month; bank rows for net pay and tax deposits are set aside so nothing counts twice.'
    : feedHasPayroll
      ? 'On cash basis, Money Out already carries payroll through your bank feed (net pay and tax deposits). These figures are the runs behind those bank rows.'
      : 'On cash basis, Money Out normally takes payroll from the bank feed. No payroll shows in the feed this month, so the runs stand in for it.'

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={16} style={{ color: theme.accent }} /> Payroll
          <HelpBadge text={`Wages and employer taxes from the payroll runs paid this month, and what is still owed to the IRS and state. ${howCounted}`} />
        </h3>
        <button onClick={() => navigate('/payroll')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>
          Open Payroll
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
        {stat(`This month · ${month.runs} run${month.runs === 1 ? '' : 's'}`, formatCurrency(month.totalCost))}
        {stat('Net pay to employees', formatCurrency(month.netPay))}
        {stat('Employer taxes', formatCurrency(month.employerTaxes))}
        {stat(`Year to date · ${ytd.runs} run${ytd.runs === 1 ? '' : 's'}`, formatCurrency(ytd.totalCost))}
      </div>
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
