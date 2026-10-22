// "What materials did we buy this month?" — read off the receipt photos.
//
// London, 2026-10-20, wanted to export the material receipts into an outside
// AI to work out the month's truck stock; Bryce said do it with Arnie. An
// expense row holds the total; the parts are on the photo. Each photo is read
// ONCE (expense_receipt_items keeps what it said), then everything is totalled
// by item. Quantities and descriptions are read, never guessed: a line that
// cannot be read is left out and the receipt is marked.
//
// Money: the list of PARTS is a stock question; what was SPENT is the books.
// The caller decides who sees prices (withPrices) — Arnie passes it only for
// the owner-level people who may already see expenses.

import type { Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'
import { callAnthropic } from './anthropic.ts'
import { ARNIE_MODEL, textOf } from './arnieModel.ts'

export const MATERIAL_CATEGORIES = ['Materials', 'Job Materials', 'Small Tools & Consumables', 'Supplies']
const MAX_IMAGE_BYTES = 4_800_000   // the API takes 5 MB an image
const READS_PER_CALL = 12           // a month is usually fewer; more are read on the next ask

const H = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}` })

// unit: what the quantity counts, as printed (FT, EA, BOX…). A supply house
// sells cable by the foot priced per thousand — "750" of a 250 ft roll is 750
// FEET, and a restock list without the unit reads as 750 rolls (live, 10-21).
export type ReceiptItem = { description: string; sku?: string | null; quantity: number; unit?: string | null; unit_price?: number | null; line_total?: number | null }

/** The photo, as the model takes it — or why not. */
async function photoOf(r: Rest, e: any): Promise<{ media_type: string; data: string } | { error: string }> {
  const path = e.receipt_storage_path
    || String(e.receipt_url || '').match(/\/storage\/v1\/object\/(?:public|sign)\/project-documents\/([^?]+)/)?.[1]
  if (!path) return { error: 'no photo on file' }
  const res = await fetch(`${r.url}/storage/v1/object/project-documents/${path}`, { headers: H(r) })
  if (!res.ok) return { error: `photo not readable (${res.status})` }
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_IMAGE_BYTES) return { error: 'photo too large to read' }
  const type = (res.headers.get('content-type') || '').toLowerCase()
  const media_type = /png/.test(type) ? 'image/png' : /webp/.test(type) ? 'image/webp' : /pdf/.test(type) ? 'application/pdf' : 'image/jpeg'
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { media_type, data: btoa(bin) }
}

const READ_PROMPT = 'Read this purchase receipt. Return JSON only, no prose: '
  + '{"merchant": "<as printed>", "items": [{"description": "<as printed>", "sku": "<SKU/model if printed, else null>", "quantity": <number>, "unit": "<what the QUANTITY counts — FT, EA, BOX, ROLL, PK; a C or M printed after the price is the price per hundred/thousand, not this — else null>", "unit_price": <number or null>, "line_total": <number or null>}]}. '
  + 'Every purchased line, exactly as printed. Leave out tax, totals, payment and discount lines. '
  + 'If a line cannot be read, leave it out — never guess a word or a number. If nothing is readable, return {"merchant": null, "items": []}.'

/** Read one receipt and keep what it said. */
async function readOne(r: Rest, companyId: number, e: any): Promise<{ items: ReceiptItem[]; unreadable: boolean; note?: string }> {
  const photo = await photoOf(r, e)
  let items: ReceiptItem[] = [], merchant: string | null = null, note: string | undefined
  if ('error' in photo) note = photo.error
  else {
    const block = photo.media_type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: photo.media_type, data: photo.data } }
      : { type: 'image', source: { type: 'base64', media_type: photo.media_type, data: photo.data } }
    const ai = await callAnthropic({ feature: 'arnie-receipt-items', companyId }, {
      model: ARNIE_MODEL, max_tokens: 6000, output_config: { effort: 'low' },
      messages: [{ role: 'user', content: [block, { type: 'text', text: READ_PROMPT }] }],
    })
    if (!ai.ok) return { items: [], unreadable: false, note: 'could not be read just now' }   // not kept: try again next time
    try {
      const j = JSON.parse((textOf(ai.data).match(/\{[\s\S]*\}/) || ['{}'])[0])
      merchant = j.merchant || null
      items = (Array.isArray(j.items) ? j.items : [])
        .map((x: any) => ({
          description: String(x?.description || '').trim().slice(0, 160), sku: x?.sku ? String(x.sku).slice(0, 60) : null,
          quantity: Number(x?.quantity) > 0 ? Number(x.quantity) : 1,
          unit: x?.unit ? String(x.unit).toUpperCase().slice(0, 12) : null,
          unit_price: Number.isFinite(Number(x?.unit_price)) ? Number(x.unit_price) : null,
          line_total: Number.isFinite(Number(x?.line_total)) ? Number(x.line_total) : null,
        }))
        .filter((x: ReceiptItem) => x.description)
    } catch { note = 'the reading was not usable' }
  }
  const unreadable = !items.length
  await fetch(`${r.url}/rest/v1/expense_receipt_items`, {
    method: 'POST', headers: { ...H(r), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ expense_id: e.id, company_id: companyId, items, merchant, unreadable, note: note || null, read_at: new Date().toISOString() }),
  }).catch(() => {})
  return { items, unreadable, note }
}

/**
 * What the quantity counts. Supply-house invoices print C or M after the
 * PRICE — per hundred, per thousand — not after the quantity: "750 … 914.21 M"
 * is 750 feet of cable at $914.21 a thousand feet, and "25 … 361.22 C" is 25
 * connectors at $361.22 a hundred. Read as a unit, the list said "750 M"
 * (live, 2026-10-21). Cable and wire are counted in feet; the rest are each.
 */
export function quantityUnit(unit: unknown, description: unknown): string | null {
  const u = String(unit ?? '').trim().toUpperCase()
  if (u === 'M' || u === 'C' || u === 'CWT') {
    // Wire by its marks — a gauge (12/2), a length on the reel (X250), or the
    // word — never the bare "MC": an MC CONNECTOR is sold each.
    const d = String(description ?? '')
    return /\b\d{1,2}\/\d\b|\bx\s?\d{3,4}\b|\b(wire|cable|romex|thhn|thwn|nm-?b|uf-?b|cord|ft|feet)\b/i.test(d) ? 'FT' : 'EA'
  }
  return u || null
}

// Feet and rolls of the same SKU are not added together.
const keyOf = (i: ReceiptItem) => (i.sku ? `sku:${String(i.sku).toLowerCase().replace(/\s+/g, '')}` : `d:${i.description.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`) + `|${String(i.unit || '').toLowerCase()}`

/**
 * The month's (or range's) material receipts, read and totalled by item.
 * expenses: rows with id, date, vendor/merchant, receipt_url/receipt_storage_path, amount.
 */
export async function materialsFromReceipts(r: Rest, companyId: number, expenses: any[], opts: { withPrices: boolean }) {
  const ids = expenses.map((e) => e.id)
  const kept = ids.length
    ? await readRecordList(r, `expense_receipt_items?select=expense_id,items,unreadable,note&company_id=eq.${companyId}&expense_id=in.(${ids.join(',')})`)
    : []
  const byId = new Map(kept.map((k: any) => [k.expense_id, k]))
  const toRead = expenses.filter((e) => !byId.has(e.id) && (e.receipt_url || e.receipt_storage_path))
  const now = toRead.slice(0, READS_PER_CALL)
  for (let i = 0; i < now.length; i += 4) {
    const got = await Promise.all(now.slice(i, i + 4).map((e) => readOne(r, companyId, e)))
    got.forEach((g, j) => byId.set(now[i + j].id, { expense_id: now[i + j].id, items: g.items, unreadable: g.unreadable, note: g.note }))
  }

  const totals = new Map<string, { item: string; sku: string | null; unit: string | null; quantity: number; receipts: number; vendors: Set<string>; spent: number }>()
  let read = 0, unreadable = 0, noPhoto = 0
  for (const e of expenses) {
    const k: any = byId.get(e.id)
    if (!k) { if (!(e.receipt_url || e.receipt_storage_path)) noPhoto++; continue }
    if (k.unreadable) { unreadable++; continue }
    read++
    for (const raw of (k.items || []) as ReceiptItem[]) {
      const it = { ...raw, unit: quantityUnit(raw.unit, raw.description) }
      const key = keyOf(it)
      const t = totals.get(key) || { item: it.description, sku: it.sku || null, unit: it.unit || null, quantity: 0, receipts: 0, vendors: new Set<string>(), spent: 0 }
      t.quantity += Number(it.quantity) || 0
      t.receipts++
      const v = e.vendor || e.merchant
      if (v) t.vendors.add(String(v))
      t.spent += Number(it.line_total) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 0)
      totals.set(key, t)
    }
  }
  const items = [...totals.values()]
    .sort((a, b) => b.receipts - a.receipts || b.quantity - a.quantity)
    .slice(0, 150)
    .map((t) => ({
      item: t.item, ...(t.sku ? { sku: t.sku } : {}), quantity: Math.round(t.quantity * 100) / 100, unit: t.unit || 'not printed',
      on_receipts: t.receipts, vendors: [...t.vendors].slice(0, 4),
      ...(opts.withPrices ? { spent: Math.round(t.spent * 100) / 100 } : {}),
    }))
  return {
    receipts: expenses.length, read, unreadable, without_photo: noPhoto,
    still_to_read: Math.max(0, toRead.length - now.length),
    items,
  }
}
