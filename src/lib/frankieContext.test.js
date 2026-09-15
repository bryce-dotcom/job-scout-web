import { describe, it, expect } from 'vitest'
import { bankBalancesSection, categoriesSection, buildFinancialContext, buildSystemPrompt } from '../pages/agents/frankie/frankieContext'

const now = new Date('2026-09-15T20:00:00Z')

describe('what is in the bank', () => {
  // HHH's real shape: a card, a main checking, six employee expense accounts, a savings.
  const accounts = [
    { account_name: 'REWARDS BUSINESS VISA PLATINUM', mask: '0074', account_type: 'credit', account_subtype: 'credit card', current_balance: 5445.33, available_balance: 9543.87, status: 'active', last_synced: '2026-09-15T17:45:00Z' },
    { account_name: 'HHH SERVICES CHE', mask: '3032', account_type: 'depository', account_subtype: 'checking', current_balance: 12000, available_balance: 11250.5, status: 'active', last_synced: '2026-09-15T17:45:00Z' },
    { account_name: 'PRIMARY SAVINGS', mask: '3032', account_type: 'depository', account_subtype: 'savings', current_balance: 1877.93, available_balance: null, status: 'active' },
    { account_name: 'OLD ACCOUNT', account_type: 'depository', current_balance: 99999, status: 'disconnected' },
  ]

  it('totals available cash across bank accounts and keeps cards separate', () => {
    const s = bankBalancesSection(accounts, now)
    expect(s).toMatch(/TOTAL CASH AVAILABLE across bank accounts: \$13,128\.43/)   // 11,250.50 + 1,877.93
    expect(s).toMatch(/credit card: \$5,445\.33 owed, \$9,543\.87 credit available/)
    expect(s).toMatch(/Credit cards: \$5,445\.33 owed, \$9,543\.87 available/)
    expect(s).not.toMatch(/OLD ACCOUNT/)
    expect(s).toMatch(/last bank sync 2 hours ago/)
  })

  it('says plainly when nothing is connected, and forbids inventing a balance', () => {
    const s = bankBalancesSection([], now)
    expect(s).toMatch(/No bank account is connected/)
    expect(s).toMatch(/never derive a balance from revenue minus expenses/)
  })
})

describe('the names Books offers', () => {
  it('lists the tax lines by their dropdown labels and the fixed Other group', () => {
    const s = categoriesSection([{ name: 'Fuel', type: 'expense' }, { name: 'Services', type: 'income' }])
    expect(s).toMatch(/Expense: Fuel/)
    expect(s).toMatch(/Income: Services/)
    expect(s).toMatch(/Other \(every company\): Transfer, Owner Distribution, Owner Contribution, Loan Payment, Tax Payment/)
    expect(s).toMatch(/"Vehicle & Auto Expenses"/)
    expect(s).toMatch(/"Not Deductible \(personal, distributions\)"/)
  })

  it('says so when the company has defined no categories of its own', () => {
    expect(categoriesSection([])).toMatch(/has not set up its own expense categories yet/)
  })
})

describe('the whole context', () => {
  it('puts bank balances near the top and the categories before the tax section', () => {
    const ctx = buildFinancialContext({
      connectedAccounts: [{ account_name: 'Checking', account_type: 'depository', current_balance: 500, available_balance: 500, status: 'active' }],
      payments: [], invoices: [], company: { entity_type: 'LLC' },
    }, now)
    const i = (re) => ctx.search(re)
    expect(i(/### Bank Balances/)).toBeGreaterThan(-1)
    expect(i(/### Bank Balances/)).toBeLessThan(i(/### Revenue/))
    expect(i(/### Categories in Books/)).toBeLessThan(i(/### Company & Tax Profile/))
  })

  it('tells Frankie how to answer "can I afford" and never to invent a balance', () => {
    const p = buildSystemPrompt({ email: 'x@y.z' }, { company_name: 'Co' }, 'admin')
    expect(p).toMatch(/NEVER compute a "bank balance" from revenue minus expenses/)
    expect(p).toMatch(/EXACT names from the "Categories in Books" list/)
    expect(p).toMatch(/rank the jobs by revenue first/)
  })
})
