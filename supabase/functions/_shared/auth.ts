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

// ── Full caller identity ────────────────────────────────────────────────
// resolveCompanyId() above answers "which tenant is this?" for metering.
// resolveCaller() answers the harder question the DATA functions need:
// "who is this, what company, and what may they see?" — derived ENTIRELY
// from the caller's JWT.
//
// Why this exists: arnie-chat used to read `companyId` and `role` out of the
// request BODY and hand them straight to service-role queries. Any signed-in
// user could edit those two fields in devtools and read another tenant's
// invoices, leads and payroll. The JWT is the only trustworthy input.
//
// Mirrors src/lib/accessControl.js#getAccessLevel — is_developer wins, then
// user_role, then a job-title `role` but only if it is admin-or-above.
// Keep the two in sync; they are the same rule written in two languages.

export type CallerRole =
  | 'developer' | 'super_admin' | 'admin' | 'manager' | 'team_lead' | 'user'

export interface Caller {
  email: string
  /** null when the signed-in user maps to no active employee row. */
  companyId: number | null
  employeeId: number | null
  role: CallerRole
  level: number
}

const ROLE_LEVEL: Record<string, number> = {
  'User': 0, 'Team Lead': 1, 'Manager': 2,
  'Admin': 3, 'Super Admin': 4, 'Developer': 5,
  'Owner': 4, // legacy — Owner has always meant Super Admin
}
const LEVEL_ROLE: CallerRole[] =
  ['user', 'team_lead', 'manager', 'admin', 'super_admin', 'developer']

function accessLevel(emp: Record<string, unknown>): number {
  if (emp?.is_developer === true) return 5
  const ur = emp?.user_role as string | undefined
  if (ur && ROLE_LEVEL[ur] !== undefined) return ROLE_LEVEL[ur]
  // Legacy fallback: a job-title in `role`, honoured only when admin-or-above
  const r = emp?.role as string | undefined
  if (r && ROLE_LEVEL[r] !== undefined && ROLE_LEVEL[r] >= 3) return ROLE_LEVEL[r]
  return 0
}

export async function resolveCaller(
  req: Request,
  supabaseUrl?: string | null,
  serviceKey?: string | null,
): Promise<Caller | null> {
  try {
    if (!supabaseUrl || !serviceKey) return null
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token || token === serviceKey) return null // anon/service call — no user
    const email = decodeJwtEmail(token)
    if (!email) return null
    const res = await fetch(
      `${supabaseUrl}/rest/v1/employees` +
        `?select=id,company_id,role,user_role,is_admin,is_developer` +
        `&active=eq.true&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
    )
    if (!res.ok) return null
    const emp = (await res.json())?.[0]
    // A real signed-in user who maps to no active employee row is NOT an
    // attacker — it is a fresh invite, a deactivated account, or a support
    // login. Returning null here would 401 them out of Arnie entirely, so we
    // return an identified caller with no tenant instead: callers must then
    // run tool-less, which is exactly the pre-fix behaviour for that case.
    if (!emp || emp.company_id == null) {
      return { email, companyId: null, employeeId: null, role: 'user', level: 0 }
    }
    // is_admin is a separate legacy boolean some tenants still set on its own.
    const level = Math.max(accessLevel(emp), emp.is_admin === true ? 3 : 0)
    return {
      email,
      companyId: emp.company_id,
      employeeId: emp.id ?? null,
      role: LEVEL_ROLE[level] || 'user',
      level,
    }
  } catch {
    return null
  }
}
