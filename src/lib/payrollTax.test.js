import { describe, it, expect } from 'vitest'
import {
  calcFICA, calcFUTA, calcStateIncomeTax, calcSUI, calcPaystubTax,
  calcFederalIncomeTax, FED_SCHEDULES, TAX_YEAR,
} from './payrollTax'

// ─────────────────────────────────────────────────────────────────────────
// This file computes withholding for every employee. It had NO tests.
// A silent change here mis-pays real people and misstates tax liability, and
// nobody would notice until a paycheck or a filing was wrong.
//
// These assert the statutory rates and the invariants that must always hold,
// not incidental implementation details.
// ─────────────────────────────────────────────────────────────────────────

const W2 = { w4_filing_status: 'single', state_filing_status: 'single' }
const CO = { state: 'UT', pay_frequency: 'semi-monthly' }

describe('FICA — statutory rates and caps', () => {
  it('withholds Social Security at 6.2% and Medicare at 1.45%', () => {
    const r = calcFICA({ gross: 1000, ytdGrossBeforeThis: 0, ytdMedicareBeforeThis: 0 })
    expect(r.socialSecurityEmployee).toBeCloseTo(62, 2)
    expect(r.medicareEmployee).toBeCloseTo(14.5, 2)
  })

  it('matches the employer half exactly — employer SS/Medicare mirror the employee', () => {
    const r = calcFICA({ gross: 2500, ytdGrossBeforeThis: 0, ytdMedicareBeforeThis: 0 })
    expect(r.socialSecurityEmployer).toBeCloseTo(r.socialSecurityEmployee, 2)
    expect(r.medicareEmployer).toBeCloseTo(r.medicareEmployee, 2)
  })

  it('stops Social Security at the wage base but keeps taxing Medicare', () => {
    // Already over the 2026 base ($184,500) — no more SS, Medicare continues.
    const r = calcFICA({ gross: 5000, ytdGrossBeforeThis: 184500, ytdMedicareBeforeThis: 184500 })
    expect(r.socialSecurityEmployee).toBe(0)
    expect(r.medicareEmployee).toBeCloseTo(72.5, 2) // Medicare has no cap
  })

  it('taxes only the remaining room when a cheque straddles the wage base', () => {
    const r = calcFICA({ gross: 5000, ytdGrossBeforeThis: 182500, ytdMedicareBeforeThis: 182500 })
    expect(r.socialSecurityEmployee).toBeCloseTo(2000 * 0.062, 2) // only $2,000 of room
  })

  it('adds the 0.9% additional Medicare above $200k, employee only', () => {
    const r = calcFICA({ gross: 10000, ytdGrossBeforeThis: 195000, ytdMedicareBeforeThis: 195000 })
    expect(r.additionalMedicare).toBeGreaterThan(0)
    // No employer match on the additional Medicare surtax.
    expect(r.medicareEmployer).toBeCloseTo(10000 * 0.0145, 2)
  })

  it('returns zeros for a zero-gross cheque instead of NaN', () => {
    const r = calcFICA({ gross: 0, ytdGrossBeforeThis: 0, ytdMedicareBeforeThis: 0 })
    expect(r.socialSecurityEmployee).toBe(0)
    expect(Number.isFinite(r.medicareEmployee)).toBe(true)
  })
})

describe('FUTA — employer only, first $7,000', () => {
  it('charges 0.6% up to the wage base', () => {
    expect(calcFUTA({ gross: 1000, ytdGrossBeforeThis: 0 })).toBeCloseTo(6, 2)
  })

  it('stops once the employee has passed $7,000', () => {
    expect(calcFUTA({ gross: 1000, ytdGrossBeforeThis: 7000 })).toBe(0)
  })

  it('charges only the remaining room at the boundary', () => {
    expect(calcFUTA({ gross: 1000, ytdGrossBeforeThis: 6500 })).toBeCloseTo(500 * 0.006, 2)
  })
})

describe('State income tax', () => {
  it('applies Utah\'s flat rate — 4.5% since 1 Jan 2025 (Tax Commission), not 2024\'s 4.55%', () => {
    expect(calcStateIncomeTax({ gross: 1000, state: 'UT' })).toBeCloseTo(45, 2)
  })

  it('honours an explicit rate for another state', () => {
    expect(calcStateIncomeTax({ gross: 1000, state: 'ID', ratePct: 5 })).toBeCloseTo(50, 2)
  })
})

describe('SUI', () => {
  it('stops at the configured wage base', () => {
    expect(calcSUI({ gross: 1000, ytdGrossBeforeThis: 50000, ratePct: 1, wageBase: 48900 })).toBe(0)
  })

  it('defaults to Utah\'s 2026 taxable wage base of $50,700 (jobs.utah.gov)', () => {
    expect(calcSUI({ gross: 1000, ytdGrossBeforeThis: 50700, ratePct: 1 })).toBe(0)
    expect(calcSUI({ gross: 2000, ytdGrossBeforeThis: 49700, ratePct: 1 })).toBeCloseTo(10, 2) // $1,000 of room
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Federal withholding — IRS Publication 15-T (2026), Worksheet 1A and the
// "Percentage Method Tables for Automated Payroll Systems" (page 12).
//
// Two kinds of check. The schedules are transcribed by hand, so the first
// proves each one is internally consistent: column C is the tax accumulated
// through the rows above it, and a mistyped digit breaks that arithmetic.
// The second walks the IRS worksheet by hand for a few paychecks and pins
// the answer — including line 1g, the $8,600 / $12,900 the 2025 code never
// subtracted (it is what made every federal figure disagree with Gusto).
// ─────────────────────────────────────────────────────────────────────────

describe('Federal schedules — Pub 15-T 2026 transcription is self-consistent', () => {
  const RATES = [0, 10, 12, 22, 24, 32, 35, 37]

  for (const [kind, schedule] of Object.entries(FED_SCHEDULES)) {
    for (const [status, rows] of Object.entries(schedule)) {
      it(`${kind} / ${status}: eight rows, rates 0→37, thresholds ascending, base amounts accumulate`, () => {
        expect(rows.map(r => r[2])).toEqual(RATES)
        for (let i = 1; i < rows.length; i++) {
          const [over, base] = rows[i]
          const [prevOver, prevBase, prevRate] = rows[i - 1]
          expect(over).toBeGreaterThan(prevOver)
          // Thresholds are rounded to the dollar in the publication, so the
          // accumulated tax can differ from column C by cents, never dollars.
          const accumulated = prevBase + (prevRate / 100) * (over - prevOver)
          expect(Math.abs(base - accumulated), `${kind}/${status} row ${i} base ${base} vs ${accumulated.toFixed(2)}`).toBeLessThan(0.5)
        }
      })
    }
  }

  it('STANDARD schedules start withholding exactly at the 2026 standard deduction once line 1g is applied', () => {
    // Rev. Proc. 2025-32: $16,100 single / $32,200 MFJ / $24,150 HoH.
    // The tables' first thresholds are those less line 1g ($8,600 / $12,900).
    expect(FED_SCHEDULES.standard.single[1][0] + 8600).toBe(16100)
    expect(FED_SCHEDULES.standard.married_jointly[1][0] + 12900).toBe(32200)
    expect(FED_SCHEDULES.standard.head_of_household[1][0] + 8600).toBe(24150)
    // Step 2 checkbox schedules use half the standard deduction, no 1g.
    expect(FED_SCHEDULES.step2.single[1][0]).toBe(8050)
    expect(FED_SCHEDULES.step2.married_jointly[1][0]).toBe(16100)
    expect(FED_SCHEDULES.step2.head_of_household[1][0]).toBe(12075)
  })

  it('is the 2026 table set', () => {
    expect(TAX_YEAR).toBe(2026)
  })
})

describe('Federal withholding — Worksheet 1A worked by hand', () => {
  it('single, $2,000 bi-weekly, no W-4 adjustments → $156.15', () => {
    // 1c 52,000 · 1g 8,600 · 1i 43,400 → row $19,900: 1,240 + 12% × 23,500
    // = 4,060 / 26 = 156.15. (The 2025 code, skipping 1g, gave 201.67.)
    expect(calcFederalIncomeTax({ gross: 2000, payFrequency: 'bi-weekly', filingStatus: 'single' })).toBeCloseTo(156.15, 2)
  })

  it('single, $2,000 bi-weekly, Step 2 box checked → $270.19 (no 1g, checkbox schedule)', () => {
    // 1i 52,000 → checkbox row $33,250: 2,900 + 22% × 18,750 = 7,025 / 26.
    expect(calcFederalIncomeTax({ gross: 2000, payFrequency: 'bi-weekly', filingStatus: 'single', multipleJobs: true })).toBeCloseTo(270.19, 2)
  })

  it('married filing jointly, $3,000 semimonthly, $4,000 of Step 3 credits → $11.67', () => {
    // 1c 72,000 · 1g 12,900 · 1i 59,100 → row $44,100: 2,480 + 12% × 15,000
    // = 4,280 − 4,000 credits = 280 / 24.
    expect(calcFederalIncomeTax({ gross: 3000, payFrequency: 'semimonthly', filingStatus: 'married_jointly', dependentsAmt: 4000 })).toBeCloseTo(11.67, 2)
  })

  it('head of household, $1,200 weekly → $81.46', () => {
    // 1c 62,400 · 1g 8,600 · 1i 53,800 → row $33,250: 1,770 + 12% × 20,550
    // = 4,236 / 52.
    expect(calcFederalIncomeTax({ gross: 1200, payFrequency: 'weekly', filingStatus: 'head_of_household' })).toBeCloseTo(81.46, 2)
  })

  it('withholds nothing at or below the standard deduction, and 10% of the dollar above it', () => {
    for (const [status, deduction] of [['single', 16100], ['married_jointly', 32200], ['head_of_household', 24150]]) {
      expect(calcFederalIncomeTax({ gross: deduction / 26, payFrequency: 'bi-weekly', filingStatus: status })).toBe(0)
      const over = calcFederalIncomeTax({ gross: (deduction + 260) / 26, payFrequency: 'bi-weekly', filingStatus: status })
      expect(over).toBeCloseTo(1, 2) // $260 a year over × 10% = $26 / 26 periods
    }
  })

  it('applies Step 4(a), 4(b) and 4(c) in the directions the form says', () => {
    const base = calcFederalIncomeTax({ gross: 2000, payFrequency: 'bi-weekly', filingStatus: 'single' })
    // 4(a) other income raises annual wages: +$2,600 at 12% = $312 / 26 = $12 more.
    expect(calcFederalIncomeTax({ gross: 2000, payFrequency: 'bi-weekly', filingStatus: 'single', otherIncomeAnnual: 2600 })).toBeCloseTo(base + 12, 2)
    // 4(b) deductions lower it by the same arithmetic.
    expect(calcFederalIncomeTax({ gross: 2000, payFrequency: 'bi-weekly', filingStatus: 'single', deductionsAnnual: 2600 })).toBeCloseTo(base - 12, 2)
    // 4(c) is a flat per-period add.
    expect(calcFederalIncomeTax({ gross: 2000, payFrequency: 'bi-weekly', filingStatus: 'single', extraPerPeriod: 25 })).toBeCloseTo(base + 25, 2)
  })

  it('refuses a filing status it has no schedule for', () => {
    expect(() => calcFederalIncomeTax({ gross: 2000, filingStatus: 'married_separately_typo' })).toThrow(/filingStatus/)
  })
})

describe('calcPaystubTax — the whole-cheque contract', () => {
  const run = (over = {}) => calcPaystubTax({
    employee: W2, company: CO, gross: 2160.75, payFrequency: 'semi-monthly',
    ytd: { gross: 0, ssWages: 0, medicareWages: 0 }, ...over,
  })

  it('NET = gross - every employee tax - deductions (the invariant that pays people)', () => {
    const r = run()
    const employeeTaxes = r.federalIncomeTax + r.stateIncomeTax +
      r.socialSecurityEmployee + r.medicareEmployee + r.additionalMedicare
    const expected = r.grossPay - employeeTaxes - r.preTaxDeductions - r.postTaxDeductions
    expect(Math.abs(r.netPay - expected)).toBeLessThan(0.02)
  })

  it('never withholds more than the cheque is worth', () => {
    const r = run({ gross: 100 })
    expect(r.netPay).toBeGreaterThanOrEqual(0)
    expect(r.netPay).toBeLessThanOrEqual(r.grossPay)
  })

  it('does NOT charge the employee the employer-side taxes', () => {
    const r = run()
    // FUTA and the employer FICA halves must never reduce take-home.
    const employeeSide = r.federalIncomeTax + r.stateIncomeTax +
      r.socialSecurityEmployee + r.medicareEmployee + r.additionalMedicare
    expect(r.grossPay - employeeSide).toBeCloseTo(r.netPay, 2)
    expect(r.futa).toBeGreaterThanOrEqual(0)
  })

  it('reduces taxable wages by pre-tax deductions, but not by post-tax', () => {
    const pre = run({ preTaxDeductions: 200 })
    const post = run({ postTaxDeductions: 200 })
    expect(pre.taxableWages).toBeCloseTo(2160.75 - 200, 2)
    expect(post.taxableWages).toBeCloseTo(2160.75, 2)
    // Both still reduce take-home.
    expect(post.netPay).toBeLessThan(run().netPay)
  })

  it('totalEmployerCost is at least the gross', () => {
    const r = run()
    expect(r.totalEmployerCost).toBeGreaterThanOrEqual(r.grossPay)
  })

  it('produces finite numbers for a zero cheque', () => {
    const r = run({ gross: 0 })
    for (const [k, v] of Object.entries(r)) {
      expect(Number.isFinite(v), `${k} should be a finite number`).toBe(true)
    }
  })
})
