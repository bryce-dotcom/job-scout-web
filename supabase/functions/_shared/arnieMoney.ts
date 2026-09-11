// Money tools for Arnie, and WHO may see WHAT.
//
// The rule, in one place so it cannot drift: the caller's identity comes
// from the JWT and nothing the model passes can widen it.
//
//   query_my_pay          anyone with an employee row — their OWN earnings,
//                         and nobody else's. The tool has no employee input.
//   query_payroll         the Payroll page's own gate (canViewHR): developer
//                         or has_hr_access. Everyone's earnings.
//   query_payments        owner (super_admin / developer) — same gate as
//                         query_revenue, because itemised money-in IS revenue.
//   query_purchase_orders admin and above — vendor cost is margin, and
//                         query_products already hides cost below admin.
//
// A gate that fails returns { restricted } rather than an error, so Arnie
// says plainly who can see it instead of guessing or apologising.
//
// Arnie never returns a pay RATE. hourly_rate, salary and commission rates
// are not selected by any tool here, at any level. Earnings, yes; the
// number that produces them, no — that stays on the Employees page.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'

export interface MoneyAccess {
  employeeId: number | null
  level: number
  isOwner: boolean
  isAdmin: boolean
  hr: boolean
}

/** What this caller may see. Reads the two employee flags the JWT does not carry. */
export async function moneyAccess(r: Rest, caller: Caller): Promise<MoneyAccess> {
  const isOwner = caller.role === 'super_admin' || caller.role === 'developer'
  const isAdmin = isOwner || caller.role === 'admin'
  let hr = caller.role === 'developer'
  if (caller.companyId != null && caller.employeeId != null) {
    const rows = await readRecordList(r,
      `employees?select=has_hr_access,is_developer&company_id=eq.${caller.companyId}&id=eq.${caller.employeeId}&limit=1`)
    const e = rows[0]
    if (e?.has_hr_access === true || e?.is_developer === true) hr = true
  }
  return { employeeId: caller.employeeId, level: caller.level, isOwner, isAdmin, hr }
}

const num = (v: unknown) => Number(v) || 0
const sum = (rows: any[], f = 'amount') => rows.reduce((s, x) => s + num(x[f]), 0)
const money = (n: number) => Math.round(n * 100) / 100
const inRange = (iso: string | null | undefined, start?: string, end?: string) => {
  if (!iso) return !start && !end
  const d = String(iso).slice(0, 10)
  return (!start || d >= start) && (!end || d <= end)
}

// ─────────────────────────────── own pay ───────────────────────────────

/**
 * The signed-in employee's earnings — the same five tables My Pay reads,
 * for the same employee, so Arnie and the page cannot disagree.
 */
export async function myPay(r: Rest, caller: Caller, opts: { start?: string; end?: string; period?: string }) {
  const companyId = caller.companyId
  if (companyId == null || caller.employeeId == null) {
    return { restricted: 'This login has no employee record, so there is no pay to show.' }
  }
  return await earningsFor(r, companyId, caller.employeeId, opts)
}

async function earningsFor(r: Rest, companyId: number, employeeId: number, opts: { start?: string; end?: string; period?: string }) {
  const { start, end } = opts
  const [rep, lead, bonus, stubs, benefits, co] = await Promise.all([
    readRecordList(r, `rep_commissions?select=id,job_id,invoice_id,kind,amount,earned_at,payment_status,paid_at&company_id=eq.${companyId}&employee_id=eq.${employeeId}&order=earned_at.desc.nullslast&limit=500`),
    readRecordList(r, `lead_commissions?select=id,lead_id,commission_type,amount,payment_status,created_at&company_id=eq.${companyId}&employee_id=eq.${employeeId}&order=created_at.desc&limit=500`),
    readRecordList(r, `job_bonuses?select=id,job_id,amount,status,saved_hours,accrued_at,paid_at&company_id=eq.${companyId}&employee_id=eq.${employeeId}&order=created_at.desc&limit=500`),
    readRecordList(r, `paystubs?select=id,period_start,period_end,pay_date,gross_pay,net_pay,bonus_pay,commission_pay,regular_hours,overtime_hours&company_id=eq.${companyId}&employee_id=eq.${employeeId}&order=pay_date.desc&limit=12`),
    readRecordList(r, `employee_benefits?select=benefit_type,plan_name,employee_contribution,employer_contribution,frequency&company_id=eq.${companyId}&employee_id=eq.${employeeId}&status=eq.active`),
    readRecordList(r, `companies?select=setter_qualification_rule&id=eq.${companyId}&limit=1`),
  ])

  const repIn = rep.filter((x: any) => inRange(x.earned_at, start, end))
  const leadIn = lead.filter((x: any) => inRange(x.created_at, start, end))
  const bonusIn = bonus.filter((x: any) => inRange(x.accrued_at || x.paid_at, start, end) || (!start && !end))
  const stubsIn = stubs.filter((x: any) => inRange(x.pay_date, start, end))

  // Setter fees pay only once EARNED under the quote_created rule; under
  // the default rule booking is enough. Same logic as lib/setterCommissions.
  const onQuote = co[0]?.setter_qualification_rule === 'quote_created'
  const setterRows = leadIn.filter((x: any) => x.commission_type === 'appointment_set')
  const sourceRows = leadIn.filter((x: any) => x.commission_type === 'lead_source')
  const setterPayable = onQuote ? setterRows.filter((x: any) => x.payment_status === 'earned') : setterRows.filter((x: any) => x.payment_status !== 'paid')
  const setterPending = onQuote ? setterRows.filter((x: any) => x.payment_status === 'pending') : []

  const by = (rows: any[], f: string, v: string) => rows.filter((x) => String(x[f] || '').toLowerCase() === v)
  const out = {
    period: opts.period || (start || end ? `${start || '…'} to ${end || '…'}` : 'all time'),
    rep_commissions: {
      earned_unpaid: money(sum(rep.filter((x: any) => x.payment_status !== 'paid' && inRange(x.earned_at, start, end)))),
      paid: money(sum(by(repIn, 'payment_status', 'paid'))),
      count: repIn.length,
      recent: repIn.slice(0, 8).map((x: any) => ({ kind: x.kind, amount: num(x.amount), status: x.payment_status, earned_at: x.earned_at, job_id: x.job_id, invoice_id: x.invoice_id })),
    },
    setter_commissions: {
      rule: onQuote ? 'quote_created (an appointment pays once a quote exists on the lead)' : 'appointment_set (booking it is enough)',
      payable_unpaid: money(sum(setterPayable.filter((x: any) => x.payment_status !== 'paid'))),
      pending_not_yet_qualified: money(sum(setterPending)),
      paid: money(sum(by(setterRows, 'payment_status', 'paid'))),
      lead_source_fees_unpaid: money(sum(sourceRows.filter((x: any) => x.payment_status !== 'paid'))),
      count: setterRows.length,
    },
    bonuses: {
      pending: money(sum(by(bonusIn, 'status', 'pending'))),
      accrued_unpaid: money(sum(by(bonusIn, 'status', 'accrued'))),
      paid: money(sum(by(bonusIn, 'status', 'paid'))),
      count: bonusIn.length,
    },
    paystubs: stubsIn.slice(0, 6).map((x: any) => ({
      period: `${x.period_start} to ${x.period_end}`, pay_date: x.pay_date,
      gross: num(x.gross_pay), net: num(x.net_pay), commission: num(x.commission_pay), bonus: num(x.bonus_pay),
      hours: num(x.regular_hours) + num(x.overtime_hours),
    })),
    benefits: benefits.map((b: any) => ({ type: b.benefit_type, plan: b.plan_name, you_pay: num(b.employee_contribution), employer_pays: num(b.employer_contribution), per: b.frequency })),
    scope: 'Recorded earnings for THIS employee only — the same ledgers My Pay shows. Rates are not included and are not something Arnie can look up.',
  }
  const owed = out.rep_commissions.earned_unpaid + out.setter_commissions.payable_unpaid + out.setter_commissions.lead_source_fees_unpaid + out.bonuses.accrued_unpaid
  return { ...out, total_owed_now: money(owed) }
}

// ─────────────────────────────── payroll ───────────────────────────────

/** Everyone's earnings. Gated exactly like the Payroll page. */
export async function payroll(r: Rest, caller: Caller, access: MoneyAccess, opts: { employee_name?: string; start?: string; end?: string; period?: string }) {
  const companyId = caller.companyId
  if (companyId == null) return { restricted: 'No company on this login.' }
  if (!access.hr) {
    return { restricted: 'Payroll for other people needs HR access (the same rule as the Payroll page). You can always ask about your own pay.' }
  }
  const emps = await readRecordList(r, `employees?select=id,name,email,active&company_id=eq.${companyId}&order=name`)
  let chosen = emps
  if (opts.employee_name) {
    const t = opts.employee_name.toLowerCase()
    chosen = emps.filter((e: any) => String(e.name || '').toLowerCase().includes(t) || String(e.email || '').toLowerCase().includes(t))
    if (!chosen.length) return { error: `No employee matching "${opts.employee_name}".` }
    if (chosen.length > 6) return { error: `"${opts.employee_name}" matches ${chosen.length} people — be more specific.` }
  }
  const rows = []
  for (const e of chosen) {
    const p: any = await earningsFor(r, companyId, e.id, opts)
    if (p.total_owed_now || p.rep_commissions.count || p.setter_commissions.count || p.bonuses.count || p.paystubs.length || opts.employee_name) {
      rows.push({ employee: e.name, active: e.active !== false, total_owed_now: p.total_owed_now,
        rep_unpaid: p.rep_commissions.earned_unpaid, setter_payable: p.setter_commissions.payable_unpaid,
        setter_pending: p.setter_commissions.pending_not_yet_qualified, bonuses_accrued: p.bonuses.accrued_unpaid,
        ...(opts.employee_name ? { detail: p } : {}) })
    }
  }
  rows.sort((a, b) => b.total_owed_now - a.total_owed_now)
  return {
    period: opts.period || 'all time',
    employees_with_earnings: rows.length,
    total_owed_now: money(rows.reduce((s, x) => s + x.total_owed_now, 0)),
    rows,
    scope: 'Recorded commissions, setter fees, bonuses and paystubs — the ledgers Payroll reads. Pay RATES are not included.',
  }
}

// ─────────────────────────────── payments ──────────────────────────────

/** Itemised money in. Owner only — the same gate as revenue. */
export async function payments(r: Rest, caller: Caller, access: MoneyAccess, opts: { start?: string; end?: string; period?: string; customer_name?: string; method?: string; limit?: number }) {
  const companyId = caller.companyId
  if (companyId == null) return { restricted: 'No company on this login.' }
  if (!access.isOwner) return { restricted: 'Itemised payments are owner-level, like revenue. An admin can see totals on Books.' }

  const params = new URLSearchParams({ company_id: `eq.${companyId}`, select: 'id,payment_id,amount,date,method,status,invoice_id,customer_id,job_id,is_deposit,refunded_amount', order: 'date.desc' })
  if (opts.start) params.append('date', `gte.${opts.start}`)
  if (opts.end) params.append('date', `lte.${opts.end}`)
  if (opts.method) params.append('method', `ilike.*${String(opts.method).replace(/[*,()]/g, '')}*`)
  const notes: string[] = []
  if (opts.customer_name) {
    const term = String(opts.customer_name).replace(/[*,()]/g, '')
    const cust = await readRecordList(r, `customers?select=id&company_id=eq.${companyId}&or=(name.ilike.*${term}*,business_name.ilike.*${term}*)&limit=50`)
    if (!cust.length) return { count: 0, total: 0, note: `No customer matching "${opts.customer_name}".` }
    params.append('customer_id', `in.(${cust.map((c: any) => c.id).join(',')})`)
    notes.push(`Matched ${cust.length} customer(s) named like "${opts.customer_name}".`)
  }
  const rows = await readRecordList(r, `payments?${params}&limit=2000`)
  const good = rows.filter((p: any) => String(p.status || '').toLowerCase() !== 'failed')
  const refunds = money(sum(good, 'refunded_amount'))
  const ids = [...new Set(good.map((p: any) => p.customer_id).filter(Boolean))].slice(0, 200)
  const names: Record<number, string> = {}
  if (ids.length) for (const c of await readRecordList(r, `customers?select=id,name,business_name&company_id=eq.${companyId}&id=in.(${ids.join(',')})`)) names[c.id] = c.business_name || c.name
  const byMethod: Record<string, number> = {}
  for (const p of good) byMethod[p.method || 'unknown'] = money((byMethod[p.method || 'unknown'] || 0) + num(p.amount))
  return {
    period: opts.period || (opts.start || opts.end ? `${opts.start || '…'} to ${opts.end || '…'}` : 'all time'),
    count: good.length,
    total: money(sum(good)),
    refunded: refunds,
    net: money(sum(good) - refunds),
    by_method: byMethod,
    payments: good.slice(0, Math.min(Number(opts.limit) || 25, 100)).map((p: any) => ({
      date: p.date, amount: num(p.amount), method: p.method, customer: names[p.customer_id] || null,
      invoice_id: p.invoice_id, deposit: p.is_deposit === true, refunded: num(p.refunded_amount) || undefined,
    })),
    ...(notes.length ? { scope: notes.join(' ') } : {}),
    ...(rows.length >= 2000 ? { WARNING: 'Read the first 2000 payments only — totals are a floor.' } : {}),
  }
}

// ─────────────────────────────── purchase orders ───────────────────────

/** What we are buying and from whom. Admin and above — vendor cost is margin. */
export async function purchaseOrders(r: Rest, caller: Caller, access: MoneyAccess, opts: { status?: string; vendor_name?: string; start?: string; end?: string; period?: string; limit?: number }) {
  const companyId = caller.companyId
  if (companyId == null) return { restricted: 'No company on this login.' }
  if (!access.isAdmin) return { restricted: 'Purchase orders carry vendor cost, which is admin-level.' }

  const params = new URLSearchParams({ company_id: `eq.${companyId}`, select: 'id,po_number,vendor_id,job_id,status,subtotal,tax,shipping,total,expected_delivery_date,sent_at,received_at,created_at,business_unit', order: 'created_at.desc' })
  if (opts.status) params.append('status', `ilike.${String(opts.status).replace(/[*,()]/g, '')}`)
  if (opts.start) params.append('created_at', `gte.${opts.start}`)
  if (opts.end) params.append('created_at', `lte.${opts.end}`)
  const notes: string[] = []
  if (opts.vendor_name) {
    const term = String(opts.vendor_name).replace(/[*,()]/g, '')
    const v = await readRecordList(r, `vendors?select=id&company_id=eq.${companyId}&name=ilike.*${term}*&limit=20`)
    if (!v.length) return { count: 0, total: 0, note: `No vendor matching "${opts.vendor_name}".` }
    params.append('vendor_id', `in.(${v.map((x: any) => x.id).join(',')})`)
    notes.push(`Matched ${v.length} vendor(s) named like "${opts.vendor_name}".`)
  }
  const rows = await readRecordList(r, `purchase_orders?${params}&limit=500`)
  const vids = [...new Set(rows.map((p: any) => p.vendor_id).filter(Boolean))]
  const vnames: Record<number, string> = {}
  if (vids.length) for (const v of await readRecordList(r, `vendors?select=id,name&company_id=eq.${companyId}&id=in.(${vids.join(',')})`)) vnames[v.id] = v.name
  const byStatus: Record<string, { count: number; total: number }> = {}
  for (const p of rows) { const k = p.status || 'unknown'; byStatus[k] = byStatus[k] || { count: 0, total: 0 }; byStatus[k].count++; byStatus[k].total = money(byStatus[k].total + num(p.total)) }
  return {
    period: opts.period || 'all time',
    count: rows.length,
    total: money(sum(rows, 'total')),
    by_status: byStatus,
    purchase_orders: rows.slice(0, Math.min(Number(opts.limit) || 25, 100)).map((p: any) => ({
      po_number: p.po_number, vendor: vnames[p.vendor_id] || null, status: p.status, total: num(p.total),
      job_id: p.job_id, expected: p.expected_delivery_date, sent_at: p.sent_at, received_at: p.received_at, business_unit: p.business_unit,
    })),
    ...(notes.length ? { scope: notes.join(' ') } : {}),
    ...(rows.length >= 500 ? { WARNING: 'Read the first 500 POs only — totals are a floor.' } : {}),
  }
}
