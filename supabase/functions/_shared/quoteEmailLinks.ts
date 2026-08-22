// Extra links on an outgoing quote email. ONE rule, shared by the edge function
// that sends the mail and the vitest suite that proves it.
//
// Cole (9bcf6581): "Can we send links to the energy scout website and the link
// to Rocky Mountain Power approved vendor list."
//
// Two things make this configuration rather than two hardcoded anchors:
//
//   * Nobody has supplied the URLs yet. Guessing them is not an option — the
//     only Rocky Mountain URL we hold is the wattsmart INCENTIVES page, which
//     is not the approved-vendor list, and sending a customer there to prove
//     we are an approved vendor is worse than sending nothing.
//   * "Energy Scout website" belongs on a lighting quote. HHH Building Services
//     cleans windows; an Energy Scout link on that quote reads as a mistake.
//     So links are scoped per business unit.
//
// Stored as a settings row, key `quote_email_links`, value a JSON array:
//   [{ "business_unit": "Energy Scout", "label": "…", "url": "https://…" }]
// An entry with no business_unit goes on every quote.
//
// With no setting, this returns [] and the email renders exactly as it does
// today. That is deliberate: the plumbing ships before the URLs arrive.

export interface QuoteEmailLink {
  label: string
  url: string
}

/** Only http(s), and only absolute. A relative or javascript: href in a
 *  customer email is either broken or an attack, never intent. */
function safeUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  return u.toString()
}

function cleanLabel(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').trim()
  // Strip anything that could break out of the anchor text when interpolated
  // into the email's HTML.
  const safe = s.replace(/[<>&"']/g, '').slice(0, 80)
  return safe || fallback
}

/**
 * Resolve the links for one quote.
 *
 * rawSetting   the settings row's `value` — a JSON string, an array, or null
 * businessUnit the quote's business unit name, or null
 */
export function resolveQuoteEmailLinks(rawSetting: unknown, businessUnit?: string | null): QuoteEmailLink[] {
  let parsed: unknown = rawSetting
  if (typeof rawSetting === 'string') {
    try { parsed = JSON.parse(rawSetting) } catch { return [] }
  }
  // Settings values are sometimes double-encoded (a JSON string inside a JSON
  // string); the rest of this table has the same habit.
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return [] }
  }
  if (!Array.isArray(parsed)) return []

  const bu = String(businessUnit ?? '').trim().toLowerCase()
  const out: QuoteEmailLink[] = []
  const seen = new Set<string>()
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const scope = String(e.business_unit ?? '').trim().toLowerCase()
    // No scope = every quote. A scoped entry only rides along on its own unit.
    if (scope && scope !== bu) continue
    const url = safeUrl(e.url)
    if (!url) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, label: cleanLabel(e.label, url) })
  }
  return out
}

/** The links as an HTML block for the email, or '' when there are none. */
export function renderQuoteEmailLinks(links: QuoteEmailLink[]): string {
  if (!links.length) return ''
  const items = links.map((l) =>
    `<a href="${l.url}" style="color:#5a6349;text-decoration:underline;">${l.label}</a>`
  ).join('&nbsp;&nbsp;·&nbsp;&nbsp;')
  return `
      <div style="padding:0 32px 24px;text-align:center;font-size:13px;color:#7d8a7f;">
        ${items}
      </div>`
}
