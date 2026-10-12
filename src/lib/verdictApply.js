// Apply a Frankie verdict to the ledger — through the SAME writes the Books
// page makes by hand, so a verdict accepted here and a row matched on the
// Transactions tab are indistinguishable afterwards.
//
//   transfer / stripe_payout → bank row confirmed as a transfer
//   expense / income / refund / payroll / tax_deposit → bank row confirmed
//     with the category + tax line (+ job when the verdict carries one)
//   loan_payment → lib/loanBook (verified payment, balance down)
//   customer_payment → a payments row per matched invoice, invoice status,
//     bank row pointer + confirmed as Sales
//   utility_incentive → lib/utilitySettlement per matched claim, bank row
//     pointer + confirmed as Utility Rebates & Incentives
//
// A correction (the reviewer picked something else) is applied the same way
// and, for an expense category, becomes a category_rule so the next row from
// that payee never asks again.
import { transferFields } from '../../supabase/functions/_shared/transferRule.ts'
import { isLegacyNetShape } from './arHelpers.js'
import { recordUtilityPayment, buildReopenPatch } from './utilitySettlement.js'
import { bookLoanPayment } from './loanBook.js'
import { normalizeDescriptor, descriptor } from '../../supabase/functions/_shared/booksDeduce.ts'

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const customerTotal = (inv) => {
  const gross = num(inv.amount), disc = num(inv.discount_applied), tax = num(inv.tax_amount)
  return (isLegacyNetShape(gross, disc) ? gross : Math.max(0, gross - disc)) + tax
}
const INCOME_KINDS = new Set(['income', 'refund', 'customer_payment', 'utility_incentive'])

export function defaultTaxFor(category, kind, categories = []) {
  if (!category) return null
  const row = (categories || []).find(c => c.name === category)
  if (row?.default_tax_category) return row.default_tax_category
  if (INCOME_KINDS.has(kind) || (row && row.type === 'income')) return 'Income'
  if (category === 'Loan Payment' || category === 'Owner Distribution' || category === 'Owner Contribution') return 'Not deductible'
  if (category === 'Payroll') return 'Line 9 - Salaries and wages'
  if (category === 'Payroll Taxes') return 'Line 15 - Taxes and licenses'
  return 'Line 20 - Other deductions'
}

/**
 * @param {object} sb
 * @param {{ companyId:number, verdict:object, txn:object, userEmail?:string|null, categories?:object[], decision?: 'accepted'|'corrected'|'auto', correction?: object|null }} input
 *   correction: { kind?, category?, tax_category?, match_ids?: number[], is_transfer?: boolean } — overrides the verdict
 * @returns {Promise<{ ok?: true, did: string[], error?: string }>}
 */
export async function applyVerdict(sb, { companyId, verdict, txn, userEmail = null, categories = [], decision = 'accepted', correction = null }) {
  const did = []
  const v = { ...verdict, ...(correction || {}) }
  if (correction?.match_ids) {
    v.matches = (verdict.candidates?.invoices || []).filter(i => correction.match_ids.includes(i.id)).map(i => ({ type: 'invoice', id: i.id, amount: i.balance, label: i.invoice_id || `#${i.id}` }))
      .concat((verdict.candidates?.claims || []).filter(c => correction.match_ids.includes(c.id)).map(c => ({ type: 'utility_invoice', id: c.id, amount: c.amount, label: c.utility_name || `claim #${c.id}` })))
    if (!v.matches.length) v.matches = (verdict.matches || []).filter(m => correction.match_ids.includes(m.id))
  }
  const amountAbs = Math.abs(num(txn.amount))
  const when = String(txn.date).slice(0, 10)
  const noteTag = `Frankie verdict ${decision}${userEmail ? ` by ${userEmail}` : ''}`
  try {
    if (v.kind === 'transfer' || v.kind === 'stripe_payout' || v.is_transfer) {
      const { error } = await sb.from('plaid_transactions').update({ confirmed: true, ...transferFields({ flagged: true }) }).eq('id', txn.id).eq('company_id', companyId)
      if (error) throw error
      did.push('confirmed as a transfer')
    } else if (v.kind === 'loan_payment') {
      const loanId = (v.matches || []).find(m => m.type === 'loan')?.id
      const { data: loan } = loanId ? await sb.from('liabilities').select('*').eq('id', loanId).eq('company_id', companyId).maybeSingle() : { data: null }
      if (!loan) throw new Error('The loan this payment belongs to was not found')
      const res = await bookLoanPayment(sb, { companyId, loan, txn, userEmail, note: noteTag })
      if (res.error) throw new Error(res.error)
      did.push(`booked ${fmt(amountAbs)} on ${loan.name} (principal ${fmt(res.split.principal)}, interest ${fmt(res.split.interest)})`)
    } else if (v.kind === 'customer_payment' && (v.matches || []).some(m => m.type === 'invoice')) {
      const invMatches = v.matches.filter(m => m.type === 'invoice')
      let pointer = null
      let left = amountAbs
      for (const m of invMatches) {
        const { data: inv } = await sb.from('invoices').select('id, invoice_id, customer_id, job_id, amount, discount_applied, tax_amount, payment_status').eq('id', m.id).eq('company_id', companyId).maybeSingle()
        if (!inv) throw new Error(`Invoice #${m.id} was not found`)
        const { data: prior } = await sb.from('payments').select('amount, status').eq('invoice_id', inv.id)
        const paidBefore = (prior || []).filter(p => !['Refunded', 'Voided'].includes(String(p.status || ''))).reduce((s, p) => s + num(p.amount), 0)
        const amount = r2(Math.min(left, num(m.amount) || left))
        if (!(amount > 0)) continue
        const { data: payRow, error: payErr } = await sb.from('payments').insert([{
          company_id: companyId, invoice_id: inv.id, customer_id: inv.customer_id || null, job_id: inv.job_id || null,
          amount, date: when, method: 'Bank Deposit', status: 'Completed', source: 'bank_match', source_transaction_id: txn.id,
          notes: `Matched bank deposit (${descriptor(txn) || 'unnamed'}) — ${noteTag}`,
        }]).select('id').single()
        if (payErr) throw payErr
        const total = customerTotal(inv)
        await sb.from('invoices').update({ payment_status: paidBefore + amount >= total - 0.01 ? 'Paid' : 'Partially Paid', updated_at: new Date().toISOString() }).eq('id', inv.id)
        pointer = pointer || { matched_invoice_id: inv.id, matched_payment_id: payRow.id, matched_utility_invoice_id: null }
        left = r2(left - amount)
        did.push(`${fmt(amount)} recorded on ${inv.invoice_id || '#' + inv.id}`)
      }
      if (!pointer) throw new Error('Nothing to record')
      const { error } = await sb.from('plaid_transactions').update({ ...pointer, matched_at: new Date().toISOString(), confirmed: true, is_transfer: false, user_category: v.category || 'Sales', user_tax_category: 'Income' }).eq('id', txn.id).eq('company_id', companyId)
      if (error) throw error
    } else if (v.kind === 'utility_incentive' && (v.matches || []).some(m => m.type === 'utility_invoice')) {
      let pointer = null
      let left = amountAbs
      for (const m of v.matches) {
        if (m.type === 'invoice') {
          // The mixed case: a customer check in the same deposit.
          const res = await applyVerdict(sb, { companyId, verdict: { ...v, kind: 'customer_payment', matches: [m] }, txn: { ...txn, amount: -Math.min(left, num(m.amount)) }, userEmail, categories, decision })
          if (res.error) throw new Error(res.error)
          did.push(...res.did); left = r2(left - num(m.amount)); continue
        }
        if (m.type !== 'utility_invoice') continue
        const { data: row } = await sb.from('utility_invoices').select('*').eq('id', m.id).eq('company_id', companyId).maybeSingle()
        if (!row) throw new Error(`Incentive claim #${m.id} was not found`)
        const { data: inv } = row.invoice_id ? await sb.from('invoices').select('*').eq('id', row.invoice_id).maybeSingle() : { data: null }
        const amount = r2(Math.min(left, num(m.amount) || left))
        const res = await recordUtilityPayment(sb, row, { paidOn: when, amount, note: `Bank deposit (${descriptor(txn) || 'unnamed'}) — ${noteTag}` }, inv)
        if (res?.error) throw new Error(`${row.utility_name || 'Utility'} claim #${row.id}: ${res.error}`)
        await sb.from('utility_invoices').update({ source_transaction_id: txn.id }).eq('id', row.id)
        pointer = pointer || { matched_invoice_id: inv?.id ?? null, matched_payment_id: null, matched_utility_invoice_id: row.id }
        left = r2(left - amount)
        did.push(`${fmt(amount)} settled on ${row.utility_name || 'utility'} claim #${row.id}`)
      }
      if (pointer) {
        const { error } = await sb.from('plaid_transactions').update({ ...pointer, matched_at: new Date().toISOString(), confirmed: true, is_transfer: false, user_category: v.category || 'Utility Rebates & Incentives', user_tax_category: 'Income' }).eq('id', txn.id).eq('company_id', companyId)
        if (error) throw error
      }
    } else {
      // Plain categorisation: expense, income, refund, payroll, tax deposit, or
      // a customer/utility verdict with no match to record.
      const category = v.category
      if (!category) throw new Error('Pick a category first')
      const tax = v.tax_category || defaultTaxFor(category, v.kind, categories)
      const updates = { confirmed: true, is_transfer: false, user_category: category, user_tax_category: tax }
      if (v.job_id) updates.job_id = v.job_id
      const { error } = await sb.from('plaid_transactions').update(updates).eq('id', txn.id).eq('company_id', companyId)
      if (error) throw error
      did.push(`confirmed as ${category}`)
    }

    // Learn from the override: an expense correction becomes a rule.
    if (decision === 'corrected' && correction?.category && num(txn.amount) > 0 && !v.is_transfer && !['loan_payment', 'customer_payment', 'utility_incentive'].includes(v.kind)) {
      const pattern = normalizeDescriptor(descriptor(txn))
      if (pattern.length >= 4) {
        const { data: existing } = await sb.from('category_rules').select('id').eq('company_id', companyId).eq('merchant_pattern', pattern).limit(1)
        if (!existing?.length) {
          await sb.from('category_rules').insert([{ company_id: companyId, merchant_pattern: pattern, assigned_category: correction.category, assigned_tax_category: correction.tax_category || defaultTaxFor(correction.category, v.kind, categories), match_type: 'contains', priority: 1 }])
          did.push(`learned a rule: "${pattern}" → ${correction.category}`)
        }
      }
    }

    await sb.from('books_verdicts').update({ status: decision, correction: correction || null, reviewed_by: userEmail || null, reviewed_at: new Date().toISOString(), applied: did, applied_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('plaid_transaction_id', txn.id).eq('company_id', companyId)
    return { ok: true, did }
  } catch (e) {
    return { error: e?.message || String(e), did }
  }
}

/**
 * Put a booked row back exactly where it was: the payment rows, claim
 * settlements and loan payments it created are removed, invoice statuses
 * recomputed, the bank row unconfirmed, and the verdict goes back to
 * 'proposed'. A rule learned from a correction is kept (it was a decision).
 */
export async function undoVerdict(sb, { companyId, txn, userEmail = null }) {
  const did = []
  try {
    // Customer payments this bank row created.
    const { data: pays } = await sb.from('payments').select('id, invoice_id, amount').eq('company_id', companyId).eq('source_transaction_id', txn.id)
    const invoiceIds = [...new Set((pays || []).map(p => p.invoice_id).filter(Boolean))]
    if (pays?.length) {
      await sb.from('plaid_transactions').update({ matched_payment_id: null }).eq('id', txn.id).eq('company_id', companyId)
      const { error } = await sb.from('payments').delete().in('id', pays.map(p => p.id))
      if (error) throw error
      did.push(`removed ${pays.length} payment row${pays.length === 1 ? '' : 's'}`)
    }
    for (const invId of invoiceIds) {
      const { data: inv } = await sb.from('invoices').select('id, amount, discount_applied, tax_amount').eq('id', invId).maybeSingle()
      if (!inv) continue
      const { data: rest } = await sb.from('payments').select('amount, status').eq('invoice_id', invId)
      const paid = (rest || []).filter(p => !['Refunded', 'Voided'].includes(String(p.status || ''))).reduce((s, p) => s + num(p.amount), 0)
      const total = customerTotal(inv)
      await sb.from('invoices').update({ payment_status: paid >= total - 0.01 ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Pending', updated_at: new Date().toISOString() }).eq('id', invId)
    }
    // Incentive claims this bank row settled.
    const { data: claims } = await sb.from('utility_invoices').select('*').eq('company_id', companyId).eq('source_transaction_id', txn.id)
    for (const row of claims || []) {
      const { data: inv } = row.invoice_id ? await sb.from('invoices').select('*').eq('id', row.invoice_id).maybeSingle() : { data: null }
      const patch = buildReopenPatch(row, inv)
      if (patch.rowPatch) await sb.from('utility_invoices').update({ ...patch.rowPatch, source_transaction_id: null }).eq('id', row.id)
      if (patch.invoicePatch && inv) await sb.from('invoices').update(patch.invoicePatch).eq('id', inv.id)
      did.push(`reopened ${row.utility_name || 'utility'} claim #${row.id}`)
    }
    // Loan payment this bank row booked.
    const { data: lps } = await sb.from('loan_payments').select('id, liability_id, principal').eq('company_id', companyId).eq('plaid_transaction_id', txn.id)
    for (const p of lps || []) {
      // Read the loan first: schema:check pairs a select with the nearest
      // from() above it, and an update() in between confuses it.
      const { data: loan } = await sb.from('liabilities').select('id, source, current_balance').eq('id', p.liability_id).maybeSingle()
      await sb.from('plaid_transactions').update({ loan_payment_id: null }).eq('id', txn.id).eq('company_id', companyId)
      await sb.from('loan_payments').delete().eq('id', p.id)
      if (loan && loan.source !== 'plaid') await sb.from('liabilities').update({ current_balance: num(loan.current_balance) + num(p.principal), updated_at: new Date().toISOString() }).eq('id', loan.id)
      did.push('removed the loan payment')
    }
    // The bank row itself.
    const { error } = await sb.from('plaid_transactions').update({ confirmed: false, is_transfer: false, user_category: null, user_tax_category: null, matched_invoice_id: null, matched_payment_id: null, matched_utility_invoice_id: null, matched_at: null, loan_payment_id: null }).eq('id', txn.id).eq('company_id', companyId)
    if (error) throw error
    did.push('bank row back to unconfirmed')
    await sb.from('books_verdicts').update({ status: 'proposed', reviewed_by: userEmail || null, reviewed_at: new Date().toISOString(), applied: null, applied_at: null, updated_at: new Date().toISOString() }).eq('plaid_transaction_id', txn.id).eq('company_id', companyId)
    return { ok: true, did }
  } catch (e) {
    return { error: e?.message || String(e), did }
  }
}

export const AUTOBOOK_DEFAULTS = { enabled: false, min_confidence: 0.95, max_amount: 5000 }
export function parseAutobook(value) {
  try { const v = typeof value === 'string' ? JSON.parse(value) : value; return { ...AUTOBOOK_DEFAULTS, ...(v || {}) } } catch { return { ...AUTOBOOK_DEFAULTS } }
}

export async function dismissVerdict(sb, { companyId, txnId, userEmail = null }) {
  const { error } = await sb.from('books_verdicts').update({ status: 'dismissed', reviewed_by: userEmail || null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('plaid_transaction_id', txnId).eq('company_id', companyId)
  return error ? { error: error.message } : { ok: true }
}

const fmt = (n) => '$' + Math.abs(num(n)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
