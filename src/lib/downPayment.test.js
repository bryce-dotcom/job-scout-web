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
