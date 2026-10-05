// The setup a payroll run needs, checked before the button, not after.
//
// Bryce, 2026-10-05: "the goal is to get payroll right for everyone, all
// tenants." HHH's first run went out with no federal deposit schedule (so
// the Inbox said October 15 for a deposit due September 23), the wrong
// unemployment rate, and three W-2 employees with no W-4. Every one of those
// was a warning somewhere that nobody had to read. This turns them into a
// gate: Run Payroll lists what is missing and will not process until the
// list is empty.
//
// Pure. The page passes the company row, the payroll config and the
// employees; this returns the problems, each pointing at where to fix it.

// States with no wage withholding: a withholding account cannot exist there.
const NO_INCOME_TAX_STATES = new Set(['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'])

const blank = (v) => v == null || String(v).trim() === ''

/**
 * @returns {Array<{ key, label, detail, fix: 'company'|'tax'|'payroll'|'employee', employeeId?, employeeName?, ackable? }>}
 *   fix: where it is fixed. company = Settings, Company tab; tax = Settings,
 *   Payroll Tax tab; payroll = Payroll, Settings; employee = their card.
 */
export function payrollSetupProblems({ company = {}, payrollConfig = {}, employees = [], w4Acknowledged = {} } = {}) {
  const out = []
  const c = company || {}
  const state = String(c.state_employer_id_state || c.state || '').toUpperCase()

  if (blank(c.ein)) out.push({ key: 'ein', label: 'Federal EIN', detail: 'Every deposit and every form carries it.', fix: 'tax' })
  if (blank(c.legal_name) && blank(c.company_name)) out.push({ key: 'legal_name', label: 'Legal business name', detail: 'As registered with the IRS; it prints on W-2s and the 941.', fix: 'company' })
  if (blank(c.entity_type)) out.push({ key: 'entity_type', label: 'Business entity type', detail: 'LLC, S-Corp, sole proprietor: it decides which forms apply.', fix: 'company' })
  if (blank(state)) out.push({ key: 'state', label: 'Work state', detail: 'Which state\'s withholding and unemployment rules apply.', fix: 'tax' })
  if (blank(c.federal_deposit_schedule)) out.push({ key: 'federal_deposit_schedule', label: 'Federal deposit schedule', detail: 'Monthly or semiweekly, from the IRS lookback. Without it the Inbox guesses monthly and a semiweekly deposit is late.', fix: 'tax' })
  if (state && !NO_INCOME_TAX_STATES.has(state) && blank(c.state_employer_id)) out.push({ key: 'state_employer_id', label: `${state} withholding account number`, detail: 'The account state income tax is deposited to.', fix: 'tax' })
  if (blank(c.sui_account_number)) out.push({ key: 'sui_account_number', label: 'State unemployment account number', detail: 'Assigned by the state workforce agency when you registered.', fix: 'tax' })
  if (c.sui_rate_pct == null || Number(c.sui_rate_pct) <= 0) out.push({ key: 'sui_rate_pct', label: 'State unemployment rate', detail: 'On the rate notice the state mails each year. It changes; enter the current one.', fix: 'tax' })
  if (blank(payrollConfig?.pay_frequency)) out.push({ key: 'pay_frequency', label: 'Pay frequency', detail: 'Weekly, bi-weekly, semi-monthly or monthly. Withholding tables depend on it.', fix: 'payroll' })

  for (const e of employees || []) {
    if (!e || e.active === false) continue
    const name = e.name || `Employee ${e.id}`
    if (e.tax_classification === '1099') continue
    const paid = e.is_hourly || e.is_salary
    if (!paid) out.push({ key: `pay_type:${e.id}`, label: `${name}: no pay type`, detail: 'Not hourly and not salary, so hours are counted and nothing is paid.', fix: 'employee', employeeId: e.id, employeeName: name })
    else if (e.is_hourly && !(Number(e.hourly_rate) > 0)) out.push({ key: `rate:${e.id}`, label: `${name}: hourly with no rate`, detail: 'Hourly pay at $0.', fix: 'employee', employeeId: e.id, employeeName: name })
    else if (e.is_salary && !(Number(e.annual_salary) > 0)) out.push({ key: `salary:${e.id}`, label: `${name}: salary with no amount`, detail: 'Salary at $0.', fix: 'employee', employeeId: e.id, employeeName: name })
    // No W-4. The form is the EMPLOYEE's to fill in — their filing status,
    // their dependents, their second job — and the office guessing at it is
    // how somebody ends up under-withheld and owing in April. So the first
    // thing offered is to ask them for it, through the onboarding link that
    // already collects exactly this (employee-onboarding's finalize writes
    // w4_filing_status back).
    //
    // The IRS rule for a missing W-4 is to withhold as single with no
    // adjustments, which is allowed and keeps payroll runnable — but it stays
    // the SECOND option, and an acknowledgement someone made deliberately
    // rather than a default nobody noticed.
    if (blank(e.w4_filing_status) && !w4Acknowledged?.[e.id]) {
      out.push({
        key: `w4:${e.id}`,
        label: `${name}: no W-4 on file`,
        detail: 'The W-4 is theirs to fill in — send them the link and it lands on their card. Until then this payroll withholds as single with no adjustments.',
        fix: 'employee',
        employeeId: e.id,
        employeeName: name,
        ackable: true,
        askable: true,
      })
    }
  }
  return out
}

/** One line for the modal: "3 things to fix before this payroll can run." */
export function setupGateSummary(problems = []) {
  const n = problems.length
  if (!n) return ''
  return `${n} thing${n === 1 ? '' : 's'} to fix before this payroll can run`
}
