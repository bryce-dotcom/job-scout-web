#!/usr/bin/env node
// Seed the SHARED utility catalogue (company_id NULL — every tenant reads it)
// from AI utility research, one state at a time. This is how a sellable
// JobScout arrives pre-loaded with a market's utilities, programs, incentive
// rates, prescriptive measures, rate schedules and application forms.
//
//   node scripts/seed-utility-research.mjs --state WY --research             research only, cache to --dir
//   node scripts/seed-utility-research.mjs --state WY                        dry run from the cache (default)
//   node scripts/seed-utility-research.mjs --state WY --apply                write the rows
//   node scripts/seed-utility-research.mjs --state WY --apply --providers "Rocky Mountain Power"
//   node scripts/seed-utility-research.mjs --state NV --research --programs "Sure Bet|Small Business" --apply
//
// Flags
//   --state ST          two-letter state (required)
//   --research          call ai-utility-research (discover, then one measures
//                       call per program, --concurrency N at a time) and
//                       cache the JSON in --dir; without it the cache is used
//   --dir PATH          cache directory (default scripts/.utility-research)
//   --providers "a|b"   only seed providers whose name matches (regex, i)
//   --programs "a|b"    only research/seed programs whose name matches
//   --apply             write; otherwise print what would be written
//
// Rows are written exactly as Data Console > Utilities > Import would write
// them (same columns, same defaults) and de-duplicated by natural key, so
// re-running is safe: an existing provider/program/schedule/form/measure is
// reused, never duplicated. Uses the service role; the research function
// accepts the platform's service key as a caller.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] }
const has = (n) => argv.includes(n)
const STATE = (flag('--state') || '').toUpperCase()
if (!/^[A-Z]{2}$/.test(STATE)) { console.error('--state ST is required'); process.exit(1) }
const APPLY = has('--apply')
const RESEARCH = has('--research')
const DIR = flag('--dir') || path.join('scripts', '.utility-research')
const CONCURRENCY = Number(flag('--concurrency') || 2)
const providerRx = flag('--providers') ? new RegExp(flag('--providers'), 'i') : null
const programRx = flag('--programs') ? new RegExp(flag('--programs'), 'i') : null

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('.env needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

// ── research (cached) ───────────────────────────────────────────────────────
const discoverFile = path.join(DIR, `discover-${STATE}.json`)
const measuresFile = path.join(DIR, `measures-${STATE}.json`)

async function phase(body) {
  const r = await fetch(`${URL}/functions/v1/ai-utility-research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, apikey: env.VITE_SUPABASE_ANON_KEY || KEY },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let data = null
  try { data = JSON.parse(text.trim()) } catch { /* below */ }
  if (!r.ok || !data) throw new Error(`${body.phase}: HTTP ${r.status} ${text.slice(0, 200)}`)
  if (!data.success) throw new Error(`${body.phase}: ${data.error}`)
  return data
}

async function runWithConcurrency(items, limit, fn) {
  const out = new Array(items.length); let next = 0
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) } }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

async function research() {
  fs.mkdirSync(DIR, { recursive: true })
  console.log(`research ${STATE}: discover…`)
  const t0 = Date.now()
  const disc = await phase({ state: STATE, phase: 'discover' })
  fs.writeFileSync(discoverFile, JSON.stringify(disc, null, 1))
  const programs = disc.results.programs.filter(p => p.program_name && (!programRx || programRx.test(p.program_name)) && (!providerRx || providerRx.test(p.provider_name)))
  console.log(`  ${disc.results.providers.length} providers, ${disc.results.programs.length} programs (${programs.length} to research), ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  const measures = await runWithConcurrency(programs, CONCURRENCY, async (program) => {
    const t1 = Date.now()
    try {
      const r = await phase({ state: STATE, phase: 'measures', programs: [program] })
      console.log(`  measures ${program.provider_name} / ${program.program_name}: ${r.results.incentives.length} incentives, ${r.results.prescriptive_measures.length} measures, ${((Date.now() - t1) / 1000).toFixed(0)}s`)
      return r
    } catch (err) {
      console.log(`  measures ${program.program_name}: FAILED ${err.message}`)
      return null
    }
  })
  fs.writeFileSync(measuresFile, JSON.stringify(measures.filter(Boolean), null, 1))
}

// ── load + merge cache ──────────────────────────────────────────────────────
function load() {
  if (!fs.existsSync(discoverFile)) { console.error(`no cache at ${discoverFile}; run with --research`); process.exit(1) }
  const disc = JSON.parse(fs.readFileSync(discoverFile, 'utf8'))
  const res = { providers: [], programs: [], incentives: [], prescriptive_measures: [], rate_schedules: [], forms: [], ...disc.results }
  if (fs.existsSync(measuresFile)) {
    for (const m of JSON.parse(fs.readFileSync(measuresFile, 'utf8'))) {
      res.incentives = res.incentives.concat(m?.results?.incentives || [])
      res.prescriptive_measures = res.prescriptive_measures.concat(m?.results?.prescriptive_measures || [])
    }
  }
  const keepProvider = (name) => !providerRx || providerRx.test(name || '')
  const keepProgram = (p) => keepProvider(p.provider_name) && (!programRx || programRx.test(p.program_name || ''))
  res.providers = res.providers.filter(p => keepProvider(p.provider_name))
  res.programs = res.programs.filter(keepProgram)
  const programKeys = new Set(res.programs.map(p => `${p.provider_name}|${p.program_name}`))
  res.incentives = res.incentives.filter(r => programKeys.has(`${r.provider_name}|${r.program_name}`))
  res.prescriptive_measures = res.prescriptive_measures.filter(r => programKeys.has(`${r.provider_name}|${r.program_name}`))
  res.rate_schedules = res.rate_schedules.filter(r => keepProvider(r.provider_name))
  res.forms = res.forms.filter(f => keepProvider(f.provider_name))
  return res
}

// ── write (idempotent) ──────────────────────────────────────────────────────
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : null)
const int = (v) => (v == null || v === '' ? null : parseInt(v) || null)
const num = (v) => (v == null || v === '' ? null : parseFloat(v) || null)
const counts = { providers: 0, programs: 0, incentives: 0, measures: 0, schedules: 0, forms: 0, reused: 0 }

async function one(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

// "Rocky Mountain Power (PacifiCorp)" and "Rocky Mountain Power" are the
// same utility; research runs vary the parenthetical. Match on the name
// before any " (" so a re-run never seeds a twin.
const baseName = (name) => String(name || '').replace(/\s*\(.*$/, '').trim()

async function upsertProvider(p) {
  const existing = await one(
    sb.from('utility_providers').select('id, provider_name').is('company_id', null).eq('state', STATE)
      .or(`provider_name.ilike.${JSON.stringify(p.provider_name)},provider_name.ilike.${JSON.stringify(baseName(p.provider_name) + '%')}`)
      .limit(1),
    'find provider',
  )
  if (existing?.[0]) { counts.reused++; return existing[0] }
  const row = {
    provider_name: p.provider_name, state: STATE, service_territory: p.service_territory || null,
    has_rebate_program: p.has_rebate_program ?? true, rebate_program_url: p.rebate_program_url || null,
    contact_phone: p.contact_phone || null, notes: p.notes || null,
  }
  counts.providers++
  if (!APPLY) return { id: `new:${p.provider_name}`, provider_name: p.provider_name }
  return (await one(sb.from('utility_providers').insert(row).select('id, provider_name'), 'insert provider'))[0]
}

async function upsertProgram(pr, utilityName) {
  const existing = await one(sb.from('utility_programs').select('id').is('company_id', null).eq('utility_name', utilityName).ilike('program_name', pr.program_name).limit(1), 'find program')
  if (existing?.[0]) { counts.reused++; return existing[0] }
  const row = {
    utility_name: utilityName, program_name: pr.program_name,
    program_type: pr.program_type || 'Prescriptive', program_category: pr.program_category || 'Lighting',
    delivery_mechanism: pr.delivery_mechanism || null, business_size: pr.business_size || 'All',
    dlc_required: pr.dlc_required ?? false, pre_approval_required: pr.pre_approval_required ?? false,
    application_required: pr.application_required ?? false, post_inspection_required: pr.post_inspection_required ?? false,
    contractor_prequalification: pr.contractor_prequalification ?? false, program_url: pr.program_url || null,
    max_cap_percent: int(pr.max_cap_percent), annual_cap_dollars: num(pr.annual_cap_dollars), source_year: int(pr.source_year),
    eligible_sectors: asArray(pr.eligible_sectors), eligible_building_types: asArray(pr.eligible_building_types),
    required_documents: asArray(pr.required_documents), stacking_allowed: pr.stacking_allowed ?? true,
    stacking_rules: pr.stacking_rules || null, funding_status: pr.funding_status || 'Open',
    processing_time_days: int(pr.processing_time_days), rebate_payment_method: pr.rebate_payment_method || null,
    program_notes_ai: pr.program_notes_ai || null,
  }
  counts.programs++
  if (!APPLY) return { id: `new:${pr.program_name}` }
  return (await one(sb.from('utility_programs').insert(row).select('id'), 'insert program'))[0]
}

async function insertIfMissing(table, findQuery, row, counter) {
  const existing = await one(findQuery.limit(1), `find ${table}`)
  if (existing?.[0]) { counts.reused++; return }
  counts[counter]++
  if (APPLY) await one(sb.from(table).insert(row).select('id'), `insert ${table}`)
}

async function seed(res) {
  const providers = {}
  for (const p of res.providers) providers[p.provider_name] = await upsertProvider(p)
  const programs = {}
  for (const pr of res.programs) {
    if (!providers[pr.provider_name]) { console.warn(`  skip program (no provider): ${pr.provider_name} / ${pr.program_name}`); continue }
    programs[`${pr.provider_name}|${pr.program_name}`] = await upsertProgram(pr, providers[pr.provider_name].provider_name)
  }
  const pid = (r) => programs[`${r.provider_name}|${r.program_name}`]?.id
  for (const r of res.incentives) {
    const program_id = pid(r); if (!program_id) continue
    if (!APPLY && String(program_id).startsWith('new:')) { counts.incentives++; continue }
    await insertIfMissing('incentive_measures',
      sb.from('incentive_measures').select('id').eq('program_id', program_id).is('company_id', null).eq('measure_category', r.measure_category || 'Lighting').eq('fixture_category', r.fixture_category ?? '').eq('tier', r.tier ?? ''),
      {
        program_id, fixture_category: r.fixture_category, measure_category: r.measure_category || 'Lighting',
        measure_subcategory: r.measure_subcategory || null, measure_type: r.measure_type || 'LED Retrofit',
        calc_method: r.calc_method || 'Per Watt Reduced', rate: r.rate_value ?? r.rate, rate_value: r.rate_value ?? r.rate,
        rate_unit: r.rate_unit || '/watt', tier: r.tier || null, cap_amount: r.cap_amount || null, cap_percent: r.cap_percent || null,
        per_unit_cap: r.per_unit_cap || null, equipment_requirements: r.equipment_requirements || null,
        installation_requirements: r.installation_requirements || null, baseline_description: r.baseline_description || null,
        replacement_description: r.replacement_description || null, requirements: r.requirements || null,
        effective_date: r.effective_date || null, expiration_date: r.expiration_date || null,
        min_watts: r.min_watts || null, max_watts: r.max_watts || null, notes: r.notes || null,
      }, 'incentives')
  }
  for (const pm of res.prescriptive_measures) {
    const program_id = pid(pm); if (!program_id || !pm.measure_name) continue
    if (!APPLY && String(program_id).startsWith('new:')) { counts.measures++; continue }
    await insertIfMissing('prescriptive_measures',
      sb.from('prescriptive_measures').select('id').eq('program_id', program_id).is('company_id', null).ilike('measure_name', pm.measure_name),
      {
        program_id, measure_code: pm.measure_code || null, measure_name: pm.measure_name,
        measure_category: pm.measure_category || 'Lighting', measure_subcategory: pm.measure_subcategory || null,
        baseline_equipment: pm.baseline_equipment || null, baseline_wattage: num(pm.baseline_wattage),
        replacement_equipment: pm.replacement_equipment || null, replacement_wattage: num(pm.replacement_wattage),
        incentive_amount: num(pm.incentive_amount), incentive_unit: pm.incentive_unit || 'per_fixture',
        incentive_formula: pm.incentive_formula || null, max_incentive: num(pm.max_incentive),
        location_type: pm.location_type || null, application_type: pm.application_type || 'retrofit',
        dlc_required: pm.dlc_required ?? false, dlc_tier: pm.dlc_tier || null, energy_star_required: pm.energy_star_required ?? false,
        hours_requirement: num(pm.hours_requirement), source_page: pm.source_page || null, source_pdf_url: pm.source_pdf_url || null,
        needs_pdf_upload: pm.needs_pdf_upload ?? true, notes: pm.notes || null,
      }, 'measures')
  }
  for (const rs of res.rate_schedules) {
    const provider_id = providers[rs.provider_name]?.id; if (!provider_id || !rs.schedule_name) continue
    if (!APPLY && String(provider_id).startsWith('new:')) { counts.schedules++; continue }
    await insertIfMissing('utility_rate_schedules',
      sb.from('utility_rate_schedules').select('id').eq('provider_id', provider_id).is('company_id', null).ilike('schedule_name', rs.schedule_name),
      {
        provider_id, schedule_name: rs.schedule_name, customer_category: rs.customer_category || null, rate_type: rs.rate_type || 'Flat',
        rate_per_kwh: num(rs.rate_per_kwh), peak_rate_per_kwh: num(rs.peak_rate_per_kwh), off_peak_rate_per_kwh: num(rs.off_peak_rate_per_kwh),
        summer_rate_per_kwh: num(rs.summer_rate_per_kwh), winter_rate_per_kwh: num(rs.winter_rate_per_kwh), demand_charge: num(rs.demand_charge),
        min_demand_charge: num(rs.min_demand_charge), customer_charge: num(rs.customer_charge), time_of_use: rs.time_of_use ?? false,
        effective_date: rs.effective_date || null, source_url: rs.source_url || null, description: rs.description || null, notes: rs.notes || null,
      }, 'schedules')
  }
  for (const f of res.forms) {
    const provider_id = providers[f.provider_name]?.id; if (!provider_id || !f.form_name) continue
    if (!APPLY && String(provider_id).startsWith('new:')) { counts.forms++; continue }
    const program_id = f.program_name ? (pid(f) || null) : null
    await insertIfMissing('utility_forms',
      sb.from('utility_forms').select('id').eq('provider_id', provider_id).is('company_id', null).ilike('form_name', f.form_name),
      {
        provider_id, program_id: program_id && !String(program_id).startsWith('new:') ? program_id : null,
        form_name: f.form_name, form_type: f.form_type || 'Application', form_url: f.form_url || null,
        version_year: int(f.version_year), is_required: f.is_required ?? false, form_notes: f.form_notes || null, status: 'dev',
      }, 'forms')
  }
}

if (RESEARCH) await research()
const res = load()
console.log(`\n${APPLY ? 'SEEDING' : 'DRY RUN'} ${STATE}: ${res.providers.length} providers, ${res.programs.length} programs, ${res.incentives.length} incentives, ${res.prescriptive_measures.length} measures, ${res.rate_schedules.length} schedules, ${res.forms.length} forms`)
for (const p of res.providers) console.log(`  provider ${p.provider_name}`)
for (const p of res.programs) console.log(`    program ${p.provider_name} / ${p.program_name}`)
await seed(res)
console.log(`\n${APPLY ? 'wrote' : 'would write'}: ${JSON.stringify(counts)}`)
if (!APPLY) console.log('re-run with --apply to write')
