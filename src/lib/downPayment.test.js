import { describe, it, expect } from 'vitest'
import {
  downPaymentEffect, customerOutOfPocket, customerFacingLabel, internalLabel,
  FUNDED_BY_CUSTOMER, FUNDED_BY_JOBSCOUT,
} from './downPayment'

const customerPaid = { down_payment_amount: 2500, down_payment_funded_by: FUNDED_BY_CUSTOMER }
const jobscoutPaid = { down_payment_amount: 2500, down_payment_funded_by: FUNDED_BY_JOBSCOUT }

describe('the two kinds look the same to the customer', () => {
  it('credits the customer the same either way', () => {
    expect(downPaymentEffect(customerPaid).customerCredit).toBe(2500)
    expect(downPaymentEffect(jobscoutPaid).customerCredit).toBe(2500)
  })

  it('uses one label for both, so the invoice cannot leak who funded it', () => {
    expect(customerFacingLabel()).toBe('Down payment')
  })

  it('distinguishes them internally', () => {
    expect(internalLabel(customerPaid)).toContain('customer')
    expect(internalLabel(jobscoutPaid)).toContain('JobScout')
  })
})

describe('but they are not the same money', () => {
  it('a customer cheque is collected revenue, costing nothing', () => {
    const e = downPaymentEffect(customerPaid)
    expect(e.cashReceived).toBe(2500)
    expect(e.marginCost).toBe(0)
    expect(e.isDiscount).toBe(false)
  })

  it('a JobScout-funded one is a discount — no money in, margin down', () => {
    const e = downPaymentEffect(jobscoutPaid)
    expect(e.cashReceived).toBe(0)      // counting this as revenue books money nobody paid
    expect(e.marginCost).toBe(2500)
    expect(e.isDiscount).toBe(true)
  })
})

describe('the credit reaches the balance exactly once', () => {
  // Applying both a discount AND a payment for the same down payment credits
  // the customer twice. Exactly one route must carry it.
  it('routes a JobScout-funded one through the invoice deduction only', () => {
    const e = downPaymentEffect(jobscoutPaid)
    expect(e.discountCredit).toBe(2500)
    expect(e.paymentAmount).toBe(0)
  })

  it('routes a customer-funded one through payments only', () => {
    // Putting it in the deduction instead would reduce the balance correctly
    // but leave the cash out of revenue entirely.
    const e = downPaymentEffect(customerPaid)
    expect(e.paymentAmount).toBe(2500)
    expect(e.discountCredit).toBe(0)
  })

  it('never has both routes carrying money', () => {
    for (const job of [customerPaid, jobscoutPaid, { down_payment_amount: 900 }]) {
      const e = downPaymentEffect(job)
      expect(Math.min(e.discountCredit, e.paymentAmount)).toBe(0)
      expect(e.discountCredit + e.paymentAmount).toBe(e.customerCredit)
    }
  })
})

describe('a missing flag must not invent a discount', () => {
  it('treats an unflagged down payment as customer-paid', () => {
    // Defaulting the other way would silently understate revenue on every
    // row entered before the flag existed.
    const e = downPaymentEffect({ down_payment_amount: 1000 })
    expect(e.fundedBy).toBe(FUNDED_BY_CUSTOMER)
    expect(e.cashReceived).toBe(1000)
    expect(e.marginCost).toBe(0)
  })
})

describe('what the customer still owes', () => {
  it('subtracts incentive and down payment from the project', () => {
    expect(customerOutOfPocket({
      projectTotal: 20155.60, incentive: 12849.75, job: customerPaid,
    })).toBe(4805.85)   // 20,155.60 − 12,849.75 − 2,500
  })

  it('is the same figure whoever funded the down payment', () => {
    const a = customerOutOfPocket({ projectTotal: 20155.60, incentive: 12849.75, job: customerPaid })
    const b = customerOutOfPocket({ projectTotal: 20155.60, incentive: 12849.75, job: jobscoutPaid })
    expect(a).toBe(b)
  })

  it('floors at zero rather than owing the customer money back', () => {
    expect(customerOutOfPocket({
      projectTotal: 1000, incentive: 0, job: { down_payment_amount: 1500 },
    })).toBe(0)
  })

  it('handles a job with no down payment at all', () => {
    expect(customerOutOfPocket({ projectTotal: 5000, incentive: 1000, job: {} })).toBe(4000)
    expect(customerOutOfPocket({ projectTotal: 5000, incentive: 1000, job: null })).toBe(4000)
  })
})

describe('junk', () => {
  it('ignores zero, negative and non-numeric amounts', () => {
    for (const v of [0, -50, null, undefined, 'abc']) {
      expect(downPaymentEffect({ down_payment_amount: v }).amount).toBe(0)
    }
  })

  it('survives no job', () => {
    expect(downPaymentEffect(null).amount).toBe(0)
    expect(internalLabel(null)).toBe('')
  })
})

describe('a job with no down payment', () => {
  // The job page adds discountCredit to the deposit total when it raises an
  // invoice, and subtracts the previous discountCredit when the down payment
  // is edited. This branch used to leave both keys out, so 0 + undefined was
  // NaN — and NaN reaches PostgREST as null. Every job-page invoice on a job
  // without a down payment was inserted with discount_applied empty: the
  // incentive its own description promised was never deducted (ABC Supply
  // five times over 9/10–9/11; eight invoices 9/4–9/14, each repaired by hand).
  it('answers the routing questions with zero, not undefined', () => {
    for (const job of [{}, null, { down_payment_amount: 0 }, { down_payment_amount: null }]) {
      const e = downPaymentEffect(job)
      expect(e.discountCredit).toBe(0)
      expect(e.paymentAmount).toBe(0)
    }
  })

  it('has exactly the shape of a job that has one', () => {
    expect(Object.keys(downPaymentEffect({})).sort()).toEqual(Object.keys(downPaymentEffect(jobscoutPaid)).sort())
  })

  it('keeps the invoice deduction a number when nothing is down', () => {
    // The job page's arithmetic, verbatim in spirit: rebate + deposits + down payment.
    const totalDiscount = 6528 + 0 + downPaymentEffect({}).discountCredit
    expect(Number.isFinite(totalDiscount)).toBe(true)
    expect(Math.max(0, totalDiscount)).toBe(6528)
  })

  it('moves the credit onto an existing invoice when a down payment is added or removed', () => {
    const none = downPaymentEffect({})
    expect(downPaymentEffect(jobscoutPaid).discountCredit - none.discountCredit).toBe(2500)
    expect(none.discountCredit - downPaymentEffect(jobscoutPaid).discountCredit).toBe(-2500)
  })
})
