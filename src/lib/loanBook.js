// Book one payment on a loan — the ONE writer (LoansCard's Book button and
// Frankie's accepted verdicts both call this). Everything a payment touches
// is written here in order, so a failure leaves nothing half-booked:
//   1. loan_payments row (verified when a bank row is tied)
//   2. the bank row: loan_payment_id, category "Loan Payment", confirmed
//   3. the loan: balance down by the principal (hand-entered loans only —
//      a Plaid loan gets its balance from the lender), last/next payment dates
import { splitPayment } from './loanMatch.js'
import { localDateStr } from './localDate.js'

const addMonth = (dayStr) => { const d = new Date(String(dayStr).slice(0, 10) + 'T00:00:00'); return localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())) }

/**
 * @param {object} sb supabase client
 * @param {{ companyId:number, loan:object, txn?:object|null, amount?:number, date?:string, userEmail?:string|null, note?:string }} input
 * @returns {Promise<{ ok?:true, payment?:object, split?:{principal:number, interest:number}, error?:string }>}
 */
export async function bookLoanPayment(sb, { companyId, loan, txn = null, amount, date, userEmail = null, note = null }) {
  const amt = txn ? Math.abs(parseFloat(txn.amount) || 0) : parseFloat(amount) || 0
  if (!(amt > 0)) return { error: 'Amount must be more than zero' }
  const when = txn ? String(txn.date).slice(0, 10) : String(date || localDateStr(new Date())).slice(0, 10)
  const split = splitPayment(loan, amt)
  const { data: row, error } = await sb.from('loan_payments').insert([{
    company_id: companyId, liability_id: loan.id, date: when, amount: amt, principal: split.principal, interest: split.interest,
    plaid_transaction_id: txn ? txn.id : null, source: txn ? 'bank_match' : 'manual',
    verified_at: txn ? new Date().toISOString() : null, verified_by: txn ? (userEmail || null) : null, notes: note,
  }]).select().single()
  if (error) return { error: error.message }
  if (txn) {
    const { error: e2 } = await sb.from('plaid_transactions').update({ loan_payment_id: row.id, user_category: 'Loan Payment', user_tax_category: 'Not deductible', is_transfer: false, confirmed: true }).eq('id', txn.id).eq('company_id', companyId)
    if (e2) return { error: e2.message }
  }
  const patch = { last_payment_date: when, last_payment_amount: amt, updated_at: new Date().toISOString() }
  if (loan.source !== 'plaid') {
    patch.current_balance = Math.max(0, (parseFloat(loan.current_balance) || 0) - split.principal)
    if (loan.next_payment_due && loan.next_payment_due <= when) patch.next_payment_due = addMonth(loan.next_payment_due)
  }
  const { error: e3 } = await sb.from('liabilities').update(patch).eq('id', loan.id).eq('company_id', companyId)
  if (e3) return { error: e3.message }
  return { ok: true, payment: row, split }
}
