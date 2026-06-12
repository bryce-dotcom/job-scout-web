// Resolve a company_id server-side from the caller's auth token — so built-in
// AI functions can attribute compute usage without the frontend threading a
// company_id through every call site.
//
// Mirrors the RLS helper public.current_user_company_ids(): the user's JWT
// carries an `email` claim; the employees table maps email → company_id.
// Best-effort and non-throwing — returns null when there's no user token
// (service-role / public calls), which makes the shadow log a safe no-op.

function decodeJwtEmail(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return (payload?.email || '').toLowerCase() || null
  } catch {
    return null
  }
}

export async function resolveCompanyId(
  req: Request,
  supabaseUrl?: string | null,
  serviceKey?: string | null,
): Promise<number | null> {
  try {
    if (!supabaseUrl || !serviceKey) return null
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token || token === serviceKey) return null // service-role/anon call — no user
    const email = decodeJwtEmail(token)
    if (!email) return null
    const res = await fetch(
      `${supabaseUrl}/rest/v1/employees?select=company_id&active=eq.true&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.company_id ?? null
  } catch {
    return null
  }
}
