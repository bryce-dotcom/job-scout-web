// The bookkeeper's brain, pure and testable (vitest imports this file from
// src/lib/booksDeduce.test.js; the books-deduce edge function runs it).
//
// Every unconfirmed bank row gets a VERDICT: what the money is, what to
// book it as, what it matches, how sure we are, and the evidence in plain
// words. Deduction order is the order a CPA would reason in — from the
// facts the ledger already holds (pay dates, open balances, open incentive
// claims, loan schedules, payouts, the owner's own rules, what this exact
// descriptor was confirmed as before) down to the descriptor itself. The
// model (books-deduce → Claude) is asked only about rows the rules leave
// below the bar, and only to pick among candidates the rules hand it.
//
// Review-only: this module never writes. The function stores verdicts in
// books_verdicts; a person (or the auto-book setting) applies them.

export type Txn = {
  id: number
  amount: number              // Plaid sign: positive = money OUT, negative = money IN
  date: string
  name?: string | null
  merchant_name?: string | null
  connected_account_id?: number | null
  is_transfer?: boolean | null
  user_category?: string | null
  ai_category?: string | null
  ai_tax_category?: string | null
  ai_job_id?: number | null
  ai_job_confidence?: number | null
  plaid_category?: unknown
  plaid_personal_finance_category?: string | null
  stripe_payout_id?: string | null
  matched_payment_id?: number | null
  matched_utility_invoice_id?: number | null
  loan_payment_id?: number | null
  pending?: boolean | null
}

// phantom: marked Paid by hand with NO payment row behind it (HHH has 327 of
// these). The money still arrived somewhere; the deposit that equals the
// customer total IS that payment, and applying the verdict records it.
export type OpenInvoice = { id: number; invoice_id?: string | null; customer_id?: number | null; customer_name?: string | null; balance: number; invoice_date?: string | null; due_date?: string | null; phantom?: boolean }
export type OpenClaim = { id: number; utility_name?: string | null; amount: number; invoice_id?: number | null; customer_name?: string | null; job_description?: string | null }
export type Loan = { id: number; name: string; lender?: string | null; monthly_payment?: number | null; next_payment_amount?: number | null; match_payee?: string | null; status?: string | null }
export type PayrollRun = { id: number; pay_date: string; total_gross?: number | null; net_total?: number | null }
export type TaxLiability = { id: number; agency?: string | null; amount_total?: number | null; due_date?: string | null; paid_at?: string | null }
export type Rule = { id?: number; merchant_pattern: string; assigned_category: string; assigned_tax_category?: string | null; match_type?: string | null; priority?: number | null }
export type Vendor = { id: number; name: string; business_name?: string | null }
export type HistoryEntry = { category: string; tax_category: string | null; count: number; transfer: number }

export type Context = {
  today?: Date
  openInvoices?: OpenInvoice[]
  openClaims?: OpenClaim[]
  loans?: Loan[]
  payrollRuns?: PayrollRun[]
  taxLiabilities?: TaxLiability[]
  rules?: Rule[]
  vendors?: Vendor[]
  history?: Map<string, HistoryEntry>
  recentTxns?: Txn[]          // for transfer pairs (both signs, any account, ±3 days)
  categories?: { name: string; type?: string | null; default_tax_category?: string | null }[]
}

export type Match = { type: 'invoice' | 'utility_invoice' | 'loan' | 'payroll_run' | 'tax_liability' | 'transfer_pair' | 'vendor'; id: number; amount: number; label: string }

export type Verdict = {
  txn_id: number
  kind: 'payroll' | 'tax_deposit' | 'stripe_payout' | 'loan_payment' | 'transfer' | 'utility_incentive' | 'customer_payment' | 'refund' | 'expense' | 'income' | 'unknown'
  category: string | null
  tax_category: string | null
  is_transfer: boolean
  matches: Match[]
  job_id: number | null
  confidence: number
  evidence: string[]
  reason: string
  source: 'rules' | 'model'
  needs_model: boolean
  candidates?: { invoices?: OpenInvoice[]; claims?: OpenClaim[]; categories?: string[] }
}

const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0 }
const r2 = (n: number) => Math.round(n * 100) / 100
const abs = (n: number) => Math.abs(n)
const dayMs = 86400000
const parseDay = (s: unknown): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''))
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
}
const daysBetween = (a: unknown, b: unknown) => { const x = parseDay(a), y = parseDay(b); return x && y ? abs(x.getTime() - y.getTime()) / dayMs : Infinity }
const money = (n: number) => '$' + abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export function descriptor(t: Txn): string { return `${t.merchant_name || ''} ${t.name || ''}`.trim() }
export function normalizeDescriptor(s: unknown): string {
  return String(s ?? '').toLowerCase()
    .replace(/\d{2,}/g, ' ')                   // reference numbers, dates, amounts
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\b(pos|debit|credit|purchase|payment|pmt|ach|web|online|card|chk|check|ref|id|des|co|inc|llc|ltd|the|of|to|from)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

// Confirmed history → what this descriptor usually is. The engine's memory.
export function buildHistory(confirmed: Txn[]): Map<string, HistoryEntry> {
  const m = new Map<string, { cats: Map<string, { n: number; tax: string | null }>; transfer: number; n: number }>()
  for (const t of confirmed || []) {
    const key = normalizeDescriptor(descriptor(t))
    if (!key) continue
    const cat = t.user_category || null
    const e = m.get(key) || { cats: new Map(), transfer: 0, n: 0 }
    e.n++
    if (t.is_transfer) e.transfer++
    if (cat) { const c = e.cats.get(cat) || { n: 0, tax: null }; c.n++; c.tax = c.tax || (t as any).user_tax_category || t.ai_tax_category || null; e.cats.set(cat, c) }
    m.set(key, e)
  }
  const out = new Map<string, HistoryEntry>()
  for (const [k, e] of m) {
    const top = [...e.cats.entries()].sort((a, b) => b[1].n - a[1].n)[0]
    if (!top && e.transfer === 0) continue
    out.set(k, { category: top ? top[0] : 'Transfer', tax_category: top ? top[1].tax : null, count: top ? top[1].n : e.transfer, transfer: e.transfer })
  }
  return out
}

const PAYROLL_RE = /payroll|gusto|adp\b|paychex|draft withdrawal|net pay|direct dep/i
const TAX_RE = /eftps|irs\b|usataxpymt|tax ?pymt|tax payment|state tax|\bdwq\b|dept of workforce|tax comm/i
const TRANSFER_RE = /\btransfer\b|\bxfer\b|to savings|from savings|to checking|from checking|online banking|internal/i
const STRIPE_RE = /stripe/i
const REFUND_RE = /refund|reversal|chargeback|return/i
const DRAW_RE = /owner|distribution|draw\b|member draw/i
const FEE_RE = /service charge|monthly fee|overdraft|nsf fee|wire fee|analysis fee/i

function ruleMatches(rule: Rule, desc: string): boolean {
  const p = String(rule.merchant_pattern || '').toLowerCase().trim()
  const d = desc.toLowerCase()
  if (!p) return false
  switch (String(rule.match_type || 'contains')) {
    case 'exact': return d === p
    case 'starts_with': case 'startswith': return d.startsWith(p)
    case 'regex': try { return new RegExp(p, 'i').test(d) } catch { return false }
    default: return d.includes(p)
  }
}

// Bounded subset-sum: which of these open amounts add up to the deposit.
// Up to 4 parts, up to 60 candidates, tolerance $1 (bank rounding / fees).
export function subsetSum<T extends { amount: number }>(items: T[], target: number, { maxParts = 4, tol = 1 } = {}): T[] | null {
  const cands = items.filter(i => i.amount > 0 && i.amount <= target + tol).sort((a, b) => b.amount - a.amount).slice(0, 60)
  const exact = cands.find(i => abs(i.amount - target) <= tol)
  if (exact) return [exact]
  const n = cands.length
  for (let parts = 2; parts <= maxParts; parts++) {
    const idx: number[] = []
    const rec = (start: number, left: number, depth: number): T[] | null => {
      if (depth === parts) return abs(left) <= tol ? idx.map(i => cands[i]) : null
      for (let i = start; i < n; i++) {
        const a = cands[i].amount
        if (a > left + tol) continue
        if (depth < parts - 1 && a * (parts - depth) < left - tol * parts) break // sorted desc: nothing after can reach it
        idx.push(i)
        const r = rec(i + 1, left - a, depth + 1)
        idx.pop()
        if (r) return r
      }
      return null
    }
    const r = rec(0, target, 0)
    if (r) return r
  }
  return null
}

// Does the bank descriptor name this party? The whole name, or its
// distinctive words: all of them, or — for a multi-word name — the first
// one plus at least half ("The Ivy at Draper" vs "The Ivy Deposit").
const STOP = new Set(['the', 'and', 'of', 'at', 'llc', 'inc', 'co', 'ltd', 'company', 'services', 'service', 'group', 'auto', 'storage', 'dba'])
const nameHit = (hay: string, name: unknown) => {
  const n = String(name ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (n.length < 3) return false
  const h = ' ' + hay.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' '
  if (h.includes(' ' + n + ' ') || (n.length >= 6 && h.includes(n))) return true
  const words = n.split(' ').filter(w => w.length >= 3 && !STOP.has(w))
  if (words.length === 0) return false
  const hits = words.filter(w => h.includes(' ' + w + ' ') || (w.length >= 5 && h.includes(w)))
  if (hits.length === words.length) return true
  return words.length >= 2 && hits.length * 2 >= words.length && hits[0] === words[0]
}

export function deduce(t: Txn, ctx: Context = {}): Verdict {
  const desc = descriptor(t)
  const key = normalizeDescriptor(desc)
  const amt = num(t.amount)
  const isIn = amt < 0
  const a = abs(amt)
  const ev: string[] = []
  const v: Verdict = { txn_id: t.id, kind: 'unknown', category: null, tax_category: null, is_transfer: false, matches: [], job_id: null, confidence: 0, evidence: ev, reason: '', source: 'rules', needs_model: false }
  const done = (kind: Verdict['kind'], category: string | null, tax: string | null, confidence: number, reason: string, extra: Partial<Verdict> = {}) => {
    Object.assign(v, { kind, category, tax_category: tax, confidence: r2(Math.min(0.99, confidence)), reason }, extra)
    v.needs_model = v.confidence < 0.85
    if (t.ai_job_id && num(t.ai_job_confidence) >= 0.8 && !v.job_id && kind === 'expense') v.job_id = t.ai_job_id
    return v
  }
  const hist = ctx.history?.get(key)

  // 1. Already tied to something: the ledger knows.
  if (t.stripe_payout_id || (isIn && STRIPE_RE.test(desc))) {
    ev.push(t.stripe_payout_id ? `Tied to Stripe payout ${t.stripe_payout_id}` : 'Descriptor names Stripe')
    return done('stripe_payout', 'Transfer', null, t.stripe_payout_id ? 0.99 : 0.9, 'A Stripe payout: the card payments behind it are already recorded on their invoices, so the deposit is a transfer, not new income.', { is_transfer: true })
  }
  if (t.loan_payment_id) { ev.push('Already booked as a loan payment'); return done('loan_payment', 'Loan Payment', 'Not deductible', 0.99, 'Booked loan payment.') }

  // 2. Transfer between the company's own accounts.
  const pair = (ctx.recentTxns || []).find(o => o.id !== t.id && abs(num(o.amount) + amt) <= 0.01 && daysBetween(o.date, t.date) <= 3 && (o.connected_account_id ?? null) !== (t.connected_account_id ?? null))
  if (pair) {
    ev.push(`Opposite ${money(a)} on ${pair.date} in another connected account (${descriptor(pair) || 'row ' + pair.id})`)
    return done('transfer', 'Transfer', null, 0.96, 'Money moved between your own accounts: the same amount shows up on the other side within three days.', { is_transfer: true, matches: [{ type: 'transfer_pair', id: pair.id, amount: a, label: descriptor(pair) }] })
  }
  if (TRANSFER_RE.test(desc) && !PAYROLL_RE.test(desc)) {
    ev.push('Descriptor reads as a transfer')
    const conf = hist && hist.transfer > 0 ? 0.92 : 0.8
    if (hist && hist.transfer > 0) ev.push(`Confirmed as a transfer ${hist.transfer}× before`)
    return done('transfer', 'Transfer', null, conf, 'Reads as a transfer between accounts; no matching deposit was found in a connected account, so it may be to an account that is not linked.', { is_transfer: true })
  }

  if (!isIn) {
    // 3. Payroll and payroll taxes, by pay date and by descriptor.
    const run = (ctx.payrollRuns || []).find(r => daysBetween(r.pay_date, t.date) <= 3 && (abs(num(r.net_total) - a) <= Math.max(1, a * 0.01) || abs(num(r.total_gross) - a) <= Math.max(1, a * 0.01)))
    const payrollDesc = PAYROLL_RE.test(desc)
    if (run || payrollDesc) {
      if (run) ev.push(`Payroll run #${run.id} paid ${run.pay_date} for ${money(num(run.net_total) || num(run.total_gross))}`)
      if (payrollDesc) ev.push('Descriptor names payroll / the payroll provider')
      const nearRun = (ctx.payrollRuns || []).find(r => daysBetween(r.pay_date, t.date) <= 4)
      if (!run && nearRun) ev.push(`Within four days of payroll run #${nearRun.id} (pay date ${nearRun.pay_date})`)
      return done('payroll', 'Payroll', 'Line 9 - Salaries and wages', run ? 0.97 : nearRun ? 0.92 : 0.86, run ? 'The amount and date line up with a payroll run.' : 'A payroll draw on or near a pay date.', { matches: run ? [{ type: 'payroll_run', id: run.id, amount: a, label: `Payroll ${run.pay_date}` }] : [] })
    }
    if (TAX_RE.test(desc)) {
      const liab = (ctx.taxLiabilities || []).find(l => !l.paid_at && abs(num(l.amount_total) - a) <= Math.max(1, a * 0.01))
      ev.push('Descriptor names a tax agency / EFTPS')
      if (liab) ev.push(`Open payroll tax liability #${liab.id} (${liab.agency || 'agency'}) for ${money(num(liab.amount_total))}`)
      return done('tax_deposit', 'Payroll Taxes', 'Line 15 - Taxes and licenses', liab ? 0.97 : 0.9, liab ? 'A tax deposit that matches an open payroll tax liability.' : 'A payment to a tax agency.', { matches: liab ? [{ type: 'tax_liability', id: liab.id, amount: a, label: liab.agency || 'tax' }] : [] })
    }
    // 4. Loan payments by schedule / payee.
    for (const l of ctx.loans || []) {
      if (l.status && l.status !== 'active') continue
      const sched = num(l.next_payment_amount) || num(l.monthly_payment)
      const amtHit = sched > 0 && abs(a - sched) <= Math.max(1, sched * 0.01)
      const payee = l.match_payee || l.lender
      const payeeHit = !!payee && nameHit(desc, payee)
      if (amtHit || payeeHit) {
        if (amtHit) ev.push(`${l.name}: scheduled payment is ${money(sched)}`)
        if (payeeHit) ev.push(`Descriptor names ${payee}`)
        return done('loan_payment', 'Loan Payment', 'Not deductible', amtHit && payeeHit ? 0.97 : amtHit ? 0.88 : 0.8, amtHit && payeeHit ? `The ${l.name} payment: right payee, right amount.` : amtHit ? `Same amount as the ${l.name} payment.` : `Paid to ${payee}, the lender on ${l.name}, but not the scheduled amount — a fee, an extra principal payment, or a different account.`, { matches: [{ type: 'loan', id: l.id, amount: a, label: l.name }] })
      }
    }
    // 5. The owner's own rules win over everything that follows.
    const rule = [...(ctx.rules || [])].sort((x, y) => num(y.priority) - num(x.priority)).find(r => ruleMatches(r, desc))
    if (rule) {
      ev.push(`Your rule "${rule.merchant_pattern}" → ${rule.assigned_category}`)
      return done('expense', rule.assigned_category, rule.assigned_tax_category || null, 0.96, `Matches a category rule you set.`)
    }
    // 6. Memory: what this descriptor was confirmed as before.
    if (hist && hist.count >= 2) {
      ev.push(`Confirmed as ${hist.category} ${hist.count}× before`)
      return done(hist.category === 'Transfer' ? 'transfer' : 'expense', hist.category, hist.tax_category, hist.count >= 5 ? 0.95 : 0.9, `This payee has been booked as ${hist.category} ${hist.count} times.`, { is_transfer: hist.category === 'Transfer' })
    }
    if (FEE_RE.test(desc)) { ev.push('Bank fee descriptor'); return done('expense', 'Bank & Merchant Fees', 'Line 20 - Other deductions', 0.93, 'A bank service fee.') }
    if (DRAW_RE.test(desc)) { ev.push('Descriptor reads as an owner draw'); return done('expense', 'Owner Distribution', 'Not deductible', 0.8, 'Looks like an owner distribution, which is not an expense.') }
    // 7. Vendors we know.
    const vendor = (ctx.vendors || []).find(vd => nameHit(desc, vd.business_name || vd.name) || nameHit(desc, vd.name))
    if (vendor) ev.push(`Vendor on file: ${vendor.name}`)
    const guess = t.ai_category || null
    if (guess) ev.push(`Earlier AI guess: ${guess}`)
    if (hist && hist.count === 1) ev.push(`Confirmed once before as ${hist.category}`)
    const cat = (hist?.category) || (vendor ? 'Job Materials' : guess)
    const taxFromCat = ctx.categories?.find(c => c.name === cat)?.default_tax_category || t.ai_tax_category || null
    return done('expense', cat, cat ? taxFromCat : null, cat ? (hist ? 0.75 : vendor ? 0.7 : 0.6) : 0.3, cat ? `Best guess from ${hist ? 'one earlier confirmation' : vendor ? 'the vendor list' : 'the descriptor'}; worth a look.` : 'Nothing in the ledger explains this payee yet.', { matches: vendor ? [{ type: 'vendor', id: vendor.id, amount: a, label: vendor.name }] : [], candidates: { categories: (ctx.categories || []).filter(c => c.type !== 'income').map(c => c.name) } })
  }

  // ── money in ──
  // 8. Utility incentive claims: open claims that sum to the deposit, or a
  //    utility named in the descriptor.
  const claims = (ctx.openClaims || []).map(c => ({ ...c, amount: num(c.amount) }))
  const utilityNamed = claims.find(c => c.utility_name && nameHit(desc, c.utility_name.replace(/\(.*?\)/g, '')))
  const claimSet = subsetSum(claims, a, { maxParts: 3 })
  if (claimSet) {
    ev.push(`Open incentive claim${claimSet.length > 1 ? 's' : ''} ${claimSet.map(c => `#${c.id} ${c.utility_name || ''} ${money(c.amount)}`).join(' + ')} = ${money(a)}`)
    return done('utility_incentive', 'Utility Rebates & Incentives', 'Income', claimSet.length === 1 ? 0.96 : 0.92, `${claimSet.length === 1 ? 'An' : 'Several'} open utility incentive claim${claimSet.length > 1 ? 's' : ''} add${claimSet.length > 1 ? '' : 's'} up to this deposit exactly.`, { matches: claimSet.map(c => ({ type: 'utility_invoice', id: c.id, amount: c.amount, label: `${c.utility_name || 'Utility'} — ${c.customer_name || c.job_description || 'claim #' + c.id}` })) })
  }
  // 9. Customer payments: open balances that sum to the deposit.
  const invoices = (ctx.openInvoices || []).map(i => ({ ...i, amount: num(i.balance) }))
  const named = invoices.filter(i => i.customer_name && nameHit(desc, i.customer_name))
  const namedSet = named.length ? subsetSum(named, a, { maxParts: 4 }) : null
  const phantomNote = (set: { invoice_id?: string | null; id: number; phantom?: boolean }[]) => {
    const ph = set.filter(i => i.phantom)
    if (ph.length) ev.push(`${ph.map(i => i.invoice_id || '#' + i.id).join(', ')} ${ph.length > 1 ? 'were' : 'was'} marked Paid by hand with no payment recorded — this deposit is that payment`)
  }
  if (namedSet) {
    ev.push(`Descriptor names ${namedSet[0].customer_name}; ${namedSet.some(i => i.phantom) ? 'invoice' : 'open invoice'}${namedSet.length > 1 ? 's' : ''} ${namedSet.map(i => `${i.invoice_id || '#' + i.id} ${money(i.amount)}`).join(' + ')} = ${money(a)}`)
    phantomNote(namedSet)
    return done('customer_payment', 'Sales', 'Income', 0.97, 'The customer is named on the deposit and their open balance matches to the cent.', { matches: namedSet.map(i => ({ type: 'invoice', id: i.id, amount: i.amount, label: `${i.invoice_id || '#' + i.id} — ${i.customer_name || ''}` })) })
  }
  // Same customer only: a cross-customer subset is how 43 false matches got made.
  const byCustomer = new Map<string, typeof invoices>()
  for (const i of invoices) { const k = String(i.customer_id ?? i.customer_name ?? i.id); byCustomer.set(k, [...(byCustomer.get(k) || []), i]) }
  const sets: { set: typeof invoices; recent: number }[] = []
  for (const list of byCustomer.values()) {
    const s = subsetSum(list, a, { maxParts: 4 })
    if (s) sets.push({ set: s, recent: Math.min(...s.map(i => daysBetween(i.invoice_date || i.due_date, t.date))) })
  }
  // Mixed: open claims + ONE customer invoice (the $57,372.68 SRP + check case).
  if (sets.length === 0 && claims.length) {
    for (const c of claims) {
      const rest = a - c.amount
      if (rest <= 0.5) continue
      const inv = invoices.find(i => abs(i.amount - rest) <= 1)
      if (inv) {
        ev.push(`Incentive claim #${c.id} ${money(c.amount)} + invoice ${inv.invoice_id || '#' + inv.id} ${money(inv.amount)} = ${money(a)}`)
        return done('utility_incentive', 'Utility Rebates & Incentives', 'Income', 0.86, 'One deposit carrying an incentive check and a customer check together.', { matches: [{ type: 'utility_invoice', id: c.id, amount: c.amount, label: `${c.utility_name || 'Utility'} claim #${c.id}` }, { type: 'invoice', id: inv.id, amount: inv.amount, label: `${inv.invoice_id || '#' + inv.id} — ${inv.customer_name || ''}` }] })
      }
    }
  }
  if (sets.length === 1) {
    const s = sets[0].set
    ev.push(`${s.some(i => i.phantom) ? 'Invoice' : 'Open invoice'}${s.length > 1 ? 's' : ''} for ${s[0].customer_name || 'one customer'}: ${s.map(i => `${i.invoice_id || '#' + i.id} ${money(i.amount)}`).join(' + ')} = ${money(a)}`)
    phantomNote(s)
    return done('customer_payment', 'Sales', 'Income', s.length === 1 ? 0.93 : 0.88, `${s.length === 1 ? 'One' : 'A set of'} open invoice${s.length > 1 ? 's' : ''} for the same customer matches the amount exactly.`, { matches: s.map(i => ({ type: 'invoice', id: i.id, amount: i.amount, label: `${i.invoice_id || '#' + i.id} — ${i.customer_name || ''}` })) })
  }
  if (sets.length > 1) {
    sets.sort((x, y) => x.recent - y.recent)
    ev.push(`${sets.length} different customers have open balances that add to ${money(a)}; nearest by date: ${sets[0].set[0].customer_name || '?'}`)
    return done('customer_payment', 'Sales', 'Income', 0.6, 'More than one customer could be behind this amount — needs the check image or the customer name.', { matches: sets[0].set.map(i => ({ type: 'invoice', id: i.id, amount: i.amount, label: `${i.invoice_id || '#' + i.id} — ${i.customer_name || ''}` })), candidates: { invoices: sets.flatMap(s => s.set).slice(0, 12) } })
  }
  if (utilityNamed) {
    ev.push(`Descriptor names ${utilityNamed.utility_name}; no open claim equals ${money(a)}`)
    return done('utility_incentive', 'Utility Rebates & Incentives', 'Income', 0.7, 'Paid by a utility, but no open claim matches the amount — a partial payment or a claim not entered yet.', { candidates: { claims: claims.filter(c => c.utility_name === utilityNamed.utility_name).slice(0, 8) } })
  }
  if (named.length) {
    const total = named.reduce((s, i) => s + i.amount, 0)
    ev.push(`Descriptor names ${named[0].customer_name}, who owes ${money(total)} across ${named.length} invoice${named.length > 1 ? 's' : ''}`)
    return done('customer_payment', 'Sales', 'Income', a <= total + 1 ? 0.72 : 0.55, a <= total + 1 ? 'A partial payment from a named customer; which invoice it goes against needs a decision.' : 'The named customer owes less than this deposit; check the invoice list.', { candidates: { invoices: named.slice(0, 8) } })
  }
  if (REFUND_RE.test(desc)) { ev.push('Descriptor reads as a refund'); return done('refund', hist?.category || 'Other Income', 'Income', 0.75, 'A refund or reversal back into the account.') }
  if (hist && hist.count >= 2) {
    ev.push(`Confirmed as ${hist.category} ${hist.count}× before`)
    return done(hist.category === 'Transfer' ? 'transfer' : 'income', hist.category, hist.category === 'Transfer' ? null : 'Income', 0.88, `This source has been booked as ${hist.category} before.`, { is_transfer: hist.category === 'Transfer' })
  }
  ev.push(t.ai_category ? `Earlier AI guess: ${t.ai_category}` : 'No open balance, claim or history explains this deposit')
  return done('unknown', t.ai_category || null, null, 0.3, 'Money in that nothing open explains: a customer not invoiced yet, a deposit for a job, or outside money.', { candidates: { invoices: invoices.filter(i => i.amount >= a * 0.5).slice(0, 10), claims: claims.slice(0, 6), categories: (ctx.categories || []).filter(c => c.type === 'income').map(c => c.name) } })
}

export function summarize(verdicts: Verdict[]) {
  const byKind: Record<string, { n: number; amount: number }> = {}
  const hist = { sure: 0, likely: 0, unsure: 0 }
  let matchedAmount = 0, needsModel = 0
  for (const v of verdicts) {
    const k = byKind[v.kind] || (byKind[v.kind] = { n: 0, amount: 0 })
    k.n++; k.amount = r2(k.amount + v.matches.reduce((s, m) => s + m.amount, 0))
    if (v.confidence >= 0.9) hist.sure++; else if (v.confidence >= 0.7) hist.likely++; else hist.unsure++
    if (v.matches.length) matchedAmount += v.matches.reduce((s, m) => s + m.amount, 0)
    if (v.needs_model) needsModel++
  }
  return { total: verdicts.length, byKind, confidence: hist, matchedAmount: r2(matchedAmount), needsModel }
}
