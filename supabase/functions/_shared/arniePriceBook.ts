// The price book from a photo, a PDF or a spreadsheet.
//
// "Here's my price list" with a supplier sheet attached — the model reads
// the rows off the page (name, price, cost, unit, kind) and hands them
// here as data. Nothing on the model's side is trusted: every row is
// checked, priced rows only, names deduped against the book the company
// already has, and the card shows exactly what will be added and what was
// skipped and why. Approve inserts the rows the Products & Services page
// would; rollback removes those rows and only those — and refuses if a
// quote or a job already uses one of them.
//
// Who: Manager+ (level 2). The page lets anyone with the menu item edit
// products, but a bulk write from a document deserves a manager's click.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })

export const MAX_ITEMS = 80

export interface PriceBookItem { name: string; unit_price: number; cost: number | null; type: 'Product' | 'Service'; description: string | null; manufacturer: string | null; model_number: string | null; vendor_sku: string | null; product_category: string | null }

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[$,\s]/g, '').replace(/\/.*$/, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
const str = (v: unknown, max: number): string | null => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s ? s.slice(0, max) : null }
const isService = (raw: any) => /^(service|labor|labour|hour|hr|hrs|visit|call)/i.test(String(raw.type || raw.kind || raw.unit || ''))

/** One pass over the model's rows: what to add, what to skip and why. */
export function normalizeItems(raw: unknown, existingNames: Set<string>): { items: PriceBookItem[]; skipped: { name: string; why: string }[] } {
  const items: PriceBookItem[] = []
  const skipped: { name: string; why: string }[] = []
  const seen = new Set<string>()
  const list = Array.isArray(raw) ? raw : []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const name = str((row as any).name, 120)
    if (!name) { skipped.push({ name: '(no name)', why: 'no name' }); continue }
    const key = name.toLowerCase()
    const price = num((row as any).unit_price ?? (row as any).price)
    if (price == null || price < 0) { skipped.push({ name, why: 'no price' }); continue }
    if (price > 250000) { skipped.push({ name, why: `$${price.toLocaleString()} does not read like a unit price` }); continue }
    if (existingNames.has(key)) { skipped.push({ name, why: 'already in the book' }); continue }
    if (seen.has(key)) { skipped.push({ name, why: 'listed twice' }); continue }
    seen.add(key)
    const cost = num((row as any).cost)
    items.push({
      name, unit_price: price, cost: cost != null && cost >= 0 ? cost : null,
      type: isService(row) ? 'Service' : 'Product',
      description: str((row as any).description, 400),
      manufacturer: str((row as any).manufacturer, 80),
      model_number: str((row as any).model_number ?? (row as any).model, 80),
      vendor_sku: str((row as any).vendor_sku ?? (row as any).sku, 80),
      product_category: str((row as any).category ?? (row as any).product_category, 60),
    })
  }
  return { items, skipped }
}

export async function preparePriceBook(r: Rest, caller: Caller, f: Record<string, string>) {
  const companyId = caller.companyId as number
  if (caller.level < 2) return { ok: false as const, error: 'Adding to the price book from a document is a manager\'s call. Ask them — or read me one item at a time and I can draft it as a note for them.' }
  let raw: unknown
  try { raw = JSON.parse(f.items || '[]') } catch { return { ok: false as const, error: 'The items did not come through as a list. Read the document again and give me one row per item: name, price, cost if shown, and whether it is a product or a service.' } }
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false as const, error: 'I did not get any items. If the document is hard to read, tell me and I will say which lines I could make out.' }
  if (raw.length > MAX_ITEMS) return { ok: false as const, error: `That is ${raw.length} items — I take up to ${MAX_ITEMS} per card. Give me the first ${MAX_ITEMS}, then the rest.` }

  const existing = await readRecordList(r, `products_services?select=name&company_id=eq.${companyId}&limit=5000`)
  const names = new Set(existing.map((p: any) => String(p.name || '').toLowerCase().trim().replace(/\s+/g, ' ')))
  const { items, skipped } = normalizeItems(raw, names)
  if (!items.length) return { ok: false as const, error: `Nothing to add: ${skipped.slice(0, 6).map((s) => `${s.name} (${s.why})`).join(', ')}${skipped.length > 6 ? ` and ${skipped.length - 6} more` : ''}.` }

  // Services are taxed where the company said they are (Settings → sales tax).
  const [tax] = await readRecordList(r, `settings?select=value&company_id=eq.${companyId}&key=eq.sales_tax&limit=1`)
  let servicesTaxable = false
  try { servicesTaxable = JSON.parse(tax?.value || '{}')?.apply_to === 'all' } catch { /* no setting = materials only */ }

  const products = items.filter((i) => i.type === 'Product').length, services = items.length - products
  const display: { label: string; value: string }[] = [
    { label: 'Adding', value: `${items.length} item${items.length === 1 ? '' : 's'} — ${products} product${products === 1 ? '' : 's'}, ${services} service${services === 1 ? '' : 's'}` + (String(f.source || '').trim() ? ` from ${f.source.trim()}` : '') },
  ]
  // Cost equal to price is the tell of a cost read as a price — shown, not hidden.
  for (const i of items.slice(0, 40)) display.push({ label: i.name, value: `$${i.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}${i.cost != null ? ` (cost $${i.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })})` : ''} · ${i.type}${i.vendor_sku ? ` · ${i.vendor_sku}` : ''}${i.manufacturer ? ` · ${i.manufacturer}` : ''}${i.cost != null && i.cost === i.unit_price ? ' · cost equals price — check this one' : ''}` })
  if (items.length > 40) display.push({ label: '…', value: `and ${items.length - 40} more on the card's list` })
  if (skipped.length) display.push({ label: 'Skipped', value: skipped.slice(0, 12).map((s) => `${s.name} — ${s.why}`).join('; ') + (skipped.length > 12 ? `; and ${skipped.length - 12} more` : '') })
  display.push({ label: 'Where', value: 'Products & Services, ungrouped — drag them into sections there; services ' + (servicesTaxable ? 'taxable (your sales-tax setting)' : 'not taxed (your sales-tax setting)') })

  return { ok: true as const, columns: { items, skipped, services_taxable: servicesTaxable }, display }
}

export async function applyPriceBook(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const items: PriceBookItem[] = Array.isArray(c.items) ? c.items : []
  if (!items.length) return { ok: false as const, error: 'This draft has no items.' }
  // Re-check: the page may have added some of these since the draft. Skip those, never duplicate.
  const existing = await readRecordList(r, `products_services?select=name&company_id=eq.${companyId}&limit=5000`)
  const names = new Set(existing.map((p: any) => String(p.name || '').toLowerCase().trim().replace(/\s+/g, ' ')))
  const fresh = items.filter((i) => !names.has(i.name.toLowerCase()))
  if (!fresh.length) return { ok: false as const, stale: true, error: 'Every one of these is in the book now — added from the page since I drafted this. Nothing changed.' }
  const now = new Date().toISOString()
  const rows = fresh.map((i) => ({
    company_id: companyId, name: i.name, description: i.description, type: i.type,
    unit_price: i.unit_price, cost: i.cost, taxable: i.type === 'Product' ? true : c.services_taxable === true,
    active: true, group_id: null, manufacturer: i.manufacturer, model_number: i.model_number, vendor_sku: i.vendor_sku,
    product_category: i.product_category, datasheet_json: {}, updated_at: now,
  }))
  const ins = await fetch(`${r.url}/rest/v1/products_services`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify(rows) })
  if (!ins.ok) return { ok: false as const, error: `Could not add the items: ${ins.status} ${await ins.text()}` }
  const made = await ins.json()
  const ids = made.map((m: any) => m.id)
  return { ok: true as const, id: ids[0], label: `${ids.length} item${ids.length === 1 ? '' : 's'} added to the price book`, created: { product_ids: ids, skipped_at_apply: items.length - fresh.length } }
}

/** Remove exactly the rows this added — unless a quote or a job already uses one. */
export async function rollbackPriceBook(r: Rest, companyId: number, prop: any) {
  const ids: number[] = prop.payload?.created?.product_ids || []
  if (!ids.length) return { ok: false as const, error: 'This draft never added anything.' }
  const inList = `in.(${ids.join(',')})`
  const used = await readRecordList(r, `quote_lines?select=item_id&item_id=${inList}&limit=1`)
  const usedJobs = used.length ? [] : await readRecordList(r, `job_lines?select=item_id&item_id=${inList}&limit=1`)
  if (used.length || usedJobs.length) return { ok: false as const, error: 'One of these is already on a quote or a job. Archive it from Products & Services instead of removing it.' }
  const del = await fetch(`${r.url}/rest/v1/products_services?company_id=eq.${companyId}&id=${inList}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  if (!del.ok) return { ok: false as const, error: `Could not remove them: ${del.status} ${await del.text()}` }
  return { ok: true as const, deleted: ids.length }
}
