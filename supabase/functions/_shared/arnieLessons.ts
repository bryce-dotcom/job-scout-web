// The learning loop, part 2 (Bryce, 2026-10-23): the week's corrections become
// lessons waiting for an admin.
//
// Part 1 offers a rule in the chat, the moment someone corrects her. Most
// people will not say yes then — they are busy. So once a week the review
// reads every correction again, keeps only the ones that teach something true
// for the WHOLE company (the same test as in the chat), and drafts each as a
// company-rule SUGGESTION in the name of the person who corrected her. An
// admin approves or rejects it on Arnie → Setup, as for any suggestion.
//
// Pure helpers here; the call to the model and the drafting are in
// arnie-lessons/index.ts.

export type Correction = { i: number; who: string; said: string; before: string; when?: string }
export type LessonVerdict = { i: number; lesson: boolean; rule: string | null; why: string }

export const LESSON_SYSTEM = `You read corrections people gave their company's AI assistant this week, and pick out the ones that teach something the assistant should do for EVERYONE at the company from now on.

A LESSON is something true next time, for everyone: how this company does a thing, what a word or code means here, which kind of job or customer is which, a step the assistant keeps getting wrong.

NOT a lesson — answer lesson=false:
- One record was wrong (a job, a customer, an invoice): the record gets fixed, not a rule.
- The assistant simply looked something up wrong, or said a thing happened that did not.
- One person's own preference (that is a memory of them, not a company rule).
- Anything about money amounts, prices or anyone's pay — those are changed in the app.
- A complaint with nothing to learn from ("that's wrong", "check again", "I don't see it").
- Already covered by one of the company's rules, or by a suggestion already waiting.

Most corrections are NOT lessons. When unsure, say false.

For a lesson, write the rule as ONE plain sentence in the person's own words, the way an employee would write it on the wall ("A bulbs-only job is a relamp, and it goes in as a Service job."). No names of people, no dates, no record numbers.

Answer ONLY with JSON: [{"i": <number>, "lesson": true|false, "rule": "<sentence or null>", "why": "<a few words>"}], one entry per correction, in order.`

export function lessonPrompt(corrections: Correction[], rules: string[], waiting: string[]): string {
  return [
    `The company's rules today:\n${rules.length ? rules.map((r) => `- ${r}`).join('\n') : '(none)'}`,
    `Suggestions already waiting for an admin:\n${waiting.length ? waiting.map((r) => `- ${r}`).join('\n') : '(none)'}`,
    'The corrections, each with what the assistant had said just before:',
    ...corrections.map((c) => `#${c.i}\nThe assistant said: ${clip(c.before, 600)}\nThey replied: ${clip(c.said, 600)}`),
  ].join('\n\n')
}

/** The model's answer → verdicts. Anything unreadable is "not a lesson". */
export function parseVerdicts(text: string, count: number): LessonVerdict[] {
  const m = String(text || '').match(/\[[\s\S]*\]/)
  let arr: any[] = []
  try { arr = m ? JSON.parse(m[0]) : [] } catch { arr = [] }
  const out: LessonVerdict[] = []
  for (const v of Array.isArray(arr) ? arr : []) {
    const i = Number(v?.i)
    if (!Number.isInteger(i) || i < 0 || i >= count) continue
    const rule = typeof v?.rule === 'string' ? v.rule.replace(/\s+/g, ' ').trim().slice(0, 300) : ''
    out.push({ i, lesson: v?.lesson === true && rule.length >= 8, rule: rule || null, why: String(v?.why || '').slice(0, 120) })
  }
  return out
}

const clip = (s: string, n: number) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

// ── Part 3: every rule becomes a nightly test ──────────────────────────────

/** Writing one test for one rule: a question a teammate would really ask. */
export const TEST_WRITER = `You write ONE test for a rule a company taught its AI assistant.

Give a question an employee of this company would really type, where the rule decides what a right answer must do. The question must be answerable by LOOKING THINGS UP or from the rule itself — never by drafting, sending, scheduling or changing anything. Do not name the rule or hint at it in the question.

Then say, in one or two sentences, what a right answer MUST do or say because of the rule — the check a grader will hold the answer to. Only what the rule requires; not style, not length.

Answer ONLY with JSON: {"question": "...", "must": "..."}`

export function parseTest(text: string): { question: string; must: string } | null {
  const m = String(text || '').match(/\{[\s\S]*\}/)
  try {
    const j = m ? JSON.parse(m[0]) : null
    const question = String(j?.question || '').replace(/\s+/g, ' ').trim().slice(0, 400)
    const must = String(j?.must || '').replace(/\s+/g, ' ').trim().slice(0, 600)
    return question.length >= 8 && must.length >= 8 ? { question, must } : null
  } catch { return null }
}

/** Grading one answer against one rule. */
export const TEST_GRADER = `You grade whether a company's AI assistant followed a rule it was taught. You are given the rule, the question it was asked, what a right answer must do, and the answer it gave.

Pass it if the answer does what the rule requires. Fail it only when the answer goes against the rule or leaves out what the rule requires. Do not grade anything the rule does not cover — wording, length, or facts the rule says nothing about.

Answer ONLY with JSON: {"pass": true|false, "why": "<one short sentence>"}`

export function parseGrade(text: string): { pass: boolean; why: string } | null {
  const m = String(text || '').match(/\{[\s\S]*\}/)
  try {
    const j = m ? JSON.parse(m[0]) : null
    if (typeof j?.pass !== 'boolean') return null
    return { pass: j.pass, why: String(j.why || '').replace(/\s+/g, ' ').trim().slice(0, 300) }
  } catch { return null }
}
