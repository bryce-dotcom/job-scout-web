// London, 2026-10-20: the month's truck stock from the material receipts —
// with Arnie, not an outside AI. Each photo is read once and kept; parts are
// totalled; prices only for those who may see expenses.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('../../supabase/functions/_shared/anthropic.ts', () => ({ callAnthropic: vi.fn() }))
const { callAnthropic } = await import('../../supabase/functions/_shared/anthropic.ts')
const { materialsFromReceipts, MATERIAL_CATEGORIES } = await import('../../supabase/functions/_shared/arnieReceiptItems.ts')

const R = { url: 'https://proj.supabase.co', key: 'svc' }
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; vi.mocked(callAnthropic).mockReset() })

function world(kept = []) {
  const upserts = []
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url)
    if (u.includes('/storage/v1/object/')) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    if (u.includes('/rest/v1/expense_receipt_items') && init.method === 'POST') { upserts.push(JSON.parse(init.body)); return new Response(null, { status: 201 }) }
    if (u.includes('/rest/v1/expense_receipt_items')) return new Response(JSON.stringify(kept), { status: 200 })
    return new Response('[]', { status: 200 })
  })
  return { upserts }
}
const reply = (j) => ({ ok: true, data: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(j) }] } })

describe('materials off the receipts', () => {
  it('reads an unread photo once, keeps it, and totals parts across receipts', async () => {
    const w = world([{ expense_id: 1, items: [{ description: 'Wire nut 100pk', sku: '12345', quantity: 2, line_total: 19.9 }], unreadable: false }])
    vi.mocked(callAnthropic).mockResolvedValue(reply({ merchant: 'The Home Depot', items: [{ description: 'Wire Nut 100PK', sku: '12345', quantity: 1, unit_price: 9.95, line_total: 9.95 }, { description: '12/2 Romex 250ft', sku: null, quantity: 1, line_total: 119 }] }))
    const out = await materialsFromReceipts(R, 3, [
      { id: 1, vendor: 'The Home Depot', receipt_storage_path: 'jobs/1/receipts/a.jpg' },
      { id: 2, vendor: 'The Home Depot', receipt_storage_path: 'jobs/2/receipts/b.jpg' },
    ], { withPrices: false })
    expect(callAnthropic).toHaveBeenCalledTimes(1)                 // receipt 1 was already read
    expect(w.upserts[0]).toMatchObject({ expense_id: 2, company_id: 3, unreadable: false })
    const nut = out.items.find((i) => i.sku === '12345')
    expect(nut).toMatchObject({ quantity: 3, on_receipts: 2 })      // same SKU on two receipts → one line
    expect(nut).not.toHaveProperty('spent')                         // no prices below owner
    expect(out).toMatchObject({ receipts: 2, read: 2, unreadable: 0, still_to_read: 0 })
  })

  it('the unit travels with the quantity, and feet are never added to rolls', async () => {
    world([
      { expense_id: 1, items: [{ description: '12/2 MC AL SOL X250', sku: '122MCAGX250', quantity: 750, unit: 'FT' }], unreadable: false },
      { expense_id: 2, items: [{ description: '12/2 MC AL SOL X250', sku: '122MCAGX250', quantity: 1, unit: 'ROLL' }], unreadable: false },
    ])
    const out = await materialsFromReceipts(R, 3, [{ id: 1, receipt_storage_path: 'a.pdf' }, { id: 2, receipt_storage_path: 'b.jpg' }], { withPrices: false })
    expect(out.items.map((i) => `${i.quantity} ${i.unit}`).sort()).toEqual(['1 ROLL', '750 FT'])
  })
  it('prices only when allowed', async () => {
    world([{ expense_id: 1, items: [{ description: 'Romex', quantity: 1, line_total: 119 }], unreadable: false }])
    const out = await materialsFromReceipts(R, 3, [{ id: 1, receipt_storage_path: 'x.jpg' }], { withPrices: true })
    expect(out.items[0].spent).toBe(119)
  })

  it('an unreadable receipt is counted, never guessed', async () => {
    world()
    vi.mocked(callAnthropic).mockResolvedValue(reply({ merchant: null, items: [] }))
    const out = await materialsFromReceipts(R, 3, [{ id: 9, receipt_storage_path: 'blurry.jpg' }], { withPrices: false })
    expect(out).toMatchObject({ read: 0, unreadable: 1, items: [] })
  })

  it('a failed read is not kept, so the next ask tries again', async () => {
    const w = world()
    vi.mocked(callAnthropic).mockResolvedValue({ ok: false })
    await materialsFromReceipts(R, 3, [{ id: 5, receipt_storage_path: 'a.jpg' }], { withPrices: false })
    expect(w.upserts).toEqual([])
  })

  it('material categories are the four the books use', () => {
    expect(MATERIAL_CATEGORIES).toEqual(['Materials', 'Job Materials', 'Small Tools & Consumables', 'Supplies'])
  })
})

describe('Arnie\'s side', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
  const branch = chat.slice(chat.indexOf("if (name === 'query_material_receipts') {"), chat.indexOf("if (name === 'query_expenses') {"))
  it('managers and up; spend only for those who may see expenses', () => {
    expect(branch).toMatch(/if \(!isManager\) return \{ restricted:/)
    expect(branch).toMatch(/materialsFromReceipts\(r, companyId!, rows, \{ withPrices: isOwner \}\)/)
  })
  it('a business unit is placed through the receipt\'s job', () => {
    expect(branch).toMatch(/business_unit: `ilike\.\*\$\{bu\}\*`/)
  })
})
