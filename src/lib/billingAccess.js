// Billing-driven access control (client side).
//
// The source of truth for "can this tenant write?" is the RLS gate in the
// database (public.company_can_write — see the trial_readonly_write_gate
// migration): a lapsed/canceled tenant's INSERT/UPDATE/DELETE are rejected
// server-side no matter what the UI does. This module is the UI mirror of
// that rule — it lets pages disable Save/Create buttons and show a clear
// "read-only" message instead of letting a write fail with a raw RLS error.
//
// Keep READ_ONLY_STATUSES in sync with company_can_write() in that migration.

import { useEffect, useState } from 'react'
import { useStore } from './store'
import { supabase } from './supabase'

// Hard billing stops → read-only. 'past_due' is intentionally NOT here:
// a paying customer whose card just failed keeps a grace period (the
// banner nags them) rather than being locked out mid-work.
export const READ_ONLY_STATUSES = ['trial_expired', 'canceled']

export function isReadOnlyStatus(status) {
  return READ_ONLY_STATUSES.includes(status)
}

const READ_ONLY_REASON = {
  trial_expired: 'Your free trial has ended. Pick a plan to start editing again — your data is safe and still here.',
  canceled: 'Your subscription is canceled. Re-subscribe to start editing again — your data is safe and still here.',
}

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
    reason: readOnly ? (READ_ONLY_REASON[billingStatus] || 'This account is read-only.') : null,
  }
}
