// Which recorded payments a Stripe payout carried, and the bank deposit it
// became — decided in one place, with nothing invented.
//
// A Stripe payout is not a sale. When a customer pays by card the webhook
// records the payment on their invoice that minute; the payout is Stripe
// sending that money on to the bank a couple of business days later, net of
// its fee, several customers' charges in one lump. Tracy (2026-09-16, ticket
// b6e2f81d) had 18 of them sitting in Books as "unmatched deposits" with a
// Match button, because nothing knew what was inside them. HHH had 82
// payouts since June and not one was tied to the payments it carried.
//
// Stripe knows exactly what was inside: /v1/balance_transactions?payout=po_…
// lists every charge (with its payment_intent, which the webhook stamps on
// the payment row), every refund and every fee. So the link is a fact to be
// read, not a guess to be matched:
//
//   payout ──balance transactions──▶ charges ──payment_intent──▶ payments rows
//   payout ──same amount, ±2 days, names Stripe──▶ the bank row (lib/bankLedger's twin rule)
//
// This module only decides. stripe-sync-books does the Stripe and database
// I/O with the plan it returns, and a dry run returns the plan untouched.
//
// Rules the plan keeps:
//   - a charge with no payment row is REPORTED, never turned into one
//   - a payment already tied to some other deposit is left where a person put it
//   - a bank row a person already matched to something else is left alone and
//     reported as a conflict — the machine does not overrule the reconciler
//   - the bank row is written as a transfer (the review modal's own write) AND
//     pointed at what it carried, so it leaves the deposit queue with its
//     composition on it

export interface BalanceTxn {
  id: string
  type: string            // charge | payment | refund | payout | adjustment | stripe_fee | application_fee | …
  amount: number          // cents, gross
  fee: number             // cents
  net: number             // cents
  source?: string | { id?: string; object?: string; payment_intent?: string | null; description?: string | null; metadata?: Record<string, string> | null } | null
  description?: string | null
}

export interface PayoutLike {
  id: string
  amount: number          // cents
  arrival_date: number    // unix seconds
  status: string          // paid | pending | in_transit | canceled | failed
}

export interface PaymentRow {
  id: number
  invoice_id: number | null
  amount: number | string | null
  stripe_payment_intent_id: string | null
  source_transaction_id: number | null
  stripe_payout_id?: string | null
  invoice?: { invoice_id?: string | null } | null
}

export interface BankRow {
  id: number
  amount: number | string | null   // negative = deposit (Plaid's sign)
  date: string
  name?: string | null
  merchant_name?: string | null
  plaid_transaction_id?: string | null
  matched_invoice_id?: number | null
  matched_payment_id?: number | null
  matched_utility_invoice_id?: number | null
  is_transfer?: boolean | null
  confirmed?: boolean | null
  stripe_payout_id?: string | null
  notes?: string | null
}

const DAY = 86400000
const TWIN_WINDOW_DAYS = 2 // the same window lib/bankLedger.js uses to hide the journal twin
const cents = (n: unknown) => Math.round((Number(n) || 0) * 100)
const dollars = (c: number) => Math.round(c) / 100
const r2 = (n: number) => Math.round(n * 100) / 100

/** The payment_intent a balance transaction's charge belongs to, when the source was expanded. */
export function intentOf(bt: BalanceTxn): string | null {
  const s = bt?.source
  if (!s || typeof s === 'string') return null
  return s.payment_intent || null
}

// docId: JobScout stamps payment_intent_data[metadata][document_id] on every
// charge it creates (stripe-create-payment-link), so a charge with no payment
// row can still say which invoice it paid.
export interface PayoutCharge { btId: string; chargeId: string | null; intent: string | null; docId: number | null; description: string | null; gross: number; fee: number; net: number }
export interface PayoutOther { btId: string; type: string; net: number; description: string | null }

/**
 * Split a payout's balance transactions into the charges it carried and
 * everything else (refunds, adjustments, fees billed separately). The payout's
 * own transaction is dropped — it is the total, not a part.
 */
export function payoutCharges(balanceTxns: BalanceTxn[] = []): { charges: PayoutCharge[]; others: PayoutOther[] } {
  const charges: PayoutCharge[] = []
  const others: PayoutOther[] = []
  for (const bt of balanceTxns || []) {
    if (!bt || bt.type === 'payout') continue
    if (bt.type === 'charge' || bt.type === 'payment') {
      const s = bt.source
      const doc = typeof s === 'string' ? null : Number.parseInt(String(s?.metadata?.document_id ?? s?.metadata?.invoice_id ?? ''), 10)
      charges.push({
        btId: bt.id,
        chargeId: typeof s === 'string' ? s : (s?.id || null),
        intent: intentOf(bt),
        docId: Number.isFinite(doc) ? doc : null,
        description: (typeof s === 'string' ? null : s?.description) || bt.description || null,
        gross: dollars(bt.amount), fee: dollars(bt.fee), net: dollars(bt.net),
      })
    } else {
      others.push({ btId: bt.id, type: bt.type, net: dollars(bt.net), description: bt.description || null })
    }
  }
  return { charges, others }
}

/** Written by stripe-sync-books: the synthetic journal row for a payout, never a bank transaction. */
export function isJournalRow(row: BankRow): boolean {
  return String(row?.plaid_transaction_id || '').startsWith('stripe_')
}

function mentionsStripe(row: BankRow): boolean {
  return /stripe/i.test(`${row?.name || ''} ${row?.merchant_name || ''}`)
}

// How directly a bank row names Stripe as the other party. The bank's own
// descriptor for the payout ("Transfer from Stripe", merchant Stripe) is the
// deposit that IS the payout. "Home banking Deposit Transfer from S0059 -
// Stripe deposit" is the same money moved on to another of the company's
// accounts, with Stripe typed into the memo by hand — HHH had seven of those
// pairs, same amount, same day, and only the first is the twin.
function namesStripeAsCounterparty(row: BankRow): boolean {
  if (/stripe/i.test(row?.merchant_name || '')) return true
  return /^\W*(?:(?:transfer|deposit|payment|payout)\s+)?(?:from\s+)?stripe\b/i.test(String(row?.name || '').trim())
}

export interface TwinSearch { twin: BankRow | null; candidates: BankRow[]; ambiguous: boolean }

/**
 * The bank row this payout became. Same rule as lib/bankLedger.hasBankTwin —
 * a deposit of the payout's exact amount within two days of its arrival
 * date, on a row that itself names Stripe — because that is the rule that
 * already decides which row Books shows. When several qualify, the row that
 * names Stripe as the counterparty beats one that only mentions it in a
 * memo, then the nearest by date; a tie after that is a question for a person.
 */
export function findBankTwin(payout: PayoutLike, rows: BankRow[] = []): TwinSearch {
  const arrival = payout.arrival_date * 1000
  const want = -Math.round(payout.amount) // Plaid: a deposit is negative
  const candidates = (rows || []).filter((r) =>
    r && !isJournalRow(r) && cents(r.amount) === want &&
    Number.isFinite(new Date(r.date).getTime()) &&
    Math.abs(new Date(r.date).getTime() - arrival) <= TWIN_WINDOW_DAYS * DAY &&
    mentionsStripe(r),
  )
  if (!candidates.length) return { twin: null, candidates, ambiguous: false }
  const gap = (r: BankRow) => Math.abs(new Date(r.date).getTime() - arrival)
  const direct = (r: BankRow) => (namesStripeAsCounterparty(r) ? 0 : 1)
  const sorted = [...candidates].sort((a, b) => direct(a) - direct(b) || gap(a) - gap(b) || a.id - b.id)
  const ambiguous = sorted.length > 1 && direct(sorted[0]) === direct(sorted[1]) && gap(sorted[0]) === gap(sorted[1])
  return { twin: ambiguous ? null : sorted[0], candidates: sorted, ambiguous }
}

function isMatched(row: BankRow | null): boolean {
  return !!(row?.matched_invoice_id || row?.matched_payment_id || row?.matched_utility_invoice_id)
}

export interface MappedPayment {
  paymentId: number; invoiceId: number | null; invoiceNo: string | null
  intent: string | null; chargeId: string | null
  gross: number; fee: number; net: number
  linkedTo: number | null           // source_transaction_id already on the row, if any
}

export interface InvoiceLite { id: number; invoice_id?: string | null; payment_status?: string | null }
export interface UnmappedCharge extends PayoutCharge { invoiceNo: string | null; invoiceStatus: string | null }

export interface PayoutPlan {
  payoutId: string
  status: string
  arrivalDate: string               // YYYY-MM-DD
  amount: number                    // dollars, what reached the bank
  charges: number
  mapped: MappedPayment[]
  unmapped: UnmappedCharge[]        // charges Stripe carried that JobScout has no payment row for
  others: PayoutOther[]
  gross: number; fees: number; net: number   // over the charges
  sumMatches: boolean               // Σ net of all parts == payout amount
  twin: { id: number; date: string; name: string | null; alreadyMatched: boolean; alreadyTransfer: boolean; alreadyThisPayout: boolean } | null
  twinCandidates: number
  outcome: 'linked' | 'already_linked' | 'waiting_for_bank' | 'twin_conflict' | 'twin_ambiguous' | 'nothing_to_link'
  reason: string
  actions: {
    stampPayments: number[]         // set stripe_payout_id + stripe_fee (payments in this payout, any state)
    linkPayments: number[]          // set source_transaction_id = twin.id (payments not yet tied to a deposit)
    twinUpdate: Record<string, unknown> | null
  }
  note: string
}

/**
 * Decide everything for one payout. Pure: pass in the payout, its balance
 * transactions, the payment rows whose intent matches any of its charges,
 * and the bank rows near its amount and date.
 */
export function planPayoutLink(
  { payout, balanceTxns, payments, bankRows, invoices = [] }:
  { payout: PayoutLike; balanceTxns: BalanceTxn[]; payments: PaymentRow[]; bankRows: BankRow[]; invoices?: InvoiceLite[] },
): PayoutPlan {
  const { charges, others } = payoutCharges(balanceTxns)
  const byIntent = new Map<string, PaymentRow>()
  for (const p of payments || []) if (p?.stripe_payment_intent_id) byIntent.set(p.stripe_payment_intent_id, p)
  const invoiceById = new Map<number, InvoiceLite>()
  for (const inv of invoices || []) if (inv?.id != null) invoiceById.set(inv.id, inv)

  const mapped: MappedPayment[] = []
  const unmapped: UnmappedCharge[] = []
  for (const c of charges) {
    const p = c.intent ? byIntent.get(c.intent) : undefined
    if (!p) {
      const inv = c.docId != null ? invoiceById.get(c.docId) : undefined
      unmapped.push({ ...c, invoiceNo: inv?.invoice_id || null, invoiceStatus: inv?.payment_status || null })
      continue
    }
    mapped.push({
      paymentId: p.id, invoiceId: p.invoice_id ?? null, invoiceNo: p.invoice?.invoice_id || null,
      intent: c.intent, chargeId: c.chargeId, gross: c.gross, fee: c.fee, net: c.net,
      linkedTo: p.source_transaction_id ?? null,
    })
  }
  const gross = r2(charges.reduce((s, c) => s + c.gross, 0))
  const fees = r2(charges.reduce((s, c) => s + c.fee, 0))
  const net = r2(charges.reduce((s, c) => s + c.net, 0))
  const netAll = net + others.reduce((s, o) => s + o.net, 0)
  const amount = dollars(payout.amount)
  const sumMatches = Math.abs(cents(netAll) - Math.round(payout.amount)) <= 1
  const arrivalDate = new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)

  const search = findBankTwin(payout, bankRows)
  const twinRow = search.twin
  const mappedIds = new Set(mapped.map((m) => m.paymentId))
  const twin = twinRow ? {
    id: twinRow.id, date: twinRow.date, name: twinRow.name || twinRow.merchant_name || null,
    alreadyMatched: isMatched(twinRow),
    alreadyTransfer: !!twinRow.is_transfer,
    alreadyThisPayout: twinRow.stripe_payout_id === payout.id,
  } : null
  // A bank row a person already pointed somewhere else stays theirs — unless
  // what they pointed it at is one of this payout's own payments, which is
  // simply the same answer arrived at by hand.
  const twinConflict = !!(twin && twin.alreadyMatched && !twin.alreadyThisPayout &&
    !(twinRow!.matched_payment_id && mappedIds.has(twinRow!.matched_payment_id)))

  // Stamping (payout id + fee) is a fact about the payment whatever the bank
  // side says; linking waits for a twin nobody has claimed for something else.
  const stampPayments = mapped.map((m) => m.paymentId)
  const linkPayments = twinRow && !twinConflict
    ? mapped.filter((m) => m.linkedTo == null || m.linkedTo === twinRow.id).map((m) => m.paymentId)
    : []

  const note = payoutNote({ payoutId: payout.id, mapped, unmapped, others, gross, fees, net, amount })

  let outcome: PayoutPlan['outcome']
  let reason: string
  let twinUpdate: Record<string, unknown> | null = null
  if (!charges.length && !others.length) {
    outcome = 'nothing_to_link'; reason = 'Stripe lists nothing inside this payout'
  } else if (twin?.alreadyThisPayout) {
    outcome = 'already_linked'; reason = `bank row ${twin.id} already carries ${payout.id}`
  } else if (payout.status !== 'paid') {
    outcome = 'waiting_for_bank'; reason = `payout is ${payout.status}; payments stamped, bank link waits`
  } else if (search.ambiguous) {
    outcome = 'twin_ambiguous'; reason = `${search.candidates.length} bank rows of ${amount} equally near ${arrivalDate}: ${search.candidates.map((c) => c.id).join(', ')}`
  } else if (!twinRow) {
    outcome = 'waiting_for_bank'; reason = `no bank deposit of ${amount} naming Stripe within ${TWIN_WINDOW_DAYS} days of ${arrivalDate} yet`
  } else if (twinConflict) {
    outcome = 'twin_conflict'; reason = `bank row ${twinRow.id} was matched by hand to invoice ${twinRow.matched_invoice_id ?? '?'} / payment ${twinRow.matched_payment_id ?? '?'} — left alone`
  } else {
    outcome = 'linked'
    const first = mapped.find((m) => linkPayments.includes(m.paymentId)) || mapped[0] || null
    reason = first ? `${mapped.length} of ${charges.length} charges are recorded payments` : `no recorded payment inside; bank row marked as the Stripe transfer it is`
    twinUpdate = {
      stripe_payout_id: payout.id,
      // The review modal's transfer write, verbatim: a payout is the
      // customers' money reaching the bank, already counted when they paid.
      is_transfer: true, confirmed: true, user_category: null, user_tax_category: null,
      // And what it carried — the bank row can point at one payment (the
      // wallet-payout precedent); every payment points back.
      ...(first ? { matched_invoice_id: first.invoiceId, matched_payment_id: first.paymentId, matched_at: new Date().toISOString() } : {}),
      notes: twinRow.notes ? `${twinRow.notes}\n${note}` : note,
    }
  }

  return {
    payoutId: payout.id, status: payout.status, arrivalDate, amount,
    charges: charges.length, mapped, unmapped, others, gross, fees, net, sumMatches,
    twin, twinCandidates: search.candidates.length,
    outcome, reason,
    actions: { stampPayments, linkPayments, twinUpdate },
    note,
  }
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The sentence Books shows on the bank row: what the payout carried and what Stripe kept. */
export function payoutNote(
  { payoutId, mapped, unmapped, others, gross, fees, net, amount }:
  { payoutId: string; mapped: MappedPayment[]; unmapped: UnmappedCharge[]; others: PayoutOther[]; gross: number; fees: number; net: number; amount: number },
): string {
  const n = mapped.length + unmapped.length
  const parts = [`Stripe payout ${payoutId} · ${n} card payment${n === 1 ? '' : 's'} · ${money(gross)} charged − ${money(fees)} Stripe fees = ${money(net)}`]
  const invoices = mapped.map((m) => m.invoiceNo || (m.invoiceId != null ? `invoice ${m.invoiceId}` : null)).filter(Boolean)
  if (invoices.length) parts.push(invoices.join(', '))
  if (unmapped.length) parts.push(`${unmapped.length} charge${unmapped.length === 1 ? '' : 's'} not recorded in JobScout (${unmapped.map((u) => `${u.invoiceNo ? `${u.invoiceNo} ` : ''}${u.intent || u.chargeId || u.btId} ${money(u.net)}`).join(', ')})`)
  for (const o of others) parts.push(`${o.type} ${money(o.net)}`)
  if (Math.abs(cents(net) + cents(others.reduce((s, o) => s + o.net, 0)) - cents(amount)) > 1) parts.push(`parts total ${money(net + others.reduce((s, o) => s + o.net, 0))}, payout ${money(amount)}`)
  return parts.join(' · ')
}
