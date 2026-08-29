// Propose a preventive maintenance schedule for a machine.
//
// Asking an owner to invent a PM schedule is asking the wrong person. The
// intervals are in a manual they have not opened since delivery, they differ
// by make and duty cycle, and the realistic outcome of a blank "add a
// schedule" form is that nobody adds one and the fleet runs to failure.
//
// So Freddy proposes a starting set from what the machine actually is, and the
// owner edits it. A schedule they corrected is worth far more than a blank
// form they ignored.
//
// Two things this is careful about:
//
// Intervals are conservative. Being early on an oil change costs a filter;
// being late costs an engine, and the asymmetry is not close. Where a
// manufacturer range exists the short end is used.
//
// Nothing is written. The function returns proposals; a person saves them.
// A model inventing service intervals and quietly committing them to the
// schedule a business runs on is not a feature.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import { resolveCompanyId } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const CATEGORIES = ['service', 'inspection', 'safety', 'seasonal', 'other']

const SYSTEM = `You build preventive maintenance schedules for commercial fleet
vehicles and construction equipment.

Given a machine, return the services a competent shop would put on a schedule
for it. Six to ten items — enough to be a real schedule, few enough that
someone will actually read it.

Rules that matter:

Intervals: give miles for road vehicles, hours for equipment, and days where a
service is genuinely time-based (brake fluid, coolant, annual inspections).
Many services need BOTH — engine oil is "5,000 miles or 6 months, whichever
comes first" — so set both fields when both apply. That combination is the
normal case, not an edge case.

Be conservative. Being early on an oil change costs a filter; being late costs
an engine. Where manufacturers publish a range, use the short end. Where you
are unsure of a specific model's figure, use the accepted figure for that class
of machine and say so in the note.

Include the legally required items for the class — DOT annual inspection for
commercial vehicles, annual crane or lift inspection where it applies. Mark
those category "safety".

lead_days is how much warning to give: a week for an oil change, a month for
anything that needs booking or a third party.

Return ONLY this JSON, no prose and no markdown fence:
{
  "schedules": [
    {
      "name": string,
      "category": "service"|"inspection"|"safety"|"seasonal"|"other",
      "interval_miles": number|null,
      "interval_hours": number|null,
      "interval_days": number|null,
      "lead_days": number,
      "note": string|null
    }
  ],
  "basis": string   // one sentence on what these figures are drawn from
}`

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // A signed-in user proposing a schedule for one machine, or an internal
    // job generating them across a fleet. The role claim is read rather than
    // the key string compared: the value in this function's env is not
    // guaranteed to be the string the caller sent, and comparing them fails
    // silently. The platform has verified the signature by the time this runs.
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
    let role = ''
    try {
      const payload = bearer.split('.')[1]
      if (payload) role = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role || ''
    } catch { /* not a JWT */ }
    const internal = role === 'service_role'
    const companyId = internal ? null : await resolveCompanyId(req, SUPABASE_URL, SERVICE_KEY)
    if (!internal && !companyId) return json({ error: 'Sign in to build a schedule.' }, 401)

    const { make, model, model_year, asset_class, meter_basis } = await req.json().catch(() => ({}))
    if (!asset_class && !make && !model) {
      return json({ error: 'Tell Freddy what the machine is first — category, or make and model.' }, 400)
    }

    const what = [model_year, make, model].filter(Boolean).join(' ') || asset_class
    const basis = meter_basis === 'hours' ? 'hours' : 'miles'

    const ai = await callAnthropic({ feature: 'fleet-pm-suggest', companyId, req }, {
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Build a PM schedule for: ${what}`
          + (asset_class ? `\nCategory: ${asset_class.replace(/_/g, ' ')}` : '')
          + `\nThis machine is metered in ${basis}.`,
      }],
    })

    if (!ai.ok) {
      return json({ ok: false, unavailable: ai.unavailable, error: ai.friendly || 'Could not build a schedule' }, 200)
    }

    const text = (ai.data?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ ok: false, error: 'No usable schedule returned' }, 200)

    let parsed: any
    try { parsed = JSON.parse(match[0]) } catch { return json({ ok: false, error: 'Schedule was not valid JSON' }, 200) }

    const num = (v: any) => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null
    }

    // Validated on the way out, because these become the schedule a business
    // runs on. A row with no interval at all would violate the table's own
    // constraint and, worse, would sit in the list looking like a plan.
    const schedules = (Array.isArray(parsed.schedules) ? parsed.schedules : [])
      .map((s: any) => ({
        name: typeof s?.name === 'string' ? s.name.trim().slice(0, 80) : null,
        category: CATEGORIES.includes(s?.category) ? s.category : 'service',
        interval_miles: num(s?.interval_miles),
        interval_hours: num(s?.interval_hours),
        interval_days: num(s?.interval_days),
        lead_days: num(s?.lead_days) ?? 14,
        note: typeof s?.note === 'string' ? s.note.trim().slice(0, 200) : null,
      }))
      .filter((s: any) => s.name && (s.interval_miles || s.interval_hours || s.interval_days))

    if (!schedules.length) return json({ ok: false, error: 'Nothing usable came back.' }, 200)

    return json({ ok: true, schedules, basis: parsed.basis ?? null })
  } catch (err) {
    console.error('[fleet-pm-suggest]', err)
    return json({ error: (err as Error).message || 'internal error' }, 500)
  }
})
