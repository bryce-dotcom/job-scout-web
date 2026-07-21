// Rep (%) commission ledger — read/sync helpers for the frozen rep_commissions
// table (P2). The amount of a rep's services/goods commission is snapshotted
// per payment when earned and never recomputed, so Payroll and My Pay stop
// drifting. Utility/processor commissions stay on the live calc (they're
// anchored to a utility invoice's paid_at and aren't payment-driven).
//
// Cutover shape (both Payroll and My Pay):
//   invoiceAvailable = liveCalc.available
//                    − (live invoice_commission available)   // remove the drifty live part
//                    + earnedRepInPeriod(frozenRows, …)       // add the frozen part
// Since the frozen part equals the live invoice part today (verified to $0.03),
// the number is unchanged now but frozen going forward.

// Pure: the frozen rows that SHOULD exist for the given data. One row per
// (rep, payment) on an owned invoice, plus a synthetic row per Paid invoice
// with no payment (mirrors the bonusCalc fallback). Mirrors the backfill so
// the math never diverges. `onlyEmployeeId` scopes it (My Pay).
export function computeRepRows({ employees = [], jobs = [], leads = [], invoices = [], payments = [], utilityInvoices = [], payrollConfig = {} }, onlyEmployeeId = null) {
  const leadsById = new Map((leads || []).map(l => [String(l.id), l]))
  const matchId = (a, b) => a != null && b != null && String(a) === String(b)
  const ownsJob = (job, empId) => {
    if (matchId(job.salesperson_id, empId)) return true
    if (job.lead_id) {
      const lead = leadsById.get(String(job.lead_id))
      if (!lead) return false
      if (matchId(lead.salesperson_id, empId)) return true
      if (Array.isArray(lead.salesperson_ids) && lead.salesperson_ids.map(String).includes(String(empId))) return true
    }
    return false
  }
  const paysByInv = new Map()
  for (const p of payments) { if (!p.invoice_id) continue; if (!paysByInv.has(p.invoice_id)) paysByInv.set(p.invoice_id, []); paysByInv.get(p.invoice_id).push(p) }

  const reps = (employees || []).filter(e => e.is_commission && (onlyEmployeeId == null || e.id === onlyEmployeeId))
  const rows = []
  for (const e of reps) {
    const svc = parseFloat(e.commission_services_rate) || 0
    const goods = parseFloat(e.commission_goods_rate) || 0
    const rate = svc > 0 ? svc : goods
    const rateType = svc > 0 ? (e.commission_services_type || 'percent') : (e.commission_goods_type || 'percent')
    const kind = svc > 0 ? 'services' : 'goods'
    if (rate <= 0 || rateType !== 'percent') continue   // flat/processor handled by the live calc, not the ledger
    const empJobIds = new Set((jobs || []).filter(j => ownsJob(j, e.id)).map(j => j.id))
    const empInvoices = (invoices || []).filter(inv => empJobIds.has(inv.job_id) && (parseFloat(inv.amount) || 0) > 0)
    for (const inv of empInvoices) {
      const invPays = paysByInv.get(inv.id) || []
      for (const p of invPays) {
        const amt = (parseFloat(p.amount) || 0) * (rate / 100)
        if (amt <= 0) continue
        rows.push({
          company_id: e.company_id, employee_id: e.id, invoice_id: inv.id, job_id: inv.job_id, payment_id: p.id,
          kind, amount: Math.round(amt * 100) / 100, rate, rate_type: 'percent', basis_amount: parseFloat(p.amount) || 0,
          earned_at: p.date ? new Date(p.date + 'T12:00:00Z').toISOString() : null,
          payment_status: 'earned', source: 'live',
        })
      }
      if (inv.payment_status === 'Paid' && invPays.length === 0) {
        const amt = (parseFloat(inv.amount) || 0) * (rate / 100)
        if (amt > 0) rows.push({
          company_id: e.company_id, employee_id: e.id, invoice_id: inv.id, job_id: inv.job_id, payment_id: null,
          kind, amount: Math.round(amt * 100) / 100, rate, rate_type: 'percent', basis_amount: parseFloat(inv.amount) || 0,
          earned_at: inv.updated_at || inv.created_at || null,
          payment_status: 'earned', source: 'live_synthetic',
        })
      }
    }
  }

  // ── Utility + processor commissions — frozen when the utility invoice is
  //    PAID (earned_at = paid_at), keyed by the utility invoice. Mirrors the
  //    utility_commission / processor_commission branches of the live calc.
  const procDefault = payrollConfig?.utility_processor_employee_id != null ? Number(payrollConfig.utility_processor_employee_id) : null
  for (const u of (utilityInvoices || [])) {
    if (u.payment_status !== 'Paid') continue
    const incentive = parseFloat(u.incentive_amount) || parseFloat(u.amount) || 0
    if (incentive <= 0) continue
    const job = (jobs || []).find(j => j.id === u.job_id)
    // utility_commission: the rep who owns the job earns their services/goods rate.
    for (const e of reps) {
      const svc = parseFloat(e.commission_services_rate) || 0
      const goods = parseFloat(e.commission_goods_rate) || 0
      const rate = svc > 0 ? svc : goods
      const rateType = svc > 0 ? (e.commission_services_type || 'percent') : (e.commission_goods_type || 'percent')
      if (rate <= 0 || rateType !== 'percent') continue
      if (!job || !ownsJob(job, e.id)) continue
      const amt = incentive * (rate / 100)
      if (amt <= 0) continue
      rows.push({
        company_id: e.company_id, employee_id: e.id, invoice_id: null, job_id: u.job_id, payment_id: null, utility_invoice_id: u.id,
        kind: 'utility', amount: Math.round(amt * 100) / 100, rate, rate_type: 'percent', basis_amount: incentive,
        earned_at: u.paid_at || null, payment_status: 'earned', source: 'live_utility',
      })
    }
    // processor_commission: the designated processor earns their processor rate.
    const processorId = u.processor_id != null ? Number(u.processor_id) : procDefault
    if (processorId != null && (onlyEmployeeId == null || processorId === onlyEmployeeId)) {
      const pe = (employees || []).find(e => e.id === processorId)
      const procRate = parseFloat(pe?.commission_processor_rate) || 0
      const procType = pe?.commission_processor_type || 'percent'
      if (pe && procRate > 0 && procType === 'percent') {
        const amt = incentive * (procRate / 100)
        if (amt > 0) rows.push({
          company_id: pe.company_id, employee_id: pe.id, invoice_id: null, job_id: u.job_id, payment_id: null, utility_invoice_id: u.id,
          kind: 'processor', amount: Math.round(amt * 100) / 100, rate: procRate, rate_type: 'percent', basis_amount: incentive,
          earned_at: u.paid_at || null, payment_status: 'earned', source: 'live_processor',
        })
      }
    }
  }
  return rows
}

// Insert-only sync (freeze): create any missing frozen rows for new payments;
// NEVER touch existing rows. Idempotent. Payroll and My Pay call this on load
// so the ledger keeps up with new payments without a cron or per-callsite hook.
export async function syncRepCommissions(supabase, companyId, data, onlyEmployeeId = null) {
  try {
    const expected = computeRepRows(data, onlyEmployeeId).map(r => ({ ...r, company_id: companyId }))
    // RECONCILE (freeze-on-PAY, like the bonus ledger): an UNPAID row follows
    // current reality — insert what's newly earned, delete what's no longer
    // earned (a job reassigned to another rep; a payment landing on an invoice
    // that used to be synthetic; a payment/invoice deleted). PAID rows are
    // frozen and never touched. This is what keeps Payroll and My Pay correct
    // without freezing a stale attribution. (Insert-only would double-count.)
    let q = supabase.from('rep_commissions').select('id, payment_id, invoice_id, utility_invoice_id, employee_id, kind, payment_status').eq('company_id', companyId)
    if (onlyEmployeeId != null) q = q.eq('employee_id', onlyEmployeeId)
    const { data: existing, error } = await q
    if (error) { console.warn('[syncRepCommissions] read failed:', error.message); return { inserted: 0, deleted: 0 } }
    // Key: payment-backed by payment_id; utility/processor by utility invoice;
    // synthetic (null payment) by standard invoice.
    const keyOf = (r) => r.payment_id != null ? `p:${r.payment_id}:${r.employee_id}:${r.kind}`
      : r.utility_invoice_id != null ? `u:${r.utility_invoice_id}:${r.employee_id}:${r.kind}`
      : `i:${r.invoice_id}:${r.employee_id}:${r.kind}`
    const expectedKeys = new Set(expected.map(keyOf))
    const existingKeys = new Set((existing || []).map(keyOf))
    const missing = expected.filter(r => !existingKeys.has(keyOf(r)))
    const stale = (existing || []).filter(r => r.payment_status !== 'paid' && !expectedKeys.has(keyOf(r)))
    let inserted = 0, deleted = 0
    if (stale.length) {
      const { error: delErr } = await supabase.from('rep_commissions').delete().in('id', stale.map(r => r.id))
      if (delErr) console.warn('[syncRepCommissions] stale delete failed:', delErr.message); else deleted = stale.length
    }
    if (missing.length) {
      const { error: insErr } = await supabase.from('rep_commissions').insert(missing)
      if (insErr) console.warn('[syncRepCommissions] insert failed:', insErr.message); else inserted = missing.length
    }
    return { inserted, deleted }
  } catch (e) {
    console.warn('[syncRepCommissions] crashed:', e?.message || e)
    return { inserted: 0, deleted: 0 }
  }
}

export async function fetchRepCommissions(supabase, companyId, employeeId = null) {
  let q = supabase.from('rep_commissions').select('id, employee_id, invoice_id, job_id, payment_id, kind, amount, earned_at, payment_status, paid_at, queued_for_payroll').eq('company_id', companyId)
  if (employeeId != null) q = q.eq('employee_id', employeeId)
  const { data, error } = await q
  if (error) { console.warn('[fetchRepCommissions] failed:', error.message); return [] }
  return data || []
}

// Sum of an employee's EARNED (unpaid) frozen rows whose earned_at falls in the
// period. This is the frozen replacement for the live invoice_commission
// available. Pass date strings (YYYY-MM-DD); null period = all-time.
export function earnedRepInPeriod(rows, employeeId, periodStartStr = null, periodEndStr = null) {
  return (rows || [])
    .filter(r => r.employee_id === employeeId && r.payment_status !== 'paid' && r.payment_status !== 'void')
    .filter(r => {
      if (!periodStartStr || !periodEndStr) return true
      const d = (r.earned_at || '').slice(0, 10)
      return d && d >= periodStartStr && d <= periodEndStr
    })
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)
}

// The live invoice_commission 'available' portion to REMOVE when swapping in the
// ledger. Everything else in liveCalc.available (utility/processor) is kept.
export function liveInvoiceAvailable(liveCalcResult) {
  return (liveCalcResult?.details || [])
    .filter(d => d.type === 'invoice_commission' && d.status === 'available')
    .reduce((s, d) => s + (Number(d.amount) || 0), 0)
}
