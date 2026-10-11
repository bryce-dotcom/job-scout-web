// Where people reach Arnie outside the app. The gap the Arnie brief named:
// nobody discovers that they can text him or set up a routine. One rule,
// read by the Arnie page and the owner's Arnie-at-work panel.
//
// Text: the company's Twilio number (settings twilio_config.from_number) —
// an ACTIVE employee texting it talks to Arnie (inbound-sms); a customer
// texting it is still a customer. Email: arnie@ on the platform mail domain;
// the sender's employee address is the credential (inbound-email).

export const ARNIE_EMAIL = 'arnie@appsannex.com'

/** (801) 999-8430 from +18019998430 or any 10/11-digit string; '' when none. */
export function prettyPhone(value) {
  const d = String(value || '').replace(/\D/g, '')
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  if (n.length !== 10) return String(value || '').trim()
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
}

/** The company's texting number from the settings rows the store holds, or null. */
export function arnieTextNumber(settings = []) {
  const row = (settings || []).find((s) => s.key === 'twilio_config')
  if (!row?.value) return null
  let cfg = row.value
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { return null } }
  const from = String(cfg?.from_number || '').trim()
  return from ? { raw: from, pretty: prettyPhone(from) } : null
}
