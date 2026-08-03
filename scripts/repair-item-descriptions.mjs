// Replace invoice_lines whose description is the placeholder "Item" with the
// real product name from products_services. Only touches rows that have an
// item_id to resolve from, and never overwrites a description someone wrote.
// DRY RUN by default; --write to apply.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const WRITE = process.argv.includes('--write')
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3

const { data: rows } = await sb.from('invoice_lines')
  .select('id, invoice_id, item_id, description').eq('company_id', CO).eq('description', 'Item')
const fixable = (rows || []).filter(r => r.item_id)

const ids = [...new Set(fixable.map(r => r.item_id))]
const { data: products } = await sb.from('products_services').select('id, name').in('id', ids)
const nameById = new Map((products || []).map(p => [p.id, p.name]))

console.log(`${WRITE ? 'WRITE' : 'DRY RUN'} — invoice_lines reading "Item": ${(rows || []).length}`)
console.log(`  with an item_id to resolve: ${fixable.length}`)
console.log(`  resolvable to a real name:  ${fixable.filter(r => nameById.get(r.item_id)).length}\n`)

let done = 0
for (const r of fixable) {
  const name = nameById.get(r.item_id)
  if (!name) continue
  console.log(`  line ${String(r.id).padEnd(6)} invoice ${String(r.invoice_id).padEnd(6)} "Item" -> ${name}`)
  if (WRITE) {
    const { error } = await sb.from('invoice_lines').update({ description: name }).eq('id', r.id)
    if (error) console.log(`    FAILED: ${error.message}`)
    else done++
  }
}
console.log(WRITE ? `\nupdated: ${done}` : `\nDry run — nothing written.`)
