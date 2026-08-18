import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

/**
 * Is this company's GPS provider account connected?
 *
 * Replaces the old `companyAgent.settings.watchdog_auth_token` check that
 * every Freddy page did for itself. Two reasons it moved:
 *
 *   1. There's no token to check any more. Moto Watchdog stopped issuing
 *      per-customer partner tokens, so customers connect their own account
 *      instead and the credentials live in fleet_integrations.
 *   2. Credentials shouldn't round-trip through the browser at all. The old
 *      check worked because the token was sitting in a jsonb blob that the
 *      store loaded for every user. fleet_integration_status is a view with
 *      the secrets projected out.
 *
 * Returns `status` as well as `connected` so callers can tell "never set up"
 * from "set up but the sign-in stopped working" — those need different
 * messages, and collapsing them is why the old empty state told people to
 * go configure something they'd already configured.
 */
export function useGpsIntegration(provider = 'moto_watchdog') {
  const companyId = useStore(s => s.companyId)
  // `undefined` means "haven't looked yet", `null` means "looked, nothing
  // there". Keeping them distinct is what lets loading be derived instead of
  // tracked in its own state — a separate loading flag would need setting
  // synchronously in the effect, which cascades renders.
  const [integration, setIntegration] = useState(undefined)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    supabase
      .from('fleet_integration_status')
      .select('status, account_email, last_sync_at, last_error, last_sync_tier')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIntegration(data || null)
      })

    return () => { cancelled = true }
  }, [companyId, provider])

  const loading = Boolean(companyId) && integration === undefined
  const status = integration?.status ?? 'disconnected'

  return {
    integration: integration ?? null,
    loading,
    status,
    // `needsReauth` still counts as connected: the cached data is real and
    // worth showing, it's just going stale. Hiding the whole page because a
    // password expired would be worse than showing it with a warning.
    connected: status === 'connected' || status === 'needs_reauth',
    isHealthy: status === 'connected',
    needsReauth: status === 'needs_reauth',
    lastSyncAt: integration?.last_sync_at ?? null,
  }
}

export default useGpsIntegration
