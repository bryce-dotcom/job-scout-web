// Mirrors src/lib/clockInJob.js — the one rule for who may clock in without
// a job. Arnie's "clock me in" card goes through this so a field tech cannot
// get a general punch from the chat that the Field Scout button refuses.
// Change both or neither.

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

const OFFICE_EXACT = new Set([
  'office', 'admin', 'administrator', 'administration', 'owner', 'ceo', 'cfo', 'coo', 'president', 'vice president', 'vp',
  'manager', 'general manager', 'office manager', 'operations manager', 'project manager', 'pm', 'account manager',
  'sales', 'sales rep', 'salesperson', 'sales manager', 'setter', 'appointment setter', 'lead setter', 'estimator',
  'dispatcher', 'dispatch', 'scheduler', 'accounting', 'accountant', 'bookkeeper', 'controller', 'finance',
  'marketing', 'hr', 'human resources', 'receptionist', 'customer service', 'support', 'it', 'developer',
])
const OFFICE_WORD = /\b(office|admin|owner|sales|setter|manager|estimator|dispatch|accounting|bookkeep|marketing|receptionist|executive|director)\b/i

export interface ClockInSettings { overheadRoles?: string[]; jobRoles?: string[]; skillLevels?: { name?: string; weight?: number | string }[] }

export function isOfficeRole(role: unknown, s: ClockInSettings = {}): boolean {
  const r = norm(role)
  if (!r) return false
  if ((s.jobRoles || []).some(x => norm(x) === r)) return false
  if ((s.overheadRoles || []).some(x => norm(x) === r)) return true
  return OFFICE_EXACT.has(r) || OFFICE_WORD.test(r)
}

export function onBonus(employee: any, s: ClockInSettings = {}): boolean {
  const lvl = String(employee?.skill_level || '').trim()
  if (!lvl) return false
  const defined = (s.skillLevels || []).find(x => norm(x?.name) === norm(lvl))
  if (defined) return Number(defined.weight) > 0
  return !/not on bonus|no bonus|off bonus/i.test(lvl)
}

export function mustClockToJob(employee: any, s: ClockInSettings = {}): boolean {
  if (onBonus(employee, s)) return true
  return !isOfficeRole(employee?.role, s)
}

export const OVERHEAD_PREFIX = 'Overhead — '

export function clockInChoice({ jobId = null, employee = null, settings = {} }: { jobId?: unknown; employee?: any; settings?: ClockInSettings }) {
  const id = jobId === '' || jobId == null ? null : Number(jobId)
  if (id != null && Number.isFinite(id) && id > 0) return { ok: true as const, job_id: id, notes: null as string | null, overhead: false }
  if (mustClockToJob(employee, settings)) {
    return { ok: false as const, reason: 'Pick the job you are clocking in to. Your hours are charged to jobs; there is no overhead clock-in for your role.' }
  }
  const role = String(employee?.role || 'Office').trim() || 'Office'
  return { ok: true as const, job_id: null as number | null, notes: `${OVERHEAD_PREFIX}${role}`, overhead: true }
}

/** The three settings rows the rule reads, for one company. */
export async function loadClockInSettings(r: { url: string; key: string }, companyId: number): Promise<ClockInSettings> {
  const out: ClockInSettings = { overheadRoles: [], jobRoles: [], skillLevels: [] }
  try {
    const res = await fetch(`${r.url}/rest/v1/settings?select=key,value&company_id=eq.${companyId}&key=in.(time_clock_overhead_roles,time_clock_job_roles,skill_levels)`, {
      headers: { apikey: r.key, Authorization: `Bearer ${r.key}` },
    })
    if (!res.ok) return out
    for (const row of await res.json()) {
      let v: any = row.value
      try { v = typeof v === 'string' ? JSON.parse(v) : v } catch { v = String(v || '').split(',').map((x: string) => x.trim()).filter(Boolean) }
      if (!Array.isArray(v)) continue
      if (row.key === 'time_clock_overhead_roles') out.overheadRoles = v.map(String)
      else if (row.key === 'time_clock_job_roles') out.jobRoles = v.map(String)
      else if (row.key === 'skill_levels') out.skillLevels = v
    }
  } catch { /* no settings, the defaults stand */ }
  return out
}
