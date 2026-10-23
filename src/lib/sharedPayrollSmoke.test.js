// The tax and wage maths moved to supabase/functions/_shared on 2026-10-23 so
// the edge functions could read the same tables the app does. Two things that
// move needs and nothing else checks:
//
//   1. The shims at src/lib/{suiRate,payrollTax,laborRate}.js must re-export
//      the WHOLE surface. ~30 files import by those paths; a name missed by
//      `export *` is a runtime "not a function" in payroll, not a build error.
//   2. `npm run guard` runs eslint's no-undef over `src` ONLY — eslint has no
//      TS parser configured here, so the moved files left that net. These are
//      pure modules, so executing every export is the practical equivalent:
//      an undefined reference throws when the line runs.
import { describe, it, expect } from 'vitest'
import * as suiShim from './suiRate.js'
import * as taxShim from './payrollTax.js'
import * as laborShim from './laborRate.js'
import * as suiReal from '../../supabase/functions/_shared/suiRate.ts'
import * as taxReal from '../../supabase/functions/_shared/payrollTax.ts'
import * as laborReal from '../../supabase/functions/_shared/laborRate.ts'

describe('the shims re-export everything the moved modules export', () => {
  for (const [name, shim, real] of [
    ['suiRate', suiShim, suiReal],
    ['payrollTax', taxShim, taxReal],
    ['laborRate', laborShim, laborReal],
  ]) {
    it(`${name}: same names, nothing dropped in the move`, () => {
      const keys = (m) => Object.keys(m).filter(k => k !== 'default').sort()
      expect(keys(shim)).toEqual(keys(real))
      expect(keys(real).length).toBeGreaterThan(0)
    })
  }
})

describe('every export runs at least once', () => {
  // The ones no other test touches, so no line of these modules is unexecuted.
  it('suiRate: the lookups and the data tables', () => {
    expect(suiReal.suiStateFor('UT')?.code).toBe('UT')
    expect(suiReal.suiStateFor('ZZ')).toBeFalsy()
    expect(Array.isArray(suiReal.PROVIDER_PATHS)).toBe(true)
    expect(typeof suiReal.SUI_SOURCES).toBe('object')
  })

  it('payrollTax: pay-frequency normalising and the state lists', () => {
    expect(taxReal.normalizePayFrequency('Bi-Weekly')).toBeTruthy()
    expect(taxReal.normalizePayFrequency('')).toBeTruthy()
    expect(typeof taxReal.PAY_FREQUENCY_PERIODS).toBe('object')
    expect(taxReal.NO_WITHHOLDING_STATES).toContain('TX')
    expect(taxReal.WITHHOLDING_STATES).toContain('UT')
  })

  it('laborRate: a clocked hour still costs what it did', () => {
    // The whole reason for the move: this is what prices punched hours.
    const company = { futa_rate_pct: 0.6, sui_rate_pct: 0.2, sui_wage_base: 50700 }
    const hourly = { id: 1, hourly_rate: 50, pay_type: 'hourly' }
    expect(laborReal.baseHourlyRate(hourly)).toBe(50)
    expect(laborReal.hourlyCostRate(hourly, null)).toBe(50)          // bare wage
    expect(laborReal.hourlyCostRate(hourly, company)).toBeGreaterThan(50)  // with burden
    expect(laborReal.costRatesByEmployee([hourly], company).get(1)).toBeGreaterThan(50)
    expect(laborReal.isSalaried({ pay_type: 'salary' })).toBe(true)
    expect(laborReal.annualWageOf(hourly)).toBe(50 * laborReal.FULL_TIME_HOURS_PER_YEAR)
    expect(laborReal.burdenPct(company)).toBeGreaterThan(0)
    expect(laborReal.workersCompPct({ workers_comp_class_codes: { '5403': { rate: 4.2 } } })).toBe(4.2)
    expect(laborReal.effectiveBurdenPct(84000, company)).toBeGreaterThan(0)
  })
})
