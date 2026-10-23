// Receipts still at $0 that need a person (Bryce, 2026-10-22: a ~$1,940 gap
// in October job costing sat unseen for weeks). A photo is on file, nobody
// has an amount, and the server's re-read (receipt-reread: three tries, ten
// minutes apart) has had its turn — or the row is older than it looks at.
//
// Pure, so the rule can be read and tested apart from the page.

const MAX_TRIES = 3
const GIVE_THE_SERVER = 45 * 60_000

export function receiptWaitingForAmount(e, now = Date.now()) {
  if (!e || !(e.receipt_storage_path || e.receipt_url)) return false
  if (parseFloat(e.amount) > 0) return false
  if ((e.receipt_read_attempts || 0) >= MAX_TRIES) return true
  const at = new Date(e.created_at || e.date).getTime()
  return Number.isFinite(at) && now - at > GIVE_THE_SERVER
}

export function receiptsWaitingForAmount(expenses = [], now = Date.now()) {
  return (expenses || []).filter((e) => receiptWaitingForAmount(e, now))
}
