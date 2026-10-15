// Texting an invoice, for the customer who never gave you an email.
//
// Tracy (2026-10-02): "It would be awesome to have the ability to text an
// invoice when an email is not provided."
//
// An invoice is TRANSACTIONAL — it is about work this customer asked for and
// a bill they already owe — so it goes under the business relationship, not
// under a marketing opt-in. lib/smsConsent#mayText is the rule and this does
// not second-guess it. A STOP still stops it: inbound-sms clears sms_consent
// and mayText is where that is read.
//
// WHAT A TEXT CAN AND CANNOT CARRY
//
// It cannot carry the PDF. A text is 160 characters and a link, so the link
// has to be the invoice itself — the customer portal, the same page the email
// button points at. An invoice with no portal token has nothing to send, and
// saying so is better than texting someone a number with no way to pay it.
//
// It should not carry the line items, the terms, or the company's address.
// Everything beyond "who, how much, and where to pay it" belongs on the page
// the link opens, and every extra character is one more SMS segment billed.

/** Roughly how many SMS segments a body costs — GSM-7 unless it has to be UCS-2. */
export function segments(body) {
  const text = String(body || '')
  if (!text) return 0
  // A single non-GSM character (a curly quote, an emoji, an accent) drops the
  // whole message to UCS-2 and halves the room.
  const unicode = /[^\n\r A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}[\]~|€\\]/.test(text)
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  return text.length <= single ? 1 : Math.ceil(text.length / multi)
}

/** The portal link for an invoice, or null when it has no token. */
export function invoiceLink(invoice, origin = 'https://jobscout.appsannex.com') {
  const token = invoice?.portal_token
  return token ? `${origin}/portal/${token}` : null
}

/**
 * The message.
 *
 * Deliberately plain. It names the business so an unknown number is not a
 * scam, says what it is and what is owed, and gives one link. No "Hi {name}",
 * no emoji — an emoji alone would push it to UCS-2 and cost a second segment.
 */
export function invoiceTextBody({ company, invoice, amountDue, link } = {}) {
  const who = String(company?.company_name || company?.legal_name || '').trim()
  const number = String(invoice?.invoice_id || '').trim()
  const bits = []
  bits.push(who ? `${who}:` : 'Invoice:')
  bits.push(number ? `invoice ${number}` : 'your invoice')
  if (amountDue != null && Number.isFinite(Number(amountDue))) {
    bits.push(`for ${formatMoney(amountDue)}`)
  }
  const head = bits.join(' ')
  return link ? `${head}. View and pay: ${link}` : `${head}.`
}

const formatMoney = (n) => {
  const v = Number(n) || 0
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Why this invoice cannot be texted, as a sentence — or null.
 * `consentProblem` is smsConsent#mayTextProblem's answer, passed in so there
 * is one rule about who may be texted and this is not a second one.
 */
export function textInvoiceProblem({ invoice, consentProblem } = {}) {
  if (consentProblem) return consentProblem
  if (!invoiceLink(invoice)) {
    return 'This invoice has no customer portal link yet, so a text would have nowhere to send them. Send it by email once, or open the invoice to generate the link.'
  }
  return null
}

/** Everything the Send panel needs to show before anybody taps send. */
export function textInvoicePreview({ company, invoice, amountDue, consentProblem, origin } = {}) {
  const link = invoiceLink(invoice, origin)
  const body = invoiceTextBody({ company, invoice, amountDue, link })
  return {
    body,
    link,
    segments: segments(body),
    problem: textInvoiceProblem({ invoice, consentProblem }),
  }
}
