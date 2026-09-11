// Rebates — the utility side of the Invoices page.
//
// There is one invoice per rebate job now. This view lists the invoices that
// carry a utility debt and shows, per invoice, what the utility owes and
// where that stands, next to what the customer owes. Clicking one opens the
// invoice, where both debts are managed.
//
// Utility records that are not linked to an invoice — legacy rows, or ones
// the migration refused — are listed separately at the bottom. They still
// count in receivables (arHelpers.totalUtilityAR) and still open their own
// page, because that is the only place they can be settled until linked.
//
// The figures are the shared helpers' figures: the same totals the Dashboard
// and Books show.

import { Zap, FileText, CheckCircle, Clock, Send, Pencil, Trash2, Link2Off } from 'lucide-react'
import EntityCard from './EntityCard'
import { invoiceUtilityBalance, invoiceBalance, totalUtilityAR } from '../lib/arHelpers'
import { invoiceUtilityName } from '../lib/invoiceSections'

const UTIL = '#14b8a6'
const CUST = '#3b82f6'

export default function RebatesList({
  invoices = [], utilityInvoices = [], utilityProviders = [], payments = [],
  searchTerm = '', statusFilter = 'all',
  onOpenInvoice, onOpenRecord, onEditRecord, onDeleteRecord,
  theme, isMobile = false, formatCurrency, formatDate,
}) {
  const q = searchTerm.trim().toLowerCase()
  const matches = (...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q))

  const carriers = (invoices || []).filter((i) => i.utility_owes != null)
  const carrierIds = new Set(carriers.map((i) => i.id))
  // The linked utility row, by invoice. It is the fallback for the utility's
  // name: the store only loads utility_providers for companies running the
  // lighting agent, and a rebate invoice must name its utility regardless.
  const rowByInvoice = new Map((utilityInvoices || []).filter((u) => u.invoice_id != null).map((u) => [u.invoice_id, u]))
  const nameOf = (inv) => invoiceUtilityName(inv, utilityProviders, rowByInvoice.get(inv.id) || null)
  const unlinked = (utilityInvoices || []).filter((u) => !(u.invoice_id != null && carrierIds.has(u.invoice_id)))

  // Status of the utility's side of one invoice.
  const utilityState = (inv) => {
    if (inv.utility_paid_at) return { key: 'paid', tone: theme.success, Icon: CheckCircle, text: `Paid ${formatDate(inv.utility_paid_at)}` }
    if (inv.payment_status === 'Void' || inv.payment_status === 'Cancelled') return { key: 'void', tone: theme.textMuted, Icon: CheckCircle, text: 'Void' }
    if (inv.utility_submitted_at) return { key: 'awaiting', tone: theme.warning, Icon: Clock, text: `Awaiting · submitted ${formatDate(inv.utility_submitted_at)}` }
    return { key: 'unsubmitted', tone: theme.textMuted, Icon: Send, text: 'Not yet submitted' }
  }

  // The page's status filter uses the invoice vocabulary (Pending / Open /
  // Paid / Overdue / Cancelled). Map it onto the utility's side.
  const sf = String(statusFilter || 'all').toLowerCase()
  const filteredCarriers = carriers
    .filter((inv) => {
      const st = utilityState(inv).key
      if (sf === 'paid') return st === 'paid'
      if (sf === 'pending' || sf === 'open' || sf === 'overdue') return st === 'awaiting' || st === 'unsubmitted'
      if (sf === 'cancelled') return st === 'void'
      return true
    })
    .filter((inv) => matches(inv.invoice_id, inv.customer?.name, inv.customer?.business_name, inv.job?.job_title, nameOf(inv)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const filteredUnlinked = unlinked
    .filter((u) => matches(`UTL-${u.id}`, u.customer_name, u.utility_name))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // Stats — the same rule receivables use, plus what has been collected.
  const owed = totalUtilityAR(utilityInvoices, invoices)
  const collected = carriers.filter((i) => i.utility_paid_at).reduce((s, i) => s + (Number(i.utility_owes) || 0), 0)
    + unlinked.filter((u) => u.payment_status === 'Paid').reduce((s, u) => s + (Number(u.amount || u.incentive_amount) || 0), 0)
  const unsubmitted = carriers.filter((i) => utilityState(i).key === 'unsubmitted').length

  const stat = (label, value, sub, color) => (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px' }}>
      <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '24px', fontWeight: '600', color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ fontSize: '12px', color: theme.textMuted }}>{sub}</p>}
    </div>
  )

  const empty = (text) => (
    <div style={{ textAlign: 'center', padding: '48px 24px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
      <Zap size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
      <p style={{ color: theme.textSecondary, fontSize: '15px' }}>{text}</p>
    </div>
  )

  const grid = { display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }
  const pill = (bg, color, text) => (
    <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: bg, color }}>{text}</span>
  )

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {stat('Utilities owe', formatCurrency(owed), `${carriers.filter((i) => invoiceUtilityBalance(i) > 0).length + unlinked.filter((u) => u.payment_status !== 'Paid' && u.payment_status !== 'Void').length} open`, '#c28b38')}
        {stat('Collected', formatCurrency(collected), 'incentives received', theme.success)}
        {stat('Not yet submitted', String(unsubmitted), 'the clock has not started', unsubmitted ? theme.warning : theme.textMuted)}
      </div>

      {filteredCarriers.length === 0 && filteredUnlinked.length === 0 ? (
        empty(q || sf !== 'all' ? 'No rebates match your search.' : 'No rebate invoices yet. Create the utility incentive from a job and it shows up here.')
      ) : (
        <div style={grid}>
          {filteredCarriers.map((inv) => {
            const st = utilityState(inv)
            const utilityName = nameOf(inv) || 'Utility'
            const customerBal = invoiceBalance(inv, payments)
            return (
              <EntityCard
                key={`inv-${inv.id}`}
                name={inv.customer?.name}
                businessName={inv.customer?.business_name}
                onClick={() => onOpenInvoice?.(inv)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', backgroundColor: 'rgba(20,184,166,0.12)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Zap size={22} style={{ color: UTIL }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '2px' }}>{inv.customer?.name || 'No customer'}</h3>
                      <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '500' }}>{inv.invoice_id || `Invoice #${inv.id}`}</p>
                    </div>
                  </div>
                  {pill('rgba(20,184,166,0.12)', UTIL, 'Rebate')}
                </div>

                {(inv.job?.job_title || inv.job_description) && (
                  <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inv.job?.job_title || inv.job_description}
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', color: UTIL }}>{utilityName} owes</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: st.tone, fontWeight: '600' }}>
                        <st.Icon size={12} color={st.tone} /><span>{st.text}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: theme.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatCurrency(inv.utility_paid_at ? inv.utility_owes : invoiceUtilityBalance(inv))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', color: CUST }}>
                      Customer {customerBal <= 0.01 ? 'paid' : 'owes'}
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(customerBal <= 0.01 ? Number(inv.customer_owes) || 0 : customerBal)}
                    </span>
                  </div>
                </div>
              </EntityCard>
            )
          })}
        </div>
      )}

      {filteredUnlinked.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Link2Off size={14} color={theme.textMuted} />
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Utility records not linked to an invoice</h3>
          </div>
          <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
            These still count in what utilities owe. Link one to its customer invoice and it moves into the list above.
          </p>
          <div style={grid}>
            {filteredUnlinked.map((u) => {
              const paid = u.payment_status === 'Paid'
              return (
                <EntityCard key={`utl-${u.id}`} name={u.customer_name} businessName={u.utility_name} onClick={() => onOpenRecord?.(u)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '44px', height: '44px', backgroundColor: 'rgba(20,184,166,0.12)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={22} style={{ color: UTIL }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '2px' }}>{u.customer_name || '-'}</h3>
                        <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '500' }}>UTL-{u.id}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                      {onEditRecord && (
                        <button type="button" onClick={() => onEditRecord(u)} title="Edit" style={{ minWidth: '36px', minHeight: '36px', border: 'none', background: 'transparent', color: theme.textMuted, cursor: 'pointer' }}><Pencil size={16} /></button>
                      )}
                      {onDeleteRecord && (
                        <button type="button" onClick={() => onDeleteRecord(u)} title="Delete" style={{ minWidth: '36px', minHeight: '36px', border: 'none', background: 'transparent', color: theme.error || '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(u.amount || u.incentive_amount)}</span>
                    {pill(paid ? 'rgba(34,197,94,0.12)' : 'rgba(194,139,56,0.12)', paid ? theme.success : '#c28b38', paid ? `Paid ${formatDate(u.paid_at)}` : (u.payment_status || 'Pending'))}
                  </div>
                </EntityCard>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
