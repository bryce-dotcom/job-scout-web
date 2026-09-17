// A new company, set up from a conversation.
//
// "We're Halifax Electric, 4410 S State St Murray UT, LLC, we do
// commercial lighting" — and that is most of the setup. The address
// carries the state; the state carries the time zone, whether there is a
// state income tax and at what rate, the sales-tax floor and whether
// services are taxed, the SUI wage base and the new-employer rate, the
// workers' comp regime. The trade carries the NAICS code, the service
// types, the warranty defaults and which AI agents to turn on. The entity
// type carries the tax form. Payroll frequency and the pay days are the
// one thing a person has to choose, and even those get a sensible default.
//
// Everything derived is SHOWN on the card with where it came from —
// derived / estimate / needs you — and nothing is written until the owner
// approves. Rollback restores the company row and the settings rows to
// exactly what they were, and removes the agents it turned on.
//
// Who: the owner (level 4) or an admin — the same people who can edit
// Settings → Company.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { STATE_PROFILES, stateProfile, tradeFor, entityFor, type StateProfile, type TradeProfile } from './stateProfiles.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })

// ── the address → its parts ────────────────────────────────────────────

export interface Place { formatted: string; street: string; city: string; county: string; state: string; zip: string; lat: number | null; lng: number | null; source: 'google' | 'nominatim' | 'parsed' }

/**
 * Google Geocoding when the server has a key, Nominatim otherwise, and a
 * plain parse of "…, City, ST 84003" as the last resort — so a bad network
 * never blocks a setup, it just derives less.
 */
export async function geocode(address: string): Promise<Place | null> {
  const a = String(address || '').trim()
  if (a.length < 8) return null
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (key) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(a)}&region=us&key=${key}`)
      const j = await res.json()
      const r0 = j?.results?.[0]
      if (j?.status === 'OK' && r0) {
        const part = (t: string, short = true) => { const c = (r0.address_components || []).find((x: any) => (x.types || []).includes(t)); return c ? (short ? c.short_name : c.long_name) : '' }
        const street = [part('street_number'), part('route', false)].filter(Boolean).join(' ')
        return { formatted: r0.formatted_address, street, city: part('locality', false) || part('sublocality', false) || part('postal_town', false), county: part('administrative_area_level_2', false).replace(/ County$/, ''), state: part('administrative_area_level_1'), zip: part('postal_code'), lat: r0.geometry?.location?.lat ?? null, lng: r0.geometry?.location?.lng ?? null, source: 'google' }
      }
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=us&q=${encodeURIComponent(a)}`, { headers: { 'User-Agent': 'JobScout/1.0 (company setup)' } })
    const j = await res.json()
    const r0 = j?.[0]
    if (r0?.address) {
      const ad = r0.address
      const state = STATE_ABBR[String(ad.state || '').toLowerCase()] || ''
      return { formatted: r0.display_name, street: [ad.house_number, ad.road].filter(Boolean).join(' '), city: ad.city || ad.town || ad.village || ad.hamlet || '', county: String(ad.county || '').replace(/ County$/, ''), state, zip: ad.postcode || '', lat: Number(r0.lat), lng: Number(r0.lon), source: 'nominatim' }
    }
  } catch { /* fall through */ }
  const m = a.match(/^(.*?),?\s*([A-Za-z .]+?),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/)
  if (m) return { formatted: a, street: m[1].trim(), city: m[2].trim(), county: '', state: m[3].toUpperCase(), zip: m[4], lat: null, lng: null, source: 'parsed' }
  return null
}

const STATE_ABBR: Record<string, string> = Object.fromEntries(Object.values(STATE_PROFILES).map((s) => [s.name.toLowerCase(), s.code]))

// ── the derivation ─────────────────────────────────────────────────────

export interface Derived {
  company: Record<string, unknown>
  settings: Record<string, unknown>          // key → value (object; stored as JSON)
  agents: string[]
  lines: { label: string; value: string; source: 'you' | 'derived' | 'estimate' | 'needs_you' }[]
  needsYou: string[]
}

const slug = (s: string) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const pct = (n: number) => `${n}%`

export function derive(input: {
  name: string; legal_name?: string; phone?: string; email?: string; website?: string
  place: Place; trade: TradeProfile; entity: ReturnType<typeof entityFor>
  ein?: string; pay_frequency?: string; charges_sales_tax?: boolean | null; local_sales_tax_pct?: number | null
}): Derived {
  const { place, trade, entity } = input
  const st: StateProfile | null = stateProfile(place.state)
  const year = new Date().getFullYear()
  const lines: Derived['lines'] = []
  const needsYou: string[] = []
  const company: Record<string, unknown> = {}
  const settings: Record<string, unknown> = {}

  // Identity — what they said.
  company.company_name = input.name
  if (input.legal_name) company.legal_name = input.legal_name
  if (input.phone) company.phone = input.phone
  if (input.website) company.website = input.website
  company.public_quote_slug = slug(input.name)
  lines.push({ label: 'Company', value: input.name + (input.legal_name && input.legal_name !== input.name ? ` (legal: ${input.legal_name})` : ''), source: 'you' })

  // Address → parts, zone.
  company.address = place.formatted
  company.city = place.city; company.state = place.state; company.zip = place.zip
  company.remit_to_address = place.formatted
  if (input.email) company.remit_to_email = input.email
  lines.push({ label: 'Address', value: place.formatted, source: 'you' })
  if (st) {
    company.timezone = st.tz
    lines.push({ label: 'Time zone', value: `${st.tz}${st.noDst ? ' (no daylight saving)' : ''}${st.tzNote ? ' — ' + st.tzNote : ''}`, source: 'derived' })
  } else {
    needsYou.push('time zone (I could not place the state)')
  }

  // Trade → NAICS, service types, warranty, agents.
  company.industry = trade.label
  company.naics_code = trade.naics
  settings.service_types = trade.serviceTypes
  settings.default_parts_warranty_months = trade.partsWarrantyMonths
  settings.default_labor_warranty_months = 12
  lines.push({ label: 'Trade', value: `${trade.label} · NAICS ${trade.naics}`, source: 'derived' })
  lines.push({ label: 'Service types', value: trade.serviceTypes.join(', ') + ' (rename any time)', source: 'derived' })
  lines.push({ label: 'Warranty defaults', value: `${trade.partsWarrantyMonths} months parts, 12 labor`, source: 'derived' })

  // Entity → tax form.
  if (entity) {
    company.entity_type = entity.entity_type; company.business_type = entity.business_type
    lines.push({ label: 'Entity', value: `${entity.entity_type} — files ${entity.taxForm}`, source: 'you' })
  } else needsYou.push('entity type (LLC, S-corp, sole proprietor, partnership)')
  company.fiscal_year_end = 'December'
  lines.push({ label: 'Fiscal year', value: 'ends December (calendar year) — change it on Settings if yours differs', source: 'derived' })
  if (input.ein && /^\d{2}-?\d{7}$/.test(input.ein.trim())) { company.ein = input.ein.trim().replace(/^(\d{2})(\d{7})$/, '$1-$2'); lines.push({ label: 'EIN', value: company.ein as string, source: 'you' }) }
  else needsYou.push('EIN (needed before the first payroll or 1099)')

  // Payroll — the state's part of it.
  const freq = normalizeFrequency(input.pay_frequency)
  company.pay_frequency = freq.value
  company.pay_day_1 = freq.day1; company.pay_day_2 = freq.day2
  settings.payroll_config = { pay_frequency: freq.value, pay_day_1: freq.day1, pay_day_2: freq.day2, overtime_threshold: 40, overtime_multiplier: 1.5 }
  settings.payroll_tax_year = year
  lines.push({ label: 'Payroll', value: freq.label, source: input.pay_frequency ? 'you' : 'derived' })
  company.futa_rate_pct = 0.6
  company.federal_deposit_schedule = 'monthly'
  lines.push({ label: 'Federal payroll tax', value: 'FUTA 0.6% on the first $7,000; deposits monthly (every new employer starts there)', source: 'derived' })
  if (st) {
    company.state_employer_id_state = st.code
    const it = st.incomeTax
    lines.push({ label: `${st.name} income tax`, value: it.kind === 'none' ? 'none — no state withholding' : it.kind === 'flat' ? `flat ${pct(it.ratePct)} withholding (${it.asOf} rate)` : 'graduated — withholding from the state tables', source: 'derived' })
    if (st.sui) {
      company.sui_wage_base = st.sui.wageBase
      company.sui_rate_pct = st.sui.newEmployerRatePct
      company.sui_rate_source = 'estimate'
      lines.push({ label: 'Unemployment insurance (SUI)', value: `${st.sui.agency}: new-employer rate ${pct(st.sui.newEmployerRatePct)} on the first $${st.sui.wageBase.toLocaleString()} (${st.sui.asOf}). The state mails your own rate; enter it when it comes.`, source: 'estimate' })
    } else {
      needsYou.push(`your ${st.name} unemployment-insurance rate and account number (the state mails a rate notice; Payroll → SUI walks you through it)`)
    }
    company.state_deposit_schedule = 'quarterly'
    if (st.workersCompStateFund) lines.push({ label: 'Workers’ comp', value: `${st.name} is a state-fund state — coverage comes from the state, not a private carrier`, source: 'derived' })
  } else {
    needsYou.push('state payroll setup (I could not place the state)')
  }

  // Sales tax — the floor is known, the local add-on is theirs.
  if (st) {
    const charges = input.charges_sales_tax
    const local = Number(input.local_sales_tax_pct)
    const rate = Number.isFinite(local) && local > 0 ? Math.round((st.salesTax.stateRatePct + local) * 1000) / 1000 : st.salesTax.stateRatePct
    const enabled = charges === true || (charges == null && st.salesTax.stateRatePct > 0)
    settings.sales_tax = { enabled, rate, jurisdiction: `${place.city ? place.city + ', ' : ''}${st.code}`, apply_to: st.salesTax.servicesTaxable ? 'all' : 'materials' }
    if (st.salesTax.stateRatePct === 0) lines.push({ label: 'Sales tax', value: `${st.name} has no state sales tax${st.salesTax.localAddOn ? '; some localities levy their own — tell me if yours does' : ''}`, source: 'derived' })
    else {
      lines.push({ label: 'Sales tax', value: `${enabled ? 'on' : 'off'} — ${st.name} ${pct(st.salesTax.stateRatePct)}${Number.isFinite(local) && local > 0 ? ` + ${pct(local)} local = ${pct(rate)}` : st.salesTax.localAddOn ? ' (state rate; add your city/county rate — it is on any local receipt)' : ''}; applied to ${st.salesTax.servicesTaxable ? 'labor and materials' : 'materials only (services are not taxed here)'}${st.salesTax.note ? '. ' + st.salesTax.note : ''}`, source: Number.isFinite(local) && local > 0 ? 'you' : 'estimate' })
      if (st.salesTax.localAddOn && !(Number.isFinite(local) && local > 0)) needsYou.push(`the local sales-tax add-on for ${place.city || place.county || 'your city'} (the card uses the state rate as a floor)`)
    }
  }

  // The first business unit is the company itself.
  settings.business_units = [{ name: input.name, address: place.formatted, phone: input.phone || '', email: input.email || '' }]
  lines.push({ label: 'Business unit', value: `${input.name} — invoices, quotes and the portal carry this name and address`, source: 'derived' })

  // Agents by trade.
  const agents = trade.agents
  lines.push({ label: 'AI crew', value: agents.map(agentName).join(', '), source: 'derived' })

  company.setup_complete = true
  return { company, settings, agents, lines, needsYou }
}

function normalizeFrequency(said?: string) {
  const s = String(said || '').toLowerCase()
  if (/week(ly)?\b/.test(s) && !/bi|two|2|every other|semi/.test(s)) return { value: 'weekly', day1: 'Friday', day2: '', label: 'weekly, paid Fridays' }
  if (/bi|two weeks|every other|2 weeks/.test(s)) return { value: 'bi-weekly', day1: 'Friday', day2: '', label: 'every two weeks, paid Fridays' }
  if (/month(ly)?\b/.test(s) && !/semi|twice|two/.test(s)) return { value: 'monthly', day1: '1', day2: '', label: 'monthly, paid on the 1st' }
  return { value: 'semi-monthly', day1: '5', day2: '20', label: 'twice a month, the 5th and the 20th' + (said ? '' : ' (the default — say weekly, every two weeks, or monthly to change it)') }
}

const AGENT_NAMES: Record<string, string> = { 'arnie-og': 'Arnie', 'lenard-lighting': 'Lenard (lighting audits)', 'zach-yard-yeti': 'Zach (yard quotes)', 'freddy-fleet': 'Freddy (fleet)', 'walter-windows': 'Walter (windows)', 'frankie-finance': 'Frankie (CFO)', 'victor-verify': 'Victor', 'conrad-connect': 'Conrad' }
const agentName = (slug: string) => AGENT_NAMES[slug] || slug

// The sidebar entries the recruited agents need — the same map
// src/pages/Onboarding.jsx carries (a test holds the two together).
export const MODULE_TEMPLATES: Record<string, any> = {
  'lenard-lighting':  { module_name: 'lenard',         display_name: 'Lenard - Lighting AI',         icon: 'Lightbulb',   default_menu_section: 'SALES_FLOW', route_path: '/agents/lenard',         sort_order: 10, description: 'AI lighting auditor + utility-rebate specialist' },
  'freddy-fleet':     { module_name: 'freddy',         display_name: 'Freddy - Fleet AI',            icon: 'Truck',       default_menu_section: 'OPERATIONS', route_path: '/agents/freddy',         sort_order: 20, description: 'AI fleet manager for vehicles equipment and maintenance' },
  'zach-yard-yeti':   { module_name: 'zach-yard-yeti', display_name: 'Zach - Lawn Care AI',          icon: 'Sprout',      default_menu_section: 'OPERATIONS', route_path: '/agents/zach',           sort_order: 25, description: 'AI lawn-care specialist — properties, visits, treatments, pricing' },
  'conrad-connect':   { module_name: 'conrad-connect', display_name: 'Conrad - Email Marketing AI', icon: 'Mail',         default_menu_section: 'SALES_FLOW', route_path: '/agents/conrad-connect', sort_order: 30, description: 'AI email marketing agent powered by Constant Contact' },
  'victor-verify':    { module_name: 'victor-verify',  display_name: 'Victor - Verification AI',     icon: 'ShieldCheck', default_menu_section: 'OPERATIONS', route_path: '/agents/victor',         sort_order: 35, description: 'AI quality verification for completed work' },
  'arnie-og':         { module_name: 'arnie',          display_name: 'OG Arnie',                     icon: 'Bot',         default_menu_section: 'OPERATIONS', route_path: '/agents/arnie',          sort_order: 40, description: 'Answers from live data; drafts changes you approve; morning brief' },
  'frankie-finance':  { module_name: 'frankie-finance',display_name: 'Frankie - Finance AI',         icon: 'DollarSign',  default_menu_section: 'OPERATIONS', route_path: '/agents/frankie',        sort_order: 45, description: 'AI bookkeeper + finance assistant' },
  'walter-windows':   { module_name: 'walter-windows', display_name: 'Walter - Windows AI',          icon: 'Bot',         default_menu_section: 'OPERATIONS', route_path: '/agents/walter',         sort_order: 50, description: 'AI window-cleaning specialist' },
        
}

// ── the rail ───────────────────────────────────────────────────────────

/** companies has no company_id column; the id IS the tenant. */
async function patchCompany(r: Rest, companyId: number, patch: Record<string, unknown>) {
  const res = await fetch(`${r.url}/rest/v1/companies?id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  return res.ok ? { ok: true as const } : { ok: false as const, error: `${res.status} ${await res.text()}` }
}

export async function prepareCompanySetup(r: Rest, caller: Caller, f: Record<string, string>) {
  const companyId = caller.companyId as number
  if (caller.level < 3) return { ok: false as const, error: 'Setting the company up is the owner\'s job (or an admin\'s). Ask them to open Arnie and say "set up the company".' }
  const name = String(f.name || '').trim()
  if (name.length < 2) return { ok: false as const, error: 'What is the company called?' }
  const address = String(f.address || '').trim()
  if (address.length < 8) return { ok: false as const, error: 'I need the business address — street, city, state and ZIP. Nearly everything else comes from it.' }
  const place = await geocode(address)
  if (!place || !place.state) return { ok: false as const, error: `I could not place "${address}". Give it as street, city, state and ZIP — "4410 S State St, Murray, UT 84107".` }
  if (!stateProfile(place.state)) return { ok: false as const, error: `${place.formatted} reads as "${place.state}", which I do not have a profile for. Is the address in the US?` }
  const trade = tradeFor(f.trade || f.industry || '')
  const entity = entityFor(f.entity || '')
  if (String(f.entity || '').trim() && !entity) return { ok: false as const, error: `"${f.entity}" — is that an LLC, an S-corp, a C-corp, a partnership, or a sole proprietorship?` }
  const charges = /^(yes|true|on|1)$/i.test(String(f.charges_sales_tax || '')) ? true : /^(no|false|off|0)$/i.test(String(f.charges_sales_tax || '')) ? false : null
  const local = String(f.local_sales_tax_pct || '').trim() ? Number(String(f.local_sales_tax_pct).replace('%', '')) : null

  const d = derive({ name, legal_name: f.legal_name, phone: f.phone, email: f.email || caller.email, website: f.website, place, trade, entity, ein: f.ein, pay_frequency: f.pay_frequency, charges_sales_tax: charges, local_sales_tax_pct: local })

  // Snapshot for rollback: the company row and every settings key we touch.
  const [company] = await readRecordList(r, `companies?select=*&id=eq.${companyId}&limit=1`)
  const keys = Object.keys(d.settings)
  const prior = await readRecordList(r, `settings?select=key,value&company_id=eq.${companyId}&key=in.(${keys.join(',')})`)
  const existingAgents = await readRecordList(r, `company_agents?select=agent_id&company_id=eq.${companyId}`)

  const display = d.lines.map((l) => ({ label: l.label, value: `${l.value}${l.source === 'you' ? '' : l.source === 'derived' ? '  [from the address / trade]' : l.source === 'estimate' ? '  [estimate — confirm]' : '  [needs you]'}` }))
  if (d.needsYou.length) display.push({ label: 'Still yours to bring', value: d.needsYou.join('; ') })
  return {
    ok: true as const,
    columns: {
      company: d.company, settings: d.settings, agents: d.agents, place,
      before: { company: Object.fromEntries(Object.keys(d.company).map((k) => [k, company?.[k] ?? null])), settings: prior, agent_ids: existingAgents.map((a: any) => a.agent_id) },
      needs_you: d.needsYou,
    },
    display,
  }
}

export async function applyCompanySetup(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const up = await patchCompany(r, companyId, { ...c.company, updated_at: new Date().toISOString() })
  if (!up.ok) return { ok: false as const, error: `Could not save the company profile: ${up.error}` }
  // settings: upsert by (company_id, key)
  for (const [key, value] of Object.entries(c.settings || {})) {
    const res = await fetch(`${r.url}/rest/v1/settings?on_conflict=company_id,key`, { method: 'POST', headers: { ...hdr(r), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ company_id: companyId, key, value: JSON.stringify(value), updated_at: new Date().toISOString() }) })
    if (!res.ok) return { ok: false as const, error: `Saved the profile but could not write the ${key} setting: ${res.status} ${await res.text()}` }
  }
  // agents + sidebar modules
  const agents = await readRecordList(r, `agents?select=id,slug&slug=in.(${(c.agents || []).map((s: string) => `"${s}"`).join(',')})`)
  let added: number[] = []
  if (agents.length) {
    const have = new Set((c.before?.agent_ids || []).map(String))
    added = agents.map((a: any) => a.id).filter((id: number) => !have.has(String(id)))
    if (added.length) {
      await fetch(`${r.url}/rest/v1/company_agents?on_conflict=company_id,agent_id`, { method: 'POST', headers: { ...hdr(r), Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(added.map((agent_id) => ({ company_id: companyId, agent_id, subscription_status: 'active', activated_at: new Date().toISOString(), settings: {} }))) })
      const mods = agents.filter((a: any) => added.includes(a.id) && MODULE_TEMPLATES[a.slug]).map((a: any) => ({ company_id: companyId, status: 'active', capabilities_json: {}, config_json: {}, default_menu_parent: null, user_menu_section: null, user_menu_parent: null, ...MODULE_TEMPLATES[a.slug] }))
      if (mods.length) await fetch(`${r.url}/rest/v1/ai_modules?on_conflict=company_id,module_name`, { method: 'POST', headers: { ...hdr(r), Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(mods) })
    }
  }
  const addedSlugs = agents.filter((a: any) => added.includes(a.id)).map((a: any) => a.slug)
  return { ok: true as const, id: companyId, label: `${c.company?.company_name || 'the company'} — set up`, created: { agents_added: added, agents_added_slugs: addedSlugs } }
}

/** Put the company row and the settings back exactly, and un-recruit what this turned on. */
export async function rollbackCompanySetup(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const before = c.before || {}
  const res = await patchCompany(r, companyId, { ...(before.company || {}), updated_at: new Date().toISOString() })
  if (!res.ok) return { ok: false as const, error: res.error }
  const priorByKey = new Map((before.settings || []).map((s: any) => [s.key, s.value]))
  for (const key of Object.keys(c.settings || {})) {
    if (priorByKey.has(key)) await fetch(`${r.url}/rest/v1/settings?company_id=eq.${companyId}&key=eq.${key}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ value: priorByKey.get(key) }) })
    else await fetch(`${r.url}/rest/v1/settings?company_id=eq.${companyId}&key=eq.${key}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  }
  const added: number[] = prop.payload?.created?.agents_added || []
  if (added.length) {
    await fetch(`${r.url}/rest/v1/company_agents?company_id=eq.${companyId}&agent_id=in.(${added.join(',')})`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
    const slugs = (prop.payload?.created?.agents_added_slugs || []).filter((s: string) => MODULE_TEMPLATES[s]).map((s: string) => `"${MODULE_TEMPLATES[s].module_name}"`)
    if (slugs.length) await fetch(`${r.url}/rest/v1/ai_modules?company_id=eq.${companyId}&module_name=in.(${slugs.join(',')})`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  }
  return { ok: true as const, deleted: 0 }
}
