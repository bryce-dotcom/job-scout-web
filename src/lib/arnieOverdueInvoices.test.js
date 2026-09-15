import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETTLED_STATUSES, isSettledStatus, isInvoiceOverdue, invoiceOutstanding,
} from '../../supabase/functions/_shared/money.ts'

const here = dirname(fileURLToPath(import.meta.url))
// Normalised to LF on read. Git checks this repo out with CRLF on Windows,
// and the assertions below match on the shape of the source — one of them
// anchors on a newline followed by the description key, which a carriage
// return silently defeats. The test then fails for a line ending rather than
// for anything to do with invoices, which is a false alarm that costs more
// than it catches.
const chatTs = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')
  .replace(/\r\n/g, '\n')

// Asked "how many overdue invoices do we have right now, and what is the
// total?", Arnie called query_invoices WITHOUT status='overdue', got the five
// unpaid invoices back and described all five as overdue — $21,790 when only
// two were actually past due. Nothing was invented: the invoices, the amounts
// and the dates were all real. Only the label was wrong.
//
// The filter that would have been right existed. Nothing made the model pass
// it, and a row reading `payment_status: "Pending"` gives it nothing to argue
// with. So the row now carries the verdict and the aggregate carries the
// count, and being asked the question the lazy way still answers it right.
//
// Then the filter itself turned out to be the wrong SET: it meant Pending, and
// an invoice that is part-paid and past its due date is money owed, past the
// date, and was missing from the answer entirely. Widening it to "not settled"
// brings those in — and makes `amount` the wrong number to total, because part
// of it is already collected.

const asOf = '2026-09-01'

// Every test below reads the edge function as TEXT, so an apostrophe inside a
// single-quoted tool description reads perfectly well here and fails only at
// deploy ("Expected ',', got 's'") — which is what happened. guard runs eslint
// on JS and never parses the TS. Parse it.
it('arnie-chat/index.ts parses as TypeScript', async () => {
  const { transformSync } = await import('esbuild')
  expect(() => transformSync(chatTs, { loader: 'ts', logLevel: 'silent' })).not.toThrow()
})

const invoicesBranch = () => {
  const start = chatTs.indexOf("if (name === 'query_invoices')")
  const end = chatTs.indexOf("if (name === 'query_jobs')")
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return chatTs.slice(start, end)
}

describe('an invoice row says for itself whether it is overdue', () => {
  it('flags an unpaid invoice past its due date', () => {
    expect(isInvoiceOverdue({ payment_status: 'Pending', due_date: '2026-08-19' }, asOf)).toBe(true)
  })

  it('flags a PART-PAID invoice past its due date — the set the old filter missed', () => {
    expect(isInvoiceOverdue({ payment_status: 'Partially Paid', due_date: '2026-08-25' }, asOf)).toBe(true)
  })

  it('does not flag an unpaid invoice that is not due yet', () => {
    expect(isInvoiceOverdue({ payment_status: 'Pending', due_date: '2026-09-17' }, asOf)).toBe(false)
  })

  it('does not flag an invoice due today', () => {
    expect(isInvoiceOverdue({ payment_status: 'Pending', due_date: asOf }, asOf)).toBe(false)
  })

  it('does not flag a settled invoice, however old', () => {
    for (const status of SETTLED_STATUSES) {
      expect(isInvoiceOverdue({ payment_status: status, due_date: '2026-07-30' }, asOf), status).toBe(false)
    }
  })

  it('does not flag a row with no due date — undated is not infinitely late', () => {
    expect(isInvoiceOverdue({ payment_status: 'Pending', due_date: null }, asOf)).toBe(false)
    expect(isInvoiceOverdue({ payment_status: 'Pending' }, asOf)).toBe(false)
  })

  it('reads a timestamp due_date by its date part', () => {
    expect(isInvoiceOverdue({ payment_status: 'Pending', due_date: '2026-08-19T00:00:00+00:00' }, asOf)).toBe(true)
  })

  it('matches a status whatever its casing or padding', () => {
    expect(isSettledStatus(' paid ')).toBe(true)
    expect(isSettledStatus('PAID')).toBe(true)
    expect(isSettledStatus('Partially Paid')).toBe(false)
    expect(isSettledStatus(null)).toBe(false)
  })
})

describe('an overdue total is what is OWED, not what was invoiced', () => {
  it('subtracts the payments already applied', () => {
    // Demo invoice 32769: $18,650 invoiced, half of it collected.
    expect(invoiceOutstanding(18650, 0, 9325)).toBe(9325)
  })

  it('nets out the incentive / deposit credit before the payments', () => {
    // Modern shape: amount is gross, discount_applied is the utility incentive.
    expect(invoiceOutstanding(32143.06, 30000, 0)).toBeCloseTo(2143.06, 2)
  })

  it('owes nothing when the deductions cover the whole project', () => {
    expect(invoiceOutstanding(14162.93, 14162.93, 0)).toBe(0)
  })

  it('leaves a legacy net-shape invoice alone', () => {
    // amount is already NET; the larger discount is informational only.
    expect(invoiceOutstanding(5000, 9000, 0)).toBe(5000)
  })

  it('never goes negative on an overpayment', () => {
    expect(invoiceOutstanding(1000, 0, 1200)).toBe(0)
  })
})

describe('the demo tenant, counted the way the invoices actually stand', () => {
  // Company 25 on 2026-09-01, zero-dollar rows excluded. `paid` is the sum of
  // the payments rows applied to that invoice.
  const rows = [
    { id: 32767, payment_status: 'Paid', due_date: '2026-07-30', amount: 24800, paid: 24800 },
    { id: 32768, payment_status: 'Paid', due_date: '2026-08-06', amount: 11400, paid: 11400 },
    { id: 32769, payment_status: 'Partially Paid', due_date: '2026-08-13', amount: 18650, paid: 9325 },
    { id: 32770, payment_status: 'Paid', due_date: '2026-08-18', amount: 4200, paid: 4200 },
    { id: 32771, payment_status: 'Pending', due_date: '2026-08-19', amount: 9750, paid: 0 },
    { id: 32772, payment_status: 'Pending', due_date: '2026-08-28', amount: 6300, paid: 0 },
    { id: 32773, payment_status: 'Paid', due_date: '2026-08-29', amount: 420, paid: 420 },
    { id: 32774, payment_status: 'Paid', due_date: '2026-08-30', amount: 185, paid: 185 },
    { id: 32775, payment_status: 'Pending', due_date: '2026-09-17', amount: 3850, paid: 0 },
    { id: 32776, payment_status: 'Pending', due_date: '2026-09-18', amount: 1650, paid: 0 },
    { id: 32777, payment_status: 'Pending', due_date: '2026-09-01', amount: 240, paid: 0 },
    { id: 32778, payment_status: 'Partially Paid', due_date: '2026-08-25', amount: 2400, paid: 1200 },
  ]
  const overdue = rows.filter(r => isInvoiceOverdue(r, asOf))

  it('counts the two part-paid invoices the Pending-only filter dropped', () => {
    expect(overdue.map(r => r.id)).toEqual([32769, 32771, 32772, 32778])
  })

  it('totals what is owed, not what was invoiced', () => {
    const invoiced = overdue.reduce((s, r) => s + r.amount, 0)
    const owed = overdue.reduce((s, r) => s + invoiceOutstanding(r.amount, 0, r.paid), 0)
    expect(invoiced).toBe(37100)
    expect(owed).toBe(26575)
    // This gap is the whole reason the payments read exists. Reporting the
    // invoiced figure as the overdue total bills $10,525 already banked.
    expect(invoiced - owed).toBe(10525)
  })

  it('still leaves the three September invoices out', () => {
    expect(rows.filter(r => !isInvoiceOverdue(r, asOf) && r.payment_status === 'Pending'))
      .toHaveLength(3)
  })
})

describe('the aggregate cannot be read as an overdue total by accident', () => {
  it('filters overdue on "not settled", not on one status', () => {
    const branch = invoicesBranch()
    expect(branch).toContain('not.in.(${SETTLED_STATUSES')
    expect(branch).toContain("params.append('due_date', `lt.${asOf}`)")
    // The old mapping is what dropped the part-paid rows. It must not return.
    expect(branch).not.toMatch(/overdue: 'Pending'/)
  })

  it('judges rows with the shared rule instead of re-deriving it', () => {
    expect(invoicesBranch()).toMatch(/r\.overdue = isInvoiceOverdue\(r, asOf\)/)
    expect(chatTs).toMatch(/import \{[^}]*isInvoiceOverdue[^}]*\} from '\.\.\/_shared\/money\.ts'/)
  })

  it('selects due_date, without which no row could be judged', () => {
    expect(invoicesBranch()).toMatch(/params\.set\('select', '[^']*due_date/)
  })

  it('selects discount_applied, without which every balance would be gross', () => {
    expect(invoicesBranch()).toMatch(/params\.set\('select', '[\s\S]{0,400}discount_applied/)
  })

  it('dates the answer with as_of', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/const asOf = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
    expect(branch).toMatch(/agg\.as_of = asOf/)
  })

  it('carries overdue_count and overdue_total_owed alongside count', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/agg\.overdue_count = overdue\.length/)
    expect(branch).toMatch(/agg\.overdue_total_owed =/)
    // Summed from the per-row balance, never from `amount`.
    expect(branch).toMatch(/parseFloat\(r\.balance\)/)
  })

  it('reads payments so the balance is real, and says so when it could not', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/sb\('payments'\)/)
    expect(branch).toMatch(/balancesApplied/)
    expect(branch).toContain('UPPER BOUND')
  })

  it('says in scope when the caller did not ask for overdue', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/if \(!askedOverdue\) \{/)
    expect(branch).toContain('NOT filtered to overdue')
    expect(branch).toMatch(/agg\.scope = notes\.join/)
  })

  it('tells the model in the tool description that unpaid is not overdue', () => {
    const desc = chatTs.match(/name: 'query_invoices',\n\s*description: '([^']*(?:\\'[^']*)*)'/)
    expect(desc, 'query_invoices description not found').toBeTruthy()
    expect(desc[1]).toContain('overdue_total_owed')
    expect(desc[1]).toContain('STILL OWED')
  })
})

// Three more gaps, found by running an AR conversation against the deployed
// function on 2026-09-15 and checking every figure against the database:
//
//   "Which invoices come due in the next 7 days?"  → "none", 3 of 3 tries.
//   There were two. start_date/end_date were undocumented and filtered
//   created_at, so the model windowed the DUE date on the CREATED date.
//
//   "Total accounts receivable?"  → $27,265. It was $32,315. `balance` was
//   only worked out for overdue rows, so the model added overdue balances
//   to not-yet-due amounts by hand, and got it wrong.
//
//   "Which customer owes us the most?"  → "customer ID 7944". The invoice
//   carries an id, the description said to look it up with query_customers,
//   and query_customers had no way to look up an id.

describe('a due-date window is a due-date window', () => {
  it('offers due_from / due_to and filters due_date with them', () => {
    const branch = invoicesBranch()
    expect(branch).toContain("params.append('due_date', `gte.${input.due_from}`)")
    expect(branch).toContain("params.append('due_date', `lte.${input.due_to}`)")
    expect(chatTs).toMatch(/due_from: \{ type: 'string', description: '[^']*DUE/)
    expect(chatTs).toMatch(/due_to: \{ type: 'string', description: '[^']*DUE/)
  })

  it('says what start_date / end_date actually window on', () => {
    // These filter created_at. Undescribed, they read as "the date".
    const params = chatTs.slice(chatTs.indexOf("name: 'query_invoices'"), chatTs.indexOf("name: 'query_jobs'"))
    expect(params).toMatch(/start_date: \{ type: 'string', description: '[^']*CREATED/)
    expect(params).toMatch(/end_date: \{ type: 'string', description: '[^']*CREATED/)
    expect(invoicesBranch()).toContain('Windowed on created_at')
    expect(invoicesBranch()).toContain('Windowed on due_date')
  })
})

describe('the receivable is totalled by the tool, not by the model', () => {
  it('works out a balance for every open row, not only the overdue ones', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/const open = got\.rows\.filter\(\(r: any\) => !isSettledStatus\(r\.payment_status\)\)/)
    expect(branch).toMatch(/const overdue = open\.filter/)
    expect(branch).toMatch(/for \(const r of got\.rows\) \{\s*\n\s*r\.balance = isSettledStatus/)
  })

  it('carries open_count and open_total_owed beside the overdue pair', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/agg\.open_count = open\.length/)
    expect(branch).toMatch(/agg\.open_total_owed = owed\(open\)/)
    expect(branch).toMatch(/agg\.overdue_total_owed = owed\(overdue\)/)
  })

  it('sums balance per customer group so who-owes-most is a lookup', () => {
    expect(invoicesBranch()).toMatch(/aggregate\(got, input\.group_by, \['amount', 'balance'\]\)/)
  })

  it('demo tenant: open is not overdue, and neither is a sum of amounts', () => {
    const rows = [
      { payment_status: 'Partially Paid', due_date: '2026-08-13', amount: 18650, paid: 9325 },
      { payment_status: 'Pending', due_date: '2026-08-19', amount: 9750, paid: 0 },
      { payment_status: 'Pending', due_date: '2026-08-28', amount: 6300, paid: 0 },
      { payment_status: 'Pending', due_date: '2026-09-17', amount: 3850, paid: 0 },
      { payment_status: 'Pending', due_date: '2026-09-18', amount: 1650, paid: 0 },
      { payment_status: 'Pending', due_date: '2026-09-01', amount: 240, paid: 0 },
      { payment_status: 'Partially Paid', due_date: '2026-08-25', amount: 2400, paid: 1200 },
      { payment_status: 'Paid', due_date: '2026-07-30', amount: 24800, paid: 24800 },
    ]
    const today = '2026-09-15'
    const open = rows.filter(r => !isSettledStatus(r.payment_status))
    const overdue = open.filter(r => isInvoiceOverdue(r, today))
    const owed = rs => rs.reduce((s, r) => s + invoiceOutstanding(r.amount, 0, r.paid), 0)
    expect(open).toHaveLength(7)
    expect(overdue).toHaveLength(5)
    expect(owed(overdue)).toBe(26815)
    expect(owed(open)).toBe(32315)
    // What Arnie said on 2026-09-15, and what summing `amount` would say.
    expect(owed(open)).not.toBe(27265)
    expect(open.reduce((s, r) => s + r.amount, 0)).toBe(42840)
  })
})

describe('a customer id can be turned into a name', () => {
  it('query_invoices puts customer_name on every row', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/sb\('customers'\)/)
    expect(branch).toMatch(/r\.customer_name = nameById\.get\(r\.customer_id\)/)
    const desc = chatTs.match(/name: 'query_invoices',\n\s*description: '([^']*(?:\\'[^']*)*)'/)
    expect(desc[1]).toContain('`customer_name`')
    // The old advice — go and look it up — pointed at a tool that could not.
    expect(desc[1]).not.toContain('look it up with query_customers')
  })

  it('query_customers accepts ids', () => {
    const def = chatTs.slice(chatTs.indexOf("name: 'query_customers'"), chatTs.indexOf("name: 'query_employees'"))
    expect(def).toMatch(/ids: \{ type: 'array', items: \{ type: 'integer' \}/)
    const branch = chatTs.slice(chatTs.indexOf("if (name === 'query_customers')"), chatTs.indexOf("if (name === 'query_employees')"))
    expect(branch).toContain("params.append('id', `in.(${ids.join(',')})`)")
    // Non-numeric junk is dropped before it reaches PostgREST, and the list is capped.
    expect(branch).toMatch(/input\.ids\.map\(Number\)\.filter\(Number\.isFinite\)\.slice\(0, 200\)/)
  })
})
