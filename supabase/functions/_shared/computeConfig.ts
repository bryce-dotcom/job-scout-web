// Compute-wallet pricing config — canonical (edge side).
//
// One source of truth for the COGS→credit math. The customer-facing bits
// (tier/agent allowances, pack prices, per-feature display credits) are
// mirrored into src/lib/billingPlans.js for the UI — keep the two in sync,
// same as scripts/setup-stripe-products.cjs mirrors the plan list.
//
// See COMPUTE_WALLET_PLAN.md.

export const COMPUTE = {
  // 1 credit = this much underlying COGS (a Light action ≈ 1 credit).
  creditCostUsd: 0.02,
  // Customer pays this multiple of cost on overage (200% markup = 3x; 300% = 4x).
  markup: 3.5,

  // Monthly included allowance, in credits.
  tierIncludedCredits: { field_crew: 250, field_pro: 750, field_boss: 2000 },
  agentIncludedCredits: 350, // per active agent

  // "Buy more compute" packs (sold at the markup).
  packs: [
    { id: 'small',  price: 10,  credits: 140 },
    { id: 'medium', price: 25,  credits: 350 },
    { id: 'large',  price: 50,  credits: 700 },
    { id: 'bulk',   price: 100, credits: 1600 },
  ],

  capDefault: 'grant' as 'grant' | 'auto_refill' | 'uncapped',
  alertThresholds: [0.5, 0.8, 1.0],
}

// $/MTok by model family. Resolved by substring so dated aliases
// (claude-sonnet-4-20250514, -4-5-..., -4-6) all map correctly.
export function priceFor(model: string): { in: number; out: number; cacheRead: number } {
  const m = (model || '').toLowerCase()
  if (m.includes('opus'))  return { in: 5, out: 25, cacheRead: 0.5 }
  if (m.includes('haiku')) return { in: 1, out: 5,  cacheRead: 0.1 }
  return { in: 3, out: 15, cacheRead: 0.3 } // sonnet (default)
}
