// Finding a job by typing what you remember about it.
//
// The old matcher was one substring test against eight fields, so:
//   - "costco draper" found nothing, because no single field contains both
//     words. Typing more made it worse, which is the opposite of how search
//     should behave.
//   - phone, email, status, crew and business unit were not searched at all,
//     even though a dispatcher's first instinct is the number on the job.
//   - "o'brien" missed "OBrien", and "801-555-1234" missed "8015551234".
//   - results came back in whatever order the array happened to be in, so an
//     exact job number could sit below thirty partial matches.
//
// Every token must match SOMETHING (AND across words, OR across fields), which
// is what makes adding a word narrow the result instead of emptying it.

/** Lowercase, fold curly quotes, drop punctuation, collapse whitespace. */
export function normalizeSearch(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ']/g, '')     // O'Brien -> obrien
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Digits only — so 801-555-1234, (801) 555 1234 and 8015551234 all match. */
const digitsOf = (value) => String(value ?? '').replace(/\D+/g, '')

/**
 * Everything about a job worth matching against. Kept as separate strings
 * rather than one blob so a token can match a whole field for ranking.
 */
export function jobSearchFields(job) {
  if (!job) return []
  return [
    job.job_id,
    job.job_title,
    job.customer_name,
    job.business_name,
    job.customer?.name,
    job.customer?.business_name,
    job.job_address,
    job.address,
    job.phone,
    job.customer?.phone,
    job.email,
    job.customer?.email,
    job.status,
    job.assigned_team,
    job.team,
    job.business_unit,
    job.utility_name,
    job.notes,
  ].filter(v => v != null && v !== '')
}

/**
 * Does this job match everything the user typed?
 *
 * A token matches on normalized text OR, when it is numeric, on digits-only —
 * which is how a phone number typed with dashes finds a number stored without.
 */
export function matchesJobSearch(job, term) {
  const query = normalizeSearch(term)
  if (!query) return true
  const tokens = query.split(' ').filter(Boolean)
  if (tokens.length === 0) return true

  const fields = jobSearchFields(job)
  const haystack = fields.map(normalizeSearch).join(' ')
  const digitHay = fields.map(digitsOf).filter(Boolean).join(' ')

  return tokens.every(tok => {
    if (haystack.includes(tok)) return true
    // A purely numeric token also gets a digits-only pass, so "8015551234"
    // finds "(801) 555-1234" and vice versa.
    return /^\d+$/.test(tok) && digitHay.includes(tok)
  })
}

/**
 * Lower sorts first. An exact job number beats a title match beats a note
 * mentioning the word in passing — otherwise the thing you searched for by ID
 * can sit below thirty loose matches.
 */
export function jobSearchRank(job, term) {
  const query = normalizeSearch(term)
  if (!query) return 5
  const id = normalizeSearch(job?.job_id)
  const title = normalizeSearch(job?.job_title)
  const customer = normalizeSearch(job?.customer?.business_name || job?.customer?.name || job?.customer_name || job?.business_name)

  if (id && id === query) return 0
  if (digitsOf(job?.job_id) && digitsOf(job?.job_id) === digitsOf(term)) return 0
  if (customer && customer.startsWith(query)) return 1
  if (title && title.startsWith(query)) return 2
  if (customer && customer.includes(query)) return 3
  if (title && title.includes(query)) return 4
  return 5
}

/** Filter + rank in one call. Stable within a rank via the caller's order. */
export function searchJobs(jobs, term) {
  const list = (jobs || []).filter(j => matchesJobSearch(j, term))
  if (!normalizeSearch(term)) return list
  return list
    .map((job, i) => ({ job, i, rank: jobSearchRank(job, term) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(x => x.job)
}
