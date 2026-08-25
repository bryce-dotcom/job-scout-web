// What the pipeline card says about an estimate's conversation.
//
// ONE badge, not five. A rep scanning a board is answering a single question —
// "does this one need me?" — and a row of chips each meaning something slightly
// different is how a board becomes wallpaper. So the states are ordered by how
// much they demand of the rep, and only the top one shows.
//
// A deliberate omission: there is no "Viewed" state. The columns for it exist
// and the Resend webhook handles email.opened correctly, but across 1,607 raw
// email events not one open has ever arrived — open tracking is switched off at
// the provider. A badge that is permanently blank teaches reps to ignore the
// badges that aren't, so it stays out until the events actually flow.

export const COMMS = {
  replied:  { id: 'replied',  label: 'Replied',  color: '#22c55e', rank: 5 },
  bounced:  { id: 'bounced',  label: 'Bounced',  color: '#ef4444', rank: 4 },
  chasing:  { id: 'chasing',  label: 'Chasing',  color: '#d97706', rank: 3 },
  quiet:    { id: 'quiet',    label: 'No reply', color: '#7d8a7f', rank: 2 },
  sent:     { id: 'sent',     label: 'Sent',     color: '#3b82f6', rank: 1 },
}

// After this long with no answer, "Sent" stops being news and becomes a
// problem worth its own colour.
export const QUIET_AFTER_DAYS = 7

const parse = (d) => { const t = Date.parse(d || ''); return Number.isFinite(t) ? t : null }

export function sentAt(quote) {
  return parse(quote?.last_sent_at) ?? parse(quote?.sent_date)
}

/**
 * quote           — a quotes row (last_sent_at/sent_date/email_status/followup_count/status)
 * unreadReplies   — count of customer messages on it that nobody has read
 * now             — injectable for tests
 *
 * Returns null when there is nothing worth saying: an estimate that was never
 * sent has no conversation, and a badge on it would be noise.
 */
export function estimateCommsBadge(quote, { unreadReplies = 0, now = Date.now() } = {}) {
  if (!quote) return null
  const sent = sentAt(quote)
  if (!sent) return null

  // A reply outranks everything, including a bounce on an earlier send — a
  // human being waiting on an answer is the most urgent thing a board can show.
  if (unreadReplies > 0) {
    return {
      ...COMMS.replied,
      count: unreadReplies,
      title: `${unreadReplies} unread ${unreadReplies === 1 ? 'reply' : 'replies'} — open the estimate to read ${unreadReplies === 1 ? 'it' : 'them'}`,
    }
  }

  if (quote.email_status === 'bounced') {
    return { ...COMMS.bounced, title: 'The estimate email bounced — the address is probably wrong' }
  }

  const days = Math.floor((now - sent) / 86400000)
  const chases = quote.followup_count || 0

  if (chases > 0) {
    return {
      ...COMMS.chasing,
      count: chases,
      title: `${chases} follow-up${chases === 1 ? '' : 's'} sent, no reply yet`,
    }
  }

  if (days >= QUIET_AFTER_DAYS) {
    return { ...COMMS.quiet, title: `Sent ${days} days ago with no reply` }
  }

  return { ...COMMS.sent, title: days <= 0 ? 'Sent today' : `Sent ${days} day${days === 1 ? '' : 's'} ago` }
}

// A lead can carry several estimates. The card shows the one that most needs
// attention, which is the same ordering as above — otherwise a replied-to
// estimate could hide behind a freshly sent one.
export function leadCommsBadge(quotes, unreadByQuoteId = {}, now = Date.now()) {
  let best = null
  for (const q of quotes || []) {
    const badge = estimateCommsBadge(q, { unreadReplies: unreadByQuoteId[q.id] || 0, now })
    if (badge && (!best || badge.rank > best.rank)) best = badge
  }
  return best
}
