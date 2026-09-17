// Who needs a 1099-NEC this year, and for how much.
//
// Contractors are employees with tax_classification '1099' (paid through
// payroll as paystubs, and sometimes straight from Books as a manual expense
// with payee_employee_id), and vendors flagged is_1099 (paid through bills
// and their bill_payments, or as a manual expense with payee_vendor_id).
// The IRS threshold is $600 for the year.

export const NEC_THRESHOLD = 600
const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100

export function contractorTotals({ employees = [], paystubs = [], manualExpenses = [], vendors = [], bills = [], billPayments = [] } = {}, year) {
  const inYear = (d) => String(d || '').startsWith(`${year}-`)
  const rows = new Map()
  const bump = (key, seed, amount, source) => {
    if (!(amount > 0)) return
    const cur = rows.get(key) || { ...seed, total: 0, sources: {} }
    cur.total += amount
    cur.sources[source] = (cur.sources[source] || 0) + amount
    rows.set(key, cur)
  }

  const contractorEmp = new Map((employees || []).filter(e => /1099|contractor/i.test(e.tax_classification || '')).map(e => [e.id, e]))
  for (const s of paystubs || []) {
    const e = contractorEmp.get(s.employee_id)
    if (!e || !inYear(s.pay_date)) continue
    bump(`emp:${e.id}`, { kind: 'contractor', id: e.id, name: e.w9_legal_name || e.name, w9: !!(e.w9_signed_at || e.w9_legal_name) }, num(s.gross_pay), 'payroll')
  }
  for (const x of manualExpenses || []) {
    if (!inYear(x.expense_date)) continue
    if (x.payee_employee_id && contractorEmp.has(x.payee_employee_id)) {
      const e = contractorEmp.get(x.payee_employee_id)
      bump(`emp:${e.id}`, { kind: 'contractor', id: e.id, name: e.w9_legal_name || e.name, w9: !!(e.w9_signed_at || e.w9_legal_name) }, num(x.amount), 'expenses')
    }
  }
  const vendor1099 = new Map((vendors || []).filter(v => v.is_1099).map(v => [v.id, v]))
  const billVendor = new Map((bills || []).map(b => [b.id, b.vendor_id]))
  for (const p of billPayments || []) {
    const vid = billVendor.get(p.bill_id)
    const v = vid ? vendor1099.get(vid) : null
    if (!v || !inYear(p.paid_at)) continue
    bump(`vendor:${v.id}`, { kind: 'vendor', id: v.id, name: v.business_name || v.name, w9: !!v.w9_signed_at, tin_last4: v.tin_last4 || null }, num(p.amount), 'bills')
  }
  for (const x of manualExpenses || []) {
    if (!inYear(x.expense_date) || !x.payee_vendor_id) continue
    const v = vendor1099.get(x.payee_vendor_id)
    if (!v) continue
    bump(`vendor:${v.id}`, { kind: 'vendor', id: v.id, name: v.business_name || v.name, w9: !!v.w9_signed_at, tin_last4: v.tin_last4 || null }, num(x.amount), 'expenses')
  }

  const list = [...rows.values()].map(r => ({ ...r, total: r2(r.total), needs1099: r.total >= NEC_THRESHOLD })).sort((a, b) => b.total - a.total)
  return {
    rows: list,
    needing: list.filter(r => r.needs1099),
    missingW9: list.filter(r => r.needs1099 && !r.w9),
    total: r2(list.reduce((s, r) => s + r.total, 0)),
  }
}
