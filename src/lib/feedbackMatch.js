// Deciding whether a commit fixed a ticket.
//
// Used by scripts/match-feedback-to-commits.mjs (run by hand, reads local git)
// and by the nightly sweep (runs on Vercel, reads commits from the GitHub API).
// One definition, because the two must never disagree about what counts as
// proof — the whole point is that a ticket is closed only when it IS fixed.
//
// The signal: fix commits quote the ticket back word for word. A long verbatim
// run from a ticket appearing in a commit body does not happen by accident.
//
// Everything here is pure. No database, no network, no git.

/** A verbatim run this long, carrying real words, is a quote and not a coincidence. */
export const QUOTE_RUN = 6
export const QUOTE_MIN_CONTENT = 2

const STOP = new Set(`the a an and or but if then than that this these those there their them they
  is are was were be been being do does did doing have has had having i we you he she it not no yes
  to of in on at for with from by as about into over after before under above up down out off again
  can could would should will shall may might must just also only very more most some any each
  when where which who whom whose what why how all both few other same so too own able need needs
  get got make makes made put puts see saw look looks want wants like likes know knows think thinks
  our your its his her my me us him hers ours yours please thanks thank hi hey ok okay
  jobscout job jobs scout page pages fix fixed fixes issue issues problem problems work works working`
  .split(/\s+/).filter(Boolean))

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
export const words = (s) => norm(s).split(' ').filter(Boolean)
const isContent = (w) => w.length >= 4 && !STOP.has(w)

/**
 * Did any commit quote this ticket?
 *
 * @param ticket   { created_at, subject, message }
 * @param commits  [{ hash, iso, subject, body }]
 * @returns { commit, run, content } or null
 */
export function quotedMatch(ticket, commits = []) {
  const w = words(`${ticket?.subject || ''} ${ticket?.message || ''}`)
  if (w.length < QUOTE_RUN) return null
  const filedAt = ticket?.created_at || ''
  let best = null

  for (const c of commits) {
    // A commit cannot fix a report that did not exist yet. Compared as an
    // INSTANT: same-day granularity credited a 10:08 commit with fixing a
    // crash reported at 23:00 that evening.
    if (!c?.iso || c.iso < filedAt) continue
    const hay = c._norm || (c._norm = norm(`${c.subject || ''}\n${c.body || ''}`))

    for (let i = 0; i + QUOTE_RUN <= w.length; i++) {
      if (!hay.includes(w.slice(i, i + QUOTE_RUN).join(' '))) continue
      // Extend so the evidence shown is the whole quoted span.
      let end = i + QUOTE_RUN
      while (end < w.length && hay.includes(w.slice(i, end + 1).join(' '))) end++
      const run = w.slice(i, end).join(' ')
      // "i need to be able to" matches between any two pieces of English. A run
      // is only a quote if it carries content words, or a live bug gets closed
      // on a coincidence of grammar.
      const content = run.split(' ').filter(isContent)
      if (content.length < QUOTE_MIN_CONTENT) continue
      if (!best || run.length > best.run.length) best = { commit: c, run, content }
    }
  }
  return best
}

/**
 * Did this commit change anything a user could see?
 *
 * The sweep's first live run closed a crash that was still happening, because
 * a commit ABOUT the matcher quoted the crash text as an example of what not
 * to close. Quoting a ticket is not fixing it.
 *
 * A fix touches product code. A commit that only edits scripts, docs or CI can
 * describe a bug in detail and has not fixed it. Files come from the commit
 * detail endpoint, fetched only for candidates, so this costs a handful of
 * calls per night.
 */
export function touchesProductCode(files = []) {
  const paths = (files || []).map(f => String((f && f.filename) || f || '').split('\\').join('/'))
  if (paths.length === 0) return false      // unknown: do not close on a guess
  return paths.some(p =>
    p.startsWith('src/') || p.startsWith('supabase/functions/') ||
    p.startsWith('supabase/migrations/') || p.startsWith('api/'))
}

/** The note stored on a closed ticket — and the sentence a reply is built from. */
export function resolutionNote(commit) {
  const day = String(commit?.iso || '').slice(0, 10)
  return `Resolved by commit ${String(commit?.hash || '').slice(0, 8)} (${day}): ${commit?.subject || ''}`
}

/**
 * The message sent to whoever reported it.
 *
 * Deliberately built from THEIR words and the commit's own subject line, not a
 * template. A form letter to someone who watched a bug for weeks is worse than
 * silence — they can tell. This says what they reported, that it shipped, and
 * when; it does not pretend to explain more than it knows.
 */
export function resolutionMessage({ ticket, commit, quotedRun }) {
  const day = String(commit?.iso || '').slice(0, 10)
  const theirWords = String(ticket?.message || '').replace(/\s+/g, ' ').trim()
  const excerpt = theirWords.length > 220 ? `${theirWords.slice(0, 220).trim()}…` : theirWords
  return [
    `This one is fixed and shipped.`,
    ``,
    `You reported:`,
    `  "${excerpt}"`,
    ``,
    `What went out: ${commit?.subject || 'a fix'} (${day}).`,
    ``,
    `If it still looks wrong on your screen, reply and say what you are seeing —`,
    `that is worth more than me guessing from here.`,
  ].join('\n')
}

/** Never write to these — no human is behind them. */
export function isAutomatedReporter(email) {
  const e = String(email || '').toLowerCase()
  return !e || e.endsWith('@jobscout') || e === 'system@jobscout'
}
