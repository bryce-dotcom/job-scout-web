import { useState, useEffect, lazy, Suspense } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

const InteractiveProposal = lazy(() => import('../components/proposal/InteractiveProposal'))

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  success: '#4a7c59',
  successBg: 'rgba(74,124,89,0.12)',
  error: '#8b5a5a',
  errorBg: 'rgba(139,90,90,0.12)',
}

async function invokeEdgeFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ---- Main Component ----
export default function CustomerPortal() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const paymentResult = searchParams.get('payment')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  // Approval modal
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approverName, setApproverName] = useState('')
  const [approverEmail, setApproverEmail] = useState('')
  const [approving, setApproving] = useState(false)
  const [approvalSuccess, setApprovalSuccess] = useState(false)

  // Payment
  const [paying, setPaying] = useState(false)

  const fetchDocument = async () => {
    try {
      setLoading(true)
      const result = await invokeEdgeFunction('get-portal-document', { token })
      setData(result)

      // Pre-fill approver info from customer
      if (result.customer) {
        setApproverName(result.customer.name || '')
        setApproverEmail(result.customer.email || '')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchDocument()
  }, [token])

  const handleApprove = async () => {
    setApproving(true)
    try {
      await invokeEdgeFunction('approve-document', {
        token,
        approver_name: approverName,
        approver_email: approverEmail,
      })
      setApprovalSuccess(true)
      setShowApproveModal(false)
      await fetchDocument()
    } catch (err) {
      alert('Approval failed: ' + err.message)
    } finally {
      setApproving(false)
    }
  }

  const handlePay = async (paymentType, amountDollars, provider = 'stripe') => {
    setPaying(true)
    try {
      const result = await invokeEdgeFunction('create-checkout-session', {
        token,
        payment_type: paymentType,
        amount_cents: Math.round(amountDollars * 100),
        provider,
      })
      if (result.checkout_url) {
        window.location.href = result.checkout_url
      }
    } catch (err) {
      alert('Payment setup failed: ' + err.message)
      setPaying(false)
    }
  }

  // After PayPal redirect, capture the payment
  const capturePayPal = async (orderId) => {
    try {
      const result = await invokeEdgeFunction('paypal-webhook', {
        token,
        paypal_order_id: orderId,
      })
      if (result.success) {
        await fetchDocument()
      }
    } catch (err) {
      console.error('PayPal capture failed:', err)
    }
  }

  // Check for PayPal return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('provider') === 'paypal' && params.get('payment') === 'success') {
      // PayPal returns with token= (PayPal order ID) in the URL
      const paypalToken = params.get('token')
      if (paypalToken && token) {
        capturePayPal(paypalToken)
      }
    }
  }, [])

  // ---- Render states ----
  if (loading) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.container}>
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={styles.spinner} />
            <p style={{ color: theme.textMuted, marginTop: '16px', fontSize: '15px' }}>Loading document...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.container}>
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>!</div>
            <h2 style={{ color: theme.text, fontSize: '20px', marginBottom: '8px' }}>
              {error.includes('expired') ? 'Link Expired' : error.includes('revoked') ? 'Link Revoked' : 'Invalid Link'}
            </h2>
            <p style={{ color: theme.textMuted, fontSize: '15px' }}>{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { document_type, document: doc, line_items, company, customer, business_unit, approval, payments, payment_config, google_place_id, invoice_settings } = data
  const isEstimate = document_type === 'estimate'
  const isInvoice = document_type === 'invoice'

  // Branding
  const displayName = business_unit?.name || company?.company_name || 'Company'
  const logoUrl = business_unit?.logo_url || company?.logo_url

  // Estimate state
  const isApproved = isEstimate && (doc.status === 'Approved' || approval || approvalSuccess)
  const depositRequired = isEstimate && doc.deposit_required && parseFloat(doc.deposit_required) > 0
  const depositPaid = isEstimate && doc.deposit_amount && parseFloat(doc.deposit_amount) > 0

  // Invoice state
  const invoiceAmount = isInvoice ? parseFloat(doc.amount) || 0 : 0
  const totalPaid = isInvoice ? (payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) : 0
  const existingCcFee = isInvoice ? (parseFloat(doc.credit_card_fee) || 0) : 0
  const balanceDue = invoiceAmount - totalPaid + existingCcFee
  const isFullyPaid = isInvoice && (doc.payment_status === 'Paid' || balanceDue <= 0)

  // CC fee settings from invoice_settings (passed by edge function)
  const ccFeeEnabled = invoice_settings?.cc_fee_enabled && invoice_settings?.accept_credit_card
  const ccFeePercent = invoice_settings?.cc_fee_percent || 1.9
  const ccFeeAmount = ccFeeEnabled ? Math.round(balanceDue * (ccFeePercent / 100) * 100) / 100 : 0
  const cardTotal = balanceDue + ccFeeAmount
  const preferredPaymentNote = invoice_settings?.preferred_payment_note || ''
  const showPreferredNote = invoice_settings?.show_preferred_payment_note && preferredPaymentNote

  // Line items (estimates)
  const estimateTotal = line_items?.reduce((sum, li) => sum + (parseFloat(li.total) || 0), 0) || 0

  // Interactive proposal mode — lazy-load the full proposal experience
  const presentationMode = isEstimate && doc.settings_overrides?.presentation_mode
  if (presentationMode === 'interactive') {
    return (
      <Suspense fallback={
        <div style={styles.pageWrapper}>
          <div style={styles.container}>
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={styles.spinner} />
              <p style={{ color: theme.textMuted, marginTop: '16px', fontSize: '15px' }}>Loading proposal...</p>
            </div>
          </div>
        </div>
      }>
        <InteractiveProposal
          data={data}
          onApprove={handleApprove}
          approverName={approverName}
          setApproverName={setApproverName}
          approverEmail={approverEmail}
          setApproverEmail={setApproverEmail}
          approvalSuccess={approvalSuccess}
        />
      </Suspense>
    )
  }

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        {/* Payment success banner */}
        {paymentResult === 'success' && (
          <div style={{ ...styles.card, backgroundColor: theme.successBg, borderColor: theme.success, marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
              <span style={{ fontSize: '24px', color: theme.success }}>&#10003;</span>
              <div>
                <p style={{ fontWeight: '600', color: theme.success, margin: 0 }}>Payment Successful</p>
                <p style={{ color: theme.textSecondary, fontSize: '13px', margin: '4px 0 0' }}>Thank you! Your payment has been received.</p>
              </div>
            </div>
          </div>
        )}

        {/* Approval success banner */}
        {approvalSuccess && !paymentResult && (
          <div style={{ ...styles.card, backgroundColor: theme.successBg, borderColor: theme.success, marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
              <span style={{ fontSize: '24px', color: theme.success }}>&#10003;</span>
              <div>
                <p style={{ fontWeight: '600', color: theme.success, margin: 0 }}>Estimate Approved</p>
                <p style={{ color: theme.textSecondary, fontSize: '13px', margin: '4px 0 0' }}>Your approval has been recorded.</p>
              </div>
            </div>
          </div>
        )}

        {/* Header card */}
        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={{ height: '4px', backgroundColor: theme.accent, borderRadius: '12px 12px 0 0' }} />
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {logoUrl && (
              <img src={logoUrl} alt={displayName} style={{ maxHeight: '60px', maxWidth: '200px', objectFit: 'contain', marginBottom: '12px' }} />
            )}
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: theme.text, margin: '0 0 6px' }}>{displayName}</h1>
            <div style={{ display: 'inline-block', backgroundColor: theme.accentBg, padding: '6px 16px', borderRadius: '20px' }}>
              <span style={{ color: theme.accent, fontSize: '14px', fontWeight: '600' }}>
                {isEstimate ? `Estimate ${doc.quote_id || ''}` : `Invoice ${doc.invoice_id || ''}`}
              </span>
            </div>

            {/* Status badge */}
            {isEstimate && isApproved && (
              <div style={{ marginTop: '12px' }}>
                <span style={{ ...styles.badge, backgroundColor: theme.successBg, color: theme.success }}>Approved</span>
              </div>
            )}
            {isInvoice && isFullyPaid && (
              <div style={{ marginTop: '12px' }}>
                <span style={{ ...styles.badge, backgroundColor: theme.successBg, color: theme.success }}>Paid</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer info */}
        {customer && (
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                {isEstimate ? 'Prepared For' : 'Billed To'}
              </h3>
              <p style={{ fontWeight: '600', color: theme.text, margin: '0 0 4px', fontSize: '15px' }}>
                {customer.business_name || customer.name}
              </p>
              {customer.business_name && customer.name && (
                <p style={{ color: theme.textSecondary, margin: '0 0 4px', fontSize: '14px' }}>{customer.name}</p>
              )}
              {customer.address && <p style={{ color: theme.textSecondary, margin: '0 0 4px', fontSize: '14px' }}>{customer.address}</p>}
              {customer.email && <p style={{ color: theme.textSecondary, margin: '0 0 2px', fontSize: '14px' }}>{customer.email}</p>}
              {customer.phone && <p style={{ color: theme.textSecondary, margin: 0, fontSize: '14px' }}>{customer.phone}</p>}
            </div>
          </div>
        )}

        {/* Estimate details */}
        {isEstimate && doc.estimate_message && (
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={styles.sectionTitle}>Message</h3>
              <p style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>{doc.estimate_message}</p>
            </div>
          </div>
        )}

        {/* Line items */}
        {isEstimate && line_items && line_items.length > 0 && (
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={styles.sectionTitle}>Line Items</h3>
              <div style={{ borderTop: `1px solid ${theme.border}` }}>
                {line_items.map((li, i) => (
                  <div key={li.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: '500', color: theme.text, margin: '0 0 2px', fontSize: '14px' }}>
                        {li.item_name || li.item?.name || li.description || 'Item'}
                      </p>
                      {li.description && li.item_name && (
                        <p style={{ color: theme.textMuted, fontSize: '13px', margin: 0 }}>{li.description}</p>
                      )}
                      <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0' }}>
                        {li.quantity || 1} x {formatCurrency(li.price)}
                      </p>
                    </div>
                    <p style={{ fontWeight: '600', color: theme.text, margin: 0, fontSize: '14px', whiteSpace: 'nowrap', marginLeft: '16px' }}>
                      {formatCurrency(li.total)}
                    </p>
                  </div>
                ))}
              </div>
              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0 0', marginTop: '4px' }}>
                <p style={{ fontWeight: '700', color: theme.text, margin: 0, fontSize: '16px' }}>Total</p>
                <p style={{ fontWeight: '700', color: theme.accent, margin: 0, fontSize: '16px' }}>{formatCurrency(doc.total || estimateTotal)}</p>
              </div>
              {doc.summary && (
                <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '12px', lineHeight: '1.5' }}>{doc.summary}</p>
              )}
            </div>
          </div>
        )}

        {/* Invoice details */}
        {isInvoice && (
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={styles.sectionTitle}>Invoice Details</h3>
              {doc.job_description && (
                <p style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: '1.6', margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>{doc.job_description}</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <p style={{ color: theme.textMuted, fontSize: '12px', margin: '0 0 2px' }}>Amount</p>
                  <p style={{ fontWeight: '600', color: theme.text, fontSize: '16px', margin: 0 }}>{formatCurrency(invoiceAmount)}</p>
                </div>
                <div>
                  <p style={{ color: theme.textMuted, fontSize: '12px', margin: '0 0 2px' }}>Total Paid</p>
                  <p style={{ fontWeight: '600', color: theme.success, fontSize: '16px', margin: 0 }}>{formatCurrency(totalPaid)}</p>
                </div>
                {!isFullyPaid && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <p style={{ color: theme.textMuted, fontSize: '12px', margin: '0 0 2px' }}>Balance Due</p>
                    <p style={{ fontWeight: '700', color: theme.error, fontSize: '20px', margin: 0 }}>{formatCurrency(balanceDue)}</p>
                  </div>
                )}
              </div>
              {doc.discount_applied > 0 && (
                <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '8px' }}>Discount applied: {formatCurrency(doc.discount_applied)}</p>
              )}
              {existingCcFee > 0 && (
                <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '4px' }}>CC processing fee: {formatCurrency(existingCcFee)}</p>
              )}
            </div>
          </div>
        )}

        {/* Estimate date info */}
        {isEstimate && (doc.service_date || doc.expiration_date) && (
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ padding: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {doc.service_date && (
                <div>
                  <p style={{ color: theme.textMuted, fontSize: '12px', margin: '0 0 2px' }}>Service Date</p>
                  <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px', margin: 0 }}>{formatDate(doc.service_date)}</p>
                </div>
              )}
              {doc.expiration_date && (
                <div>
                  <p style={{ color: theme.textMuted, fontSize: '12px', margin: '0 0 2px' }}>Valid Until</p>
                  <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px', margin: 0 }}>{formatDate(doc.expiration_date)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {/* Estimate: Approve button */}
          {isEstimate && !isApproved && (
            <button
              onClick={() => setShowApproveModal(true)}
              style={styles.primaryButton}
            >
              I Approve This Estimate
            </button>
          )}

          {/* Payment section — shown for unpaid invoices or approved estimates with deposit */}
          {/* Payment section — only shown when payment_config exists and has at least one method */}
          {((isEstimate && isApproved && depositRequired && !depositPaid) ||
            (isInvoice && !isFullyPaid && balanceDue > 0)) && payment_config && (
            (() => {
              const payAmt = isInvoice ? balanceDue : parseFloat(doc.deposit_required)
              const payType = isInvoice ? 'invoice_payment' : 'estimate_deposit'
              const hasAnyMethod = payment_config.stripe_enabled || payment_config.paypal_enabled
                || payment_config.bank_enabled || payment_config.wisetack_enabled
                || payment_config.greensky_enabled || payment_config.hearth_enabled
                || payment_config.service_finance_enabled
              const hasFinancing = payment_config.wisetack_enabled || payment_config.greensky_enabled
                || payment_config.hearth_enabled || payment_config.service_finance_enabled

              if (!hasAnyMethod) return null

              return (
                <div style={{ ...styles.card }}>
                  <div style={{ padding: '20px' }}>
                    <h3 style={styles.sectionTitle}>Payment Options</h3>

                    {/* Preferred payment note */}
                    {showPreferredNote && (
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: 'rgba(74,124,89,0.08)',
                        border: '1px solid rgba(74,124,89,0.25)',
                        borderRadius: '10px',
                        marginBottom: '14px',
                        fontSize: '13px',
                        color: '#4a7c59',
                        lineHeight: '1.5'
                      }}>
                        {preferredPaymentNote.replace('{cc_fee_percent}', ccFeePercent)}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Bank transfer — promoted first (no fee) */}
                      {payment_config.bank_enabled && (
                        <div style={{
                          padding: '16px',
                          backgroundColor: theme.accentBg,
                          borderRadius: '10px',
                          border: `1px solid ${theme.border}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <p style={{ fontWeight: '600', color: theme.text, fontSize: '14px', margin: 0 }}>
                              Bank Transfer / ACH
                            </p>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: 'rgba(74,124,89,0.12)', color: '#4a7c59' }}>No Fee</span>
                          </div>
                          <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.7' }}>
                            <p style={{ margin: '0 0 4px' }}><strong>Bank:</strong> {payment_config.bank_name}</p>
                            {payment_config.bank_account_name && (
                              <p style={{ margin: '0 0 4px' }}><strong>Account Name:</strong> {payment_config.bank_account_name}</p>
                            )}
                            {payment_config.bank_routing && (
                              <p style={{ margin: '0 0 4px' }}><strong>Routing #:</strong> {payment_config.bank_routing}</p>
                            )}
                            {payment_config.bank_account && (
                              <p style={{ margin: '0 0 4px' }}><strong>Account #:</strong> {payment_config.bank_account}</p>
                            )}
                            <p style={{ margin: '0 0 4px' }}>
                              <strong>Amount:</strong> {formatCurrency(payAmt)}
                            </p>
                            <p style={{ margin: '0 0 4px' }}>
                              <strong>Reference:</strong> {isInvoice ? (doc.invoice_id || doc.id) : (doc.quote_id || doc.id)}
                            </p>
                          </div>
                          {payment_config.bank_instructions && (
                            <p style={{ fontSize: '12px', color: theme.textMuted, margin: '10px 0 0', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                              {payment_config.bank_instructions}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Stripe — card payments (with CC fee) */}
                      {payment_config.stripe_enabled && (
                        <div>
                          <button
                            onClick={() => handlePay(payType, ccFeeEnabled ? (payAmt + Math.round(payAmt * (ccFeePercent / 100) * 100) / 100) : payAmt, 'stripe')}
                            disabled={paying}
                            style={styles.primaryButton}
                          >
                            {paying ? 'Setting up payment...' : ccFeeEnabled
                              ? `Pay with Card — ${formatCurrency(payAmt + Math.round(payAmt * (ccFeePercent / 100) * 100) / 100)}`
                              : `Pay with Card (${formatCurrency(payAmt)})`}
                          </button>
                          {ccFeeEnabled && (
                            <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0', textAlign: 'center' }}>
                              Includes {ccFeePercent}% processing fee ({formatCurrency(Math.round(payAmt * (ccFeePercent / 100) * 100) / 100)})
                            </p>
                          )}
                        </div>
                      )}

                      {/* PayPal */}
                      {payment_config.paypal_enabled && (
                        <button
                          onClick={() => handlePay(payType, payAmt, 'paypal')}
                          disabled={paying}
                          style={{ ...styles.primaryButton, backgroundColor: '#0070ba' }}
                        >
                          {paying ? 'Connecting to PayPal...' : 'Pay with PayPal'}
                        </button>
                      )}

                      {/* Financing / BNPL section */}
                      {hasFinancing && (
                        <>
                          <div style={{ borderTop: `1px solid ${theme.border}`, margin: '6px 0 2px', paddingTop: '12px' }}>
                            <p style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>
                              Financing Options
                            </p>
                            <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 10px', lineHeight: '1.5' }}>
                              Apply for monthly payment plans. Quick application, no obligation.
                            </p>
                          </div>

                          {payment_config.wisetack_enabled && (
                            <button
                              onClick={() => handlePay(payType, payAmt, 'wisetack')}
                              disabled={paying}
                              style={{ ...styles.primaryButton, backgroundColor: '#1a73e8' }}
                            >
                              {paying ? 'Setting up application...' : `Apply for Financing with Wisetack`}
                            </button>
                          )}

                          {payment_config.greensky_enabled && (
                            <button
                              onClick={() => handlePay(payType, payAmt, 'greensky')}
                              disabled={paying}
                              style={{ ...styles.primaryButton, backgroundColor: '#00875a' }}
                            >
                              {paying ? 'Setting up application...' : `Apply for Financing with GreenSky`}
                            </button>
                          )}

                          {payment_config.hearth_enabled && (
                            <button
                              onClick={() => handlePay(payType, payAmt, 'hearth')}
                              disabled={paying}
                              style={{ ...styles.primaryButton, backgroundColor: '#ff6b35' }}
                            >
                              {paying ? 'Setting up application...' : `Check Financing Options with Hearth`}
                            </button>
                          )}

                          {payment_config.service_finance_enabled && (
                            <button
                              onClick={() => handlePay(payType, payAmt, 'service_finance')}
                              disabled={paying}
                              style={{ ...styles.primaryButton, backgroundColor: '#2563eb' }}
                            >
                              {paying ? 'Setting up application...' : `Apply with Service Finance`}
                            </button>
                          )}

                          <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0', lineHeight: '1.4' }}>
                            Financing is subject to credit approval. You'll be redirected to the provider's secure application.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()
          )}
        </div>

        {/* Google Review card */}
        {google_place_id && (isFullyPaid || isApproved || paymentResult === 'success') && (
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#9733;</div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: '0 0 8px' }}>
                How was your experience?
              </h3>
              <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 16px', lineHeight: '1.5' }}>
                We'd love to hear from you! Leave us a review on Google.
              </p>
              <a
                href={`https://search.google.com/local/writereview?placeid=${google_place_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '12px 28px',
                  backgroundColor: '#4285f4',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: '600',
                  borderRadius: '8px',
                }}
              >
                Leave a Google Review
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
          <p style={{ color: theme.textMuted, fontSize: '12px', margin: 0 }}>
            Powered by Job Scout
          </p>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={{ padding: '24px 24px 0' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: '0 0 4px' }}>Approve Estimate</h2>
              <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 20px' }}>
                Confirm your information to approve this estimate.
              </p>
            </div>

            <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={styles.label}>Your Name</label>
                <input
                  type="text"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  placeholder="Full name"
                  style={styles.input}
                />
              </div>
              <div>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  value={approverEmail}
                  onChange={(e) => setApproverEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={styles.input}
                />
              </div>

              <div style={{
                backgroundColor: theme.accentBg,
                padding: '12px 16px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
              }}>
                <p style={{ color: theme.textSecondary, fontSize: '12px', lineHeight: '1.5', margin: 0 }}>
                  By clicking "Approve," your name, email address, IP address, and timestamp will be recorded
                  as your electronic signature in accordance with the ESIGN Act (15 U.S.C. 7001 et seq.).
                </p>
              </div>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApproveModal(false)}
                style={styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approving || !approverName}
                style={{
                  ...styles.primaryButton,
                  opacity: approving || !approverName ? 0.6 : 1,
                  width: 'auto',
                  padding: '12px 28px',
                }}
              >
                {approving ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Styles ----
const styles = {
  pageWrapper: {
    minHeight: '100vh',
    backgroundColor: theme.bg,
    padding: '16px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
  },
  card: {
    backgroundColor: theme.bgCard,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
  },
  badge: {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
  },
  primaryButton: {
    width: '100%',
    padding: '16px 24px',
    backgroundColor: theme.accent,
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '12px 24px',
    backgroundColor: theme.bg,
    color: theme.textSecondary,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    zIndex: 50,
  },
  modal: {
    backgroundColor: theme.bgCard,
    borderRadius: '16px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
    width: '100%',
    maxWidth: '440px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    outline: 'none',
    boxSizing: 'border-box',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: `3px solid ${theme.border}`,
    borderTopColor: theme.accent,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto',
  },
}

// Inject keyframe animation for spinner
if (typeof document !== 'undefined') {
  const styleId = 'portal-spinner-style'
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style')
    styleEl.id = styleId
    styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg) } }'
    document.head.appendChild(styleEl)
  }
}
