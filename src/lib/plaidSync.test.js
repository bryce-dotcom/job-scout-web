import { describe, it, expect } from 'vitest'
import {
  buildAccountMap, attribute, groupByItem, itemCursor,
  mapTransaction, chunk, pullItem, previewAttribution,
} from './plaidSync'

// The real shape from company 3: nine accounts, ONE Plaid item. That is what
// broke it — /transactions/sync is per-item, so nine per-account calls each got
// the same nine accounts' transactions back.
const ITEM = 'PAnxvqDzALfPRYz9PBZwFnmZJRx47xIwDLngN'
const acct = (id, plaidId, name, cursor = null) => ({
  id, plaid_account_id: plaidId, plaid_item_id: ITEM, account_name: name, sync_cursor: cursor,
})
const ACCOUNTS = [
  acct(1, 'pa_visa', 'REWARDS BUSINESS VISA', 'cur_a'),
  acct(2, 'pa_cam', 'CAMERON MYEXPRES', 'cur_a'),
  acct(3, 'pa_chk', 'HHH SERVICES CHECKING'),
  acct(4, 'pa_sav', 'PRIMARY SAVINGS'),
]
const txn = (id, plaidAccountId, over = {}) => ({
  transaction_id: id, account_id: plaidAccountId, amount: 10, date: '2026-08-01', name: 'x', ...over,
})

describe('a transaction goes to the account Plaid says it does', () => {
  it('reads txn.account_id — the field the old code ignored entirely', () => {
    const map = buildAccountMap(ACCOUNTS)
    expect(attribute(txn('t1', 'pa_chk'), map)).toBe(3)
    expect(attribute(txn('t2', 'pa_cam'), map)).toBe(2)
  })

  it('refuses to guess when Plaid names an account we have no row for', () => {
    // Someone opens an account at the bank after connecting. Attaching those to
    // the nearest row is exactly how $20,000 of checking activity ended up on an
    // employee expense card.
    expect(attribute(txn('t3', 'pa_unknown'), buildAccountMap(ACCOUNTS))).toBe(null)
    expect(attribute(txn('t4', undefined), buildAccountMap(ACCOUNTS))).toBe(null)
  })

  it('ignores accounts with no plaid id rather than mapping undefined', () => {
    const map = buildAccountMap([{ id: 9, plaid_account_id: null }])
    expect(map.size).toBe(0)
  })
})

describe('one pull per item, not per account', () => {
  it('collapses nine account rows sharing an item into a single group', () => {
    const groups = groupByItem(ACCOUNTS)
    expect(groups.size).toBe(1)
    expect(groups.get(ITEM)).toHaveLength(4)
  })

  it('keeps separate items separate', () => {
    const other = { id: 5, plaid_account_id: 'pb_1', plaid_item_id: 'ITEM_B' }
    expect(groupByItem([...ACCOUNTS, other]).size).toBe(2)
  })

  it('skips rows with no item — they cannot be synced', () => {
    expect(groupByItem([{ id: 6, plaid_item_id: null }]).size).toBe(0)
  })
})

describe('the item cursor', () => {
  it('uses the shared cursor when every row agrees', () => {
    expect(itemCursor([acct(1, 'a', 'A', 'cur_x'), acct(2, 'b', 'B', 'cur_x')])).toBe('cur_x')
  })

  it('starts clean when any row is missing one', () => {
    // Seven of nine rows had no cursor. Trusting a partial set is what made a
    // later sync re-pull the whole history and re-stamp every row.
    expect(itemCursor([acct(1, 'a', 'A', 'cur_x'), acct(2, 'b', 'B', null)])).toBeUndefined()
  })

  it('starts clean when rows disagree', () => {
    expect(itemCursor([acct(1, 'a', 'A', 'cur_x'), acct(2, 'b', 'B', 'cur_y')])).toBeUndefined()
  })

  it('starts clean on an empty set', () => {
    expect(itemCursor([])).toBeUndefined()
  })
})

describe('what gets written', () => {
  it('carries only Plaid-owned columns, so a re-sync cannot wipe human work', () => {
    // The upsert updates just the keys in this payload. If user_category,
    // job_id, matched_invoice_id, confirmed or notes appeared here, re-syncing
    // would erase Tracy's categorisation every time it ran.
    const row = mapTransaction(txn('t1', 'pa_chk', { amount: 20000, merchant_name: 'MES' }), 3, 3)
    expect(Object.keys(row).sort()).toEqual([
      'amount', 'authorized_date', 'company_id', 'connected_account_id', 'date',
      'merchant_name', 'name', 'pending', 'plaid_category',
      'plaid_personal_finance_category', 'plaid_transaction_id',
    ])
    expect(row.connected_account_id).toBe(3)
  })

  it('flattens the personal finance category to its primary', () => {
    const row = mapTransaction(txn('t', 'pa_chk', { personal_finance_category: { primary: 'TRANSFER_OUT' } }), 3, 3)
    expect(row.plaid_personal_finance_category).toBe('TRANSFER_OUT')
  })

  it('batches for upsert instead of a round trip per row', () => {
    // ~2,100 rows x 7 accounts x 2 round trips was ~29,000 sequential calls,
    // which timed out mid-loop.
    expect(chunk(Array.from({ length: 1100 }, (_, i) => i), 500).map(c => c.length)).toEqual([500, 500, 100])
    expect(chunk([], 500)).toEqual([])
  })
})

describe('paging the item', () => {
  const fakePlaid = (pages) => {
    let call = 0
    return async () => ({
      ok: true,
      json: async () => pages[call++],
    })
  }

  it('follows has_more and returns the final cursor', async () => {
    const r = await pullItem({
      plaidBase: 'https://p', clientId: 'c', secret: 's', accessToken: 't',
      fetchImpl: fakePlaid([
        { added: [txn('a', 'pa_chk')], modified: [], removed: [], next_cursor: 'c1', has_more: true },
        { added: [txn('b', 'pa_cam')], modified: [], removed: [], next_cursor: 'c2', has_more: false },
      ]),
    })
    expect(r.added.map(t => t.transaction_id)).toEqual(['a', 'b'])
    expect(r.nextCursor).toBe('c2')
    expect(r.pages).toBe(2)
  })

  it('stops at maxPages if has_more never clears', async () => {
    const r = await pullItem({
      plaidBase: 'https://p', clientId: 'c', secret: 's', accessToken: 't', maxPages: 3,
      fetchImpl: async () => ({ ok: true, json: async () => ({ added: [], next_cursor: 'x', has_more: true }) }),
    })
    expect(r.pages).toBe(3)
  })

  it('surfaces a Plaid error instead of writing a partial result', async () => {
    // ITEM_LOGIN_REQUIRED has to reach the caller. The old code did `break` on a
    // failed page inside sync_all and then saved the cursor anyway.
    await expect(pullItem({
      plaidBase: 'https://p', clientId: 'c', secret: 's', accessToken: 't',
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error_message: 'ITEM_LOGIN_REQUIRED' }) }),
    })).rejects.toThrow('ITEM_LOGIN_REQUIRED')
  })

  it('reports removed transactions by id', async () => {
    const r = await pullItem({
      plaidBase: 'https://p', clientId: 'c', secret: 's', accessToken: 't',
      fetchImpl: fakePlaid([{ added: [], modified: [], removed: [{ transaction_id: 'gone' }], next_cursor: 'c', has_more: false }]),
    })
    expect(r.removed).toEqual(['gone'])
  })
})

describe('the preview Bryce sees before anything is overwritten', () => {
  it('counts the correct owner of every transaction', () => {
    const txns = [
      txn('1', 'pa_chk'), txn('2', 'pa_chk'), txn('3', 'pa_chk'),
      txn('4', 'pa_cam'),
      txn('5', 'pa_sav'),
    ]
    const p = previewAttribution(txns, ACCOUNTS)
    const by = Object.fromEntries(p.perAccount.map(a => [a.name, a.correct]))
    expect(by['HHH SERVICES CHECKING']).toBe(3)
    expect(by['CAMERON MYEXPRES']).toBe(1)
    expect(by['PRIMARY SAVINGS']).toBe(1)
    expect(by['REWARDS BUSINESS VISA']).toBe(0)
    expect(p.unattributed).toBe(0)
  })

  it('names the Plaid accounts it could not place, rather than hiding them', () => {
    const p = previewAttribution([txn('1', 'pa_mystery'), txn('2', 'pa_mystery')], ACCOUNTS)
    expect(p.unattributed).toBe(2)
    expect(p.unknownPlaidAccounts).toEqual(['pa_mystery'])
  })

  it('lists every account even when it owns nothing', () => {
    expect(previewAttribution([], ACCOUNTS).perAccount).toHaveLength(4)
  })
})
