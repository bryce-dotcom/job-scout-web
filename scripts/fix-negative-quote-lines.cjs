// Rebuild quote_lines for any quote that has negative line_totals from
// the Lenard wattage-delta bug. Reads the audit's notes JSON to recover
// the productPrice per line and rewrites quote_lines.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
;(async () => {
  // Find all quote_ids with any negative line_total
  const all = []
  for (let from = 0; ; from += 1000) {
    const r = await s.from('quote_lines').select('quote_id,line_total').lt('line_total', 0).range(from, from + 999)
    if (r.error) { console.error(r.error); return }
    all.push(...r.data)
    if (r.data.length < 1000) break
  }
  const quoteIds = [...new Set(all.map(l => l.quote_id))]
  console.log(`Quotes with negative lines: ${quoteIds.length}`)

  for (const qid of quoteIds) {
    const q = (await s.from('quotes').select('id,audit_id,quote_amount,lead_id,company_id').eq('id', qid).single()).data
    if (!q?.audit_id) {
      console.log(`  #${qid}: no audit_id, skipping`)
      continue
    }
    const a = (await s.from('lighting_audits').select('id,notes').eq('id', q.audit_id).single()).data
    let auditLines = []
    try { auditLines = JSON.parse(a?.notes || '{}').lines || [] }
    catch { console.log(`  #${qid}: audit notes not parseable, skipping`); continue }
    if (!auditLines.length) { console.log(`  #${qid}: 0 audit lines, skipping`); continue }

    const sumByPrice = auditLines.reduce((s, l) => s + ((l.qty || 1) * (Number(l.productPrice) || 0)), 0)
    const scale = (sumByPrice > 0 && Math.abs(sumByPrice - q.quote_amount) > 1) ? (q.quote_amount / sumByPrice) : 1

    const newRows = auditLines.map((l, i) => {
      const qty = l.qty || 1
      const basePrice = Number(l.productPrice) || 0
      const unitPrice = basePrice * scale
      return {
        company_id: q.company_id,
        quote_id: qid,
        item_name: `${l.name || `Area ${i + 1}`} - LED Retrofit`,
        item_id: l.productId ? parseInt(l.productId) : null,
        quantity: qty,
        price: Math.round(unitPrice * 100) / 100,
        line_total: Math.round(qty * unitPrice * 100) / 100,
      }
    })
    const total = newRows.reduce((s, r) => s + r.line_total, 0)
    console.log(`  #${qid}: audit=${q.audit_id}  ${auditLines.length} lines  new total=$${total.toFixed(2)}  (quote_amount=$${q.quote_amount})`)

    if (!APPLY) continue
    await s.from('quote_lines').delete().eq('quote_id', qid)
    const ins = await s.from('quote_lines').insert(newRows).select('id')
    if (ins.error) { console.error(`  Insert failed: ${ins.error.message}`); continue }
    console.log(`    ✓ Rewrote ${ins.data.length} lines`)
  }
  if (!APPLY) console.log('\n[DRY RUN] Pass --apply to commit.')
})()
