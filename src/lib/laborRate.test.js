import { describe, it, expect } from 'vitest'
import {
  hourlyCostRate, baseHourlyRate, burdenPct, workersCompPct, isSalaried,
  costRatesByEmployee, FICA_EMPLOYER_PCT, FULL_TIME_HOURS_PER_YEAR,
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

  it('applies it to the hour', () => {
    const r = hourlyCostRate({ hourly_rate: 100, is_hourly: true }, HHH)
    expect(r).toBeCloseTo(108.45, 6)
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
    expect(m.get(19)).toBeCloseTo(31 * 1.0845, 6)
    expect(m.get(14)).toBeCloseTo((84000 / 2080) * 1.0845, 6)
  })

  it('skips junk rather than throwing', () => {
    expect(costRatesByEmployee([null, {}, undefined], HHH).size).toBe(0)
    expect(costRatesByEmployee(null).size).toBe(0)
  })
})
