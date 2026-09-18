// What a payroll run costs, and who the money goes to.
//
// The Payroll page had every employee's tax worked out and never added it
// up. The header said "Total Payroll $8,192" and the totals row said net
// was the same $8,192 — gross, twice — while each check stub quietly said
// take-home was $553 less and the company owed $218 on top. Bryce: "where
// is the tax?" This is the one place that answers it.
//
// The buckets are the ones aggregateTaxLiabilities writes to the Payroll
// Inbox after a run, so the numbers seen BEFORE pressing the button are the
// deposits owed AFTER it:
//
//   checks      what the employees are paid (tax-aware net; contractors at
//               gross, nothing is withheld from them)
//   federal     one EFTPS deposit — income tax withheld + Social Security
//               and Medicare, both halves
//   state       state income tax withheld
//   quarterly   FUTA + state unemployment. Employer-only, due by quarter,
//               not per run — shown on its own line so it is not mistaken
//               for a check written today
//   deductions  post-tax deductions held back from checks (advances,
//               garnishments). Not a tax, but it is money that came out of
//               gross and went somewhere, so the total only ties with it
//
//   totalCost = checks + federal + state + quarterly + deductions
//             = gross (with additions) + employer taxes
//
// Pure. Takes the per-employee pay data the page already builds.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export function summarizePayrollRun(employeePayData = {}) {
  const out = {
    employees: 0,
    gross: 0,          // hours + salary + queued commissions + queued bonuses
    additions: 0,      // payroll adjustment additions (taxed with gross)
    deductions: 0,     // post-tax deductions held from checks
    checks: 0,
    withheld: 0,       // employee-side tax only
    federal: 0,
    state: 0,
    quarterly: 0,
    employerTaxes: 0,  // SS + Medicare employer halves + FUTA + SUI
    totalCost: 0,
  }
  for (const d of Object.values(employeePayData || {})) {
    if (!d) continue
    out.employees += 1
    const gross = Number(d.grossPay) || 0
    const additions = Number(d.totalAdditions) || 0
    const deductions = Number(d.totalDeductions) || 0
    out.gross += gross
    out.additions += additions
    out.deductions += deductions
    const t = d.tax
    if (t) {
      const fit = Number(t.federalIncomeTax) || 0
      const sit = Number(t.stateIncomeTax) || 0
      const ssEE = Number(t.socialSecurityEmployee) || 0
      const ssER = Number(t.socialSecurityEmployer) || 0
      const medEE = Number(t.medicareEmployee) || 0
      const medER = Number(t.medicareEmployer) || 0
      const addMed = Number(t.additionalMedicare) || 0
      const futa = Number(t.futa) || 0
      const sui = Number(t.sui) || 0
      out.checks += Number.isFinite(Number(t.netPay)) ? Number(t.netPay) : Number(d.netPay) || 0
      out.withheld += fit + sit + ssEE + medEE + addMed
      out.federal += fit + ssEE + ssER + medEE + medER + addMed
      out.state += sit
      out.quarterly += futa + sui
      out.employerTaxes += ssER + medER + futa + sui
    } else {
      // 1099 — nothing withheld, nothing matched. The check is the gross.
      out.checks += Number(d.netPay) || 0
    }
  }
  out.totalCost = out.gross + out.additions + out.employerTaxes
  for (const k of Object.keys(out)) if (k !== 'employees') out[k] = r2(out[k])
  return out
}
