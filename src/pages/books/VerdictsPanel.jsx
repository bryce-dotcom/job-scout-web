// Frankie's verdicts — the review queue on the Transactions tab.
//
// Every unconfirmed bank row gets a verdict from books-deduce (what it is,
// what it matches, how sure, the evidence). Nothing is booked until a
// person accepts it here; Accept and Correct go through lib/verdictApply,
// which uses the same writers as matching by hand. Sorted by dollars so the
// big ones get eyes first; "sure" rows can be accepted in one sweep.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sparkles, Check, X, ChevronDown, ChevronUp, RefreshCw, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { applyVerdict, dismissVerdict, defaultTaxFor } from '../../lib/verdictApply'

const KIND_LABEL = {
  payroll: 'Payroll', tax_deposit: 'Payroll tax deposit', stripe_payout: 'Stripe payout (transfer)', loan_payment: 'Loan payment', transfer: 'Transfer between accounts',
  utility_incentive: 'Utility incentive', customer_payment: 'Customer payment', refund: 'Refund', expense: 'Expense', income: 'Income', unknown: 'Unexplained',
}
const fmtDay = (d) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
const band = (c) => c >= 0.9 ? 'sure' : c >= 0.7 ? 'likely' : 'unsure'
const BAND_COLOR = { sure: '#4a7c59', likely: '#b45309', unsure: '#ef4444' }

export default function VerdictsPanel({ companyId, theme, formatCurrency, plaidTransactions = [], expenseCategories = [], userEmail = null, isMobile = false, onApplied }) {
  const [verdicts, setVerdicts] = useState(null)
  const [filter, setFilter] = useState('all')      // all | sure | look
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(null)
  const [running, setRunning] = useState(false)
  const [correcting, setCorrecting] = useState(null) // txn id
  const [corr, setCorr] = useState({ category: '', match_ids: [], transfer: false })
  const [collapsed, setCollapsed] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    const { data } = await supabase.from('books_verdicts').select('*').eq('company_id', companyId).eq('status', 'proposed').order('confidence', { ascending: false }).limit(2000)
    setVerdicts(data || [])
  }, [companyId])
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const txnById = useMemo(() => new Map((plaidTransactions || []).map(t => [t.id, t])), [plaidTransactions])
  const rows = useMemo(() => {
    const list = (verdicts || []).map(v => ({ v, t: txnById.get(v.plaid_transaction_id) })).filter(r => r.t && !r.t.confirmed)
    list.sort((a, b) => Math.abs(parseFloat(b.t.amount) || 0) - Math.abs(parseFloat(a.t.amount) || 0))
    return list.filter(r => filter === 'all' || (filter === 'sure' ? r.v.confidence >= 0.9 : r.v.confidence < 0.9))
  }, [verdicts, txnById, filter])
  const stats = useMemo(() => {
    const all = (verdicts || []).map(v => ({ v, t: txnById.get(v.plaid_transaction_id) })).filter(r => r.t && !r.t.confirmed)
    const s = { n: all.length, sure: 0, look: 0, matched: 0 }
    for (const r of all) { if (r.v.confidence >= 0.9) s.sure++; else s.look++; s.matched += (r.v.matches || []).reduce((x, m) => x + (parseFloat(m.amount) || 0), 0) }
    return s
  }, [verdicts, txnById])

  const runFrankie = async () => {
    setRunning(true)
    const r = await supabase.functions.invoke('books-deduce', { body: { action: 'run', company_id: companyId, limit: 400 } })
    const d = r.data || {}
    if (r.error || d.error) toast.error('Frankie could not run: ' + (d.error || r.error?.message))
    else toast.success(`Frankie judged ${d.judged} row${d.judged === 1 ? '' : 's'}: ${d.summary?.confidence?.sure || 0} sure, ${d.summary?.confidence?.likely || 0} likely, ${d.summary?.confidence?.unsure || 0} unsure${d.model?.error ? ` (AI: ${d.model.error})` : ''}`)
    setRunning(false)
    await load()
  }

  const accept = async (r, correction = null) => {
    setBusy(r.t.id)
    const res = await applyVerdict(supabase, { companyId, verdict: r.v, txn: r.t, userEmail, categories: expenseCategories, decision: correction ? 'corrected' : 'accepted', correction })
    setBusy(null)
    if (res.error) { toast.error(`Could not book it: ${res.error}`); return }
    toast.success(res.did.join(' · '))
    setCorrecting(null)
    await load(); onApplied?.()
  }
  const acceptAllSure = async () => {
    const sure = rows.filter(r => r.v.confidence >= 0.9)
    if (!sure.length) return
    if (!confirm(`Book all ${sure.length} sure verdicts now? Each one is applied exactly as shown; you can still undo any row from the Transactions list.`)) return
    setBusy('all')
    let ok = 0, failed = 0
    for (const r of sure) {
      const res = await applyVerdict(supabase, { companyId, verdict: r.v, txn: r.t, userEmail, categories: expenseCategories })
      if (res.error) failed++; else ok++
    }
    setBusy(null)
    toast[failed ? 'error' : 'success'](`Booked ${ok}${failed ? `, ${failed} failed (left in the queue)` : ''}`)
    await load(); onApplied?.()
  }
  const dismiss = async (r) => {
    setBusy(r.t.id)
    await dismissVerdict(supabase, { companyId, txnId: r.t.id, userEmail })
    setBusy(null)
    await load()
  }

  if (verdicts === null || (verdicts.length === 0 && !running && stats.n === 0 && collapsed)) return null
  const btn = (extra = {}) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', minHeight: '40px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.accent, fontSize: '12px', cursor: 'pointer', ...extra })
  const input = { padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px', minHeight: '40px' }

  return (
    <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} style={{ color: theme.accent }} /> Frankie's verdicts
          <HelpBadge text="Frankie reads every unconfirmed bank row against what the ledger already knows — open invoices, incentive claims, payroll pay dates, loan schedules, Stripe payouts, your category rules, and what each payee was confirmed as before — and says what it is, what it matches, how sure, and why. Nothing is booked until you press Accept (or Book all sure). Correct teaches it a rule for next time." />
          {stats.n > 0 && <span style={{ fontSize: '12px', fontWeight: 400, color: theme.textMuted }}>{stats.n} waiting · {stats.sure} sure · {stats.look} need a look{stats.matched > 0 ? ` · ${formatCurrency(stats.matched)} matched to invoices, claims and loans` : ''}</span>}
        </h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={runFrankie} disabled={running} style={btn()}><RefreshCw size={12} style={running ? { animation: 'spin 1s linear infinite' } : {}} /> {running ? 'Thinking…' : 'Run Frankie'}</button>
          {stats.sure > 0 && <button onClick={acceptAllSure} disabled={busy === 'all'} style={btn({ backgroundColor: theme.accent, color: '#fff', border: 'none' })}><Check size={12} /> {busy === 'all' ? 'Booking…' : `Book all ${stats.sure} sure`}</button>}
          <button onClick={() => setCollapsed(c => !c)} style={btn()}>{collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}</button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            {[['all', 'All'], ['sure', 'Sure (90%+)'], ['look', 'Needs a look']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={btn({ minHeight: '32px', padding: '4px 10px', backgroundColor: filter === k ? theme.accentBg : 'transparent', fontWeight: filter === k ? 600 : 400 })}>{l}</button>
            ))}
          </div>
          {stats.n === 0 && <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '10px' }}>Nothing waiting. Press Run Frankie after a bank sync and the new rows get their verdicts.</div>}
          {rows.slice(0, 60).map(r => {
            const { v, t } = r
            const amt = parseFloat(t.amount) || 0
            const b = band(parseFloat(v.confidence))
            const isOpen = !!open[t.id]
            const editing = correcting === t.id
            const catChoices = (expenseCategories || []).filter(c => amt < 0 ? c.type === 'income' : c.type !== 'income').map(c => c.name)
            const matchChoices = [...(v.candidates?.invoices || []).map(i => ({ id: i.id, label: `${i.invoice_id || '#' + i.id} — ${i.customer_name || ''} (${formatCurrency(i.balance)} open)` })), ...(v.candidates?.claims || []).map(c => ({ id: c.id, label: `${c.utility_name || 'Utility'} claim #${c.id} (${formatCurrency(c.amount)})` })), ...(v.matches || []).filter(m => ['invoice', 'utility_invoice'].includes(m.type)).map(m => ({ id: m.id, label: m.label }))]
            const seen = new Set(); const uniqMatches = matchChoices.filter(m => !seen.has(m.id) && seen.add(m.id))
            return (
              <div key={t.id} style={{ borderTop: `1px solid ${theme.border}`, padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{ fontSize: '13px', color: theme.text }}>
                      <span style={{ color: theme.textMuted }}>{fmtDay(t.date)}</span> · <span style={{ fontWeight: 600, color: amt < 0 ? '#4a7c59' : theme.text }}>{amt < 0 ? '+' : '−'}{formatCurrency(Math.abs(amt))}</span> · {t.merchant_name || t.name}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '3px' }}>
                      <span style={{ fontWeight: 600, color: theme.text }}>{KIND_LABEL[v.kind] || v.kind}</span>
                      {v.category && v.kind !== 'transfer' && v.kind !== 'stripe_payout' ? ` · ${v.category}` : ''}
                      {(v.matches || []).length > 0 ? ` → ${v.matches.map(m => m.label).join(' + ')}` : ''}
                      <span style={{ marginLeft: '8px', fontSize: '11px', padding: '1px 7px', borderRadius: '999px', backgroundColor: `${BAND_COLOR[b]}22`, color: BAND_COLOR[b], fontWeight: 600 }}>{Math.round(parseFloat(v.confidence) * 100)}%{v.source === 'model' ? ' · AI' : ''}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '3px' }}>{v.reason}</div>
                    {isOpen && (
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', color: theme.textSecondary }}>
                        {(v.evidence || []).map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    )}
                    {editing && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
                        {uniqMatches.length > 0 && (
                          <select style={{ ...input, maxWidth: '100%' }} value={corr.match_ids[0] || ''} onChange={e => setCorr({ ...corr, match_ids: e.target.value ? [Number(e.target.value)] : [] })}>
                            <option value="">Pick the invoice or claim…</option>
                            {uniqMatches.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        )}
                        <select style={{ ...input, maxWidth: '100%' }} value={corr.category} onChange={e => setCorr({ ...corr, category: e.target.value })}>
                          <option value="">Or pick a category…</option>
                          {catChoices.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <label style={{ fontSize: '12px', color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: '4px' }}><input type="checkbox" checked={corr.transfer} onChange={e => setCorr({ ...corr, transfer: e.target.checked })} /> It's a transfer</label>
                        <button onClick={() => accept(r, corr.transfer ? { kind: 'transfer', is_transfer: true } : corr.match_ids.length ? { kind: amt < 0 && (v.candidates?.claims || []).some(c => c.id === corr.match_ids[0]) ? 'utility_incentive' : 'customer_payment', match_ids: corr.match_ids } : corr.category ? { kind: amt < 0 ? 'income' : 'expense', category: corr.category, tax_category: defaultTaxFor(corr.category, amt < 0 ? 'income' : 'expense', expenseCategories), matches: [] } : null)} disabled={busy === t.id || (!corr.transfer && !corr.category && !corr.match_ids.length)} style={btn({ backgroundColor: theme.accent, color: '#fff', border: 'none' })}>
                          <Check size={12} /> Book my pick
                        </button>
                        <button onClick={() => setCorrecting(null)} style={btn()}>Cancel</button>
                      </div>
                    )}
                  </div>
                  {!editing && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => setOpen({ ...open, [t.id]: !isOpen })} style={btn({ minHeight: '36px', padding: '4px 8px' })} title="Why">{isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} why</button>
                      <button onClick={() => { setCorrecting(t.id); setCorr({ category: '', match_ids: [], transfer: false }) }} style={btn({ minHeight: '36px', padding: '4px 8px' })}><Pencil size={12} /> Correct</button>
                      <button onClick={() => dismiss(r)} disabled={busy === t.id} style={btn({ minHeight: '36px', padding: '4px 8px', color: theme.textMuted })} title="Leave it unbooked for now"><X size={12} /></button>
                      <button onClick={() => accept(r)} disabled={busy === t.id || (v.kind === 'unknown') || (!v.category && !(v.matches || []).length && !v.is_transfer)} style={btn({ minHeight: '36px', padding: '4px 10px', backgroundColor: b === 'sure' ? theme.accent : 'transparent', color: b === 'sure' ? '#fff' : theme.accent, border: b === 'sure' ? 'none' : `1px solid ${theme.border}` })}>
                        <Check size={12} /> {busy === t.id ? 'Booking…' : 'Accept'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {rows.length > 60 && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>Showing the 60 largest of {rows.length}. Book or correct these and the next ones move up.</div>}
        </>
      )}
      {isMobile ? null : null}
    </div>
  )
}
