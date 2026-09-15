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
  if (dflt) return { id: dflt.id, name: dflt.provider_name, source: 'default' }

  return { id: null, name: null, source: null }
}
