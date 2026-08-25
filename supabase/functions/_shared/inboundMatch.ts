// Which estimate does an inbound email reply belong to?
//
// The obvious answer — read the estimate number out of the subject — does not
// survive this data. quote_id in production is Q-ML6TFDNZ, ST-11, Q001 and 695
// rows that are a bare number like "123". Matching a bare number found in a
// subject line would attach a customer's reply to somebody else's estimate,
// which is worse than not matching at all: it would put one customer's words in
// front of another customer's job.
//
// So the sender is the primary key and the subject only ever breaks a tie:
//
//   1. Candidates are estimates whose sent_to_email equals the From address.
//      That is the address we mailed, so a reply from it is theirs by
//      construction.
//   2. If the subject contains a DISTINCTIVE quote_id belonging to one of those
//      candidates, that wins. "Distinctive" excludes bare numbers.
//   3. Otherwise the most recently sent still-open estimate wins, because that
//      is what they are replying to.
//   4. No candidates -> no guess. The caller stores it as unmatched rather than
//      attaching it to anything.

export interface QuoteCandidate {
  id: number
  company_id: number
  quote_id: string | null
  sent_to_email: string | null
  status: string | null
  last_sent_at: string | null
  sent_date: string | null
  salesperson_id?: number | null
}

const CLOSED = ['Approved', 'Rejected', 'Expired', 'Won', 'Lost', 'Archived']

export function normalizeEmail(raw: string | null | undefined): string {
  const s = String(raw || '').trim().toLowerCase()
  // "Jane Doe <jane@x.com>" -> jane@x.com
  const angled = s.match(/<([^>]+)>/)
  return (angled ? angled[1] : s).trim()
}

// A quote_id worth trusting inside free text. A bare number is not: "123"
// appears in prices, addresses and dates. Needs a letter and at least four
// characters, which covers Q-ML6TFDNZ, EST-MSF2UIQ3 and ST-11 while rejecting
// the 695 numeric ids.
export function isDistinctiveQuoteId(quoteId: string | null | undefined): boolean {
  const s = String(quoteId || '').trim()
  if (s.length < 4) return false
  if (!/[A-Za-z]/.test(s)) return false
  return /[A-Za-z].*[-0-9]|[-0-9].*[A-Za-z]/.test(s)
}

export function sentAtOf(q: QuoteCandidate): number {
  const t = Date.parse(q.last_sent_at || q.sent_date || '')
  return Number.isFinite(t) ? t : 0
}

export interface MatchResult {
  quote: QuoteCandidate | null
  reason: 'subject' | 'most_recent_open' | 'most_recent' | 'none'
}

export function matchInboundToEstimate(
  fromEmail: string | null | undefined,
  subject: string | null | undefined,
  quotes: QuoteCandidate[],
): MatchResult {
  const from = normalizeEmail(fromEmail)
  if (!from) return { quote: null, reason: 'none' }

  const candidates = (quotes || []).filter(q => normalizeEmail(q.sent_to_email) === from)
  if (!candidates.length) return { quote: null, reason: 'none' }

  // 2 — a distinctive id in the subject beats recency.
  const subj = String(subject || '')
  if (subj) {
    const named = candidates.filter(
      q => isDistinctiveQuoteId(q.quote_id) && subj.toLowerCase().includes(String(q.quote_id).toLowerCase()),
    )
    if (named.length === 1) return { quote: named[0], reason: 'subject' }
    if (named.length > 1) {
      // Same id quoted twice, or a thread covering two — take the newest.
      named.sort((a, b) => sentAtOf(b) - sentAtOf(a))
      return { quote: named[0], reason: 'subject' }
    }
  }

  // 3 — the newest still-open one is what they are answering.
  const open = candidates.filter(q => !CLOSED.includes(String(q.status || '')))
  const pool = open.length ? open : candidates
  pool.sort((a, b) => sentAtOf(b) - sentAtOf(a))
  return { quote: pool[0], reason: open.length ? 'most_recent_open' : 'most_recent' }
}

// Strip the quoted history off a reply so the thread shows what the person
// actually wrote, not their copy of our email underneath it.
export function stripQuotedReply(body: string | null | undefined): string {
  const text = String(body || '').replace(/\r\n/g, '\n')
  const cutters = [
    /^On .+ wrote:$/m,            // Gmail / Apple Mail
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{5,}$/m,                   // Outlook divider
    /^From:.*$/m,                 // Outlook header block
    /^Sent from my /m,
  ]
  let cut = text.length
  for (const re of cutters) {
    const m = text.match(re)
    if (m?.index !== undefined && m.index < cut) cut = m.index
  }
  const head = text.slice(0, cut)
  // Drop trailing ">" quote lines and collapse the runaway blank lines that
  // mail clients leave behind.
  return head
    .split('\n')
    .filter(l => !/^\s*>/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
