// Guards for the two ways a rebate invoice went wrong on ABC Supply
// (Alayda, 2026-09-11):
//
//   1. A line added on the job page was frozen as in-scope regardless of
//      the product, so the $500 extended warranty printed on the page that
//      goes to the utility and there was no page two.
//   2. An invoice raised without the job's utility incentive billed the
//      customer the full project while the utility was also down for its
//      share.
//
// Both rules live in inline inserts on pages, where no unit can exercise
// them, so these read the page source. A regression fails here instead of
// on a customer's invoice.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// Every job_lines insert on the job page that references a product must
// decide the line's scope from that product, never leave it to the column
// default (true).
describe('job page: a line takes its utility scope from the product', () => {
  const page = src('../pages/JobDetail.jsx')
  const inserts = [...page.matchAll(/from\('job_lines'\)\s*\.insert\(\[\{([\s\S]*?)\}\]\)/g)].map((m) => m[1])

  it('finds the inserts it is guarding', () => {
    expect(inserts.length).toBeGreaterThanOrEqual(3)
  })

  it('every insert carrying a product sets in_utility_scope from it', () => {
    const withProduct = inserts.filter((body) => /\bitem_id:/.test(body))
    expect(withProduct.length).toBeGreaterThanOrEqual(2)
    for (const body of withProduct) {
      expect(body, body.slice(0, 120)).toMatch(/in_utility_scope:\s*\w+(\.\w+)*\.in_utility_scope !== false/)
    }
  })
})

// Every path that raises a customer invoice for a job must either credit the
// job's utility incentive or refuse to proceed when there is one.
describe('an invoice raised for a job with a utility incentive credits it', () => {
  it('the job board auto-invoice credits the incentive', () => {
    const page = src('../pages/PMJobSetter.jsx')
    const block = page.slice(page.indexOf('// Auto-create invoice when job is marked Completed'), page.indexOf("console.log('[AutoInvoice] Created invoice'"))
    expect(block).toMatch(/utility_incentive/)
    expect(block).toMatch(/discount_applied:\s*jobIncentive > 0 \? jobIncentive : null/)
  })

  it('FieldScout credits the incentive', () => {
    const page = src('../pages/FieldScout.jsx')
    expect(page).toMatch(/discount_applied:\s*jobIncentive > 0 \? jobIncentive : null/)
  })

  it('the Invoices page refuses to raise one by hand and points at the job page', () => {
    const page = src('../pages/Invoices.jsx')
    const handler = page.slice(page.indexOf('const handleCreateInvoice'), page.indexOf("from('invoices')", page.indexOf('const handleCreateInvoice')))
    expect(handler).toMatch(/utility_incentive/)
    expect(handler).toMatch(/Create the invoice from the job page/)
  })
})
