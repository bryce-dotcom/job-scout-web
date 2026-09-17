// Job margins this month, on the Money tab. Reuses the job-costing report
// (lib/reports.js jobCosting) so this card and Reports → Job Costing can
// never disagree; the heavy tables load once, lazily.
import { useState, useEffect, useMemo } from 'react'
import { Briefcase } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { jobCosting } from '../../lib/reports'

export default function JobMarginsCard({ companyId, theme, statCardStyle, formatCurrency, jobs = [], payments = [], invoices = [], manualExpenses = [], plaidTransactions = [], employees = [], onOpenReports }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    const t = setTimeout(async () => {
      const [lines, prods, comps, punches, bonuses] = await Promise.all([
        supabase.from('job_lines').select('id, job_id, item_id, quantity, labor_cost').eq('company_id', companyId).limit(20000),
        supabase.from('products_services').select('id, cost, material_or_labor').eq('company_id', companyId).limit(10000),
        supabase.from('product_components').select('parent_product_id, component_product_id, quantity').eq('company_id', companyId).limit(20000),
        supabase.from('time_clock').select('employee_id, job_id, clock_in, clock_out, lunch_start, lunch_end, total_hours').eq('company_id', companyId).not('job_id', 'is', null).not('clock_out', 'is', null).limit(50000),
        supabase.from('job_bonuses').select('job_id, amount, status').eq('company_id', companyId).in('status', ['accrued', 'paid']).limit(20000),
      ])
      if (!alive) return
      setData({ jobLines: lines.data || [], products: prods.data || [], productComponents: comps.data || [], timeClock: punches.data || [], jobBonuses: bonuses.data || [] })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId])

  const report = useMemo(() => {
    if (!data) return null
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return jobCosting({ jobs, payments, invoices, manualExpenses, plaidTransactions, employees, ...data, from, to })
  }, [data, jobs, payments, invoices, manualExpenses, plaidTransactions, employees])

  if (!report || report.rows.length === 0) return null
  const costed = report.rows.filter(r => r.total_cost != null && r.revenue > 0)
  const best = [...costed].sort((a, b) => (b.margin ?? -1) - (a.margin ?? -1)).slice(0, 4)
  const worst = [...costed].filter(r => (r.margin ?? 0) < 0.2).sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0)).slice(0, 3)
  const pct = (m) => m == null ? '—' : `${Math.round(m * 100)}%`
  const color = (m) => m == null ? theme.textMuted : m >= 0.2 ? '#22c55e' : m >= 0.1 ? '#eab308' : '#ef4444'
  const t = report.totals
  const row = (r) => (
    <div key={r.job} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) auto auto', gap: '10px', fontSize: '12px', color: theme.textSecondary, padding: '3px 0' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.job.trim()}{r.title ? ` — ${r.title}` : ''}{r.labor_source === 'estimate' ? ' · labor est.' : ''}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{formatCurrency(r.profit)}</span>
      <span style={{ fontWeight: 700, color: color(r.margin), minWidth: '38px', textAlign: 'right' }}>{pct(r.margin)}</span>
    </div>
  )

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Briefcase size={16} style={{ color: theme.accent }} /> Job margins this month
          <HelpBadge text="Per job: money collected this month minus material (from job lines), labor (punched hours × hourly rate; the line estimate when nobody clocked in), crew bonuses, and bank spend tagged to the job. Same math as Reports → Job Costing." />
        </h3>
        <button onClick={onOpenReports} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>
          Full report
        </button>
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: theme.textSecondary, marginBottom: '10px' }}>
        <span>{report.summary.jobs} jobs · {formatCurrency(t.revenue)} in</span>
        <span>{formatCurrency(t.total_cost)} cost</span>
        <span style={{ fontWeight: 700, color: color(t.margin) }}>{pct(t.margin)} margin</span>
        {report.summary.jobsWithCostData < report.summary.jobs && <span style={{ color: theme.textMuted }}>{report.summary.jobs - report.summary.jobsWithCostData} without cost data</span>}
      </div>
      {best.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Best</div>
          {best.map(row)}
        </>
      )}
      {worst.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '8px' }}>Watch</div>
          {worst.map(row)}
        </>
      )}
    </div>
  )
}
