// Vercel cron — every night, close what is provably fixed and tell whoever
// reported it.
//
// Bryce: "lets create a cycle that checks feedback everyday after hours and
// also makes sure we always mark the tickets status and send a message."
//
// The failure this removes: things get fixed and nobody is told. From the
// reporter's side that is indistinguishable from being ignored, which is why
// several tickets were filed twice. Twenty-five resolved tickets were sitting
// with no reply when this was written.
//
// The bar for closing is deliberately high — a commit must quote the ticket
// back word for word. A wrongly closed ticket is worse than a late one: the bug
// stops being tracked AND the reporter is told it is done. Anything short of
// proof is left open and counted in the summary instead.
//
// Runs 03:00 UTC — 9pm Mountain, after hours, so nobody gets a burst of mail
// mid-shift.

const { createClient } = require('@supabase/supabase-js')

const REPO = 'bryce-dotcom/job-scout-web'
const ADMIN_EMAIL = 'bryce@hhh.services'
const COMMIT_PAGES = 3          // the 300 most recent commits
const MAX_CLOSE_PER_RUN = 25    // a bad match must not empty the queue overnight

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })

  try {
    // The same rules the by-hand matcher uses. Shared, so the nightly job and a
    // person running it can never disagree about what counts as proof.
    const { quotedMatch, resolutionNote, resolutionMessage, isAutomatedReporter, touchesProductCode } =
      await import('../../src/lib/feedbackMatch.js')

    const sb = createClient(url, key, { auth: { persistSession: false } })

    const { data: open, error: openErr } = await sb
      .from('feedback')
      .select('id, company_id, created_at, user_email, subject, message, feedback_type, status, reply_history')
      .in('status', ['new', 'in_progress'])
    if (openErr) return res.status(500).json({ error: `feedback: ${openErr.message}` })

    // Recent commits, read from the public repo.
    const commits = []
    for (let p = 1; p <= COMMIT_PAGES; p++) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=100&page=${p}`, {
        headers: { 'User-Agent': 'jobscout-feedback-sweep', Accept: 'application/vnd.github+json' },
      })
      if (!r.ok) break
      const batch = await r.json()
      if (!Array.isArray(batch) || batch.length === 0) break
      for (const c of batch) {
        const msg = (c && c.commit && c.commit.message) || ''
        const nl = msg.indexOf('\n')
        commits.push({
          hash: c.sha,
          iso: (c.commit.author && c.commit.author.date) || (c.commit.committer && c.commit.committer.date) || '',
          subject: nl === -1 ? msg : msg.slice(0, nl),
          body: nl === -1 ? '' : msg.slice(nl + 1),
        })
      }
    }
    // A sweep that could not read the commits must not report "nothing to do".
    if (commits.length === 0) {
      return res.status(500).json({ error: 'could not read commits from GitHub; not treating that as nothing to close' })
    }

    // ── close what is proven ──
    const closed = []
    for (const t of open) {
      if (closed.length >= MAX_CLOSE_PER_RUN) break
      const m = quotedMatch(t, commits)
      if (!m) continue
      // Quoting a ticket is not fixing it. The first live run closed a crash
      // that was still happening, because a commit about the MATCHER quoted
      // the crash text as an example. A fix touches product code.
      let files = []
      try {
        const d = await fetch(`https://api.github.com/repos/${REPO}/commits/${m.commit.hash}`, {
          headers: { 'User-Agent': 'jobscout-feedback-sweep', Accept: 'application/vnd.github+json' },
        })
        if (d.ok) files = (await d.json()).files || []
      } catch { files = [] }
      if (!touchesProductCode(files)) continue

      const note = resolutionNote(m.commit)
      const { error } = await sb.from('feedback').update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: 'nightly-sweep',
        notes: note,
      }).eq('id', t.id)
      if (error) continue
      closed.push({ ticket: t, commit: m.commit })
    }

    // ── tell people ──
    // Anything resolved that records which commit fixed it and has had no
    // reply. This is the half that kept being skipped.
    const { data: owed } = await sb
      .from('feedback')
      .select('id, user_email, subject, message, feedback_type, notes, reply_history, created_at')
      .eq('status', 'resolved')
      .is('reply_message', null)
      .not('notes', 'is', null)
      .limit(50)

    const sent = []
    const skipped = []
    for (const t of (owed || [])) {
      if (isAutomatedReporter(t.user_email)) { skipped.push(t.id); continue }
      // Rebuild the commit line from the stored note so the message names the
      // real fix rather than just saying "resolved".
      const mm = /^Resolved by commit ([0-9a-f]+) \(([\d-]+)\): (.*)$/.exec(String(t.notes || ''))
      if (!mm) { skipped.push(t.id); continue }
      const body = resolutionMessage({
        ticket: t,
        commit: { hash: mm[1], iso: `${mm[2]}T00:00:00Z`, subject: mm[3] },
      })
      let ok = false
      try {
        const r = await fetch(`${url}/functions/v1/send-feedback-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon },
          body: JSON.stringify({
            recipient_email: t.user_email,
            subject: t.subject || t.feedback_type,
            original_message: t.message,
            reply_message: body,
            feedback_type: t.feedback_type,
          }),
        })
        ok = r.ok
      } catch { ok = false }
      if (!ok) { skipped.push(t.id); continue }
      await sb.from('feedback').update({
        reply_message: body,
        replied_at: new Date().toISOString(),
        reply_history: [...(t.reply_history || []), { message: body, sent_at: new Date().toISOString() }],
      }).eq('id', t.id)
      sent.push(t.id)
    }

    // ── what is left, so a quiet night is never mistaken for an empty queue ──
    const { count: stillOpen } = await sb.from('feedback')
      .select('id', { count: 'exact', head: true }).in('status', ['new', 'in_progress'])
    const { count: stillOwed } = await sb.from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'resolved').is('reply_message', null)

    if (closed.length || sent.length) {
      const lines = []
      if (closed.length) {
        lines.push(`Closed ${closed.length}:`)
        for (const c of closed) lines.push(`  - ${c.ticket.subject || '(no subject)'} — ${c.commit.subject}`)
        lines.push('')
      }
      if (sent.length) lines.push(`Replied to ${sent.length} reporter${sent.length === 1 ? '' : 's'}.`, '')
      lines.push(`${stillOpen == null ? '?' : stillOpen} tickets still open. ${stillOwed == null ? '?' : stillOwed} resolved tickets still owe a reply.`)
      lines.push('')
      lines.push('Only tickets whose fix commit quotes the report word for word are closed here.')
      lines.push('Anything less certain is left open on purpose.')
      const summary = lines.join('\n')
      const subject = `Feedback sweep: ${closed.length} closed, ${sent.length} answered`

      await sb.from('feedback').insert({
        company_id: 3,
        user_email: 'system@jobscout',
        page_url: '/admin/feedback',
        feedback_type: 'feedback',
        subject,
        message: summary,
        status: 'resolved',
      })
      try {
        await fetch(`${url}/functions/v1/send-feedback-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon },
          body: JSON.stringify({
            recipient_email: ADMIN_EMAIL,
            subject,
            original_message: 'Nightly feedback sweep',
            reply_message: summary,
            feedback_type: 'feedback',
          }),
        })
      } catch { /* the summary is already a ticket; email is the second copy */ }
    }

    return res.status(200).json({
      commits: commits.length,
      considered: open.length,
      closed: closed.length,
      replied: sent.length,
      skipped: skipped.length,
      stillOpen,
      stillOwed,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
