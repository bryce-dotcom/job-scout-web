// How a Plaid item syncs — ONE definition.
//
// The bug this replaces: /transactions/sync is a PER-ITEM endpoint (it takes an
// access_token, not an account id) and returns transactions for every account
// under that item. The old code looped over all NINE connected_accounts rows
// and called it once per account with the same token, then stamped every
// transaction it got back with whichever account row the loop happened to be
// on — mapTransaction(txn, company_id, account.id) never read txn.account_id.
//
// Two consequences, both live in production:
//   1. One item's entire history landed on a single account, and was re-stamped
//      onto a different one by the next partial run. HHH SERVICES CHECKING and
//      PRIMARY SAVINGS showed zero transactions ever, while an employee card
//      named CAMERON MYEXPRES carried $20,000 to MES, $18.5k draft withdrawals
//      and 30 transactions over $5,000.
//   2. Each un-cursored account re-pulled the full ~2,100-row history with a
//      SELECT and then an INSERT per row — roughly 29,000 sequential round
//      trips for seven accounts, which times out mid-loop. That is why only one
//      or two accounts ever got a cursor, and why which ones was effectively
//      random: the account query had no ORDER BY.
//
// So: one pull per ITEM, attribution from txn.account_id, batched upserts.

export type PlaidTxn = Record<string, unknown>

export interface AccountRow {
  id: number
  plaid_account_id?: string | null
  plaid_item_id?: string | null
  account_name?: string | null
  sync_cursor?: string | null
}

// plaid_account_id -> our connected_accounts.id
export function buildAccountMap(accounts: AccountRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of accounts || []) {
    if (a?.plaid_account_id) m.set(String(a.plaid_account_id), a.id)
  }
  return m
}

// Which of OUR account rows does this transaction belong to?
//
// Returns null when Plaid reports an account we hold no row for — which happens
// when someone opens an account at the bank after connecting. Those have to be
// counted and surfaced, never quietly attached to whatever row is nearest,
// because that is the entire mistake being fixed here.
export function attribute(txn: PlaidTxn, accountMap: Map<string, number>): number | null {
  const plaidAccountId = txn?.account_id
  if (!plaidAccountId) return null
  return accountMap.get(String(plaidAccountId)) ?? null
}

// One item backs many account rows. Group so we pull once per item.
export function groupByItem(accounts: AccountRow[]): Map<string, AccountRow[]> {
  const g = new Map<string, AccountRow[]>()
  for (const a of accounts || []) {
    const key = a?.plaid_item_id
    if (!key) continue
    const list = g.get(String(key))
    if (list) list.push(a)
    else g.set(String(key), [a])
  }
  return g
}

// The cursor belongs to the ITEM, but the schema only has connected_accounts, so
// every row for an item carries the same one. If a single row were left without
// it, a later sync touching that row would re-pull the whole history from
// scratch — which is precisely how the re-stamping happened. A mismatched or
// partial set is therefore treated as no cursor at all: one clean full re-pull
// is cheap now that it happens once per item and upserts in batches.
export function itemCursor(accounts: AccountRow[]): string | undefined {
  const rows = accounts || []
  if (!rows.length) return undefined
  const cursors = rows.map(a => a.sync_cursor).filter(Boolean) as string[]
  if (cursors.length !== rows.length) return undefined
  const first = cursors[0]
  return cursors.every(c => c === first) ? first : undefined
}

export function mapTransaction(txn: PlaidTxn, companyId: number | string, connectedAccountId: number) {
  const pfc = txn.personal_finance_category as { primary?: string } | undefined
  return {
    company_id: companyId,
    connected_account_id: connectedAccountId,
    plaid_transaction_id: txn.transaction_id,
    amount: txn.amount,
    date: txn.date,
    authorized_date: txn.authorized_date || null,
    merchant_name: txn.merchant_name || null,
    name: txn.name || null,
    plaid_category: txn.category || null,
    plaid_personal_finance_category: pfc?.primary || null,
    pending: txn.pending || false,
  }
}

// Only Plaid-owned columns are written above, which is what makes the upsert
// safe: ON CONFLICT updates just the keys present in the payload, so a
// categorisation, a job link, an invoice match or a note someone typed survives
// a re-sync untouched.
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export interface PullResult {
  added: PlaidTxn[]
  modified: PlaidTxn[]
  removed: string[]
  nextCursor: string | undefined
  pages: number
}

// Page through /transactions/sync for ONE item. Read-only — no writes happen
// here, so the same code backs the live sync and the preview.
export async function pullItem(opts: {
  plaidBase: string
  clientId: string
  secret: string
  accessToken: string
  cursor?: string
  maxPages?: number
  fetchImpl?: typeof fetch
}): Promise<PullResult> {
  const doFetch = opts.fetchImpl || fetch
  const added: PlaidTxn[] = []
  const modified: PlaidTxn[] = []
  const removed: string[] = []
  let cursor = opts.cursor
  let pages = 0
  const maxPages = opts.maxPages ?? 40

  for (;;) {
    const body: Record<string, unknown> = {
      client_id: opts.clientId,
      secret: opts.secret,
      access_token: opts.accessToken,
    }
    if (cursor) body.cursor = cursor

    const res = await doFetch(`${opts.plaidBase}/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error_message || data?.error_code || `Plaid sync failed (${res.status})`)
    }
    added.push(...(data.added || []))
    modified.push(...(data.modified || []))
    removed.push(...(data.removed || []).map((r: { transaction_id: string }) => r.transaction_id))
    cursor = data.next_cursor
    pages++
    // A pagination bug that never clears has_more must not spin forever against
    // a paid API.
    if (!data.has_more || pages >= maxPages) break
  }
  return { added, modified, removed, nextCursor: cursor, pages }
}

export interface AttributionPreview {
  perAccount: Array<{ id: number; name: string; plaid_account_id: string | null; correct: number }>
  unattributed: number
  unknownPlaidAccounts: string[]
}

// What the live sync WOULD write, without writing it: which account each
// transaction should sit on. Compared against what the table says today, this is
// the evidence that the attribution is wrong, produced before anything
// overwrites the existing rows.
export function previewAttribution(txns: PlaidTxn[], accounts: AccountRow[]): AttributionPreview {
  const map = buildAccountMap(accounts)
  const counts = new Map<number, number>()
  const unknown = new Set<string>()
  let unattributed = 0

  for (const t of txns || []) {
    const id = attribute(t, map)
    if (id === null) {
      unattributed++
      if (t?.account_id) unknown.add(String(t.account_id))
      continue
    }
    counts.set(id, (counts.get(id) || 0) + 1)
  }

  return {
    perAccount: (accounts || []).map(a => ({
      id: a.id,
      name: a.account_name || String(a.id),
      plaid_account_id: a.plaid_account_id ?? null,
      correct: counts.get(a.id) || 0,
    })),
    unattributed,
    unknownPlaidAccounts: [...unknown],
  }
}
