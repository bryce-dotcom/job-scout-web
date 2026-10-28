// Cash-basis money IN and the manual expenses that are not already a bank row
// — ONE copy for the app (src/lib/revenueBasis.js re-exports it) and for
// Frankie's / Arnie's query_pnl (frankieTools.ts).
//
// Why it lives here (2026-10-28): query_pnl kept its own copy. It counted
// customer payments only, so every utility incentive — $648k at HHH from May
// to October, most of the money in — was missing, and it added every logged
// receipt on top of the bank row it was already linked to. Asked whether a
// pole barn was safe, Jenny read "$973k out against $514k in" while the bank
// itself showed about break-even.

const num = (v: unknown) => parseFloat(v as string) || 0

// When the utility's money arrived. paid_at is the receipt date the office
// records when it marks the incentive paid (and can correct afterwards).
//
// This used to read updated_at, and that was a landmine: ANY edit to the row
// re-dated the revenue. On 2026-09-10 a data fix named the utility on all 28
// rows, and every incentive collected since March — $432,847.96 — moved into
// September's cash revenue on the dashboard. The date money arrived is a fact
// about the money, not about the last time someone touched the record.
//
// updated_at remains only as the fallback for a row marked Paid before paid_at
// existed. The same rule was open-coded on the Dashboard twice and in Books
// once; they all call this now.
export function incentiveReceivedAt(u: any): string | null {
  return u?.paid_at || u?.updated_at || u?.created_at || null
}

// Collected utility incentives that arrived inside the period.
export function collectedIncentives(utilityInvoices: any[] = [], inRange: (d: any) => boolean = () => true): number {
  return (utilityInvoices || [])
    .filter(i => i.payment_status === 'Paid' && inRange(incentiveReceivedAt(i)))
    .reduce((s, i) => s + num(i.amount ?? i.incentive_amount), 0)
}

// A payment that is cash in hand. Trade-credit applications reduce an invoice
// balance but are NOT cash — they draw down credit already held with a trade
// partner — and a refunded or voided payment never stayed.
export function isCashPayment(p: any): boolean {
  const status = p?.status || 'Completed'
  return status !== 'Refunded' && status !== 'Voided' && p?.method !== 'Trade Credit'
}

// A manual expense linked to a bank row IS that bank row; counting both
// double-counts the purchase. Only unlinked ones (cash, receipts not yet
// matched) add to the bank feed.
export const isUnlinkedExpense = (e: any): boolean => !e?.plaid_transaction_id
