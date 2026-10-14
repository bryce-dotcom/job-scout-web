// COLE'S CLOSING CHECK — what must be on an estimate before it is approved.
//
// From his write-up (feedback, 2026-10-10), CLOSING RULES:
//   Before approving she checks for: customer name, phone, email, and
//   address; Business Unit; project name; notes on every line (height,
//   existing wattage, mount); signed terms (required for Arizona); spec
//   sheets; annual savings. She never approves without all of it plus the
//   owner's go-ahead. If something is missing, she emails that job's sales
//   rep. She approves with "Approve and Record", and nothing goes to the
//   customer.
//
// Pure, so every item is tested (src/lib/closingCheck.test.js). The won card
// runs it for any company with an estimating playbook and refuses while
// anything is missing; the closing_gaps card emails the rep the list.

// deno-lint-ignore-file no-explicit-any
type Any = any

export interface ClosingInput {
  quote: Any            // quotes row
  party: Any | null     // the customer, else the lead: name/phone/email/address
  lines: Any[]          // quote_lines
  products: Record<string, Any>      // products_services by id: spec_sheet_url
  components: Record<string, number[]> // bundle id -> component product ids
  annualSavings: number | null
  /** The customer signed on the lead (the portal/sign flow captures it there). */
  signedOnLead?: boolean
}

export interface Gap { item: string; detail: string }

const GM = (n: string) => /^MES Cobra Head Mount - /i.test(n) || /^ES LIFT$/i.test(n) || /^lift gm$/i.test(n)
const MOUNTED = /cobra|flood/i

/** Is this estimate in Arizona? The address, else an "AZ " estimate name. */
export function isArizona(quote: Any, party: Any): boolean {
  if (/\b(AZ|Arizona)\b/.test(String(party?.address || ''))) return true
  return /^AZ\s/.test(String(quote?.estimate_name || ''))
}

export function closingGaps(x: ClosingInput): Gap[] {
  const gaps: Gap[] = []
  const p = x.party || {}
  const name = String(p.business_name || p.name || p.customer_name || '').trim()
  if (!name) gaps.push({ item: 'Customer name', detail: 'no customer or business name' })
  if (!String(p.phone || '').replace(/\D/g, '').match(/\d{10}/)) gaps.push({ item: 'Customer phone', detail: 'no phone number' })
  if (!/@/.test(String(p.email || ''))) gaps.push({ item: 'Customer email', detail: 'no email address' })
  if (String(p.address || '').trim().length < 6) gaps.push({ item: 'Customer address', detail: 'no address' })

  if (!String(x.quote?.business_unit || '').trim()) gaps.push({ item: 'Business Unit', detail: 'not set on the estimate' })
  if (!String(x.quote?.estimate_name || x.quote?.job_title || '').trim()) gaps.push({ item: 'Project name', detail: 'the estimate has no name' })

  // Notes on every fixture line: the height, the existing wattage, and the
  // mount where it has one. GM lines are not fixtures.
  const fixtures = x.lines.filter((l) => !GM(String(l.item_name || '').trim()))
  if (!fixtures.length) gaps.push({ item: 'Line items', detail: 'the estimate has no fixture lines' })
  for (const l of fixtures) {
    const text = `${l.description || ''} ${l.notes || ''}`
    const missing: string[] = []
    if (!/\d+\s*(ft|feet|foot)\b|\binterior\b/i.test(text)) missing.push('height')
    if (!/\d+\s*(w|watts?)\b/i.test(text)) missing.push('existing wattage')
    if (MOUNTED.test(String(l.item_name || '')) && !/mount|slip|arm fit|trunnion|knuckle|flush/i.test(text)) missing.push('mount')
    if (missing.length) gaps.push({ item: 'Line notes', detail: `"${String(l.item_name).trim()}" has no ${missing.join(', ')}` })
  }

  if (isArizona(x.quote, p) && !(x.quote?.contract_signed === true || x.quote?.signed_proposal_attachment_id || x.signedOnLead)) {
    gaps.push({ item: 'Signed terms', detail: 'Arizona needs the signed terms attached to the estimate' })
  }

  // Spec sheets from JobScout only: the product's own, or a component's
  // inside the bundle. GM lines need none.
  const noSheet: string[] = []
  for (const l of fixtures) {
    if (!l.item_id) { noSheet.push(String(l.item_name).trim()); continue }
    const prod = x.products[String(l.item_id)]
    const own = !!prod?.spec_sheet_url
    const comp = (x.components[String(l.item_id)] || []).some((id) => !!x.products[String(id)]?.spec_sheet_url)
    if (!own && !comp) noSheet.push(String(l.item_name).trim())
  }
  if (noSheet.length) gaps.push({ item: 'Spec sheets', detail: `none in Products & Services for ${[...new Set(noSheet)].join(', ')}` })

  if (!(Number(x.annualSavings) > 0)) gaps.push({ item: 'Annual savings', detail: 'no annual savings on the estimate' })
  return gaps
}

/** The email to the rep, in plain words. */
export function gapsEmail(o: { repName: string; ref: string; forWhom: string; gaps: Gap[]; from: string }): { subject: string; text: string } {
  const first = String(o.repName || '').split(/\s+/)[0] || 'there'
  return {
    subject: `Before ${o.ref} (${o.forWhom}) can be approved`,
    text: [
      `Hi ${first},`,
      '',
      `${o.ref} for ${o.forWhom} is ready to close, but it is missing:`,
      '',
      ...o.gaps.map((g) => `- ${g.item}: ${g.detail}`),
      '',
      'Can you add these in JobScout? It will be approved as soon as they are there.',
      '',
      o.from,
    ].join('\n'),
  }
}
