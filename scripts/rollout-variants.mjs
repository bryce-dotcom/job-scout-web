// Roll variant grouping out to EVERY clean product family.
//
//   node scripts/rollout-variants.mjs            # report only (no writes)
//   node scripts/rollout-variants.mjs --write     # apply the validated families
//
// Safety contract — a family is grouped ONLY if:
//   * >= 3 members, all in the same service group (group_id),
//   * every member's parsed option-map is UNIQUE (no ambiguous resolve),
//   * at least one axis actually varies.
// Families that don't pass (duplicate rows, unparseable) are LEFT ALONE and
// listed in the report. Rows already grouped (e.g. hand-built SMBE Highbay)
// are never touched.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
config()

const WRITE = process.argv.includes('--write')
const COMPANY = 3
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// --- token parsing ----------------------------------------------------------
// A wattage cluster: 2+ numbers joined by "/", each optionally suffixed W, and
// the cluster must carry a W somewhere (so "120/277V" voltage is NOT caught).
const WATT_CLUSTER = /\b\d{1,4}w?(?:\s*\/\s*\d{1,4}w?)+\b/gi
const WATT_SINGLE = /\b(\d{1,4})\s*w\b/i

function parseWattage(name) {
  const clusters = name.match(WATT_CLUSTER) || []
  for (const c of clusters) {
    if (!/w/i.test(c)) continue // must contain a W to be wattage, not voltage
    const nums = c.match(/\d{1,4}/g).map(Number)
    if (!nums.length) continue
    return nums.length === 1 ? `${nums[0]}W` : `${Math.min(...nums)}-${Math.max(...nums)}W`
  }
  const single = name.match(WATT_SINGLE)
  if (single) return `${single[1]}W`
  return null
}

const TOGGLES = [
  ['Lift', /\blift\b/i],
  ['Controls', /\bcontrols?\b/i],
  ['Relocate', /\brelocat\w*\b/i],
  ['Photocell', /\bphoto\s?cell\b/i],
]
const parseToggles = (name) => Object.fromEntries(TOGGLES.map(([k, re]) => [k, re.test(name)]))

// Base key: strip everything that varies within a family.
const baseKey = (name) => String(name || '')
  .replace(WATT_CLUSTER, ' ')
  .replace(WATT_SINGLE, ' ')
  .replace(/\b(lift|controls?|photocell|photo\s?cell|relocat\w*)\b/gi, ' ')
  .replace(/\bw\/\s*/gi, ' ')
  .replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

const toggleCount = (name) => TOGGLES.reduce((n, [, re]) => n + (re.test(name) ? 1 : 0), 0)

function familyLabel(members) {
  const base = [...members].sort((a, b) => toggleCount(a.name) - toggleCount(b.name))[0]
  return base.name
    .replace(WATT_CLUSTER, ' ').replace(WATT_SINGLE, ' ')
    .replace(/\b(lift|controls?|relocat\w*|photo\s?cell)\b/gi, ' ')
    .replace(/\bw\/\s*/gi, ' ').replace(/\//g, ' ')
    .replace(/\s{2,}/g, ' ').replace(/\s*-\s*$/, '').trim()
}

const pageAll = async (t, sel, f) => { const o = []; for (let i = 0; ; i += 1000) { let q = s.from(t).select(sel).range(i, i + 999); if (f) q = f(q); const { data, error } = await q; if (error) { console.error('FAIL', error.message); return o } o.push(...(data || [])); if (!data || data.length < 1000) break } return o }

;(async () => {
  const all = await pageAll('products_services', 'id,name,group_id,unit_price,vendor_sku,variant_group_id,active', q => q.eq('company_id', COMPANY))
  const active = all.filter(x => x.active !== false)

  // group by service group + base key
  const fam = new Map()
  for (const x of active) {
    const bk = baseKey(x.name)
    if (bk.length < 3) continue
    const key = `${x.group_id}::${bk}`
    if (!fam.has(key)) fam.set(key, [])
    fam.get(key).push(x)
  }

  const plan = [], skipped = []
  for (const [key, members] of fam) {
    if (members.length < 3) continue
    if (members.some(m => m.variant_group_id)) { skipped.push({ key, n: members.length, why: 'already grouped' }); continue }

    // parse options for each member
    const familyHasWatt = members.some(m => parseWattage(m.name))
    const usedToggles = TOGGLES.map(([k]) => k).filter(k => members.some(m => parseToggles(m.name)[k]))

    let bad = null
    const parsed = members.map(m => {
      const opts = {}
      if (familyHasWatt) {
        const w = parseWattage(m.name)
        if (!w) bad = bad || `no wattage on "${m.name}"`
        opts.Wattage = w
      }
      const tog = parseToggles(m.name)
      for (const k of usedToggles) opts[k] = tog[k]
      return { m, opts }
    })

    const axisCount = (familyHasWatt ? 1 : 0) + usedToggles.length
    if (axisCount === 0) { skipped.push({ key, n: members.length, why: 'no variant axis found' }); continue }
    if (bad) { skipped.push({ key, n: members.length, why: bad }); continue }

    // uniqueness — each member must map to a distinct option combo
    const sig = (o) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))
    const seen = new Map()
    let collision = null
    for (const p of parsed) {
      const k = sig(p.opts)
      if (seen.has(k)) collision = `${p.m.name}  <=>  ${seen.get(k)} (both -> ${k})`
      else seen.set(k, p.m.name)
    }
    if (collision) { skipped.push({ key, n: members.length, why: `duplicate combo: ${collision}` }); continue }

    // must actually vary
    if (seen.size < 2) { skipped.push({ key, n: members.length, why: 'only one distinct combo' }); continue }

    plan.push({ key, members, parsed, label: familyLabel(members), axes: [familyHasWatt && 'Wattage', ...usedToggles].filter(Boolean) })
  }

  // ---- report ----
  plan.sort((a, b) => b.members.length - a.members.length)
  skipped.sort((a, b) => b.n - a.n)
  const totalGrouped = plan.reduce((n, f) => n + f.members.length, 0)
  console.log(`\n=== WILL GROUP: ${plan.length} families, ${totalGrouped} products ===`)
  for (const f of plan) {
    const skus = f.members.filter(m => m.vendor_sku).length
    console.log(`\n  [${f.members.length}] "${f.label}"  axes: ${f.axes.join(' + ')}  (${skus}/${f.members.length} have order codes)`)
    for (const p of f.parsed.slice(0, 4)) console.log(`       #${p.m.id}  ${JSON.stringify(p.opts)}  <- ${p.m.name}`)
    if (f.parsed.length > 4) console.log(`       ...+${f.parsed.length - 4} more`)
  }
  console.log(`\n=== SKIPPED: ${skipped.length} families (left as individual rows) ===`)
  for (const sk of skipped) console.log(`  [${sk.n}] ${sk.key.split('::')[1]} — ${sk.why}`)

  if (!WRITE) { console.log('\n[report only] re-run with --write to apply the WILL GROUP list.'); return }

  console.log(`\n\nApplying ${plan.length} families...`)
  let fCount = 0, rCount = 0, fail = 0
  for (const f of plan) {
    const gid = randomUUID()
    for (const p of f.parsed) {
      const { error } = await s.from('products_services')
        .update({ variant_group_id: gid, variant_group_label: f.label, variant_options: p.opts })
        .eq('id', p.m.id).eq('company_id', COMPANY)
      if (error) { console.error(`  FAIL #${p.m.id}: ${error.message}`); fail++ } else rCount++
    }
    fCount++
  }
  console.log(`\nDone. families=${fCount} rows=${rCount} failed=${fail}`)
})()
