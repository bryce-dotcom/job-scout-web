// Loans & lines of credit, on the Accounts tab.
//
// A loan is a `liabilities` row: typed in here, or created from a Plaid loan
// account when the bank link includes it (Liabilities product). Payments are
// `loan_payments` rows. The card watches the bank feed for outflows that
// look like a payment on one of the loans (lib/loanMatch) and books them in
// one tap — that row becomes a VERIFIED payment, the bank transaction is
// categorised "Loan Payment", the balance comes down by the principal, and
// Money Out counts only the interest. A payment made from an unconnected
// account is recorded by hand and stays unverified until a bank row is tied.
import { useState, useEffect, useCallback } from 'react'
import { Landmark, Plus, Check, Pencil, RefreshCw, Undo2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { LOAN_TYPES, isActiveLoan, matchLoanPayments, splitPayment, loanSummary, scheduledPayment } from '../../lib/loanMatch'
import { localDateStr } from '../../lib/localDate'

const EMPTY = { name: '', lender: '', liability_type: 'vehicle', current_balance: '', monthly_payment: '', payment_day: '', interest_rate: '', match_payee: '', next_payment_due: '', original_principal: '', term_months: '' }
const fmtDay = (d) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
const addMonth = (dayStr) => { const d = new Date(String(dayStr).slice(0, 10) + 'T00:00:00'); return localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())) }
const numOrNull = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }

export default function LoansCard({ companyId, theme, statCardStyle, formatCurrency, plaidTransactions = [], connectedAccounts = [], userEmail = null, onChanged }) {
  const [loans, setLoans] = useState(null)
  const [payments, setPayments] = useState([])
  const [form, setForm] = useState(null)          // null | { ...EMPTY, id? }
  const [manualFor, setManualFor] = useState(null) // loan id being paid by hand
  const [manual, setManual] = useState({ date: localDateStr(new Date()), amount: '' })
  const [busy, setBusy] = useState(null)
  const [openHistory, setOpenHistory] = useState({})
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    const since = `${new Date().getFullYear() - 1}-01-01`
    const [l, p] = await Promise.all([
      supabase.from('liabilities').select('*').eq('company_id', companyId).order('name'),
      supabase.from('loan_payments').select('*').eq('company_id', companyId).gte('date', since).order('date', { ascending: false }),
    ])
    setLoans(l.data || [])
    setPayments(p.data || [])
  }, [companyId])
  useEffect(() => { load() }, [load])

  const changed = async () => { await load(); onChanged?.() }

  const saveLoan = async () => {
    if (!form.name.trim()) { toast.error('Give the loan a name'); return }
    setBusy('save')
    const payload = {
      company_id: companyId, name: form.name.trim(), lender: form.lender.trim() || null, liability_type: form.liability_type || 'other',
      current_balance: numOrNull(form.current_balance) ?? 0, monthly_payment: numOrNull(form.monthly_payment) ?? 0,
      payment_day: form.payment_day ? parseInt(form.payment_day, 10) : null, interest_rate: numOrNull(form.interest_rate),
      match_payee: form.match_payee.trim() || null, next_payment_due: form.next_payment_due || null,
      original_principal: numOrNull(form.original_principal), term_months: form.term_months ? parseInt(form.term_months, 10) : null,
      status: 'active', updated_at: new Date().toISOString(),
    }
    const q = form.id
      ? supabase.from('liabilities').update(payload).eq('id', form.id).eq('company_id', companyId)
      : supabase.from('liabilities').insert([{ ...payload, source: 'manual' }])
    const { error } = await q
    setBusy(null)
    if (error) { toast.error('Could not save the loan: ' + error.message); return }
    toast.success(form.id ? 'Loan updated' : 'Loan added — payments that hit the bank will show up here to book')
    setForm(null)
    await changed()
  }

  // Book one bank row as a payment on one loan. Everything the payment
  // touches is written here, in this order, so a failure leaves nothing
  // half-booked that the next load would double count.
  const book = async (loan, txn, { date, amount } = {}) => {
    setBusy(`book-${txn ? txn.id : loan.id}`)
    try {
      const amt = txn ? Math.abs(parseFloat(txn.amount) || 0) : parseFloat(amount) || 0
      if (!(amt > 0)) throw new Error('Amount must be more than zero')
      const when = txn ? String(txn.date).slice(0, 10) : date
      const split = splitPayment(loan, amt)
      const { data: row, error } = await supabase.from('loan_payments').insert([{
        company_id: companyId, liability_id: loan.id, date: when, amount: amt, principal: split.principal, interest: split.interest,
        plaid_transaction_id: txn ? txn.id : null, source: txn ? 'bank_match' : 'manual',
        verified_at: txn ? new Date().toISOString() : null, verified_by: txn ? (userEmail || null) : null,
      }]).select().single()
      if (error) throw error
      if (txn) {
        const { error: e2 } = await supabase.from('plaid_transactions').update({ loan_payment_id: row.id, user_category: 'Loan Payment', confirmed: true }).eq('id', txn.id).eq('company_id', companyId)
        if (e2) throw e2
      }
      // A hand-entered loan keeps its own balance; a Plaid loan gets its
      // balance from the lender on the next sync, so only the dates move.
      const patch = { last_payment_date: when, last_payment_amount: amt, updated_at: new Date().toISOString() }
      if (loan.source !== 'plaid') {
        patch.current_balance = Math.max(0, (parseFloat(loan.current_balance) || 0) - split.principal)
        if (loan.next_payment_due && loan.next_payment_due <= when) patch.next_payment_due = addMonth(loan.next_payment_due)
      }
      const { error: e3 } = await supabase.from('liabilities').update(patch).eq('id', loan.id).eq('company_id', companyId)
      if (e3) throw e3
      toast.success(`${formatCurrency(amt)} booked on ${loan.name}${txn ? ' — verified against the bank' : ''}`)
      setManualFor(null); setManual({ date: localDateStr(new Date()), amount: '' })
      await changed()
    } catch (e) {
      toast.error('Could not book the payment: ' + e.message)
    }
    setBusy(null)
  }

  const unbook = async (p) => {
    const loan = (loans || []).find(l => l.id === p.liability_id)
    if (!confirm(`Remove this ${formatCurrency(p.amount)} payment from ${loan?.name || 'the loan'}? The bank row goes back to unbooked and the balance is restored.`)) return
    setBusy(`undo-${p.id}`)
    try {
      if (p.plaid_transaction_id) await supabase.from('plaid_transactions').update({ loan_payment_id: null }).eq('id', p.plaid_transaction_id).eq('company_id', companyId)
      const { error } = await supabase.from('loan_payments').delete().eq('id', p.id).eq('company_id', companyId)
      if (error) throw error
      if (loan && loan.source !== 'plaid') {
        await supabase.from('liabilities').update({ current_balance: (parseFloat(loan.current_balance) || 0) + (parseFloat(p.principal) || 0), updated_at: new Date().toISOString() }).eq('id', loan.id).eq('company_id', companyId)
      }
      await changed()
    } catch (e) { toast.error('Could not remove the payment: ' + e.message) }
    setBusy(null)
  }

  const retire = async (loan) => {
    if (!confirm(`Mark ${loan.name} paid off? It leaves the balance sheet and stops matching payments.`)) return
    const { error } = await supabase.from('liabilities').update({ status: 'paid_off', current_balance: 0, updated_at: new Date().toISOString() }).eq('id', loan.id).eq('company_id', companyId)
    if (error) { toast.error(error.message); return }
    await changed()
  }

  const syncPlaid = async () => {
    setSyncing(true)
    const r = await supabase.functions.invoke('plaid-link', { body: { action: 'sync_liabilities', company_id: companyId } })
    const d = r.data || {}
    if (r.error || d.error) toast.error('Could not read loans from the bank: ' + (d.error || r.error?.message))
    else toast.success(`${d.loans_updated || 0} loan${d.loans_updated === 1 ? '' : 's'} refreshed from the lender${d.warnings?.length ? ` — ${d.warnings[0]}` : ''}`)
    setSyncing(false)
    await changed()
  }

  if (loans === null) return null
  const active = loans.filter(isActiveLoan)
  const candidates = matchLoanPayments({ loans: active, plaidTransactions })
  const hasPlaid = (connectedAccounts || []).some(a => a.status === 'active')
  const input = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px', minHeight: '40px', boxSizing: 'border-box' }
  const btn = (extra = {}) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', minHeight: '40px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.accent, fontSize: '12px', cursor: 'pointer', ...extra })
  const label = (t) => <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '3px' }}>{t}</div>

  return (
    <div style={{ ...statCardStyle, marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Landmark size={16} style={{ color: theme.accent }} /> Loans & lines of credit
          <HelpBadge text="Every loan the business is paying on: truck and equipment loans, SBA or term loans, lines of credit, a mortgage. Type one in, or connect the lender through Plaid and it fills itself in (balance, rate, next payment). When a payment goes through the bank, it shows up below to book in one tap — that verifies the payment, drops the balance by the principal, and counts only the interest as an expense. Paid from an account that is not connected? Record it by hand." />
        </h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {hasPlaid && (
            <button onClick={syncPlaid} disabled={syncing} style={btn()} title="Read balances, rates and next payments for loans linked through Plaid">
              <RefreshCw size={12} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} /> {syncing ? 'Reading…' : 'Refresh from lender'}
            </button>
          )}
          <button onClick={() => setForm({ ...EMPTY })} style={btn()}><Plus size={12} /> Add loan</button>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.5, marginBottom: '10px' }}>
        Loans linked through your bank connection (Settings → Integrations → Connect Bank Account, pick the loan accounts too) keep themselves current. Anything else, add here and give it the payee text from your bank statement so payments are recognised.
      </div>

      {form && (
        <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: theme.bg, marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            <div>{label('Name *')}<input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="F-250 loan" /></div>
            <div>{label('Lender')}<input style={input} value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })} placeholder="Ford Credit" /></div>
            <div>{label('Type')}<select style={input} value={form.liability_type} onChange={e => setForm({ ...form, liability_type: e.target.value })}>{LOAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div>{label('Balance today')}<input type="number" step="0.01" style={input} value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} /></div>
            <div>{label('Monthly payment')}<input type="number" step="0.01" style={input} value={form.monthly_payment} onChange={e => setForm({ ...form, monthly_payment: e.target.value })} /></div>
            <div>{label('Payment day of month')}<input type="number" min="1" max="31" style={input} value={form.payment_day} onChange={e => setForm({ ...form, payment_day: e.target.value })} placeholder="15" /></div>
            <div>{label('Interest rate (APR %)')}<input type="number" step="0.01" style={input} value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} placeholder="6.9" /></div>
            <div>{label('Next payment due')}<input type="date" style={input} value={form.next_payment_due} onChange={e => setForm({ ...form, next_payment_due: e.target.value })} /></div>
            <div>{label('Payee text on the bank statement')}<input style={input} value={form.match_payee} onChange={e => setForm({ ...form, match_payee: e.target.value })} placeholder="FORD CREDIT" /></div>
            <div>{label('Original amount')}<input type="number" step="0.01" style={input} value={form.original_principal} onChange={e => setForm({ ...form, original_principal: e.target.value })} /></div>
            <div>{label('Term (months)')}<input type="number" style={input} value={form.term_months} onChange={e => setForm({ ...form, term_months: e.target.value })} placeholder="60" /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => setForm(null)} style={btn()}>Cancel</button>
            <button onClick={saveLoan} disabled={busy === 'save'} style={btn({ backgroundColor: theme.accent, color: '#fff', border: 'none' })}>{busy === 'save' ? 'Saving…' : (form.id ? 'Save changes' : 'Add loan')}</button>
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, marginBottom: '6px' }}>Looks like loan payments in your bank feed</div>
          {candidates.slice(0, 8).map(c => (
            <div key={`${c.loan.id}-${c.txn.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '6px 0', borderTop: `1px solid ${theme.border}` }}>
              <div style={{ flex: 1, minWidth: '200px', fontSize: '12px', color: theme.textSecondary }}>
                <span style={{ color: theme.text, fontWeight: 500 }}>{fmtDay(c.txn.date)} · {formatCurrency(c.txn.amount)}</span> · {c.txn.merchant_name || c.txn.name}
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{c.confidence === 'exact' ? 'Matches' : 'Could be'} {c.loan.name}: {c.reason}</div>
              </div>
              <button onClick={() => book(c.loan, c.txn)} disabled={busy === `book-${c.txn.id}`} style={btn({ color: '#fff', backgroundColor: c.confidence === 'exact' ? theme.accent : theme.textSecondary, border: 'none' })}>
                <Check size={12} /> {busy === `book-${c.txn.id}` ? 'Booking…' : `Book on ${c.loan.name}`}
              </button>
            </div>
          ))}
        </div>
      )}

      {active.length === 0 ? (
        <div style={{ fontSize: '13px', color: theme.textMuted, padding: '8px 0' }}>No loans yet. Add the truck loan, the line of credit, the SBA note — anything with a monthly payment — and Books will track the balance, the interest, and the payments as they clear the bank.</div>
      ) : active.map(loan => {
        const s = loanSummary(loan, payments)
        const mine = payments.filter(p => p.liability_id === loan.id)
        const isOpen = !!openHistory[loan.id]
        return (
          <div key={loan.id} style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: theme.bg, marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>
                  {loan.name}
                  {loan.lender && <span style={{ fontWeight: 400, color: theme.textMuted }}> · {loan.lender}</span>}
                  <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', borderRadius: '999px', backgroundColor: loan.source === 'plaid' ? 'rgba(74,124,89,0.15)' : theme.bgCard, color: loan.source === 'plaid' ? '#4a7c59' : theme.textMuted, border: `1px solid ${theme.border}` }}>{loan.source === 'plaid' ? 'from lender' : 'entered by hand'}</span>
                </div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
                  {LOAN_TYPES.find(t => t.value === loan.liability_type)?.label || loan.liability_type || 'Loan'}
                  {loan.interest_rate ? ` · ${parseFloat(loan.interest_rate)}% APR` : ''}
                  {s.scheduled > 0 ? ` · ${formatCurrency(s.scheduled)}/mo` : ''}
                  {s.nextDue ? <> · next <span style={{ color: s.overdue ? '#ef4444' : theme.text, fontWeight: s.overdue ? 600 : 400 }}>{fmtDay(s.nextDue)}{s.overdue ? ' — no payment booked yet' : ''}</span></> : ''}
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                  {s.count === 0 ? 'No payments booked yet' : <>{s.count} payment{s.count === 1 ? '' : 's'} booked · {formatCurrency(s.paidThisYear)} this year ({formatCurrency(s.interestThisYear)} interest) · {s.verified} verified against the bank · last {fmtDay(s.lastPayment?.date)}</>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>Balance</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: theme.text }}>{formatCurrency(loan.current_balance)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              <button onClick={() => { setManualFor(manualFor === loan.id ? null : loan.id); setManual({ date: localDateStr(new Date()), amount: String(scheduledPayment(loan) || '') }) }} style={btn()}>Record a payment</button>
              <button onClick={() => setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, loan[k] ?? ''])), id: loan.id })} style={btn()}><Pencil size={12} /> Edit</button>
              {mine.length > 0 && <button onClick={() => setOpenHistory({ ...openHistory, [loan.id]: !isOpen })} style={btn()}>{isOpen ? 'Hide' : 'Show'} payments</button>}
              <button onClick={() => retire(loan)} style={btn({ color: theme.textMuted })}>Paid off</button>
            </div>
            {manualFor === loan.id && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '8px' }}>
                <div>{label('Date')}<input type="date" style={{ ...input, width: '160px' }} value={manual.date} onChange={e => setManual({ ...manual, date: e.target.value })} /></div>
                <div>{label('Amount')}<input type="number" step="0.01" style={{ ...input, width: '140px' }} value={manual.amount} onChange={e => setManual({ ...manual, amount: e.target.value })} /></div>
                <button onClick={() => book(loan, null, manual)} disabled={busy === `book-${loan.id}`} style={btn({ backgroundColor: theme.accent, color: '#fff', border: 'none' })}>{busy === `book-${loan.id}` ? 'Saving…' : 'Save payment'}</button>
                <div style={{ fontSize: '11px', color: theme.textMuted, flexBasis: '100%' }}><AlertTriangle size={11} style={{ verticalAlign: '-2px' }} /> Not verified: no bank row is tied to it. If the payment later shows in the feed, book it from the blue list instead and delete this one.</div>
              </div>
            )}
            {isOpen && (
              <div style={{ marginTop: '8px', borderTop: `1px solid ${theme.border}` }}>
                {mine.slice(0, 12).map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 0', color: theme.textSecondary }}>
                    <span style={{ width: '64px', color: theme.text }}>{fmtDay(p.date)}</span>
                    <span style={{ width: '90px', color: theme.text, fontWeight: 500 }}>{formatCurrency(p.amount)}</span>
                    <span style={{ flex: 1, minWidth: '120px' }}>principal {formatCurrency(p.principal)} · interest {formatCurrency(p.interest)}</span>
                    <span style={{ fontSize: '11px', color: p.plaid_transaction_id ? '#4a7c59' : '#b45309' }}>{p.plaid_transaction_id ? 'verified' : 'by hand'}</span>
                    <button onClick={() => unbook(p)} disabled={busy === `undo-${p.id}`} title="Remove this payment" style={{ ...btn({ padding: '4px 8px', minHeight: '32px' }), color: theme.textMuted }}><Undo2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
