// Default legal terms template for the Formal Proposal.
// Sales reps can edit per estimate — this is just the starting point.
// Placeholders are replaced at render time by buildDefaultTerms().

const DEFAULT_LEGAL_TEMPLATE = `# Proposal Agreement

This Proposal Agreement ("Agreement") is entered into as of the signing date below by and between **{{company_name}}** ("Contractor") and **{{customer_name}}** ("Client") for the work described herein.

## 1. Scope of Work

Contractor agrees to furnish all labor, materials, equipment, and services necessary to perform the work described as follows:

{{scope_of_work}}

## 2. Contract Price

The total price for the work described above is **{{total_price}}**. This price includes all applicable materials and labor unless otherwise noted.

## 3. Payment Terms

Client agrees to pay Contractor as follows:

- **{{down_payment_label}}: {{down_payment_amount}}** due upon execution of this Agreement.
- The remaining balance is due upon substantial completion of the work, unless another schedule is separately agreed to in writing.

All amounts are stated in U.S. dollars. Payments not received within ten (10) days of the due date may accrue interest at the lesser of 1.5% per month or the maximum rate permitted by law.

## 4. Changes to the Work

Any changes, additions, or deletions to the scope of work must be authorized in writing and may result in an adjustment to the contract price and/or schedule. Verbal change orders are not binding.

## 5. Warranty

Contractor warrants that all work will be performed in a good and workmanlike manner and in accordance with generally accepted industry standards. Contractor further warrants workmanship for a period of **twelve (12) months** from substantial completion. Manufacturer warranties on materials and equipment pass through to Client as provided by the manufacturer.

## 6. Insurance

Contractor shall maintain commercial general liability and workers' compensation insurance as required by law throughout the performance of the work.

## 7. Delays; Force Majeure

Contractor shall not be liable for any delay or failure to perform caused by events beyond its reasonable control, including but not limited to weather, labor disputes, material shortages, utility outages, acts of government, or acts of God.

## 8. Termination

Either party may terminate this Agreement upon written notice for material breach by the other party that remains uncured for ten (10) days following written notice of such breach. In the event of termination, Client shall pay Contractor for all work performed and materials ordered through the effective date of termination.

## 9. Limitation of Liability

To the maximum extent permitted by law, Contractor's total liability to Client under this Agreement shall not exceed the total contract price. Contractor shall not be liable for any indirect, incidental, consequential, or punitive damages.

## 10. Dispute Resolution

The parties agree to attempt in good faith to resolve any dispute arising under this Agreement through direct negotiation. Any dispute that cannot be resolved through negotiation shall be submitted to binding arbitration in accordance with the rules of the American Arbitration Association, with venue in the state in which the work is performed. This Agreement shall be governed by the laws of that state.

## 11. Entire Agreement

This Agreement, together with any attachments or addenda expressly incorporated by reference, constitutes the entire agreement between the parties regarding the subject matter hereof and supersedes all prior oral or written communications. This Agreement may be modified only by a writing signed by both parties.

## 12. Electronic Signature

The parties agree that this Agreement may be executed by electronic signature and that such signature shall have the same force and effect as an original handwritten signature in accordance with the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and applicable state law.

---

*By signing below, Client acknowledges having read, understood, and agreed to each of the terms set forth above, and authorizes Contractor to proceed with the work as described.*
`

function formatCurrency(value) {
  const n = parseFloat(value) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function buildScopeFromLineItems(lineItems = [], summary = '') {
  const lines = []
  if (summary && summary.trim()) {
    lines.push(summary.trim())
    lines.push('')
  }
  if (lineItems.length) {
    for (const li of lineItems) {
      const name = li.item_name || li.description || 'Item'
      const qty = parseFloat(li.quantity) || 1
      const qtyPart = qty !== 1 ? ` — qty ${qty}` : ''
      lines.push(`- ${name}${qtyPart}`)
    }
  } else if (!summary) {
    lines.push('(Scope details to be provided.)')
  }
  return lines.join('\n')
}

/**
 * Build the starting legal terms for a formal proposal.
 * Rep can edit the returned string freely before sending.
 */
export function buildDefaultTerms({ company, customer, quote, lineItems, downPaymentLabel, downPaymentAmount } = {}) {
  const total = parseFloat(quote?.quote_amount) || 0
  const depositAmt = parseFloat(downPaymentAmount ?? quote?.deposit_amount) || 0

  const replacements = {
    '{{company_name}}': company?.company_name || company?.name || 'Contractor',
    '{{customer_name}}': customer?.name || customer?.business_name || quote?.customer_name || 'Client',
    '{{total_price}}': formatCurrency(total),
    '{{down_payment_label}}': downPaymentLabel || 'Deposit',
    '{{down_payment_amount}}': formatCurrency(depositAmt),
    '{{scope_of_work}}': buildScopeFromLineItems(lineItems, quote?.summary || quote?.estimate_message || ''),
  }

  let out = DEFAULT_LEGAL_TEMPLATE
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val)
  }
  return out
}

/**
 * SHA-256 hash of a string, hex-encoded. Browser-safe.
 */
export async function sha256Hex(text) {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text || ''))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const DEFAULT_DOWN_PAYMENT_LABEL = 'Deposit'
export { DEFAULT_LEGAL_TEMPLATE }
