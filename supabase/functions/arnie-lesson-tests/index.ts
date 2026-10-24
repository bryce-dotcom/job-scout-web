// arnie-lesson-tests — every rule a company taught Arnie, tested every night
// on that company's own data (the learning loop, part 3; Bryce, 2026-10-23).
//
// pg_cron calls this every ten minutes from 03:00 to 05:50 Mountain (migration
// 20261024120000). Each call:
//   1. writes a test for up to two active rules that have none — a question a
//      teammate would ask where the rule decides the answer, and what a right
//      answer must do;
//   2. runs up to three tests not run in the last 20 hours: one real Arnie
//      turn as an employee of that company, LOOK-UPS ONLY (lesson_test — no
//      card, email, text or computer step can happen), then grades the answer
//      against the rule.
// Results are kept on arnie_lesson_tests; Monday's review shows a broken rule.
//
// { rule_id } runs that one rule's test now (writing it first if needed).
// Servers only (isCronCaller).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isCronCaller } from "../_shared/cronAuth.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { liveArnieModel, textOf } from "../_shared/arnieModel.ts";
import { runArnieTurn, plainText } from "../_shared/arnieHeadless.ts";
import { TEST_WRITER, TEST_GRADER, parseTest, parseGrade } from "../_shared/arnieLessons.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const WRITE_PER_RUN = 2
const RUN_PER_RUN = 3

serve(async (req) => {
  const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!(await isCronCaller(req, { url: URL_, key: KEY }))) return json({ error: 'servers only' }, 401)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  const get = async (p: string) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
  const body = await req.json().catch(() => ({})) as Record<string, any>
  const one = Number(body.rule_id) > 0 ? Number(body.rule_id) : null
  const written: any[] = [], ran: any[] = []

  try {
    // 1. Rules with no test yet.
    const rules: any[] = await get(`company_rules?select=id,company_id,rule,taught_by_employee_id&active=eq.true${one ? `&id=eq.${one}` : ''}&order=created_at&limit=500`)
    const have = new Set((await get(`arnie_lesson_tests?select=rule_id${one ? `&rule_id=eq.${one}` : ''}&limit=5000`)).map((t: any) => Number(t.rule_id)))
    for (const rule of rules.filter((x) => !have.has(Number(x.id))).slice(0, one ? 1 : WRITE_PER_RUN)) {
      const ai = await callAnthropic({ feature: 'arnie-lesson-tests', companyId: rule.company_id }, {
        model: await liveArnieModel(), max_tokens: 3000, output_config: { effort: 'low' },
        system: TEST_WRITER, messages: [{ role: 'user', content: `The rule: ${rule.rule}` }],
      })
      const t = ai.ok ? parseTest(textOf(ai.data)) : null
      if (!t) continue
      await fetch(`${URL_}/rest/v1/arnie_lesson_tests`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ company_id: rule.company_id, rule_id: rule.id, question: t.question, must: t.must }) })
      written.push({ rule_id: rule.id, ...t })
    }

    // 2. Tests that are due, on rules still active.
    const due = new Date(Date.now() - 20 * 3600_000).toISOString()
    const tests: any[] = await get(one
      ? `arnie_lesson_tests?select=*,rule:company_rules!inner(id,rule,active,taught_by_employee_id)&rule_id=eq.${one}&rule.active=eq.true`
      : `arnie_lesson_tests?select=*,rule:company_rules!inner(id,rule,active,taught_by_employee_id)&rule.active=eq.true&or=(last_run_at.is.null,last_run_at.lt.${due})&order=last_run_at.asc.nullsfirst&limit=${RUN_PER_RUN}`)
    for (const t of tests) {
      const emp = await whoAsks(get, t.company_id, t.rule?.taught_by_employee_id)
      if (!emp) { ran.push({ id: t.id, skipped: 'no active employee to ask as' }); continue }
      const turn = await runArnieTurn({ url: URL_, key: KEY, internalKey: Deno.env.get('ARNIE_INTERNAL_KEY') || undefined }, {
        employee: emp, messages: [{ role: 'user', content: t.question }], cards: [], lessonTest: true,
      })
      const answer = plainText(turn.text || '').replace(/⟦receipt⟧[\s\S]*$/, '').trim()
      let grade: { pass: boolean; why: string } | null = null
      if (answer) {
        const ai = await callAnthropic({ feature: 'arnie-lesson-tests', companyId: t.company_id }, {
          model: await liveArnieModel(), max_tokens: 3000, output_config: { effort: 'low' },
          system: TEST_GRADER,
          messages: [{ role: 'user', content: `The rule: ${t.rule.rule}\n\nThe question: ${t.question}\n\nA right answer must: ${t.must}\n\nThe answer it gave:\n${answer.slice(0, 6000)}` }],
        })
        grade = ai.ok ? parseGrade(textOf(ai.data)) : null
      }
      // No answer, or a grade that could not be read, is not a pass — and not
      // a failure of the rule either: it is recorded as unknown (null).
      const passed = grade ? grade.pass : null
      await fetch(`${URL_}/rest/v1/arnie_lesson_tests?id=eq.${t.id}`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({
          last_run_at: new Date().toISOString(), last_passed: passed,
          last_answer: answer.slice(0, 4000) || (turn.error ? `(no answer: ${turn.error})` : '(no answer)'),
          last_why: grade?.why || (answer ? 'the grade could not be read' : 'no answer came back'),
          runs: (t.runs || 0) + 1,
          fails: (t.fails || 0) + (passed === false ? 1 : 0),
          fails_in_a_row: passed === false ? (t.fails_in_a_row || 0) + 1 : passed === true ? 0 : (t.fails_in_a_row || 0),
        }),
      })
      ran.push({ id: t.id, rule_id: t.rule_id, passed, why: grade?.why || null })
    }
    if (written.length || ran.length) console.log('[arnie-lesson-tests]', JSON.stringify({ written: written.length, ran }))
    return json({ written, ran })
  } catch (e) {
    console.error('[arnie-lesson-tests]', (e as Error)?.message)
    return json({ error: String((e as Error)?.message || e).slice(0, 300), written, ran }, 500)
  }
})

/** Who the test asks as: whoever taught the rule, else an admin of the company. Active only. */
async function whoAsks(get: (p: string) => Promise<any>, companyId: number, taughtBy: number | null) {
  const sel = 'id,company_id,email,phone,name,role,user_role,is_admin,is_developer,has_hr_access,active'
  if (taughtBy) {
    const [e] = await get(`employees?select=${sel}&id=eq.${taughtBy}&company_id=eq.${companyId}&active=eq.true&limit=1`)
    if (e) return e
  }
  const [a] = await get(`employees?select=${sel}&company_id=eq.${companyId}&active=eq.true&or=(user_role.in.(Owner,Admin,%22Super%20Admin%22),is_admin.eq.true)&order=id&limit=1`)
  return a || null
}
