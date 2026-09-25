// Which utility a job is with — one answer for the utility record the job
// raises, the incentive line on the customer's invoice, the submittal and the
// portal.
//
// Read in order of how directly the fact was stated:
//
//   1. the job's own provider (jobs.utility_provider_id) — chosen on the job
//      page, or remembered there the first time it was worked out
//   2. the lighting audit's provider — the walkthrough said which utility
//   3. the company's default provider — settings.default_utility_provider_id,
//      set on the Utility Providers page. A contractor who works one utility
//      nearly always sets it once and never types the name again; one who
//      works two sets the usual one and flips the others on the job.
//
// Nothing here invents an incentive: a default provider only NAMES the
// utility on a job that carries one. Before this, a job with no audit raised a
// record called "Utility" and its invoice printed "Utility Incentive" with no
// name on it (Alayda, 550b056d).

export const DEFAULT_UTILITY_SETTING = 'default_utility_provider_id'

const asId = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(typeof v === 'string' ? v.replace(/^"|"$/g, '') : v)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** The provider row for an id, from the store's list. */
export function providerById(providers, id) {
  const want = asId(id)
  if (want == null) return null
  return (providers || []).find((p) => asId(p?.id) === want) || null
}

/**
 * The company's default provider id, read from the store's settings rows
 * (`[{ key, value }]`). The value is stored as the bare id ("116"); a
 * JSON-quoted "\"116\"" from an older writer reads the same.
 */
export function defaultUtilityProviderId(settings) {
  const row = (settings || []).find((s) => s?.key === DEFAULT_UTILITY_SETTING)
  return asId(row?.value)
}

/**
 * Where a job's utility comes from.
 *
 * @returns {{ id: number|null, name: string|null, source: 'job'|'audit'|'default'|null }}
 */
export function resolveJobUtility({ job, audit = null, providers = [], settings = [] } = {}) {
  const own = providerById(providers, job?.utility_provider_id)
  if (own) return { id: own.id, name: own.provider_name, source: 'job' }

  const auditId = audit?.utility_provider?.id ?? audit?.utility_provider_id
  const fromAudit = providerById(providers, auditId)
  if (fromAudit) return { id: fromAudit.id, name: fromAudit.provider_name, source: 'audit' }
  // The audit may carry the provider joined in but absent from the store's
  // list (a provider from another state, say). Its name is still the answer.
  const auditName = String(audit?.utility_provider?.provider_name || '').trim()
  if (auditName) return { id: asId(auditId), name: auditName, source: 'audit' }

  const dflt = providerById(providers, defaultUtilityProviderId(settings))
  if (dflt && defaultAppliesTo(dflt, job)) return { id: dflt.id, name: dflt.provider_name, source: 'default' }

  return { id: null, name: null, source: null }
}

// ── where a job is ────────────────────────────────────────────────────────
// A company default must not cross state lines. HHH's default is Rocky
// Mountain Power (Utah); the same company does Salt River Project work in
// Arizona, and two of its Arizona records already said "Rocky Mountain Power"
// because nothing checked. When the job's address names a state and the
// default provider serves a different one, the default simply does not apply
// — the invoice says "Utility Incentive" until the job (or its audit) says
// which, rather than naming the wrong utility on a customer document.

const US_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
}
const STATE_CODES = new Set(Object.values(US_STATES))

/**
 * The US state an address names, as a two-letter code, or null. Reads the
 * way addresses are actually typed: "Mesa, AZ 85205", "mesa az",
 * "85120, AZ", "Highland, UT", a bare "AZ", "Phoenix, Arizona".
 */
export function stateOfAddress(text) {
  let s = String(text || '').trim()
  if (!s) return null
  s = s.replace(/[\s,]*(?:USA|U\.S\.A\.|United States|US)\s*$/i, '').trim()
  // "<state> <zip>" or a trailing "<state>" — the code sits at the end.
  const tail = /(?:^|[\s,])([A-Za-z]{2})\.?[\s,]*(?:\d{5}(?:-\d{4})?)?\s*$/.exec(s)
  if (tail && STATE_CODES.has(tail[1].toUpperCase())) return tail[1].toUpperCase()
  // A state spelled out anywhere; the last one wins ("New York Ave, Phoenix, Arizona").
  let found = null
  for (const [name, code] of Object.entries(US_STATES)) {
    const re = new RegExp('\\b' + name.replace(' ', '\\s+') + '\\b', 'i')
    const m = re.exec(s)
    if (m && (found === null || m.index > found.index)) found = { index: m.index, code }
  }
  return found ? found.code : null
}

/** The state a job is in, from its site address first, then its address. */
export function jobState(job) {
  return stateOfAddress(job?.job_address) || stateOfAddress(job?.address) || null
}

/**
 * Whether a company default provider may name this job's utility: yes unless
 * the job's state is known and the provider serves a different one.
 */
export function defaultAppliesTo(provider, job) {
  const pState = String(provider?.state || '').trim().toUpperCase()
  const jState = jobState(job)
  return !pState || !jState || pState === jState
}

// ── which forms a job is offered ──────────────────────────────────────────
// The shared catalogue is seeded for thirteen western states (2026-09-25).
// Listing every published form on a job would bury the one that applies.
// The job's utility (job → audit → company default) → its forms; no
// resolvable utility → the forms of providers in the job's state; no state
// either → every published form, the pre-seed behaviour.
export function utilityFormsForJob({ forms = [], utility = null, job = null, providers = [] } = {}) {
  const list = Array.isArray(forms) ? forms : []
  if (utility?.id != null) return list.filter(f => Number(f.provider_id) === Number(utility.id))
  const st = jobState(job)
  if (st) {
    const ids = new Set(providers.filter(p => String(p.state || '').trim().toUpperCase() === st).map(p => Number(p.id)))
    const inState = list.filter(f => ids.has(Number(f.provider_id)))
    if (inState.length) return inState
  }
  return list
}
