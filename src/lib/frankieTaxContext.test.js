import { describe, it, expect } from 'vitest'
import {
  fiscalYearWindow, taxProfile, taxLineOf, taxBreakdown, monthlyPnl, internalTransferIds,
  nextEstimatedTaxDate, buildTaxContext, payrollSummary, dateStr,
} from '../pages/agents/frankie/frankieTaxContext'

const sept15 = new Date(2026, 8, 15)   // 2026-09-15

describe('the tax year', () => {
  it('is the calendar year when no fiscal year end is set', () => {
    const fy = fiscalYearWindow(null, sept15)
    expect(fy.calendar).toBe(true)
    expect(dateStr(fy.start)).toBe('2026-01-01')
    expect(dateStr(fy.end)).toBe('2026-12-31')
  })

  it('runs December to November for a company whose year ends in November', () => {
    // HHH's profile says "November". Asked about "this year" in September,
    // Frankie must count from 1 Dec 2025, not 1 Jan.
    const fy = fiscalYearWindow('November', sept15)
    expect(fy.calendar).toBe(false)
    expect(dateStr(fy.start)).toBe('2025-12-01')
    expect(dateStr(fy.end)).toBe('2026-11-30')
  })

  it('rolls into the next fiscal year once the year end has passed', () => {
    const fy = fiscalYearWindow('November', new Date(2026, 11, 3))
    expect(dateStr(fy.start)).toBe('2026-12-01')
    expect(dateStr(fy.end)).toBe('2027-11-30')
  })

  it('accepts a month number or a date string, and shrugs at junk', () => {
    expect(fiscalYearWindow(6, sept15).start.getMonth()).toBe(6)   // July start
    expect(fiscalYearWindow('11-30', sept15).start.getMonth()).toBe(11)
    expect(fiscalYearWindow('whenever', sept15).calendar).toBe(true)
  })

  it('knows the next estimated-tax date', () => {
    expect(dateStr(nextEstimatedTaxDate(fiscalYearWindow(null, sept15), sept15))).toBe('2027-01-15')
    expect(dateStr(nextEstimatedTaxDate(fiscalYearWindow(null, new Date(2026, 4, 1)), new Date(2026, 4, 1)))).toBe('2026-06-15')
    // Fiscal year Dec–Nov: 4th month is March, 6th is May, 9th is August, then 15 Dec.
    expect(dateStr(nextEstimatedTaxDate(fiscalYearWindow('November', sept15), sept15))).toBe('2026-12-15')
  })
})

describe('the entity', () => {
  it('reads a partnership off the company profile', () => {
    const p = taxProfile({ entity_type: 'Partnership', state_of_incorporation: 'Utah' })
    expect(p.kind).toBe('Partnership')
    expect(p.form).toMatch(/1065/)
    expect(p.passThrough).toBe(true)
    expect(p.seTax).toBe(true)
    expect(p.state).toBe('Utah')
  })

  it('tells an S corporation from a C corporation', () => {
    expect(taxProfile({ entity_type: 'S-Corp' }).seTax).toBe(false)
    expect(taxProfile({ entity_type: 'S Corporation' }).passThrough).toBe(true)
    expect(taxProfile({ entity_type: 'C Corp' }).passThrough).toBe(false)
  })

  it('says so when the profile is blank, instead of pretending', () => {
    const p = taxProfile({})
    expect(p.raw).toBeNull()
    expect(p.kind).toMatch(/not set/)
    expect(p.notes).toMatch(/Settings/)
  })
})

describe('what counts as an expense', () => {
  const txn = (amount, extra = {}) => ({ amount, date: '2026-03-10', is_transfer: false, ...extra })

  it('prefers the line the person chose over the AI guess', () => {
    expect(taxLineOf(txn(10, { user_tax_category: 'Line 20 - Advertising', ai_form_1065_line: 'Line 20 - Meals' }))).toBe('Line 20 - Advertising')
    expect(taxLineOf(txn(10, { ai_form_1065_line: 'Line 9 - Salaries and wages' }))).toBe('Line 9 - Salaries and wages')
    expect(taxLineOf(txn(10, { ai_tax_category: 'Line 2 - Cost of goods sold' }))).toBe('Line 2 - Cost of goods sold')
  })

  it('does not let an owner withdrawal or a credit-card payment reduce profit', () => {
    // The real HHH rows: $32,886 "Withdrawal by", $10,785 "Payment to
    // American Express", $5,000 "To Loan 74" — all tagged Not deductible,
    // all counted as expenses by the old 90-day context.
    const b = taxBreakdown({
      plaidTransactions: [
        txn(32886, { ai_tax_category: 'Not deductible', plaid_personal_finance_category: 'TRANSFER_OUT' }),
        txn(10785, { ai_tax_category: 'Not deductible', plaid_personal_finance_category: 'LOAN_PAYMENTS' }),
        txn(5000, { plaid_personal_finance_category: 'TRANSFER_OUT' }),   // never reviewed
        txn(1200, { ai_form_1065_line: 'Line 20 - Auto expenses' }),
        txn(80, { ai_form_1065_line: 'Line 20 - Meals' }),
      ],
      start: new Date(2026, 0, 1), end: new Date(2026, 11, 31),
    })
    expect(b.deductible).toBe(1280)
    expect(b.nonDeductible).toBe(48671)
    expect(b.meals).toBe(80)
    expect(b.byLine[0]).toEqual(['Line 20 - Auto expenses', 1200])
    expect(b.byNonDeductible.map(([l]) => l)).toContain('Not deductible (transfer or loan payment, not yet reviewed)')
  })

  it('skips credits, flagged transfers, and rows outside the window', () => {
    const b = taxBreakdown({
      plaidTransactions: [
        txn(-500, { ai_tax_category: 'Income' }),
        txn(700, { is_transfer: true, ai_tax_category: 'Not deductible' }),
        txn(300, { date: '2025-06-01', ai_form_1065_line: 'Line 20 - Utilities' }),
        txn(45, { ai_form_1065_line: 'Line 20 - Utilities' }),
      ],
      start: new Date(2026, 0, 1), end: new Date(2026, 11, 31),
    })
    expect(b.deductible).toBe(45)
    expect(b.nonDeductible).toBe(0)
  })

  it('counts manual expenses under their own tax category', () => {
    const b = taxBreakdown({
      manualExpenses: [{ amount: 250, expense_date: '2026-02-02', category: { name: 'Fuel' } }],
      start: new Date(2026, 0, 1), end: new Date(2026, 11, 31),
    })
    expect(b.byLine[0]).toEqual(['Manual: Fuel', 250])
  })

  it('spots money moving between the company\'s own accounts and leaves it out', () => {
    // A $5,000 top-up from checking (acct 5) to an employee's expense account
    // (acct 6): a debit on 5 tagged COGS by the AI, a credit on 6 two days
    // later. Neither leg is spend. The $5,000 spent FROM acct 6 later is.
    const rows = [
      { id: 1, amount: 5000, date: '2026-04-01', is_transfer: false, connected_account_id: 5, ai_form_1065_line: 'Line 2 - Cost of goods sold' },
      { id: 2, amount: -5000, date: '2026-04-03', is_transfer: false, connected_account_id: 6, ai_tax_category: 'Income' },
      { id: 3, amount: 5000, date: '2026-04-20', is_transfer: false, connected_account_id: 6, ai_form_1065_line: 'Line 2 - Cost of goods sold' },
      { id: 4, amount: 5000, date: '2026-05-30', is_transfer: false, connected_account_id: 5, ai_form_1065_line: 'Line 2 - Cost of goods sold' },  // no matching credit
    ]
    const ids = internalTransferIds(rows)
    expect([...ids].sort()).toEqual([1, 2])
    const b = taxBreakdown({ plaidTransactions: rows, start: new Date(2026, 0, 1), end: new Date(2026, 11, 31), exclude: ids })
    expect(b.deductible).toBe(10000)
    expect(b.internalTransfers).toBe(5000)
    expect(b.internalTransferRows).toBe(1)
  })

  it('does not pair a debit with a credit on the same account, or one weeks away', () => {
    const rows = [
      { id: 1, amount: 900, date: '2026-04-01', is_transfer: false, connected_account_id: 5 },
      { id: 2, amount: -900, date: '2026-04-02', is_transfer: false, connected_account_id: 5 },   // refund on the same account
      { id: 3, amount: -900, date: '2026-05-15', is_transfer: false, connected_account_id: 6 },   // too far away
    ]
    expect(internalTransferIds(rows).size).toBe(0)
  })

  it('lays the months out with deductible and non-deductible apart', () => {
    const rows = monthlyPnl({
      payments: [{ amount: 1000, date: '2026-02-05' }, { amount: 500, date: '2026-03-05' }],
      plaidTransactions: [
        txn(200, { date: '2026-02-09', ai_form_1065_line: 'Line 20 - Utilities' }),
        txn(9000, { date: '2026-02-20', ai_tax_category: 'Not deductible' }),
      ],
      start: new Date(2026, 0, 1), end: new Date(2026, 11, 31),
    })
    expect(rows.map(r => r.month)).toEqual(['2026-02', '2026-03'])
    expect(rows[0]).toMatchObject({ revenue: 1000, deductible: 200, nonDeductible: 9000, net: 800 })
  })
})

describe('the context Frankie is handed', () => {
  const company = { company_name: 'HHH Services, LLC', entity_type: 'Partnership', fiscal_year_end: 'November', state_of_incorporation: 'Utah' }
  const payments = [{ amount: 100000, date: '2026-01-15' }, { amount: 50000, date: '2026-08-15' }]
  const plaid = [
    { amount: 40000, date: '2026-02-01', is_transfer: false, ai_form_1065_line: 'Line 9 - Salaries and wages' },
    { amount: 30000, date: '2026-02-02', is_transfer: false, ai_tax_category: 'Not deductible', plaid_personal_finance_category: 'TRANSFER_OUT' },
    { amount: 400, date: '2026-05-02', is_transfer: false, ai_form_1065_line: 'Line 20 - Meals' },
  ]

  it('names the entity, the fiscal year, and a profit that ignores owner draws', () => {
    const ctx = buildTaxContext({ company, payments, plaidTransactions: plaid, now: sept15 })
    expect(ctx).toMatch(/Entity type: Partnership/)
    expect(ctx).toMatch(/Form 1065/)
    expect(ctx).toMatch(/fiscal year 2025-12-01 to 2026-11-30/)
    expect(ctx).toMatch(/Revenue collected: \$150,000\.00/)
    expect(ctx).toMatch(/Deductible expenses: \$40,400\.00/)
    expect(ctx).toMatch(/Net profit before tax: \$109,600\.00/)
    expect(ctx).toMatch(/NOT an expense[^\n]*\$30,000\.00/)
    expect(ctx).toMatch(/meals: \$400\.00/)
    expect(ctx).toMatch(/self-employment tax = 15\.3%/)
    expect(ctx).toMatch(/Real estate does NOT work that way/)
  })

  it('flags wages that are really unexplained checks, and bank money that is not revenue', () => {
    // HHH: $569k tagged "wages" on the bank feed against $311k of payroll
    // runs, most of it checks and drafts the categoriser guessed at; and
    // $762k of deposits against $537k of recorded customer payments.
    const checks = [
      { id: 1, amount: 18545.96, date: '2026-07-07', is_transfer: false, name: 'Draft Withdrawal Draft #729', ai_form_1065_line: 'Line 9 - Salaries and wages' },
      { id: 2, amount: 8480, date: '2026-04-22', is_transfer: false, name: 'Check # 648', ai_form_1065_line: 'Line 9 - Salaries and wages' },
      { id: 3, amount: 10789.07, date: '2026-01-19', is_transfer: false, name: 'Gusto', merchant_name: 'Gusto', ai_form_1065_line: 'Line 9 - Salaries and wages' },
      { id: 4, amount: -60000, date: '2026-03-01', is_transfer: false, name: 'Loan proceeds', ai_tax_category: 'Income' },
    ]
    const runs = [{ pay_date: '2026-02-20', status: 'completed', total_gross: 10000, employee_count: 5 }]
    const ctx = buildTaxContext({ company, payments: [{ amount: 20000, date: '2026-02-01' }], plaidTransactions: checks, payrollRuns: runs, now: sept15 })
    expect(ctx).toMatch(/\$37,815\.03 tagged as salaries and wages, but completed payroll runs total \$10,000\.00/)
    expect(ctx).toMatch(/\$27,025\.96 of the bank figure is 2 checks and drafts/)
    expect(ctx).toMatch(/\$60,000\.00 came into the bank this tax year against \$20,000\.00/)
    expect(ctx).toMatch(/say the one that matters, in one line/)
  })

  it('stays quiet about the books when there is nothing to flag', () => {
    const ctx = buildTaxContext({ company, payments, plaidTransactions: plaid, now: sept15 })
    expect(ctx).not.toMatch(/What would move these numbers/)
  })

  it('only mentions payroll when it was handed payroll', () => {
    const without = buildTaxContext({ company, payments, plaidTransactions: plaid, now: sept15 })
    expect(without).not.toMatch(/### Payroll/)
    const runs = [{ pay_date: '2026-08-20', status: 'completed', total_gross: 21375.01, employee_count: 25 }]
    const withPayroll = buildTaxContext({ company, payments, plaidTransactions: plaid, payrollRuns: runs, now: sept15 })
    expect(withPayroll).toMatch(/1 completed payroll runs, gross wages \$21,375\.01/)
    expect(payrollSummary(runs, new Date(2025, 11, 1), sept15)).toMatchObject({ runs: 1, avgHeadcount: 25 })
  })

  it('does not print a fiscal-year reference block for a calendar-year company', () => {
    const ctx = buildTaxContext({ company: { entity_type: 'LLC', state: 'CO' }, payments, plaidTransactions: plaid, now: sept15 })
    expect(ctx).toMatch(/2026 calendar year/)
    expect(ctx).not.toMatch(/Calendar year to date \(2026\), for reference/)
    expect(ctx).toMatch(/Files: Schedule C if one owner/)
  })
})
