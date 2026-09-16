import { describe, it, expect } from 'vitest'
import { bankBalancesSection, categoriesSection, jobProfitabilitySection, buildFinancialContext, buildSystemPrompt, roleForPrompt } from '../pages/agents/frankie/frankieContext'

describe('who Frankie thinks he is talking to', () => {
  it('reads the owner as full access, the way the rest of the app does', () => {
    // Bryce's real row: job title "Owner", is_developer true. He was being
    // introduced as a basic user and told payroll was above his clearance.
    expect(roleForPrompt({ role: 'Owner', is_developer: true })).toBe('developer')
    expect(roleForPrompt({ role: 'Owner' })).toBe('super_admin')
    expect(roleForPrompt({ role: 'Field Tech', user_role: 'Manager' })).toBe('manager')
    expect(roleForPrompt({ role: 'Field Tech' })).toBe('user')
    expect(roleForPrompt(null)).toBe('user')
  })

  it('gives the owner the full-access line and not the clearance refusal', () => {
    const p = buildSystemPrompt({ email: 'bryce@x' }, { company_name: 'HHH' }, roleForPrompt({ role: 'Owner', is_developer: true }))
    expect(p).toMatch(/Full financial access/)
    expect(p).not.toMatch(/above my clearance/)
    const q = buildSystemPrompt({ email: 't@x' }, { company_name: 'HHH' }, roleForPrompt({ role: 'Field Tech' }))
    expect(q).toMatch(/above my clearance/)
  })
})

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

describe('what the jobs made', () => {
  // The Job Costing report's math: a bundle line whose cost lives in its
  // components, a payment tagged to the job, and one job with no costs.
  const jobs = [
    { id: 1, job_id: 'J-1', job_title: 'Gym retrofit', status: 'Completed', assigned_team: 'Derrick' },
    { id: 2, job_id: 'J-2', job_title: 'Sign repair', status: 'Completed' },
  ]
  const data = {
    payments: [{ job_id: 1, amount: 10000, date: '2026-08-01' }, { job_id: 2, amount: 680, date: '2026-08-02' }],
    jobLines: [{ job_id: 1, item_id: 100, quantity: 10, labor_cost: 0 }],
    products: [
      { id: 100, cost: 0 },                                  // the bundle
      { id: 101, cost: 300, material_or_labor: 'material' }, // fixture
      { id: 102, cost: 150, material_or_labor: 'labor' },    // install
    ],
    productComponents: [
      { parent_product_id: 100, component_product_id: 101, quantity: 1 },
      { parent_product_id: 100, component_product_id: 102, quantity: 1 },
    ],
    plaidTransactions: [{ amount: 500, date: '2026-08-03', is_transfer: false, job_id: 1 }],
  }

  it('reports profit from the same numbers the jobs page shows', () => {
    const s = jobProfitabilitySection({ jobs, completedJobs: jobs, data, now })
    // 10 × (300 + 150) = 4,500 in lines, plus $500 tagged: cost 5,000 on 10,000 revenue.
    expect(s).toMatch(/with cost captured: 1/)
    expect(s).toMatch(/revenue \$10,000\.00, cost \$5,000\.00, profit \$5,000\.00, margin 50\.0%/)
    expect(s).toMatch(/1 job\(s\) have revenue but no cost captured/)
    expect(s).not.toMatch(/J-2[^\n]*100%/)   // the uncosted job is never shown as pure profit
  })

  it('does not call an uncosted tenant a 100% margin business', () => {
    const s = jobProfitabilitySection({ jobs, completedJobs: jobs, data: { payments: data.payments }, now })
    expect(s).toMatch(/No job has cost captured yet: rank by revenue/)
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

  it('tells Frankie he has lookup tools and when to reach for them', () => {
    const p = buildSystemPrompt({ email: 'x@y.z' }, { company_name: 'Co' }, 'admin')
    expect(p).toMatch(/## Your Tools/)
    expect(p).toMatch(/without asking permission/)
    expect(p).toMatch(/If a tool says restricted, say who can see it and stop/)
  })
})
