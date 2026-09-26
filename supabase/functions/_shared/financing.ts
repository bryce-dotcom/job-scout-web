// Is consumer financing actually usable for this company?
//
// Two edge functions have to answer this identically:
//   get-portal-document   decides whether the customer sees an Apply button
//   create-checkout-session decides whether the application call goes through
//
// When they disagree the tenant gets one of two silent failures: a button that
// always errors, or no button at all on a company that is fully set up. The
// second is what shipped when the Wisetack key moved to a Supabase secret —
// create-checkout-session learned to fall back to the platform key, the portal
// gate kept demanding a per-tenant one, so leaving the key blank (which is now
// the documented setup) hid the button. One rule, imported by both.

export interface WisetackConfig {
  wisetack_enabled?: unknown
  wisetack_api_key?: unknown
  wisetack_merchant_id?: unknown
}

const text = (v: unknown) => String(v ?? '').trim()

/**
 * The key create-checkout-session will actually authenticate with: the
 * company's own if it has its own Wisetack contract, otherwise JobScout's
 * partner key from the WISETACK_API_KEY secret.
 */
export function wisetackKey(cfg: WisetackConfig | null | undefined): string {
  return text(cfg?.wisetack_api_key) || text(Deno.env.get('WISETACK_API_KEY'))
}

/**
 * The merchant ID is the per-tenant half and has NO platform fallback: it is
 * what tells Wisetack whose loan this is and where the payout goes. An env
 * default here would file one company's customer loan under another company's
 * merchant account, so a company without its own ID is simply not set up.
 */
export function wisetackMerchantId(cfg: WisetackConfig | null | undefined): string {
  return text(cfg?.wisetack_merchant_id)
}

/** Ready = switched on, a merchant ID of its own, and some key to call with. */
export function wisetackReady(cfg: WisetackConfig | null | undefined): boolean {
  if (!cfg?.wisetack_enabled) return false
  return !!wisetackMerchantId(cfg) && !!wisetackKey(cfg)
}
