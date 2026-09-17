// Customer deposits the business is still holding: money taken up front
// that has not yet been applied to a final invoice. Until it is, it is a
// liability (the customer could still walk), not revenue.
//
// Deposit money lives in two places:
//   • payments rows flagged is_deposit — usually linked to a deposit-type
//     invoice; the balance invoice later points back at that invoice via
//     parent_invoice_id, which is the moment the deposit is "applied"
//   • lead_payments — money at lead/estimate stage; applied once it carries
//     an invoice_id, or its job has a non-deposit invoice

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100

export function depositsHeld({ payments = [], leadPayments = [], invoices = [] } = {}) {
  const invById = new Map((invoices || []).map(i => [i.id, i]))
  const childrenOf = new Set((invoices || []).map(i => i.parent_invoice_id).filter(Boolean))
  const jobsWithFinalInvoice = new Set((invoices || []).filter(i => i.job_id && i.invoice_type !== 'deposit').map(i => i.job_id))
  const rows = []
  for (const p of payments || []) {
    if (!p.is_deposit) continue
    const st = p.status || 'Completed'
    if (st === 'Refunded' || st === 'Voided') continue
    const amt = num(p.amount)
    if (!(amt > 0)) continue
    const inv = p.invoice_id ? invById.get(p.invoice_id) : null
    let applied = false
    if (inv) applied = inv.invoice_type === 'deposit' ? childrenOf.has(inv.id) : true
    else if (p.job_id) applied = jobsWithFinalInvoice.has(p.job_id)
    if (applied) continue
    rows.push({ source: 'payment', id: p.id, amount: amt, date: p.date, customer_id: p.customer_id || null, job_id: p.job_id || null, label: inv?.invoice_id || (p.job_id ? `Job ${p.job_id}` : 'Deposit') })
  }
  for (const d of leadPayments || []) {
    const amt = num(d.amount)
    if (!(amt > 0) || d.invoice_id) continue
    if (d.job_id && jobsWithFinalInvoice.has(d.job_id)) continue
    rows.push({ source: 'lead_payment', id: d.id, amount: amt, date: d.date_created || d.created_at, customer_id: null, job_id: d.job_id || null, label: d.lead_customer_name || 'Lead deposit' })
  }
  rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return { rows, total: r2(rows.reduce((s, r) => s + r.amount, 0)), count: rows.length }
}
