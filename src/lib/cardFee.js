// Card-fee split — re-export shim.
//
// Implementation lives in supabase/functions/_shared/money.ts because the
// Stripe webhook is where a charge has to be split back into invoice amount
// and processing fee. Tested from here so the arithmetic that decides whether
// an invoice reads Paid or "Overpaid by" is pinned.
//
// Do not reimplement anything here.

export { cardFeeSplit } from '../../supabase/functions/_shared/money.ts'
