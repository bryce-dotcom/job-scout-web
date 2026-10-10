// The EOS page's Send button.
//
// The page can already PRINT the itinerary on its own (jsPDF in the browser),
// but emailing it and putting it in people's notifications needs the service
// key, and employee_notifications is not a table a browser may write to.
//
// The important choice here: this function does NOT accept an agenda. The
// browser sends only the knobs — which day, who to, which channel, which unit —
// and the agenda is BUILT here from the company's own EOS settings with the
// same builder Arnie uses. If it took the document, anyone with a login could
// have arbitrary text emailed to the whole leadership team from the company's
// own address.
//
// The one thing the browser legitimately supplies is the week's scorecard
// NUMBERS, because the EOS page is the only place they exist (AUTO_SOURCES runs
// against the loaded store). They are accepted as numbers keyed by metric id,
// coerced, and anything else is dropped — they can land in a table cell and
// nowhere else.
//
// Gate: Manager and up, the same as the Management menu the EOS page sits in.

import { resolveCaller } from '../_shared/auth.ts'
import { readEosBundle, resolveRecipients } from '../_shared/arnieEos.ts'
import { buildL10Agenda, calDay } from '../_shared/l10Agenda.ts'
import { CHANNELS, sendAgenda, type Channel } from '../_shared/l10Send.ts'
import { agendaSubject } from '../_shared/l10AgendaRender.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// deno-lint-ignore no-explicit-any
type Any = any
const str = (v: unknown) => (v == null ? '' : String(v)).trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller || caller.companyId == null) return json({ success: false, error: 'Sign in first.' }, 401)
    if (caller.level < 2) return json({ success: false, error: 'Sending the L10 agenda is manager and up, the same as the EOS page.' }, 403)

    const body = await req.json().catch(() => ({})) as Any
    const channel = (str(body.how).toLowerCase() || 'both') as Channel
    if (!CHANNELS.includes(channel)) return json({ success: false, error: `Send it by email, in the app, or both — not "${body.how}".` })

    const r = { url: SUPABASE_URL, key: SERVICE_KEY }
    const { eos, employees, company } = await readEosBundle(r, caller.companyId)

    // Only a real calendar day is honoured; the page sends one or nothing.
    const day = str(body.when) ? calDay(str(body.when)) || null : null
    const entity = str(body.unit) || null

    // The numbers: finite numbers only, keyed by a metric id that exists on
    // this company's scorecard. Anything else is not a number this company
    // measures and does not belong in its agenda.
    let numbers: Record<string, Any> | null = null
    const ids = new Set((eos.scorecard || []).map((m: Any) => String(m.id)))
    if (body.numbers && typeof body.numbers === 'object') {
      numbers = {}
      for (const [k, v] of Object.entries(body.numbers as Any)) {
        if (!ids.has(String(k)) || !v || typeof v !== 'object') continue
        const tw = Number((v as Any).thisWeek)
        const lw = Number((v as Any).lastWeek)
        numbers[String(k)] = {
          thisWeek: Number.isFinite(tw) ? tw : null,
          lastWeek: Number.isFinite(lw) ? lw : null,
          label: str((v as Any).label).slice(0, 24) || null,
        }
      }
      if (!Object.keys(numbers).length) numbers = null
    }

    const agenda = buildL10Agenda({ eos, employees, day, entity, numbers })
    const { picked, missing } = resolveRecipients(agenda, employees, str(body.to))
    if (missing.length) return json({ success: false, error: `Nobody on the team matches ${missing.map((m) => `"${m}"`).join(', ')}.` })
    if (!picked.length) {
      return json({ success: false, error: 'Nobody on the EOS page owns a scorecard number, a rock, a to-do or a seat, so there is no room to send it to. Set the owners on the EOS page, or name who should get it.' })
    }

    const sent = await sendAgenda(r, caller.companyId, { agenda, recipients: picked, channel, company })
    if (!sent.ok) return json({ success: false, error: sent.error })

    return json({
      success: true,
      subject: agendaSubject(agenda),
      meeting_on: agenda.meeting_on,
      recipients: picked.map((p: Any) => ({ name: p.name, email: p.email })),
      ...sent.result,
    })
  } catch (e) {
    return json({ success: false, error: (e as Error)?.message || 'Something went wrong sending the agenda.' })
  }
})
