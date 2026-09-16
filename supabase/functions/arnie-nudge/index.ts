// arnie-nudge — Arnie taps you on the shoulder BETWEEN morning briefs.
//
// The brief is once a day at your hour. Three things should not wait for
// tomorrow's:
//
//   quiet_quote      a sent quote nobody has touched for 10 days — the
//                    rep's own, or every rep's if you manage them. The
//                    nudge points at the follow-up rail ("say chase
//                    Halifax"), which sends in the rep's voice.
//   overdue_invoice  an invoice that tipped past its due date in the last
//                    three days, with a customer balance. Admins — money.
//   open_shift       YOUR shift, open 12+ hours. The Payroll page catches
//                    it next pay run; a text tonight catches it tonight.
//
// Called hourly by a Vercel cron (api/cron/arnie-nudge.js) with the
// service role key. Uses the morning-brief subscription for who, which
// channel, which timezone — and its `nudges` flag to opt out. One message
// per person per hour with everything due, in quiet-hours-aware local
// time (7am–9pm). Each item is nudged once, ever, per person
// (arnie_nudges unique key); a quote that goes quiet AGAIN after a
// follow-up counts as a new item.
//
// No model. These are three sentences with real names and numbers in
// them; a template cannot invent a rep called Danny.
//
// Body (all optional): { dry_run: true } builds and returns everything
// without sending or recording; { employee_id } forces one person
// regardless of hour and quiet hours.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { accessLevel } from '../_shared/auth.ts'
import { tzOffsetMinutes } from '../_shared/arnieTime.ts'
import { readRecordList } from '../_shared/arnieRest.ts'
import { isServiceRole, sendArnieEmail, sendArnieSms } from '../_shared/arnieSend.ts'
import { buildNudges, composeNudge, MAX_ITEMS, type Nudge } from '../_shared/arnieNudge.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const r = { url: SUPABASE_URL, key: SERVICE_KEY }
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const QUIET_FROM = 7, QUIET_TO = 21   // local hours a nudge may arrive, inclusive

const localNow = (tz: string) => {
  const now = new Date()
  const shifted = new Date(now.getTime() + tzOffsetMinutes(tz, now) * 60000)
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), dow: shifted.getUTCDay() }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (!isServiceRole(req)) return json({ error: 'service role only' }, 401)

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dry_run === true
  const only = body?.employee_id ? Number(body.employee_id) : null

  const subs = await readRecordList(r, `arnie_brief_subscriptions?select=*&enabled=eq.true&nudges=eq.true${only ? `&employee_id=eq.${only}` : ''}`)
  const results: any[] = []
  const perCompany = new Map<number, Promise<Awaited<ReturnType<typeof buildNudges>>>>()

  for (const s of subs) {
    const { date, hour, dow } = localNow(s.timezone)
    if (!only && (hour < QUIET_FROM || hour > QUIET_TO)) continue
    const [emp] = await readRecordList(r, `employees?select=id,name,email,phone,company_id,role,user_role,is_admin,is_developer,active&id=eq.${s.employee_id}&limit=1`)
    if (!emp || emp.active === false) { results.push({ employee_id: s.employee_id, skipped: 'no active employee' }); continue }
    const level = Math.max(accessLevel(emp), emp.is_admin === true ? 3 : 0)
    const out: any = { employee_id: emp.id, name: emp.name, channel: s.channel, date, hour }
    try {
      // The company's candidates are read once per run, then cut per person.
      if (!perCompany.has(emp.company_id)) perCompany.set(emp.company_id, buildNudges(r, emp.company_id, date))
      const all = await perCompany.get(emp.company_id)!
      const weekend = dow === 0 || dow === 6
      let mine: Nudge[] = all.filter((n) => {
        if (n.kind === 'open_shift') return String(n.employee_id) === String(emp.id)
        if (s.weekdays_only && weekend) return false
        if (n.kind === 'overdue_invoice') return level >= 3
        if (n.kind === 'quiet_quote') return level >= 2 || String(n.employee_id ?? '') === String(emp.id)
        return false
      })
      // Never the same item twice.
      const already = await readRecordList(r, `arnie_nudges?select=kind,ref_key&company_id=eq.${emp.company_id}&employee_id=eq.${emp.id}&limit=2000`)
      const seen = new Set(already.map((x: any) => `${x.kind}|${x.ref_key}`))
      mine = mine.filter((n) => !seen.has(`${n.kind}|${n.ref_key}`))
      // Shift first, then money, then quotes — and only what fits one message; the rest next hour.
      const order = { open_shift: 0, overdue_invoice: 1, quiet_quote: 2 }
      // A text carries three; everything recorded as sent was actually said.
      mine = mine.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, s.channel === 'sms' ? 3 : MAX_ITEMS)
      out.items = mine.length
      if (!mine.length) { results.push(out); continue }

      const text = composeNudge(mine, emp.name, s.channel)
      out.chars = text.length
      if (dryRun) { out.text = text; out.nudges = mine; results.push(out); continue }

      const to = s.channel === 'sms' ? String(emp.phone || '').trim() : String(emp.email || '').trim()
      const sent = !to ? { sent: false, error: `no ${s.channel === 'sms' ? 'phone' : 'email'} on the employee` }
        : s.channel === 'sms' ? await sendArnieSms(r, emp.company_id, to, text)
        : await sendArnieEmail(to, `Arnie: ${mine.length === 1 ? mine[0].subject : mine.length + ' things need a look'}`, 'From Arnie', text)
      out.sent = sent.sent; if (sent.error) out.error = sent.error
      // Record every item, sent or not: a failed send is retried next hour
      // only if nothing was recorded — so record only on success, and keep
      // the error on the result for the cron log.
      if (sent.sent) {
        const rows = mine.map((n) => ({ company_id: emp.company_id, employee_id: emp.id, kind: n.kind, ref_key: n.ref_key, channel: s.channel, text: n.line }))
        const ins = await fetch(`${SUPABASE_URL}/rest/v1/arnie_nudges`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
        if (!ins.ok) out.record_error = `${ins.status} ${(await ins.text()).slice(0, 120)}`
      }
    } catch (e) {
      out.error = (e as Error).message
    }
    results.push(out)
  }
  return json({ ok: true, checked: subs.length, considered: results.length, sent: results.filter((x) => x.sent).length, dry_run: dryRun, results })
})
