// Year-end: who needs a 1099-NEC and for how much. Contractors (employees
// classed 1099) and vendors flagged 1099, across payroll, bills and manual
// expenses. Generation of the PDFs already lives in Payroll → Inbox.
import { useState, useEffect } from 'react'
import { FileText, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { contractorTotals, NEC_THRESHOLD } from '../../lib/contractor1099'

export default function Contractor1099Card({ companyId, theme, statCardStyle, formatCurrency, year, employees = [], manualExpenses = [], bills = [], billPayments = [], navigate }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!companyId || !year) return
    let alive = true
    const t = setTimeout(async () => {
      const [stubs, vendors] = await Promise.all([
        supabase.from('paystubs').select('employee_id, pay_date, gross_pay').eq('company_id', companyId).gte('pay_date', `${year}-01-01`).lte('pay_date', `${year}-12-31`),
        supabase.from('vendors').select('id, name, business_name, is_1099, tin_last4, w9_signed_at').eq('company_id', companyId).eq('is_1099', true),
      ])
      if (alive) setData({ paystubs: stubs.data || [], vendors: vendors.data || [] })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId, year])

  if (!data) return null
  const r = contractorTotals({ employees, paystubs: data.paystubs, manualExpenses, vendors: data.vendors, bills, billPayments }, year)
  if (r.rows.length === 0) return null

  return (
    <div style={{ ...statCardStyle, marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} style={{ color: theme.accent }} /> 1099-NEC — {year}
          <HelpBadge text={`Everyone paid as a contractor this year: employees classed 1099 (payroll runs plus manual expenses paid to them) and vendors marked 1099 (bill payments plus manual expenses paid to them). At or above $${NEC_THRESHOLD} a 1099-NEC is due by January 31. Mark a vendor as 1099 on the Vendors page; generate the forms from Payroll → Inbox.`} />
        </h3>
        <button onClick={() => navigate('/payroll/inbox')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>Generate forms</button>
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: theme.textSecondary, marginBottom: '8px' }}>
        <span><strong style={{ color: theme.text }}>{r.needing.length}</strong> need a 1099</span>
        <span>{formatCurrency(r.total)} paid to contractors</span>
        {r.missingW9.length > 0 && <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={13} /> {r.missingW9.length} missing a W-9</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {r.rows.map(row => (
          <div key={`${row.kind}-${row.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) auto auto', gap: '10px', fontSize: '12px', color: theme.textSecondary, opacity: row.needs1099 ? 1 : 0.7 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name} <span style={{ color: theme.textMuted }}>· {row.kind}{row.tin_last4 ? ` · TIN ····${row.tin_last4}` : ''}{!row.w9 ? ' · no W-9' : ''}</span>
            </span>
            <span style={{ fontWeight: 600, color: theme.text }}>{formatCurrency(row.total)}</span>
            <span style={{ minWidth: '70px', textAlign: 'right', color: row.needs1099 ? '#22c55e' : theme.textMuted }}>{row.needs1099 ? '1099 due' : 'under $600'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
