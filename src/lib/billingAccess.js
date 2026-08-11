// Billing-driven access control (client side).
//
// The source of truth for "can this tenant write?" is the RLS gate in the
// database (public.company_can_write — see the trial_readonly_write_gate
// migration): a lapsed/canceled tenant's INSERT/UPDATE/DELETE are rejected
// server-side no matter what the UI does. This module is the UI mirror of
// that rule, meant to let pages disable Save/Create buttons before a write is
// attempted.
//
// NOT WIRED UP: useBillingAccess() is currently called by no page. What
// actually protects a locked-out customer is lib/writeGate.js, which turns the
// database's refusal into a sentence about billing wherever an error surfaces.
// That is global, so unlike per-page button-disabling it cannot be forgotten on
// a new page — which is exactly how this hook ended up unused. Reach for the
// hook only to make a screen read as read-only BEFORE someone clicks; do not
// assume it is guarding anything today.
//
// Keep READ_ONLY_STATUSES in sync with company_can_write() in that migration.

import { useEffect, useState } from 'react'
import { useStore } from './store'
import { supabase } from './supabase'

// The statuses and the wording live in billingMessages.js — a leaf module, so
// that a refused write can share them without pulling React and the supabase
// client in behind it. Re-exported here because this is where callers look.
export {
  READ_ONLY_STATUSES, READ_ONLY_REASON, READ_ONLY_WRITE_REASON,
  isReadOnlyStatus, readOnlyReason,
} from './billingMessages'
import { isReadOnlyStatus, readOnlyReason } from './billingMessages'

// Reactive access state for the current company. Mirrors the DB gate so the
// UI can prevent writes it knows will be rejected. Fails OPEN (writable)
// while loading or on error, matching company_can_write()'s fail-open — the
// DB is the real backstop, so an optimistic UI here is safe.
export function useBillingAccess() {
  const companyId = useStore((s) => s.companyId)
  const [billingStatus, setBillingStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('companies')
        .select('billing_status')
        .eq('id', companyId)
        .maybeSingle()
      if (!cancelled) {
        setBillingStatus(data?.billing_status ?? null)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [companyId])

  const readOnly = isReadOnlyStatus(billingStatus)
  return {
    billingStatus,
    loading,
    readOnly,
    reason: readOnly ? readOnlyReason(billingStatus) : null,
  }
}
