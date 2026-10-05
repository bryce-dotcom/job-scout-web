// A text arrives. What happens to it?
//
// JobScout could send a text and never receive one. A customer replying to an
// invoice reminder got silence — the number's webhook pointed at Twilio's demo
// autoresponder left over from account setup, and once the number joined a
// Messaging Service the service's inbound URL took over and was null, so
// replies were dropped before anything could look at them.
//
// Everything here is a pure rule so it can be tested without Twilio: the
// matching, the row, the notification, the opt-out keywords and the signature
// base string. index.ts does the I/O and the HMAC.

/** The notification type. MyNotifications styles it; nothing branches on it. */
export const INBOUND_TYPE = 'sms_inbound'

/** Twilio must not answer for us — an empty TwiML response sends nothing. */
export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

/**
 * The last ten digits, which is the only thing two of this app's phone numbers
 * reliably share. Customers arrive as '4357904777', companies as
 * '(801) 999-8430', Twilio as '+18014044848'.
 */
export function phoneKey(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

/** True when both numbers are the same line, whatever shape they are written in. */
export function samePhone(a: unknown, b: unknown): boolean {
  const ka = phoneKey(a)
  return !!ka && ka === phoneKey(b)
}

// The carrier keywords. Twilio handles these itself when Advanced Opt-Out is
// on and does not forward them — but that is a setting, not a guarantee, and a
// STOP that reaches us and is treated as an ordinary message would leave a
// consent record saying yes for someone who just said no.
const STOP_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt-out']
const START_WORDS = ['start', 'yes', 'unstop', 'optin', 'opt-in']
const HELP_WORDS = ['help', 'info']

/** Which carrier keyword this message is, if any. */
export function keywordOf(body: unknown): 'stop' | 'start' | 'help' | null {
  const word = String(body ?? '').trim().toLowerCase().replace(/[.!?,]+$/, '')
  if (!word) return null
  if (STOP_WORDS.includes(word)) return 'stop'
  if (START_WORDS.includes(word)) return 'start'
  if (HELP_WORDS.includes(word)) return 'help'
  return null
}

export interface Match {
  kind: 'customer' | 'employee' | 'lead' | null
  id: number | null
  name: string | null
  salespersonId: number | null
}

export const NO_MATCH: Match = { kind: null, id: null, name: null, salespersonId: null }

/**
 * Who texted, from what inbound_sms_match returned.
 *
 * A customer wins over a lead, and a lead over an employee: the same number can
 * be on a lead that became a customer, and the customer is the live record. An
 * employee last, because a crew member texting the office is the rarer case and
 * a number on both is more likely a customer who also works there.
 */
export function pickMatch(rows: Array<Record<string, unknown>> = []): Match {
  const order = ['customer', 'lead', 'employee']
  for (const kind of order) {
    const row = rows.find((r) => String(r?.kind) === kind)
    if (row) {
      return {
        kind: kind as Match['kind'],
        id: row.match_id == null ? null : Number(row.match_id),
        name: (row.match_name as string) || null,
        salespersonId: row.salesperson_id == null ? null : Number(row.salesperson_id),
      }
    }
  }
  return NO_MATCH
}

/**
 * The communications_log row for a message that arrived.
 *
 * `recipient` holds the other party's number in both directions, so the
 * existing views keep working; `direction` is what says which way it went.
 * `communication_id` is Twilio's message id, which is what makes a webhook
 * retry a no-op rather than a duplicate.
 */
export function inboundLogRow(input: {
  companyId: number
  from: string
  body: string
  messageSid: string
  match?: Match
  now?: Date
}): Record<string, unknown> {
  const { companyId, from, body, messageSid, match = NO_MATCH, now = new Date() } = input
  return {
    company_id: companyId,
    communication_id: messageSid || null,
    direction: 'in',
    type: 'sms',
    trigger: 'inbound',
    customer_id: match.kind === 'customer' ? match.id : null,
    employee_id: match.kind === 'employee' ? match.id : null,
    recipient: from,
    sent_date: now.toISOString().slice(0, 10),
    status: 'received',
    response: String(body ?? '').slice(0, 1000),
  }
}

/**
 * What the notification says, and where it goes when tapped.
 *
 * An unmatched number still raises one. "Somebody texted and we do not know
 * who" is exactly the message a person needs to see — dropping it because the
 * number is unrecognised is how the silence started.
 */
export function inboundNotification(input: {
  from: string
  body: string
  messageSid: string
  match?: Match
}): { type: string; title: string; message: string; route: string; dedupe_key: string; metadata: Record<string, unknown> } {
  const { from, body, messageSid, match = NO_MATCH } = input
  const who = match.name || from
  const text = String(body ?? '').trim()
  return {
    type: INBOUND_TYPE,
    title: `Text from ${who}`,
    message: text.length > 160 ? text.slice(0, 157) + '…' : (text || '(no message)'),
    route: match.kind === 'customer' && match.id ? `/customers/${match.id}` : '/communications',
    dedupe_key: `${INBOUND_TYPE}:${messageSid}`,
    metadata: { from, kind: match.kind, match_id: match.id },
  }
}

/**
 * Who hears about it: the rep whose customer or lead it is, else the managers.
 *
 * One person when we know whose it is, because a text to the whole office that
 * belongs to one rep is noise that teaches people to ignore the bell. Everyone
 * senior when we do not, because the alternative is nobody.
 */
export function inboundRecipients(match: Match | undefined, managerIds: number[] = []): number[] {
  const rep = match?.salespersonId
  if (rep) return [rep]
  return [...new Set(managerIds)]
}

/**
 * Twilio's signature base string: the exact URL it posted to, then every POST
 * parameter sorted by name, each name immediately followed by its value, all
 * concatenated. index.ts signs this with HMAC-SHA1 and the account's auth
 * token and compares against X-Twilio-Signature.
 *
 * This endpoint is public — it has to be, Twilio cannot send a Supabase JWT —
 * so the signature is the only thing standing between it and anyone who can
 * POST a form. Without it, a stranger could write rows into any company's
 * communications log and raise notifications naming whoever they liked.
 */
export function signatureBase(url: string, params: Record<string, string> = {}): string {
  return Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], String(url || ''))
}

/** Constant-time-ish comparison, so a signature cannot be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}
