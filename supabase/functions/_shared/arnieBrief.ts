// The daily brief: "what needs my attention today", as one tool call.
//
// Nothing here is new data. It is the reads Arnie already has, composed
// once and scoped once, so an owner opening the app at 6am gets one
// answer instead of eight questions — and a tech gets THEIR day, not the
// company's.
//
// Scope is decided from the JWT, the same way the money tools do it:
//   everyone      my appointments, my sections, my open shift from a
//                 prior day, what I am owed, leads I set that meet today
//   manager+      + the team's day: jobs with no crew, all appointments,
//                 open shifts across the team, stale quotes, leads flagged
//                 as possible duplicates this week
//   admin+        + overdue invoices (count and what is still owed)
//
// "Today" is the caller's day, not the server's. The client sends its
// local date and IANA timezone; the bounds are computed here.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { invoiceCustomerTotal, isSettledStatus } from './money.ts'
import { moneyAccess, myPay } from './arnieMoney.ts'
import { tzOffsetMinutes } from './arnieTime.ts'

/** UTC instants for the start and end of a calendar day in a timezone. */
export function dayBounds(date: string, tz: string) {
  const guess = new Date(`${date}T00:00:00Z`)
  const off = tzOffsetMinutes(tz, guess)
  const start = new Date(guess.getTime() - off * 60000)
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() }
}

const num = (v: unknown) => Number(v) || 0
const money = (n: number) => Math.round(n * 100) / 100
const clock = (iso: string | null, tz: string) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) } catch { return String(iso).slice(11, 16) }
}

export async function dailyBrief(r: Rest, caller: Caller, input: { date?: string; timezone?: string }) {
  const companyId = caller.companyId
  if (companyId == null) return { restricted: 'No company on this login.' }
  const tz = input.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(input.timezone) ? input.timezone : 'UTC'
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toISOString().slice(0, 10)
  const { start, end } = dayBounds(date, tz)
  const me = caller.employeeId
  const access = await moneyAccess(r, caller)
  const manager = caller.level >= 2
  const admin = access.isAdmin

  const emps = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}`)
  const name = (id: unknown) => emps.find((e: any) => String(e.id) === String(id))?.name || null

  // ── my day ────────────────────────────────────────────────────────────
  const [appts, sections, myOpenShifts, myLeadsToday] = await Promise.all([
    readRecordList(r, `appointments?select=id,title,start_time,end_time,location,employee_id,salesperson_id,setter_id,salesperson_ids,status,appointment_type,lead_id,job_id&company_id=eq.${companyId}&start_time=gte.${start}&start_time=lt.${end}&order=start_time`),
    readRecordList(r, `job_sections?select=id,job_id,name,assigned_to,scheduled_date,start_time,status&company_id=eq.${companyId}&scheduled_date=eq.${date}&order=start_time.nullslast`),
    me == null ? [] : readRecordList(r, `time_clock?select=id,clock_in,job_id&company_id=eq.${companyId}&employee_id=eq.${me}&clock_out=is.null&clock_in=lt.${start}&order=clock_in.desc&limit=3`),
    me == null ? [] : readRecordList(r, `leads?select=id,business_name,customer_name,appointment_time,status&company_id=eq.${companyId}&setter_owner_id=eq.${me}&appointment_time=gte.${start}&appointment_time=lt.${end}&order=appointment_time`),
  ])
  const mine = (a: any) => me != null && (
    String(a.employee_id) === String(me) || String(a.salesperson_id) === String(me) || String(a.setter_id) === String(me) ||
    (Array.isArray(a.salesperson_ids) && a.salesperson_ids.map(String).includes(String(me))))
  const myAppts = appts.filter(mine)
  const mySections = sections.filter((s: any) => me != null && String(s.assigned_to) === String(me))
  const jobIds = [...new Set([...sections.map((s: any) => s.job_id), ...myOpenShifts.map((s: any) => s.job_id)].filter(Boolean))]
  const jobs = jobIds.length ? await readRecordList(r, `jobs?select=id,job_id,job_title,customer_name,business_name,address,status&company_id=eq.${companyId}&id=in.(${jobIds.join(',')})`) : []
  const job = (id: unknown) => jobs.find((j: any) => String(j.id) === String(id))
  const jobLabel = (id: unknown) => { const j = job(id); return j ? [j.job_id, j.job_title, j.customer_name || j.business_name].filter(Boolean).join(' — ') : `job #${id}` }

  const pay: any = me == null ? null : await myPay(r, caller, {})

  const out: Record<string, unknown> = {
    date, timezone: tz,
    for: caller.email,
    scope: manager
      ? (admin ? 'Your day, the team\'s day, and the money — you are ' + (access.isOwner ? 'an owner' : 'an admin') + '.'
               : 'Your day and the team\'s day. Invoices are admin-level.')
      : 'Your own day. Team-wide items need manager access.',
    my_day: {
      about: `${name(me) || caller.email} — the person reading this brief. Everything in my_day is theirs.`,
      appointments: myAppts.map((a: any) => ({ time: clock(a.start_time, tz), title: a.title, location: a.location, type: a.appointment_type, status: a.status })),
      sections_scheduled: mySections.map((s: any) => ({ time: s.start_time ? clock(s.start_time, tz) : null, section: s.name, job: jobLabel(s.job_id), address: job(s.job_id)?.address || null, status: s.status })),
      leads_i_set_meeting_today: myLeadsToday.map((l: any) => ({ time: clock(l.appointment_time, tz), lead: l.business_name || l.customer_name, status: l.status })),
      // `who` is spelled out even though this is the caller's own section. A
      // model writing this up once turned an unnamed open shift into "Danny" —
      // a person who does not exist — because nothing on the row said whose
      // it was. Ambiguity gets filled with a guess; a name does not.
      open_shift_from_earlier_day: myOpenShifts.map((s: any) => ({ who: `${name(me) || 'you'} (you — the person reading this)`, clocked_in: s.clock_in, job: s.job_id ? jobLabel(s.job_id) : null, note: 'YOUR shift, still clocked in from a previous day — it will not pay correctly until you close it.' })),
      owed_to_me_now: pay?.total_owed_now ?? null,
      setter_fees_pending_not_yet_qualified: pay?.setter_commissions?.pending_not_yet_qualified ?? null,
    },
  }

  // ── the team's day ────────────────────────────────────────────────────
  if (manager) {
    const weekAgo = new Date(new Date(start).getTime() - 7 * 86400000).toISOString()
    const [teamOpenShifts, staleQuotes, dupLeads] = await Promise.all([
      readRecordList(r, `time_clock?select=id,employee_id,clock_in,job_id&company_id=eq.${companyId}&clock_out=is.null&clock_in=lt.${start}&order=clock_in&limit=50`),
      readRecordList(r, `quotes?select=id,quote_id,estimate_name,quote_amount,sent_date,last_sent_at,status,salesperson_id&company_id=eq.${companyId}&status=not.in.(Approved,Rejected,Won,Lost,Expired)&approved_date=is.null&rejected_date=is.null&or=(last_sent_at.lt.${weekAgo},and(last_sent_at.is.null,sent_date.lt.${weekAgo.slice(0, 10)}))&order=quote_amount.desc.nullslast&limit=200`),
      readRecordList(r, `leads?select=id,business_name,customer_name,possible_duplicate_of,created_at,lead_owner_id&company_id=eq.${companyId}&possible_duplicate_of=not.is.null&created_at=gte.${weekAgo}&order=created_at.desc&limit=20`),
    ])
    const unstaffed = sections.filter((s: any) => s.assigned_to == null)
    const byJob = new Map<number, any[]>()
    for (const s of unstaffed) byJob.set(s.job_id, [...(byJob.get(s.job_id) || []), s])
    out.team_day = {
      appointments_today: appts.length,
      appointments: appts.slice(0, 20).map((a: any) => ({ time: clock(a.start_time, tz), title: a.title, with: name(a.salesperson_id || a.employee_id), location: a.location })),
      jobs_scheduled_today: new Set(sections.map((s: any) => s.job_id)).size,
      jobs_today_with_no_crew: [...byJob.entries()].map(([id, ss]) => ({ job: jobLabel(id), unstaffed_sections: ss.map((s: any) => s.name), address: job(id)?.address || null })),
      open_shifts_from_earlier_days: teamOpenShifts.map((s: any) => ({ who: name(s.employee_id), since: s.clock_in, job_id: s.job_id })),
      stale_quotes: {
        count: staleQuotes.length,
        total: money(staleQuotes.reduce((s: number, q: any) => s + num(q.quote_amount), 0)),
        rule: 'Sent more than 7 days ago, no approval or rejection recorded.',
        top: staleQuotes.slice(0, 5).map((q: any) => ({ quote: q.quote_id || q.estimate_name || `#${q.id}`, amount: num(q.quote_amount), sent: (q.last_sent_at || q.sent_date || '').slice(0, 10), rep: name(q.salesperson_id) })),
      },
      possible_duplicate_leads_this_week: dupLeads.map((l: any) => ({ lead: l.business_name || l.customer_name, duplicate_of: l.possible_duplicate_of, created_by: name(l.lead_owner_id), created: String(l.created_at).slice(0, 10) })),
    }
  }

  // ── the money ─────────────────────────────────────────────────────────
  if (admin) {
    const inv = await readRecordList(r, `invoices?select=id,invoice_id,amount,discount_applied,tax_amount,payment_status,due_date,customer_id&company_id=eq.${companyId}&amount=gt.0&due_date=lt.${date}&payment_status=not.in.(Paid,Void,Cancelled)&order=due_date&limit=300`)
    const overdue = inv.filter((i: any) => !isSettledStatus(i.payment_status))
    let paid: Record<number, number> = {}
    for (let i = 0; i < overdue.length; i += 150) {
      const ids = overdue.slice(i, i + 150).map((x: any) => x.id)
      for (const p of await readRecordList(r, `payments?select=invoice_id,amount&company_id=eq.${companyId}&invoice_id=in.(${ids.join(',')})&limit=1000`)) paid[p.invoice_id] = (paid[p.invoice_id] || 0) + num(p.amount)
    }
    const owed = overdue.map((i: any) => ({ i, bal: Math.max(0, invoiceCustomerTotal(i.amount, i.discount_applied, i.tax_amount) - (paid[i.id] || 0)) })).filter((x) => x.bal > 0)
    out.money = {
      overdue_invoices: owed.length,
      overdue_owed: money(owed.reduce((s, x) => s + x.bal, 0)),
      oldest: owed.slice(0, 5).map((x) => ({ invoice: x.i.invoice_id, due: x.i.due_date, owed: money(x.bal), status: x.i.payment_status })),
      ...(inv.length >= 300 ? { WARNING: 'Read the 300 oldest overdue invoices only — the total is a floor.' } : {}),
    }
  }

  return out
}
