// Recurring deductions from the employee card, per paycheck.
//
// Bryce, 2026-10-12: Gusto took $7.50 off one person's every check all year;
// JobScout's run took nothing, because employee_benefits (the panel on the
// employee card) was never read by payroll. Only one-off adjustments were.
// This turns a card's active benefits into this period's deduction lines.
//
// Tax treatment, which is what the W-2 and the 941 care about:
//   Section 125 (health, dental, vision, HSA, FSA, pre-tax): off the top for
//     income tax AND Social Security / Medicare.
//   Retirement (traditional 401k, pre-tax): off the top for income tax only;
//     Social Security and Medicare are still on the full wage.
//   Post-tax (Roth, some life and disability, garnishments, "other"): off the
//     net, taxes already taken on it.
// Pure; no I/O.
import { PAY_FREQUENCY_PERIODS } from './payrollTax'

const SECTION_125 = new Set(['health', 'dental', 'vision', 'hsa', 'fsa'])
const RETIREMENT = new Set(['retirement_401k'])
const LABELS = { health: 'Health', dental: 'Dental', vision: 'Vision', life: 'Life insurance', disability: 'Disability', retirement_401k: '401(k)', hsa: 'HSA', fsa: 'FSA', other: 'Deduction' }
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** What one benefit row costs the employee this paycheck. */
export function perPaycheckAmount(row, payFrequency = 'bi-weekly') {
  const amt = Number(row?.employee_contribution) || 0
  if (amt <= 0) return 0
  const periods = PAY_FREQUENCY_PERIODS[payFrequency] || 26
  if (row.frequency === 'monthly') return r2(amt * 12 / periods)
  if (row.frequency === 'annual') return r2(amt / periods)
  return r2(amt)
}

/** Same, for the employer's share — a cost, not a deduction. */
export function employerPerPaycheck(row, payFrequency = 'bi-weekly') {
  const amt = Number(row?.employer_contribution) || 0
  if (amt <= 0) return 0
  const periods = PAY_FREQUENCY_PERIODS[payFrequency] || 26
  if (row.frequency === 'monthly') return r2(amt * 12 / periods)
  if (row.frequency === 'annual') return r2(amt / periods)
  return r2(amt)
}

/**
 * @param benefits  employee_benefits rows (any employee; filtered here)
 * @returns { section125, retirement, postTax, preTaxTotal, employerCost, lines: [{ label, amount, treatment }] }
 */
export function benefitDeductionsForPeriod(benefits = [], employeeId, payFrequency = 'bi-weekly') {
  const out = { section125: 0, retirement: 0, postTax: 0, preTaxTotal: 0, employerCost: 0, lines: [] }
  for (const b of benefits || []) {
    if (!b || b.employee_id !== employeeId || (b.status && b.status !== 'active')) continue
    const amount = perPaycheckAmount(b, payFrequency)
    const employer = employerPerPaycheck(b, payFrequency)
    out.employerCost = r2(out.employerCost + employer)
    if (amount <= 0) continue
    let treatment
    if (b.is_pre_tax && SECTION_125.has(b.benefit_type)) { out.section125 = r2(out.section125 + amount); treatment = 'pre-tax' }
    else if (b.is_pre_tax && RETIREMENT.has(b.benefit_type)) { out.retirement = r2(out.retirement + amount); treatment = 'pre-tax (income tax only)' }
    else if (b.is_pre_tax) { out.section125 = r2(out.section125 + amount); treatment = 'pre-tax' }
    else { out.postTax = r2(out.postTax + amount); treatment = 'after tax' }
    out.lines.push({ label: `${LABELS[b.benefit_type] || b.benefit_type}${b.plan_name ? ` · ${b.plan_name}` : ''}`, amount, treatment })
  }
  out.preTaxTotal = r2(out.section125 + out.retirement)
  return out
}
