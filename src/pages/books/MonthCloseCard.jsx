// Close the month — the CPA's checklist, computed from the ledger
// (lib/monthClose), with the blockers up top and one button that sends
// Frankie after them. "Mark closed" stamps settings.books_closed_through so
// Books, Frankie and the CPA package all know which months are done.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { ClipboardCheck, Check, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { monthClose, lastMonthKey, monthRange } from '../../lib/monthClose'

const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }
const ACTION_TAB = { verdicts: 'overview', transactions: 'transactions', payroll: '/payroll', loans: 'accounts', invoices: '/invoices' }

export default function MonthCloseCard({ companyId, theme, statCardStyle, formatCurrency, navigate, setActiveTab, userEmail = null }) {
  const [month, setMonth] = useState(lastMonthKey())
  const [data, setData] = useState(null)
  const [open, setOpen] = useState({})
  const [working, setWorking] = useState(false)
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    const { from, to } = monthRange(month)
    const [rows, inv, pays, runs, loans, lp, claims, closed] = await Promise.all([
      supabase.from('plaid_transactions').select('id, date, amount, name, merchant_name, confirmed, pending, is_transfer, user_category, matched_payment_id, matched_invoice_id, matched_utility_invoice_id, stripe_payout_id').eq('company_id', companyId).gte('date', from).lte('date', to).limit(5000),
      supabase.from('invoices').select('id, invoice_id, payment_status, invoice_date, created_at, due_date, amount, discount_applied, tax_amount, customer:customers(name)').eq('company_id', companyId).gte('created_at', `${parseInt(month.slice(0, 4), 10) - 1}-01-01`).limit(5000),
      supabase.from('payments').select('invoice_id, amount, date, status').eq('company_id', companyId).gte('date', `${parseInt(month.slice(0, 4), 10) - 1}-01-01`).limit(20000),
      supabase.from('payroll_runs').select('id, pay_date, total_gross, status').eq('company_id', companyId).gte('pay_date', from).lte('pay_date', to),
      supabase.from('liabilities').select('id, name, monthly_payment, next_payment_amount, status').eq('company_id', companyId),
      supabase.from('loan_payments').select('liability_id, date, amount').eq('company_id', companyId).gte('date', from).lte('date', to),
      supabase.from('utility_invoices').select('id, utility_name, amount, incentive_amount, payment_status, paid_at, source_transaction_id').eq('company_id', companyId).gte('paid_at', from + 'T00:00:00').lte('paid_at', to + 'T23:59:59'),
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'books_closed_through').limit(1),
    ])
    const ids = (rows.data || []).map(r => r.id)
    const { data: verdicts } = ids.length ? await supabase.from('books_verdicts').select('plaid_transaction_id, confidence, status').eq('company_id', companyId).in('plaid_transaction_id', ids.slice(0, 2000)) : { data: [] }
    let closedThrough = null
    try { const v = closed.data?.[0]?.value; closedThrough = v ? JSON.parse(v) : null } catch { closedThrough = closed.data?.[0]?.value || null }
    setData({
      bankRows: rows.data || [], verdicts: verdicts || [],
      invoices: (inv.data || []).map(i => ({ ...i, customer_name: i.customer?.name || null })),
      payments: pays.data || [], payrollRuns: runs.data || [], loans: loans.data || [], loanPayments: lp.data || [], claims: claims.data || [], closedThrough,
    })
  }, [companyId, month])
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const result = useMemo(() => data ? monthClose(month, data) : null, [data, month])

  const letFrankie = async () => {
    setWorking(true)
    const { from } = monthRange(month)
    const r = await supabase.functions.invoke('books-deduce', { body: { action: 'run', company_id: companyId, since: from, limit: 600 } })
    const d = r.data || {}
    if (r.error || d.error) toast.error('Frankie could not run: ' + (d.error || r.error?.message))
    else toast.success(`Frankie judged ${d.judged} row${d.judged === 1 ? '' : 's'} — ${d.summary?.confidence?.sure || 0} sure. Book them from Frankie's verdicts on the Money tab.`)
    setWorking(false)
    await load()
  }
  const markClosed = async () => {
    if (!result?.ready) return
    if (!confirm(`Mark ${monthLabel(month)} closed? Books, Frankie and the CPA package treat it as final from here.`)) return
    setClosing(true)
    const { error } = await supabase.from('settings').upsert({ company_id: companyId, key: 'books_closed_through', value: JSON.stringify(month), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
    setClosing(false)
    if (error) { toast.error('Could not mark the month closed: ' + error.message); return }
    toast.success(`${monthLabel(month)} closed${userEmail ? ` by ${userEmail}` : ''}`)
    await load()
  }
  const go = (action) => {
    const target = ACTION_TAB[action]
    if (!target) return
    if (target.startsWith('/')) navigate?.(target)
    else { setActiveTab?.(target); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  const months = useMemo(() => { const out = []; const now = new Date(); for (let k = 1; k <= 12; k++) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) } return out }, [])
  const btn = (extra = {}) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', minHeight: '40px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.accent, fontSize: '12px', cursor: 'pointer', ...extra })

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardCheck size={16} style={{ color: theme.accent }} /> Close the month
          <HelpBadge text="The checks a CPA runs before calling a month done: every bank row confirmed, every deposit tied to an invoice, claim or payout, Paid invoices backed by a real payment, payroll runs showing in the bank, loan payments booked, incentive checks tied, no double charges, and old receivables looked at. The first two block the close; the rest need a look. 'Let Frankie work it' gives every open row a verdict to accept on the Money tab." />
        </h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px', minHeight: '40px' }}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button onClick={letFrankie} disabled={working} style={btn()}><Sparkles size={12} /> {working ? 'Thinking…' : 'Let Frankie work it'}</button>
          {result && !result.closed && <button onClick={markClosed} disabled={!result.ready || closing} title={result.ready ? '' : 'Clear the blockers first'} style={btn({ backgroundColor: result.ready ? theme.accent : 'transparent', color: result.ready ? '#fff' : theme.textMuted, border: result.ready ? 'none' : `1px solid ${theme.border}`, cursor: result.ready ? 'pointer' : 'not-allowed' })}><Lock size={12} /> {closing ? 'Closing…' : 'Mark closed'}</button>}
        </div>
      </div>
      {!result ? <div style={{ fontSize: '13px', color: theme.textMuted }}>Checking…</div> : (
        <>
          <div style={{ fontSize: '13px', color: result.closed ? '#4a7c59' : result.ready ? '#4a7c59' : theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {result.closed ? <><Lock size={14} /> {monthLabel(month)} is closed.</> : result.ready ? <><Check size={14} /> Nothing blocks the close{result.attention ? ` — ${result.attention} item${result.attention === 1 ? '' : 's'} worth a look below` : ''}.</> : <><AlertTriangle size={14} style={{ color: '#b45309' }} /> {result.blockers} row{result.blockers === 1 ? '' : 's'} block the close{result.attention ? `, ${result.attention} more need a look` : ''}.</>}
          </div>
          {result.checks.map(c => {
            const ok = c.open === 0
            const isOpen = !!open[c.id]
            return (
              <div key={c.id} style={{ borderTop: `1px solid ${theme.border}`, padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ width: '18px', display: 'inline-flex', justifyContent: 'center', color: ok ? '#4a7c59' : c.blocking ? '#ef4444' : '#b45309' }}>{ok ? <Check size={14} /> : <AlertTriangle size={14} />}</span>
                  <span style={{ flex: 1, minWidth: '180px', fontSize: '13px', color: theme.text, fontWeight: ok ? 400 : 600 }}>{c.label}</span>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>{ok ? (c.total ? `${c.total} ✓` : '—') : `${c.open} of ${c.total}${c.blocking ? ' · blocks' : ''}`}</span>
                  {!ok && c.action && <button onClick={() => go(c.action)} style={btn({ minHeight: '32px', padding: '4px 8px' })}>{c.action === 'verdicts' ? 'Verdicts' : c.action === 'transactions' ? 'Transactions' : c.action === 'payroll' ? 'Payroll' : c.action === 'loans' ? 'Loans' : 'Invoices'}</button>}
                  {!ok && c.items.length > 0 && <button onClick={() => setOpen({ ...open, [c.id]: !isOpen })} style={btn({ minHeight: '32px', padding: '4px 8px' })}>{isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>}
                </div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, marginLeft: '26px', marginTop: '2px' }}>{c.detail}</div>
                {isOpen && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: '44px', fontSize: '12px', color: theme.textMuted }}>
                    {c.items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                )}
              </div>
            )
          })}
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px' }}>{formatCurrency ? '' : ''}Closed through: {data?.closedThrough ? monthLabel(data.closedThrough) : 'nothing yet'}</div>
        </>
      )}
    </div>
  )
}
