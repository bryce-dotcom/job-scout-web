// Frankie's tools — what the AI CFO can look up for himself.
//
// Until now Frankie was handed one snapshot of totals on every message and
// nothing else, so "show me those checks" or "what did we pay Lowe's in
// March" got a shrug. Worse, because he rode Arnie's edge function, he was
// being OFFERED Arnie's whole toolset — including the ones that propose
// record changes — with Arnie's descriptions. These are his own: every one
// read-only, every one scoped to the caller's company by the JWT, and gated
// the way his persona already promises (full money access for admin and
// above, job costs for managers, nothing itemised below that).
//
// Results are compact JSON with a `scope` line the model can repeat, and a
// WARNING when a limit truncated the read so a total is a floor, not a fact.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'

// Frankie's answers carry money decisions and he is low volume; Arnie stays
// on Sonnet. Opus 5 thinks by default — the non-streaming loop passes its
// thinking blocks back untouched between tool rounds, which is required.
export const FRANKIE_MODEL = 'claude-opus-5'
export const FRANKIE_MAX_TOKENS = 8192

const num = (v: unknown) => Number(v) || 0
const money = (n: number) => Math.round(n * 100) / 100
const clean = (s: unknown) => String(s ?? '').replace(/[*,()"\\]/g, '').trim()
const clamp = (v: unknown, dflt: number, max: number) => Math.min(Math.max(Number(v) || dflt, 1), max)

/** GET every page of a PostgREST path (Supabase caps a request at 1000 rows). */
async function readAll(r: Rest, path: string, cap = 5000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const res = await fetch(`${r.url}/rest/v1/${path}`, {
      headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, Range: `${from}-${from + 999}` },
    })
    if (!res.ok) break
    const page = await res.json().catch(() => [])
    if (!Array.isArray(page)) break
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

// ── the same bookkeeping the app applies ─────────────────────────────
// Mirrors src/pages/agents/frankie/frankieTaxContext.js: the tax line is the
// person's own choice, else the AI's Form 1065 line, else its category; a
// "Not deductible" line is money out that is not an expense.
function taxLineOf(t: any): string {
  const line = t?.user_tax_category || t?.ai_form_1065_line || t?.ai_tax_category || null
  if (line) return line
  if (/TRANSFER_OUT|LOAN_PAYMENTS/.test(String(t?.plaid_personal_finance_category || ''))) return 'Not deductible (transfer or loan payment, not yet reviewed)'
  return 'Uncategorized'
}
const isNonDeductible = (line: string) => /^not deductible/i.test(line) || /^income$/i.test(line)

// ── access ───────────────────────────────────────────────────────────
interface Access { full: boolean; jobs: boolean }
function accessFor(caller: Caller): Access {
  const role = String(caller.role || '').toLowerCase()
  const full = ['admin', 'super_admin', 'developer', 'owner'].includes(role)
  return { full, jobs: full || role === 'manager' }
}
const RESTRICTED = { restricted: "That's above the clearance for this role. An admin or the owner can pull it up." }

// ── definitions ──────────────────────────────────────────────────────
const DATE_PROPS = {
  start_date: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
  end_date: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
}

export const FRANKIE_TOOLS: any[] = [
  {
    name: 'query_bank_transactions',
    description:
      'Search the bank feed — individual debits and deposits with date, description, amount, account and tax line, plus totals by tax line and by merchant. ' +
      'Use for "what did we pay X", "show me those checks", "how much at Home Depot this year", "the deposits over $10k", "what is tagged as wages". ' +
      'Totals cover every matching row; the list is the largest rows. Positive amounts are money out, negative are money in.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Matches the merchant or description, case-insensitive, e.g. "lowe" or "check #"' },
        ...DATE_PROPS,
        tax_line: { type: 'string', description: 'Filter by tax line, e.g. "Salaries and wages", "Meals", "Not deductible"' },
        direction: { type: 'string', enum: ['out', 'in', 'both'], description: 'Money out (debits), money in (deposits), or both. Default out.' },
        min_amount: { type: 'number', description: 'Only rows at or above this absolute amount' },
        account: { type: 'string', description: 'Filter by account name, e.g. "checking", "visa", "cole"' },
        limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' },
      },
    },
  },
  {
    name: 'query_pnl',
    description:
      'Profit and loss for any date range: revenue collected, deductible expenses by tax line, money out that is NOT an expense (owner draws, card payments, loan principal, transfers), and net profit. ' +
      'Use for any period the snapshot does not already show — a quarter, last year, a custom range, month by month.',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        by_month: { type: 'boolean', description: 'Also break the range down month by month' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_invoices',
    description:
      'Invoices with balance owed, days overdue and customer. Use for "who owes us", "everything past 60 days", "what has X been billed", "paid invoices last month".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'overdue', 'paid', 'all'], description: 'Default open' },
        customer_name: { type: 'string' },
        min_days_overdue: { type: 'integer' },
        ...DATE_PROPS,
        limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' },
      },
    },
  },
  {
    name: 'query_payments',
    description:
      'Customer payments received — date, amount, method, customer, invoice — with totals by method. Use for "what came in this week", "how has X paid us", "card vs check".',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        customer_name: { type: 'string' },
        method: { type: 'string', description: 'e.g. card, check, ach, cash, stripe' },
        limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' },
      },
    },
  },
  {
    name: 'query_job_profitability',
    description:
      'Actual profit per job — the same calculation as the Job Costing report and the profitability view on each job: revenue from payments tagged to the job (plus any prepaid plan allocation), ' +
      'material and labor cost from the job lines (walking bundle components), and bank debits or expenses tagged to the job. ' +
      'Use for "which jobs made money", "margin on the X job", "best and worst jobs", "how is crew Y doing". Jobs with no cost captured say so rather than showing $0.',
    input_schema: {
      type: 'object',
      properties: {
        job_name: { type: 'string', description: 'Part of the job title, job id or customer name' },
        team: { type: 'string', description: 'Filter by assigned crew / team name' },
        status: { type: 'string', description: 'e.g. Completed, In Progress; default all' },
        ...DATE_PROPS,
        sort: { type: 'string', enum: ['profit', 'margin', 'revenue', 'worst'], description: 'Default profit (highest first); worst = lowest margin first' },
        limit: { type: 'integer', description: 'Rows to list (default 20, max 100)' },
      },
    },
  },
  {
    name: 'query_payroll_runs',
    description:
      'Completed payroll runs — pay date, period, gross wages, headcount — with totals. Use for "what did payroll cost in Q2", "how many people were on the last run". Admin and above.',
    input_schema: {
      type: 'object',
      properties: { ...DATE_PROPS, limit: { type: 'integer', description: 'Runs to list (default 12, max 60)' } },
    },
  },
  {
    name: 'query_bank_balances',
    description: 'Current balance on every connected bank account and card, as of the last sync. Use when the question is about cash on hand right now.',
    input_schema: { type: 'object', properties: {} },
  },
]

export function frankieToolsFor(caller: Caller): any[] {
  const a = accessFor(caller)
  if (a.full) return FRANKIE_TOOLS
  if (a.jobs) return FRANKIE_TOOLS.filter(t => t.name === 'query_job_profitability' || t.name === 'query_invoices')
  return []
}

// ── executors ────────────────────────────────────────────────────────
export async function execFrankieTool(name: string, input: any, caller: Caller, r: Rest): Promise<any> {
  const companyId = caller.companyId
  if (companyId == null) return { restricted: 'No company on this login.' }
  const a = accessFor(caller)
  const co = `company_id=eq.${companyId}`
  try {
    switch (name) {
      case 'query_bank_transactions': return a.full ? await bankTransactions(r, co, input) : RESTRICTED
      case 'query_pnl': return a.full ? await pnl(r, co, input) : RESTRICTED
      case 'query_invoices': return a.jobs ? await invoices(r, co, input) : RESTRICTED
      case 'query_payments': return a.full ? await payments(r, co, input) : RESTRICTED
      case 'query_job_profitability': return a.jobs ? await jobProfitability(r, co, input) : RESTRICTED
      case 'query_payroll_runs': return a.full ? await payrollRuns(r, co, input) : RESTRICTED
      case 'query_bank_balances': return a.full ? await bankBalances(r, co) : RESTRICTED
      default: return { error: `Unknown tool: ${name}` }
    }
  } catch (e: any) {
    console.error('[frankie tool]', name, e)
    return { error: `Lookup failed: ${e?.message || e}` }
  }
}

const PLAID_SELECT = 'id,date,amount,name,merchant_name,is_transfer,connected_account_id,user_tax_category,ai_form_1065_line,ai_tax_category,plaid_personal_finance_category,job_id,ai_job_id'

async function accountNames(r: Rest, co: string): Promise<Record<number, string>> {
  const names: Record<number, string> = {}
  for (const a of await readAll(r, `connected_accounts?${co}&select=id,account_name,mask`, 100)) names[a.id] = `${a.account_name}${a.mask ? ` …${a.mask}` : ''}`
  return names
}

async function bankTransactions(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: PLAID_SELECT, order: 'date.desc' })
  const dir = input?.direction || 'out'
  if (dir === 'out') p.append('amount', 'gt.0')
  if (dir === 'in') p.append('amount', 'lt.0')
  if (input?.start_date) p.append('date', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('date', `lte.${clean(input.end_date)}`)
  if (input?.search) { const s = clean(input.search); p.append('or', `(name.ilike.*${s}*,merchant_name.ilike.*${s}*)`) }
  const names = await accountNames(r, co)
  let rows = await readAll(r, `plaid_transactions?${co}&${p}`)
  rows = rows.filter((t: any) => !t.is_transfer)
  if (input?.tax_line) { const t = clean(input.tax_line).toLowerCase(); rows = rows.filter((x: any) => taxLineOf(x).toLowerCase().includes(t)) }
  if (input?.account) { const t = clean(input.account).toLowerCase(); rows = rows.filter((x: any) => (names[x.connected_account_id] || '').toLowerCase().includes(t)) }
  if (input?.min_amount) rows = rows.filter((x: any) => Math.abs(num(x.amount)) >= num(input.min_amount))
  const total = money(rows.reduce((s: number, x: any) => s + num(x.amount), 0))
  const byLine: Record<string, number> = {}
  const byMerchant: Record<string, number> = {}
  for (const x of rows) {
    byLine[taxLineOf(x)] = money((byLine[taxLineOf(x)] || 0) + num(x.amount))
    const m = x.merchant_name || x.name || '(no description)'
    byMerchant[m] = money((byMerchant[m] || 0) + num(x.amount))
  }
  const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 15)
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: rows.length,
    total,
    by_tax_line: Object.fromEntries(top(byLine)),
    by_merchant: Object.fromEntries(top(byMerchant)),
    rows: [...rows].sort((a: any, b: any) => Math.abs(num(b.amount)) - Math.abs(num(a.amount))).slice(0, limit).map((x: any) => ({
      date: x.date, amount: num(x.amount), description: x.merchant_name || x.name, account: names[x.connected_account_id] || null,
      tax_line: taxLineOf(x), reviewed: !!x.user_tax_category, job_id: x.job_id || x.ai_job_id || null,
    })),
    scope: `${rows.length} bank rows matched${dir === 'out' ? ' (money out)' : dir === 'in' ? ' (money in)' : ''}; the list is the ${Math.min(limit, rows.length)} largest. Positive = paid out, negative = received. "reviewed" false means the tax line is the categoriser's guess.`,
    ...(rows.length >= 5000 ? { WARNING: 'Read the first 5000 rows only — totals are a floor.' } : {}),
  }
}

async function pnl(r: Rest, co: string, input: any) {
  const start = clean(input?.start_date), end = clean(input?.end_date)
  const [pays, plaid, manual] = await Promise.all([
    readAll(r, `payments?${co}&select=amount,date&date=gte.${start}&date=lte.${end}`),
    readAll(r, `plaid_transactions?${co}&select=${PLAID_SELECT}&amount=gt.0&is_transfer=eq.false&date=gte.${start}&date=lte.${end}`),
    readAll(r, `expenses?${co}&select=amount,date,tax_category&date=gte.${start}&date=lte.${end}`, 2000),
  ])
  const month = (d: string) => String(d).slice(0, 7)
  const acc = () => ({ revenue: 0, deductible: 0, non_deductible: 0, by_line: {} as Record<string, number> })
  const total = acc()
  const months: Record<string, ReturnType<typeof acc>> = {}
  const bucket = (d: string) => input?.by_month ? (months[month(d)] ||= acc()) : null
  for (const p of pays) { const v = num(p.amount); total.revenue += v; const b = bucket(p.date); if (b) b.revenue += v }
  const addOut = (line: string, v: number, d: string) => {
    const targets = [total, bucket(d)].filter(Boolean) as ReturnType<typeof acc>[]
    for (const t of targets) {
      if (isNonDeductible(line)) t.non_deductible += v
      else { t.deductible += v; t.by_line[line] = money((t.by_line[line] || 0) + v) }
    }
  }
  for (const t of plaid) addOut(taxLineOf(t), num(t.amount), t.date)
  for (const e of manual) { const v = num(e.amount); if (v > 0) addOut(e.tax_category || 'Manual expense', v, e.date) }
  const fmt = (b: ReturnType<typeof acc>) => ({
    revenue: money(b.revenue), deductible_expenses: money(b.deductible), net_profit: money(b.revenue - b.deductible),
    non_deductible_money_out: money(b.non_deductible),
    by_tax_line: Object.fromEntries(Object.entries(b.by_line).sort((x, y) => y[1] - x[1]).slice(0, 20)),
  })
  return {
    period: `${start} to ${end}`,
    ...fmt(total),
    ...(input?.by_month ? { months: Object.fromEntries(Object.entries(months).sort().map(([k, v]) => [k, fmt(v)])) } : {}),
    scope: 'Cash basis: revenue = payments received, expenses = bank debits and logged expenses by tax line. Non-deductible money out is owner draws, card payments, loan principal and unreviewed transfers — not an expense, does not reduce profit.',
  }
}

async function invoices(r: Rest, co: string, input: any) {
  const status = input?.status || 'open'
  const p = new URLSearchParams({ select: 'id,invoice_id,amount,discount_applied,credit_card_fee,payment_status,due_date,invoice_date,created_at,customer_id,job_id', order: 'created_at.desc' })
  if (status === 'paid') p.append('payment_status', 'eq.Paid')
  else if (status !== 'all') p.append('payment_status', 'not.in.(Paid,Void,Cancelled)')
  if (input?.start_date) p.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  let custIds: number[] | null = null
  if (input?.customer_name) {
    const t = clean(input.customer_name)
    const cs = await readAll(r, `customers?${co}&select=id&or=(name.ilike.*${t}*,business_name.ilike.*${t}*)`, 200)
    if (!cs.length) return { count: 0, note: `No customer matching "${input.customer_name}".` }
    custIds = cs.map((c: any) => c.id)
    p.append('customer_id', `in.(${custIds.join(',')})`)
  }
  const rows = await readAll(r, `invoices?${co}&${p}`)
  const ids = rows.map((i: any) => i.id)
  const paid: Record<number, number> = {}
  for (let i = 0; i < ids.length; i += 300) {
    for (const pm of await readAll(r, `payments?${co}&select=invoice_id,amount,status&invoice_id=in.(${ids.slice(i, i + 300).join(',')})`)) {
      if (['Paid', 'Completed', null, undefined].includes(pm.status)) paid[pm.invoice_id] = (paid[pm.invoice_id] || 0) + num(pm.amount)
    }
  }
  const names: Record<number, string> = {}
  const cids = [...new Set(rows.map((i: any) => i.customer_id).filter(Boolean))]
  for (let i = 0; i < cids.length; i += 300) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.slice(i, i + 300).join(',')})`)) names[c.id] = c.business_name || c.name
  const now = Date.now()
  let out = rows.map((i: any) => {
    // Same rule as lib/arHelpers invoiceCustomerTotal: an old invoice whose
    // discount is larger than its amount already stores the net, so the
    // amount IS the total. Without this the tool zeroed three of HHH's open
    // invoices and told the owner $78k was overdue while Invoices showed $90k.
    const gross = num(i.amount), disc = num(i.discount_applied)
    const total = disc > 0 && disc > gross ? gross : Math.max(0, gross - disc)
    const balance = Math.max(0, money(total - (paid[i.id] || 0)))
    const due = i.due_date ? new Date(i.due_date) : new Date(new Date(i.created_at).getTime() + 30 * 86400000)
    const days = Math.max(0, Math.floor((now - due.getTime()) / 86400000))
    return { invoice: i.invoice_id || `#${i.id}`, customer: names[i.customer_id] || null, status: i.payment_status || 'Pending', total: money(total), balance, days_overdue: days, invoice_date: i.invoice_date || String(i.created_at).slice(0, 10), due_date: due.toISOString().slice(0, 10), job_id: i.job_id }
  })
  if (status === 'open' || status === 'overdue') out = out.filter(x => x.balance > 0)
  if (status === 'overdue') out = out.filter(x => x.days_overdue > 0)
  if (input?.min_days_overdue) out = out.filter(x => x.days_overdue >= num(input.min_days_overdue))
  out.sort((a, b) => b.balance - a.balance)
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: out.length,
    total_balance: money(out.reduce((s, x) => s + x.balance, 0)),
    total_billed: money(out.reduce((s, x) => s + x.total, 0)),
    invoices: out.slice(0, limit),
    scope: `${out.length} ${status} invoice(s); list is the largest ${Math.min(limit, out.length)} by balance. Balance = invoice total after discounts minus payments applied; overdue = past due_date (or 30 days from creation when no due date).`,
  }
}

async function payments(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,amount,date,method,status,invoice_id,customer_id,job_id,is_deposit,refunded_amount', order: 'date.desc' })
  if (input?.start_date) p.append('date', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('date', `lte.${clean(input.end_date)}`)
  if (input?.method) p.append('method', `ilike.*${clean(input.method)}*`)
  if (input?.customer_name) {
    const t = clean(input.customer_name)
    const cs = await readAll(r, `customers?${co}&select=id&or=(name.ilike.*${t}*,business_name.ilike.*${t}*)`, 200)
    if (!cs.length) return { count: 0, total: 0, note: `No customer matching "${input.customer_name}".` }
    p.append('customer_id', `in.(${cs.map((c: any) => c.id).join(',')})`)
  }
  const rows = (await readAll(r, `payments?${co}&${p}`)).filter((x: any) => String(x.status || '').toLowerCase() !== 'failed')
  const names: Record<number, string> = {}
  const cids = [...new Set(rows.map((x: any) => x.customer_id).filter(Boolean))].slice(0, 300)
  if (cids.length) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.join(',')})`)) names[c.id] = c.business_name || c.name
  const byMethod: Record<string, number> = {}
  for (const x of rows) byMethod[x.method || 'unknown'] = money((byMethod[x.method || 'unknown'] || 0) + num(x.amount))
  const total = money(rows.reduce((s: number, x: any) => s + num(x.amount), 0))
  const refunded = money(rows.reduce((s: number, x: any) => s + num(x.refunded_amount), 0))
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: rows.length, total, refunded, net: money(total - refunded), by_method: byMethod,
    payments: rows.slice(0, limit).map((x: any) => ({ date: x.date, amount: num(x.amount), method: x.method, customer: names[x.customer_id] || null, invoice_id: x.invoice_id, deposit: x.is_deposit === true })),
    scope: `${rows.length} payment(s); the list is the most recent ${Math.min(limit, rows.length)}. Totals cover every matching payment.`,
    ...(rows.length >= 5000 ? { WARNING: 'Read the first 5000 payments only — totals are a floor.' } : {}),
  }
}

// Port of src/lib/reports.js jobCosting — the Job Costing report and the
// profitability view on each job. Revenue = payments tagged to the job plus
// prepaid_revenue; cost = job lines walked through bundle components into
// material/labor, plus labor_cost on the line, plus bank debits and logged
// expenses tagged to the job. No cost captured reads as null, not $0.
async function jobProfitability(r: Rest, co: string, input: any) {
  const jp = new URLSearchParams({ select: 'id,job_id,job_title,status,assigned_team,job_total,prepaid_revenue,parent_job_id,start_date,end_date,completed_at,customer_id', order: 'created_at.desc' })
  if (input?.status) jp.append('status', `ilike.${clean(input.status)}`)
  if (input?.team) jp.append('assigned_team', `ilike.*${clean(input.team)}*`)
  if (input?.start_date) jp.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) jp.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  let jobs = await readAll(r, `jobs?${co}&${jp}`, 3000)
  const custNames: Record<number, string> = {}
  const cids = [...new Set(jobs.map((j: any) => j.customer_id).filter(Boolean))]
  for (let i = 0; i < cids.length; i += 300) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.slice(i, i + 300).join(',')})`)) custNames[c.id] = c.business_name || c.name
  if (input?.job_name) {
    const t = clean(input.job_name).toLowerCase()
    jobs = jobs.filter((j: any) => [j.job_title, j.job_id, custNames[j.customer_id]].some(v => String(v || '').toLowerCase().includes(t)))
    if (!jobs.length) return { count: 0, note: `No job matching "${input.job_name}".` }
  }
  const jobIds = jobs.map((j: any) => j.id)
  const idList = (ids: number[]) => `in.(${ids.join(',')})`
  const lines: any[] = [], pays: any[] = [], plaid: any[] = [], manual: any[] = []
  const seenPayment = new Set<number>()
  for (let i = 0; i < jobIds.length; i += 200) {
    const chunk = jobIds.slice(i, i + 200)
    // A payment recorded on an invoice usually carries no job_id of its own;
    // the invoice knows the job. Same rule as lib/reports.js jobCosting.
    const invs = await readAll(r, `invoices?${co}&select=id,job_id&job_id=${idList(chunk)}`)
    const invoiceJob = new Map<number, number>(invs.map((x: any) => [x.id, x.job_id]))
    const [l, pDirect, pViaInvoice, t, m] = await Promise.all([
      readAll(r, `job_lines?${co}&select=job_id,item_id,quantity,labor_cost&job_id=${idList(chunk)}`),
      readAll(r, `payments?${co}&select=id,job_id,invoice_id,amount&job_id=${idList(chunk)}`),
      invs.length ? readAll(r, `payments?${co}&select=id,job_id,invoice_id,amount&invoice_id=${idList([...invoiceJob.keys()])}`) : Promise.resolve([]),
      readAll(r, `plaid_transactions?${co}&select=job_id,ai_job_id,amount,is_transfer&or=(job_id.${idList(chunk)},ai_job_id.${idList(chunk)})`),
      readAll(r, `expenses?${co}&select=job_id,amount&job_id=${idList(chunk)}`),
    ])
    for (const p of [...pDirect, ...pViaInvoice]) {
      if (seenPayment.has(p.id)) continue
      seenPayment.add(p.id)
      pays.push({ ...p, job_id: p.job_id || invoiceJob.get(p.invoice_id) || null })
    }
    lines.push(...l); plaid.push(...t); manual.push(...m)
  }
  const [products, components] = await Promise.all([
    readAll(r, `products_services?${co}&select=id,cost,material_or_labor`, 10000),
    readAll(r, `product_components?${co}&select=parent_product_id,component_product_id,quantity`, 10000),
  ])
  const productMap = new Map(products.map((p: any) => [p.id, p]))
  const kids = new Map<number, any[]>()
  for (const c of components) { const arr = kids.get(c.parent_product_id) || []; arr.push(c); kids.set(c.parent_product_id, arr) }
  const classify = (pid: number, depth = 0): { material: number; labor: number } => {
    const res = { material: 0, labor: 0 }
    if (!pid || depth > 3) return res
    const product: any = productMap.get(pid)
    const children = kids.get(pid) || []
    if (!children.length) {
      if (!product) return res
      const cost = num(product.cost)
      if (product.material_or_labor === 'labor') res.labor = cost; else res.material = cost
      return res
    }
    for (const c of children) {
      const sub: any = productMap.get(c.component_product_id)
      const q = num(c.quantity) || 1
      if (!sub) continue
      const cost = num(sub.cost) * q
      if (sub.material_or_labor === 'material') res.material += cost
      else if (sub.material_or_labor === 'labor') res.labor += cost
      else { const s2 = classify(c.component_product_id, depth + 1); res.material += s2.material * q; res.labor += s2.labor * q }
    }
    return res
  }
  const revenueBy = new Map<number, number>(), expBy = new Map<number, number>(), linesBy = new Map<number, any[]>()
  for (const p of pays) if (p.job_id) revenueBy.set(p.job_id, (revenueBy.get(p.job_id) || 0) + num(p.amount))
  for (const t of plaid) { const v = num(t.amount); if (v <= 0 || t.is_transfer) continue; const jid = t.job_id || t.ai_job_id; if (jid) expBy.set(jid, (expBy.get(jid) || 0) + v) }
  for (const e of manual) if (e.job_id) expBy.set(e.job_id, (expBy.get(e.job_id) || 0) + num(e.amount))
  for (const l of lines) { const arr = linesBy.get(l.job_id) || []; arr.push(l); linesBy.set(l.job_id, arr) }

  const rows = jobs.map((j: any) => {
    let material = 0, labor = 0
    for (const l of linesBy.get(j.id) || []) { const q = num(l.quantity) || 1; const s = classify(l.item_id); material += s.material * q; labor += s.labor * q; labor += num(l.labor_cost) }
    const tagged = expBy.get(j.id) || 0
    const hasCost = material > 0 || labor > 0 || tagged > 0
    const revenue = (revenueBy.get(j.id) || 0) + num(j.prepaid_revenue)
    const cost = material + labor + tagged
    return {
      job: j.job_id || `#${j.id}`, title: j.job_title || '', customer: custNames[j.customer_id] || null, status: j.status, team: j.assigned_team || null,
      contract: num(j.job_total), revenue: money(revenue),
      material: hasCost ? money(material) : null, labor: hasCost ? money(labor) : null, tagged_expenses: hasCost ? money(tagged) : null,
      total_cost: hasCost ? money(cost) : null, profit: hasCost ? money(revenue - cost) : null,
      margin_pct: hasCost && revenue > 0 ? Math.round((revenue - cost) / revenue * 1000) / 10 : null,
      completed: j.completed_at ? String(j.completed_at).slice(0, 10) : null,
    }
  }).filter(x => x.revenue > 0 || x.total_cost != null || input?.job_name)
  const sort = input?.sort || 'profit'
  const key = (x: any) => sort === 'revenue' ? x.revenue : sort === 'margin' ? (x.margin_pct ?? -Infinity) : sort === 'worst' ? -(x.margin_pct ?? Infinity) : (x.profit ?? -Infinity)
  rows.sort((a, b) => key(b) - key(a))
  const withCost = rows.filter(x => x.total_cost != null)
  const limit = clamp(input?.limit, 20, 100)
  const teams: Record<string, { jobs: number; revenue: number; cost: number }> = {}
  for (const x of withCost) { const k = x.team || 'Unassigned'; teams[k] ||= { jobs: 0, revenue: 0, cost: 0 }; teams[k].jobs++; teams[k].revenue += x.revenue; teams[k].cost += x.total_cost || 0 }
  return {
    count: rows.length,
    jobs_with_cost_data: withCost.length,
    totals: { revenue: money(rows.reduce((s, x) => s + x.revenue, 0)), cost: money(withCost.reduce((s, x) => s + (x.total_cost || 0), 0)), profit: money(withCost.reduce((s, x) => s + (x.profit || 0), 0)) },
    by_team: Object.fromEntries(Object.entries(teams).map(([k, v]) => [k, { jobs: v.jobs, revenue: money(v.revenue), cost: money(v.cost), profit: money(v.revenue - v.cost), margin_pct: v.revenue > 0 ? Math.round((v.revenue - v.cost) / v.revenue * 1000) / 10 : null }])),
    jobs: rows.slice(0, limit),
    scope: `${rows.length} job(s), ${withCost.length} with cost captured. The same math as the Job Costing report: revenue is payments tagged to the job or to one of its invoices, cost is job lines (bundle components walked) plus expenses tagged to the job. null cost = nothing captured, not zero. Totals for profit cover only jobs with cost data.`,
  }
}

async function payrollRuns(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'pay_date,period_start,period_end,status,total_gross,employee_count', order: 'pay_date.desc' })
  if (input?.start_date) p.append('pay_date', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('pay_date', `lte.${clean(input.end_date)}`)
  const rows = (await readAll(r, `payroll_runs?${co}&${p}`, 500)).filter((x: any) => !x.status || x.status === 'completed' || x.status === 'paid')
  const limit = clamp(input?.limit, 12, 60)
  return {
    runs: rows.length,
    gross_total: money(rows.reduce((s: number, x: any) => s + num(x.total_gross), 0)),
    avg_headcount: rows.length ? Math.round(rows.reduce((s: number, x: any) => s + num(x.employee_count), 0) / rows.length) : 0,
    list: rows.slice(0, limit).map((x: any) => ({ pay_date: x.pay_date, period: `${x.period_start} to ${x.period_end}`, gross: num(x.total_gross), people: num(x.employee_count) })),
    scope: 'Completed payroll runs only. Gross wages; employer payroll taxes (about 7.65% FICA plus FUTA/SUI) come on top. No pay rates are included.',
  }
}

async function bankBalances(r: Rest, co: string) {
  const accts = (await readAll(r, `connected_accounts?${co}&select=account_name,mask,account_type,account_subtype,current_balance,available_balance,status,last_synced`, 100))
    .filter((a: any) => a.status !== 'inactive' && a.status !== 'disconnected')
  let cash = 0, owed = 0
  const list = accts.map((a: any) => {
    const cur = num(a.current_balance), avail = a.available_balance == null ? null : num(a.available_balance)
    if (a.account_type === 'credit') owed += cur; else cash += avail ?? cur
    return { account: `${a.account_name}${a.mask ? ` …${a.mask}` : ''}`, type: a.account_type === 'credit' ? 'credit card' : (a.account_subtype || a.account_type), current: money(cur), available: avail == null ? null : money(avail), last_synced: a.last_synced }
  })
  return { accounts: list, total_cash_available: money(cash), total_card_balances_owed: money(owed), scope: accts.length ? 'As of the last bank sync; pending transactions may not be reflected.' : 'No bank account is connected.' }
}
