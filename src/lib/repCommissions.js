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
export function computeRepRows({ employees = [], jobs = [], leads = [], invoices = [], payments = [] }, onlyEmployeeId = null) {
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
  return rows
}

// Insert-only sync (freeze): create any missing frozen rows for new payments;
// NEVER touch existing rows. Idempotent. Payroll and My Pay call this on load
// so the ledger keeps up with new payments without a cron or per-callsite hook.
export async function syncRepCommissions(supabase, companyId, data, onlyEmployeeId = null) {
  try {
    const expected = computeRepRows(data, onlyEmployeeId).map(r => ({ ...r, company_id: companyId }))
    if (!expected.length) return { inserted: 0 }
    let q = supabase.from('rep_commissions').select('payment_id, invoice_id, employee_id, kind').eq('company_id', companyId)
    if (onlyEmployeeId != null) q = q.eq('employee_id', onlyEmployeeId)
    const { data: existing, error } = await q
    if (error) { console.warn('[syncRepCommissions] read failed:', error.message); return { inserted: 0 } }
    // Key: payment-backed rows by payment_id; synthetic rows (null payment) by invoice_id.
    const seen = new Set((existing || []).map(r => r.payment_id != null
      ? `p:${r.payment_id}:${r.employee_id}:${r.kind}`
      : `i:${r.invoice_id}:${r.employee_id}:${r.kind}`))
    const missing = expected.filter(r => !seen.has(r.payment_id != null
      ? `p:${r.payment_id}:${r.employee_id}:${r.kind}`
      : `i:${r.invoice_id}:${r.employee_id}:${r.kind}`))
    if (!missing.length) return { inserted: 0 }
    const { error: insErr } = await supabase.from('rep_commissions').insert(missing)
    if (insErr) { console.warn('[syncRepCommissions] insert failed:', insErr.message); return { inserted: 0 } }
    return { inserted: missing.length }
  } catch (e) {
    console.warn('[syncRepCommissions] crashed:', e?.message || e)
    return { inserted: 0 }
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
