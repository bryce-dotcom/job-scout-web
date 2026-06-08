// Backfill existing wattage on audits where the user picked LED
// products via the product picker without recording the existing
// fixture. Uses the same inference logic as the updated lenard-save
// edge function (CONSERVATIVE pre-LED equivalents per fixture
// category). Tags each updated area with [existing watts estimated: NW]
// in override_notes so a field tech can verify on a site visit.
//
// Targets: audits 125, 126, 127, 129 — flagged by Cole and Noah on
// /estimates/4201, /estimates/4405, and as "Lenard - savings showing low".
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function inferExistingWatts(category, newW) {
  if (!newW || newW <= 0) return 0
  const c = (category || '').toLowerCase()
  if (c.includes('high bay') || c.includes('highbay')) {
    if (newW <= 75) return 175
    if (newW <= 110) return 250
    if (newW <= 150) return 400
    if (newW <= 220) return 750
    return 1000
  }
  if (c.includes('linear') || c.includes('panel') || c.includes('strip') || c.includes('troffer') || c.includes('wrap')) {
    if (newW <= 20) return 56
    if (newW <= 30) return 64
    if (newW <= 45) return 96
    if (newW <= 80) return 128
    return 172
  }
  if (c.includes('wall pack') || c.includes('wallpack')) {
    if (newW <= 30) return 100
    if (newW <= 50) return 175
    return 250
  }
  if (c.includes('area light') || c.includes('pole') || c.includes('shoebox') || c.includes('cobra')) {
    if (newW <= 75) return 250
    if (newW <= 150) return 400
    return 1000
  }
  if (c.includes('flood') || c.includes('canopy')) {
    if (newW <= 75) return 175
    if (newW <= 150) return 400
    return 1000
  }
  return Math.round(newW * 1.5)
}

// Be honest about what we can infer — many failing audits show
// fixture_category = 'Linear' regardless of what they actually are
// (default category when the user skipped picking a preset). For those,
// look at the LED product name to refine, otherwise fall back to Linear.
async function inferFromProduct(productId) {
  if (!productId) return null
  const { data } = await sb.from('products_services').select('name, type, product_category').eq('id', productId).maybeSingle()
  if (!data) return null
  const name = (data.name || '').toLowerCase()
  if (/high\s*bay|highbay|hb_/.test(name)) return 'High Bay'
  if (/wall\s*pack|wallpack/.test(name)) return 'Wall Pack'
  if (/area|pole|shoebox|cobra/.test(name)) return 'Area Light'
  if (/flood|canopy/.test(name)) return 'Flood'
  if (/strip|panel|troffer|wrap/.test(name)) return 'Linear'
  return null
}

const TARGET_AUDIT_IDS = [125, 126, 127, 129]
const FORCE = process.argv.includes('--apply')

const log = { auditsTouched: [], areasUpdated: 0, totalsRecomputed: [] }

for (const auditId of TARGET_AUDIT_IDS) {
  const { data: audit } = await sb.from('lighting_audits').select('*').eq('id', auditId).single()
  if (!audit) { console.log(`audit ${auditId} not found`); continue }
  const { data: areas } = await sb.from('audit_areas').select('*').eq('audit_id', auditId)
  if (!areas?.length) { console.log(`audit ${auditId} has no areas`); continue }

  console.log(`\n=== audit ${auditId} — ${areas.length} areas (rate=${audit.electric_rate}/kWh, hrs=${audit.operating_hours}, days=${audit.operating_days}) ===`)

  let totalExistW = 0, totalNewW = 0
  for (const a of areas) {
    let existW = Number(a.existing_wattage) || 0
    const newW = Number(a.led_wattage) || 0
    const qty = Number(a.fixture_count) || 1
    let estimated = false
    if (existW === 0 && newW > 0) {
      let cat = a.fixture_category || ''
      // Refine generic 'Linear' category from product name when possible
      if (cat === 'Linear' || !cat) {
        const refined = await inferFromProduct(a.led_replacement_id)
        if (refined) cat = refined
      }
      existW = inferExistingWatts(cat, newW)
      estimated = existW > 0
    }
    const areaExistTotal = existW * qty
    const areaLEDTotal = newW * qty
    const areaReducedTotal = Math.max(0, areaExistTotal - areaLEDTotal)
    totalExistW += areaExistTotal
    totalNewW += areaLEDTotal

    console.log(`  ${a.area_name?.slice(0,28).padEnd(28)} ${qty}× ${existW}W → ${newW}W ${estimated ? '(estimated)' : ''}`)

    if (estimated && FORCE) {
      const baseNotes = a.override_notes || ''
      const tag = `[existing watts estimated: ${existW}W]`
      const newNotes = baseNotes.includes('existing watts estimated')
        ? baseNotes
        : (baseNotes ? `${baseNotes} ${tag}` : tag)
      await sb.from('audit_areas').update({
        existing_wattage: existW,
        total_existing_watts: areaExistTotal,
        area_watts_reduced: areaReducedTotal,
        override_notes: newNotes,
        updated_at: new Date().toISOString(),
      }).eq('id', a.id)
      log.areasUpdated++
    }
  }

  const wattsReduced = Math.max(0, totalExistW - totalNewW)
  const annualKwhSavings = (wattsReduced * (Number(audit.operating_hours) || 12) * (Number(audit.operating_days) || 365)) / 1000
  const annualDollarSavings = annualKwhSavings * (Number(audit.electric_rate) || 0.10)

  console.log(`  → totalExistW: ${totalExistW}W | totalNewW: ${totalNewW}W | reduced: ${wattsReduced}W`)
  console.log(`  → annual: ${Math.round(annualKwhSavings)} kWh / $${annualDollarSavings.toFixed(2)}/yr`)
  console.log(`  → was: $${audit.annual_savings_dollars}/yr`)
  log.totalsRecomputed.push({ auditId, before: audit.annual_savings_dollars, after: annualDollarSavings.toFixed(2) })

  if (FORCE) {
    await sb.from('lighting_audits').update({
      total_existing_watts: Math.round(totalExistW),
      total_proposed_watts: Math.round(totalNewW),
      watts_reduced: Math.round(wattsReduced),
      annual_savings_kwh: Math.round(annualKwhSavings),
      annual_savings_dollars: Math.round(annualDollarSavings * 100) / 100,
      updated_at: new Date().toISOString(),
    }).eq('id', auditId)
    log.auditsTouched.push(auditId)
  }
}

console.log('\n========================================')
if (FORCE) {
  console.log('APPLIED. Audits updated:', log.auditsTouched.length, '| Areas updated:', log.areasUpdated)
} else {
  console.log('DRY RUN. Pass --apply to write changes.')
  console.log('Recomputed annual savings:')
  for (const r of log.totalsRecomputed) console.log(`  ${r.auditId}: $${r.before} → $${r.after}/yr`)
}
