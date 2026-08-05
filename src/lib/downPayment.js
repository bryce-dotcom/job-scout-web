// Down payment taken on a job.
//
// A rep often leaves a walkthrough with a cheque in hand. There is no invoice
// yet and no reason to raise one, so the money has to be recordable straight
// on the job.
//
// Two kinds, and the difference is INTERNAL ONLY — the customer's invoice
// shows the credit and never says who funded it:
//
//   customer  — the customer handed over cash/cheque/card. Real money in.
//               Reduces what they still owe AND counts as collected revenue.
//
//   jobscout  — JobScout covered it to win the job. It is a DISCOUNT: the
//               customer owes that much less, no money came in, and the cost
//               lands on the job's margin. It must never appear as a
//               receivable, and it must never be counted as revenue —
//               doing either would book money nobody ever paid.
//
// Both reduce the customer's balance by the same amount, which is why they
// look identical on the invoice and must not be treated identically in Books.

export const FUNDED_BY_CUSTOMER = 'customer'
export const FUNDED_BY_JOBSCOUT = 'jobscout'

const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100

/**
 * What a job's down payment does to the numbers.
 *
 * @param job  needs down_payment_amount and down_payment_funded_by
 * @returns {
 *   amount          the down payment
 *   fundedBy        'customer' | 'jobscout'
 *   customerCredit  what to take off the customer's balance (both kinds)
 *   cashReceived    money actually collected (customer only)
 *   marginCost      what it costs JobScout (jobscout only)
 *   isDiscount      true when JobScout funded it
 * }
 */
export function downPaymentEffect(job) {
  const amount = r2(job?.down_payment_amount)
  if (!(amount > 0)) {
    return {
      amount: 0, fundedBy: null, customerCredit: 0,
      cashReceived: 0, marginCost: 0, isDiscount: false,
    }
  }
  // Anything that isn't explicitly jobscout-funded is treated as the customer
  // having paid. A missing flag on a real cheque must not silently become a
  // discount — that would understate revenue.
  const isDiscount = job?.down_payment_funded_by === FUNDED_BY_JOBSCOUT
  return {
    amount,
    fundedBy: isDiscount ? FUNDED_BY_JOBSCOUT : FUNDED_BY_CUSTOMER,
    customerCredit: amount,
    cashReceived: isDiscount ? 0 : amount,
    marginCost: isDiscount ? amount : 0,
    isDiscount,

    // HOW the credit reaches the customer's balance. Exactly one of these is
    // non-zero, because applying both would credit the same money twice.
    //
    //   jobscout — a discount, so it belongs in the invoice's deduction. No
    //              cash exists, so it must never become a payment row or it
    //              would be counted as revenue nobody paid.
    //   customer — real cash, so it belongs in the payments table where
    //              cash-basis revenue is computed. Putting it in the
    //              deduction instead would reduce the balance correctly but
    //              leave the money out of revenue entirely.
    discountCredit: isDiscount ? amount : 0,
    paymentAmount: isDiscount ? 0 : amount,
  }
}

/**
 * What the customer still owes on a job.
 *   project − utility incentive − down payment
 * Never negative: a down payment larger than the balance leaves nothing owing,
 * it does not create a debt back to the customer.
 */
export function customerOutOfPocket({ projectTotal, incentive = 0, job = null } = {}) {
  const dp = downPaymentEffect(job)
  return r2(Math.max(0, r2(projectTotal) - r2(incentive) - dp.customerCredit))
}

/**
 * The label shown to the CUSTOMER. Deliberately identical for both kinds —
 * who funded it is internal and must not leak onto an invoice or proposal.
 */
export function customerFacingLabel() {
  return 'Down payment'
}

/** Internal label, for the job screen and Books only. */
export function internalLabel(job) {
  const dp = downPaymentEffect(job)
  if (!dp.amount) return ''
  return dp.isDiscount ? 'Down payment — covered by JobScout' : 'Down payment — paid by customer'
}
