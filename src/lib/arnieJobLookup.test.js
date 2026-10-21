import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const chat = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8').replace(/\r\n/g, '\n')

// Alayda asked for the existing fixtures on JOB-MT964ZIZ (2026-10-15). Jenny
// had no way to open one job, invented 140 fixtures it does not have, twice,
// then claimed a screenshot she never took, then said she could not email.
describe('one job, opened from its real lines', () => {
  const start = chat.indexOf("if (name === 'query_jobs' && typeof input?.job === 'string'")
  const branch = chat.slice(start, chat.indexOf("if (name === 'query_jobs') {", start))
  it('is offered on query_jobs, and runs before the counting branch', () => {
    expect(chat).toMatch(/job: \{ type: 'string', description: 'One job to open: its number \(JOB-…\)/)
    expect(start).toBeGreaterThan(-1)
    expect(start).toBeLessThan(chat.indexOf("if (name === 'query_jobs') {"))
  })
  it('finds it by number, or by the business name that lives only on the customer', () => {
    expect(branch).toMatch(/job_id: `ilike\.\$\{clean\}`/)
    expect(branch).toMatch(/sb\('customers'\)[\s\S]{0,120}name: `ilike\.\$\{pat\}`/)
    expect(branch).toMatch(/or\.push\(`customer_id\.in\.\(\$\{custIds\.join\(','\)\}\)`\)/)
  })
  it('every read is this company only', () => {
    expect(branch.match(/company_id: `eq\.\$\{companyId\}`/g).length).toBeGreaterThanOrEqual(4)
  })
  it('returns the lines with their notes, and asks rather than picking when several match', () => {
    expect(branch).toMatch(/select: 'job_id,quantity,item_id,item_name,description,notes,kind,in_utility_scope'/)
    expect(branch).toMatch(/jobs\.length > 3/)
    expect(branch).toMatch(/Do not pick one\./)
    expect(branch).toMatch(/never fill it in from the playbook/)
  })
  it('prices and the job total only for an admin', () => {
    expect(branch).toMatch(/\+ \(isAdmin \? ',job_total' : ''\)/)
    expect(branch).toMatch(/\+ \(isAdmin \? ',price,total' : ''\)/)
    expect(branch).toMatch(/\.\.\.\(isAdmin \? \{ price: l\.price, total: l\.total \} : \{\}\)/)
  })
})

describe('a step on their computer reports back, and he keeps going', () => {
  const ui = chat.slice(chat.indexOf("if (name === 'use_my_computer') {"), chat.indexOf("if (name === 'query_crew') {"))
  it('every action waits for its outcome — not "queued" and silence', () => {
    expect(ui).toMatch(/const done = await waitForDone\(employeeId, out\.action_id\)/)
    expect(ui).toMatch(/done\.decision === 'allowed'[\s\S]{0,200}Keep going until what they asked for is done/)
    expect(ui).toMatch(/done\.decision === 'failed'[\s\S]{0,200}why: done\.reason/)
    expect(ui).toMatch(/still_working: true[\s\S]{0,120}Do not say it worked/)
  })
  it('waiting reads the action row directly — never function-calls-function every second', () => {
    expect(chat).toMatch(/const look = await waitForShot\(employeeId, out\.action_id\)/)
    expect(chat).toMatch(/const done = await waitForDone\(employeeId, out\.action_id\)/)
    const waits = chat.slice(chat.indexOf('async function waitForDone'), chat.indexOf('async function actionRow'))
    expect(waits).not.toMatch(/functions\/v1\/arnie-computer/)
    expect(chat).toMatch(/arnie_computer_actions\?select=decision,reason,shot_after,completed_at&id=eq\.\$\{actionId\}&employee_id=eq\.\$\{employeeId\}/)
    expect(ui).toMatch(/if \(res\.status === 429\) \{ await new Promise\(\(r\) => setTimeout\(r, 3000\)\); res = await queueOnce\(\) \}/)
  })
  it('the last round of a computer task reports where it got to instead of stopping mid-sentence', () => {
    const s = chat.slice(chat.indexOf('async function streamWithTools'))
    expect(s).toMatch(/const outOfSteps = \(round: number\) => used\.has\('use_my_computer'\) && round === 11/)
    expect(s).toMatch(/system: \(systemPrompt \|\| ''\) \+ \(outOfSteps\(round\) \? LAST_STEP_NOTE : ''\)/)
    expect(s).toMatch(/tools: setup\.tools, \.\.\.\(outOfSteps\(round\) \? \{ tool_choice: \{ type: 'none' \} \} : forceComputer && !isNewModel\(setup\.model\) \? \{ tool_choice: \{ type: 'tool', name: 'use_my_computer' \} \} : \{\}\)/)
    expect(chat).toMatch(/Never say the job is done unless a screenshot showed it done\./)
  })
  it('a computer task gets 12 tool rounds, everything else 5', () => {
    expect(chat.match(/< \(used\.has\('use_my_computer'\) \? 12 : 5\)/g).length).toBe(2)
  })
})

describe('on their computer, the words wait for the work (Bryce, 2026-10-15)', () => {
  const s = chat.slice(chat.indexOf('async function streamWithTools'))
  it('held only for computer work; ordinary chat still streams word by word', () => {
    expect(s).toMatch(/const hold = computerAsk \|\| used\.has\('use_my_computer'\)/)
    expect(s).toMatch(/if \(hold\) pending \+= evt\.delta\.text\r?\n\s+else \{\s+send\('text', \{ delta: \(shownAny && !roundShown \? '\\n\\n' : ''\) \+ evt\.delta\.text \}\)\s+shownAny = true/)
  })
  it('a held claim is never shown — he is corrected out of sight, as unseen', () => {
    expect(s).toMatch(/if \(claim && hold\) \{[\s\S]{0,400}pending = ''[\s\S]{0,200}correctionFor\(claim, false, untraced\)[\s\S]{0,120}continue/)
  })
  it('a round that acts is shown as it acts, and a passed answer is shown at the end', () => {
    expect(s).toMatch(/if \(brief && !onComputer\) pending = ''\n\s+else flush\(\)/)
    expect(s).toMatch(/flush\(\)\n\s+send\('done', \{\}\)/)
  })
  it('short answers by default: every round held, a lookup round\'s narration dropped, computer steps kept', () => {
    expect(s).toMatch(/const brief = agent === 'arnie' && caller\.employeeId != null && \(await detailFor\(caller\.employeeId\)\) !== 'detailed'/)
    expect(s).toMatch(/const hold = computerAsk \|\| used\.has\('use_my_computer'\) \|\| brief/)
    expect(s).toMatch(/const onComputer = computerAsk \|\| used\.has\('use_my_computer'\) \|\| toolUses\.some/)
    expect(chat).toMatch(/\+ answerStyleBlock\(await detailFor\(caller\.employeeId\)\)/)
    expect(chat).toMatch(/## How much to say — SHORT \(their setting, and the default\)/)
    expect(chat).toMatch(/rows\?\.\[0\]\?\.detail === 'detailed' \? 'detailed' : 'brief'/)
  })
  it('recognises a computer ask from what they said', () => {
    const lit = chat.match(/const COMPUTER_ASK = \/(.+)\/i\n/)[1]
    const ASK = new RegExp(lit, 'i')
    for (const yes of ['open my Gmail inbox in Chrome', 'read my texts', 'put the project in TrakSmart on my computer', 'take a screenshot'])
      expect(ASK.test(yes), yes).toBe(true)
    for (const no of ['what is on JOB-MT964ZIZ', 'email me that fixture list', 'mark it won', 'Click the Bryce profile'])
      expect(ASK.test(no), no).toBe(false)   // a follow-up mid-task is held anyway: the tool was used
  })
})

describe('a status as people say it, and "moved there today" (Alayda, 2026-10-16)', () => {
  const q = chat.slice(chat.indexOf("    if (name === 'query_jobs') {"), chat.indexOf("    if (name === 'query_my_pay'"))
  it('matched against the company\'s own status list — exact first, then contains — never a bare literal', () => {
    expect(q).toMatch(/settings\?select=value&company_id=eq\.\$\{companyId\}&key=eq\.job_statuses&limit=1/)
    expect(q).toMatch(/const near = exact\.length \? exact : list\.filter\(\(s\) => norm\(s\.name\)\.includes\(want\)/)
    expect(q).toMatch(/no_such_status: String\(input\.status\), statuses: list\.map/)
  })
  it('status_changed_on filters by the local day the status changed', () => {
    expect(chat).toMatch(/status_changed_on: \{ type: 'string'/)
    expect(q).toMatch(/params\.append\('last_status_change_at', `gte\.\$\{dayStartUtc\(day, tz\)\.toISOString\(\)\}`\)/)
  })
})

describe('email it to me — and only to me', () => {
  const start = chat.indexOf("if (name === 'email_me') {")
  const branch = chat.slice(start, start + 900)
  it('is offered to everyone', () => {
    expect(chat).toMatch(/offered\.push\(EMAIL_ME_TOOL\)/)
    expect(chat).toMatch(/name: 'email_me'/)
  })
  it('the address is the signed-in person\'s, never one the model names', () => {
    expect(branch).toMatch(/await sendArnieEmail\(email, subject, subject, body, who\)/)
    expect(branch).not.toMatch(/input\??\.(to|email|address)/)
    // and the tool does not even take one
    const def = chat.slice(chat.indexOf("name: 'email_me'"), chat.indexOf('function toolsFor'))
    expect(def).not.toMatch(/\bto: \{|recipient|address: \{/)
  })
  it('from their own assistant\'s name', () => {
    expect(branch).toMatch(/const who = await assistantName\(/)
  })
})
