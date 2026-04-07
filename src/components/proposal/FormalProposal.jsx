import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SignatureModal from './SignatureModal'
import { buildDefaultTerms, sha256Hex } from './formalProposalDefaults'

/**
 * Formal / legal proposal view rendered inside CustomerPortal.
 *
 * Props:
 * - data: the payload from get-portal-document
 *     { document, line_items, company, customer, business_unit, approval, payment_config }
 * - approverName / setApproverName / approverEmail / setApproverEmail
 * - approvalSuccess
 * - onSubmitSignedApproval: async ({ signature, approver, legalTerms, legalTermsHash, signedPdfBase64 }) => void
 *     Called when the customer clicks "Sign & Submit". Parent performs the
 *     approve-document edge function call so payment/Stripe flow can be reused.
 * - onPay: async (paymentType, amountDollars) => void (optional)
 */
export default function FormalProposal({
  data,
  approverName,
  setApproverName,
  approverEmail,
  setApproverEmail,
  approvalSuccess,
  onSubmitSignedApproval,
  onPay,
}) {
  const doc = data?.document || {}
  const lineItems = data?.line_items || []
  const company = data?.company || {}
  const customer = data?.customer || {}
  const businessUnit = data?.business_unit || null
  const payment = data?.payment_config || {}

  const formal = doc?.settings_overrides?.formal_proposal || {}
  const downPaymentLabel = formal.down_payment_label || 'Deposit'
  const downPaymentAmount = (() => {
    const amt = parseFloat(formal.down_payment_amount) || parseFloat(doc?.deposit_required) || parseFloat(doc?.deposit_amount) || 0
    if (formal.down_payment_is_percent) {
      const total = parseFloat(doc?.quote_amount) || 0
      return +(total * (amt / 100)).toFixed(2)
    }
    return amt
  })()

  // Legal terms — either saved on the quote, or built fresh from defaults
  const legalTerms = formal.legal_terms_md ||
    buildDefaultTerms({
      company,
      customer,
      quote: doc,
      lineItems,
      downPaymentLabel,
      downPaymentAmount,
    })

  const [signatureState, setSignatureState] = useState(null) // { method, imageDataUrl?, typedText? }
  const [showSigModal, setShowSigModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [localPaymentProvider, setLocalPaymentProvider] = useState(null)

  // Mirror the numbers the EstimateDetail summary shows — contract total is
  // subtotal minus discount; the utility incentive is a separate "net after
  // incentive" line below it, NOT a reduction of the contract price.
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((s, l) => s + (parseFloat(l.line_total || l.total) || 0), 0)
      || parseFloat(doc?.quote_amount) || 0
    const discount = parseFloat(doc?.discount) || 0
    const incentive = parseFloat(doc?.utility_incentive) || 0
    const contractTotal = Math.max(0, subtotal - discount)
    const netAfterIncentive = Math.max(0, contractTotal - incentive)
    return { subtotal, discount, incentive, total: contractTotal, netAfterIncentive }
  }, [lineItems, doc])

  const displayName = businessUnit?.name || company?.company_name || 'Our Company'
  const logoUrl = businessUnit?.logo_url || company?.logo_url || null
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const isSigned = approvalSuccess || doc?.status === 'Approved'

  const handleSign = async () => {
    setSubmitError(null)
    if (!signatureState) { setShowSigModal(true); return }
    if (!approverName?.trim()) { setSubmitError('Please enter your full name.'); return }
    if (!approverEmail?.trim()) { setSubmitError('Please enter your email.'); return }

    setSubmitting(true)
    try {
      const legalTermsHash = await sha256Hex(legalTerms)
      const approver = { name: approverName.trim(), email: approverEmail.trim() }
      const approvedAt = new Date().toISOString()

      // Render the signed PDF locally so it matches what the customer saw
      const { generateSignedProposalPdf } = await import('../../lib/signedProposalPdf')
      const blob = await generateSignedProposalPdf({
        quote: doc,
        lineItems,
        company,
        customer,
        legalTerms,
        signature: signatureState,
        approver,
        approvedAt,
        legalTermsHash,
        downPaymentLabel,
        downPaymentAmount,
        businessUnit,
      })
      const signedPdfBase64 = await blobToBase64(blob)

      await onSubmitSignedApproval?.({
        signature: signatureState,
        approver,
        legalTerms,
        legalTermsHash,
        signedPdfBase64,
      })
    } catch (err) {
      setSubmitError(err?.message || 'Could not submit signed proposal')
    } finally {
      setSubmitting(false)
    }
  }

  const hasStripe = !!payment?.stripe_enabled
  const hasPaypal = !!payment?.paypal_enabled

  return (
    <div style={styles.page}>
      <div style={styles.sheet}>
        {/* Letterhead */}
        <div style={styles.letterhead}>
          <div style={{ flex: 1 }}>
            {logoUrl && <img src={logoUrl} alt={displayName} style={{ maxHeight: 56, maxWidth: 200, objectFit: 'contain', marginBottom: 10 }} />}
            <div style={styles.senderName}>{displayName}</div>
            {(businessUnit?.address || company?.address) && (
              <div style={styles.senderLine}>{businessUnit?.address || company?.address}</div>
            )}
            {(businessUnit?.phone || company?.phone) && (
              <div style={styles.senderLine}>{businessUnit?.phone || company?.phone}</div>
            )}
            {(businessUnit?.email || company?.email || company?.owner_email) && (
              <div style={styles.senderLine}>{businessUnit?.email || company?.email || company?.owner_email}</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={styles.kicker}>PROPOSAL</div>
            <div style={styles.metaRow}>No. <strong>{doc?.quote_id || `EST-${doc?.id}`}</strong></div>
            <div style={styles.metaRow}>Date: {today}</div>
            {doc?.expiration_date && <div style={styles.metaRow}>Expires: {new Date(doc.expiration_date).toLocaleDateString()}</div>}
          </div>
        </div>

        <hr style={styles.hr} />

        {/* Customer block */}
        <div style={{ marginBottom: 24 }}>
          <div style={styles.label}>Prepared For</div>
          <div style={styles.customerName}>{customer?.name || customer?.business_name || 'Client'}</div>
          {customer?.business_name && customer?.name && customer.business_name !== customer.name && (
            <div style={styles.customerLine}>{customer.business_name}</div>
          )}
          {customer?.address && <div style={styles.customerLine}>{customer.address}</div>}
          {customer?.email && <div style={styles.customerLine}>{customer.email}</div>}
        </div>

        {/* Scope of work */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={styles.sectionHeading}>Scope of Work</h2>
          {doc?.estimate_name && <div style={{ fontWeight: 700, color: '#2c3530', marginBottom: 6 }}>{doc.estimate_name}</div>}
          {doc?.summary && <p style={{ color: '#4d5a52', margin: '0 0 12px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{doc.summary}</p>}
          {lineItems.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr style={{ background: '#f7f5ef' }}>
                  <th style={{ ...styles.th, textAlign: 'left' }}>Description</th>
                  <th style={{ ...styles.th, width: 60, textAlign: 'right' }}>Qty</th>
                  <th style={{ ...styles.th, width: 100, textAlign: 'right' }}>Unit</th>
                  <th style={{ ...styles.th, width: 110, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, idx) => {
                  const qty = parseFloat(li.quantity) || 1
                  const unit = parseFloat(li.unit_price || li.price) || 0
                  const total = parseFloat(li.line_total || li.total) || qty * unit
                  return (
                    <tr key={li.id || idx} style={{ borderTop: '1px solid #eef2eb' }}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600, color: '#2c3530' }}>{li.item_name || li.description || 'Item'}</div>
                        {li.description && li.item_name && <div style={{ color: '#7d8a7f', fontSize: 12, marginTop: 2 }}>{li.description}</div>}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{qty}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{currency(unit)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{currency(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Fees & Payment Terms */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={styles.sectionHeading}>Fees &amp; Payment Terms</h2>
          <div style={styles.totalsBox}>
            <TotalRow label="Subtotal" value={currency(totals.subtotal)} />
            {totals.discount > 0 && <TotalRow label="Discount" value={`- ${currency(totals.discount)}`} />}
            <div style={{ borderTop: '1px solid #d6cdb8', margin: '8px 0' }} />
            <TotalRow label="Contract Total" value={currency(totals.total)} strong />
            {totals.incentive > 0 && (
              <>
                <TotalRow label="Utility Incentive" value={`- ${currency(totals.incentive)}`} />
                <TotalRow label="Net After Incentive" value={currency(totals.netAfterIncentive)} strong />
              </>
            )}
          </div>
          {downPaymentAmount > 0 && (
            <div style={styles.depositCallout}>
              <strong>{downPaymentLabel}:</strong> {currency(downPaymentAmount)} due upon acceptance
            </div>
          )}
        </section>

        {/* Terms & Conditions */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={styles.sectionHeading}>Terms &amp; Conditions</h2>
          <div style={styles.termsBody}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{legalTerms}</ReactMarkdown>
          </div>
        </section>

        {/* Signature block */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={styles.sectionHeading}>Signature</h2>
          {!isSigned ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={styles.inputLabel}>Printed Name</label>
                    <input type="text" value={approverName || ''} onChange={(e) => setApproverName?.(e.target.value)} style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.inputLabel}>Email</label>
                    <input type="email" value={approverEmail || ''} onChange={(e) => setApproverEmail?.(e.target.value)} style={styles.input} />
                  </div>
                </div>
              </div>
              <div
                onClick={() => setShowSigModal(true)}
                style={{
                  border: '2px dashed #d6cdb8',
                  borderRadius: 12,
                  minHeight: 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  backgroundColor: '#fbfaf6',
                  position: 'relative',
                }}
              >
                {signatureState?.method === 'drawn' && signatureState.imageDataUrl && (
                  <img src={signatureState.imageDataUrl} alt="signature" style={{ maxHeight: 100, maxWidth: '90%', objectFit: 'contain' }} />
                )}
                {signatureState?.method === 'typed' && (
                  <span style={{ fontFamily: '"Brush Script MT", "Lucida Handwriting", "Segoe Script", cursive', fontSize: 40, color: '#0d1b2a' }}>{signatureState.typedText}</span>
                )}
                {!signatureState && <span style={{ color: '#7d8a7f', fontSize: 14 }}>Tap or click here to sign</span>}
                {signatureState && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSignatureState(null) }}
                    style={{ position: 'absolute', top: 8, right: 8, background: '#fff', border: '1px solid #d6cdb8', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#4d5a52' }}
                  >
                    Change
                  </button>
                )}
              </div>
              {submitError && <div style={{ color: '#b14a4a', marginTop: 10, fontSize: 13 }}>{submitError}</div>}
              <div style={{ marginTop: 16 }}>
                <button onClick={handleSign} disabled={submitting || !signatureState} style={{ ...styles.primaryBtn, opacity: !signatureState || submitting ? 0.5 : 1, cursor: !signatureState || submitting ? 'not-allowed' : 'pointer' }}>
                  {submitting ? 'Submitting...' : 'Sign & Submit Proposal'}
                </button>
                <p style={{ fontSize: 11, color: '#7d8a7f', marginTop: 8 }}>
                  By clicking Sign &amp; Submit you agree that your electronic signature is the legal equivalent of your handwritten signature.
                </p>
              </div>
            </>
          ) : (
            <div style={styles.signedBanner}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#4a7c59' }}>Signed &amp; Submitted</div>
              <div style={{ fontSize: 13, color: '#4d5a52', marginTop: 4 }}>Thank you. A copy of the signed proposal has been archived on file.</div>

              {/* Optional payment */}
              {downPaymentAmount > 0 && (hasStripe || hasPaypal) && (
                <div style={{ marginTop: 16, padding: 16, borderTop: '1px solid #d6cdb8' }}>
                  <div style={{ fontSize: 13, color: '#4d5a52', marginBottom: 10 }}>
                    You can pay the {downPaymentLabel.toLowerCase()} of <strong>{currency(downPaymentAmount)}</strong> now, or later.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {hasStripe && (
                      <button onClick={() => { setLocalPaymentProvider('stripe'); onPay?.('deposit', downPaymentAmount, 'stripe') }} disabled={localPaymentProvider === 'stripe'} style={styles.primaryBtn}>
                        {localPaymentProvider === 'stripe' ? 'Redirecting...' : `Pay ${downPaymentLabel} (Card)`}
                      </button>
                    )}
                    {hasPaypal && (
                      <button onClick={() => { setLocalPaymentProvider('paypal'); onPay?.('deposit', downPaymentAmount, 'paypal') }} disabled={localPaymentProvider === 'paypal'} style={styles.secondaryBtn}>
                        {localPaymentProvider === 'paypal' ? 'Redirecting...' : `Pay with PayPal`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <div style={{ textAlign: 'center', marginTop: 28, fontSize: 11, color: '#7d8a7f' }}>
          {displayName} &middot; Proposal {doc?.quote_id || `EST-${doc?.id}`} &middot; Archived on signing
        </div>
      </div>

      <SignatureModal
        open={showSigModal}
        signerName={approverName}
        onClose={() => setShowSigModal(false)}
        onConfirm={(res) => { setSignatureState(res); setShowSigModal(false) }}
      />
    </div>
  )
}

function currency(v) {
  const n = parseFloat(v) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result || ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function TotalRow({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ color: strong ? '#5a6349' : '#7d8a7f', fontWeight: strong ? 700 : 500, fontSize: strong ? 16 : 14 }}>{label}</span>
      <span style={{ color: strong ? '#5a6349' : '#2c3530', fontWeight: strong ? 700 : 600, fontSize: strong ? 16 : 14 }}>{value}</span>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f7f5ef',
    padding: '32px 16px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    color: '#2c3530',
  },
  sheet: {
    maxWidth: 820,
    margin: '0 auto',
    background: '#ffffff',
    borderRadius: 14,
    border: '1px solid #d6cdb8',
    boxShadow: '0 4px 24px rgba(44,53,48,0.08)',
    padding: '40px 44px',
  },
  letterhead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 14 },
  senderName: { fontSize: 20, fontWeight: 700, color: '#5a6349' },
  senderLine: { fontSize: 12, color: '#7d8a7f', marginTop: 2 },
  kicker: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7d8a7f', fontWeight: 700, marginBottom: 4 },
  metaRow: { fontSize: 12, color: '#4d5a52', marginTop: 2 },
  hr: { border: 'none', borderTop: '1px solid #d6cdb8', margin: '14px 0 22px' },
  label: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7d8a7f', fontWeight: 700, marginBottom: 6 },
  customerName: { fontSize: 16, fontWeight: 700, color: '#2c3530' },
  customerLine: { fontSize: 13, color: '#7d8a7f', marginTop: 2 },
  sectionHeading: { fontSize: 15, fontWeight: 700, color: '#5a6349', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid #eef2eb' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 },
  th: { padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#7d8a7f', fontWeight: 600, borderBottom: '1px solid #d6cdb8' },
  td: { padding: '10px 12px', verticalAlign: 'top', color: '#2c3530' },
  totalsBox: { maxWidth: 360, marginLeft: 'auto', padding: '14px 18px', borderRadius: 10, background: '#f7f5ef', border: '1px solid #d6cdb8' },
  depositCallout: { marginTop: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(90,99,73,0.08)', border: '1px solid #d6cdb8', color: '#2c3530', fontSize: 14 },
  termsBody: { color: '#2c3530', fontSize: 13, lineHeight: 1.7 },
  inputLabel: { display: 'block', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: '#7d8a7f', fontWeight: 600, marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d6cdb8', fontSize: 14, color: '#2c3530', background: '#fbfaf6', boxSizing: 'border-box' },
  primaryBtn: { padding: '12px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#5a6349 0%,#4a5239 100%)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  secondaryBtn: { padding: '12px 22px', borderRadius: 10, border: '1px solid #d6cdb8', background: '#fff', color: '#4d5a52', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  signedBanner: { padding: 20, borderRadius: 12, background: 'rgba(74,124,89,0.08)', border: '1px solid rgba(74,124,89,0.3)' },
}
