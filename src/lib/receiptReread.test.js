// Receipts the phone lost (2026-10-08 and -19: read on the server, the answer
// lost while the app slept, the row saved at $0 "could not read"). The phone
// asks twice; the server re-reads from the stored photo; what is still $0
// after that is flagged on the Expenses page.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rereadPatch, expenseFieldsFromReceipt, UNREAD_DESCRIPTION } from '../../supabase/functions/_shared/receiptFields.ts'
import { expenseFieldsFromReceipt as fromClient } from './receiptReader'
import { receiptWaitingForAmount, receiptsWaitingForAmount } from './receiptsWaiting'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const cats = [{ name: 'Job Materials', default_tax_category: 'COGS' }, { name: 'Small Tools & Consumables', default_tax_category: 'Line 20' }]

describe('the phone and the server fill a row the same way', () => {
  it('the app re-exports the one mapping', () => {
    expect(fromClient).toBe(expenseFieldsFromReceipt)
  })
})

describe('what a later read fills on a $0 receipt', () => {
  const read645 = expenseFieldsFromReceipt({ business_name: 'The Home Depot', amount: 68.1, date: '2026-10-19', description: 'Socket set, adapters, bits', receipt_number: '4403 52 62431', category: 'Small Tools & Consumables' }, cats)

  it('a row never read takes the receipt\'s amount, date, words and category', () => {
    const row = { amount: 0, description: UNREAD_DESCRIPTION, category: 'Job Materials', date: '2026-10-19' }
    expect(rereadPatch(row, read645)).toEqual({
      amount: 68.1, merchant: 'The Home Depot', vendor: 'The Home Depot', receipt: '4403 52 62431',
      date: '2026-10-19', description: 'Socket set, adapters, bits', category: 'Small Tools & Consumables', tax_category: 'Line 20',
    })
  })

  it('the old two-step placeholder counts as never read', () => {
    expect(rereadPatch({ amount: 0, description: 'Receipt capture — Field Scout' }, read645).description).toBe('Socket set, adapters, bits')
  })

  it('what a person or the first read wrote is kept — only the amount and blanks are filled', () => {
    const row = { amount: 0, merchant: 'HD Lehi', vendor: 'HD Lehi', description: 'Tools for the Desert job', category: 'Job Materials', date: '2026-10-18' }
    expect(rereadPatch(row, read645)).toEqual({ amount: 68.1, receipt: '4403 52 62431', tax_category: 'Line 20' })
  })

  it('no amount read, nothing written', () => {
    expect(rereadPatch({ amount: 0, description: UNREAD_DESCRIPTION }, { merchant: 'Herc Rentals' })).toEqual({})
  })
})

describe('a receipt still waiting for a person', () => {
  const now = Date.parse('2026-10-22T20:00:00Z')
  const base = { amount: 0, receipt_storage_path: 'jobs/1/receipts/x.jpg', created_at: '2026-10-22T19:50:00Z', receipt_read_attempts: 0 }
  it.each([
    ['three tries and still $0', { ...base, receipt_read_attempts: 3 }, true],
    ['older than the server looks at', { ...base, created_at: '2026-09-01T00:00:00Z' }, true],
    ['just snapped — the server has not had its turn', base, false],
    ['has an amount', { ...base, amount: 46.41, receipt_read_attempts: 3 }, false],
    ['no photo — a typed expense, not a lost receipt', { ...base, receipt_storage_path: null, receipt_read_attempts: 3 }, false],
  ])('%s', (_, e, want) => {
    expect(receiptWaitingForAmount(e, now)).toBe(want)
  })
  it('a list', () => {
    expect(receiptsWaitingForAmount([{ ...base, id: 1, receipt_read_attempts: 3 }, { ...base, id: 2 }], now).map((e) => e.id)).toEqual([1])
  })
})

describe('the wiring', () => {
  it('the phone asks a second time before giving up', () => {
    expect(read('src/lib/receiptReader.js')).toMatch(/if \(!extracted\) extracted = await readReceipt\(file, \{ companyId, categories: cats \}\)/)
  })
  it('the server reads only $0 rows with a photo, three tries, and never over a person\'s typing', () => {
    const fn = read('supabase/functions/receipt-reread/index.ts')
    expect(fn).toMatch(/isCronCaller/)
    expect(fn).toMatch(/amount=eq\.0&receipt_storage_path=not\.is\.null&receipt_read_attempts=lt\.\$\{MAX_TRIES\}/)
    expect(fn).toMatch(/expenses\?id=eq\.\$\{row\.id\}&amount=eq\.0/)
    expect(fn).toMatch(/functions\/v1\/scan-receipt/)
  })
  it('it runs every ten minutes', () => {
    expect(read('supabase/migrations/20261022200000_receipt_reread.sql')).toMatch(/'receipt-reread',\s*'\*\/10 \* \* \* \*'/)
  })
  it('the Expenses page flags what is left', () => {
    const page = read('src/pages/Expenses.jsx')
    expect(page).toMatch(/receiptsWaitingForAmount\(expenses\)/)
    expect(page).toMatch(/still at \$0/)
  })
})
