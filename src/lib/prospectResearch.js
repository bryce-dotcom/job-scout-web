// Client for the prospect-research edge function (Find Prospects AI).
// One place for the auth header and the 402 quota handling, so the Lead
// Setter drawer and the Liahona map talk to it the same way.

import { supabase } from './supabase'

export class QuotaError extends Error {
  constructor(data) { super(data?.message || 'Monthly quota reached — upgrade to continue'); this.blocked = data }
}

export async function callProspectResearch(action, companyId, body = {}) {
  const { data: session } = await supabase.auth.getSession()
  const tok = session?.session?.access_token
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prospect-research`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, company_id: companyId, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 402 && data?.upgrade_required) throw new QuotaError(data)
  if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// Hand a set of search results from the Lead Setter drawer to Liahona: the
// pipeline page opens the map and plots them.
export const PROSPECTS_HANDOFF_KEY = 'liahona.prospects'
export function handOffProspectsToMap(prospects) {
  try { sessionStorage.setItem(PROSPECTS_HANDOFF_KEY, JSON.stringify(prospects || [])) } catch { /* private mode */ }
}
export function takeProspectsHandoff() {
  try {
    const raw = sessionStorage.getItem(PROSPECTS_HANDOFF_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PROSPECTS_HANDOFF_KEY)
    const list = JSON.parse(raw)
    return Array.isArray(list) && list.length ? list : null
  } catch { return null }
}
