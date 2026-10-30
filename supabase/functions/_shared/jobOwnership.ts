// Lives in supabase/functions/_shared so the server (Jenny's query_sold) credits
// a deal to the same rep the Sales Performance page does; src/lib/jobOwnership.js
// re-exports it.
//
// ONE definition of "which rep does this job belong to?"
//
// This rule was written four separate times — repCommissions (Payroll and My
// Pay), the Sales Pipeline's orphan check, the Sales Pipeline's owner filter,
// and salesFunnel — and they disagreed, so the same job could be PAID
// commission while the pipeline credited it to nobody.
//
// The trap that made them disagree is invisible: `jobs.lead_id` is a TEXT
// column while `leads.id` is an INT. So this looks right and never matches:
//
//     const ids = new Set(leads.map(l => l.id))   // numbers
//     ids.has(job.lead_id)                        // string -> always false
//
// repCommissions happened to String()-normalize both sides and was correct.
// The pipeline did not, so every job that belonged to a lead was misfiled as
// an unattributed "orphan" — $232,049 of 2026 work whose rep was sitting on
// the lead the whole time. Anything resolving job ownership must come through
// here, and must never compare a raw lead_id.

/** Index leads for lookup by a job's lead_id. Keys are strings BECAUSE of the
 *  TEXT/INT mismatch above — do not "simplify" this to raw ids. */
export function buildLeadIndex(leads: any[] = []): Map<string, any> {
  return new Map((leads || []).filter(Boolean).map((l: any) => [String(l.id), l]))
}

const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b)

/** The lead a job belongs to, or null. Handles the TEXT/INT mismatch. */
export function leadForJob(job: any, leadIndex: Map<string, any> | null | undefined): any {
  if (!job?.lead_id || !leadIndex) return null
  return leadIndex.get(String(job.lead_id)) || null
}

/**
 * Every employee id this job could be attributed to.
 *
 * `scope` matters and is deliberately explicit:
 *   'credit'     — who SOLD it. Drives commission and sold totals: the job's
 *                  salesperson, else the lead's salesperson(s).
 *   'visibility' — who should SEE it on their board. Adds the lead owner,
 *                  who is often a setter or manager rather than the closer.
 *
 * Keeping these apart is the point: widening 'credit' to include lead owners
 * would quietly start paying commission to whoever owned the lead.
 */
export function ownerIdsForJob(job: any, leadIndex: Map<string, any> | null | undefined, scope = 'credit'): Set<string> {
  const ids = new Set<string>()
  if (!job) return ids
  if (job.salesperson_id != null) ids.add(String(job.salesperson_id))

  const lead = leadForJob(job, leadIndex)
  if (lead) {
    if (lead.salesperson_id != null) ids.add(String(lead.salesperson_id))
    if (Array.isArray(lead.salesperson_ids)) {
      for (const id of lead.salesperson_ids) if (id != null) ids.add(String(id))
    }
    if (scope === 'visibility' && lead.lead_owner_id != null) {
      ids.add(String(lead.lead_owner_id))
    }
  }
  return ids
}

/** Does this job belong to this employee? */
export function jobOwnedBy(job: any, employeeId: unknown, leadIndex: Map<string, any> | null | undefined, scope = 'credit'): boolean {
  if (employeeId == null) return false
  return ownerIdsForJob(job, leadIndex, scope).has(String(employeeId))
}

/** The single rep to credit a job to, or null when nothing attributes it.
 *  The job's own salesperson always wins; the lead is the fallback. */
export function primaryOwnerId(job: any, leadIndex: Map<string, any> | null | undefined): string | null {
  if (job?.salesperson_id != null) return String(job.salesperson_id)
  const lead = leadForJob(job, leadIndex)
  if (!lead) return null
  if (lead.salesperson_id != null) return String(lead.salesperson_id)
  if (Array.isArray(lead.salesperson_ids) && lead.salesperson_ids.length) {
    const first = lead.salesperson_ids.find((v: unknown) => v != null)
    if (first != null) return String(first)
  }
  return null
}

/** True when nothing anywhere attributes this job to a rep. */
export function isUnattributed(job: any, leadIndex: Map<string, any> | null | undefined): boolean {
  return primaryOwnerId(job, leadIndex) == null
}

// Kept for callers that need the old "does any of these match" shape.
export { same as sameId }
