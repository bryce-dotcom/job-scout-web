// COLE'S TWO ROUTINES, as one tool call each.
//
// From his write-up (feedback 2026-10-10), ROUTINES:
//   1. Morning Lead Setter check (weekdays): new meetings, plus approved
//      estimates that haven't been converted to jobs.
//   2. Daily Job Scout refresh: new leads and drafts, estimates moved to Sent
//      or Approved, today's meetings, release notes and tickets, sync
//      banners, and stale-estimate and overdue-invoice counts.
//
// A routine runs as the person, with their access (_shared/arnieHeadless.ts),
// so this is scoped exactly as the daily brief is: what they may see.
// Bank sync problems are admin-level (Books); release notes are internal to
// the platform company.

// deno-lint-ignore-file no-explicit-any
import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { dailyBrief, dayBounds } from './arnieBrief.ts'

type Any = any
const num = (v: unknown) => Number(v) || 0
const money = (n: number) => Math.round(n * 100) / 100

/** The start of the previous working day — Monday looks back to Friday. */
export function sinceLastWorkday(date: string, tz: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const back = d.getUTCDay() === 1 ? 3 : d.getUTCDay() === 0 ? 2 : 1
  const prev = new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10)
  return dayBounds(prev, tz).start
}

const who = (x: Any) => x?.business_name || x?.customer_name || x?.estimate_name || x?.quote_id || `#${x?.id}`

export async function jobscoutRefresh(r: Rest, caller: Caller, input: { date?: string; timezone?: string; part?: string }) {
  const companyId = caller.companyId
  if (companyId == null) return { restricted: 'No company on this login.' }
  const tz = input.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(input.timezone) ? input.timezone : 'UTC'
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toISOString().slice(0, 10)
  const { start, end } = dayBounds(date, tz)
  const since = sinceLastWorkday(date, tz)
  const manager = caller.level >= 2
  const admin = caller.level >= 3
  const lsOnly = /lead.?setter|morning/i.test(String(input.part || ''))

  // ── the Lead Setter check ────────────────────────────────────────────
  const [meetingsBooked, meetingsToday, approvedNotJobs] = await Promise.all([
    readRecordList(r, `appointments?select=id,title,start_time,lead_id,salesperson_id,created_at&company_id=eq.${companyId}&created_at=gte.${since}&order=start_time&limit=100`),
    readRecordList(r, `appointments?select=id,title,start_time,location,lead_id,status&company_id=eq.${companyId}&start_time=gte.${start}&start_time=lt.${end}&order=start_time&limit=100`),
    readRecordList(r, `quotes?select=id,quote_id,estimate_name,quote_amount,approved_date,salesperson_id&company_id=eq.${companyId}&status=eq.Approved&job_id=is.null&order=approved_date.desc.nullslast&limit=50`),
  ])
  const clock = (iso: string) => { try { return new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }) } catch { return iso } }
  const leadSetter = {
    new_meetings_booked_since: { since, count: meetingsBooked.length, list: meetingsBooked.slice(0, 15).map((a: Any) => ({ when: clock(a.start_time), title: a.title })) },
    approved_estimates_not_yet_jobs: { count: approvedNotJobs.length, total: money(approvedNotJobs.reduce((s: number, q: Any) => s + num(q.quote_amount), 0)), list: approvedNotJobs.slice(0, 15).map((q: Any) => ({ estimate: q.quote_id || `#${q.id}`, name: q.estimate_name, amount: num(q.quote_amount), approved: q.approved_date })) },
  }
  if (lsOnly) return { date, timezone: tz, lead_setter_check: leadSetter, how_to_read: 'New meetings first, then approved estimates still waiting to become jobs. Skip a section that is empty.' }

  // ── the daily refresh ────────────────────────────────────────────────
  const [newLeads, newDrafts, sent, approved, tickets, myReplies] = await Promise.all([
    readRecordList(r, `leads?select=id,business_name,customer_name,lead_source,created_at&company_id=eq.${companyId}&created_at=gte.${since}&order=created_at.desc&limit=100`),
    readRecordList(r, `quotes?select=id,quote_id,estimate_name,quote_amount,created_at&company_id=eq.${companyId}&status=eq.Draft&created_at=gte.${since}&order=created_at.desc&limit=100`),
    readRecordList(r, `quotes?select=id,quote_id,estimate_name,quote_amount,last_sent_at&company_id=eq.${companyId}&last_sent_at=gte.${since}&order=last_sent_at.desc&limit=100`),
    readRecordList(r, `quotes?select=id,quote_id,estimate_name,quote_amount,approved_date&company_id=eq.${companyId}&approved_date=gte.${since}&order=approved_date.desc&limit=100`),
    readRecordList(r, `feedback?select=id,subject,status,created_at&company_id=eq.${companyId}&status=in.(new,in_progress)&order=created_at.desc&limit=100`),
    readRecordList(r, `feedback?select=id,subject,status,replied_at&company_id=eq.${companyId}&user_email=eq.${encodeURIComponent(caller.email)}&replied_at=gte.${since}&order=replied_at.desc&limit=20`),
  ])
  const brief: Any = await dailyBrief(r, caller, { date, timezone: tz })
  const banners: Any[] = []
  if (admin) {
    const broken = await readRecordList(r, `connected_accounts?select=institution_name,account_name,sync_error,sync_error_code,sync_error_at&company_id=eq.${companyId}&sync_error=not.is.null&limit=20`)
    for (const b of broken) banners.push({ what: `Bank feed: ${b.institution_name || b.account_name || 'a bank'}`, problem: b.sync_error_code === 'ITEM_LOGIN_REQUIRED' ? 'needs the bank login redone (Books → reconnect)' : String(b.sync_error).slice(0, 160), since: b.sync_error_at })
  }

  return {
    date, timezone: tz, since,
    lead_setter_check: leadSetter,
    new_leads: { count: newLeads.length, list: newLeads.slice(0, 15).map((l: Any) => ({ lead: who(l), source: l.lead_source })) },
    new_draft_estimates: { count: newDrafts.length, list: newDrafts.slice(0, 15).map((q: Any) => ({ estimate: q.quote_id || `#${q.id}`, name: q.estimate_name, amount: num(q.quote_amount) })) },
    moved_to_sent: { count: sent.length, list: sent.slice(0, 15).map((q: Any) => ({ estimate: q.quote_id || `#${q.id}`, name: q.estimate_name, amount: num(q.quote_amount) })) },
    moved_to_approved: { count: approved.length, list: approved.slice(0, 15).map((q: Any) => ({ estimate: q.quote_id || `#${q.id}`, name: q.estimate_name, amount: num(q.quote_amount) })) },
    todays_meetings: meetingsToday.map((a: Any) => ({ when: clock(a.start_time), title: a.title, where: a.location, status: a.status })),
    tickets: { open_for_the_company: tickets.length, replies_to_you_since: myReplies.map((t: Any) => ({ subject: t.subject, status: t.status })) },
    release_notes: 'In your instructions, under "What changed in JobScout lately" (platform company only) — summarise the ones since the last workday.',
    sync_banners: admin ? (banners.length ? banners : 'none — every bank feed is syncing') : 'admin-level (Books)',
    stale_estimates: manager ? (brief?.team_day?.stale_quotes ?? brief?.stale_quotes ?? null) : 'manager-level',
    overdue_invoices: admin ? ({ count: brief?.money?.overdue_invoices ?? brief?.overdue_invoices ?? null, owed: brief?.money?.overdue_owed ?? brief?.overdue_owed ?? null }) : 'admin-level',
    how_to_read: 'Short. What needs action first (approved estimates not yet jobs, sync banners, overdue), then the day (meetings), then what moved (leads, drafts, sent, approved), then release notes and tickets. Skip anything empty rather than saying zero.',
  }
}
