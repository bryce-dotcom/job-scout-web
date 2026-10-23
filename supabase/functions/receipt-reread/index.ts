// Receipts the phone lost — read again from the stored photo (Bryce,
// 2026-10-22).
//
// A tech snaps a receipt and pockets the phone. The read finishes on the
// server, but the answer is lost while the app sleeps, and the expense goes
// in at $0 "Dougie could not read it" (two clear Home Depot receipts that way
// in October). The photo is always stored first, so the server can read it
// itself.
//
// Every ten minutes (pg_cron, migration 20261022200000): receipt rows still
// at $0, with a photo, older than five minutes (the phone's own read and its
// one retry have had their turn), younger than two weeks, fewer than three
// tries. Each is read by scan-receipt — the same reader and prompt as the
// phone — mapped by _shared/receiptFields (the same mapping), and only what
// is still missing is filled. The write is conditional on amount still being
// 0, so a person who typed it meanwhile wins. Books links it to the bank
// charge on its next load (expenseMatch.autoLinkReceipts), as for any read.
//
// What three tries cannot read stays $0 and is flagged on the Expenses page.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isCronCaller } from "../_shared/cronAuth.ts";
import { expenseFieldsFromReceipt, rereadPatch } from "../_shared/receiptFields.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const MAX_TRIES = 3
const PER_RUN = 6            // ~10s a read; well inside the function's time
const MAX_IMAGE_BYTES = 3_700_000  // the API takes 5MB of image; base64 adds a third

serve(async (req) => {
  const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!(await isCronCaller(req, { url: URL_, key: KEY }))) return json({ error: 'servers only' }, 401)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  const body = await req.json().catch(() => ({})) as Record<string, any>

  const now = Date.now()
  const older = new Date(now - 5 * 60_000).toISOString()
  const newer = new Date(now - 14 * 86_400_000).toISOString()
  // { ids: [...] } reads those rows now (a person pressing "try again"); the
  // schedule takes the oldest waiting.
  const only = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite).slice(0, PER_RUN) : null
  const sel = 'id,company_id,amount,merchant,vendor,receipt,description,category,tax_category,receipt_storage_path,receipt_read_attempts'
  const q = only
    ? `expenses?select=${sel}&id=in.(${only.join(',')})&amount=eq.0&receipt_storage_path=not.is.null`
    : `expenses?select=${sel}&amount=eq.0&receipt_storage_path=not.is.null&receipt_read_attempts=lt.${MAX_TRIES}&created_at=lt.${older}&created_at=gt.${newer}&order=created_at.asc&limit=${PER_RUN}`
  const rows: any[] = await (await fetch(`${URL_}/rest/v1/${q}`, { headers: H })).json().catch(() => [])
  if (!Array.isArray(rows)) return json({ error: 'could not list receipts' }, 500)

  const cats = new Map<number, any[]>()
  const results: any[] = []
  for (const row of rows) {
    let outcome = 'unread'
    let patch: Record<string, any> = {}
    try {
      if (!cats.has(row.company_id)) {
        const c = await (await fetch(`${URL_}/rest/v1/expense_categories?select=name,type,default_tax_category&or=(company_id.is.null,company_id.eq.${row.company_id})&order=sort_order&order=name`, { headers: H })).json().catch(() => [])
        cats.set(row.company_id, (Array.isArray(c) ? c : []).filter((x: any) => x.type !== 'income'))
      }
      const categories = cats.get(row.company_id)!
      const file = await fileFor(URL_, KEY, row.receipt_storage_path)
      if (!file) outcome = 'no_file'
      else {
        const r = await fetch(`${URL_}/functions/v1/scan-receipt`, {
          method: 'POST', headers: H,
          body: JSON.stringify({ mode: 'expense', company_id: row.company_id, categories: categories.map((c) => c.name), ...file }),
        })
        const j = await r.json().catch(() => ({}))
        if (j?.success && j.extracted) {
          patch = rereadPatch(row, expenseFieldsFromReceipt(j.extracted, categories))
          outcome = patch.amount ? 'read' : 'no_amount'
        } else outcome = 'failed'
      }
    } catch (e) {
      outcome = 'failed'
      console.error('[receipt-reread]', row.id, (e as Error)?.message)
    }
    // Still $0 at the moment of writing — a person's typing wins.
    const w = await fetch(`${URL_}/rest/v1/expenses?id=eq.${row.id}&amount=eq.0`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ ...patch, receipt_read_attempts: (row.receipt_read_attempts || 0) + 1, receipt_read_at: new Date().toISOString() }),
    })
    const wrote = w.ok ? ((await w.json().catch(() => [])) as any[]).length : 0
    results.push({ id: row.id, outcome: wrote ? outcome : 'changed_meanwhile', amount: patch.amount ?? null })
  }
  if (results.length) console.log('[receipt-reread]', JSON.stringify(results))
  return json({ checked: results.length, results })
})

/** The stored photo as scan-receipt takes it: a phone-sized JPEG, or the PDF. */
async function fileFor(url: string, key: string, path: string): Promise<Record<string, any> | null> {
  const A = { Authorization: `Bearer ${key}`, apikey: key }
  const enc = encodeURI(path)
  const b64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf); let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }
  if (/\.pdf$/i.test(path)) {
    const r = await fetch(`${url}/storage/v1/object/project-documents/${enc}`, { headers: A })
    return r.ok ? { document: { base64: b64(await r.arrayBuffer()) } } : null
  }
  // Supabase resizes on the way out — the same 1568px the phone sends.
  const r = await fetch(`${url}/storage/v1/render/image/authenticated/project-documents/${enc}?width=1568&height=1568&resize=contain&quality=85`, { headers: A })
  // The resizer keeps the format: a PNG screenshot comes back a PNG, and
  // calling it a JPEG fails the read (#75, 2026-10-22).
  const rType = (r.headers.get('content-type') || '').split(';')[0].trim()
  if (r.ok && /^image\/(jpeg|png|gif|webp)$/.test(rType)) return { image: { base64: b64(await r.arrayBuffer()), mediaType: rType } }
  const o = await fetch(`${url}/storage/v1/object/project-documents/${enc}`, { headers: A })
  if (!o.ok) return null
  const type = o.headers.get('content-type') || ''
  const buf = await o.arrayBuffer()
  if (!/^image\/(jpeg|png|gif|webp)$/.test(type) || buf.byteLength > MAX_IMAGE_BYTES) return null
  return { image: { base64: b64(buf), mediaType: type } }
}
