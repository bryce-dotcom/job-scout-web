// Sending an invoice — the one place the send-invoice payload is assembled.
//
// InvoiceDetail assembled this inline for the desk. Field Scout now sends
// from the phone after a job completes, and a second hand-built copy of a
// twenty-field payload is exactly how the invoice PDF, the portal and the
// email drifted apart before (see lib/invoiceLines, lib/invoiceSections).
// Both callers build the payload here; the only differences are what they
// pass in.
//
// buildInvoiceSendPayload is pure and tested. sendInvoice does the I/O.

import { getCustomerPrimary } from './customerDisplay'
import { invoiceDiscountBreakout, deductionLineLabel } from './invoiceSections'
import { enabledWalletsFrom } from './wallets'

const SITE_URL = 'https://jobscout.appsannex.com'

export function portalUrlFor(token) {
  return token ? `${SITE_URL}/portal/${token}` : null
}

/** Business unit record for an invoice, from the settings row. */
export function businessUnitFor(settings, invoice) {
  const buSetting = (settings || []).find(s => s.key === 'business_units')
  if (!buSetting?.value || !invoice?.business_unit) return null
  try {
    const units = JSON.parse(buSetting.value)
    return units.find(u => u.name === invoice.business_unit) || null
  } catch { return null }
}

/** Payment methods the email may advertise, from payment_config. */
export function paymentMethodsFrom(settings) {
  const cfg = (settings || []).find(s => s.key === 'payment_config')
  const out = []
  if (!cfg?.value) return out
  try {
    const pc = JSON.parse(cfg.value)
    if (pc.stripe_enabled) out.push('Credit Card')
    if (pc.bank_transfer_enabled) out.push('ACH / Bank Transfer')
    if (pc.paypal_enabled) out.push('PayPal')
    for (const w of enabledWalletsFrom(pc)) out.push(w.method)
  } catch { /* unreadable config advertises nothing */ }
  return out
}

/**
 * The deduction rows the email prints under the subtotal — the same split
 * and the same labels as the PDF, so the email cannot call the incentive a
 * "Discount" while the attached PDF names the utility (Alayda, 550b056d).
 *
 * A deposit-balance invoice whose parent we were not given keeps one plain
 * row: without the parent, the deposit credit cannot be told apart from the
 * incentive, and a wrong name is worse than a plain one. Legacy-net invoices
 * (amount already net of the incentive) keep the row they always had.
 */
export function invoiceDeductionRows({ invoice, parentInvoice = null, linkedUtilityInvoice = null, job = null, utilityProviders = [], defaultUtilityProviderId = null }) {
  const b = invoiceDiscountBreakout(invoice, parentInvoice)
  const r2 = (n) => Math.round(n * 100) / 100
  if (!(b.discountApplied > 0)) return []
  if (b.isLegacyNet || (invoice?.parent_invoice_id && !parentInvoice)) return [{ label: 'Discount', amount: r2(b.discountApplied) }]
  const rows = []
  if (b.projectDiscountField > 0) rows.push({ label: 'Project Discount', amount: r2(b.projectDiscountField) })
  if (b.incentive > 0) rows.push({ label: deductionLineLabel({ invoice, linkedUtilityInvoice, job, utilityProviders, defaultUtilityProviderId }), amount: r2(b.incentive) })
  if (b.downPayment > 0) rows.push({ label: 'Down Payment', amount: r2(b.downPayment) })
  if (b.depositCredit > 0) rows.push({ label: 'Deposit Applied', amount: r2(b.depositCredit) })
  return rows
}

export function logoUrlFrom(settings, businessUnit, company) {
  if (businessUnit?.logo_url) return businessUnit.logo_url
  const logoSetting = (settings || []).find(s => s.key === 'company_logo_url')
  return logoSetting?.value || company?.logo_url || ''
}

/**
 * @param {object} p
 * @param {object} p.invoice          the invoices row
 * @param {object[]} p.lines          invoice_lines rows
 * @param {object|null} p.customer    customers row (name/business_name)
 * @param {object|null} p.company     companies row
 * @param {object[]} p.settings       the store's settings rows
 * @param {string} p.recipient        email address
 * @param {string|null} p.portalToken customer_portal_tokens.token
 * @param {string} [p.pdfPath]        storage path of a generated PDF (desk only)
 * @param {string} [p.cc]             cc list
 * @param {string} [p.subject]        custom subject
 * @param {{filename:string, content:string}[]} [p.attachments]
 * @param {object|null} [p.parentInvoice]        the deposit invoice this one balances
 * @param {object|null} [p.linkedUtilityInvoice] the utility record on this invoice
 * @param {object|null} [p.job]                  the job (utility_incentive, utility_name)
 * @param {object[]} [p.utilityProviders]        the store's providers, to name the utility
 * @param {number|null} [p.defaultUtilityProviderId] the company's default provider (lib/jobUtility)
 */
export function buildInvoiceSendPayload({ invoice, lines, customer, company, settings, recipient, portalToken, pdfPath, cc, subject, attachments, parentInvoice = null, linkedUtilityInvoice = null, job = null, utilityProviders = [], defaultUtilityProviderId = null }) {
  const bu = businessUnitFor(settings, invoice)
  return {
    company_id: invoice.company_id,
    invoice_id: invoice.id,
    recipient_email: recipient,
    cc_emails: cc || undefined,
    pdf_storage_path: pdfPath || undefined,
    company_name: company?.company_name || '',
    invoice_number: invoice.invoice_id || `INV-${invoice.id}`,
    amount: invoice.amount,
    discount: invoice.discount_applied || 0,
    // What the discount IS, row by row, named the way the PDF names it.
    deductions: invoiceDeductionRows({ invoice, parentInvoice, linkedUtilityInvoice, job, utilityProviders, defaultUtilityProviderId }),
    job_description: invoice.job_description || '',
    invoice_lines: (lines || []).map(l => ({
      description: l.description || l.item_name || 'Item',
      quantity: l.quantity || 1,
      unit_price: parseFloat(l.unit_price) || 0,
      line_total: parseFloat(l.line_total) || 0,
    })),
    // The email greets by first name ("Hi Sylvia,"), so the PERSON, and only
    // then the business — "Hi Jan," from "Jan Pro" is nobody.
    customer_name: customer ? (String(customer.name || '').trim() || getCustomerPrimary(customer)) : '',
    portal_url: portalUrlFor(portalToken),
    logo_url: logoUrlFrom(settings, bu, company),
    payment_methods: paymentMethodsFrom(settings),
    business_unit_name: bu?.name || invoice.business_unit || '',
    business_unit_phone: bu?.phone || company?.phone || '',
    business_unit_email: bu?.email || company?.owner_email || '',
    business_unit_address: bu?.address || company?.remit_to_address || company?.address || '',
    custom_subject: subject || undefined,
    extra_attachments: attachments && attachments.length ? attachments : undefined,
  }
}

/**
 * Mint a 90-day portal token for the invoice, send the email, and record the
 * send on the invoice. Returns { ok, emailId } or throws with the server's
 * sentence. The caller decides what the job does next (InvoiceDetail moves
 * the job to Invoiced; the field sheet does the same through
 * markJobInvoicedAfterSend).
 */
export async function sendInvoice(supabase, { invoice, lines, customer, company, settings, recipient, pdfPath, cc, subject, attachments, parentInvoice, linkedUtilityInvoice, job, utilityProviders, defaultUtilityProviderId }) {
  const { data: tokenRow } = await supabase
    .from('customer_portal_tokens')
    .insert({
      document_type: 'invoice',
      document_id: invoice.id,
      company_id: invoice.company_id,
      customer_id: invoice.customer_id || null,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  const payload = buildInvoiceSendPayload({
    invoice, lines, customer, company, settings, recipient,
    portalToken: tokenRow?.token || null, pdfPath, cc, subject, attachments,
    parentInvoice, linkedUtilityInvoice, job, utilityProviders, defaultUtilityProviderId,
  })

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.success) throw new Error(data.error || 'Failed to send invoice')

  await supabase.from('invoices').update({
    payment_status: invoice.payment_status === 'Draft' ? 'Sent' : invoice.payment_status,
    last_sent_at: new Date().toISOString(),
    sent_to_email: recipient,
    portal_token: tokenRow?.token || null,
    email_id: data.emailId || null,
    email_status: 'sent',
    email_status_at: new Date().toISOString(),
    email_bounce_reason: null,
    email_opened_at: null,
    email_clicked_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', invoice.id)

  return { ok: true, emailId: data.emailId || null, portalToken: tokenRow?.token || null }
}

/**
 * The customer invoice going out is what moves a job (and its lead) to
 * Invoiced — not creating it (Tracy, JOB-MP2ZU0VY), and not a deposit
 * (Doug, JOB-MTJ2MSZX). Same rule InvoiceDetail applies after its send.
 */
export async function markJobInvoicedAfterSend(supabase, invoice) {
  if (!invoice?.job_id || invoice.invoice_type === 'deposit') return
  const { data: job } = await supabase.from('jobs').select('status, lead_id').eq('id', invoice.job_id).single()
  if (job?.status && !['Invoiced', 'Paid', 'Closed', 'Archived'].includes(job.status)) {
    await supabase.from('jobs').update({ status: 'Invoiced', updated_at: new Date().toISOString() }).eq('id', invoice.job_id)
  }
  if (job?.lead_id) {
    const { data: lead } = await supabase.from('leads').select('status').eq('id', job.lead_id).single()
    if (lead?.status && !['Invoiced', 'Paid', 'Closed', 'Archived', 'Lost'].includes(lead.status)) {
      await supabase.from('leads').update({ status: 'Invoiced', updated_at: new Date().toISOString() }).eq('id', job.lead_id)
    }
  }
}
