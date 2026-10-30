// ONE definition of "which rep does this job belong to?" — it lives in
// supabase/functions/_shared/jobOwnership.ts so the server credits a deal to
// the same rep the pages do. Read the rule and its TEXT/INT lead_id trap there.
export { buildLeadIndex, leadForJob, ownerIdsForJob, jobOwnedBy, primaryOwnerId, isUnattributed, sameId } from '../../supabase/functions/_shared/jobOwnership.ts'
