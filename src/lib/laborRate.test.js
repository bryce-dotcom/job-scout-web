import { describe, it, expect } from 'vitest'
import {
  hourlyCostRate, baseHourlyRate, burdenPct, workersCompPct, isSalaried,
  costRatesByEmployee, FICA_EMPLOYER_PCT, FULL_TIME_HOURS_PER_YEAR, effectiveBurdenPct, annualWageOf,
} from './laborRate'

// HHH's own payroll setup.
const HHH = { futa_rate_pct: 0.6, sui_rate_pct: 0.2, workers_comp_class_codes: {}, state: 'UT' }

describe('a salaried person still costs the job something', () => {
  // Christopher clocked 21 job hours in a week at $0, because he has no hourly
  // rate. He clocks in to show where his time goes, not to be paid by the hour.
  const christopher = { id: 14, is_salary: true, annual_salary: 84000, hourly_rate: 0 }

  it('spreads the salary over a standard working year', () => {
    expect(baseHourlyRate(christopher)).toBeCloseTo(84000 / 2080, 6)
    expect(FULL_TIME_HOURS_PER_YEAR).toBe(2080)
  })

  it('no longer costs nothing', () => {
    expect(hourlyCostRate(christopher, HHH)).toBeGreaterThan(40)
  })

  it('prefers the salary when a stray hourly rate is also on the card', () => {
    // Alayda carries both: $23/hr and a $50,000 salary. The salary is how she
    // is actually paid, so it wins — nobody has to clean up the card first.
    const alayda = { id: 15, is_salary: true, annual_salary: 50000, hourly_rate: 23 }
    expect(baseHourlyRate(alayda)).toBeCloseTo(50000 / 2080, 6)
  })

  it('leaves an hourly person on their hourly rate', () => {
    expect(baseHourlyRate({ id: 19, is_hourly: true, hourly_rate: 31, annual_salary: 0 })).toBe(31)
  })

  it('uses a salary even when the flags are not set', () => {
    expect(baseHourlyRate({ annual_salary: 104000 })).toBe(50)
  })

  it('is zero when there is nothing to go on, rather than a guess', () => {
    expect(baseHourlyRate({ id: 1 })).toBe(0)
    expect(hourlyCostRate({ id: 1 }, HHH)).toBe(0)
    expect(baseHourlyRate(null)).toBe(0)
  })

  it('reads salary from either column', () => {
    expect(baseHourlyRate({ is_salary: true, salary: 62400 })).toBe(30)
  })
})

describe('isSalaried', () => {
  it('accepts the flag, the string and the array the app writes', () => {
    expect(isSalaried({ is_salary: true })).toBe(true)
    expect(isSalaried({ pay_type: 'salary' })).toBe(true)
    expect(isSalaried({ pay_type: ['salary', 'commission'] })).toBe(true)
    expect(isSalaried({ pay_type: ['hourly'] })).toBe(false)
    expect(isSalaried(null)).toBe(false)
  })
})

describe('an employee costs more than their wage', () => {
  it('adds the employer FICA, FUTA and SUI the company actually pays', () => {
    expect(burdenPct(HHH)).toBeCloseTo(FICA_EMPLOYER_PCT + 0.6 + 0.2, 6)
    expect(burdenPct(HHH)).toBeCloseTo(8.45, 6)
  })

  it('applies it to the hour, with FUTA and SUI capped at their wage bases', () => {
    // $100/hr is $208,000 a year. Social Security stops at $184,500, FUTA at
    // $7,000 and Utah SUI at $50,700, so the burden is 7.02%, not a flat
    // 8.45% — the flat figure would overcharge this hour by $1.43.
    const r = hourlyCostRate({ hourly_rate: 100, is_hourly: true }, HHH)
    expect(r).toBeCloseTo(107.018461, 4)
    expect(r).toBeLessThan(100 * (1 + burdenPct(HHH) / 100))
  })

  it('charges the flat rate to a low earner, where no cap is reached', () => {
    // $7,000 a year is under every base, so every dollar carries the lot.
    expect(effectiveBurdenPct(7000, HHH)).toBeCloseTo(burdenPct(HHH), 6)
  })

  it('a salaried person gets the capped rate too', () => {
    // Christopher: $84,000 — SS and Medicare on all of it, $42 of FUTA and
    // $101.40 of SUI, which is 7.82% rather than 8.45%.
    expect(effectiveBurdenPct(84000, HHH)).toBeCloseTo(7.8207, 3)
  })

  it('falls back to the flat rate when there is no wage to cap against', () => {
    expect(effectiveBurdenPct(0, HHH)).toBe(burdenPct(HHH))
  })

  it('annualWageOf reads a salary, or a full-time year of an hourly rate', () => {
    expect(annualWageOf({ is_salary: true, annual_salary: 84000 })).toBe(84000)
    expect(annualWageOf({ is_hourly: true, hourly_rate: 31 })).toBe(31 * 2080)
    expect(annualWageOf({})).toBe(0)
  })

  it('takes the highest workers comp class rate, so a crew is not costed at the office rate', () => {
    expect(workersCompPct({ workers_comp_class_codes: { 8810: 0.4, 5538: 6.2 } })).toBe(6.2)
    expect(workersCompPct({ workers_comp_class_codes: { 5538: { rate: 6.2 } } })).toBe(6.2)
  })

  it('is zero when no workers comp rates are configured, not a guess', () => {
    expect(workersCompPct(HHH)).toBe(0)
    expect(workersCompPct({})).toBe(0)
    expect(workersCompPct({ workers_comp_class_codes: null })).toBe(0)
  })

  it('without a company you get the bare wage, which is what callers got before', () => {
    expect(hourlyCostRate({ hourly_rate: 50, is_hourly: true })).toBe(50)
    expect(burdenPct(null)).toBe(0)
  })
})

describe('costRatesByEmployee', () => {
  it('maps every employee to a burdened cost rate', () => {
    const m = costRatesByEmployee([
      { id: 14, is_salary: true, annual_salary: 84000 },
      { id: 19, is_hourly: true, hourly_rate: 31 },
    ], HHH)
    expect(m.get(19)).toBeCloseTo(31 * (1 + effectiveBurdenPct(31 * 2080, HHH) / 100), 6)
    expect(m.get(14)).toBeCloseTo((84000 / 2080) * (1 + effectiveBurdenPct(84000, HHH) / 100), 6)
  })

  it('skips junk rather than throwing', () => {
    expect(costRatesByEmployee([null, {}, undefined], HHH).size).toBe(0)
    expect(costRatesByEmployee(null).size).toBe(0)
  })
})
