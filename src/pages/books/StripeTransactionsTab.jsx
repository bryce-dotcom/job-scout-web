// Extracted from Books.jsx (2026-09-17) — self-contained; Books renders it.
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Search, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PAYMENT_METHODS } from '../../lib/schema'
import HelpBadge from '../../components/HelpBadge'
import { localDateStr } from '../../lib/localDate'

// ════════════════════ Stripe Transactions Tab ════════════════════
// Itemized list of Stripe charges so Tracy can verify individual
// payments (e.g., Bart Strong's May 8 ACH). Searchable + CSV download.
export default function StripeTransactionsTab({ companyId, theme, isMobile }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [stripeConfigured, setStripeConfigured] = useState(null) // null = unknown, true/false once probed
  const [error, setError] = useState(null)
  const [days, setDays] = useState(90)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | succeeded | failed | refunded | unmatched

  // Recent manual payments (any source, not just Stripe). Shown as a
  // fallback when no processor is configured, and as a bonus list under
  // the Stripe table when configured.
  const [manualPayments, setManualPayments] = useState([])
  const [manualLoading, setManualLoading] = useState(false)
  const [methodFilter, setMethodFilter] = useState('all') // 'all' | a payments.method value such as 'Venmo'

  const loadManualPayments = async () => {
    setManualLoading(true)
    const { data: pays } = await supabase
      .from('payments')
      .select('id, date, amount, method, status, notes, source_transaction_id, invoice_id, invoice:invoices(invoice_id), customer_id, customer:customers(name)')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
      .limit(50)
    setManualPayments(pays || [])
    setManualLoading(false)
  }

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const { data: r, error: e } = await supabase.functions.invoke('stripe-transactions-list', {
        body: { company_id: companyId, days, limit: 2000 },
      })
      if (e) {
        setError(e.message || 'Failed to load')
        setStripeConfigured(null)
      } else if (r?.error) {
        setError(r.error)
        setStripeConfigured(null)
      } else if (r?.configured === false) {
        // No processor configured — switch to the manual-entry experience
        // instead of showing a hard error.
        setStripeConfigured(false)
        setData(null)
        await loadManualPayments()
      } else {
        setData(r)
        setStripeConfigured(true)
        // Venmo / cash / check payments never touch Stripe; keep them one
        // click away even when Stripe is connected.
        await loadManualPayments()
      }
    } catch (e) {
      setError(e.message || 'Unexpected error')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!companyId) return
    // Kick the fetch off a tick later so the effect itself sets no state.
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, days])

  const filtered = (data?.transactions || []).filter(t => {
    if (statusFilter === 'succeeded' && t.status !== 'succeeded') return false
    if (statusFilter === 'failed' && t.status !== 'failed') return false
    if (statusFilter === 'refunded' && !t.refunded) return false
    if (statusFilter === 'unmatched' && t.matched_invoice_id) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (t.customer_name || '').toLowerCase().includes(q) ||
           (t.customer_email || '').toLowerCase().includes(q) ||
           (t.matched_invoice_number || '').toLowerCase().includes(q) ||
           (t.description || '').toLowerCase().includes(q) ||
           (t.id || '').toLowerCase().includes(q)
  })

  // Method filter for the recorded-payments list. Offer every method the app
  // knows plus anything already in the data (imports arrive as free text).
  const methodOptions = Array.from(new Set([...PAYMENT_METHODS, ...manualPayments.map(p => p.method).filter(Boolean)]))
  const visibleManual = manualPayments.filter(p => methodFilter === 'all' || (p.method || '').toLowerCase() === methodFilter.toLowerCase())
  const unlinkedCount = visibleManual.filter(p => !p.source_transaction_id).length

  const downloadCsv = () => {
    const headers = ['Date', 'Customer', 'Email', 'Amount', 'Status', 'Method', 'Refunded', 'Matched Invoice', 'Job ID', 'Stripe ID', 'Description']
    const rows = filtered.map(t => [
      new Date(t.created_iso).toLocaleString(),
      t.customer_name || '',
      t.customer_email || '',
      t.amount?.toFixed(2) || '0.00',
      t.status || '',
      t.payment_method || '',
      t.refund_amount > 0 ? t.refund_amount.toFixed(2) : '',
      t.matched_invoice_number || '',
      t.matched_job_id || '',
      t.id,
      (t.description || '').replace(/"/g, '""'),
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stripe-transactions-${localDateStr(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Intro card — processor-agnostic language so the page makes sense
          whether the tenant uses Stripe, Square, Helcim, or manual entry. */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: 'rgba(90, 99, 73, 0.06)',
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <CreditCard size={18} style={{ color: theme.accent }} />
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: theme.text }}>
            Verify customer payments
          </h2>
        </div>
        <p style={{ margin: '0 0 6px', fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>
          {stripeConfigured === true ? (
            <>
              Every credit card / ACH charge <strong>Stripe</strong> has processed for your account. Search by customer name to
              confirm a specific payment landed. Use the <strong>Unmatched</strong> filter to find Stripe charges that never got
              recorded as a payment in JobScout — that's the most common source of "I paid but it still shows a balance" mystery.
            </>
          ) : stripeConfigured === false ? (
            <>
              No payment processor is connected yet. Connect <strong>Stripe</strong> for automatic syncing of card / ACH charges,
              or log payments manually from each invoice if you use a different processor (Square, Helcim, PayPal, etc.).
              Recent payments recorded in JobScout — by any means — show up below.
            </>
          ) : (
            <>Loading payment data…</>
          )}
        </p>
        {stripeConfigured === true && (
          <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted, lineHeight: 1.5 }}>
            Download the CSV to email the report to anyone — your accountant, the customer, or the team.
          </p>
        )}
      </div>

      {/* No-processor empty state — shows when Stripe (or any) isn't
          configured. Two CTAs: connect Stripe, or accept manual entry. */}
      {stripeConfigured === false && (
        <>
          <div style={{
            padding: '24px',
            border: `1px dashed ${theme.border}`,
            borderRadius: '12px',
            backgroundColor: theme.bgCard,
            textAlign: 'center',
          }}>
            <div style={{ marginBottom: '12px' }}>
              <CreditCard size={28} style={{ color: theme.textMuted, opacity: 0.6 }} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: '700', color: theme.text }}>
              No payment processor connected
            </h3>
            <p style={{ margin: '0 auto 14px', fontSize: '13px', color: theme.textSecondary, maxWidth: '480px', lineHeight: 1.5 }}>
              Stripe is the only auto-synced processor today. If you use Square, Helcim, PayPal, or another processor,
              <strong> log each payment manually</strong> from the invoice page. Venmo, Cash App and Zelle are set up under
              <strong> Settings → My Money</strong> (your handle goes on invoices, the portal and FieldScout); record those
              payments on the invoice too and they show up here. We're tracking demand for direct integrations
              with other processors — let us know what you use.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate('/settings?tab=mymoney')}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Open Settings → My Money to paste your Stripe secret key. After that, every Stripe charge auto-syncs here within seconds of the customer paying."
              >
                Connect Stripe
              </button>
              <button
                onClick={() => navigate('/invoices')}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.bgCard,
                  color: theme.text,
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Open any invoice and click 'Record Payment' to log a payment received outside JobScout (cash, check, Square, Helcim, etc.)."
              >
                Log a payment manually
              </button>
            </div>
          </div>

        </>
      )}

      {/* The rest of the Stripe-specific view only renders when configured. */}
      {stripeConfigured === false ? null : (
      <>


      {/* Header / controls */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px', alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: theme.text }}>Stripe Transactions</h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: theme.textMuted }}>
            Itemized list of charges from Stripe. Use to verify a specific payment landed.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px' }}>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last 365 days</option>
        </select>
        <button onClick={load} disabled={loading}
          style={{ padding: '8px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px', cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button onClick={downloadCsv} disabled={!filtered.length}
          style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', backgroundColor: theme.accent, color: '#fff', fontSize: '14px', fontWeight: '600', cursor: filtered.length ? 'pointer' : 'not-allowed', opacity: filtered.length ? 1 : 0.5 }}>
          Download CSV ({filtered.length})
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: `1px solid rgba(239, 68, 68, 0.3)`, color: '#dc2626', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Totals */}
      {data?.totals && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Charges', value: data.totals.count },
            { label: 'Gross Received', value: fmt(data.totals.gross) },
            { label: 'Refunded', value: fmt(data.totals.refunded) },
            { label: 'Net', value: fmt(data.totals.net) },
          ].map(s => (
            <div key={s.label} style={{ padding: '12px 16px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', minWidth: '120px' }}>
              <p style={{ margin: 0, fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: '700', color: theme.text }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search + status filter */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search customer, email, invoice, description…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '240px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px' }}>
          <option value="all">All statuses</option>
          <option value="succeeded">Succeeded only</option>
          <option value="failed">Failed only</option>
          <option value="refunded">Refunded only</option>
          <option value="unmatched">Unmatched (no DB record)</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
                {['Date', 'Customer', 'Amount', 'Status', 'Method', 'Matched Invoice'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: theme.textSecondary, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No transactions match.</td></tr>
              )}
              {!loading && filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '10px 14px', color: theme.text }}>{new Date(t.created_iso).toLocaleString()}</td>
                  <td style={{ padding: '10px 14px', color: theme.text }}>
                    <div style={{ fontWeight: '500' }}>{t.customer_name || '—'}</div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>{t.customer_email || ''}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: theme.text, fontWeight: '500', whiteSpace: 'nowrap' }}>
                    {fmt(t.amount)}
                    {t.refund_amount > 0 && (
                      <div style={{ fontSize: '11px', color: '#dc2626' }}>−{fmt(t.refund_amount)} refunded</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                      backgroundColor: t.status === 'succeeded' ? 'rgba(22, 163, 74, 0.12)' : t.status === 'failed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(156, 163, 175, 0.12)',
                      color: t.status === 'succeeded' ? '#16a34a' : t.status === 'failed' ? '#dc2626' : theme.textMuted,
                    }}>{t.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: theme.textSecondary, textTransform: 'capitalize' }}>{t.payment_method || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {t.matched_invoice_number ? (
                      <a href={`/invoices/${t.matched_invoice_id}`} style={{ color: theme.accent, textDecoration: 'none', fontWeight: '500' }}>
                        {t.matched_invoice_number}
                      </a>
                    ) : (
                      <span style={{ color: theme.textMuted, fontSize: '12px', fontStyle: 'italic' }}>unmatched</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
      {/* Recorded payments, any source — rendered whether or not Stripe is
          connected, so Venmo / cash / check payments logged from invoices
          and FieldScout are always one click away. */}
      {stripeConfigured !== null && (
        <>
          {/* Recent manual / external payments */}
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: theme.text }}>Recent payments (any source)</h3>
              <HelpBadge text="Every payment record in your books, regardless of how it was received. Includes Stripe (if connected), manual entries from invoices and FieldScout — Venmo, cash, check — and bank-deposit matches from the Money tab. 'Deposit' shows whether the money has been matched to a bank transaction yet." />
            </div>
            {manualPayments.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '13px' }}>
                  <option value="all">All methods</option>
                  {methodOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>
                  {visibleManual.length} payment{visibleManual.length === 1 ? '' : 's'} · {fmt(visibleManual.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0))}
                  {unlinkedCount > 0 && <> · {unlinkedCount} not yet matched to a bank deposit</>}
                </span>
              </div>
            )}
            {manualLoading ? (
              <p style={{ color: theme.textMuted, fontSize: '13px', padding: '20px', textAlign: 'center' }}>Loading…</p>
            ) : manualPayments.length === 0 ? (
              <p style={{ color: theme.textMuted, fontSize: '13px', padding: '20px', textAlign: 'center' }}>
                No payments recorded yet. Once you log one (from an invoice) or connect Stripe, payments will appear here.
              </p>
            ) : visibleManual.length === 0 ? (
              <p style={{ color: theme.textMuted, fontSize: '13px', padding: '20px', textAlign: 'center' }}>
                No {methodFilter} payments among the last 50 recorded. Log one from the invoice or FieldScout and it will show here.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                      {['Date', 'Customer', 'Invoice', 'Amount', 'Method', 'Deposit', 'Notes'].map(h => (
                        <th key={h} style={{ padding: '8px 8px 8px 0', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleManual.map(p => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '10px 8px 10px 0', color: theme.text, whiteSpace: 'nowrap' }}>{p.date}</td>
                        <td style={{ padding: '10px 8px', color: theme.text }}>{p.customer?.name || '—'}</td>
                        <td style={{ padding: '10px 8px' }}>
                          {p.invoice?.invoice_id ? (
                            <a href={`/invoices/${p.invoice_id}`} style={{ color: theme.accent, textDecoration: 'none', fontWeight: 500 }}>{p.invoice.invoice_id}</a>
                          ) : <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>unlinked</span>}
                        </td>
                        <td style={{ padding: '10px 8px', color: theme.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(p.amount)}</td>
                        <td style={{ padding: '10px 8px', color: theme.textSecondary }}>{p.method || '—'}</td>
                        <td style={{ padding: '10px 8px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {p.source_transaction_id
                            ? <span style={{ color: '#16a34a', fontWeight: 600 }}>matched</span>
                            : <span style={{ color: theme.textMuted }}>not yet</span>}
                        </td>
                        <td style={{ padding: '10px 8px', color: theme.textMuted, fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
