// Compute metering — Phase 0 (shadow).
//
// `recordComputeUsage` logs what an AI action WOULD cost (real tokens →
// COGS → credits) into compute_ledger as a type='shadow' row. It never
// throws, never blocks, and never decrements a balance — so it's safe to
// drop into any AI edge function without changing behavior. Phases 1–3
// replace this with the enforcing `debit_compute` RPC.
//
// See COMPUTE_WALLET_PLAN.md.

import { COMPUTE, priceFor } from './computeConfig.ts'

// Anthropic Messages API usage block (fields we care about).
export interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Our COGS in USD for one Anthropic call, from its reported usage. */
export function costUsd(model: string, usage?: AnthropicUsage | null): number {
  const p = priceFor(model)
  const inTok    = usage?.input_tokens ?? 0
  const outTok   = usage?.output_tokens ?? 0
  const cacheRd  = usage?.cache_read_input_tokens ?? 0
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out + (cacheRd / 1e6) * p.cacheRead
}

/** Credits an action consumes (>= 1). */
export function creditsForCost(cost: number): number {
  return Math.max(1, Math.ceil(cost / COMPUTE.creditCostUsd))
}

interface RecordOpts {
  supabaseUrl?: string | null
  serviceKey?: string | null
  companyId: number | string | null | undefined
  userId?: string | null
  feature: string          // e.g. 'lenard_fixture_analyze'
  agentSlug?: string | null // e.g. 'lenard'; null for built-in AI
  model: string
  usage?: AnthropicUsage | null
}

/**
 * Phase 0 shadow log. Best-effort: swallows every error, returns nothing.
 * Caller does not need its own try/catch, but should pass real token usage
 * from the Anthropic response (`data.usage`).
 */
export async function recordComputeUsage(opts: RecordOpts): Promise<void> {
  try {
    const { supabaseUrl, serviceKey, companyId } = opts
    if (!supabaseUrl || !serviceKey || companyId == null) return

    const cost = costUsd(opts.model, opts.usage)
    const credits = creditsForCost(cost)

    await fetch(`${supabaseUrl}/rest/v1/compute_ledger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        company_id: Number(companyId),
        user_id: opts.userId ?? null,
        type: 'shadow',
        feature_slug: opts.feature,
        agent_slug: opts.agentSlug ?? null,
        model: opts.model,
        input_tokens: opts.usage?.input_tokens ?? 0,
        output_tokens: opts.usage?.output_tokens ?? 0,
        cache_read_tokens: opts.usage?.cache_read_input_tokens ?? 0,
        cost_usd: Number(cost.toFixed(5)),
        credits,
        bucket: null,
      }),
    })
  } catch (e) {
    console.warn('[compute] shadow log failed (non-fatal):', (e as Error)?.message)
  }
}
