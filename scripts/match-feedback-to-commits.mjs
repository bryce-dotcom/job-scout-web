// Which open feedback tickets have actually been fixed already?
//
// Bryce: "looking throught the feedback we have fixed many of them but they are
// not marked as fixed."
//
// Marking a ticket resolved that ISN'T is worse than leaving it open — the bug
// stops being tracked and nobody looks at it again. So nothing here is matched
// on vibes. The strong signal is that fix commits quote the ticket verbatim
// ("Tracy: I am struggling to categorize each transaction..."), so a run of
// consecutive words from the ticket appearing in a commit body is near-proof
// that commit was written in response to that ticket.
//
// Two tiers, and only the first is safe to apply unattended:
//   QUOTED  — a long verbatim run from the ticket appears in a commit message
//   LIKELY  — reporter's name plus heavy distinctive-word overlap; eyeball it
//
//   npx vite-node scripts/match-feedback-to-commits.mjs
//   npx vite-node scripts/match-feedback-to-commits.mjs --write --approve
//   npx vite-node scripts/match-feedback-to-commits.mjs --write --approve --include-likely

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const WRITE = process.argv.includes('--write')
const APPROVE = process.argv.includes('--approve')
const INCLUDE_LIKELY = process.argv.includes('--include-likely')
if (WRITE && !APPROVE) {
  console.log('\n  --write needs --approve too. Closing a ticket that is not fixed hides a live bug; refusing.\n')
  process.exit(1)
}

// A run this long, matching word for word, does not happen by chance between a
// ticket and an unrelated commit.
const QUOTE_RUN = 6
// A verbatim run only counts as a quote if it carries this many content words.
const QUOTE_MIN_CONTENT = 2
const LIKELY_MIN_TERMS = 4

const STOP = new Set(`the a an and or but if then than that this these those there their them they
  is are was were be been being do does did doing have has had having i we you he she it not no yes
  to of in on at for with from by as about into over after before under above up down out off again
  can could would should will shall may might must just also only very more most some any each
  when where which who whom whose what why how all both few other same so too own able need needs
  get got make makes made put puts see saw look looks want wants like likes know knows think thinks
  our your its his her my me us him hers ours yours please thanks thank hi hey ok okay
  jobscout job jobs scout page pages fix fixed fixes issue issues problem problems work works working`
  .split(/\s+/).filter(Boolean))

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const words = (s) => norm(s).split(' ').filter(Boolean)
const terms = (s) => [...new Set(words(s).filter(w => w.length >= 4 && !STOP.has(w)))]

// ── commits ──────────────────────────────────────────────────────────────
const RAW = execSync('git log --no-merges --format=%H%x1f%aI%x1f%s%x1f%b%x1e', {
  cwd: path.resolve(HERE, '..'), maxBuffer: 256 * 1024 * 1024, encoding: 'utf8',
})
const commits = RAW.split('\x1e').map(c => c.trim()).filter(Boolean).map(chunk => {
  const [hash, iso, subject, body = ''] = chunk.split('\x1f')
  const date = String(iso).slice(0, 10)
  const full = `${subject}\n${body}`
  return { hash, iso, date, subject, body, full, normFull: norm(full), termSet: new Set(terms(full)) }
})

// ── tickets ──────────────────────────────────────────────────────────────
const { data: tickets, error } = await sb.from('feedback')
  .select('id, created_at, user_email, subject, message, status, feedback_type, page_url')
  .in('status', ['new', 'in_progress'])
  .order('created_at', { ascending: false })
if (error) throw new Error(`feedback: ${error.message}`)

const firstName = (email) => String(email || '').split('@')[0].split('.')[0].toLowerCase()

const quotedMatch = (ticket) => {
  const w = words(`${ticket.subject || ''} ${ticket.message || ''}`)
  if (w.length < QUOTE_RUN) return null
  const filedAt = ticket.created_at
  let best = null
  for (let i = 0; i + QUOTE_RUN <= w.length; i++) {
    for (const c of commits) {
      // Instant, not day. A crash reported at 23:00 is not fixed by a commit
      // pushed at 10:08 that morning — the day comparison said it was.
      if (c.iso < filedAt) continue
      if (!c.normFull.includes(w.slice(i, i + QUOTE_RUN).join(' '))) continue
      // Extend while it still matches, so the evidence shown is the whole
      // quoted span rather than an arbitrary six-word window.
      let end = i + QUOTE_RUN
      while (end < w.length && c.normFull.includes(w.slice(i, end + 1).join(' '))) end++
      const run = w.slice(i, end).join(' ')
      // "i need to be able to" is a six-word verbatim match between any two
      // pieces of English. A run only counts as a QUOTE if it carries content
      // words — otherwise a live bug gets closed on a coincidence of grammar.
      const content = run.split(' ').filter(x => x.length >= 4 && !STOP.has(x))
      if (content.length < QUOTE_MIN_CONTENT) continue
      if (!best || run.length > best.run.length) best = { commit: c, run, content }
    }
  }
  return best
}

const likelyMatch = (ticket) => {
  const t = terms(`${ticket.subject || ''} ${ticket.message || ''}`)
  if (t.length < LIKELY_MIN_TERMS) return null
  const name = firstName(ticket.user_email)
  const filedAt = ticket.created_at
  let best = null
  for (const c of commits) {
    // A commit cannot fix a report that did not exist yet, and the comparison
    // must be on the INSTANT — same-day granularity credited a 10:08 commit
    // with fixing a crash reported at 23:00.
    if (c.iso < filedAt) continue
    const hits = t.filter(x => c.termSet.has(x))
    if (hits.length < LIKELY_MIN_TERMS) continue
    // The reporter being named in the commit is what lifts a coincidence of
    // shared vocabulary into evidence the commit was about THIS report.
    const named = name.length > 2 && c.normFull.includes(name)
    const score = hits.length + (named ? 4 : 0)
    if (!best || score > best.score) best = { commit: c, hits, named, score }
  }
  return best && best.score >= LIKELY_MIN_TERMS + 4 ? best : null
}

const quoted = []
const likely = []
const unmatched = []

for (const t of tickets) {
  const q = quotedMatch(t)
  if (q) { quoted.push({ t, ...q }); continue }
  const l = likelyMatch(t)
  if (l) { likely.push({ t, ...l }); continue }
  unmatched.push(t)
}

const show = (t) => `${String(t.id).slice(0, 8)}  ${t.created_at.slice(0, 10)}  ${firstName(t.user_email).padEnd(12)}` +
  ` ${String(t.subject || t.message || '').replace(/\s+/g, ' ').slice(0, 44)}`

console.log(`\n${tickets.length} tickets are not marked resolved\n`)
console.log(`QUOTED IN A COMMIT (${quoted.length}) — the fix quotes the ticket back, word for word:`)
for (const { t, commit, run, content } of quoted) {
  console.log('  ' + show(t))
  console.log(`            -> ${commit.hash.slice(0, 8)} ${commit.date}  ${commit.subject.slice(0, 62)}`)
  console.log(`               quoted: "...${run}..."  [${content.length} content words]`)
}
console.log(`\nLIKELY (${likely.length}) — reporter named plus heavy overlap; needs an eyeball:`)
for (const { t, commit, hits, named } of likely) {
  console.log('  ' + show(t))
  console.log(`            -> ${commit.hash.slice(0, 8)} ${commit.date}  ${commit.subject.slice(0, 62)}`)
  console.log(`               ${named ? 'names the reporter, ' : ''}shared: ${hits.slice(0, 8).join(', ')}`)
}
console.log(`\nNO MATCH (${unmatched.length}) — left open:`)
for (const t of unmatched) console.log('  ' + show(t))

if (WRITE) {
  const targets = INCLUDE_LIKELY ? [...quoted, ...likely] : quoted
  console.log(`\n  resolving ${targets.length}${INCLUDE_LIKELY ? ' (quoted + likely)' : ' (quoted only)'}:`)
  for (const { t, commit } of targets) {
    const note = `Resolved by commit ${commit.hash.slice(0, 8)} (${commit.date}): ${commit.subject}`
    const { error: ue } = await sb.from('feedback').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: 'commit-match',
      notes: note,
    }).eq('id', t.id)
    console.log(ue ? `  FAILED ${String(t.id).slice(0, 8)}: ${ue.message}` : `  ${String(t.id).slice(0, 8)}  -> resolved (${commit.hash.slice(0, 8)})`)
  }
  console.log('\n  Done. Every resolved ticket records which commit fixed it.\n')
} else {
  console.log('\n  Report only. --write --approve resolves the QUOTED ones; add --include-likely for both.\n')
}
