import { describe, it, expect } from 'vitest'
import { balanceSheetSection, backlogSection, pipelineSection, operationsSection, bigPictureSections } from '../pages/agents/frankie/frankieBigPicture'

const now = new Date(2026, 9, 11)

describe('the balance sheet Frankie reads', () => {
  it('adds up cash, receivables, debt, payables, payroll tax and bonuses from the app\'s own ledgers', () => {
    const s = balanceSheetSection({
      connectedAccounts: [
        { id: 1, account_type: 'checking', available_balance: 34624.64, status: 'active' },
        { id: 2, account_type: 'credit', current_balance: 6198.42, status: 'active' },
        { id: 3, account_type: 'checking', available_balance: 99999, status: 'disconnected' },
      ],
      invoices: [{ id: 10, amount: 1000, payment_status: 'Pending' }, { id: 11, amount: 500, payment_status: 'Paid' }],
      payments: [{ invoice_id: 10, amount: 250 }],
      utilityInvoices: [{ id: 1, amount: 9188, payment_status: 'Pending' }, { id: 2, amount: 5000, payment_status: 'Paid' }],
      liabilities: [{ name: 'Truck loan', current_balance: 42000, monthly_payment: 850, interest_rate: 7.9, next_payment_due: '2026-11-01', status: 'active' }, { name: 'Old', current_balance: 1, status: 'paid_off' }],
      bills: [{ id: 1, amount: 4000, balance_due: 3000, due_date: '2026-10-01', status: 'Open' }, { id: 2, amount: 100, balance_due: 0, status: 'Paid' }],
      purchaseOrders: [{ status: 'sent', total: 14000 }, { status: 'closed', total: 9 }],
      payrollTaxLiabilities: [{ amount_total: 2200, due_date: '2026-10-15', agency: 'IRS' }, { amount_total: 300, paid_at: '2026-09-01' }],
      jobBonuses: [{ status: 'accrued', amount: 400 }, { status: 'paid', amount: 999 }],
      assets: [{ name: 'Lift', current_value: 12000, status: 'active' }],
      fleet: [{ name: 'TRK-02', purchase_price: 30000, status: 'active' }],
      inventory: [{ product_id: 5, quantity: 10 }],
      products: [{ id: 5, cost: 55 }],
      now,
    })
    expect(s).toMatch(/Cash in bank: \$34,624\.64 across 1 account/)
    expect(s).toMatch(/Customer receivables \(open invoices\): \$750\.00/)
    expect(s).toMatch(/Utility incentives receivable[^:]*: \$9,188\.00/)
    expect(s).toMatch(/Inventory on hand at cost: \$550\.00 \(1 stocked item\)/)
    expect(s).toMatch(/Fixed assets at current value: \$42,000\.00 \(1 asset record \+ 1 fleet unit at purchase price\)/)
    expect(s).toMatch(/Current assets[^:]*: \$45,112\.64/)
    expect(s).toMatch(/Credit cards owed: \$6,198\.42/)
    expect(s).toMatch(/Loans and other debt: \$42,000\.00 on 1 liability; monthly debt service \$850\.00/)
    expect(s).toMatch(/Truck loan: \$42,000\.00 owed, \$850\.00\/mo, 7\.9%, next 2026-11-01/)
    expect(s).toMatch(/Vendor bills open[^:]*: \$3,000\.00 on 1 bill, \$3,000\.00 past due/)
    expect(s).toMatch(/Purchase orders open[^:]*: \$14,000\.00 on 1 PO/)
    expect(s).toMatch(/Payroll taxes not yet remitted: \$2,200\.00 \(next due 2026-10-15: \$2,200\.00 to IRS\)/)
    expect(s).toMatch(/Crew bonuses accrued, unpaid: \$400\.00/)
    // 45,112.64 − (6,198.42 + 42,000 + 3,000 + 14,000 + 2,200 + 400)
    expect(s).toMatch(/Net position[^:]*: \$-22,685\.78/)
    expect(s).toMatch(/Working capital[^:]*: \$33,714\.22/)
  })

  it('says when nothing is connected or recorded instead of printing zeros as facts', () => {
    const s = balanceSheetSection({ now })
    expect(s).toMatch(/Cash in bank: \$0\.00 \(no bank connected\)/)
    expect(s).toMatch(/Loans and other debt: \$0\.00 \(nothing recorded under Liabilities\)/)
  })
})

describe('the backlog waterfall', () => {
  const jobs = [
    { id: 1, job_title: 'Warehouse', status: 'Closed', job_total: 10000, created_at: '2026-03-01T00:00:00Z' },        // delivered, invoiced 10k, collected 6k
    { id: 2, job_title: 'Sign repair', status: 'Verified Complete', job_total: 4000, created_at: '2026-05-01T00:00:00Z' }, // delivered, never invoiced
    { id: 3, job_title: 'Gym', status: 'In Progress', job_total: 20000, created_at: '2026-09-01T00:00:00Z' },
    { id: 4, job_title: 'Office', status: 'Scheduled', job_total: 3000, created_at: '2026-10-01T00:00:00Z' },
    { id: 5, job_title: 'Walked', status: 'Cancelled', job_total: 50000, created_at: '2026-10-02T00:00:00Z' },
    { id: 6, job_title: 'Last year', status: 'Paid', job_total: 7000, created_at: '2025-06-01T00:00:00Z' },               // all-time only; paid straight to the job
  ]
  const invoices = [{ id: 100, job_id: 1, amount: 10000, payment_status: 'Pending' }, { id: 101, job_id: 9, amount: 1, payment_status: 'Void' }]
  const payments = [{ invoice_id: 100, amount: 6000 }, { job_id: 6, amount: 7000 }]

  it('carries sold through delivered, invoiced and collected, and names the gaps', () => {
    const s = backlogSection({ jobs, invoices, payments, now })
    expect(s).toMatch(/This calendar year[\s\S]*Sold: \$37,000\.00 on 4 jobs → delivered \$14,000\.00 \(2 jobs\) → invoiced \$10,000\.00 → collected \$6,000\.00; still owed on those invoices \$4,000\.00/)
    expect(s).toMatch(/Not started: \$3,000\.00 \(1 jobs\); in progress: \$20,000\.00 \(1 jobs\)/)
    expect(s).toMatch(/Delivered but never invoiced in JobScout: \$4,000\.00 on 1 job\n  - Largest: Sign repair \$4,000\.00 \(Verified Complete, 2026-05-01\)/)
    expect(s).toMatch(/Gap between sold and collected: \$31,000\.00 \(16% of sold has been collected\)/)
    expect(s).toMatch(/All time:\n- Sold: \$44,000\.00 on 5 jobs → delivered \$21,000\.00 \(3 jobs\) → invoiced \$10,000\.00 → collected \$13,000\.00/)
    expect(s).not.toMatch(/Walked/)
    expect(backlogSection({ jobs: [], now })).toBe('')
  })
})

describe('the pipeline', () => {
  it('counts estimates by status with dollars, the win rate on decided ones, stale ones, leads and deposits', () => {
    const quotes = [
      { id: 1, quote_id: 'Q-1', status: 'Approved', quote_amount: 12000, created_at: '2026-02-01T00:00:00Z' },
      { id: 2, quote_id: 'Q-2', status: 'Rejected', quote_amount: 3000, created_at: '2026-03-01T00:00:00Z' },
      { id: 3, quote_id: 'Q-3', status: 'Sent', calculated_quote_amount: 8000, created_at: '2026-09-20T00:00:00Z' },   // stale: $5k+, 21 days
      { id: 4, quote_id: 'Q-4', status: 'Sent', quote_amount: 900, created_at: '2026-10-09T00:00:00Z' },                // fresh, small
      { id: 5, quote_id: 'Q-5', status: 'Negotiation', quote_amount: 6000, created_at: '2025-12-01T00:00:00Z' },       // last year, open, stale
      { id: 6, quote_id: 'Q-6', status: 'Draft', quote_amount: 100, created_at: '2026-10-01T00:00:00Z' },
    ]
    const leads = [{ status: 'New', created_at: '2026-10-01' }, { status: 'New', created_at: '2026-01-01' }, { status: 'Lost', created_at: '2026-01-02' }]
    const leadPayments = [{ amount: 500, date_created: '2026-04-01' }, { amount: 50, date_created: '2025-04-01' }]
    const s = pipelineSection({ quotes, leads, leadPayments, now })
    expect(s).toMatch(/Estimates this calendar year: Approved 1 \(\$12,000\.00\), Sent 2 \(\$8,900\.00\), Rejected 1 \(\$3,000\.00\), Draft 1 \(\$100\.00\)/)
    expect(s).toMatch(/Win rate this year, decided estimates only: 50% \(1 approved of 2 decided; \$12,000\.00 approved\); 2 still out unanswered/)
    expect(s).toMatch(/Open estimates \(Sent or Negotiation, any date\): 3 worth \$14,900\.00/)
    expect(s).toMatch(/Stale estimates[^:]*: 2 worth \$14,000\.00; largest: Q-3 \$8,000\.00 \(21 days\); Q-5 \$6,000\.00 \(314 days\)/)
    expect(s).toMatch(/Leads: 3 total; by status: New 2, Lost 1; 1 new in the last 30 days/)
    expect(s).toMatch(/Lead and job deposits this year: \$500\.00 on 1 deposit/)
    expect(pipelineSection({ now })).toBe('')
  })
})

describe('operations', () => {
  it('reports fleet, inventory, crew hours and bonuses', () => {
    const s = operationsSection({
      fleet: [{ name: 'TRK-01', status: 'active', next_pm_due: '2026-09-01' }, { name: 'TRK-02', status: 'active', next_pm_due: '2027-01-01', repair_cost: 920 }],
      fleetMaintenance: [{ date: '2026-08-01', cost: 300 }, { date: '2024-01-01', cost: 9999 }],
      inventory: [{ name: 'T8 lamps', quantity: 2, min_quantity: 10 }, { name: 'Hangers', quantity: 50, min_quantity: 10 }],
      timeLogs: [{ employee_id: 1, job_id: 7, clock_in: '2026-10-01T08:00:00Z', total_hours: 8 }, { employee_id: 1, clock_in: '2026-10-02T08:00:00Z', total_hours: 2 }, { employee_id: 1, job_id: 7, clock_in: '2026-01-02T08:00:00Z', total_hours: 40 }],
      employees: [{ id: 1, hourly_rate: 25 }],
      jobBonuses: [{ status: 'accrued', amount: 150 }, { status: 'paid', amount: 200, paid_at: '2026-03-01' }, { status: 'paid', amount: 999, paid_at: '2025-03-01' }],
      now,
    })
    expect(s).toMatch(/Fleet: 2 units; 1 overdue for maintenance \(TRK-01\); maintenance logged last 12 months \$300\.00 on 1 job; open repair cost on units \$920\.00/)
    expect(s).toMatch(/Inventory: 2 items tracked, 1 below minimum \(T8 lamps\)/)
    expect(s).toMatch(/Crew hours, last 30 days: 10\.0 h punched, 8\.0 h on a job \(80%\); labor at hourly rates \$250\.00/)
    expect(s).toMatch(/Crew efficiency bonuses: \$150\.00 accrued on 1 job, \$200\.00 paid this year/)
    expect(operationsSection({ now })).toBe('')
  })
})

describe('all together', () => {
  it('runs the four sections in a CFO\'s order', () => {
    const s = bigPictureSections({ jobs: [{ id: 1, status: 'Closed', job_total: 5, created_at: '2026-01-01T00:00:00Z' }], quotes: [{ status: 'Sent', quote_amount: 1, created_at: '2026-01-01' }], fleet: [{ name: 'x', status: 'active' }] }, now)
    const order = ['### Balance Sheet', '### Backlog', '### Pipeline', '### Operations'].map(h => s.indexOf(h))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
