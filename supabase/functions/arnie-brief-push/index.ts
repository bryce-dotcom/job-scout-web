// arnie-brief-push — sends the morning brief to everyone whose hour it is.
//
// Called hourly by a Vercel cron (api/cron/arnie-brief-push.js) with the
// SERVICE ROLE key, never by a person. For each enabled subscription whose
// local hour is now and which has not gone out today in its own zone, it
// builds the same brief Arnie gives in chat — scoped to that employee's
// login, not the cron's — asks the model to write it in Arnie's voice, and
// sends it by email (Resend) or SMS (the tenant's Twilio, via send-sms).
//
// If the model is unavailable the brief still goes, as a plain list. A
// morning brief that does not arrive because an AI vendor is down is a
// worse failure than one that arrives without the jokes.
//
// Body (all optional): { dry_run: true } builds and returns everything
// without sending; { employee_id } forces one person regardless of hour.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { callAnthropic } from '../_shared/anthropic.ts'
import { accessLevel, LEVEL_ROLE, type Caller } from '../_shared/auth.ts'
import { dailyBrief } from '../_shared/arnieBrief.ts'
import { tzOffsetMinutes } from '../_shared/arnieTime.ts'
import { readRecordList } from '../_shared/arnieRest.ts'
import { isServiceRole, sendArnieEmail, sendArnieSms } from '../_shared/arnieSend.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const r = { url: SUPABASE_URL, key: SERVICE_KEY }
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const localNow = (tz: string) => {
  const now = new Date()
  const shifted = new Date(now.getTime() + tzOffsetMinutes(tz, now) * 60000)
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), dow: shifted.getUTCDay() }
}

/** The employee as a Caller — the same mapping resolveCaller does from a JWT. */
function callerFor(emp: any): Caller {
  const level = Math.max(accessLevel(emp), emp.is_admin === true ? 3 : 0)
  return { email: emp.email, companyId: emp.company_id, employeeId: emp.id, role: LEVEL_ROLE[level] || 'user', level }
}

// ── rendering ──────────────────────────────────────────────────────────────

/** Arnie's voice, from the same rules the chat uses. Short: this is read on a phone at 6am. */
async function writeBrief(brief: any, name: string, channel: string): Promise<{ text: string; byModel: boolean }> {
  const first = String(name || '').split(' ')[0] || 'boss'
  const limit = channel === 'sms' ? 'Under 400 characters total. Plain text. No headings.' : 'Under 200 words. Short headed sections in plain text (no markdown symbols), numbers plain.'
  const system = `You are OG Arnie, JobScout's old-school assistant, writing ${first}'s morning brief to be SENT, not chatted.
Lead with what needs ACTION, in this order: a job today with nobody on it, a shift still open from a previous day, an appointment in the next hours, then the money. Skip empty sections — never list zeros. End with the one thing you would do first.
Warm, direct, a little salty. No emojis. No tool names. No markdown asterisks or pound signs — this is plain text. ${limit}
Everything you say comes from the brief below. Do not add or guess. The my_day section is about ${first} — say "you", never a third person. Any person you name must appear by name in the brief; if no name is there, there is no person.`
  const ai = await callAnthropic({ feature: 'arnie-brief-push', companyId: brief.company_id ?? null }, {
    model: 'claude-sonnet-4-5-20250929', max_tokens: 700, system,
    messages: [{ role: 'user', content: JSON.stringify(brief) }],
  })
  const text = ai.ok ? String((ai.data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')).trim() : ''
  if (text) return { text, byModel: true }
  return { text: plainBrief(brief, first), byModel: false }
}

/** The fallback: the brief as a list, action first. Never wrong, never charming. */
function plainBrief(b: any, first: string): string {
  const L: string[] = [`Morning ${first} — your brief for ${b.date}.`]
  const my = b.my_day || {}, team = b.team_day || {}, money = b.money || {}
  if (team.jobs_today_with_no_crew?.length) L.push(`NO CREW: ${team.jobs_today_with_no_crew.map((j: any) => j.job).join('; ')}`)
  if (my.open_shift_from_earlier_day?.length) L.push(`You are still clocked in from ${String(my.open_shift_from_earlier_day[0].clocked_in).slice(0, 16)} — close it or it will not pay right.`)
  if (team.open_shifts_from_earlier_days?.length) L.push(`Open shifts: ${team.open_shifts_from_earlier_days.map((s: any) => s.who).filter(Boolean).join(', ')}`)
  if (my.appointments?.length) L.push(`Your appointments: ${my.appointments.map((a: any) => `${a.time} ${a.title}`).join('; ')}`)
  if (my.sections_scheduled?.length) L.push(`Your work today: ${my.sections_scheduled.map((s: any) => `${s.section} — ${s.job}`).join('; ')}`)
  if (team.appointments_today) L.push(`Team appointments today: ${team.appointments_today}`)
  if (team.stale_quotes?.count) L.push(`Stale quotes: ${team.stale_quotes.count} worth $${team.stale_quotes.total}`)
  if (money.overdue_invoices) L.push(`Overdue invoices: ${money.overdue_invoices}, $${money.overdue_owed} owed`)
  if (my.owed_to_me_now) L.push(`Owed to you right now: $${my.owed_to_me_now}`)
  if (L.length === 1) L.push('Nothing needs your attention. Good day to get ahead.')
  return L.join('\n')
}

// ── sending: _shared/arnieSend.ts, shared with arnie-nudge ────────────────

// ── the run ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  // Service role only. A person asks Arnie for their brief; only the cron
  // may push everyone's. The gateway (verify_jwt) has already checked the
  // signature, so the claims are trustworthy — and comparing the raw key
  // string is wrong: a project can hold more than one valid service key
  // (rotation), and the one in the edge runtime need not be the one the
  // cron was given.
  if (!isServiceRole(req)) return json({ error: 'service role only' }, 401)

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dry_run === true
  const only = body?.employee_id ? Number(body.employee_id) : null

  const subs = await readRecordList(r, `arnie_brief_subscriptions?select=*&enabled=eq.true${only ? `&employee_id=eq.${only}` : ''}`)
  const results: any[] = []
  for (const s of subs) {
    const { date, hour, dow } = localNow(s.timezone)
    const due = only ? true : (hour === s.hour_local && s.last_sent_on !== date && !(s.weekdays_only && (dow === 0 || dow === 6)))
    if (!due) continue
    const [emp] = await readRecordList(r, `employees?select=id,name,email,phone,company_id,role,user_role,is_admin,is_developer,active&id=eq.${s.employee_id}&limit=1`)
    if (!emp || emp.active === false) { results.push({ employee_id: s.employee_id, skipped: 'no active employee' }); continue }
    const caller = callerFor(emp)
    const out: any = { employee_id: emp.id, name: emp.name, channel: s.channel, date }
    try {
      const brief = await dailyBrief(r, caller, { date, timezone: s.timezone })
      const { text, byModel } = await writeBrief({ ...brief, company_id: emp.company_id }, emp.name, s.channel)
      out.by_model = byModel; out.chars = text.length
      if (dryRun) { out.text = text; results.push(out); continue }
      const to = s.channel === 'sms' ? String(emp.phone || '').trim() : String(emp.email || '').trim()
      const sent = !to ? { sent: false, error: `no ${s.channel === 'sms' ? 'phone' : 'email'} on the employee` }
        : s.channel === 'sms' ? await sendArnieSms(r, emp.company_id, to, text, { trigger: 'arnie_brief', employee_id: emp.id })
        : await sendArnieEmail(to, `Your morning brief, ${String(emp.name).split(' ')[0]}`, `Morning brief — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`, text)
      out.sent = sent.sent; if (sent.error) out.error = sent.error
      await fetch(`${SUPABASE_URL}/rest/v1/arnie_brief_subscriptions?id=eq.${s.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify(sent.sent ? { last_sent_on: date, last_error: null, updated_at: new Date().toISOString() } : { last_error: sent.error || 'send failed', updated_at: new Date().toISOString() }) })
    } catch (e) {
      out.error = (e as Error).message
      await fetch(`${SUPABASE_URL}/rest/v1/arnie_brief_subscriptions?id=eq.${s.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ last_error: out.error, updated_at: new Date().toISOString() }) })
    }
    results.push(out)
  }
  return json({ ok: true, checked: subs.length, due: results.length, dry_run: dryRun, results })
})
