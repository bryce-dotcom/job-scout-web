// Per Bryce: ALL the SMBE 40/50/64W bundles are mislabeled and the
// MES child they wire to is wrong. The correct SMBE/MES 8ft strip is
// 40/53/68/80W at $68 cost (MES product 2104, SKU 6686, catalog
// 02382 05 "LED 8FT Covered Strip Fixture (Juniper GSR+)").
//
// Rename + repoint family:
//   1432 SMBE 40/50/64W Linear Strip - 8ft
//   1433 SMBE 40/50/64W Linear Strip - 8ft w/ Lift
//   1434 SMBE 40/50/64W Linear Strip - 8ft Relocate
//   1435 SMBE 40/50/64W Linear Strip - 8ft Relocate w/ Lift
//   1437 SMBE 40/50/64W Linear Strip - 8ft w/ Lift w/ Controls
//   1438 SMBE 40/50/64W Linear Strip - 8ft Relocate w/ Controls
//   1439 SMBE 40/50/64W Linear Strip - 8ft Relocate/Lift/Controls
// (1436 was already fixed by _fix_smbe_8ft_strip_bug.mjs)
//
// Action per bundle:
//   1) Rename "SMBE 40/50/64W" → "SMBE 40/53/68/80W"
//   2) Repoint component 2141 → 2104

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN — pass --apply ===\n')

const BUNDLE_IDS = [1432, 1433, 1434, 1435, 1437, 1438, 1439]
const log = { renames: [], repoints: [], jobLineRefreshes: [], warnings: [] }

for (const id of BUNDLE_IDS) {
  const { data: p } = await sb.from('products_services').select('id, name, description, unit_price, active').eq('id', id).single()
  if (!p) { console.log('  WARN: bundle', id, 'not found'); continue }
  const oldName = p.name
  const newName = oldName.replace('SMBE 40/50/64W', 'SMBE 40/53/68/80W')
  if (oldName === newName) {
    console.log('  bundle', id, '— name already correct or pattern mismatch:', oldName)
    log.warnings.push(`bundle ${id} no name change`)
    continue
  }
  console.log('  Bundle', id, '|', oldName)
  console.log('    →        ', newName)

  if (APPLY) {
    const newDesc = (p.description || '') + (p.description ? '\n\n' : '') +
      '[Renamed 2026-06-08 — actual SMBE wattages are 40W/53W/68W/80W per MES catalog 02382 05 (SKU 6686). Previously labeled 40/50/64W which was incorrect.]'
    await sb.from('products_services').update({
      name: newName,
      description: newDesc,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }
  log.renames.push({ id, from: oldName, to: newName })

  // Repoint component
  const { data: comps } = await sb.from('product_components').select('id, parent_product_id, component_product_id, quantity').eq('parent_product_id', id)
  const edge2141 = (comps || []).find(c => c.component_product_id === 2141)
  if (!edge2141) {
    console.log('    (no child 2141 found; bundle was already repointed or uses a different child)')
    log.warnings.push(`bundle ${id} no child 2141`)
    continue
  }
  console.log('    Repoint edge', edge2141.id, '| 2141 → 2104')
  if (APPLY) {
    await sb.from('product_components').update({
      component_product_id: 2104,
    }).eq('id', edge2141.id)
  }
  log.repoints.push({ edgeId: edge2141.id, parent: id, oldChild: 2141, newChild: 2104 })
}

// ---------- Refresh snapshots on Open/Scheduled/InProgress job_lines so crews see right name now ----------
console.log('\n=== Refresh snapshots on ACTIVE-status job_lines using any of these bundles ===')
const { data: jl } = await sb.from('job_lines').select('id, job_id, item_id, item_name').in('item_id', BUNDLE_IDS)
for (const l of jl || []) {
  const { data: j } = await sb.from('jobs').select('id, status').eq('id', l.job_id).maybeSingle()
  const status = j?.status || ''
  const isActive = ['Scheduled', 'In Progress', 'Need To Order', 'Waiting Product', 'Post Inspection (Req)'].includes(status)
  const { data: bundle } = await sb.from('products_services').select('name').eq('id', l.item_id).single()
  console.log('  job', l.job_id, '| status:', status, '| line', l.id, '| item_id:', l.item_id, '| snapshot:', (l.item_name||'(none)').slice(0,40), isActive ? '← active, refresh' : '(closed/invoiced, leave alone)')
  if (isActive && APPLY) {
    await sb.from('job_lines').update({
      item_name: bundle.name,
      updated_at: new Date().toISOString(),
    }).eq('id', l.id)
    log.jobLineRefreshes.push({ jobLineId: l.id, jobId: l.job_id, newSnapshot: bundle.name })
  }
}

console.log('\n========================================')
console.log(APPLY ? 'APPLIED:' : 'DRY RUN — pass --apply')
console.log(' renames:    ', log.renames.length)
console.log(' repoints:   ', log.repoints.length)
console.log(' jobLineRef: ', log.jobLineRefreshes.length)
console.log(' warnings:   ', log.warnings.length)

const fs = await import('node:fs')
fs.writeFileSync('./scripts/_fix_smbe_8ft_family_log.json', JSON.stringify({ applied: APPLY, ranAt: new Date().toISOString(), ...log }, null, 2))
