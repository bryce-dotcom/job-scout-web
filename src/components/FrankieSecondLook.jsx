// Frankie's second look — the bank rows that decide the tax number.
//
// Frankie can now say what the year looks like, but two kinds of row keep
// him from being precise: checks and drafts the categoriser tagged as wages
// (HHH: $498k of them against $311k of payroll runs), and deposits nobody
// has matched to a customer payment ($937k of them). Both used to be
// findable only by scrolling the whole feed. This is the short list,
// biggest first, with the answer one tap away.

import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { reviewQueue } from '../pages/agents/frankie/frankieTaxContext'
import { TAX_CATEGORIES } from '../lib/taxCategories'
import { DollarSign, ChevronDown, ChevronUp, Check } from 'lucide-react'

const PAGE = 15
const money = (n) => `$${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// The answers that come up. Anything else is in the full dropdown.
const WAGE_CHOICES = [
  { label: 'Pay', value: 'Line 9 - Salaries and wages' },
  { label: 'Subcontractor', value: 'Line 20 - Contract labor' },
  { label: 'Owner draw / loan', value: 'Not deductible' },
  { label: 'Materials', value: 'Line 2 - Cost of goods sold' },
]
const DEPOSIT_CHOICES = [
  { label: 'Customer payment', value: 'Income' },
  { label: 'Loan / owner money in', value: 'Not deductible' },
  { label: 'Refund / reimbursement', value: 'Not deductible' },
]

export default function FrankieSecondLook({ theme, isMobile }) {
  const plaidTransactions = useStore(s => s.plaidTransactions) || []
  const company = useStore(s => s.company)
  const fetchPlaidTransactions = useStore(s => s.fetchPlaidTransactions)
  const [open, setOpen] = useState(true)
  const [showWages, setShowWages] = useState(PAGE)
  const [showDeposits, setShowDeposits] = useState(PAGE)
  const [saving, setSaving] = useState(null)
  const [done, setDone] = useState(0)

  const queue = useMemo(
    () => reviewQueue(plaidTransactions, { fiscalYearEnd: company?.fiscal_year_end }),
    [plaidTransactions, company?.fiscal_year_end],
  )
  const total = queue.wageChecks.length + queue.unmatchedDeposits.length
  if (total === 0) return null

  const setLine = async (txn, value) => {
    if (!value) return
    setSaving(txn.id)
    try {
      const { error } = await supabase.from('plaid_transactions').update({ user_tax_category: value }).eq('id', txn.id)
      if (error) throw error
      setDone(n => n + 1)
      await fetchPlaidTransactions()
    } catch (e) {
      console.error('[Frankie second look] save failed:', e)
    } finally {
      setSaving(null)
    }
  }

  const accent = theme.accent
  const row = (txn, choices) => {
    const busy = saving === txn.id
    return (
      <div key={txn.id} style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        gap: isMobile ? 6 : 12, padding: '8px 0', borderBottom: `1px solid ${theme.border}`, opacity: busy ? 0.5 : 1,
      }}>
        {/* Date, description, amount. The amount never shrinks; when the
            choices do not fit beside it they wrap under, not over it. */}
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: theme.textMuted, flexShrink: 0, width: 78 }}>{txn.date}</span>
          <span style={{ fontSize: 13, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {txn.merchant_name || txn.name || '(no description)'}
            {txn.account?.account_name && <span style={{ color: theme.textMuted }}> · {txn.account.account_name}</span>}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginLeft: 'auto', flexShrink: 0 }}>{money(txn.amount)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          {choices.map(c => (
            <button key={c.label} disabled={busy} onClick={() => setLine(txn, c.value)} style={{
              padding: '5px 10px', borderRadius: 14, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${theme.border}`, background: theme.bgCard, color: theme.text,
            }}>
              {c.label}
            </button>
          ))}
          <select disabled={busy} value="" onChange={e => setLine(txn, e.target.value)} style={{
            padding: '5px 8px', borderRadius: 14, fontSize: 12, border: `1px solid ${theme.border}`,
            background: theme.bgCard, color: theme.textMuted, cursor: 'pointer', maxWidth: 110,
          }}>
            <option value="">Other…</option>
            {TAX_CATEGORIES.map(grp => (
              <optgroup key={grp.group} label={grp.group}>
                {grp.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    )
  }

  const group = (title, why, items, totalAmt, shown, setShown, choices) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: theme.text }}>{title}</h3>
        <span style={{ fontSize: 12, color: theme.textMuted }}>{items.length} {items.length === 1 ? 'row' : 'rows'} · {money(totalAmt)}</span>
      </div>
      <p style={{ margin: '4px 0 6px', fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>{why}</p>
      {items.slice(0, shown).map(t => row(t, choices))}
      {items.length > shown && (
        <button onClick={() => setShown(n => n + PAGE)} style={{
          marginTop: 8, background: 'none', border: 'none', color: accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
        }}>
          Show {Math.min(PAGE, items.length - shown)} more of {items.length - shown}
        </button>
      )}
    </div>
  )

  return (
    <div style={{
      marginBottom: 20, padding: '14px 18px', borderRadius: 12,
      background: theme.bgCard, border: `1px solid ${accent}`,
    }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: theme.accentBg || 'rgba(90,99,73,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <DollarSign size={16} style={{ color: accent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.text }}>Frankie's second look</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: theme.textMuted }}>
            {total} bank {total === 1 ? 'row decides' : 'rows decide'} how solid this year's tax number is. Biggest first; each one is one tap.
            {done > 0 && <span style={{ color: accent, fontWeight: 600 }}> {done} done this visit <Check size={11} style={{ verticalAlign: -1 }} /></span>}
          </p>
        </div>
        {open ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
      </div>

      {open && (
        <>
          {queue.wageChecks.length > 0 && group(
            'Tagged as wages, but they are checks and drafts',
            'The categoriser guessed these were pay. If they were subcontractors they are still deductible; if they were owner draws or loan repayments they are not, and your taxable profit is higher by that amount.',
            queue.wageChecks, queue.wageChecksTotal, showWages, setShowWages, WAGE_CHOICES,
          )}
          {queue.unmatchedDeposits.length > 0 && group(
            'Deposits not matched to a customer payment',
            'Money that came in without an invoice or payment behind it. A customer payment is revenue; a loan draw, owner capital or a refund is not taxable income.',
            queue.unmatchedDeposits, queue.unmatchedDepositsTotal, showDeposits, setShowDeposits, DEPOSIT_CHOICES,
          )}
        </>
      )}
    </div>
  )
}
