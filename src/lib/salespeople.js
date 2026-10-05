// Who can be picked as the salesperson on a job.
//
// The picker offered every employee, so the person entering the work picked
// themselves out of habit: HHH's project manager ended up credited with 5,961
// of 7,150 jobs, which read as sales on every by-rep number and, until the
// job-size floor, paid him commission on $40 window cleans. The field decides
// sales credit and commission and nothing else, so the list should be the
// people who can actually earn one.
//
// A salesperson here is someone set up to earn commission ON A JOB:
// is_commission, with a goods or services rate above zero. Not the setter fee
// (that is paid per appointment, from lead_commissions) and not the utility
// processor rate (paid per utility invoice) — neither of those is a reason to
// own a job's revenue.
//
// Whoever is already on the job is always in the list, even if they no longer
// qualify. A dropdown that silently drops the current value is how a saved
// record loses its owner the next time anybody touches the form.

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }

/** Is this employee set up to earn commission on a job? */
export function earnsJobCommission(employee) {
  if (!employee?.is_commission) return false
  return num(employee.commission_goods_rate) > 0 || num(employee.commission_services_rate) > 0
}

/**
 * The options for a job's salesperson picker.
 * @param employees  every employee on the company
 * @param currentId  what the job already has (kept in the list whatever it is)
 * @returns [{ value, label }] — the qualifying people, plus the current one,
 *          by name. Labelled "(no longer on commission)" when they only
 *          survived because the job already names them, so nobody wonders why
 *          a name is there.
 */
export function salespersonOptions(employees = [], currentId = null, showEveryone = false) {
  const cur = currentId == null || currentId === '' ? null : String(currentId)
  // A company where nobody is set up to earn commission on a job does not
  // want a narrowed list — it wants a list. Without this the picker reads
  // "No matches found" on every tenant that pays no commission at all, which
  // is most of them before they configure one (caught on the demo tenant).
  const anyEarner = (employees || []).some(earnsJobCommission)
  const everyone = showEveryone || !anyEarner
  const out = []
  for (const e of employees || []) {
    if (!e?.id) continue
    const isCurrent = cur !== null && String(e.id) === cur
    const earns = earnsJobCommission(e)
    if (!everyone && !earns && !isCurrent) continue
    out.push({
      value: e.id,
      label: !earns && isCurrent && !everyone ? `${e.name} (no longer on commission)` : e.name,
    })
  }
  return out.sort((a, b) => String(a.label).localeCompare(String(b.label)))
}

/**
 * Is anybody hidden by the narrow list? Drives the "show everyone" link —
 * there is no point offering it when the two lists are the same.
 *
 * HHH has people credited with sales who earn nothing on them (London on 60
 * jobs, Cameron on 161). They should still be pickable; they should just not
 * be the first thing an office hand clicks by accident.
 */
export function hasHiddenSalespeople(employees = [], currentId = null) {
  return salespersonOptions(employees, currentId, true).length
    > salespersonOptions(employees, currentId, false).length
}
