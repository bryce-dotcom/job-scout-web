import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const chatTs = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')

// Asked "how many overdue invoices do we have right now, and what is the
// total?", Arnie called query_invoices WITHOUT status='overdue', got the five
// unpaid invoices back and described all five as overdue — $21,790 when only
// $16,050 was actually past due. Nothing was invented: the invoices, the
// amounts and the dates were all real. Only the label was wrong.
//
// The filter that would have been right existed. Nothing made the model pass
// it, and a row reading `payment_status: "Pending"` gives it nothing to argue
// with. So the row now carries the verdict and the aggregate carries the
// count, and being asked the question the lazy way still answers it right.

/** The shipped overdue predicate, lifted out of the edge function and run. */
function shippedPredicate() {
  const m = chatTs.match(/r\.overdue = ([\s\S]*?)\n {6}\}/)
  if (!m) throw new Error('query_invoices no longer flags rows with r.overdue = ...')
  // eslint-disable-next-line no-new-func
  return new Function('r', 'asOf', `return (${m[1].trim()})`)
}

const invoicesBranch = () => {
  const start = chatTs.indexOf("if (name === 'query_invoices')")
  const end = chatTs.indexOf("if (name === 'query_jobs')")
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return chatTs.slice(start, end)
}

describe('a query_invoices row says for itself whether it is overdue', () => {
  const isOverdue = shippedPredicate()
  const asOf = '2026-08-31'

  it('flags an unpaid invoice past its due date', () => {
    expect(isOverdue({ payment_status: 'Pending', due_date: '2026-08-19' }, asOf)).toBe(true)
  })

  it('flags a part-paid invoice past its due date — unpaid is anything but Paid', () => {
    expect(isOverdue({ payment_status: 'Partially Paid', due_date: '2026-08-25' }, asOf)).toBe(true)
  })

  it('does not flag an unpaid invoice that is not due yet', () => {
    // The three September invoices that got mislabelled.
    expect(isOverdue({ payment_status: 'Pending', due_date: '2026-09-17' }, asOf)).toBe(false)
    expect(isOverdue({ payment_status: 'Pending', due_date: '2026-09-01' }, asOf)).toBe(false)
  })

  it('does not flag an invoice due today', () => {
    expect(isOverdue({ payment_status: 'Pending', due_date: asOf }, asOf)).toBe(false)
  })

  it('does not flag a paid invoice, however old', () => {
    expect(isOverdue({ payment_status: 'Paid', due_date: '2026-07-30' }, asOf)).toBe(false)
  })

  it('does not flag a row with no due date — undated is not overdue', () => {
    expect(isOverdue({ payment_status: 'Pending', due_date: null }, asOf)).toBeFalsy()
    expect(isOverdue({ payment_status: 'Pending' }, asOf)).toBeFalsy()
  })

  it('reads a timestamp due_date by its date part', () => {
    expect(isOverdue({ payment_status: 'Pending', due_date: '2026-08-19T00:00:00+00:00' }, asOf)).toBe(true)
  })

  it('counts the demo tenant the way the invoices actually stand', () => {
    // Company 25 on 2026-08-31, zero-dollar rows excluded.
    const rows = [
      { payment_status: 'Paid', due_date: '2026-07-30', amount: 24800 },
      { payment_status: 'Paid', due_date: '2026-08-06', amount: 11400 },
      { payment_status: 'Partially Paid', due_date: '2026-08-13', amount: 18650 },
      { payment_status: 'Paid', due_date: '2026-08-18', amount: 4200 },
      { payment_status: 'Pending', due_date: '2026-08-19', amount: 9750 },
      { payment_status: 'Pending', due_date: '2026-08-28', amount: 6300 },
      { payment_status: 'Paid', due_date: '2026-08-29', amount: 420 },
      { payment_status: 'Paid', due_date: '2026-08-30', amount: 185 },
      { payment_status: 'Pending', due_date: '2026-09-17', amount: 3850 },
      { payment_status: 'Pending', due_date: '2026-09-18', amount: 1650 },
      { payment_status: 'Pending', due_date: '2026-09-01', amount: 240 },
      { payment_status: 'Partially Paid', due_date: '2026-08-25', amount: 2400 },
    ]
    const pending = rows.filter(r => r.payment_status === 'Pending')
    // The five rows Arnie was holding when it said "$21,790 overdue".
    expect(pending.reduce((s, r) => s + r.amount, 0)).toBe(21790)
    const overdue = pending.filter(r => isOverdue(r, asOf))
    expect(overdue).toHaveLength(2)
    expect(overdue.reduce((s, r) => s + r.amount, 0)).toBe(16050)
  })
})

describe('the aggregate cannot be read as an overdue total by accident', () => {
  it('selects due_date, without which no row could be judged', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/params\.set\('select', '[^']*due_date/)
  })

  it('dates the answer with as_of', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/const asOf = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
    expect(branch).toMatch(/agg\.as_of = asOf/)
  })

  it('carries overdue_count and overdue_total_amount alongside count', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/agg\.overdue_count = overdue\.length/)
    expect(branch).toMatch(/agg\.overdue_total_amount =/)
  })

  it('says in scope when the caller did not ask for overdue', () => {
    const branch = invoicesBranch()
    expect(branch).toMatch(/if \(!askedOverdue\) \{/)
    expect(branch).toMatch(/NOT filtered to overdue/)
    expect(branch).toMatch(/agg\.scope = notes\.join/)
  })

  it('tells the model in the tool description that unpaid is not overdue', () => {
    const desc = chatTs.match(/name: 'query_invoices',\n\s*description: '([^']*(?:\'[^']*)*)'/)
    expect(desc, 'query_invoices description not found').toBeTruthy()
    expect(desc[1]).toMatch(/overdue/i)
    expect(desc[1]).toContain('overdue_total_amount')
  })
})
