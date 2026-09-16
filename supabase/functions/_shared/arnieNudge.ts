// What Arnie nudges about, and how he says it. The rules, in one place,
// read by arnie-nudge (the cron) — and pinned by src/lib/arnieNudge.test.js
// so a threshold cannot drift from what the card and the brief say.
//
// Three kinds. Each is derived from the same rows the morning brief reads,
// so the nudge and the brief cannot disagree about what is stale or
// overdue; the nudge is simply the brief's item, the day it happens.

import type { Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'

export const QUIET_QUOTE_DAYS = 10     // the brief lists at 7; the nudge waits for a real silence
export const QUIET_QUOTE_WINDOW = 4    // ...and only says so once, the week it happens — a 500-quote backlog is the brief's list, not 500 texts
export const MAX_ITEMS = 6             // per message; the rest wait for the next hour
export const OVERDUE_WINDOW_DAYS = 3   // "tipped overdue" — older ones are the brief's job
export const OPEN_SHIFT_HOURS = 12

export interface Nudge {
  kind: 'quiet_quote' | 'overdue_invoice' | 'open_shift'
  ref_key: string
  /** Whose item it is: the quote's rep, the shift's employee; null for money. */
  employee_id: number | null
  subject: string
  line: string
}

const usd = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const daysBetween = (a: string | Date, b: Date) => Math.floor((b.getTime() - new Date(a).getTime()) / 86400000)

/** Every nudge-worthy item in the company right now. Cut per person by the caller. */
export async function buildNudges(r: Rest, companyId: number, today: string): Promise<Nudge[]> {
  const now = new Date()
  const out: Nudge[] = []

  // ── quiet quotes ──
  const cutoff = new Date(now.getTime() - QUIET_QUOTE_DAYS * 86400000)
  const floor = new Date(cutoff.getTime() - QUIET_QUOTE_WINDOW * 86400000)
  const quotes = await readRecordList(r, `quotes?select=id,quote_id,estimate_name,quote_amount,sent_date,last_sent_at,status,salesperson_id,lead_id,customer_id,followup_count,follow_up_1,follow_up_2,follow_up_3&company_id=eq.${companyId}&status=not.in.(Approved,Rejected,Won,Lost,Expired,Draft)&approved_date=is.null&rejected_date=is.null&quote_amount=gt.0&or=(last_sent_at.not.is.null,sent_date.not.is.null)&order=quote_amount.desc&limit=300`)
  const leadIds = [...new Set(quotes.map((q: any) => q.lead_id).filter(Boolean))], custIds = [...new Set(quotes.map((q: any) => q.customer_id).filter(Boolean))]
  const leads = leadIds.length ? await readRecordList(r, `leads?select=id,business_name,customer_name&company_id=eq.${companyId}&id=in.(${leadIds.slice(0, 200).join(',')})`) : []
  const custs = custIds.length ? await readRecordList(r, `customers?select=id,business_name,name&company_id=eq.${companyId}&id=in.(${custIds.slice(0, 200).join(',')})`) : []
  const who = (q: any) => {
    const l = leads.find((x: any) => String(x.id) === String(q.lead_id)), c = custs.find((x: any) => String(x.id) === String(q.customer_id))
    return l?.business_name || l?.customer_name || c?.business_name || c?.name || q.estimate_name || q.quote_id || `quote #${q.id}`
  }
  for (const q of quotes) {
    const n = Number(q.followup_count) || 0
    const touches = [q.last_sent_at, q.sent_date, q.follow_up_1, q.follow_up_2, q.follow_up_3].filter(Boolean).map((t: string) => new Date(t).getTime()).filter((t) => !Number.isNaN(t))
    if (!touches.length) continue
    const last = new Date(Math.max(...touches))
    if (last > cutoff || last < floor) continue
    const days = daysBetween(last, now)
    const name = who(q)
    out.push({
      kind: 'quiet_quote', ref_key: `${q.id}:${n}`, employee_id: q.salesperson_id ?? null,
      subject: `${name}'s quote has gone quiet`,
      line: `${name}'s ${usd(Number(q.quote_amount))} quote (${q.quote_id || q.estimate_name || '#' + q.id}) has been quiet ${days} days${n ? ` — ${n} follow-up${n > 1 ? 's' : ''} already` : ''}. Say "chase ${name}" and I'll draft the note.`,
    })
  }

  // ── invoices that tipped overdue ──
  const since = new Date(new Date(today).getTime() - OVERDUE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
  const inv = await readRecordList(r, `invoices?select=id,invoice_id,customer_id,customer_owes,credit_card_fee,due_date,payment_status&company_id=eq.${companyId}&amount=gt.0&due_date=lt.${today}&due_date=gte.${since}&payment_status=not.in.(Paid,Void,Cancelled)&order=due_date&limit=100`)
  if (inv.length) {
    const ids = inv.map((i: any) => i.id)
    const pays = await readRecordList(r, `payments?select=invoice_id,amount,paid_by&company_id=eq.${companyId}&invoice_id=in.(${ids.join(',')})&limit=1000`)
    const icust = [...new Set(inv.map((i: any) => i.customer_id).filter(Boolean))]
    const ic = icust.length ? await readRecordList(r, `customers?select=id,business_name,name&company_id=eq.${companyId}&id=in.(${icust.join(',')})`) : []
    for (const i of inv) {
      const paid = pays.filter((p: any) => String(p.invoice_id) === String(i.id) && p.paid_by !== 'utility').reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
      const bal = (Number(i.customer_owes) || 0) + (Number(i.credit_card_fee) || 0) - paid
      if (bal <= 0.01) continue
      const c = ic.find((x: any) => String(x.id) === String(i.customer_id))
      const name = c?.business_name || c?.name || 'a customer'
      const days = daysBetween(i.due_date, new Date(today))
      out.push({
        kind: 'overdue_invoice', ref_key: String(i.id), employee_id: null,
        subject: `${name} is overdue`,
        line: `${i.invoice_id || 'INV-' + i.id} — ${name} went overdue ${days === 1 ? 'yesterday' : days + ' days ago'} · ${usd(bal)} outstanding.`,
      })
    }
  }

  // ── shifts still open ──
  const stale = new Date(now.getTime() - OPEN_SHIFT_HOURS * 3600000).toISOString()
  const shifts = await readRecordList(r, `time_clock?select=id,employee_id,clock_in,job_id&company_id=eq.${companyId}&clock_out=is.null&clock_in=lt.${stale}&order=clock_in&limit=100`)
  const jobIds = [...new Set(shifts.map((s: any) => s.job_id).filter(Boolean))]
  const jobs = jobIds.length ? await readRecordList(r, `jobs?select=id,job_id,job_title,customer_name&company_id=eq.${companyId}&id=in.(${jobIds.join(',')})`) : []
  for (const s of shifts) {
    const j = jobs.find((x: any) => String(x.id) === String(s.job_id))
    const hrs = Math.round((now.getTime() - new Date(s.clock_in).getTime()) / 36e5)
    out.push({
      kind: 'open_shift', ref_key: String(s.id), employee_id: s.employee_id,
      subject: 'You are still clocked in',
      line: `You're still clocked in — ${hrs} hours now${j ? `, on ${[j.job_id, j.job_title || j.customer_name].filter(Boolean).join(' — ')}` : ''}. Say "clock me out at …" with the time you actually stopped and I'll close it.`,
    })
  }
  return out
}

/** One message for everything due this hour. SMS: at most three lines and a count. */
export function composeNudge(items: Nudge[], name: string, channel: string): string {
  const first = String(name || '').split(' ')[0] || 'boss'
  const order = { open_shift: 0, overdue_invoice: 1, quiet_quote: 2 }
  const sorted = [...items].sort((a, b) => order[a.kind] - order[b.kind]).slice(0, MAX_ITEMS)
  if (channel === 'sms') {
    const top = sorted.slice(0, 3).map((n) => n.line)
    const more = sorted.length - top.length
    return [`Arnie here, ${first}.`, ...top, more > 0 ? `And ${more} more — open Arnie in JobScout.` : ''].filter(Boolean).join('\n').slice(0, 480)
  }
  const lines = sorted.map((n) => `• ${n.line}`)
  return [`${first} — ${sorted.length === 1 ? 'one thing' : sorted.length + ' things'} that shouldn't wait for the morning brief:`, '', ...lines, '', 'Open Arnie in JobScout and tell me which to handle.'].join('\n')
}
