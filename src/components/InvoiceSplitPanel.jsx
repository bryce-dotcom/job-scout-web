// Where this invoice goes.
//
// A rebate invoice has two debtors. This panel is the one place on the
// invoice that says so: the invoice total forks into what the utility owes
// (the incentive, billed to them) and what the customer owes (their share of
// the project plus any add-ons), and each side carries its own status —
// paid, awaiting, not yet submitted — because the two balances age
// separately in the books.
//
// Everything shown is read from the invoice itself: utility_owes,
// utility_paid_at, utility_submitted_at, utility_provider_id, customer_owes,
// and the customer's payments. Nothing is recomputed here; the figures for
// the customer's breakdown come from buildInvoicePages, the same numbers
// the PDF prints. Only invoices that carry a utility debt render this.
//
// Recording the utility's payment, reopening it, and correcting the date
// happen here, through lib/utilitySettlement — the one write path, shared
// with the utility record page — and the database mirrors the result back
// onto this invoice. The panel never computes a settlement itself.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, User, CheckCircle, Clock, Send, ExternalLink, RotateCcw } from 'lucide-react'
import { invoiceUtilityBalance, invoiceBalance } from '../lib/arHelpers'
import { expectedUtilityAmount, BORNE_BY_CUSTOMER, BORNE_BY_COMPANY } from '../lib/utilitySettlement'

const UTIL = '#14b8a6'
const CUST = '#3b82f6'

const days = (from) => {
  if (!from) return null
  const d = Math.floor((Date.now() - new Date(from).getTime()) / 86400000)
  return d < 0 ? 0 : d
}

export default function InvoiceSplitPanel({
  invoice, pages, payments = [], utilityName, linkedUtilityInvoice,
  onMarkSubmitted, onRecordPayment, onReopen, onCorrectDate, saving = false,
  theme, isMobile = false, formatCurrency, formatDate,
}) {
  const [hot, setHot] = useState(null) // 'util' | 'cust' | null
  // The inline settlement form: 'record' | 'date' | null.
  const [form, setForm] = useState(null)
  const [paidOn, setPaidOn] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  // Who covers a shortfall. Only asked when the amount entered is short.
  const [borneBy, setBorneBy] = useState(null)

  if (!invoice || invoice.utility_owes == null) return null

  const utilityOwes = Number(invoice.utility_owes) || 0
  const utilityBalance = invoiceUtilityBalance(invoice)
  const customerOwes = Number(invoice.customer_owes) || 0
  const customerBalance = invoiceBalance(invoice, payments)
  // What the customer actually sent, not the amount applied — an overpayment
  // should read as one.
  const customerPaid = (payments || []).filter((p) => p?.paid_by !== 'utility').reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const total = utilityOwes + customerOwes

  const inScope = Number(pages?.pageOne?.total) || 0
  const addOns = Number(pages?.pageTwo?.addOnsSubtotal) || 0
  const showBreakdown = pages?.twoPage && Math.abs(inScope + addOns - customerOwes) < 0.01

  const utilityPaid = !!invoice.utility_paid_at
  const submitted = invoice.utility_submitted_at
  const utilityStatus = utilityPaid
    ? { tone: theme.success, Icon: CheckCircle, text: `Paid ${formatDate(invoice.utility_paid_at)}` }
    : submitted
      ? { tone: theme.warning, Icon: Clock, text: `Awaiting payment · submitted ${formatDate(submitted)}${days(submitted) != null ? ` · ${days(submitted)}d` : ''}` }
      : { tone: theme.textMuted, Icon: Send, text: 'Not yet submitted' }

  const customerSettled = customerOwes > 0 && customerBalance <= 0.01
  const customerStatus = customerOwes === 0
    ? { tone: theme.textMuted, Icon: CheckCircle, text: 'Nothing owed — the incentive covers it' }
    : customerSettled
      ? { tone: theme.success, Icon: CheckCircle, text: 'Paid in full' }
      : { tone: theme.warning, Icon: Clock, text: `${formatCurrency(customerBalance)} outstanding${invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ''}` }

  const dim = (side) => (hot && hot !== side ? 0.35 : 1)

  // Ribbon geometry: two bands leaving one spine, heights proportional to
  // the money. Minimum band height keeps a small share visible.
  const W = 640, H = 200, left = 150, right = 470
  const utilShare = total > 0 ? utilityOwes / total : 0.5
  const bandTop = 30, bandH = 140, gap = 10
  const uH = Math.max(18, (bandH - gap) * utilShare)
  const cH = Math.max(18, bandH - gap - uH)
  const uY = bandTop, cY = bandTop + uH + gap
  const ribbon = (y0, h0, y1, h1) =>
    `M${left},${y0} C${left + 150},${y0} ${right - 150},${y1} ${right},${y1} L${right},${y1 + h1} C${right - 150},${y1 + h1} ${left + 150},${y0 + h0} ${left},${y0 + h0} Z`

  const card = (side, opts) => {
    const { color, Icon: PartyIcon, name, amount, status, lines, actions, extra } = opts
    return (
    <div
      onMouseEnter={() => setHot(side)}
      onMouseLeave={() => setHot(null)}
      style={{
        flex: 1, minWidth: 0, opacity: dim(side), transition: 'opacity 160ms',
        border: `1px solid ${theme.border}`, borderTop: `3px solid ${color}`, borderRadius: '10px',
        padding: '14px 16px', backgroundColor: theme.bg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <PartyIcon size={14} color={color} />
        <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.6px', textTransform: 'uppercase', color }}>{name}</div>
      </div>
      <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {formatCurrency(amount)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', color: status.tone, fontWeight: '600' }}>
        <status.Icon size={13} color={status.tone} />
        <span>{status.text}</span>
      </div>
      {lines?.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {lines.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px', color: theme.textSecondary }}>
              <span>{label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: theme.text }}>{value}</span>
            </div>
          ))}
        </div>
      )}
      {actions?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>{actions}</div>
      )}
      {extra}
    </div>
    )
  }

  const btn = (key, label, { to, onClick, Icon: BIcon, primary, disabled = false } = {}) => {
    const style = {
      display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 12px',
      fontSize: '12px', fontWeight: '600', borderRadius: '8px', cursor: saving ? 'wait' : disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      textDecoration: 'none',
      backgroundColor: primary ? theme.accent : 'transparent',
      color: primary ? '#fff' : theme.accent,
      border: `1px solid ${theme.accent}`,
    }
    const inner = <>{BIcon && <BIcon size={13} />}{label}</>
    return to
      ? <Link key={key} to={to} style={style}>{inner}</Link>
      : <button key={key} type="button" onClick={onClick} disabled={saving || disabled} style={style}>{inner}</button>
  }

  const canSettle = !!linkedUtilityInvoice?.id
  const openRecord = () => {
    setPaidOn((invoice.utility_paid_at || new Date().toISOString()).slice(0, 10))
    const expected = expectedUtilityAmount(linkedUtilityInvoice, invoice)
    setAmount(expected > 0 ? String(expected) : '')
    setNote('')
    setBorneBy(null)
    setForm('record')
  }
  const openDate = () => { setPaidOn((invoice.utility_paid_at || '').slice(0, 10)); setForm('date') }
  const close = () => setForm(null)
  const expected = expectedUtilityAmount(linkedUtilityInvoice, invoice)
  const entered = amount === '' ? expected : Number(amount)
  const shortBy = Number.isFinite(entered) ? Math.round((expected - entered) * 100) / 100 : 0
  const isShort = form === 'record' && shortBy > 0.005
  const needsChoice = isShort && borneBy !== BORNE_BY_CUSTOMER && borneBy !== BORNE_BY_COMPANY
  const submitRecord = async () => { if (await onRecordPayment?.({ paidOn, amount, note, borneBy })) close() }
  const submitDate = async () => { if (await onCorrectDate?.(paidOn)) close() }

  const utilityActions = []
  if (!form) {
    if (!utilityPaid && !submitted && onMarkSubmitted) utilityActions.push(btn('sub', 'Mark submitted', { onClick: onMarkSubmitted, Icon: Send, primary: true }))
    if (canSettle && !utilityPaid && onRecordPayment) utilityActions.push(btn('rec', 'Record utility payment', { onClick: openRecord, Icon: CheckCircle, primary: !utilityActions.length }))
    if (canSettle && utilityPaid && onCorrectDate) utilityActions.push(btn('date', 'Correct paid date', { onClick: openDate, Icon: Clock }))
    if (canSettle && utilityPaid && onReopen) utilityActions.push(btn('reopen', 'Reopen', { onClick: onReopen, Icon: RotateCcw }))
    if (!canSettle) utilityActions.push(btn('rec', 'Utility records', { to: '/invoices?type=utility', Icon: ExternalLink }))
  }

  const field = (label, input) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '600', color: theme.textMuted, minWidth: 0 }}>
      {label}
      {input}
    </label>
  )
  const inputStyle = {
    minHeight: '36px', padding: '0 10px', fontSize: '13px', color: theme.text, backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`, borderRadius: '8px', width: '100%', boxSizing: 'border-box',
  }
  // The inline form replaces the action row while it is open.
  const settlementForm = form && (
    <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '12px', fontWeight: '700', color: theme.text }}>
        {form === 'record' ? `Record the payment from ${utilityName || 'the utility'}` : 'Correct the paid date'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: form === 'record' && !isMobile ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: '10px' }}>
        {field('Paid on', <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} style={inputStyle} />)}
        {form === 'record' && field('Amount received', <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={formatCurrency(utilityOwes)} style={inputStyle} />)}
      </div>
      {form === 'record' && field('Reference', <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Check #, ACH ref" style={inputStyle} />)}
      {form === 'record' && isShort && (
        <div style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.warning}`, backgroundColor: 'rgba(234,179,8,0.08)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: theme.text }}>
            {utilityName || 'The utility'} is paying {formatCurrency(shortBy)} less than the {formatCurrency(expected)} claimed. Who covers it?
          </div>
          {[
            [BORNE_BY_CUSTOMER, 'The customer', `Adds ${formatCurrency(shortBy)} to what they owe. Their invoice shows the incentive the utility actually paid.`],
            [BORNE_BY_COMPANY, 'We absorb it', `The customer owes the same. Their invoice shows the ${formatCurrency(shortBy)} as "utility shortfall absorbed".`],
          ].map(([value, title, detail]) => (
            <button
              key={value}
              type="button"
              onClick={() => setBorneBy(value)}
              aria-pressed={borneBy === value}
              style={{
                textAlign: 'left', padding: '8px 10px', minHeight: '44px', borderRadius: '8px', cursor: 'pointer',
                border: `1px solid ${borneBy === value ? theme.accent : theme.border}`,
                backgroundColor: borneBy === value ? theme.accentBg : theme.bgCard,
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '700', color: theme.text }}>{title}</div>
              <div style={{ fontSize: '11px', color: theme.textSecondary }}>{detail}</div>
            </button>
          ))}
        </div>
      )}
      {form === 'record' && !isShort && (
        <div style={{ fontSize: '11px', color: theme.textMuted }}>
          If the utility paid a different amount than {formatCurrency(expected)}, enter what arrived. The record keeps what was received and notes the difference.
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {btn('save', form === 'record' ? 'Save payment' : 'Save date', { onClick: form === 'record' ? submitRecord : submitDate, Icon: CheckCircle, primary: true, disabled: needsChoice })}
        {btn('cancel', 'Cancel', { onClick: close })}
      </div>
    </div>
  )

  const customerLines = showBreakdown
    ? [['In-scope out-of-pocket', formatCurrency(inScope)], ['Out-of-scope add-ons', formatCurrency(addOns)]]
    : []
  if (customerPaid > 0) customerLines.push(['Received', formatCurrency(customerPaid)])

  return (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: theme.textMuted }}>
        Where this invoice goes
      </div>
      <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px', marginBottom: '14px' }}>
        Two parties owe on this project. Each balance is tracked, and ages, on its own.
      </div>

      {!isMobile && (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: '180px', marginBottom: '6px' }} role="img"
          aria-label={`Invoice total ${formatCurrency(total)} splitting into ${formatCurrency(utilityOwes)} owed by ${utilityName || 'the utility'} and ${formatCurrency(customerOwes)} owed by the customer.`}>
          <text x={left - 12} y={H / 2 - 8} textAnchor="end" fontSize="11" fontWeight="700" letterSpacing="0.6" fill={theme.textMuted}>INVOICE TOTAL</text>
          <text x={left - 12} y={H / 2 + 14} textAnchor="end" fontSize="20" fontWeight="700" fill={theme.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total)}</text>
          <rect x={left - 4} y={bandTop} width="4" height={bandH} rx="2" fill={theme.border} />
          <path d={ribbon(uY, uH, uY, uH)} fill={UTIL} opacity={0.85 * dim('util')} style={{ transition: 'opacity 160ms' }}
            onMouseEnter={() => setHot('util')} onMouseLeave={() => setHot(null)} />
          <path d={ribbon(cY, cH, cY, cH)} fill={CUST} opacity={0.85 * dim('cust')} style={{ transition: 'opacity 160ms' }}
            onMouseEnter={() => setHot('cust')} onMouseLeave={() => setHot(null)} />
          <text x={right + 10} y={uY + uH / 2 + 4} fontSize="12" fontWeight="700" fill={UTIL} opacity={dim('util')}>{formatCurrency(utilityOwes)}</text>
          <text x={right + 10} y={cY + cH / 2 + 4} fontSize="12" fontWeight="700" fill={CUST} opacity={dim('cust')}>{formatCurrency(customerOwes)}</text>
        </svg>
      )}

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
        {card('util', {
          color: UTIL, Icon: Zap,
          name: utilityName || 'Utility',
          amount: utilityOwes,
          status: utilityStatus,
          lines: [
            ['Incentive claimed', formatCurrency(Number(invoice.utility_billed) > 0 ? invoice.utility_billed : utilityOwes)],
            utilityPaid
              ? ['Received', `${formatCurrency(utilityOwes)} · ${formatDate(invoice.utility_paid_at)}`]
              : ['Still owed', formatCurrency(utilityBalance)],
            ...(utilityPaid && Number(invoice.utility_shortfall) > 0
              ? [[`Short by ${formatCurrency(invoice.utility_shortfall)}`, invoice.shortfall_borne_by === BORNE_BY_CUSTOMER ? 'billed to customer' : 'absorbed']]
              : []),
          ],
          actions: utilityActions,
          extra: settlementForm,
        })}
        {card('cust', {
          color: CUST, Icon: User,
          name: invoice.customer?.name || 'Customer',
          amount: customerOwes,
          status: customerStatus,
          lines: customerLines,
          actions: [],
        })}
      </div>
    </div>
  )
}
