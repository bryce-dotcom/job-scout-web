// What a payroll costs is what clears the bank from one pay date to the next
// (Bryce, 2026-10-28: "payroll is about 30-40k per pay period", "it leaves
// over several days as checks clear"). Jenny took one heavy period as the
// next payroll; the lookup now hands her each period and a typical one.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { payrollPeriodsFromBank, isPayrollBankRow } from '../../supabase/functions/_shared/payrollFromBank.ts'
import * as payrollBooks from './payrollBooks'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const check = (date, amount) => ({ date, amount, name: `Draft Withdrawal Draft #${Math.round(amount)}`, user_tax_category: 'Line 9 - Salaries and wages' })
const gusto = (date, amount) => ({ date, amount, merchant_name: 'Gusto' })

describe('one payroll = everything that clears from its pay date to the next', () => {
  const pays = ['2026-09-04', '2026-09-20', '2026-10-05', '2026-10-20']
  const bank = [
    check('2026-09-04', 20000), check('2026-09-08', 12000), gusto('2026-09-08', 4000), // 36,000
    check('2026-09-21', 30000), check('2026-09-23', 8000),                             // 38,000
    check('2026-10-06', 40000), check('2026-10-09', 15000),                             // 55,000
    check('2026-10-21', 23000),                                                          // still clearing
    { date: '2026-09-10', amount: 5000, name: 'MES', user_tax_category: 'Line 2 - Cost of goods sold' },
    { ...check('2026-09-10', 9000), is_transfer: true },
    check('2026-09-12', -500),
  ]
  const r = payrollPeriodsFromBank(bank, pays, '2026-10-28')
  it('adds up each period across the days its checks clear, and only payroll lines', () => {
    expect(r.periods.map((p) => p.cleared)).toEqual([36000, 38000, 55000, 23000])
  })
  it('the newest period is still clearing and does not count toward typical', () => {
    expect(r.periods.at(-1)).toMatchObject({ pay_date: '2026-10-20', until: '2026-10-28', still_clearing: true })
  })
  it('typical is the median of complete periods — one heavy period does not become the estimate', () => {
    expect(r.typical).toBe(38000)
    expect([r.low, r.high]).toEqual([36000, 55000])
  })
  it('a pay date not yet arrived is ignored, and no pay dates means no periods', () => {
    expect(payrollPeriodsFromBank(bank, [...pays, '2026-11-05'], '2026-10-28').periods).toHaveLength(4)
    expect(payrollPeriodsFromBank(bank, [], '2026-10-28')).toMatchObject({ periods: [], typical: null })
  })
})

describe('one rule, shared', () => {
  it('Books reads the same payroll-row test', () => {
    expect(payrollBooks.isPayrollBankRow).toBe(isPayrollBankRow)
  })
  it('the lookup returns from_the_bank and tells her to plan on typical', () => {
    const f = read('supabase/functions/_shared/frankieTools.ts')
    expect(f).toMatch(/const fromBank = payrollPeriodsFromBank\(bank, payDates, today\)/)
    expect(f).toMatch(/use it for the NEXT payroll, never one period alone/)
    expect(read('supabase/functions/_shared/arniePrompt.ts')).toMatch(/The NEXT payroll is the typical one/)
  })
})
