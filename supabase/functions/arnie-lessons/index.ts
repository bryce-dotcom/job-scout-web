// arnie-lessons — the week's corrections, drafted as rules waiting for an admin
// (the learning loop, part 2; Bryce, 2026-10-23). Called by the Monday review
// (api/cron/arnie-review.js) for one company at a time; servers only.
//
//   POST { company_id, corrections: [{ who, said, before, when }], dry }
//   → { lessons: [{ rule, who, said, proposal_id }], considered }
//
// Each lesson is a company_rule SUGGESTION drafted through the same rail as
// "Jenny, new rule" (proposeCreate → prepareCompanyRule), in the name of the
// person whose correction taught it, with their level forced to "not an
// admin" so it can only ever wait for an admin. Exact duplicates of a rule are
// refused there; near-duplicates are left out by the model, which is shown the
// rules and the waiting suggestions. dry=true drafts nothing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isCronCaller } from "../_shared/cronAuth.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { liveArnieModel, textOf } from "../_shared/arnieModel.ts";
import { activeRules } from "../_shared/arnieCompanyRules.ts";
import { proposeCreate } from "../_shared/arnieCreate.ts";
import { LESSON_SYSTEM, lessonPrompt, parseVerdicts, type Correction } from "../_shared/arnieLessons.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const MAX = 40

serve(async (req) => {
  const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!(await isCronCaller(req, { url: URL_, key: KEY }))) return json({ error: 'servers only' }, 401)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  const r = { url: URL_, key: KEY }
  const body = await req.json().catch(() => ({})) as Record<string, any>
  const companyId = Number(body.company_id)
  if (!Number.isInteger(companyId) || companyId <= 0) return json({ error: 'company_id?' }, 400)
  const corrections: Correction[] = (Array.isArray(body.corrections) ? body.corrections : [])
    .slice(0, MAX)
    .map((c: any, i: number) => ({ i, who: String(c?.who || ''), said: String(c?.said || ''), before: String(c?.before || ''), when: c?.when }))
    .filter((c: Correction) => c.said.trim())
  if (!corrections.length) return json({ lessons: [], considered: 0 })

  try {
    const rules = (await activeRules(r, companyId)).map((x: any) => String(x.rule))
    const pend = await (await fetch(`${URL_}/rest/v1/arnie_proposals?select=payload&company_id=eq.${companyId}&target=eq.company_rule&status=eq.pending&limit=50`, { headers: H })).json().catch(() => [])
    const waiting = (Array.isArray(pend) ? pend : []).flatMap((p: any) => Array.isArray(p?.payload?.columns?.rules) ? p.payload.columns.rules : []).map(String)

    const ai = await callAnthropic(
      { feature: 'arnie-lessons', companyId },
      {
        model: await liveArnieModel(),
        max_tokens: 6000,
        output_config: { effort: 'medium' },
        system: LESSON_SYSTEM,
        messages: [{ role: 'user', content: lessonPrompt(corrections, rules, waiting) }],
      },
    )
    if (!ai.ok) return json({ error: ai.friendly || 'the model did not answer', lessons: [] }, 503)
    const verdicts = parseVerdicts(textOf(ai.data), corrections.length).filter((v) => v.lesson && v.rule)

    // Who taught it: their employee row, if the address is one of this company's.
    const emails = [...new Set(verdicts.map((v) => corrections[v.i].who.toLowerCase()).filter(Boolean))]
    const staff = emails.length
      ? await (await fetch(`${URL_}/rest/v1/employees?select=id,email&company_id=eq.${companyId}&email=in.(${emails.map((e) => `"${e}"`).join(',')})`, { headers: H })).json().catch(() => [])
      : []
    const idOf = new Map((Array.isArray(staff) ? staff : []).map((e: any) => [String(e.email).toLowerCase(), e.id]))

    const lessons: any[] = []
    for (const v of verdicts) {
      const c = corrections[v.i]
      const lesson = { rule: v.rule, who: c.who, said: c.said, why: v.why, proposal_id: null as number | null }
      if (body.dry) { lessons.push(lesson); continue }
      const email = c.who.toLowerCase() || 'weekly-review@jobscout'
      const res = await proposeCreate(r, { email, companyId, employeeId: idOf.get(email) ?? null, role: 'user', level: 0 }, {
        target: 'company_rule',
        fields: { rules: JSON.stringify([v.rule]), topic: 'weekly review', source: 'chat' },
        request_text: `From the weekly review — ${c.who.split('@')[0]} corrected the assistant: "${c.said.replace(/\s+/g, ' ').slice(0, 300)}"`,
      })
      if ('proposal' in res && res.proposal?.id) { lesson.proposal_id = res.proposal.id; lessons.push(lesson) }
      // An exact duplicate of a rule is refused there — nothing to add.
    }
    return json({ lessons, considered: corrections.length })
  } catch (e) {
    console.error('[arnie-lessons]', (e as Error)?.message)
    return json({ error: String((e as Error)?.message || e).slice(0, 300), lessons: [] }, 500)
  }
})
