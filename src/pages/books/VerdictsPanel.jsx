// Frankie's verdicts — the review queue on the Books Money tab, and the
// switch that lets Frankie (CFO hat off, CPA hat on) book the sure rows
// himself.
//
// Every unconfirmed bank row gets a verdict from books-deduce (what it is,
// what it matches, how sure, the evidence). Accept and Correct go through
// lib/verdictApply, the same writers as matching by hand. With auto-booking
// on, the nightly cron applies verdicts at or above the floor and at or
// under the cap through the SAME code; every row it books shows under
// "Booked by Frankie" with an Undo that puts it back exactly as it was.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sparkles, Check, X, ChevronDown, ChevronUp, RefreshCw, Pencil, Undo2, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { applyVerdict, dismissVerdict, undoVerdict, defaultTaxFor, parseAutobook, AUTOBOOK_DEFAULTS } from '../../lib/verdictApply'

const KIND_LABEL = {
  payroll: 'Payroll', tax_deposit: 'Payroll tax deposit', stripe_payout: 'Stripe payout (transfer)', loan_payment: 'Loan payment', transfer: 'Transfer between accounts',
  utility_incentive: 'Utility incentive', customer_payment: 'Customer payment', refund: 'Refund', expense: 'Expense', income: 'Income', unknown: 'Unexplained',
}
const fmtDay = (d) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
const fmtWhen = (d) => d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const band = (c) => c >= 0.9 ? 'sure' : c >= 0.7 ? 'likely' : 'unsure'
const BAND_COLOR = { sure: '#4a7c59', likely: '#b45309', unsure: '#ef4444' }

export default function VerdictsPanel({ companyId, theme, formatCurrency, plaidTransactions = [], expenseCategories = [], userEmail = null, isAdmin = false, onApplied }) {
  const [verdicts, setVerdicts] = useState(null)
  const [booked, setBooked] = useState([])
  const [filter, setFilter] = useState('all')      // all | sure | look
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(null)
  const [running, setRunning] = useState(false)
  const [correcting, setCorrecting] = useState(null) // txn id
  const [corr, setCorr] = useState({ category: '', match_ids: [], transfer: false })
  const [collapsed, setCollapsed] = useState(false)
  const [showBooked, setShowBooked] = useState(false)
  const [auto, setAuto] = useState({ ...AUTOBOOK_DEFAULTS })
  const [autoOpen, setAutoOpen] = useState(false)
  const [savingAuto, setSavingAuto] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    const [v, b, s] = await Promise.all([
      supabase.from('books_verdicts').select('*').eq('company_id', companyId).eq('status', 'proposed').order('confidence', { ascending: false }).limit(1000),
      supabase.from('books_verdicts').select('plaid_transaction_id, kind, category, confidence, status, applied, applied_at, reviewed_by, matches').eq('company_id', companyId).in('status', ['auto', 'accepted', 'corrected']).not('applied_at', 'is', null).order('applied_at', { ascending: false }).limit(40),
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'books_autobook').limit(1),
    ])
    setVerdicts(v.data || [])
    setBooked(b.data || [])
    setAuto(parseAutobook(s.data?.[0]?.value))
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
    const s = { n: all.length, sure: 0, look: 0, matched: 0, autoEligible: 0 }
    for (const r of all) {
      if (r.v.confidence >= 0.9) s.sure++; else s.look++
      s.matched += (r.v.matches || []).reduce((x, m) => x + (parseFloat(m.amount) || 0), 0)
      if (r.v.kind !== 'unknown' && parseFloat(r.v.confidence) >= auto.min_confidence && Math.abs(parseFloat(r.t.amount) || 0) <= auto.max_amount) s.autoEligible++
    }
    return s
  }, [verdicts, txnById, auto])

  const runFrankie = async () => {
    setRunning(true)
    const r = await supabase.functions.invoke('books-deduce', { body: { action: 'run', company_id: companyId, limit: 400 } })
    const d = r.data || {}
    if (r.error || d.error) toast.error('Frankie could not run: ' + (d.error || r.error?.message))
    else toast.success(`Frankie judged ${d.judged} row${d.judged === 1 ? '' : 's'}: ${d.summary?.confidence?.sure || 0} sure, ${d.summary?.confidence?.likely || 0} likely, ${d.summary?.confidence?.unsure || 0} unsure${d.model?.error ? ` (AI: ${d.model.error})` : ''}`)
    setRunning(false)
    await load()
  }
  const saveAuto = async (next) => {
    setSavingAuto(true)
    const value = JSON.stringify({ enabled: !!next.enabled, min_confidence: Math.max(0.5, Math.min(0.99, parseFloat(next.min_confidence) || 0.95)), max_amount: Math.max(0, parseFloat(next.max_amount) || 0) })
    const { error } = await supabase.from('settings').upsert({ company_id: companyId, key: 'books_autobook', value, updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
    setSavingAuto(false)
    if (error) { toast.error('Could not save: ' + error.message); return }
    setAuto(parseAutobook(value))
    toast.success(next.enabled ? `Frankie will book rows at ${Math.round(next.min_confidence * 100)}%+ and under ${formatCurrency(next.max_amount)} on his own` : 'Frankie will only propose; you book')
  }
  const bookNow = async () => {
    if (!confirm(`Have Frankie book the ${stats.autoEligible} rows at ${Math.round(auto.min_confidence * 100)}%+ and under ${formatCurrency(auto.max_amount)} now? Each shows under "Booked by Frankie" with an Undo.`)) return
    setBusy('auto')
    const r = await supabase.functions.invoke('books-deduce', { body: { action: 'autobook', company_id: companyId, force: true } })
    const d = r.data || {}
    setBusy(null)
    if (r.error || d.error) toast.error('Frankie could not book: ' + (d.error || r.error?.message))
    else toast[d.failed ? 'error' : 'success'](`Frankie booked ${d.booked}${d.failed ? `, ${d.failed} failed and stay in the queue` : ''}`)
    await load(); onApplied?.()
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
    if (!confirm(`Book all ${sure.length} sure verdicts now? Each one is applied exactly as shown and can be undone from "Booked by Frankie".`)) return
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
  const undo = async (b) => {
    const t = txnById.get(b.plaid_transaction_id)
    if (!t) { toast.error('That bank row is not loaded yet — refresh and try again'); return }
    if (!confirm(`Undo this booking? ${(b.applied || []).join('; ')} — all of it is reversed and the row goes back to the queue.`)) return
    setBusy(`undo-${t.id}`)
    const res = await undoVerdict(supabase, { companyId, txn: t, userEmail })
    setBusy(null)
    if (res.error) { toast.error('Could not undo: ' + res.error); return }
    toast.success('Undone: ' + res.did.join(' · '))
    await load(); onApplied?.()
  }

  if (verdicts === null) return null
  const btn = (extra = {}) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', minHeight: '40px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.accent, fontSize: '12px', cursor: 'pointer', ...extra })
  const input = { padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px', minHeight: '40px' }
  const autoBooked = booked.filter(b => b.status === 'auto')

  return (
    <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Sparkles size={16} style={{ color: theme.accent }} /> Frankie's verdicts
          <HelpBadge text="Frankie with his CPA hat on. He reads every unconfirmed bank row against what the ledger already knows — open invoices, incentive claims, payroll pay dates, loan schedules, Stripe payouts, your category rules, and what each payee was confirmed as before — and says what it is, what it matches, how sure, and why. Accept books it; Correct teaches a rule. With auto-booking on he books the sure, small rows himself every night and lists them below with an Undo." />
          {stats.n > 0 && <span style={{ fontSize: '12px', fontWeight: 400, color: theme.textMuted }}>{stats.n} waiting · {stats.sure} sure · {stats.look} need a look{stats.matched > 0 ? ` · ${formatCurrency(stats.matched)} matched` : ''}</span>}
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: auto.enabled ? 'rgba(74,124,89,0.15)' : theme.bg, color: auto.enabled ? '#4a7c59' : theme.textMuted, border: `1px solid ${theme.border}` }}>
            {auto.enabled ? `auto-booking on · ${Math.round(auto.min_confidence * 100)}%+ · under ${formatCurrency(auto.max_amount)}` : 'auto-booking off'}
          </span>
        </h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={runFrankie} disabled={running} style={btn()}><RefreshCw size={12} style={running ? { animation: 'spin 1s linear infinite' } : {}} /> {running ? 'Thinking…' : 'Run Frankie'}</button>
          {stats.autoEligible > 0 && <button onClick={bookNow} disabled={busy === 'auto'} style={btn({ backgroundColor: theme.accent, color: '#fff', border: 'none' })}><Zap size={12} /> {busy === 'auto' ? 'Booking…' : `Frankie, book ${stats.autoEligible} now`}</button>}
          {stats.sure > stats.autoEligible && <button onClick={acceptAllSure} disabled={busy === 'all'} style={btn()}><Check size={12} /> {busy === 'all' ? 'Booking…' : `Book all ${stats.sure} sure`}</button>}
          <button onClick={() => setAutoOpen(o => !o)} style={btn()} title="Auto-booking settings"><Zap size={12} /> Settings</button>
          <button onClick={() => setCollapsed(c => !c)} style={btn()}>{collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}</button>
        </div>
      </div>

      {autoOpen && (
        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', backgroundColor: theme.bg, display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: theme.text, minHeight: '40px' }}>
            <input type="checkbox" checked={!!auto.enabled} disabled={!isAdmin} onChange={e => saveAuto({ ...auto, enabled: e.target.checked })} /> Frankie books sure rows himself (nightly)
          </label>
          <div><div style={{ fontSize: '11px', color: theme.textMuted }}>Only at or above</div><select style={input} value={String(auto.min_confidence)} disabled={!isAdmin} onChange={e => saveAuto({ ...auto, min_confidence: parseFloat(e.target.value) })}>{[0.99, 0.97, 0.95, 0.92, 0.9].map(v => <option key={v} value={String(v)}>{Math.round(v * 100)}% sure</option>)}</select></div>
          <div><div style={{ fontSize: '11px', color: theme.textMuted }}>Only under</div><select style={input} value={String(auto.max_amount)} disabled={!isAdmin} onChange={e => saveAuto({ ...auto, max_amount: parseFloat(e.target.value) })}>{[500, 1000, 2500, 5000, 10000, 25000, 1000000].map(v => <option key={v} value={String(v)}>{v >= 1000000 ? 'any amount' : formatCurrency(v)}</option>)}</select></div>
          <div style={{ fontSize: '11px', color: theme.textMuted, flexBasis: '100%' }}>{isAdmin ? 'Rows above the cap or below the floor wait for a person. Everything Frankie books is listed below with an Undo.' : 'An admin sets these.'}{savingAuto ? ' Saving…' : ''}</div>
        </div>
      )}

      {!collapsed && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            {[['all', 'All'], ['sure', 'Sure (90%+)'], ['look', 'Needs a look']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={btn({ minHeight: '32px', padding: '4px 10px', backgroundColor: filter === k ? theme.accentBg : 'transparent', fontWeight: filter === k ? 600 : 400 })}>{l}</button>
            ))}
            {booked.length > 0 && <button onClick={() => setShowBooked(s => !s)} style={btn({ minHeight: '32px', padding: '4px 10px', marginLeft: 'auto' })}>{showBooked ? 'Hide' : 'Show'} booked ({booked.length}{autoBooked.length ? `, ${autoBooked.length} by Frankie` : ''})</button>}
          </div>
          {showBooked && (
            <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '10px', backgroundColor: theme.bg }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.text, marginBottom: '4px' }}>Recently booked</div>
              {booked.map(b => {
                const t = txnById.get(b.plaid_transaction_id)
                return (
                  <div key={b.plaid_transaction_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: theme.textSecondary, padding: '4px 0', borderTop: `1px solid ${theme.border}` }}>
                    <span style={{ color: theme.textMuted, width: '110px' }}>{fmtWhen(b.applied_at)}</span>
                    <span style={{ flex: 1, minWidth: '200px' }}>{t ? `${fmtDay(t.date)} · ${formatCurrency(Math.abs(parseFloat(t.amount) || 0))} · ${t.merchant_name || t.name}` : `row #${b.plaid_transaction_id}`} — {(b.applied || []).join('; ')}</span>
                    <span style={{ fontSize: '11px', color: b.status === 'auto' ? '#4a7c59' : theme.textMuted }}>{b.status === 'auto' ? 'Frankie' : b.reviewed_by || 'accepted'}</span>
                    <button onClick={() => undo(b)} disabled={busy === `undo-${b.plaid_transaction_id}`} style={btn({ minHeight: '32px', padding: '4px 8px' })}><Undo2 size={12} /> Undo</button>
                  </div>
                )
              })}
            </div>
          )}
          {stats.n === 0 && <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '10px' }}>Nothing waiting. New bank rows get their verdicts every night, or press Run Frankie now.</div>}
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
    </div>
  )
}
