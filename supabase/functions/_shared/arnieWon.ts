// "Halifax signed." — an estimate is won, by voice.
//
// The most-said sentence in the business, and until now the one thing
// Arnie could only point at a page for. The card shows exactly what
// approving does: the estimate to Approved, the deposit if the proposal
// carries one, the job that gets made (title, business unit, lines,
// coverage), where the lead lands. Approve = approveEstimate +
// convertEstimate from _shared/estimateConvert.ts — the same code the
// estimate page and the customer portal run, so a job won by voice is
// indistinguishable from one won by click.
//
// Who: the quote's rep, or a manager (level 2) — the same line the
// follow-up rail draws. Rollback undoes the conversion only while nothing
// has happened to the job (unscheduled, nobody clocked in, no invoice),
// and puts the estimate and the lead back where they were.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { findQuote, forWhom, quoteLabel } from './arnieFollowup.ts'
import { approveEstimate, convertEstimate, loadEstimate, planConversion, undoConversion } from './estimateConvert.ts'

const usd = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Sent, Draft or Pending — or already Approved by hand but never turned into a job.
const WINNABLE = `status=in.(Sent,Draft,Pending,Approved)&rejected_date=is.null&job_id=is.null`

export async function prepareWon(r: Rest, caller: Caller, f: Record<string, string>) {
  const companyId = caller.companyId as number
  const found = await findQuote(r, companyId, f.quote, WINNABLE)
  if ('error' in found) return { ok: false as const, error: found.error as string }
  const rows = (found as any).rows as any[]
  if (!rows.length) return { ok: false as const, error: `No open estimate matches "${f.quote}". Won and rejected estimates, and ones that are already jobs, are not here — say the estimate number or who it is for.` }
  if (rows.length > 1) {
    const labelled = await Promise.all(rows.slice(0, 6).map(async (q) => ({ id: q.id, label: quoteLabel(q, (await forWhom(r, companyId, q)).name) })))
    return { needs_choice: labelled, message: 'More than one open estimate matches. Ask which, then call again with the estimate number as listed.' }
  }
  const q = rows[0]
  if (q.salesperson_id && String(q.salesperson_id) !== String(caller.employeeId) && caller.level < 2) {
    const [rep] = await readRecordList(r, `employees?select=name&company_id=eq.${companyId}&id=eq.${q.salesperson_id}&limit=1`)
    return { ok: false as const, error: `That estimate is ${rep?.name || 'another rep'}'s. Marking someone else's estimate won needs a manager.` }
  }

  const est = await loadEstimate(r, companyId, q.id)
  if (!est) return { ok: false as const, error: 'That estimate is gone.' }
  const plan = planConversion(est)
  const who = await forWhom(r, companyId, q)
  const alreadyApproved = est.quote.status === 'Approved'

  // A deposit the rep says was taken today — cash or check in hand — rides
  // on the card and becomes the payment the page's Deposit modal records.
  const depAmt = Number(String(f.deposit_amount || '').replace(/[$,\s]/g, ''))
  const deposit = Number.isFinite(depAmt) && depAmt > 0 ? { amount: Math.round(depAmt * 100) / 100, method: String(f.deposit_method || '').trim() || null } : null
  if (deposit && deposit.amount > plan.jobTotal && plan.jobTotal > 0) return { ok: false as const, error: `A ${usd(deposit.amount)} deposit on a ${usd(plan.jobTotal)} estimate? Say the number again.` }

  const display: { label: string; value: string }[] = [
    { label: 'Estimate', value: `${quoteLabel(q, who.name)}${alreadyApproved ? ' — already approved, not yet a job' : ''}` },
    { label: 'Customer', value: est.customer ? `${est.customer.business_name || est.customer.name} (on file)` : plan.customerName ? `${plan.businessName || plan.customerName} — matched to a customer record, or created if none` : 'none — the job will have no customer record' },
    { label: 'Job', value: `${plan.jobTitle} · ${plan.status}${plan.startDate ? ' · starts ' + plan.startDate : ' · unscheduled'}${plan.businessUnit ? ' · ' + plan.businessUnit : ''}` },
    { label: 'Total', value: `${usd(plan.jobTotal)}${plan.discount ? ` after a ${usd(plan.discount)} discount` : ''}${plan.utilityIncentive ? `; ${usd(plan.utilityIncentive)} utility incentive` : ''}${plan.jobTotalSource === 'manual' ? ' (priced by hand — lines are additions)' : ''}` },
    { label: 'Lines', value: plan.lines.length ? `${plan.lines.length} from the estimate${plan.lines.some((l) => l.in_utility_scope === false) ? ` (${plan.lines.filter((l) => l.in_utility_scope === false).length} out of utility scope)` : ''}` : 'none on the estimate' },
  ]
  if (plan.deposit) display.push({ label: 'Deposit invoice', value: `${plan.deposit.label} ${usd(plan.deposit.amount)} — per the proposal${deposit ? `; ${usd(deposit.amount)} ${deposit.method || 'received'} today applied to it` : ', Draft until paid'}` })
  else if (deposit) display.push({ label: 'Deposit', value: `${usd(deposit.amount)} ${deposit.method || ''} recorded as a payment on the estimate` })
  display.push({ label: 'Coverage', value: `labor to ${plan.coverage.laborUntil}, parts to ${plan.coverage.partsUntil}` })
  if (est.lead) display.push({ label: 'Lead', value: `${est.lead.status || 'open'} → ${plan.leadStatus}` })
  display.push({ label: 'Then', value: 'the company is told, and the job waits on the Job Board to be scheduled' })

  return {
    ok: true as const,
    columns: { quote_id: q.id, quote_number: q.quote_id, already_approved: alreadyApproved, deposit, customer_name: who.name, job_title: plan.jobTitle, amount: plan.jobTotal, lines: plan.lines.length, lead_id: est.lead?.id ?? null, lead_status_before: est.lead?.status ?? null, quote_status_before: est.quote.status, quote_deposit_before: est.quote.deposit_amount ?? null },
    display,
  }
}

export async function applyWon(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const [q] = await readRecordList(r, `quotes?select=id,status,job_id,rejected_date&company_id=eq.${companyId}&id=eq.${c.quote_id}&limit=1`)
  if (!q) return { ok: false as const, error: 'That estimate is gone.' }
  if (q.job_id) return { ok: false as const, stale: true, error: `${c.quote_number || 'That estimate'} became a job after I drafted this. Nothing changed.` }
  if (q.rejected_date) return { ok: false as const, stale: true, error: `${c.quote_number || 'That estimate'} was rejected after I drafted this. Nothing changed.` }
  let paymentId: number | null = null
  if (q.status !== 'Approved' || c.deposit) {
    const a = await approveEstimate(r, companyId, c.quote_id, { deposit: c.deposit ? { amount: c.deposit.amount, method: c.deposit.method, date: new Date().toISOString().slice(0, 10) } : null, createdBy: prop.created_by || null })
    if (!a.ok) return { ok: false as const, error: a.error }
    paymentId = a.paymentId
  }
  const conv = await convertEstimate(r, companyId, c.quote_id, { createdBy: prop.created_by || null })
  if (!conv.ok) return { ok: false as const, error: conv.error, stale: conv.stale === true }
  const res = conv.result
  return { ok: true as const, id: res.jobId, label: `${res.jobNumber} — ${c.job_title}`, created: { ...res, quoteId: c.quote_id, depositPaymentId: paymentId, quoteStatusBefore: c.quote_status_before, quoteDepositBefore: c.quote_deposit_before ?? null, leadWonBefore: c.lead_status_before } }
}

export async function rollbackWon(r: Rest, companyId: number, prop: any) {
  const created = prop.payload?.created
  if (!created?.jobId) return { ok: false as const, error: 'This draft never made a job.' }
  return await undoConversion(r, companyId, created)
}
