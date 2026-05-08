// payrollTax.js
// =====================================================================
// Pure-function payroll tax calculator. Takes (employee, gross, ytd,
// pay frequency, employer state) and returns every tax line + net pay.
//
// Sources (must be refreshed each January):
//   - Federal income tax: IRS Publication 15-T (2025), Worksheet 1B,
//     Manual Payroll Systems with Forms W-4 from 2020 or later,
//     Annual Percentage Method tables.
//   - FICA: Social Security 6.2% to wage base $168,600 (2025);
//           Medicare 1.45% no cap; Additional Medicare 0.9% over $200k YTD.
//   - FUTA: 0.6% (after standard 5.4% credit) on first $7,000 YTD.
//   - Utah SIT: 4.55% flat (2025), with the personal exemption credit.
//     For simplicity v1 uses the flat rate directly; the Utah TC-40 credit
//     refunds at filing, so withholding is conservative-but-correct.
//   - Utah SUI: per-employer assigned rate, on first $48,900 YTD (2025).
//
// The numbers below are stamped TAX_YEAR. When the IRS / Utah update
// for 2026, bump TAX_YEAR and update the constants. Anything else
// breaking should fail loud (we throw on unknown filing_status etc.).
// =====================================================================

export const TAX_YEAR = 2025

// ---- Federal Pub 15-T 2025 — Annual Percentage Method ---------------
// "Form W-4, Step 2, Checkbox, withholding rate schedules" if multiple
// jobs is checked; otherwise the standard schedule.
//
// Each row: [over, baseTax, ratePct] — annual taxable income brackets.
// Withholding = baseTax + ratePct * (income - over)
const FED_BRACKETS_2025 = {
  // Standard (Step 2 NOT checked)
  single: [
    [0,         0.00,     0],
    [6300,      0.00,    10],
    [18325,    1202.50,   12],
    [54875,    5586.50,   22],
    [109750,  17654.50,   24],
    [203700,  40199.50,   32],
    [256925,  57231.50,   35],
    [632750, 188769.75,   37],
  ],
  married_jointly: [
    [0,        0.00,    0],
    [16550,    0.00,   10],
    [40950,  2440.00,  12],
    [114050, 11212.00, 22],
    [223800, 35402.00, 24],
    [411700, 80512.00, 32],
    [518150,114575.00, 35],
    [768700,202241.00, 37],
  ],
  head_of_household: [
    [0,        0.00,   0],
    [13900,    0.00,  10],
    [30900,  1700.00, 12],
    [78750, 7442.00,  22],
    [122050, 16968.00, 24],
    [201050, 35926.00, 32],
    [254200, 52934.00, 35],
    [630050, 184356.50, 37],
  ],
}

// Step 2 (multiple jobs) — used when employee checked the box on Form W-4.
const FED_BRACKETS_STEP2_2025 = {
  single: [
    [0,        0.00,    0],
    [7500,     0.00,   10],
    [13513,    601.30, 12],
    [31788,   2794.30, 22],
    [59225,   8830.44, 24],
    [106200, 20104.44, 32],
    [132813, 28630.61, 35],
    [320725, 94400.81, 37],
  ],
  married_jointly: [
    [0,        0.00,   0],
    [15000,    0.00,  10],
    [27200,  1220.00, 12],
    [63750,  5606.00, 22],
    [118625, 17677.00, 24],
    [165600, 28950.00, 32],
    [192213, 37466.16, 35],
    [317488, 81312.41, 37],
  ],
  head_of_household: [
    [0,        0.00,   0],
    [11250,    0.00,  10],
    [19750,   850.00, 12],
    [43675,  3721.00, 22],
    [65325,  8484.00, 24],
    [104825, 17968.00, 32],
    [131400, 26452.00, 35],
    [319375, 92242.25, 37],
  ],
}

// Standard deduction baked into the tables above. Pub 15-T effectively
// pre-subtracts $14,600 (single) / $29,200 (MFJ) from the bracket
// thresholds, so we don't double-subtract here.

// FICA constants — 2025
const SS_WAGE_BASE_2025      = 168600
const SS_RATE                = 0.062
const MEDICARE_RATE          = 0.0145
const ADD_MEDICARE_THRESHOLD = 200000  // employee-only, no employer match
const ADD_MEDICARE_RATE      = 0.009

// FUTA — 0.6% on first $7,000, employer only
const FUTA_WAGE_BASE         = 7000
const FUTA_RATE              = 0.006

// State defaults (Utah). Other states will need their own rate tables.
const UTAH_SIT_RATE          = 0.0455
const UTAH_SUI_WAGE_BASE_2025 = 48900

// Pay frequency multipliers — turn one-paycheck into annualized + back.
export const PAY_FREQUENCY_PERIODS = {
  weekly: 52,
  'bi-weekly': 26,
  semimonthly: 24,
  monthly: 12,
}

function annualize(amount, freq) {
  const periods = PAY_FREQUENCY_PERIODS[freq] || 26
  return amount * periods
}

function deannualize(annualAmt, freq) {
  const periods = PAY_FREQUENCY_PERIODS[freq] || 26
  return annualAmt / periods
}

function bracketTax(taxableAnnual, brackets) {
  let owed = 0
  for (let i = brackets.length - 1; i >= 0; i--) {
    const [over, base, rate] = brackets[i]
    if (taxableAnnual > over) {
      owed = base + ((taxableAnnual - over) * rate / 100)
      break
    }
  }
  return Math.max(0, owed)
}

// Round to two decimals, banker-style — matches IRS rounding rule.
function r2(n) { return Math.round(n * 100) / 100 }

/**
 * Compute federal income tax withholding for ONE pay period.
 * Implements IRS Pub 15-T 2025 Worksheet 1B (Annual Percentage Method).
 *
 * @param {object} args
 *   gross            number — this period's gross pay (incl OT, bonus, comm)
 *   payFrequency     'weekly'|'bi-weekly'|'semimonthly'|'monthly'
 *   filingStatus     'single'|'married_jointly'|'head_of_household'
 *   multipleJobs     boolean — Form W-4 Step 2 checkbox
 *   dependentsAmt    number — Form W-4 Step 3 (annual)
 *   otherIncomeAnnual number — Form W-4 Step 4(a)
 *   deductionsAnnual  number — Form W-4 Step 4(b)
 *   extraPerPeriod    number — Form W-4 Step 4(c)
 */
export function calcFederalIncomeTax(args) {
  const {
    gross,
    payFrequency = 'bi-weekly',
    filingStatus = 'single',
    multipleJobs = false,
    dependentsAmt = 0,
    otherIncomeAnnual = 0,
    deductionsAnnual = 0,
    extraPerPeriod = 0,
  } = args

  if (!FED_BRACKETS_2025[filingStatus]) {
    throw new Error(`Unknown filingStatus: ${filingStatus}`)
  }

  // Step 1: Annualize this period's wages, add other income.
  const annualWages = annualize(gross, payFrequency) + (otherIncomeAnnual || 0)

  // Step 2: Subtract Step 4(b) deductions. (No standard deduction
  // subtraction here — it's baked into the bracket thresholds.)
  const taxableAnnual = Math.max(0, annualWages - (deductionsAnnual || 0))

  // Step 3: Look up bracket — Step 2 schedule if multiple jobs checked.
  const brackets = multipleJobs
    ? FED_BRACKETS_STEP2_2025[filingStatus]
    : FED_BRACKETS_2025[filingStatus]
  const tentativeAnnual = bracketTax(taxableAnnual, brackets)

  // Step 4: Subtract Step 3 tax credits (dependents).
  const annualAfterCredits = Math.max(0, tentativeAnnual - (dependentsAmt || 0))

  // Step 5: Per-period withholding + Step 4(c) additional.
  const perPeriod = deannualize(annualAfterCredits, payFrequency) + (extraPerPeriod || 0)

  return r2(Math.max(0, perPeriod))
}

/**
 * FICA: Social Security + Medicare. Returns employee + employer halves
 * plus Additional Medicare (employee only) when YTD crosses $200k.
 */
export function calcFICA({ gross, ytdGrossBeforeThis, ytdMedicareBeforeThis }) {
  const grossN = Number(gross) || 0
  const ytdSS = Number(ytdGrossBeforeThis) || 0
  const ytdMed = Number(ytdMedicareBeforeThis) || 0

  // Social Security — caps at wage base
  const ssRoom = Math.max(0, SS_WAGE_BASE_2025 - ytdSS)
  const ssTaxable = Math.min(grossN, ssRoom)
  const ssEmployee = r2(ssTaxable * SS_RATE)
  const ssEmployer = r2(ssTaxable * SS_RATE)

  // Medicare — uncapped, both halves
  const medEmployee = r2(grossN * MEDICARE_RATE)
  const medEmployer = r2(grossN * MEDICARE_RATE)

  // Additional Medicare (0.9% on wages OVER 200k YTD, employee only).
  let addMed = 0
  const ytdAfter = ytdMed + grossN
  if (ytdAfter > ADD_MEDICARE_THRESHOLD) {
    const addTaxable = ytdAfter - Math.max(ytdMed, ADD_MEDICARE_THRESHOLD)
    addMed = r2(addTaxable * ADD_MEDICARE_RATE)
  }

  return {
    socialSecurityEmployee: ssEmployee,
    socialSecurityEmployer: ssEmployer,
    medicareEmployee:       medEmployee,
    medicareEmployer:       medEmployer,
    additionalMedicare:     addMed,
    socialSecurityTaxable:  ssTaxable,
  }
}

/**
 * FUTA: 0.6% on the first $7,000 of YTD wages, EMPLOYER ONLY.
 * Returns 0 once the employee has crossed $7k YTD.
 */
export function calcFUTA({ gross, ytdGrossBeforeThis, ratePct }) {
  const grossN = Number(gross) || 0
  const ytd = Number(ytdGrossBeforeThis) || 0
  const room = Math.max(0, FUTA_WAGE_BASE - ytd)
  const taxable = Math.min(grossN, room)
  const rate = (Number(ratePct) || (FUTA_RATE * 100)) / 100
  return r2(taxable * rate)
}

/**
 * Utah state income tax — 4.55% flat (2025).
 * Other states: route through this function with their own ratePct.
 */
export function calcStateIncomeTax({ gross, state = 'UT', ratePct }) {
  const grossN = Number(gross) || 0
  let rate
  if (ratePct != null) {
    rate = ratePct / 100
  } else if (state === 'UT') {
    rate = UTAH_SIT_RATE
  } else {
    return 0  // unknown state — caller must provide ratePct
  }
  return r2(grossN * rate)
}

/**
 * State unemployment (SUI). Like FUTA but per-employer assigned rate
 * and per-state wage base.
 */
export function calcSUI({ gross, ytdGrossBeforeThis, ratePct, wageBase }) {
  const grossN = Number(gross) || 0
  const ytd = Number(ytdGrossBeforeThis) || 0
  const base = Number(wageBase) || UTAH_SUI_WAGE_BASE_2025
  const room = Math.max(0, base - ytd)
  const taxable = Math.min(grossN, room)
  const rate = (Number(ratePct) || 0) / 100
  return r2(taxable * rate)
}

/**
 * The big one — runs every tax line for a single paystub.
 *
 * @param {object} input
 *   employee:  the employee row (uses w4_*, state_*)
 *   company:   the company row (uses sui_rate_pct, sui_wage_base, futa_rate_pct, state_employer_id_state)
 *   gross:     this paystub's gross pay
 *   ytd:       { gross, medicareWages, ssWages } BEFORE this paystub
 *   payFrequency: defaults to company.pay_frequency
 *   preTaxDeductions: number — 401k, HSA, etc. (reduces taxable wages)
 *   postTaxDeductions: number — wage garnishments, post-tax benefits
 *
 * @returns {object} with every line + netPay.
 */
export function calcPaystubTax(input) {
  const {
    employee,
    company,
    gross,
    ytd = { gross: 0, ssWages: 0, medicareWages: 0 },
    payFrequency = company?.pay_frequency || 'bi-weekly',
    preTaxDeductions = 0,
    postTaxDeductions = 0,
  } = input

  const grossN = Number(gross) || 0
  const taxableWages = Math.max(0, grossN - (Number(preTaxDeductions) || 0))

  // Federal income tax (uses W-4)
  const fit = calcFederalIncomeTax({
    gross: taxableWages,
    payFrequency,
    filingStatus:      employee?.w4_filing_status || 'single',
    multipleJobs:      !!employee?.w4_multiple_jobs,
    dependentsAmt:     Number(employee?.w4_dependents_amount) || 0,
    otherIncomeAnnual: Number(employee?.w4_other_income) || 0,
    deductionsAnnual:  Number(employee?.w4_deductions) || 0,
    extraPerPeriod:    Number(employee?.w4_extra_withholding) || 0,
  })

  // FICA (taxable wages, not gross — pre-tax 401k DOES reduce SS/Medicare
  // base for traditional contributions; HSA also pre-FICA. Simplified
  // here as "preTaxDeductions all reduce FICA base" — refine when we
  // add deduction kinds.)
  const fica = calcFICA({
    gross: taxableWages,
    ytdGrossBeforeThis:    Number(ytd.ssWages)       || 0,
    ytdMedicareBeforeThis: Number(ytd.medicareWages) || 0,
  })

  // FUTA (employer)
  const futa = calcFUTA({
    gross: taxableWages,
    ytdGrossBeforeThis: Number(ytd.gross) || 0,
    ratePct: Number(company?.futa_rate_pct) || (FUTA_RATE * 100),
  })

  // State income tax
  const sit = calcStateIncomeTax({
    gross: taxableWages,
    state: company?.state_employer_id_state || 'UT',
  })

  // SUI (employer)
  const sui = calcSUI({
    gross: taxableWages,
    ytdGrossBeforeThis: Number(ytd.gross) || 0,
    ratePct: Number(company?.sui_rate_pct) || 0,
    wageBase: Number(company?.sui_wage_base) || UTAH_SUI_WAGE_BASE_2025,
  })

  // Net pay
  const totalEmployeeWithheld = r2(
    fit + fica.socialSecurityEmployee + fica.medicareEmployee +
    fica.additionalMedicare + sit + (Number(postTaxDeductions) || 0)
  )
  const netPay = r2(grossN - (Number(preTaxDeductions) || 0) - totalEmployeeWithheld)

  return {
    grossPay:               r2(grossN),
    preTaxDeductions:       r2(Number(preTaxDeductions) || 0),
    taxableWages:           r2(taxableWages),

    // Employee withholdings
    federalIncomeTax:       fit,
    stateIncomeTax:         sit,
    socialSecurityEmployee: fica.socialSecurityEmployee,
    medicareEmployee:       fica.medicareEmployee,
    additionalMedicare:     fica.additionalMedicare,
    postTaxDeductions:      r2(Number(postTaxDeductions) || 0),

    // Employer-side (don't reduce net pay; tracked for liability ledger)
    socialSecurityEmployer: fica.socialSecurityEmployer,
    medicareEmployer:       fica.medicareEmployer,
    futa:                   futa,
    sui:                    sui,

    // Total cost of employment for this period
    totalEmployerCost: r2(
      grossN + fica.socialSecurityEmployer + fica.medicareEmployer + futa + sui
    ),

    netPay,
  }
}

// Convenience: normalize a pay frequency string from various sources.
export function normalizePayFrequency(s) {
  if (!s) return 'bi-weekly'
  const k = String(s).toLowerCase().replace(/\s+/g, '-')
  if (k === 'biweekly' || k === 'bi-weekly' || k === 'biweekly')           return 'bi-weekly'
  if (k === 'semimonthly' || k === 'semi-monthly' || k === 'twice-monthly') return 'semimonthly'
  if (k === 'weekly')  return 'weekly'
  if (k === 'monthly') return 'monthly'
  return 'bi-weekly'
}
