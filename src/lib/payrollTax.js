// payrollTax.js
// =====================================================================
// Pure-function payroll tax calculator. Takes (employee, gross, ytd,
// pay frequency, employer state) and returns every tax line + net pay.
//
// Sources (must be refreshed each January):
//   - Federal income tax: IRS Publication 15-T (2026), Worksheet 1A,
//     Percentage Method Tables for Automated Payroll Systems (annual
//     tables, any pay frequency), incl. the line-1g adjustment.
//   - FICA: Social Security 6.2% to wage base $184,500 (2026);
//           Medicare 1.45% no cap; Additional Medicare 0.9% over $200k YTD.
//   - FUTA: 0.6% (after standard 5.4% credit) on first $7,000 YTD.
//   - Utah SIT: 4.5% flat (2025–2026), with the personal exemption credit.
//     For simplicity v1 uses the flat rate directly; the Utah TC-40 credit
//     refunds at filing, so withholding is conservative-but-correct.
//   - Utah SUI: per-employer assigned rate, on first $50,700 YTD (2026).
//
// The numbers below are stamped TAX_YEAR. Each January: transcribe the new
// Pub 15-T page-12 tables, the SSA wage base and Utah's rate/wage base,
// bump TAX_YEAR, and set the payroll_tax_year setting (the health check
// reads it). Anything else breaking should fail loud (we throw on unknown
// filing_status etc.).
// =====================================================================

import { suiWageBaseFor } from './suiRate'

export const TAX_YEAR = 2026

/**
 * Are these tables the ones the IRS is actually using right now?
 *
 * Bryce: "payroll taxes dont match gusto's". This is the likeliest reason —
 * not a wrong formula but a stale calendar. The withholding method here is
 * Pub 15-T's Annual Percentage Method, which is what Gusto uses too, so the
 * arithmetic agrees; the BRACKETS do not, because they are last year's.
 *
 * The flat rates (6.2% SS, 1.45% Medicare, 0.6% FUTA) do not change year to
 * year, so FICA should still match Gusto to the cent. Expect the difference
 * in federal income tax withholding and the state wage bases.
 *
 * Returns null when current, or a description of the gap. Deliberately a
 * value rather than a console warning: a number nobody can trust must be
 * able to say so on screen and in the daily health check.
 */
export function taxTablesStale(now = new Date()) {
  const year = now.getFullYear()
  if (year <= TAX_YEAR) return null
  return {
    tableYear: TAX_YEAR,
    currentYear: year,
    yearsBehind: year - TAX_YEAR,
    message: `Payroll tax tables are ${TAX_YEAR}; it is ${year}. Federal withholding ` +
      `and state wage bases will not match a current-year payroll provider. ` +
      `FICA rates are unchanged and should still agree.`,
  }
}

// ---- Federal Pub 15-T 2026 — Percentage Method, automated systems ---
// "Form W-4, Step 2, Checkbox, withholding rate schedules" if multiple
// jobs is checked; otherwise the STANDARD schedule.
//
// Each row: [over, baseTax, ratePct] — ADJUSTED annual wage brackets.
// Withholding = baseTax + ratePct * (adjustedAnnualWage - over)
//
// Transcribed verbatim from IRS Publication 15-T (2026), page 12, "2026
// Percentage Method Tables for Automated Payroll Systems and Withholding on
// Periodic Payments of Pensions and Annuities" — columns A (at least),
// C (tentative amount) and D (percentage). Column C is the running total at
// each threshold; the tests check every row against its predecessor, so a
// mistyped digit fails the build rather than a paycheck.
//
// Sources: Rev. Proc. 2025-32 (brackets, standard deduction) and Pub 15-T
// (2026) for the schedules; the 2025 file had 2024's wage base and Utah rate
// and a first bracket nobody could source, which is why this is transcribed
// rather than derived.
const FED_BRACKETS_2026 = {
  // STANDARD Withholding Rate Schedules (Form W-4 2020+ with Step 2 NOT
  // checked, or a 2019-or-earlier Form W-4).
  single: [
    [0,           0.00,   0],
    [7500,        0.00,  10],
    [19900,    1240.00,  12],
    [57900,    5800.00,  22],
    [113200,  17966.00,  24],
    [209275,  41024.00,  32],
    [263725,  58448.00,  35],
    [648100, 192979.25,  37],
  ],
  married_jointly: [
    [0,           0.00,   0],
    [19300,       0.00,  10],
    [44100,    2480.00,  12],
    [120100,  11600.00,  22],
    [230700,  35932.00,  24],
    [422850,  82048.00,  32],
    [531750, 116896.00,  35],
    [788000, 206583.50,  37],
  ],
  head_of_household: [
    [0,           0.00,   0],
    [15550,       0.00,  10],
    [33250,    1770.00,  12],
    [83000,    7740.00,  22],
    [121250,  16155.00,  24],
    [217300,  39207.00,  32],
    [271750,  56631.00,  35],
    [656150, 191171.00,  37],
  ],
}

// Form W-4, Step 2, Checkbox, Withholding Rate Schedules (2020+ W-4 with the
// Step 2 box checked). No Step 1g subtraction goes with these.
const FED_BRACKETS_STEP2_2026 = {
  single: [
    [0,          0.00,   0],
    [8050,       0.00,  10],
    [14250,    620.00,  12],
    [33250,   2900.00,  22],
    [60900,   8983.00,  24],
    [108938, 20512.00,  32],
    [136163, 29224.00,  35],
    [328350, 96489.63,  37],
  ],
  married_jointly: [
    [0,           0.00,   0],
    [16100,       0.00,  10],
    [28500,    1240.00,  12],
    [66500,    5800.00,  22],
    [121800,  17966.00,  24],
    [217875,  41024.00,  32],
    [272325,  58448.00,  35],
    [400450, 103291.75,  37],
  ],
  head_of_household: [
    [0,          0.00,   0],
    [12075,      0.00,  10],
    [20925,    885.00,  12],
    [45800,   3870.00,  22],
    [64925,   8077.50,  24],
    [112950, 19603.50,  32],
    [140175, 28315.50,  35],
    [332375, 95585.50,  37],
  ],
}

// Worksheet 1A, line 1g. When the Step 2 box is NOT checked, Pub 15-T
// subtracts this from annual wages before the STANDARD schedule is applied —
// the schedule's first threshold ($7,500 single) is the standard deduction
// ($16,100) minus this. The 2025 code skipped the step ("baked into the
// thresholds" — it is not), so every paycheck was taxed on $8,600 (or
// $12,900) of wages a year that the IRS excludes: about $40 a fortnight too
// much for a single tech on $2,000, which is the Gusto gap Bryce reported.
// Unchanged for 2026 (Pub 15-T, Worksheet 1A, line 1g).
const W4_STEP1G_MARRIED_JOINTLY = 12900
const W4_STEP1G_OTHER           = 8600

// Exported for the tests, which check the schedules are internally
// consistent (every base amount equals the tax accumulated below it).
export const FED_SCHEDULES = { standard: FED_BRACKETS_2026, step2: FED_BRACKETS_STEP2_2026 }

// ---- Dated federal tables ---------------------------------------------
// Bryce, 2026-10-05: "get payroll right for everyone, all tenants." The
// brackets and wage bases above were loose constants pinned to one year; a
// new year meant finding every one. They are now one table keyed by tax
// year, picked by the pay date, and the tests fail when the current year is
// missing. Adding 2027 is adding one entry here, not a hunt.
//
// A pay date in a year this table does not have uses the LATEST year it
// does have, and taxTablesStale() says so on screen — paying with last
// year's brackets is wrong, but refusing to pay is worse.
export const FEDERAL_YEARS = {
  2026: {
    standard: FED_BRACKETS_2026,
    step2: FED_BRACKETS_STEP2_2026,
    step1g: { married_jointly: W4_STEP1G_MARRIED_JOINTLY, other: W4_STEP1G_OTHER },
    ssWageBase: 184500,              // SSA, announced 2025-10-24
    ssRate: 0.062,
    medicareRate: 0.0145,
    additionalMedicareThreshold: 200000,
    additionalMedicareRate: 0.009,
    futaWageBase: 7000,
    futaRate: 0.006,                 // after the 5.4% state credit
  },
}
export const taxYearOf = (payDate) => {
  const s = payDate instanceof Date ? payDate.toISOString() : String(payDate || new Date().toISOString())
  const y = Number(s.slice(0, 4))
  return Number.isFinite(y) ? y : TAX_YEAR
}
/** The federal table for a pay date — the year's own, else the latest we have. */
export function federalFor(payDate) {
  const y = taxYearOf(payDate)
  if (FEDERAL_YEARS[y]) return { year: y, ...FEDERAL_YEARS[y] }
  const latest = Math.max(...Object.keys(FEDERAL_YEARS).map(Number))
  return { year: latest, ...FEDERAL_YEARS[latest] }
}

// FICA constants — 2026. SSA announced the wage base 2025-10-24: $184,500
// (2025 was $176,100; the "2025" file said $168,600, which was 2024's).

// FUTA — 0.6% on first $7,000, employer only

// Utah withholding — Publication 14, Withholding Tax Guide. NOT a flat rate.
//
// Bryce, 2026-10-05, Gusto's journal beside ours: Social Security, Medicare
// and federal matched to the cent; Utah did not. Kayden's $361 check had
// $16 of Utah tax here and $0 at Gusto. Pub 14's schedules take the rate
// off the wages and then SUBTRACT a per-paycheck base allowance that phases
// out at 1.3% of wages above a threshold — so a small check owes nothing and
// a large one owes the full rate. The flat 4.5% was the "for simplicity v1"
// note at the top of this file, and it over-withheld everyone under about
// $50k a year.
//
// Schedule lines (identical in both revisions):
//   1. wages   2. wages × rate   3. base allowance   4. wages − threshold
//   (not below 0)   5. line 4 × 1.3%   6. line 3 − line 5 (not below 0)
//   7. withholding = line 2 − line 6 (not below 0)
// Filing status is the federal W-4's: married filing jointly → Married;
// everything else → Single (Pub 14 has only the two columns).
//
// Rev. 04/26 (rate 4.45%, S.B. 60) applies to pay periods beginning on or
// after 1 June 2026; the 2025 revision (4.5%) before that. Per-period base
// allowances and thresholds are the published table values, not the annual
// figure divided — Pub 14 rounds each schedule itself.
const UTAH_SCHEDULES = [
  {
    effective: '2026-06-01', rate: 0.0445,
    // [base allowance, threshold] by period, Single then Married
    weekly:      { single: [9, 180],    married: [19, 360] },
    'bi-weekly': { single: [19, 360],   married: [37, 719] },
    semimonthly: { single: [20, 390],   married: [40, 779] },
    monthly:     { single: [40, 779],   married: [81, 1558] },
    annual:      { single: [485, 9348], married: [970, 18696] },
  },
  {
    effective: '2025-06-01', rate: 0.045,
    weekly:      { single: [9, 175],    married: [17, 350] },
    'bi-weekly': { single: [17, 350],   married: [35, 701] },
    semimonthly: { single: [19, 379],   married: [38, 759] },
    monthly:     { single: [38, 759],   married: [75, 1518] },
    annual:      { single: [450, 9107], married: [900, 18213] },
  },
]
const UTAH_PHASE_OUT = 0.013
// Which Pub 14 revision a pay date falls under.
export function utahScheduleFor(payDate) {
  const d = String(payDate instanceof Date ? payDate.toISOString() : (payDate || new Date().toISOString())).slice(0, 10)
  return UTAH_SCHEDULES.find((s) => d >= s.effective) || UTAH_SCHEDULES[UTAH_SCHEDULES.length - 1]
}
// Utah DWS, jobs.utah.gov: "During 2026, the taxable wage base is $50,700."
const UTAH_SUI_WAGE_BASE_2026 = 50700

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
 * Implements IRS Pub 15-T 2026 Worksheet 1A (Percentage Method, automated).
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
    payDate = null,          // picks the tax year's brackets; latest year when omitted
  } = args
  const fed = federalFor(payDate)

  if (!fed.standard[filingStatus]) {
    throw new Error(`Unknown filingStatus: ${filingStatus}`)
  }

  // Step 1: Annualize this period's wages, add other income.
  const annualWages = annualize(gross, payFrequency) + (otherIncomeAnnual || 0)

  // Step 2 (Worksheet 1A, lines 1f–1i): subtract Step 4(b) deductions, and —
  // unless the Step 2 box is checked — line 1g. The STANDARD schedule's
  // thresholds assume 1g has been taken off; the checkbox schedule's do not.
  const step1g = multipleJobs ? 0 : (filingStatus === 'married_jointly' ? fed.step1g.married_jointly : fed.step1g.other)
  const taxableAnnual = Math.max(0, annualWages - (deductionsAnnual || 0) - step1g)

  // Step 3: Look up bracket — Step 2 schedule if multiple jobs checked.
  const brackets = multipleJobs
    ? fed.step2[filingStatus]
    : fed.standard[filingStatus]
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
export function calcFICA({ gross, ytdGrossBeforeThis, ytdMedicareBeforeThis, payDate = null }) {
  const grossN = Number(gross) || 0
  const ytdSS = Number(ytdGrossBeforeThis) || 0
  const ytdMed = Number(ytdMedicareBeforeThis) || 0
  const fed = federalFor(payDate)

  // Social Security — caps at the year's wage base
  const ssRoom = Math.max(0, fed.ssWageBase - ytdSS)
  const ssTaxable = Math.min(grossN, ssRoom)
  const ssEmployee = r2(ssTaxable * fed.ssRate)
  const ssEmployer = r2(ssTaxable * fed.ssRate)

  // Medicare — uncapped, both halves
  const medEmployee = r2(grossN * fed.medicareRate)
  const medEmployer = r2(grossN * fed.medicareRate)

  // Additional Medicare (0.9% on wages OVER 200k YTD, employee only).
  let addMed = 0
  const ytdAfter = ytdMed + grossN
  if (ytdAfter > fed.additionalMedicareThreshold) {
    const addTaxable = ytdAfter - Math.max(ytdMed, fed.additionalMedicareThreshold)
    addMed = r2(addTaxable * fed.additionalMedicareRate)
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
export function calcFUTA({ gross, ytdGrossBeforeThis, ratePct, payDate = null }) {
  const grossN = Number(gross) || 0
  const ytd = Number(ytdGrossBeforeThis) || 0
  const fed = federalFor(payDate)
  const room = Math.max(0, fed.futaWageBase - ytd)
  const taxable = Math.min(grossN, room)
  const rate = (Number(ratePct) || (fed.futaRate * 100)) / 100
  return r2(taxable * rate)
}

// ---- Colorado ----------------------------------------------------------
// DR 1098 (rev. 10/21/25), the Colorado Withholding Worksheet for
// Employers, read from the PDF on 2026-10-05:
//   1c  annualize the period's taxable wages (× pay periods per year)
//   2a  subtract the annual withholding allowance: the DR 0004 line 2 amount
//       if the employee gave one, else $11,000 for married filing jointly or
//       qualifying surviving spouse, $5,500 for every other W-4 status
//   2c  × 4.40%     2d  ÷ pay periods     2e  + DR 0004 line 3 extra per period
// The demo tenant is in Denver and got $0 state tax under the Utah-only
// engine. Dated like Utah so a rate change is one new entry.
const COLORADO_SCHEDULES = [
  { effective: '2026-01-01', rate: 0.044, allowance: { married_jointly: 11000, other: 5500 } },
]
// FAMLI — Colorado's paid family and medical leave premium, famli.colorado.gov
// (2026-10-05): "The 2026 premium rate is set at 0.88% of employees' wages,
// 0.44% paid by the employer and 0.44% paid by the employee"; "premiums are
// paid on wages up to the federal Social Security wage cap"; employers with
// nine or fewer employees owe no employer share (the employee share is
// still withheld). 2025 was 0.90%. Withheld after tax: it does not reduce
// federal or state taxable wages.
const FAMLI_SCHEDULES = [
  { effective: '2026-01-01', rate: 0.0088, employeeShare: 0.5 },
  { effective: '2025-01-01', rate: 0.0090, employeeShare: 0.5 },
]
const FAMLI_SMALL_EMPLOYER_MAX = 9
const scheduleFor = (schedules, payDate) => {
  const d = String(payDate instanceof Date ? payDate.toISOString() : (payDate || new Date().toISOString())).slice(0, 10)
  return schedules.find((s) => d >= s.effective) || schedules[schedules.length - 1]
}
export function calcColoradoFamli({ gross, ytdGrossBeforeThis = 0, employeeCount = null, payDate = null }) {
  const grossN = Number(gross) || 0
  const ytd = Number(ytdGrossBeforeThis) || 0
  const s = scheduleFor(FAMLI_SCHEDULES, payDate)
  const cap = federalFor(payDate).ssWageBase
  const taxable = Math.min(grossN, Math.max(0, cap - ytd))
  const total = taxable * s.rate
  const employee = r2(total * s.employeeShare)
  const small = employeeCount != null && Number(employeeCount) <= FAMLI_SMALL_EMPLOYER_MAX
  const employer = small ? 0 : r2(total - total * s.employeeShare)
  return { employee, employer, rate: s.rate, smallEmployer: small }
}

// Which states this engine withholds for. Anything else needs ratePct from
// the caller or returns 0 — and the setup gate / run guards should say so.
export const WITHHOLDING_STATES = ['UT', 'CO']

/**
 * Utah state income tax — 4.5% flat (2025–2026, per the Tax Commission).
 * Other states: route through this function with their own ratePct.
 */
export function calcStateIncomeTax({ gross, state = 'UT', ratePct, filingStatus = 'single', payFrequency = 'bi-weekly', payDate = null, stateAllowance = null, stateExtraPerPeriod = 0 }) {
  const grossN = Number(gross) || 0
  if (ratePct != null) return r2(grossN * (ratePct / 100))   // another state's flat rate, caller-supplied
  const st = String(state || '').toUpperCase()
  if (st === 'CO') {
    // DR 1098, steps 1c → 2f.
    const s = scheduleFor(COLORADO_SCHEDULES, payDate)
    const periods = PAY_FREQUENCY_PERIODS[payFrequency] || PAY_FREQUENCY_PERIODS['bi-weekly']
    const annual = grossN * periods
    const allowance = stateAllowance != null && stateAllowance !== ''
      ? Number(stateAllowance) || 0
      : (/married_jointly|qualifying/i.test(String(filingStatus || '')) ? s.allowance.married_jointly : s.allowance.other)
    const taxable = Math.max(0, annual - allowance)
    return r2(Math.max(0, (taxable * s.rate) / periods + (Number(stateExtraPerPeriod) || 0)))
  }
  if (st !== 'UT') return 0                                   // unknown state — caller must provide ratePct
  const sched = utahScheduleFor(payDate)
  const period = sched[payFrequency] || sched['bi-weekly']
  const col = /married_jointly|^married$/i.test(String(filingStatus || '')) ? 'married' : 'single'
  const [baseAllowance, threshold] = period[col]
  const line2 = grossN * sched.rate
  const line5 = Math.max(0, grossN - threshold) * UTAH_PHASE_OUT
  const line6 = Math.max(0, baseAllowance - line5)
  return r2(Math.max(0, line2 - line6))
}

/**
 * State unemployment (SUI). Like FUTA but per-employer assigned rate
 * and per-state wage base.
 */
export function calcSUI({ gross, ytdGrossBeforeThis, ratePct, wageBase }) {
  const grossN = Number(gross) || 0
  const ytd = Number(ytdGrossBeforeThis) || 0
  const base = Number(wageBase) || UTAH_SUI_WAGE_BASE_2026
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
    payDate = null,          // YYYY-MM-DD; picks the tax year and the state revision. Today when omitted.
    employeeCount = null,    // W-2 headcount; Colorado's FAMLI employer share is waived at 9 or fewer
  } = input

  const grossN = Number(gross) || 0
  const taxableWages = Math.max(0, grossN - (Number(preTaxDeductions) || 0))
  const state = String(company?.state_employer_id_state || company?.state || 'UT').toUpperCase()

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
    payDate,
  })

  // FICA (taxable wages, not gross — pre-tax 401k DOES reduce SS/Medicare
  // base for traditional contributions; HSA also pre-FICA. Simplified
  // here as "preTaxDeductions all reduce FICA base" — refine when we
  // add deduction kinds.)
  const fica = calcFICA({
    gross: taxableWages,
    ytdGrossBeforeThis:    Number(ytd.ssWages)       || 0,
    ytdMedicareBeforeThis: Number(ytd.medicareWages) || 0,
    payDate,
  })

  // FUTA (employer)
  const futa = calcFUTA({
    gross: taxableWages,
    ytdGrossBeforeThis: Number(ytd.gross) || 0,
    ratePct: Number(company?.futa_rate_pct) || 0,
    payDate,
  })

  // State income tax — the state's own method (Utah Pub 14, Colorado DR
  // 1098) needs the W-4 status, the pay period and the pay date.
  const sit = calcStateIncomeTax({
    gross: taxableWages,
    state,
    filingStatus: employee?.w4_filing_status || 'single',
    payFrequency,
    payDate,
    stateAllowance: employee?.state_withholding_allowance ?? null,
    stateExtraPerPeriod: Number(employee?.state_extra_withholding) || 0,
  })

  // SUI (employer) — the company's wage base if entered, else the state's
  // published one for the tax year (lib/suiRate).
  const sui = calcSUI({
    gross: taxableWages,
    ytdGrossBeforeThis: Number(ytd.gross) || 0,
    ratePct: Number(company?.sui_rate_pct) || 0,
    wageBase: Number(company?.sui_wage_base) || suiWageBaseFor(state, taxYearOf(payDate)) || UTAH_SUI_WAGE_BASE_2026,
  })

  // Colorado FAMLI — employee share withheld after tax, employer share a cost.
  const famli = state === 'CO'
    ? calcColoradoFamli({ gross: taxableWages, ytdGrossBeforeThis: Number(ytd.gross) || 0, employeeCount, payDate })
    : { employee: 0, employer: 0 }

  // Net pay
  const totalEmployeeWithheld = r2(
    fit + fica.socialSecurityEmployee + fica.medicareEmployee +
    fica.additionalMedicare + sit + famli.employee + (Number(postTaxDeductions) || 0)
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
    famliEmployee:          famli.employee,     // Colorado only; 0 elsewhere
    postTaxDeductions:      r2(Number(postTaxDeductions) || 0),

    // Employer-side (don't reduce net pay; tracked for liability ledger)
    socialSecurityEmployer: fica.socialSecurityEmployer,
    medicareEmployer:       fica.medicareEmployer,
    futa:                   futa,
    sui:                    sui,
    famliEmployer:          famli.employer,     // Colorado only; 0 elsewhere and for 9-or-fewer employers

    // Total cost of employment for this period
    totalEmployerCost: r2(
      grossN + fica.socialSecurityEmployer + fica.medicareEmployer + futa + sui + famli.employer
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
