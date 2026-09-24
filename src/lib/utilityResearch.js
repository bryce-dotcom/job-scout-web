// AI utility research orchestration for Data Console > Utilities.
//
// The ai-utility-research edge function runs in PHASES, one request each,
// because a single "research the whole state" call took longer than the
// gateway's 150s idle timeout and was killed on every press of the button.
// This module drives the phases from the browser and merges the results into
// the one document the review modal expects:
//
//   discover  -> providers, programs, rate_schedules, forms
//   measures  -> incentives + prescriptive_measures, ONE program per call
//   pdfs      -> PDF links on the program pages (optional, no AI)
//
// Each phase streams a heartbeat of spaces before the JSON body, so the
// response is read as text and trimmed before parsing.

import { supabase } from './supabase'

export const RESULT_KEYS = ['providers', 'programs', 'incentives', 'prescriptive_measures', 'rate_schedules', 'forms']

export function emptyResults() {
  return { providers: [], programs: [], incentives: [], prescriptive_measures: [], rate_schedules: [], forms: [] }
}

// Coerce a phase's results into the six arrays (older prompts called the
// rate card "rates"); never mutates the input.
export function normalizeResearchResults(raw) {
  const out = emptyResults()
  if (!raw || typeof raw !== 'object') return out
  for (const k of RESULT_KEYS) {
    if (Array.isArray(raw[k])) out[k] = raw[k].slice()
  }
  if (out.incentives.length === 0 && Array.isArray(raw.rates)) out.incentives = raw.rates.slice()
  return out
}

// Append every array of `extra` onto `base` (in place) and return base.
export function mergeResearchResults(base, extra) {
  const add = normalizeResearchResults(extra)
  for (const k of RESULT_KEYS) {
    if (add[k].length) base[k] = (base[k] || []).concat(add[k])
  }
  return base
}

// The body is "   ...   {json}" — heartbeat whitespace, then the document.
// A non-200 status is a gateway/auth failure that never reached the function.
export async function parseStreamedJson(response) {
  const text = await response.text()
  const trimmed = (text || '').trim()
  let data = null
  if (trimmed) {
    try { data = JSON.parse(trimmed) } catch { data = null }
  }
  if (!response.ok) {
    const msg = data?.error || data?.message || `${response.status} ${response.statusText || ''}`.trim()
    throw new Error(msg)
  }
  if (!data) throw new Error('Empty response from research')
  return data
}

// Run fn over items with at most `limit` in flight; resolves to results in
// item order. A rejected fn rejects the whole run — callers that want partial
// results catch inside fn.
export async function runWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = []
  for (let w = 0; w < Math.max(1, Math.min(limit, items.length)); w++) workers.push(worker())
  await Promise.all(workers)
  return results
}

export async function callResearchPhase(body) {
  const { data: { session } = {} } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in again to run research')
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-utility-research`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    },
  )
  return parseStreamedJson(response)
}

// Research one state end to end. `call` is injectable for tests.
// Returns { results, discovered_pdfs, failures } where failures lists the
// programs whose measures phase failed (the rest of the document is intact).
export async function researchUtilityState({ state, fetchPdfs = false, onProgress = () => {}, call = callResearchPhase, concurrency = 2 }) {
  if (!state) throw new Error('State is required')

  // onProgress(label, detail): label is short enough for a button; detail
  // (the program just finished) is for a tooltip.
  onProgress('Finding programs…', `Utilities, programs, rates and forms in ${state}`)
  const discover = await call({ state, phase: 'discover' })
  if (!discover?.success) throw new Error(discover?.error || 'Research failed')
  const results = normalizeResearchResults(discover.results)

  const programs = results.programs.filter(p => p && p.program_name)
  const failures = []
  let done = 0
  onProgress(programs.length ? `Measures 0/${programs.length}` : 'No programs found', '')
  await runWithConcurrency(programs, concurrency, async (program) => {
    let r
    try {
      r = await call({ state, phase: 'measures', programs: [program] })
    } catch (err) {
      r = { success: false, error: err.message }
    }
    done++
    if (r?.success) mergeResearchResults(results, r.results)
    else failures.push({ program_name: program.program_name, provider_name: program.provider_name, error: r?.error || 'Unknown error' })
    onProgress(`Measures ${done}/${programs.length}`, program.program_name)
  })

  let discovered_pdfs = []
  if (fetchPdfs && programs.length) {
    onProgress('Finding PDFs…', 'Scanning program pages for PDF links')
    try {
      const r = await call({ phase: 'pdfs', programs })
      discovered_pdfs = Array.isArray(r?.discovered_pdfs) ? r.discovered_pdfs : []
    } catch (err) {
      failures.push({ program_name: '(PDF discovery)', error: err.message })
    }
  }

  return { results, discovered_pdfs, failures }
}
