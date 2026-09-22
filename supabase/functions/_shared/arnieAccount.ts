// "What's the history with Halifax?"
//
// The question every owner asks before picking up the phone, and until now
// the answer was four screens. One read: who they are, what we've done for
// them, what is open, what they owe, when we last spoke.
//
// Read-only — nothing here writes. Money is gated the way every other
// Arnie read gates it: a tech gets the work (jobs, appointments, contact),
// an admin gets the money (invoices, payments, balance, lifetime value).
// The balance is `customer_owes` + the card fee, the same rule the invoice
// page and the payment rail use (arniePayment.paymentStatus) — never a
// gross figure the customer never owed.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { paymentStatus, utilityHasPaid } from './arniePayment.ts'

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100
const usd = (n: number) => '$' + r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null)
const OPEN_JOB = ['Completed', 'Verified Complete', 'Invoiced', 'Paid', 'Closed', 'Archived', 'Cancelled']

/** Every word said appears somewhere in the name — "halifax" finds Halifax Flooring. */
const hits = (hay: string, words: string[]) => { const n = String(hay || '').toLowerCase(); return words.every((w) => n.includes(w)) }

export async function findCustomers(r: Rest, companyId: number, said: string) {
  const NOISE = new Set(['the', 'with', 'for', 'about', 'customer', 'client', 'account', 'history', 'and', 'what', 'our'])
  const words = [...new Set(String(said || '').toLowerCase().replace(/[*,()]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !NOISE.has(w)))]
  if (!words.length) return { rows: [] as any[], words }
  const found = new Map<number, any>()
  for (const w of words) {
    const rows = await readRecordList(r, `customers?select=id,name,business_name,email,phone,address,created_at&company_id=eq.${companyId}&or=(name.ilike.*${w}*,business_name.ilike.*${w}*,email.ilike.*${w}*)&limit=40`)
    for (const c of rows) found.set(c.id, c)
  }
  // Prefer a row that carries EVERY word said; fall back to any hit.
  const all = [...found.values()]
  const strict = all.filter((c) => hits(`${c.name || ''} ${c.business_name || ''} ${c.email || ''}`, words))
  return { rows: strict.length ? strict : all, words }
}

export interface AccountOpts { money: boolean }

export async function customerAccount(r: Rest, companyId: number, customer: any, opts: AccountOpts) {
  const id = customer.id
  const [jobs, quotes, appts, comms] = await Promise.all([
    readRecordList(r, `jobs?select=id,job_id,job_title,status,start_date,completed_at,job_total,invoice_status,business_unit&company_id=eq.${companyId}&customer_id=eq.${id}&order=start_date.desc.nullslast,id.desc&limit=200`),
    readRecordList(r, `quotes?select=id,quote_id,estimate_name,status,quote_amount,sent_date,job_id&company_id=eq.${companyId}&customer_id=eq.${id}&order=id.desc&limit=100`),
    readRecordList(r, `appointments?select=id,title,start_time,status&company_id=eq.${companyId}&customer_id=eq.${id}&order=start_time.desc&limit=50`),
    readRecordList(r, `communications_log?select=type,trigger,sent_date,recipient,status&company_id=eq.${companyId}&customer_id=eq.${id}&order=sent_date.desc&limit=20`),
  ])

  const openJobs = jobs.filter((j: any) => !OPEN_JOB.includes(j.status))
  const lastJob = jobs.find((j: any) => j.completed_at) || jobs[0] || null
  const openQuotes = quotes.filter((q: any) => ['Sent', 'Draft', 'Pending', 'Negotiation'].includes(q.status) && !q.job_id)
  const nextAppt = appts.filter((a: any) => a.start_time > new Date().toISOString() && a.status !== 'Cancelled').sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))[0] || null
  // The LAST contact, so only things that have happened: a walkthrough booked
  // for next month is the next one, not the last.
  const nowIso = new Date().toISOString()
  const lastTouch = [comms[0]?.sent_date, appts[0]?.start_time, jobs[0]?.completed_at, jobs[0]?.start_date, quotes[0]?.sent_date]
    .filter(Boolean).map((x: any) => String(x)).filter((x: string) => x.slice(0, 10) <= nowIso.slice(0, 10)).sort().pop() || null

  const out: Record<string, unknown> = {
    customer: { id, name: customer.business_name || customer.name, contact: customer.business_name ? customer.name : null, email: customer.email || null, phone: customer.phone || null, address: customer.address || null, since: day(customer.created_at) },
    jobs: { total: jobs.length, open: openJobs.length, open_list: openJobs.slice(0, 8).map((j: any) => ({ job: j.job_id, title: j.job_title, status: j.status, starts: day(j.start_date) })), last: lastJob ? { job: lastJob.job_id, title: lastJob.job_title, status: lastJob.status, on: day(lastJob.completed_at || lastJob.start_date) } : null },
    quotes: { open: openQuotes.length, open_list: openQuotes.slice(0, 6).map((q: any) => ({ quote: q.quote_id, name: q.estimate_name, status: q.status, sent: day(q.sent_date), ...(opts.money ? { amount: r2(q.quote_amount) } : {}) })) },
    next_appointment: nextAppt ? { when: nextAppt.start_time, title: nextAppt.title } : null,
    last_contact: lastTouch ? { on: day(lastTouch), how: comms[0]?.sent_date === lastTouch ? (comms[0]?.type || 'message') : 'a job or a visit' } : null,
  }

  if (!opts.money) {
    out.money = 'Not shown — invoices, payments and balances need admin access.'
    return out
  }

  const invoices = await readRecordList(r, `invoices?select=id,invoice_id,amount,customer_owes,utility_owes,utility_paid_at,credit_card_fee,payment_status,invoice_type,due_date,created_at,job_id&company_id=eq.${companyId}&customer_id=eq.${id}&order=id.desc&limit=300`)
  const ids = invoices.map((i: any) => i.id)
  const payments = ids.length ? await readRecordList(r, `payments?select=id,invoice_id,amount,date,method,paid_by&company_id=eq.${companyId}&invoice_id=in.(${ids.join(',')})&order=date.desc&limit=500`) : []
  const paidOn = (invId: number) => payments.filter((p: any) => String(p.invoice_id) === String(invId) && p.paid_by !== 'utility').reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)

  const today = new Date().toISOString().slice(0, 10)
  let owed = 0, overdue = 0
  const openInvoices: any[] = []
  for (const inv of invoices) {
    const paid = paidOn(inv.id)
    const status = paymentStatus(inv, paid)
    if (status === 'Paid') continue
    const balance = r2((Number(inv.customer_owes) || 0) + (Number(inv.credit_card_fee) || 0) - paid)
    if (balance <= 0.01) continue
    owed += balance
    const late = inv.due_date && day(inv.due_date)! < today
    if (late) overdue += balance
    openInvoices.push({ invoice: inv.invoice_id, balance: usd(balance), status, due: day(inv.due_date), overdue: !!late, ...(utilityHasPaid(inv) ? { note: 'the utility has paid its share' } : {}) })
  }
  const collected = payments.filter((p: any) => p.paid_by !== 'utility').reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
  const lastPayment = payments.find((p: any) => p.paid_by !== 'utility') || null

  out.money = {
    balance: usd(owed),
    overdue: overdue > 0 ? usd(overdue) : null,
    open_invoices: openInvoices.slice(0, 10),
    lifetime_paid: usd(collected),
    last_payment: lastPayment ? { amount: usd(Number(lastPayment.amount)), on: day(lastPayment.date), method: lastPayment.method || null } : null,
    job_value_all_time: usd(jobs.reduce((s: number, j: any) => s + (Number(j.job_total) || 0), 0)),
  }
  return out
}

/** The tool: find who they mean, then the account. */
export async function accountSummary(r: Rest, caller: Caller, input: { customer?: string }, money: boolean) {
  const companyId = caller.companyId as number
  const said = String(input?.customer || '').trim()
  if (said.length < 2) return { error: 'Who do you want the history on? A customer name or business.' }
  const { rows } = await findCustomers(r, companyId, said)
  if (!rows.length) return { error: `No customer matches "${said}". They may still be a lead — ask me about leads instead.` }
  if (rows.length > 1) return { needs_choice: rows.slice(0, 8).map((c: any) => ({ id: c.id, label: [c.business_name, c.name, c.email].filter(Boolean).join(' — ') })), message: 'More than one customer matches. Ask which one they mean, then call again with the full name.' }
  return await customerAccount(r, companyId, rows[0], { money })
}
