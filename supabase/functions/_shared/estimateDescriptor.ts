// Saying which estimate, in words a customer recognises.
//
// Bryce: "the follow up email should say something about the estimate instead
// of just a number... i whouldnt know what the fuck you were following up on by
// just a number." He is right. The follow-ups said "Estimate EST-MTVT2OBE" and
// nothing else — an internal id that appears nowhere in the customer's world.
//
// What they DO recognise, from the real data:
//
//   service_type   'Energy Efficiency' on most HHH estimates — what the work is
//   quote_amount   the money, which is the single most memorable thing
//   line count     'a 5-item estimate' sets the size without listing parts
//
// estimate_name is deliberately NOT used: in the live data it holds the
// CUSTOMER's own name ('siding solutions & construction', 'FBM AZ'), which
// reads strangely in an email addressed to them.
//
// The number stays, in brackets, because the office quotes it on the phone.

/** Money as a customer writes it. Whole dollars: cents are noise at this size. */
export function usd(amount: unknown): string {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return ''
  return '$' + Math.round(n).toLocaleString('en-US')
}

export interface EstimateFacts {
  quoteNumber?: string | null
  serviceType?: string | null
  amount?: unknown
  lineCount?: number | null
}

/**
 * A phrase naming the estimate, for the middle of a sentence:
 *
 *   "your Energy Efficiency estimate — 5 items, $73,450 (EST-MTVT2OBE)"
 *   "your Energy Efficiency estimate — $6,026 (EST-MUPW7T4U)"
 *   "your estimate (EST-MUFR9RUW)"            ← nothing else known
 *
 * Degrades a piece at a time: a missing service type or amount costs that
 * clause and nothing else, so the sentence always reads.
 */
export function estimatePhrase(facts: EstimateFacts = {}): string {
  const service = String(facts.serviceType ?? '').trim()
  const money = usd(facts.amount)
  const lines = Number(facts.lineCount)
  const num = String(facts.quoteNumber ?? '').trim()

  const head = service ? `your ${service} estimate` : 'your estimate'

  const detail: string[] = []
  if (Number.isFinite(lines) && lines > 1) detail.push(`${lines} items`)
  if (money) detail.push(money)

  const body = detail.length ? `${head} — ${detail.join(', ')}` : head
  return num ? `${body} (${num})` : body
}

/**
 * The subject line. The money goes here too: it is what makes somebody open an
 * email they have already ignored twice.
 *
 *   "Following up: Energy Efficiency estimate — $73,450"
 */
export function estimateSubject(prefix: string, facts: EstimateFacts = {}): string {
  const service = String(facts.serviceType ?? '').trim()
  const money = usd(facts.amount)
  const what = service ? `${service} estimate` : 'estimate'
  return money ? `${prefix}: ${what} — ${money}` : `${prefix}: ${what}`
}
